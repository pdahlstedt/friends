import { isIP } from 'node:net';

// Client IP for rate limiting (ADR-0005). Read only from the one configured trusted header
// (CF-Connecting-IP in production), never from arbitrary forwarding headers.

/** Shared bucket for requests without a usable IP. Fails closed: they all share one limit. */
export const UNKNOWN_CLIENT_IP = 'unknown';

type HeaderSource = { get(name: string): string | null };

export function clientIp(headers: HeaderSource, trustedHeader: string | undefined): string {
  if (!trustedHeader) return UNKNOWN_CLIENT_IP;
  const value = headers.get(trustedHeader)?.trim();
  // Exactly one bare IPv4/IPv6 address; lists, ports and anything else are rejected.
  if (!value || isIP(value) === 0) return UNKNOWN_CLIENT_IP;
  return value.toLowerCase();
}
