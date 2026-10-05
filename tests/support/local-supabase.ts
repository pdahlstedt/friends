import { execFileSync } from 'node:child_process';

// Connection details for the local Supabase stack used by RLS, contract and system tests.
// Read from the environment when set (CI), otherwise from `supabase status`, so no keys
// are ever committed. Refuses anything but a local stack: these tests create and delete users.
export type LocalSupabase = {
  apiUrl: string;
  dbUrl: string;
  anonKey: string;
  serviceRoleKey: string;
  /** Mailpit (local SMTP sink) HTTP API, where Supabase Auth sends verification emails. */
  mailpitUrl: string;
};

let cached: LocalSupabase | undefined;

export function localSupabase(): LocalSupabase {
  if (cached) return cached;
  const env: Env = process.env.SUPABASE_URL ? process.env : readStatus();
  const config = {
    apiUrl: required(env, 'SUPABASE_URL'),
    dbUrl: required(env, 'SUPABASE_DB_URL'),
    anonKey: required(env, 'SUPABASE_ANON_KEY'),
    serviceRoleKey: required(env, 'SUPABASE_SERVICE_ROLE_KEY'),
    mailpitUrl: required(env, 'MAILPIT_URL'),
  };
  for (const url of [config.apiUrl, config.dbUrl, config.mailpitUrl]) {
    const host = new URL(url).hostname;
    if (host !== '127.0.0.1' && host !== 'localhost') {
      throw new Error(`Refusing to run tests against non-local Supabase host: ${host}`);
    }
  }
  cached = config;
  return config;
}

type Env = Record<string, string | undefined>;

function readStatus(): Env {
  const out = execFileSync('pnpm', ['exec', 'supabase', 'status', '-o', 'json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const status = JSON.parse(out) as Record<string, string | undefined>;
  return {
    SUPABASE_URL: status.API_URL,
    SUPABASE_DB_URL: status.DB_URL,
    SUPABASE_ANON_KEY: status.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
    MAILPIT_URL: status.MAILPIT_URL,
  };
}

function required(env: Env, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`${name} is not set and could not be read from supabase status`);
  return value;
}
