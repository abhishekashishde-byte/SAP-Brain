-- Addendum 02, additive first-call essentials.
create table public.discovery_stakeholders (
 id uuid primary key default gen_random_uuid(),workshop_id uuid not null references public.discovery_workshops(id) on delete cascade,
 name text not null,organisation text check(organisation in ('client','consultant','partner','vendor')),
 function_role text,project_role text check(project_role in ('sponsor','decision_maker','process_owner','key_user','end_user','it','finance','purchasing','other')),
 responsible_for text[] not null default '{}',present boolean not null default false,contact text,note text,is_internal boolean not null default false,
 sort_order int not null default 0,updated_at timestamptz not null default now());

create table public.discovery_drivers (
 id uuid primary key default gen_random_uuid(),workshop_id uuid not null references public.discovery_workshops(id) on delete cascade,
 kind text not null check(kind in ('pain','goal')),text text not null,priority text not null default 'should' check(priority in ('must','should','could')),
 raised_by uuid references public.discovery_stakeholders(id) on delete set null,affected text[] not null default '{}',kpi text,baseline text,note text,
 sort_order int not null default 0,updated_at timestamptz not null default now());

create table public.discovery_sizing (
 workshop_id uuid not null references public.discovery_workshops(id) on delete cascade,
 metric_id text not null,value numeric,approx boolean not null default false,source text check(source in ('client','export','estimate')),
 custom_label text,custom_unit text,note text,updated_at timestamptz not null default now(), primary key(workshop_id,metric_id));

create table public.discovery_requests (
 id uuid primary key default gen_random_uuid(),workshop_id uuid not null references public.discovery_workshops(id) on delete cascade,
 item text not null,related_id text,format text check(format in ('excel','csv','pdf','screenshot','sample_print','access_db','other')),
 from_stakeholder uuid references public.discovery_stakeholders(id) on delete set null,due_date date,
 status text not null default 'open' check(status in ('open','received','not_available')),note text,updated_at timestamptz not null default now());

create table public.discovery_parking (
 id uuid primary key default gen_random_uuid(),workshop_id uuid not null references public.discovery_workshops(id) on delete cascade,
 text text not null,context_id text,status text not null default 'parked' check(status in ('parked','discussed','moved','dropped')),
 todo_id uuid references public.discovery_todos(id) on delete set null,note text,created_at timestamptz not null default now());
create index discovery_stakeholders_workshop_idx on public.discovery_stakeholders(workshop_id);
alter table public.discovery_stakeholders enable row level security;
create policy discovery_stakeholders_owner on public.discovery_stakeholders for all to authenticated using (exists(select 1 from public.discovery_workshops w where w.id=workshop_id and w.owner_id=(select auth.uid()))) with check(exists(select 1 from public.discovery_workshops w where w.id=workshop_id and w.owner_id=(select auth.uid())));
grant select,insert,update,delete on public.discovery_stakeholders to authenticated;

create index discovery_drivers_workshop_idx on public.discovery_drivers(workshop_id);
alter table public.discovery_drivers enable row level security;
create policy discovery_drivers_owner on public.discovery_drivers for all to authenticated using (exists(select 1 from public.discovery_workshops w where w.id=workshop_id and w.owner_id=(select auth.uid()))) with check(exists(select 1 from public.discovery_workshops w where w.id=workshop_id and w.owner_id=(select auth.uid())));
grant select,insert,update,delete on public.discovery_drivers to authenticated;

create index discovery_sizing_workshop_idx on public.discovery_sizing(workshop_id);
alter table public.discovery_sizing enable row level security;
create policy discovery_sizing_owner on public.discovery_sizing for all to authenticated using (exists(select 1 from public.discovery_workshops w where w.id=workshop_id and w.owner_id=(select auth.uid()))) with check(exists(select 1 from public.discovery_workshops w where w.id=workshop_id and w.owner_id=(select auth.uid())));
grant select,insert,update,delete on public.discovery_sizing to authenticated;

create index discovery_requests_workshop_idx on public.discovery_requests(workshop_id);
alter table public.discovery_requests enable row level security;
create policy discovery_requests_owner on public.discovery_requests for all to authenticated using (exists(select 1 from public.discovery_workshops w where w.id=workshop_id and w.owner_id=(select auth.uid()))) with check(exists(select 1 from public.discovery_workshops w where w.id=workshop_id and w.owner_id=(select auth.uid())));
grant select,insert,update,delete on public.discovery_requests to authenticated;

create index discovery_parking_workshop_idx on public.discovery_parking(workshop_id);
alter table public.discovery_parking enable row level security;
create policy discovery_parking_owner on public.discovery_parking for all to authenticated using (exists(select 1 from public.discovery_workshops w where w.id=workshop_id and w.owner_id=(select auth.uid()))) with check(exists(select 1 from public.discovery_workshops w where w.id=workshop_id and w.owner_id=(select auth.uid())));
grant select,insert,update,delete on public.discovery_parking to authenticated;
