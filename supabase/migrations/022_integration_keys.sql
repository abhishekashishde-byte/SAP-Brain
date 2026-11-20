-- Connection keys let another app the user owns (first: Ana) send meeting transcripts into Wani.
-- Only a SHA-256 hash is stored; the key itself is shown once when it is created.
create table if not exists public.wani_integration_keys (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 label text not null default 'Ana' check (length(trim(label)) > 0),
 key_prefix text not null,
 key_hash text not null unique,
 created_at timestamptz not null default now(),
 last_used_at timestamptz,
 revoked_at timestamptz
);
create index if not exists wani_integration_keys_user_idx on public.wani_integration_keys(user_id);
alter table public.wani_integration_keys enable row level security;
-- Users may see their own keys (never the hash, which only the server reads). Create and revoke go through the API.
create policy wani_integration_keys_owner_read on public.wani_integration_keys for select to authenticated
 using (user_id = (select auth.uid()));
revoke all on public.wani_integration_keys from anon, authenticated;
grant select (id, label, key_prefix, created_at, last_used_at, revoked_at) on public.wani_integration_keys to authenticated;

-- Where a transcript came from, so Ana meetings are labelled and the same meeting is not imported twice.
alter table public.discovery_transcripts
 add column if not exists source text not null default 'upload',
 add column if not exists source_title text,
 add column if not exists source_ref text,
 add column if not exists source_started_at timestamptz;
create unique index if not exists discovery_transcripts_source_ref_idx
 on public.discovery_transcripts(workshop_id, source, source_ref) where source_ref is not null;
