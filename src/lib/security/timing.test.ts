import { describe, expect, it } from 'vitest';
import { withMinimumDuration } from './timing';

// A fake clock: sleep advances time instantly and records how long it was asked to wait.
function fakeClock(start = 1_000) {
  let now = start;
  const sleeps: number[] = [];
  return {
    now: () => now,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      now += ms;
    },
    advance: (ms: number) => {
      now += ms;
    },
    sleeps,
  };
}

describe('withMinimumDuration', () => {
  it('pads a fast call up to the minimum and returns its value', async () => {
    const clock = fakeClock();
    const result = await withMinimumDuration(
      800,
      async () => {
        clock.advance(50);
        return 'ok';
      },
      clock,
    );
    expect(result).toBe('ok');
    expect(clock.sleeps).toEqual([750]);
  });

  it('does not wait when the call already took longer than the minimum', async () => {
    const clock = fakeClock();
    await withMinimumDuration(800, async () => clock.advance(900), clock);
    expect(clock.sleeps).toEqual([]);
  });

  it('pads a failing call too, then rethrows the same error', async () => {
    const clock = fakeClock();
    const failure = new Error('boom');
    await expect(
      withMinimumDuration(
        800,
        async () => {
          clock.advance(10);
          throw failure;
        },
        clock,
      ),
    ).rejects.toBe(failure);
    expect(clock.sleeps).toEqual([790]);
  });

  it('really waits by default', async () => {
    const started = performance.now();
    await withMinimumDuration(30, async () => 'x');
    expect(performance.now() - started).toBeGreaterThanOrEqual(25);
  });
});
