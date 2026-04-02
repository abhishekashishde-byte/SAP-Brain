-- ============================================================
-- Wani — RAG Memory Tables
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ============================================================

-- 1. Enable pgvector extension (needed for future vector search)
--    Safe to run even if already enabled.
create extension if not exists vector;

-- ============================================================
-- 2. sap_memories — stores extracted SAP facts per user
-- ============================================================
create table if not exists public.sap_memories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  conv_id     uuid,                          -- optional: which conversation this came from
  module      text,                          -- e.g. "PM – Plant Maintenance"
  topic       text,                          -- e.g. "Maintenance Orders"
  fact        text not null,                 -- the extracted SAP fact string
  embedding   vector(1536),                  -- populated later by Edge Function (OpenAI ada-002)
  created_at  timestamptz default now()
);

-- Index for fast per-user queries
create index if not exists idx_sap_memories_user_id
  on public.sap_memories (user_id);

-- Index for module filtering
create index if not exists idx_sap_memories_module
  on public.sap_memories (user_id, module);

-- Full-text index for keyword recall (phase 1 — before embeddings)
create index if not exists idx_sap_memories_fact_text
  on public.sap_memories using gin (to_tsvector('english', fact));

-- ── Row Level Security ────────────────────────────────────────
alter table public.sap_memories enable row level security;

-- Users can only see their own memories
create policy "Users read own memories"
  on public.sap_memories for select
  using (auth.uid() = user_id);

-- Only service role (server-side API) can insert/update/delete
-- (Brain.jsx never touches this table directly — only /api/extract does)
create policy "Service role full access"
  on public.sap_memories for all
  using (auth.role() = 'service_role');

-- ============================================================
-- 3. external_api_log — usage tracking for Klarix API calls
-- ============================================================
create table if not exists public.external_api_log (
  id            uuid primary key default gen_random_uuid(),
  model         text,          -- 'claude' or 'groq'
  module        text,
  topic         text,
  message_count int,
  created_at    timestamptz default now()
);

-- Only service role writes to this — no RLS needed for now
-- (it has no user_id, just aggregate usage data)

-- ============================================================
-- 4. (Optional) pgvector similarity search function
--    Uncomment and run AFTER you have embeddings populated.
-- ============================================================

-- create or replace function match_sap_memories(
--   query_embedding vector(1536),
--   match_user_id   uuid,
--   match_threshold float default 0.75,
--   match_count     int   default 6
-- )
-- returns table (id uuid, fact text, module text, similarity float)
-- language sql stable
-- as $$
--   select
--     id,
--     fact,
--     module,
--     1 - (embedding <=> query_embedding) as similarity
--   from public.sap_memories
--   where
--     user_id = match_user_id
--     and embedding is not null
--     and 1 - (embedding <=> query_embedding) > match_threshold
--   order by embedding <=> query_embedding
--   limit match_count;
-- $$;
