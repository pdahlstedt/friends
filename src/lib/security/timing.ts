import { setTimeout as delay } from 'node:timers/promises';

// Evens out response time so outcomes can't be told apart by timing (spec 0001, AC4/AC7).

export type Clock = {
  /** Milliseconds, monotonic. */
  now: () => number;
  sleep: (ms: number) => Promise<unknown>;
};

const realClock: Clock = { now: () => performance.now(), sleep: (ms) => delay(ms) };

/**
 * Runs `fn` and resolves or rejects no earlier than `minimumMs` after the start. Failures are
 * padded too, so a fast error path looks like a slow success.
 */
export async function withMinimumDuration<T>(
  minimumMs: number,
  fn: () => Promise<T>,
  clock: Clock = realClock,
): Promise<T> {
  const started = clock.now();
  const pad = async () => {
    const remaining = minimumMs - (clock.now() - started);
    if (remaining > 0) await clock.sleep(remaining);
  };
  try {
    return await fn();
  } finally {
    await pad();
  }
}
