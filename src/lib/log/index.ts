// Structured logger (spec 0001, AC20). Only allowlisted keys are written; everything else is
// dropped. String values that look like emails or JWTs are redacted as a second line of defence.
// Never log vendor error messages — log an `errorCode` instead.

export type LogFields = {
  event: string;
  outcome?: string | boolean;
  action?: string;
  durationMs?: number;
  errorCode?: string;
  requestId?: string;
};

export type LogLevel = 'info' | 'warn' | 'error';

export type Logger = Record<LogLevel, (fields: LogFields) => void>;

export type LogSink = (level: LogLevel, line: string) => void;

const ALLOWED_KEYS = [
  'event',
  'outcome',
  'action',
  'durationMs',
  'errorCode',
  'requestId',
] as const satisfies readonly (keyof LogFields)[];

const REDACTED = '[redacted]';
const EMAIL = /[^\s@"'<>()[\],;:]+@[^\s@"'<>()[\],;:]+/g;
const JWT = /eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g;

function redact(value: string): string {
  return value.replace(JWT, REDACTED).replace(EMAIL, REDACTED);
}

function clean(fields: LogFields): Record<string, string | number | boolean> {
  const source = fields as Record<string, unknown>;
  const out: Record<string, string | number | boolean> = {};
  for (const key of ALLOWED_KEYS) {
    const value = source[key];
    if (typeof value === 'string') out[key] = redact(value);
    else if (typeof value === 'boolean') out[key] = value;
    else if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
  }
  return out;
}

const consoleSink: LogSink = (level, line) => {
  if (level === 'error') console.error(line);
  else console.log(line);
};

export function createLogger(
  sink: LogSink = consoleSink,
  now: () => Date = () => new Date(),
): Logger {
  const write = (level: LogLevel) => (fields: LogFields) => {
    sink(level, JSON.stringify({ ts: now().toISOString(), level, ...clean(fields) }));
  };
  return { info: write('info'), warn: write('warn'), error: write('error') };
}

export const log: Logger = createLogger();
