-- Addendum 04 P4-2: owner-only reusable templates, never cross-user shared.
create table public.discovery_templates(
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id) on delete cascade,
 name text not null,tags text[] not null default '{}',content jsonb not null,
 source_workshop_id uuid references public.discovery_workshops(id) on delete set null,
 created_at timestamptz not null default now()
);
create index discovery_templates_owner_idx on public.discovery_templates(owner_id,created_at desc);
alter table public.discovery_templates enable row level security;
create policy discovery_templates_owner on public.discovery_templates for all to authenticated
 using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
grant select,insert,update,delete on public.discovery_templates to authenticated;
