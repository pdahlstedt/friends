import type { RateLimitPolicy } from '@/lib/rate-limit/policy';

// Spec 0001, AC9: limits per IP and per email. Code-reviewed constants (ADR-0005), not config.

export const SIGN_UP_LIMIT: RateLimitPolicy = {
  action: 'signup',
  dimensions: ['ip', 'email'],
  limit: 3,
  windowSeconds: 60 * 60,
};

export const RESEND_LIMIT: RateLimitPolicy = {
  action: 'resend',
  dimensions: ['ip', 'email'],
  limit: 3,
  windowSeconds: 60 * 60,
};
