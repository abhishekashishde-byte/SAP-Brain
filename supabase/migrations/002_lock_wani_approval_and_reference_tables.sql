-- Wani/SAP-Brain security hardening.
-- Deliberately does not modify vault_config, vault_folders, or vault_documents.

-- ---------------------------------------------------------------------------
-- approved_emails
-- Signed-in users may only check whether their own email is approved.
-- All writes are restricted to the service role.
-- ---------------------------------------------------------------------------
alter table public.approved_emails enable row level security;

drop policy if exists "Service role full access approved" on public.approved_emails;
drop policy if exists "approved users can check own email" on public.approved_emails;

revoke all privileges on table public.approved_emails from anon, authenticated;
grant select on table public.approved_emails to authenticated;
grant all privileges on table public.approved_emails to service_role;

create policy "approved users can check own email"
on public.approved_emails
for select
to authenticated
using (
  lower(email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
);

-- ---------------------------------------------------------------------------
-- sap_corrections
-- Global corrections are managed only by trusted server-side code.
-- ---------------------------------------------------------------------------
alter table public.sap_corrections enable row level security;

drop policy if exists "Anyone can read corrections" on public.sap_corrections;
drop policy if exists "Service key can insert" on public.sap_corrections;

revoke all privileges on table public.sap_corrections from anon, authenticated;
grant all privileges on table public.sap_corrections to service_role;

-- ---------------------------------------------------------------------------
-- SAP reference tables
-- Signed-in users may read reference data. Only the service role may modify it.
-- ---------------------------------------------------------------------------
alter table public.sap_objects enable row level security;
alter table public.sap_fields enable row level security;
alter table public.sap_relationships enable row level security;
alter table public.sap_aliases enable row level security;

revoke all privileges on table public.sap_objects from anon, authenticated;
revoke all privileges on table public.sap_fields from anon, authenticated;
revoke all privileges on table public.sap_relationships from anon, authenticated;
revoke all privileges on table public.sap_aliases from anon, authenticated;

grant select on table public.sap_objects to authenticated;
grant select on table public.sap_fields to authenticated;
grant select on table public.sap_relationships to authenticated;
grant select on table public.sap_aliases to authenticated;

grant all privileges on table public.sap_objects to service_role;
grant all privileges on table public.sap_fields to service_role;
grant all privileges on table public.sap_relationships to service_role;
grant all privileges on table public.sap_aliases to service_role;

drop policy if exists "authenticated read sap_objects" on public.sap_objects;
drop policy if exists "authenticated read sap_fields" on public.sap_fields;
drop policy if exists "authenticated read sap_relationships" on public.sap_relationships;
drop policy if exists "authenticated read sap_aliases" on public.sap_aliases;

create policy "authenticated read sap_objects"
on public.sap_objects
for select
to authenticated
using (true);

create policy "authenticated read sap_fields"
on public.sap_fields
for select
to authenticated
using (true);

create policy "authenticated read sap_relationships"
on public.sap_relationships
for select
to authenticated
using (true);

create policy "authenticated read sap_aliases"
on public.sap_aliases
for select
to authenticated
using (true);
