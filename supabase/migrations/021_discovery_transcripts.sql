-- Addendum 04 P4-4: consent-gated private transcripts and review-only suggestions.
create table public.discovery_transcripts (
 id uuid primary key default gen_random_uuid(),
 workshop_id uuid not null references public.discovery_workshops(id) on delete cascade,
 consent_given_at timestamptz not null,consent_text text not null check(length(trim(consent_text))>0),
 file_path text,audio_path text,transcript_text text,
 status text not null default 'uploaded' check(status in ('uploaded','transcribing','ready','analysed','failed')),
 delete_after date,created_at timestamptz not null default now()
);
create table public.discovery_transcript_suggestions (
 id uuid primary key default gen_random_uuid(),
 transcript_id uuid not null references public.discovery_transcripts(id) on delete cascade,
 workshop_id uuid not null references public.discovery_workshops(id) on delete cascade,
 kind text not null,target_ref text,payload jsonb not null,
 quote text,ts text,confidence text check(confidence in ('low','medium','high')),
 status text not null default 'pending' check(status in ('pending','accepted','edited','rejected')),
 created_at timestamptz not null default now()
);
create index discovery_transcripts_workshop_idx on public.discovery_transcripts(workshop_id);
create index discovery_transcript_suggestions_workshop_idx on public.discovery_transcript_suggestions(workshop_id,transcript_id);
alter table public.discovery_transcripts enable row level security;
alter table public.discovery_transcript_suggestions enable row level security;
create policy discovery_transcripts_owner on public.discovery_transcripts for all to authenticated
 using(exists(select 1 from public.discovery_workshops w where w.id=workshop_id and w.owner_id=(select auth.uid())))
 with check(exists(select 1 from public.discovery_workshops w where w.id=workshop_id and w.owner_id=(select auth.uid())));
create policy discovery_transcript_suggestions_owner on public.discovery_transcript_suggestions for all to authenticated
 using(exists(select 1 from public.discovery_workshops w where w.id=workshop_id and w.owner_id=(select auth.uid())))
 with check(exists(select 1 from public.discovery_workshops w where w.id=workshop_id and w.owner_id=(select auth.uid())));
grant select,insert,update,delete on public.discovery_transcripts,public.discovery_transcript_suggestions to authenticated;
insert into storage.buckets(id,name,public,file_size_limit) values('discovery-transcripts','discovery-transcripts',false,20971520)
 on conflict(id) do update set public=false,file_size_limit=20971520;
create policy discovery_transcripts_storage_read on storage.objects for select to authenticated
 using(bucket_id='discovery-transcripts' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy discovery_transcripts_storage_insert on storage.objects for insert to authenticated
 with check(bucket_id='discovery-transcripts' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy discovery_transcripts_storage_delete on storage.objects for delete to authenticated
 using(bucket_id='discovery-transcripts' and (storage.foldername(name))[1]=(select auth.uid())::text);
