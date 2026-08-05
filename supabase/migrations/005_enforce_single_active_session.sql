-- Enforce one active Supabase Auth session per Wani user.
-- The current session is identified by the verified JWT's session_id claim.

create table if not exists public.wani_active_sessions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active_session_id uuid not null,
  claimed_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

alter table public.wani_active_sessions enable row level security;

revoke all on table public.wani_active_sessions from public, anon, authenticated;
grant all on table public.wani_active_sessions to service_role;

create or replace function public.claim_wani_session()
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  begin
    v_session_id := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  exception when others then
    v_session_id := null;
  end;

  if v_session_id is null then
    raise exception 'Session identifier is missing' using errcode = '42501';
  end if;

  insert into public.wani_active_sessions (
    user_id,
    active_session_id,
    claimed_at,
    last_seen_at
  ) values (
    v_user_id,
    v_session_id,
    now(),
    now()
  )
  on conflict (user_id) do update
    set active_session_id = excluded.active_session_id,
        claimed_at = excluded.claimed_at,
        last_seen_at = excluded.last_seen_at;

  return true;
end;
$$;

create or replace function public.verify_wani_session()
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id uuid;
  v_active boolean := false;
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

  get diagnostics v_active = row_count;
  return v_active;
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
  v_deleted boolean := false;
begin
  if v_user_id is null then
    return false;
  end if;

  begin
    v_session_id := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  exception when others then
    return false;
  end;

  delete from public.wani_active_sessions
   where user_id = v_user_id
     and active_session_id = v_session_id;

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.claim_wani_session() from public, anon;
revoke all on function public.verify_wani_session() from public, anon;
revoke all on function public.clear_wani_session() from public, anon;

grant execute on function public.claim_wani_session() to authenticated, service_role;
grant execute on function public.verify_wani_session() to authenticated, service_role;
grant execute on function public.clear_wani_session() to authenticated, service_role;
