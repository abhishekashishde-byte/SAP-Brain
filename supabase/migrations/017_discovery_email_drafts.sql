-- Addendum 03 P3-4: private follow-up email drafts.
create table public.discovery_email_drafts (
 id uuid primary key default gen_random_uuid(),
 workshop_id uuid not null references public.discovery_workshops(id) on delete cascade,
 language text not null default 'en' check(language in ('en','de')),
 subject text,body text,model text,created_at timestamptz not null default now()
);
create index discovery_email_drafts_workshop_idx on public.discovery_email_drafts(workshop_id,created_at desc);
alter table public.discovery_email_drafts enable row level security;
create policy discovery_email_drafts_owner on public.discovery_email_drafts for all to authenticated
 using (exists(select 1 from public.discovery_workshops w where w.id=workshop_id and w.owner_id=(select auth.uid())))
 with check (exists(select 1 from public.discovery_workshops w where w.id=workshop_id and w.owner_id=(select auth.uid())));
grant select,insert,update,delete on public.discovery_email_drafts to authenticated;
