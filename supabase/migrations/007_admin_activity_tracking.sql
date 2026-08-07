-- Wani admin dashboard: persistent user activity tracking.
-- Keeps the existing single-session model intact while preserving a durable
-- last_seen_at timestamp even after the active-session row is cleared.

begin;

alter table public.profiles
  add column if not exists last_seen_at timestamptz;

create index if not exists idx_profiles_last_seen_at
  on public.profiles (last_seen_at desc);

-- Backfill from the best existing signals. This is intentionally conservative:
-- current active-session activity wins; otherwise leave the profile timestamp as-is.
update public.profiles p
   set last_seen_at = greatest(
     coalesce(p.last_seen_at, '-infinity'::timestamptz),
     coalesce(s.last_seen_at, '-infinity'::timestamptz)
   )
  from public.wani_active_sessions s
 where s.user_id = p.id
   and (p.last_seen_at is null or s.last_seen_at > p.last_seen_at);

create or replace function public.verify_wani_session()
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id uuid;
  v_row_count bigint := 0;
begin
  if v_user_id is null then
    return false;
  end if;

  begin
    v_session_id := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  exception when others then
    return false;
  end;

  if v_session_id is null then
    return false;
  end if;

  update public.wani_active_sessions
     set last_seen_at = now()
   where user_id = v_user_id
     and active_session_id = v_session_id;

  get diagnostics v_row_count = row_count;

  if v_row_count > 0 then
    update public.profiles
       set last_seen_at = now()
     where id = v_user_id;
  end if;

  return v_row_count > 0;
end;
$$;

create or replace function public.clear_wani_session()
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id uuid;
  v_row_count bigint := 0;
begin
  if v_user_id is null then
    return false;
  end if;

  begin
    v_session_id := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  exception when others then
    return false;
  end;

  if v_session_id is null then
    return false;
  end if;

  -- Persist the final activity timestamp before removing the ephemeral row.
  update public.profiles
     set last_seen_at = now()
   where id = v_user_id;

  delete from public.wani_active_sessions
   where user_id = v_user_id
     and active_session_id = v_session_id;

  get diagnostics v_row_count = row_count;
  return v_row_count > 0;
end;
$$;

revoke all on function public.verify_wani_session() from public, anon;
revoke all on function public.clear_wani_session() from public, anon;
grant execute on function public.verify_wani_session() to authenticated, service_role;
grant execute on function public.clear_wani_session() to authenticated, service_role;

comment on column public.profiles.last_seen_at is
  'Durable Wani activity timestamp. Refreshed while an authenticated session is active and preserved on logout.';

commit;
