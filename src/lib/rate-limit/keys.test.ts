import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { normalizeEmail, rateLimitKey } from './keys';

const secret = 's'.repeat(32);

describe('normalizeEmail', () => {
  it('trims and lower-cases', () => {
    expect(normalizeEmail('  Someone.Else@Example.COM \n')).toBe('someone.else@example.com');
  });

  it('keeps the local part otherwise intact (no dot or plus stripping)', () => {
    expect(normalizeEmail('a.b+tag@example.com')).toBe('a.b+tag@example.com');
  });
});

describe('rateLimitKey', () => {
  it('is HMAC-SHA256 of "action:dimension:value", hex encoded', () => {
    const expected = createHmac('sha256', secret).update('login:email:a@example.com').digest('hex');
    expect(rateLimitKey(secret, 'login', 'email', 'a@example.com')).toBe(expected);
  });

  it('never contains the raw value', () => {
    const key = rateLimitKey(secret, 'login', 'email', 'someone@example.com');
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).not.toContain('someone');
  });

  it('separates actions, dimensions, values and secrets', () => {
    const base = rateLimitKey(secret, 'login', 'ip', '203.0.113.7');
    expect(rateLimitKey(secret, 'signup', 'ip', '203.0.113.7')).not.toBe(base);
    expect(rateLimitKey(secret, 'login', 'email', '203.0.113.7')).not.toBe(base);
    expect(rateLimitKey(secret, 'login', 'ip', '203.0.113.8')).not.toBe(base);
    expect(rateLimitKey('t'.repeat(32), 'login', 'ip', '203.0.113.7')).not.toBe(base);
  });

  it('accepts values containing colons (IPv6)', () => {
    expect(rateLimitKey(secret, 'login', 'ip', '2001:db8::1')).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each([
    ['action with a colon', 'log:in', 'ip'],
    ['empty action', '', 'ip'],
    ['upper-case dimension', 'login', 'IP'],
    ['dimension with a colon', 'login', 'ip:x'],
  ])('rejects an %s', (_name, action, dimension) => {
    expect(() => rateLimitKey(secret, action, dimension, 'v')).toThrow(
      'Invalid rate-limit action or dimension',
    );
  });
});
