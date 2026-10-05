// Session cookies (spec 0001, AC17). The adapter talks to the request's cookies through a
// CookieJar, so it runs in plain Node; the composition root binds it to Next.js cookies.

export type CookieOptions = {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: boolean | 'lax' | 'strict' | 'none';
  path?: string;
  domain?: string;
  maxAge?: number;
  expires?: Date;
  [option: string]: unknown;
};

export type CookieToSet = { name: string; value: string; options: CookieOptions };

export interface CookieJar {
  getAll(): { name: string; value: string }[];
  /**
   * `headers` must go on the same response (no-store cache headers), so a CDN never serves
   * one user's session cookies to another.
   */
  setAll(cookies: CookieToSet[], headers: Record<string, string>): void;
}

/** Response headers that every auth-cookie write must carry. */
export const NO_STORE_HEADERS: Readonly<Record<string, string>> = {
  'Cache-Control': 'private, no-cache, no-store, must-revalidate, max-age=0',
  Expires: '0',
  Pragma: 'no-cache',
};

/**
 * HttpOnly (no browser JavaScript needs the session — ADR-0004), SameSite=Lax, path /, no
 * Domain (host-only), Secure when configured. Lifetime fields are kept so deletion works.
 */
export function hardenCookieOptions(
  options: CookieOptions,
  { secure }: { secure: boolean },
): CookieOptions {
  const hardened: CookieOptions = {
    ...options,
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure,
  };
  delete hardened.domain;
  return hardened;
}
