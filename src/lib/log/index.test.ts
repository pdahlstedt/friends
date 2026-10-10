import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger, log } from './index';

const fixedNow = () => new Date('2026-10-04T12:00:00.000Z');

function capture() {
  const lines: { level: string; line: string }[] = [];
  const logger = createLogger((level, line) => lines.push({ level, line }), fixedNow);
  const parsed = () => lines.map((l) => JSON.parse(l.line) as Record<string, unknown>);
  return { logger, lines, parsed };
}

describe('createLogger', () => {
  it('writes one JSON line with timestamp, level and allowlisted fields', () => {
    const { logger, lines, parsed } = capture();
    logger.info({
      event: 'auth.login',
      outcome: 'ok',
      action: 'login',
      durationMs: 42,
      errorCode: 'none',
      requestId: 'req-1',
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]!.line).not.toContain('\n');
    expect(parsed()[0]).toEqual({
      ts: '2026-10-04T12:00:00.000Z',
      level: 'info',
      event: 'auth.login',
      outcome: 'ok',
      action: 'login',
      durationMs: 42,
      errorCode: 'none',
      requestId: 'req-1',
    });
  });

  it.each(['info', 'warn', 'error'] as const)('passes level %s to the sink', (level) => {
    const { logger, lines, parsed } = capture();
    logger[level]({ event: 'e' });
    expect(lines[0]!.level).toBe(level);
    expect(parsed()[0]!.level).toBe(level);
  });

  it('drops keys that are not allowlisted, including ts and level overrides', () => {
    const { logger, parsed } = capture();
    const fields = {
      event: 'auth.signup',
      email: 'someone@example.com',
      password: 'hunter2hunter2',
      userId: 'abc',
      ts: 'forged',
      level: 'forged',
    };
    logger.info(fields as unknown as Parameters<typeof logger.info>[0]);
    expect(parsed()[0]).toEqual({
      ts: '2026-10-04T12:00:00.000Z',
      level: 'info',
      event: 'auth.signup',
    });
  });

  it('drops allowlisted keys whose value is not a string, finite number or boolean', () => {
    const { logger, parsed } = capture();
    const fields = {
      event: 'e',
      outcome: { nested: 'someone@example.com' },
      action: ['x'],
      durationMs: Number.NaN,
      errorCode: null,
      requestId: undefined,
    };
    logger.info(fields as unknown as Parameters<typeof logger.info>[0]);
    expect(parsed()[0]).toEqual({ ts: '2026-10-04T12:00:00.000Z', level: 'info', event: 'e' });
  });

  it('keeps boolean values', () => {
    const { logger, parsed } = capture();
    logger.info({ event: 'e', outcome: true });
    expect(parsed()[0]!.outcome).toBe(true);
  });

  it('redacts email addresses inside allowlisted string values', () => {
    const { logger, lines } = capture();
    logger.warn({ event: 'e', errorCode: 'user Someone.Else+tag@sub.example.co failed' });
    expect(lines[0]!.line).not.toMatch(/@/);
    expect(JSON.parse(lines[0]!.line).errorCode).toBe('user [redacted] failed');
  });

  it('redacts emails without a dot in the domain', () => {
    const { logger, lines } = capture();
    logger.info({ event: 'e', outcome: 'admin@localhost' });
    expect(JSON.parse(lines[0]!.line).outcome).toBe('[redacted]');
  });

  it('redacts JWTs inside allowlisted string values', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
    const { logger, lines } = capture();
    logger.error({ event: 'e', requestId: `Bearer ${jwt}` });
    expect(lines[0]!.line).not.toContain('eyJ');
    expect(JSON.parse(lines[0]!.line).requestId).toBe('Bearer [redacted]');
  });

  it('redacts unsigned JWTs (empty signature)', () => {
    const { logger, lines } = capture();
    logger.info({ event: 'e', errorCode: 'eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.' });
    expect(JSON.parse(lines[0]!.line).errorCode).toBe('[redacted]');
  });

  it('redacts the event field too', () => {
    const { logger, lines } = capture();
    logger.info({ event: 'someone@example.com' });
    expect(JSON.parse(lines[0]!.line).event).toBe('[redacted]');
  });

  it('escapes newlines so one call is always one line', () => {
    const { logger, lines } = capture();
    logger.info({ event: 'e', errorCode: 'a\n{"level":"error"}' });
    expect(lines[0]!.line.split('\n')).toHaveLength(1);
  });
});

describe('default logger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes info and warn to stdout and error to stderr', () => {
    const out = vi.spyOn(console, 'log').mockImplementation(() => {});
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    log.info({ event: 'a' });
    log.warn({ event: 'b' });
    log.error({ event: 'c' });
    expect(out.mock.calls.map(([line]) => JSON.parse(line as string).event)).toEqual(['a', 'b']);
    expect(err.mock.calls.map(([line]) => JSON.parse(line as string).event)).toEqual(['c']);
    expect(Number.isNaN(Date.parse(JSON.parse(out.mock.calls[0]![0] as string).ts))).toBe(false);
  });
});
