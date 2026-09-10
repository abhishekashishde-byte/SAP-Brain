create table if not exists public.wani_notification_log (
  id uuid primary key default gen_random_uuid(),
  notification_key text not null unique,
  kind text not null,
  user_id uuid null,
  recipient text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists wani_notification_log_user_created_idx
  on public.wani_notification_log (user_id, created_at desc);

alter table public.wani_notification_log enable row level security;
revoke all on table public.wani_notification_log from anon, authenticated;
