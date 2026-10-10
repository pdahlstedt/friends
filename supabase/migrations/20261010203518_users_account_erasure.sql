-- Spec 0002 / ADR-0006: erase what Supabase Auth keeps about a deleted user. Two auth tables
-- have no foreign key to auth.users and so survive the user's deletion:
-- - audit_log_entries: entries carry the user's email (actor_username, traits.user_email);
--   deleting a user even adds a user_deleted entry;
-- - flow_state: PKCE sign-up state, carrying the user's ID (found by the AC4 scan).
-- The users module owns this schema. It has no tables yet; only the service role may call it.

create schema users;

revoke all on schema users from public, anon, authenticated;
grant usage on schema users to service_role;

-- Deletes the user's PKCE flow states, and every audit entry about `p_user_id`: as actor or as
-- subject (traits.user_id), plus any entry carrying one of the emails those entries show for the
-- user. Idempotent; called by users.deleteAccount right after the auth user is deleted.
create function users.erase_auth_leftovers(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.flow_state f where f.user_id = p_user_id;

  with mine as (
    select a.payload
    from auth.audit_log_entries a
    where a.payload->>'actor_id' = p_user_id::text
       or a.payload->'traits'->>'user_id' = p_user_id::text
  ),
  emails as (
    select distinct lower(v.email) as email
    from mine,
         lateral (values (mine.payload->>'actor_username'),
                         (mine.payload->'traits'->>'user_email')) as v(email)
    where v.email like '%@%'
  )
  delete from auth.audit_log_entries a
  where a.payload->>'actor_id' = p_user_id::text
     or a.payload->'traits'->>'user_id' = p_user_id::text
     or lower(a.payload->>'actor_username') in (select email from emails)
     or lower(a.payload->'traits'->>'user_email') in (select email from emails);
$$;

-- Backstop for a failed erase (ADR-0006 §3): deletes flow states and audit entries about users
-- that no longer exist, whether the user was the actor or the subject. Entries by the service
-- role (the zero UUID) about an existing user, and rows about nobody, are kept.
create function users.sweep_auth_leftovers()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.flow_state f
  where f.user_id is not null
    and not exists (select 1 from auth.users u where u.id = f.user_id);

  delete from auth.audit_log_entries a
  where (
      a.payload->>'actor_id' is not null
      and a.payload->>'actor_id' <> '00000000-0000-0000-0000-000000000000'
      and not exists (select 1 from auth.users u where u.id::text = a.payload->>'actor_id')
    ) or (
      a.payload->'traits'->>'user_id' is not null
      and not exists (select 1 from auth.users u where u.id::text = a.payload->'traits'->>'user_id')
    );
$$;

-- Functions are executable by PUBLIC by default; only the service role may call these.
revoke all on function users.erase_auth_leftovers(uuid), users.sweep_auth_leftovers()
  from public, anon, authenticated;
grant execute on function users.erase_auth_leftovers(uuid), users.sweep_auth_leftovers()
  to service_role;

-- Daily backstop (pg_cron is enabled by the ratelimit migration).
select cron.schedule('users-sweep-auth-leftovers', '17 3 * * *', 'select users.sweep_auth_leftovers()');
