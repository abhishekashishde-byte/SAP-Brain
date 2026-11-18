-- Addendum A2: legacy-only fields observed in source systems.
create table public.discovery_legacy_fields (
 id uuid primary key default gen_random_uuid(),
 workshop_id uuid not null references public.discovery_workshops(id) on delete cascade,
 object_id text not null,
 source_system_id uuid references public.discovery_source_systems(id) on delete set null,
 source_field text not null,
 meaning text,
 used_today text check(used_today in ('yes','partly','no')),
 sap_handling text check(sap_handling in ('standard_field','classification','long_text','custom_field','separate_object','archive_only','not_needed','clarify')),
 sap_target text,
 sap_catalog_field_id text,
 note text,
 origin text not null default 'manual' check(origin in ('manual','paste','ai_suggested')),
 sort_order int not null default 0,
 updated_at timestamptz not null default now()
);
create index discovery_legacy_fields_workshop_object_idx on public.discovery_legacy_fields(workshop_id,object_id,sort_order);
alter table public.discovery_legacy_fields enable row level security;
create policy discovery_legacy_fields_owner on public.discovery_legacy_fields for all to authenticated
 using (exists(select 1 from public.discovery_workshops w where w.id=workshop_id and w.owner_id=(select auth.uid())))
 with check (exists(select 1 from public.discovery_workshops w where w.id=workshop_id and w.owner_id=(select auth.uid())));
grant select,insert,update,delete on public.discovery_legacy_fields to authenticated;
