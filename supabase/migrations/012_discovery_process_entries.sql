-- Addendum B1: separate status/answers per SAP PM process or background job.
create table public.discovery_process_entries (
 workshop_id uuid not null references public.discovery_workshops(id) on delete cascade,
 process_id text not null,
 status text check(status in ('valid','not_valid','later','clarify')),
 frequency text check(frequency in ('daily','weekly','fortnightly','monthly','period_end','yearly','on_demand','event_driven')),
 run_window text,
 volume text,
 responsible text,
 today text,
 answers jsonb not null default '{}',
 note text,
 is_internal boolean not null default false,
 custom jsonb,
 updated_at timestamptz not null default now(),
 primary key(workshop_id,process_id)
);
create index discovery_process_entries_workshop_idx on public.discovery_process_entries(workshop_id);
alter table public.discovery_process_entries enable row level security;
create policy discovery_process_entries_owner on public.discovery_process_entries for all to authenticated
 using (exists(select 1 from public.discovery_workshops w where w.id=workshop_id and w.owner_id=(select auth.uid())))
 with check (exists(select 1 from public.discovery_workshops w where w.id=workshop_id and w.owner_id=(select auth.uid())));
grant select,insert,update,delete on public.discovery_process_entries to authenticated;
