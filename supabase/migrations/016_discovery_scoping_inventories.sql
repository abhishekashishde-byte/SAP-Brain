-- Addendum 03 P3-2: structured inventories and RAID log.
create table public.discovery_interfaces (
 id uuid primary key default gen_random_uuid(),workshop_id uuid not null references public.discovery_workshops(id) on delete cascade,
 name text not null,partner_system text,direction text check(direction in ('in','out','both')),
 related_id text,data_text text,frequency text,volume text,
 technology text check(technology in ('api','idoc','file','database','manual','unknown')),
 exists_today text check(exists_today in ('yes','no','planned')),
 owner_stakeholder uuid references public.discovery_stakeholders(id) on delete set null,
 status text not null default 'open' check(status in ('open','agreed','out_of_scope')),
 note text,updated_at timestamptz not null default now());
create table public.discovery_forms_reports (
 id uuid primary key default gen_random_uuid(),workshop_id uuid not null references public.discovery_workshops(id) on delete cascade,
 name text not null,kind text check(kind in ('form','report','label','dashboard')),
 related_id text,used_by text,frequency text,today_in text,sample_received boolean not null default false,
 request_id uuid references public.discovery_requests(id) on delete set null,
 decision text check(decision in ('standard','adapt','custom','not_needed','clarify')),note text,updated_at timestamptz not null default now());
create table public.discovery_raid (
 id uuid primary key default gen_random_uuid(),workshop_id uuid not null references public.discovery_workshops(id) on delete cascade,
 kind text not null check(kind in ('risk','assumption','dependency')),text text not null,related_id text,
 probability text check(probability in ('low','medium','high')),impact text check(impact in ('low','medium','high')),
 mitigation text,owner_stakeholder uuid references public.discovery_stakeholders(id) on delete set null,
 status text not null default 'open' check(status in ('open','mitigated','closed','confirmed','rejected')),
 note text,is_internal boolean not null default false,updated_at timestamptz not null default now());
create index discovery_interfaces_workshop_idx on public.discovery_interfaces(workshop_id);
alter table public.discovery_interfaces enable row level security;
create policy discovery_interfaces_owner on public.discovery_interfaces for all to authenticated using (exists(select 1 from public.discovery_workshops w where w.id=workshop_id and w.owner_id=(select auth.uid()))) with check(exists(select 1 from public.discovery_workshops w where w.id=workshop_id and w.owner_id=(select auth.uid())));
grant select,insert,update,delete on public.discovery_interfaces to authenticated;
create index discovery_forms_reports_workshop_idx on public.discovery_forms_reports(workshop_id);
alter table public.discovery_forms_reports enable row level security;
create policy discovery_forms_reports_owner on public.discovery_forms_reports for all to authenticated using (exists(select 1 from public.discovery_workshops w where w.id=workshop_id and w.owner_id=(select auth.uid()))) with check(exists(select 1 from public.discovery_workshops w where w.id=workshop_id and w.owner_id=(select auth.uid())));
grant select,insert,update,delete on public.discovery_forms_reports to authenticated;
create index discovery_raid_workshop_idx on public.discovery_raid(workshop_id);
alter table public.discovery_raid enable row level security;
create policy discovery_raid_owner on public.discovery_raid for all to authenticated using (exists(select 1 from public.discovery_workshops w where w.id=workshop_id and w.owner_id=(select auth.uid()))) with check(exists(select 1 from public.discovery_workshops w where w.id=workshop_id and w.owner_id=(select auth.uid())));
grant select,insert,update,delete on public.discovery_raid to authenticated;