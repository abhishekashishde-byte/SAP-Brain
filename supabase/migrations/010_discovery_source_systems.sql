-- Addendum A1: per-workshop source systems and per-object source mapping.
create table public.discovery_source_systems (
 id uuid primary key default gen_random_uuid(),
 workshop_id uuid not null references public.discovery_workshops(id) on delete cascade,
 name text not null check (length(trim(name)) > 0),
 system_type text not null check (system_type in ('sap_ecc','sap_s4','non_sap_cmms','non_sap_erp','excel_access','paper','other')),
 version text, owner text, notes text,
 created_at timestamptz not null default now()
);
create index discovery_source_systems_workshop_idx on public.discovery_source_systems(workshop_id);
create table public.discovery_object_sources (
 workshop_id uuid not null references public.discovery_workshops(id) on delete cascade,
 object_id text not null,
 source_system_ids uuid[] not null default '{}',
 not_maintained boolean not null default false,
 note text,
 updated_at timestamptz not null default now(),
 primary key(workshop_id,object_id)
);
create index discovery_object_sources_workshop_idx on public.discovery_object_sources(workshop_id);
alter table public.discovery_source_systems enable row level security;
alter table public.discovery_object_sources enable row level security;
create policy discovery_source_systems_owner on public.discovery_source_systems for all to authenticated
 using (exists(select 1 from public.discovery_workshops w where w.id=workshop_id and w.owner_id=(select auth.uid())))
 with check (exists(select 1 from public.discovery_workshops w where w.id=workshop_id and w.owner_id=(select auth.uid())));
create policy discovery_object_sources_owner on public.discovery_object_sources for all to authenticated
 using (exists(select 1 from public.discovery_workshops w where w.id=workshop_id and w.owner_id=(select auth.uid())))
 with check (exists(select 1 from public.discovery_workshops w where w.id=workshop_id and w.owner_id=(select auth.uid())));
grant select,insert,update,delete on public.discovery_source_systems,public.discovery_object_sources to authenticated;
