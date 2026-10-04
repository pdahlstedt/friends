import { NextResponse, type NextRequest } from 'next/server';
import { generateNonce, securityHeaders } from '@/lib/security/headers';

// Per-request security headers (spec 0001, AC16). Next.js reads the nonce from the request's
// CSP header and applies it to its own scripts, so the CSP is set on the request and response.
// Session refresh is added here with the AuthProvider adapter (0001-T12).
export function proxy(request: NextRequest) {
  const headers = securityHeaders({
    nonce: generateNonce(),
    isDev: process.env.NODE_ENV === 'development',
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('Content-Security-Policy', headers['Content-Security-Policy']);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
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
