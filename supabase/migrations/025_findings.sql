-- Findings: solved investigations / tickets the consultant wants Wani to keep and reuse.
-- Each finding gets the consultant's next number (10000001, 10000002, …) and a date.
-- Wani retrieves matching findings for later questions (embedding search, owner only).
create extension if not exists vector;

create table if not exists public.wani_findings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  number bigint not null,
  found_on date not null default current_date,
  ticket_ref text,                         -- the customer's own ticket / incident number, optional
  title text not null check (length(trim(title)) > 0),
  module text,
  problem text,                            -- symptom as the user saw it
  investigation text,                      -- the steps, kept as written
  root_cause text,
  solution text,                           -- fix / workaround; empty if not found yet
  sap_objects text[] not null default '{}',-- apps, OData services, CDS views, T-codes, tables, auth objects …
  status text not null default 'solved' check (status in ('solved', 'root_cause_found', 'open')),
  source text not null default 'chat' check (source in ('chat', 'manual')),
  embedding vector(1536),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, number)
);
create index if not exists wani_findings_owner_idx on public.wani_findings(owner_id, number desc);

-- Next number per consultant, starting at 10000001.
create or replace function public.wani_findings_number()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.number is null then
    perform pg_advisory_xact_lock(hashtext('wani_findings:' || new.owner_id::text));
    select coalesce(max(number), 10000000) + 1 into new.number from public.wani_findings where owner_id = new.owner_id;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists wani_findings_number on public.wani_findings;
create trigger wani_findings_number before insert on public.wani_findings
  for each row execute function public.wani_findings_number();

create or replace function public.wani_findings_touch()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); new.number := old.number; new.owner_id := old.owner_id; return new; end $$;
drop trigger if exists wani_findings_touch on public.wani_findings;
create trigger wani_findings_touch before update on public.wani_findings
  for each row execute function public.wani_findings_touch();

alter table public.wani_findings enable row level security;
drop policy if exists wani_findings_owner on public.wani_findings;
create policy wani_findings_owner on public.wani_findings for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
grant select, insert, update, delete on public.wani_findings to authenticated;

-- Similarity search over the caller's own findings (runs with the caller's rights, so RLS applies).
create or replace function public.match_wani_findings(query_embedding vector(1536), match_count int default 3)
returns table (id uuid, number bigint, found_on date, ticket_ref text, title text, module text, problem text,
               investigation text, root_cause text, solution text, sap_objects text[], status text, similarity float)
language sql stable security invoker set search_path = public, extensions as $$
  select f.id, f.number, f.found_on, f.ticket_ref, f.title, f.module, f.problem, f.investigation, f.root_cause,
         f.solution, f.sap_objects, f.status, 1 - (f.embedding <=> query_embedding) as similarity
  from public.wani_findings f
  where f.embedding is not null and f.owner_id = auth.uid()
  order by f.embedding <=> query_embedding
  limit greatest(1, least(match_count, 10))
$$;
revoke all on function public.match_wani_findings(vector, int) from public, anon;
grant execute on function public.match_wani_findings(vector, int) to authenticated;
