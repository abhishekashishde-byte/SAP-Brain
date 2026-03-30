# SAP Brain v2

Premium white/gold SAP knowledge base. Magic link login, streaming responses, AI auto-categorisation, conversation history.

---

## IMPORTANT — Supabase Setup (run this first)

Open your Supabase project → SQL Editor → run this:

```sql
-- Drop old table from v1 if it exists
drop table if exists sap_conversations;

-- Conversations table
create table sap_conversations (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null default 'New Conversation',
  module text,
  topic text,
  messages jsonb default '[]'::jsonb not null,
  is_summarised boolean default false,
  summary text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table sap_conversations enable row level security;
create policy "own_conversations" on sap_conversations
  for all using (auth.uid() = user_id);

-- Profiles table
create table profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  name text,
  avatar_color text default '#B8960C'
);

alter table profiles enable row level security;
create policy "own_profile" on profiles
  for all using (auth.uid() = id);

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name)
  values (new.id, split_part(new.email, '@', 1));
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();
```

---

## Supabase Auth Setup

In Supabase → Authentication → URL Configuration:
- Site URL: `https://brain.ask-wani.com`
- Redirect URLs: add `https://brain.ask-wani.com`

---

## Vercel Environment Variables

| Variable | Value |
|---|---|
| `GROQ_API_KEY` | from console.groq.com |
| `VITE_SUPABASE_URL` | from Supabase → Settings → API |
| `VITE_SUPABASE_ANON_KEY` | from Supabase → Settings → API |

---

## Features

- Magic link login (no password)
- New conversation: pick module/topic OR let AI detect automatically
- Typing animation on all AI responses
- Conversations saved per user in Supabase
- Auto-summarise warning at 16 messages
- Search across all conversations
- User profile with name and avatar
- SAP tokenization (sensitive values masked before reaching AI)
- Premium white/gold Klarix-style design
