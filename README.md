# Wani v2 — SAP Knowledge Base

---

## STEP 1 — Run this SQL in Supabase (drop old tables first)

```sql
drop table if exists sap_conversations;
drop table if exists profiles;

create table sap_conversations (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null default 'New Conversation',
  module text, topic text,
  messages jsonb default '[]'::jsonb not null,
  is_summarised boolean default false,
  summary text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table sap_conversations enable row level security;
create policy "own" on sap_conversations for all using (auth.uid() = user_id);

create table profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  name text
);

alter table profiles enable row level security;
create policy "own" on profiles for all using (auth.uid() = id);
```

---

## STEP 2 — Supabase Auth settings

Authentication → Providers → Email:
- Turn OFF "Confirm email" (for easy testing)

Authentication → URL Configuration:
- Site URL: https://brain.ask-wani.com
- Redirect URLs: https://brain.ask-wani.com, https://brain.ask-wani.com/**

For Google Login (optional):
- Authentication → Providers → Google → Enable
- Add your Google OAuth Client ID and Secret
- Get from: console.cloud.google.com → APIs → Credentials

---

## STEP 3 — Vercel Environment Variables

| Variable | Value |
|---|---|
| `GROQ_API_KEY` | from console.groq.com |
| `VITE_SUPABASE_URL` | from Supabase → Settings → API |
| `VITE_SUPABASE_ANON_KEY` | from Supabase → Settings → API |
