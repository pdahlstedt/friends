import { createFakeAuthBackend, createFakeAuthProvider } from '@/lib/adapters/auth/fake';
import { authProviderContract } from './auth-provider.contract';

authProviderContract('fake', async () => {
  const backend = createFakeAuthBackend();
  return {
    providerFor: (jar, options) =>
      createFakeAuthProvider(backend, {
        cookies: jar,
        secureCookies: options?.secureCookies ?? true,
      }),
    tokensSent: async (email) => backend.sent.get(email.toLowerCase())?.length ?? 0,
    nextToken: async (email, alreadySeen) => {
      const tokens = backend.sent.get(email.toLowerCase()) ?? [];
      if (tokens.length <= alreadySeen) throw new Error('no new verification token');
      return tokens.at(-1)!;
    },
    waitForEmailInterval: async () => {},
    sessionCount: async (userId) =>
      [...backend.sessions.values()].filter((id) => id === userId).length,
    cleanup: async () => {},
  };
});
