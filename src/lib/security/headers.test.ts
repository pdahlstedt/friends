import { describe, expect, it } from 'vitest';
import { generateNonce, securityHeaders } from './headers';

function directives(csp: string): Map<string, string[]> {
  return new Map(
    csp
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [name, ...values] = part.split(/\s+/);
        return [name!, values];
      }),
  );
}

const nonce = 'bm9uY2UtdmFsdWUtMTIzNA==';

describe('securityHeaders (production)', () => {
  const headers = securityHeaders({ nonce, isDev: false });
  const csp = directives(headers['Content-Security-Policy']);

  it('allows scripts only by nonce, with strict-dynamic and no unsafe-*', () => {
    expect(csp.get('script-src')).toEqual(["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"]);
    expect(headers['Content-Security-Policy']).not.toMatch(/unsafe-/);
  });

  it('allows styles only from self or by nonce', () => {
    expect(csp.get('style-src')).toEqual(["'self'", `'nonce-${nonce}'`]);
  });

  it('locks down every other source and forbids framing', () => {
    expect(csp.get('default-src')).toEqual(["'self'"]);
    expect(csp.get('connect-src')).toEqual(["'self'"]);
    expect(csp.get('img-src')).toEqual(["'self'", 'blob:', 'data:']);
    expect(csp.get('font-src')).toEqual(["'self'"]);
    expect(csp.get('object-src')).toEqual(["'none'"]);
    expect(csp.get('base-uri')).toEqual(["'self'"]);
    expect(csp.get('form-action')).toEqual(["'self'"]);
    expect(csp.get('frame-ancestors')).toEqual(["'none'"]);
    expect(csp.has('upgrade-insecure-requests')).toBe(true);
  });

  it('sets the non-CSP security headers', () => {
    expect(headers).toMatchObject({
      'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Cross-Origin-Opener-Policy': 'same-origin',
    });
  });

  it('denies powerful browser features in Permissions-Policy', () => {
    const policy = headers['Permissions-Policy'];
    for (const feature of [
      'camera',
      'microphone',
      'geolocation',
      'payment',
      'usb',
      'browsing-topics',
    ]) {
      expect(policy).toContain(`${feature}=()`);
    }
    expect(policy).not.toMatch(/=\((?!\))/); // every feature has an empty allowlist
  });

  it('is a single-line header value', () => {
    expect(headers['Content-Security-Policy']).not.toMatch(/[\r\n]/);
  });
});

describe('securityHeaders (development)', () => {
  const headers = securityHeaders({ nonce, isDev: true });
  const csp = directives(headers['Content-Security-Policy']);

  it("adds 'unsafe-eval' for React dev tooling and nothing else", () => {
    expect(csp.get('script-src')).toEqual([
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      "'unsafe-eval'",
    ]);
    expect(headers['Content-Security-Policy']).not.toContain('unsafe-inline');
  });

  it('does not upgrade requests on the plain-http dev server', () => {
    expect(csp.has('upgrade-insecure-requests')).toBe(false);
  });
});

describe('securityHeaders input validation', () => {
  it.each(['', "abc'; script-src *", 'a b', 'abc;'])('rejects nonce %j', (bad) => {
    expect(() => securityHeaders({ nonce: bad, isDev: false })).toThrow('Invalid CSP nonce');
  });
});

describe('generateNonce', () => {
  it('returns 128 bits of base64', () => {
    const value = generateNonce();
    expect(value).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(Buffer.from(value, 'base64')).toHaveLength(16);
  });

  it('is unique per call', () => {
    const values = new Set(Array.from({ length: 100 }, generateNonce));
    expect(values.size).toBe(100);
  });

  it('is always accepted by securityHeaders', () => {
    expect(() => securityHeaders({ nonce: generateNonce(), isDev: false })).not.toThrow();
  });
});
