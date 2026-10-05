-- Spec 0001 / ADR-0005: application rate limiting, fixed window in Postgres.
-- Only the service role (the RateLimiter adapter on the server) can touch any of this.
-- Keys are HMAC-SHA256 digests computed in the app; raw emails and IPs are never stored.

create schema ratelimit;

revoke all on schema ratelimit from public, anon, authenticated;
grant usage on schema ratelimit to service_role;

create table ratelimit.buckets (
  key          text        primary key check (char_length(key) between 1 and 200),
  window_start timestamptz not null,
  count        integer     not null check (count >= 1),
  expires_at   timestamptz not null,
  check (expires_at > window_start)
);

-- RLS on with no policies: anon and authenticated could not read or write even if granted.
-- service_role and the table owner (pg_cron cleanup) have BYPASSRLS.
alter table ratelimit.buckets enable row level security;
alter table ratelimit.buckets force row level security;

revoke all on ratelimit.buckets from public, anon, authenticated, service_role;
grant select, insert, update on ratelimit.buckets to service_role; -- hit() runs as the caller

-- Counts one request against `p_key`. The first hit opens a window of `p_window_seconds`;
-- hits inside it are allowed while the count is at most `p_limit`. Once the window has
-- expired, the next hit starts a new one. A single INSERT … ON CONFLICT DO UPDATE takes a
-- row lock, so concurrent hits on one key are counted exactly.
create function ratelimit.hit(p_key text, p_limit integer, p_window_seconds integer)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now        timestamptz := clock_timestamp();
  v_count      integer;
  v_expires_at timestamptz;
begin
  if p_key is null or p_limit is null or p_limit < 1
     or p_window_seconds is null or p_window_seconds < 1 then
    raise exception 'invalid rate limit arguments' using errcode = '22023';
  end if;

  insert into ratelimit.buckets as b (key, window_start, count, expires_at)
  values (p_key, v_now, 1, v_now + make_interval(secs => p_window_seconds))
  on conflict (key) do update set
    window_start = case when b.expires_at <= v_now then v_now else b.window_start end,
    -- Capped at limit + 1: enough to deny, and a flood can never overflow the counter.
    count        = case when b.expires_at <= v_now then 1
                        else least(b.count, p_limit) + 1 end,
    expires_at   = case when b.expires_at <= v_now
                        then v_now + make_interval(secs => p_window_seconds)
                        else b.expires_at end
  returning b.count, b.expires_at into v_count, v_expires_at;

  allowed := v_count <= p_limit;
  retry_after_seconds := case
    when allowed then 0
    else greatest(1, ceil(extract(epoch from v_expires_at - v_now)))::integer
  end;
  return next;
end;
$$;

-- Functions are executable by PUBLIC by default; only the service role may call this one.
revoke all on function ratelimit.hit(text, integer, integer) from public, anon, authenticated;
grant execute on function ratelimit.hit(text, integer, integer) to service_role;

-- Hourly cleanup of expired windows (pg_cron ships with Supabase; no new service).
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'ratelimit-cleanup',
  '17 * * * *',
  $$delete from ratelimit.buckets where expires_at < now()$$
);
