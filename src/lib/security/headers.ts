import { randomBytes } from 'node:crypto';

// Security headers for every HTML response (spec 0001, AC16). Applied per request by src/proxy.ts,
// because the CSP carries a fresh nonce each time. Do not loosen these to make something work.

export type SecurityHeaderOptions = {
  nonce: string;
  /** `next dev` only: eval for React dev tooling, inline styles for the dev overlay, plain http. */
  isDev: boolean;
};

const NONCE = /^[A-Za-z0-9+/]+={0,2}$/;

const PERMISSIONS_POLICY = [
  'camera',
  'microphone',
  'geolocation',
  'payment',
  'usb',
  'browsing-topics',
]
  .map((feature) => `${feature}=()`)
  .join(', ');

/** 128 random bits, base64. */
export function generateNonce(): string {
  return randomBytes(16).toString('base64');
}

export function securityHeaders({ nonce, isDev }: SecurityHeaderOptions) {
  // The nonce is interpolated into a header; refuse anything that could add a directive.
  if (!NONCE.test(nonce)) throw new Error('Invalid CSP nonce');

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    // Dev only: the Next.js dev overlay applies inline styles. No nonce there, because browsers
    // ignore 'unsafe-inline' when a nonce is present. Production stays nonce-only.
    isDev ? "style-src 'self' 'unsafe-inline'" : `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ['upgrade-insecure-requests']),
  ].join('; ');

  return {
    'Content-Security-Policy': csp,
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': PERMISSIONS_POLICY,
    'Cross-Origin-Opener-Policy': 'same-origin',
  } as const;
}
