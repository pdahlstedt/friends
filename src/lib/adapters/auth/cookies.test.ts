import { describe, expect, it } from 'vitest';
import { hardenCookieOptions } from './cookies';

describe('hardenCookieOptions', () => {
  it('[0001-AC17] forces HttpOnly, SameSite=Lax and path / over whatever the library asked for', () => {
    expect(
      hardenCookieOptions({ httpOnly: false, sameSite: 'none', path: '/api' }, { secure: true }),
    ).toEqual({ httpOnly: true, sameSite: 'lax', path: '/', secure: true });
  });

  it('[0001-AC17] scopes cookies to the app host by dropping any Domain', () => {
    const options = hardenCookieOptions({ domain: 'example.com' }, { secure: true });
    expect(options).not.toHaveProperty('domain');
  });

  it('sets Secure only when configured (plain-http local dev)', () => {
    expect(hardenCookieOptions({ secure: true }, { secure: false }).secure).toBe(false);
    expect(hardenCookieOptions({}, { secure: true }).secure).toBe(true);
  });

  it('keeps lifetime fields, so cookie deletion (maxAge 0) still works', () => {
    const expires = new Date('2026-10-05T00:00:00Z');
    expect(hardenCookieOptions({ maxAge: 0, expires }, { secure: false })).toMatchObject({
      maxAge: 0,
      expires,
    });
  });

  it('does not mutate its input', () => {
    const input = { httpOnly: false, domain: 'example.com' };
    hardenCookieOptions(input, { secure: true });
    expect(input).toEqual({ httpOnly: false, domain: 'example.com' });
  });
});
