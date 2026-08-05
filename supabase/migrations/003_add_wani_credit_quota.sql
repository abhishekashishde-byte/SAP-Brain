-- Wani free-tier credit ledger.
--
-- One accepted chat question consumes one daily credit and one monthly credit.
-- The server calls the RPC with the service role; browser roles receive no access.
-- Vault tables and vault functions are intentionally untouched.

create table if not exists public.wani_credit_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  usage_day date not null,
  usage_month date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, request_id)
);

create index if not exists wani_credit_usage_user_day_idx
  on public.wani_credit_usage (user_id, usage_day);

create index if not exists wani_credit_usage_user_month_idx
  on public.wani_credit_usage (user_id, usage_month);

alter table public.wani_credit_usage enable row level security;

revoke all on table public.wani_credit_usage from public;
revoke all on table public.wani_credit_usage from anon;
revoke all on table public.wani_credit_usage from authenticated;
grant select, insert, delete on table public.wani_credit_usage to service_role;

comment on table public.wani_credit_usage is
  'Server-only Wani free-credit usage events. One row represents one accepted chat question.';

create or replace function public.consume_wani_credit(
  p_user_id uuid,
  p_request_id uuid,
  p_daily_limit integer default 5,
  p_monthly_limit integer default 20,
  p_timezone text default 'Europe/Berlin'
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := current_timestamp;
  v_usage_day date;
  v_usage_month date;
  v_daily_used integer := 0;
  v_monthly_used integer := 0;
  v_duplicate boolean := false;
  v_daily_reset_at timestamptz;
  v_monthly_reset_at timestamptz;
begin
  if p_user_id is null or p_request_id is null then
    raise exception 'user_id and request_id are required' using errcode = '22023';
  end if;

  if p_daily_limit < 1 or p_monthly_limit < 1 or p_daily_limit > p_monthly_limit then
    raise exception 'invalid Wani credit limits' using errcode = '22023';
  end if;

  v_usage_day := (v_now at time zone p_timezone)::date;
  v_usage_month := date_trunc('month', v_usage_day::timestamp)::date;
  v_daily_reset_at := ((v_usage_day + 1)::timestamp at time zone p_timezone);
  v_monthly_reset_at := ((v_usage_month + interval '1 month')::timestamp at time zone p_timezone);

  -- Serialize credit decisions for this user so parallel tabs cannot overspend.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  select exists (
    select 1
    from public.wani_credit_usage
    where user_id = p_user_id
      and request_id = p_request_id
  ) into v_duplicate;

  select
    count(*) filter (where usage_day = v_usage_day)::integer,
    count(*) filter (where usage_month = v_usage_month)::integer
  into v_daily_used, v_monthly_used
  from public.wani_credit_usage
  where user_id = p_user_id
    and (usage_day = v_usage_day or usage_month = v_usage_month);

  -- A repeated request ID is idempotent and never consumes a second credit.
  if v_duplicate then
    return jsonb_build_object(
      'allowed', true,
      'duplicate', true,
      'reason', null,
      'daily_used', v_daily_used,
      'daily_remaining', greatest(p_daily_limit - v_daily_used, 0),
      'daily_limit', p_daily_limit,
      'monthly_used', v_monthly_used,
      'monthly_remaining', greatest(p_monthly_limit - v_monthly_used, 0),
      'monthly_limit', p_monthly_limit,
      'daily_reset_at', v_daily_reset_at,
      'monthly_reset_at', v_monthly_reset_at
    );
  end if;

  -- Monthly is checked first because it remains blocked even after the next daily reset.
  if v_monthly_used >= p_monthly_limit then
    return jsonb_build_object(
      'allowed', false,
      'duplicate', false,
      'reason', 'monthly',
      'daily_used', v_daily_used,
      'daily_remaining', greatest(p_daily_limit - v_daily_used, 0),
      'daily_limit', p_daily_limit,
      'monthly_used', v_monthly_used,
      'monthly_remaining', 0,
      'monthly_limit', p_monthly_limit,
      'daily_reset_at', v_daily_reset_at,
      'monthly_reset_at', v_monthly_reset_at
    );
  end if;

  if v_daily_used >= p_daily_limit then
    return jsonb_build_object(
      'allowed', false,
      'duplicate', false,
      'reason', 'daily',
      'daily_used', v_daily_used,
      'daily_remaining', 0,
      'daily_limit', p_daily_limit,
      'monthly_used', v_monthly_used,
      'monthly_remaining', greatest(p_monthly_limit - v_monthly_used, 0),
      'monthly_limit', p_monthly_limit,
      'daily_reset_at', v_daily_reset_at,
      'monthly_reset_at', v_monthly_reset_at
    );
  end if;

  insert into public.wani_credit_usage (
    user_id,
    request_id,
    usage_day,
    usage_month
  ) values (
    p_user_id,
    p_request_id,
    v_usage_day,
    v_usage_month
  );

  v_daily_used := v_daily_used + 1;
  v_monthly_used := v_monthly_used + 1;

  return jsonb_build_object(
    'allowed', true,
    'duplicate', false,
    'reason', null,
    'daily_used', v_daily_used,
    'daily_remaining', greatest(p_daily_limit - v_daily_used, 0),
    'daily_limit', p_daily_limit,
    'monthly_used', v_monthly_used,
    'monthly_remaining', greatest(p_monthly_limit - v_monthly_used, 0),
    'monthly_limit', p_monthly_limit,
    'daily_reset_at', v_daily_reset_at,
    'monthly_reset_at', v_monthly_reset_at
  );
end;
$$;

revoke all on function public.consume_wani_credit(uuid, uuid, integer, integer, text) from public;
revoke all on function public.consume_wani_credit(uuid, uuid, integer, integer, text) from anon;
revoke all on function public.consume_wani_credit(uuid, uuid, integer, integer, text) from authenticated;
grant execute on function public.consume_wani_credit(uuid, uuid, integer, integer, text) to service_role;

comment on function public.consume_wani_credit(uuid, uuid, integer, integer, text) is
  'Atomically consumes one Wani free credit for a user and returns daily/monthly balances.';
