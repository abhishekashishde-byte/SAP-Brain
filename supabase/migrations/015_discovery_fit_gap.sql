-- Addendum 03 P3-1: fit-gap and deliberately ignored suggestions.
create table public.discovery_gaps (
 id uuid primary key default gen_random_uuid(),workshop_id uuid not null references public.discovery_workshops(id) on delete cascade,
 seq int not null check(seq>0),title text not null,description text,related_id text,
 origin text not null default 'manual' check(origin in ('manual','clarify_field','open_decision','extra_field','process','legacy_hint','ai','interface','form_report')),
 origin_ref text, gap_type text check(gap_type in ('fit','configuration','workaround','development','org_change','out_of_scope')),
 ricefw text check(ricefw in ('report','interface','conversion','enhancement','form','workflow')),
 size text check(size in ('S','M','L','XL')),priority text check(priority in ('must','should','could')),
 owner text,owner_stakeholder uuid references public.discovery_stakeholders(id) on delete set null,
 status text not null default 'open' check(status in ('open','analysing','agreed','rejected','done')),
 solution_idea text,note text,is_internal_solution boolean not null default true,updated_at timestamptz not null default now(),
 unique(workshop_id,seq));
create table public.discovery_gap_ignored (
 workshop_id uuid not null references public.discovery_workshops(id) on delete cascade,origin text not null,origin_ref text not null,
 primary key(workshop_id,origin,origin_ref));
create index discovery_gaps_workshop_idx on public.discovery_gaps(workshop_id);
alter table public.discovery_gaps enable row level security;
create policy discovery_gaps_owner on public.discovery_gaps for all to authenticated using (exists(select 1 from public.discovery_workshops w where w.id=workshop_id and w.owner_id=(select auth.uid()))) with check(exists(select 1 from public.discovery_workshops w where w.id=workshop_id and w.owner_id=(select auth.uid())));
grant select,insert,update,delete on public.discovery_gaps to authenticated;
create index discovery_gap_ignored_workshop_idx on public.discovery_gap_ignored(workshop_id);
alter table public.discovery_gap_ignored enable row level security;
create policy discovery_gap_ignored_owner on public.discovery_gap_ignored for all to authenticated using (exists(select 1 from public.discovery_workshops w where w.id=workshop_id and w.owner_id=(select auth.uid()))) with check(exists(select 1 from public.discovery_workshops w where w.id=workshop_id and w.owner_id=(select auth.uid())));
grant select,insert,update,delete on public.discovery_gap_ignored to authenticated;
-- Explicit solution flag on process entries remains in answers JSON as 'needs_solution'.
