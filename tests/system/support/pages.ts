// Every HTML route in the app, for checks that must hold on all pages (e.g. AC16 headers).
// Add each new page here in the task that creates it.
export const PUBLIC_PAGES = [
  '/',
  '/signup',
  '/signup/check-email',
  '/auth/confirm?token_hash=not-a-real-token',
  '/auth/invalid-link',
  '/login',
  '/logout',
  '/me', // redirects anonymous visitors to /login; both responses are checked
] as const;

// A route that does not exist: the 404 page is HTML too and must carry the same headers.
export const NOT_FOUND_PAGE = '/this-page-does-not-exist';
