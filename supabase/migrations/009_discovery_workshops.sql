-- Discovery Workshop: isolated per-user SAP PM workshop data.
create table if not exists public.discovery_workshops (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 client_name text not null check (length(trim(client_name)) > 0),
 title text not null default 'SAP PM Discovery Workshop',
 project_name text not null default '',
 consultant_name text not null default '',
 call_date date not null,
 start_time time,
 end_time time,
 participants text not null default '',
 legacy_system text not null default '',
 catalog_id text not null default 'sap-pm-discovery',
 catalog_version text not null default '1.0.0',
 scope_areas text[] not null default '{}',
 status text not null default 'active' check (status in ('active','done','archived')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.discovery_entries (
 workshop_id uuid not null references public.discovery_workshops(id) on delete cascade,
 object_id text not null,
 item_type text not null check (item_type in ('field','question','decision','object_status','legacy_today','note','custom_field','custom_question','area_note','workshop_note')),
 item_id text not null,
 value jsonb,
 note text,
 is_internal boolean not null default false,
 updated_at timestamptz not null default now(),
 primary key (workshop_id, object_id, item_type, item_id)
);
create table if not exists public.discovery_todos (
 id uuid primary key default gen_random_uuid(),
 workshop_id uuid not null references public.discovery_workshops(id) on delete cascade,
 object_id text,
 text text not null check (length(trim(text)) > 0),
 owner text,
 due_date date,
 done boolean not null default false,
 created_at timestamptz not null default now()
);
create table if not exists public.discovery_minutes (
 id uuid primary key default gen_random_uuid(),
 workshop_id uuid not null references public.discovery_workshops(id) on delete cascade,
 content_md text not null,
 model text,
 audience text not null default 'client' check (audience in ('client','internal')),
 created_at timestamptz not null default now()
);
create table if not exists public.discovery_legacy_hints (
 id uuid primary key default gen_random_uuid(),
 workshop_id uuid not null references public.discovery_workshops(id) on delete cascade,
 object_id text not null,
 legacy_feature text not null,
 hint text not null,
 gap_type text not null check (gap_type in ('maps','differs','missing_in_sap','missing_in_legacy')),
 source_ref text,
 accepted boolean,
 created_at timestamptz not null default now()
);
create index if not exists discovery_workshops_owner_idx on public.discovery_workshops(owner_id, updated_at desc);
create index if not exists discovery_entries_workshop_idx on public.discovery_entries(workshop_id);
create index if not exists discovery_todos_workshop_idx on public.discovery_todos(workshop_id);
create index if not exists discovery_minutes_workshop_idx on public.discovery_minutes(workshop_id);
create index if not exists discovery_hints_workshop_idx on public.discovery_legacy_hints(workshop_id);
alter table public.discovery_workshops enable row level security;
alter table public.discovery_entries enable row level security;
alter table public.discovery_todos enable row level security;
alter table public.discovery_minutes enable row level security;
alter table public.discovery_legacy_hints enable row level security;
create policy discovery_workshops_owner on public.discovery_workshops for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy discovery_entries_owner on public.discovery_entries for all to authenticated
 using (exists(select 1 from public.discovery_workshops w where w.id=workshop_id and w.owner_id=(select auth.uid())))
 with check (exists(select 1 from public.discovery_workshops w where w.id=workshop_id and w.owner_id=(select auth.uid())));
create policy discovery_todos_owner on public.discovery_todos for all to authenticated
 using (exists(select 1 from public.discovery_workshops w where w.id=workshop_id and w.owner_id=(select auth.uid())))
 with check (exists(select 1 from public.discovery_workshops w where w.id=workshop_id and w.owner_id=(select auth.uid())));
create policy discovery_minutes_owner on public.discovery_minutes for all to authenticated
 using (exists(select 1 from public.discovery_workshops w where w.id=workshop_id and w.owner_id=(select auth.uid())))
 with check (exists(select 1 from public.discovery_workshops w where w.id=workshop_id and w.owner_id=(select auth.uid())));
create policy discovery_hints_owner on public.discovery_legacy_hints for all to authenticated
 using (exists(select 1 from public.discovery_workshops w where w.id=workshop_id and w.owner_id=(select auth.uid())))
 with check (exists(select 1 from public.discovery_workshops w where w.id=workshop_id and w.owner_id=(select auth.uid())));
grant select, insert, update, delete on public.discovery_workshops, public.discovery_entries, public.discovery_todos, public.discovery_minutes, public.discovery_legacy_hints to authenticated;
-- Private owner-prefixed object keys, created in the legacy import phase.
insert into storage.buckets (id, name, public) values ('discovery-legacy','discovery-legacy',false) on conflict (id) do nothing;
create policy discovery_legacy_read on storage.objects for select to authenticated
 using (bucket_id='discovery-legacy' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy discovery_legacy_insert on storage.objects for insert to authenticated
 with check (bucket_id='discovery-legacy' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy discovery_legacy_update on storage.objects for update to authenticated
 using (bucket_id='discovery-legacy' and (storage.foldername(name))[1]=(select auth.uid())::text)
 with check (bucket_id='discovery-legacy' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy discovery_legacy_delete on storage.objects for delete to authenticated
 using (bucket_id='discovery-legacy' and (storage.foldername(name))[1]=(select auth.uid())::text);
