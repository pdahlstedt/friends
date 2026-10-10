import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseEnv } from './env';

const valid = {
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_ANON_KEY: 'anon-key-placeholder',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-placeholder',
  RATE_LIMIT_KEY_SECRET: 'x'.repeat(32),
};

describe('parseEnv', () => {
  it('accepts a complete environment and leaves TRUSTED_IP_HEADER unset when absent', () => {
    expect(parseEnv(valid)).toEqual({
      supabaseUrl: 'http://127.0.0.1:54321',
      supabaseAnonKey: 'anon-key-placeholder',
      supabaseServiceRoleKey: 'service-role-key-placeholder',
      rateLimitKeySecret: 'x'.repeat(32),
      trustedIpHeader: undefined,
    });
  });

  it('lower-cases TRUSTED_IP_HEADER so header lookups are case-insensitive', () => {
    expect(parseEnv({ ...valid, TRUSTED_IP_HEADER: 'CF-Connecting-IP' }).trustedIpHeader).toBe(
      'cf-connecting-ip',
    );
  });

  it('treats an empty TRUSTED_IP_HEADER as unset', () => {
    expect(parseEnv({ ...valid, TRUSTED_IP_HEADER: '' }).trustedIpHeader).toBeUndefined();
  });

  it.each(['X Forwarded', 'x-forwarded-for:', 'ip\n'])(
    'rejects TRUSTED_IP_HEADER that is not a header name: %j',
    (value) => {
      expect(() => parseEnv({ ...valid, TRUSTED_IP_HEADER: value })).toThrow(/TRUSTED_IP_HEADER/);
    },
  );

  it.each([
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'RATE_LIMIT_KEY_SECRET',
  ] as const)('rejects a missing %s', (name) => {
    const source: Record<string, string> = { ...valid };
    delete source[name];
    expect(() => parseEnv(source)).toThrow(name);
  });

  it.each(['not a url', 'ftp://example.com'])('rejects SUPABASE_URL %j', (value) => {
    expect(() => parseEnv({ ...valid, SUPABASE_URL: value })).toThrow(/SUPABASE_URL/);
  });

  it('rejects a RATE_LIMIT_KEY_SECRET shorter than 32 characters', () => {
    expect(() => parseEnv({ ...valid, RATE_LIMIT_KEY_SECRET: 'x'.repeat(31) })).toThrow(
      /RATE_LIMIT_KEY_SECRET/,
    );
  });

  it('lists every invalid variable but never echoes a value', () => {
    const secret = 'short-secret-value';
    let message = '';
    try {
      parseEnv({ ...valid, SUPABASE_URL: 'nope', RATE_LIMIT_KEY_SECRET: secret });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('SUPABASE_URL');
    expect(message).toContain('RATE_LIMIT_KEY_SECRET');
    expect(message).not.toContain(secret);
    expect(message).not.toContain('nope');
  });
});

describe('env', () => {
  // Fresh module per test, so the cache starts empty.
  async function loadEnv() {
    vi.resetModules();
    return (await import('./env')).env;
  }

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reads process.env once and caches the result', async () => {
    for (const [name, value] of Object.entries(valid)) vi.stubEnv(name, value);
    const env = await loadEnv();
    const first = env();
    vi.stubEnv('SUPABASE_URL', 'http://changed.example');
    expect(env()).toBe(first);
    expect(first.supabaseUrl).toBe(valid.SUPABASE_URL);
  });

  it('throws when process.env is invalid', async () => {
    vi.stubEnv('SUPABASE_URL', '');
    const env = await loadEnv();
    expect(() => env()).toThrow(/SUPABASE_URL/);
  });
});
