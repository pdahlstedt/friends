import { describe, expect, it } from 'vitest';
import { AuthProviderError } from './auth-provider';
import {
  getUserOutcome,
  resendOutcome,
  signInOutcome,
  signOutOutcome,
  signUpOutcome,
  verifyOutcome,
} from './errors';

const err = (status: number | undefined, code?: string) => ({ status, code });
const ipRateLimit = err(429, 'over_request_rate_limit');
const emailSendLimit = err(429, 'over_email_send_rate_limit');

function expectUnavailable(fn: () => unknown) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(AuthProviderError);
    expect((error as AuthProviderError).code).toBe('unavailable');
    return;
  }
  throw new Error('expected AuthProviderError');
}

describe('signUpOutcome', () => {
  it('maps success to ok', () => {
    expect(signUpOutcome(null)).toBe('ok');
  });

  it.each([
    ['confirmed account exists', err(422, 'user_already_exists')],
    ['email exists', err(422, 'email_exists')],
    ['per-account email resend window (only happens for existing accounts)', emailSendLimit],
  ])('[0001-AC4] hides account-specific errors as ok: %s', (_name, error) => {
    expect(signUpOutcome(error)).toBe('ok');
  });

  it('maps per-IP rate limits to rate_limited', () => {
    expect(signUpOutcome(ipRateLimit)).toBe('rate_limited');
    expect(signUpOutcome(err(429))).toBe('rate_limited');
  });

  it('throws unavailable for anything else', () => {
    expectUnavailable(() => signUpOutcome(err(500, 'unexpected_failure')));
    expectUnavailable(() => signUpOutcome(err(400, 'weak_password')));
    expectUnavailable(() => signUpOutcome(err(undefined)));
  });
});

describe('resendOutcome', () => {
  it('[0001-AC4] maps success and the per-account email window to ok', () => {
    expect(resendOutcome(null)).toBe('ok');
    expect(resendOutcome(emailSendLimit)).toBe('ok');
  });

  it('maps per-IP rate limits to rate_limited', () => {
    expect(resendOutcome(ipRateLimit)).toBe('rate_limited');
  });

  it('throws unavailable for anything else', () => {
    expectUnavailable(() => resendOutcome(err(503)));
  });
});

describe('verifyOutcome', () => {
  it('maps success to ok', () => {
    expect(verifyOutcome(null)).toEqual({ ok: true });
  });

  it.each([
    ['expired or used', err(403, 'otp_expired')],
    ['malformed', err(400, 'validation_failed')],
    ['not found', err(404)],
  ])('[0001-AC5] maps a bad token (%s) to invalid', (_name, error) => {
    expect(verifyOutcome(error)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('maps rate limits to rate_limited', () => {
    expect(verifyOutcome(ipRateLimit)).toEqual({ ok: false, reason: 'rate_limited' });
  });

  it('throws unavailable for server errors', () => {
    expectUnavailable(() => verifyOutcome(err(502)));
    expectUnavailable(() => verifyOutcome(err(undefined)));
  });
});

describe('signInOutcome', () => {
  it('maps success to ok', () => {
    expect(signInOutcome(null)).toEqual({ ok: true });
  });

  it('[0001-AC7] maps wrong password and unknown email to invalid_credentials', () => {
    expect(signInOutcome(err(400, 'invalid_credentials'))).toEqual({
      ok: false,
      reason: 'invalid_credentials',
    });
  });

  it('[0001-AC8] maps an unconfirmed account to email_not_confirmed', () => {
    expect(signInOutcome(err(400, 'email_not_confirmed'))).toEqual({
      ok: false,
      reason: 'email_not_confirmed',
    });
  });

  it('maps rate limits to rate_limited', () => {
    expect(signInOutcome(ipRateLimit)).toEqual({ ok: false, reason: 'rate_limited' });
  });

  it('throws unavailable for anything else', () => {
    expectUnavailable(() => signInOutcome(err(500)));
  });
});

describe('getUserOutcome', () => {
  it('is signed in only without an error', () => {
    expect(getUserOutcome(null)).toBe('signed_in');
  });

  it.each([
    ['no session', { status: 400, name: 'AuthSessionMissingError' }],
    ['revoked session', err(403, 'session_not_found')],
    ['bad JWT', err(401, 'bad_jwt')],
    ['deleted user', err(404, 'user_not_found')],
  ])('treats %s as signed out', (_name, error) => {
    expect(getUserOutcome(error)).toBe('signed_out');
  });

  it('throws unavailable when the auth server cannot answer', () => {
    expectUnavailable(() => getUserOutcome(err(500)));
    expectUnavailable(() => getUserOutcome(err(undefined)));
  });
});

describe('signOutOutcome', () => {
  it('accepts success and an already-gone session', () => {
    expect(() => signOutOutcome(null)).not.toThrow();
    expect(() => signOutOutcome(err(403, 'session_not_found'))).not.toThrow();
    expect(() => signOutOutcome(err(401))).not.toThrow();
  });

  it('throws unavailable when revocation fails', () => {
    expectUnavailable(() => signOutOutcome(err(500)));
  });
});
