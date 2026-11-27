-- Code workspace: every analysed program is kept (owner-only) so the consultant can
-- come back, ask further questions or delete it. Only rows with in_library = true are
-- reusable library entries that chat may suggest. Existing rows were all saved to the
-- library on purpose, so they default to true.
alter table public.code_library add column if not exists in_library boolean not null default true;
create index if not exists code_library_owner_updated_idx on public.code_library(owner_id, updated_at desc);
