import { createHmac } from 'node:crypto';

// Rate-limit bucket keys (ADR-0005): HMAC-SHA256(secret, "<action>:<dimension>:<value>").
// Only the digest reaches the database; raw emails, IPs and user IDs are never stored.

const NAME = /^[a-z][a-z0-9_]*$/;

/** Trimmed and lower-cased, so case or whitespace variants share one bucket. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function rateLimitKey(
  secret: string,
  action: string,
  dimension: string,
  value: string,
): string {
  // Names must not contain ':' so the prefix is unambiguous (values may: IPv6).
  if (!NAME.test(action) || !NAME.test(dimension)) {
    throw new Error('Invalid rate-limit action or dimension');
  }
  return createHmac('sha256', secret).update(`${action}:${dimension}:${value}`).digest('hex');
}
