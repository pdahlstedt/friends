import { describe, expect, it } from 'vitest';
import { UNKNOWN_CLIENT_IP, clientIp } from './client-ip';

const headers = (entries: Record<string, string>) => new Headers(entries);

describe('clientIp', () => {
  it('reads the configured trusted header', () => {
    expect(clientIp(headers({ 'cf-connecting-ip': '203.0.113.7' }), 'cf-connecting-ip')).toBe(
      '203.0.113.7',
    );
  });

  it('trims whitespace and lower-cases IPv6', () => {
    expect(clientIp(headers({ 'x-real-ip': '  2001:DB8::1 ' }), 'x-real-ip')).toBe('2001:db8::1');
  });

  it('ignores every other header, including X-Forwarded-For, when another header is trusted', () => {
    const h = headers({ 'x-forwarded-for': '198.51.100.1', 'x-real-ip': '198.51.100.2' });
    expect(clientIp(h, 'cf-connecting-ip')).toBe(UNKNOWN_CLIENT_IP);
  });

  it('falls back to the shared unknown bucket when no header is configured', () => {
    expect(clientIp(headers({ 'x-forwarded-for': '198.51.100.1' }), undefined)).toBe('unknown');
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['a list', '198.51.100.1, 10.0.0.1'],
    ['with a port', '198.51.100.1:443'],
    ['bracketed IPv6', '[2001:db8::1]'],
    ['not an IP', 'evil.example.com'],
    ['a forged key', 'login:email:victim@example.com'],
  ])('fails closed to the unknown bucket for a value that is %s', (_name, value) => {
    const h = value === undefined ? headers({}) : headers({ 'cf-connecting-ip': value });
    expect(clientIp(h, 'cf-connecting-ip')).toBe(UNKNOWN_CLIENT_IP);
  });
});
