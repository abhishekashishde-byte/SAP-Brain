-- Code library: consultant-saved program analyses Wani can reuse later.
-- One row per saved program. `summary` always holds the reusable logic
-- (problem, approach, objects, when to use, standard alternative, S/4 notes).
-- `code` is optional: only stored when the consultant ticks "also keep full code".
-- No client/project name column by design.
create table if not exists public.code_library (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  language text not null default 'ABAP',
  summary jsonb not null,
  documentation text,
  test_cases jsonb,
  code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists code_library_owner_idx on public.code_library(owner_id, created_at desc);
alter table public.code_library enable row level security;
drop policy if exists code_library_owner on public.code_library;
create policy code_library_owner on public.code_library for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
grant select, insert, update, delete on public.code_library to authenticated;
