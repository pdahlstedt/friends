import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/db/types.generated';

// Service-role Supabase client (bypasses RLS). Server-only; used by the RateLimiter and by
// privileged store methods (ADR-0004). Created once per process: it holds no user session.
// Excluded from unit coverage (vendor binding); exercised by contract and system tests.

export function createServiceClient(url: string, serviceRoleKey: string): SupabaseClient<Database> {
  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
