import { NextResponse, type NextRequest } from 'next/server';
import type { CookieToSet } from '@/lib/adapters/auth/cookies';
import { createSupabaseAuth } from '@/lib/adapters/auth/real/supabase';
import { env } from '@/lib/env';
import { generateNonce, securityHeaders } from '@/lib/security/headers';

// Runs before every page (spec 0001 plan, "Proxy"). Wiring only; covered by the system tests.
// 1. Refreshes an expiring Supabase session. Server Components can't set cookies, so without
//    this an expired access token could never be renewed during a page render.
// 2. Sets per-request security headers (AC16). Next.js reads the nonce from the request's CSP
//    header and applies it to its own scripts, so the CSP is set on the request and response.

type ResponseCookieInit = Extract<Parameters<NextResponse['cookies']['set']>[0], object>;

const hasSessionCookie = (request: NextRequest) =>
  request.cookies.getAll().some(({ name }) => name.startsWith('sb-'));

export async function proxy(request: NextRequest) {
  const refreshed: CookieToSet[] = [];
  const cacheHeaders: Record<string, string> = {};

  if (hasSessionCookie(request)) {
    const config = env();
    const { auth } = createSupabaseAuth({
      url: config.supabaseUrl,
      anonKey: config.supabaseAnonKey,
      secureCookies: process.env.NODE_ENV === 'production',
      serviceClient: null, // session refresh only: no service role here
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet, headers) => {
          // Into the request, so this render sees the new tokens; into the response below.
          for (const { name, value } of toSet) request.cookies.set(name, value);
          refreshed.push(...toSet);
          Object.assign(cacheHeaders, headers);
        },
      },
    });
    try {
      await auth.getUser(); // refreshes the session if its access token has expired
    } catch {
      // Auth server unreachable: render anyway; pages verify the user themselves and fail closed.
    }
  }

  const headers = securityHeaders({
    nonce: generateNonce(),
    isDev: process.env.NODE_ENV === 'development',
  });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('Content-Security-Policy', headers['Content-Security-Policy']);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  for (const { name, value, options } of refreshed) {
    response.cookies.set({ ...options, name, value } as ResponseCookieInit);
  }
  for (const [name, value] of Object.entries({ ...cacheHeaders, ...headers })) {
    response.headers.set(name, value);
  }
  return response;
}

export const config = {
  matcher: [
    {
      // Everything except static build assets, which carry no HTML.
      source: '/((?!_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
