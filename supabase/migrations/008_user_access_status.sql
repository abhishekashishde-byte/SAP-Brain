begin;

alter table public.profiles
  add column if not exists access_status text;

update public.profiles p
set access_status = case
  when exists (
    select 1 from public.approved_emails a
    where lower(trim(a.email)) = lower(trim(p.email))
  ) then 'active'
  else coalesce(p.access_status, 'pending')
end
where p.access_status is null;

alter table public.profiles
  alter column access_status set default 'pending';

alter table public.profiles
  drop constraint if exists profiles_access_status_check;

alter table public.profiles
  add constraint profiles_access_status_check
  check (access_status in ('pending','active','suspended'));

create index if not exists idx_profiles_access_status
  on public.profiles (access_status);

comment on column public.profiles.access_status is
  'Administrative Wani access lifecycle: pending, active, or suspended. approved_emails remains the authoritative access gate.';

commit;
