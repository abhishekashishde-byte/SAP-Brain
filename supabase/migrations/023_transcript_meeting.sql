-- Which meeting a transcript belongs to, when it was held and who took part.
alter table public.discovery_transcripts add column if not exists meeting_title text;
alter table public.discovery_transcripts add column if not exists meeting_date date;
alter table public.discovery_transcripts add column if not exists participants text;
