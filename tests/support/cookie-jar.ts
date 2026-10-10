import type { CookieJar, CookieToSet } from '@/lib/adapters/auth/cookies';

// A browser's cookie store for adapter tests: keeps cookies across requests, deletes on
// maxAge <= 0, and records every write (with its options and headers) for assertions.

export type TestCookieJar = CookieJar & {
  readonly cookies: Map<string, string>;
  readonly writes: { cookies: CookieToSet[]; headers: Record<string, string> }[];
  /** A second browser holding a copy of this one's cookies (e.g. a stolen session). */
  copy(): TestCookieJar;
};

export function createTestCookieJar(initial: Map<string, string> = new Map()): TestCookieJar {
  const cookies = new Map(initial);
  const writes: TestCookieJar['writes'] = [];
  return {
    cookies,
    writes,
    getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
    setAll(toSet, headers) {
      writes.push({ cookies: toSet, headers });
      for (const { name, value, options } of toSet) {
        if (value === '' || (options.maxAge !== undefined && options.maxAge <= 0)) {
          cookies.delete(name);
        } else {
          cookies.set(name, value);
        }
      }
    },
    copy: () => createTestCookieJar(cookies),
  };
}
