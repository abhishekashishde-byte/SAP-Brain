-- Addendum 04 P4-1: optional engagements, session chain and copy provenance.
create table public.discovery_engagements (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 client_name text not null,title text,notes text,created_at timestamptz not null default now()
);
create index discovery_engagements_owner_idx on public.discovery_engagements(owner_id);
alter table public.discovery_engagements enable row level security;
create policy discovery_engagements_owner on public.discovery_engagements for all to authenticated
 using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
grant select,insert,update,delete on public.discovery_engagements to authenticated;
alter table public.discovery_workshops add column engagement_id uuid references public.discovery_engagements(id) on delete set null;
alter table public.discovery_workshops add column session_no int;
alter table public.discovery_workshops add column previous_workshop_id uuid references public.discovery_workshops(id) on delete set null;
alter table public.discovery_workshops add column client_language text not null default 'en' check(client_language in ('en','de'));
create unique index discovery_engagement_session_unique on public.discovery_workshops(engagement_id,session_no) where engagement_id is not null and session_no is not null;
create index discovery_workshops_engagement_idx on public.discovery_workshops(engagement_id,session_no);
do $$
declare tbl text;
begin
 foreach tbl in array array[
 'discovery_entries','discovery_todos','discovery_legacy_fields','discovery_process_entries',
 'discovery_stakeholders','discovery_drivers','discovery_sizing','discovery_requests',
 'discovery_parking','discovery_gaps','discovery_interfaces','discovery_forms_reports',
 'discovery_raid','discovery_source_systems','discovery_object_sources'
 ] loop
  execute format('alter table public.%I add column if not exists carried_from text',tbl);
 end loop;
end $$;
