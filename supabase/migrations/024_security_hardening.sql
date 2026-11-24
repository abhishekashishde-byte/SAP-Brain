-- Security hardening (2026-11-24)
-- Safe to run more than once. Each block is skipped if its table does not exist.
--
-- 1. Tables only the server (service role) uses: RLS on, no policies → the public
--    anon key and logged-in users cannot read or write them at all.
-- 2. approved_emails: a user may only see whether THEIR OWN email is approved; nobody
--    except the server can add, change or remove approvals.
-- 3. Per-user tables the browser reads: RLS on, and each user only reaches their own rows.

do $$
declare t text;
begin
  -- 1. Server-only tables
  foreach t in array array['waitlist','external_api_log','approved_emails_paused'] loop
    if to_regclass('public.'||t) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('revoke all on public.%I from anon, authenticated', t);
    end if;
  end loop;

  -- 2. approved_emails
  if to_regclass('public.approved_emails') is not null then
    alter table public.approved_emails enable row level security;
    revoke insert, update, delete on public.approved_emails from anon, authenticated;
    drop policy if exists approved_emails_read_own on public.approved_emails;
    create policy approved_emails_read_own on public.approved_emails
      for select to authenticated
      using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
  end if;

  -- 3. Conversations: owner only
  if to_regclass('public.sap_conversations') is not null then
    alter table public.sap_conversations enable row level security;
    revoke all on public.sap_conversations from anon;
    drop policy if exists sap_conversations_owner on public.sap_conversations;
    create policy sap_conversations_owner on public.sap_conversations
      for all to authenticated
      using (user_id = (select auth.uid()))
      with check (user_id = (select auth.uid()));
  end if;

  -- 3. Profiles: owner only (admin dashboard reads them with the service role)
  if to_regclass('public.profiles') is not null then
    alter table public.profiles enable row level security;
    revoke all on public.profiles from anon;
    drop policy if exists profiles_owner on public.profiles;
    create policy profiles_owner on public.profiles
      for all to authenticated
      using (id = (select auth.uid()))
      with check (id = (select auth.uid()));
  end if;
end $$;

notify pgrst, 'reload schema';

-- 4. Upload types enforced by storage itself, not only by the browser.
update storage.buckets
   set allowed_mime_types = array['text/plain','text/vtt','application/vnd.openxmlformats-officedocument.wordprocessingml.document','audio/mpeg','audio/mp4','audio/wav'],
       file_size_limit = 20971520
 where id = 'discovery-transcripts';
update storage.buckets
   set allowed_mime_types = array['application/pdf','text/plain','application/vnd.openxmlformats-officedocument.wordprocessingml.document']
 where id = 'discovery-legacy';
