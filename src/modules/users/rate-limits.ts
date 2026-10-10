import type { RateLimitPolicy } from '@/lib/rate-limit/policy';

// Spec 0001, AC9 and spec 0002, AC7: code-reviewed constants (ADR-0005), not config.

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

export const LOG_IN_LIMIT: RateLimitPolicy = {
  action: 'login',
  dimensions: ['ip', 'email'],
  limit: 5,
  windowSeconds: 15 * 60,
};

/** Re-authentication before deletion: per IP and per (server-verified) user ID. */
export const DELETE_ACCOUNT_LIMIT: RateLimitPolicy = {
  action: 'delete_account',
  dimensions: ['ip', 'user'],
  limit: 5,
  windowSeconds: 15 * 60,
};
