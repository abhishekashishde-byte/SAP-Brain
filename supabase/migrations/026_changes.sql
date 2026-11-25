-- Changes / Z-developments: one record per change, from requirement to test document.
-- Numbered per consultant from 20000001 (findings use 10000001…). Each step keeps its
-- own JSON so a small change can skip steps. Owner-only (row-level security).
create table if not exists public.wani_changes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  number bigint not null,
  title text not null default 'New change' check (length(trim(title)) > 0),
  module text,
  ticket_ref text,
  step text not null default 'requirement' check (step in ('requirement', 'standard', 'fs', 'code', 'tests', 'done')),
  requirement jsonb not null default '{}'::jsonb,   -- {conversation:[{role,text}], summary:{…}}
  standard jsonb not null default '{}'::jsonb,      -- {coverage:{…}, design:{…}, decision:'standard'|'custom'|'', decision_note}
  fs jsonb not null default '{}'::jsonb,            -- {meta:{…}, sections:[{title, body}]}
  code text,
  code_check jsonb not null default '{}'::jsonb,    -- {coverage:[…], s4_findings:[…], issues:[…], verdict}
  tests jsonb not null default '{}'::jsonb,         -- {regression_scope:[…], cases:[{…, result, remarks}]}
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, number)
);
create index if not exists wani_changes_owner_idx on public.wani_changes(owner_id, number desc);

create or replace function public.wani_changes_number()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.number is null then
    perform pg_advisory_xact_lock(hashtext('wani_changes:' || new.owner_id::text));
    select coalesce(max(number), 20000000) + 1 into new.number from public.wani_changes where owner_id = new.owner_id;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists wani_changes_number on public.wani_changes;
create trigger wani_changes_number before insert on public.wani_changes
  for each row execute function public.wani_changes_number();

create or replace function public.wani_changes_touch()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); new.number := old.number; new.owner_id := old.owner_id; return new; end $$;
drop trigger if exists wani_changes_touch on public.wani_changes;
create trigger wani_changes_touch before update on public.wani_changes
  for each row execute function public.wani_changes_touch();

alter table public.wani_changes enable row level security;
drop policy if exists wani_changes_owner on public.wani_changes;
create policy wani_changes_owner on public.wani_changes for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
grant select, insert, update, delete on public.wani_changes to authenticated;
