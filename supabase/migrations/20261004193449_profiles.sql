-- Spec 0001: profiles module schema (ADR-0002 module-owned tables, ADR-0004 data access).
-- Users may read only their own profile row. All writes go through the service role
-- (ProfileStore.insertIfMissing), called only after a server-side authorization check.

create schema profiles;

-- Schema access: PostgREST roles only where needed. anon gets nothing.
revoke all on schema profiles from public, anon;
grant usage on schema profiles to authenticated, service_role;

create table profiles.profiles (
  -- The only allowed cross-schema FK (ADR-0004 §5): GDPR deletion safety net.
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table profiles.profiles enable row level security;
alter table profiles.profiles force row level security;

-- Explicit grants; nothing inherited from default privileges.
revoke all on profiles.profiles from public, anon, authenticated, service_role;
grant select on profiles.profiles to authenticated;
grant select, insert on profiles.profiles to service_role; -- insertIfMissing only

create policy profiles_select_own on profiles.profiles
  for select to authenticated
  using (user_id = (select auth.uid()));

-- No insert/update/delete policies: authenticated users cannot write profile rows directly.
