import { describe, expect, it } from 'vitest';
import { emailSchema, passwordSchema, resendInputSchema, signUpInputSchema } from './schemas';

describe('emailSchema', () => {
  it('trims and lower-cases a valid email', () => {
    expect(emailSchema.parse('  Someone@Example.COM ')).toBe('someone@example.com');
  });

  it.each(['', 'not-an-email', 'a@', '@example.com', 'a b@example.com', 42, null])(
    'rejects %j',
    (value) => {
      expect(emailSchema.safeParse(value).success).toBe(false);
    },
  );

  it('rejects addresses longer than 254 characters', () => {
    const long = `${'a'.repeat(64)}@${'b'.repeat(186)}.com`; // 255
    expect(emailSchema.safeParse(long).success).toBe(false);
    expect(emailSchema.safeParse(long.slice(1)).success).toBe(true);
  });
});

describe('passwordSchema', () => {
  const ok = (value: string) => passwordSchema.safeParse(value).success;

  it('[0001-AC3] needs at least 12 characters', () => {
    expect(ok('a'.repeat(11))).toBe(false);
    expect(ok('a'.repeat(12))).toBe(true);
  });

  it('[0001-AC3] allows at most 72 UTF-8 bytes (bcrypt limit)', () => {
    expect(ok('a'.repeat(72))).toBe(true);
    expect(ok('a'.repeat(73))).toBe(false);
    expect(ok('é'.repeat(36))).toBe(true); // 72 bytes
    expect(ok('é'.repeat(37))).toBe(false); // 74 bytes, 37 characters
  });

  it('counts characters, not bytes, for the minimum (matches Supabase)', () => {
    expect(ok('é'.repeat(6))).toBe(false); // 12 bytes but only 6 characters
    expect(ok('🔒'.repeat(12))).toBe(true); // 12 characters, 48 bytes
  });

  it('does not trim (spaces are part of the password)', () => {
    expect(passwordSchema.parse('  twelve chars  ')).toBe('  twelve chars  ');
  });

  it('rejects non-strings', () => {
    expect(ok(123456789012 as unknown as string)).toBe(false);
  });
});

describe('input schemas', () => {
  it('parse a valid sign-up', () => {
    expect(signUpInputSchema.parse({ email: 'A@example.com', password: 'twelve chars' })).toEqual({
      email: 'a@example.com',
      password: 'twelve chars',
    });
  });

  it('[0001-AC14] reject unknown keys such as userId', () => {
    const withId = { email: 'a@example.com', password: 'twelve chars', userId: 'x' };
    expect(signUpInputSchema.safeParse(withId).success).toBe(false);
    expect(resendInputSchema.safeParse({ email: 'a@example.com', userId: 'x' }).success).toBe(
      false,
    );
  });

  it('parse a valid resend', () => {
    expect(resendInputSchema.parse({ email: 'a@example.com' })).toEqual({
      email: 'a@example.com',
    });
  });
});
