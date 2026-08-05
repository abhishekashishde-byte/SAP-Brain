-- Wani — admin review and global knowledge promotion
--
-- Local knowledge remains owned by its user. An administrator may either:
--   * approve it: create a protected global copy, log the decision, then delete local;
--   * keep it local: mark it reviewed/rejected for global use without changing its text.
--
-- Global knowledge is readable by authenticated users but writable only through
-- service-role server code. Vault is deliberately untouched.

begin;

-- Track whether each local entry still needs an admin decision.
alter table public.wani_knowledge
  add column if not exists admin_review_status text not null default 'pending',
  add column if not exists admin_reviewed_at timestamptz,
  add column if not exists admin_reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists admin_review_note text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.wani_knowledge'::regclass
      and conname = 'wani_knowledge_admin_review_status_check'
  ) then
    alter table public.wani_knowledge
      add constraint wani_knowledge_admin_review_status_check
      check (admin_review_status in ('pending', 'rejected'));
  end if;
end
$$;

create index if not exists idx_wani_knowledge_pending_review
  on public.wani_knowledge (created_at desc)
  where admin_review_status = 'pending';

-- Read-only knowledge shared with every authenticated Wani user.
create table if not exists public.wani_global_knowledge (
  id uuid primary key default gen_random_uuid(),
  source_local_knowledge_id uuid,
  source_user_id uuid references auth.users(id) on delete set null,
  module text,
  topic text,
  object text,
  finding text not null,
  confidence text not null default 'verified',
  embedding vector(1536),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  active boolean not null default true
);

create index if not exists idx_wani_global_knowledge_active
  on public.wani_global_knowledge (approved_at desc)
  where active = true;

create index if not exists idx_wani_global_knowledge_embedding
  on public.wani_global_knowledge using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

alter table public.wani_global_knowledge enable row level security;

revoke all on table public.wani_global_knowledge
  from public, anon, authenticated;

grant select on table public.wani_global_knowledge
  to authenticated;

grant all on table public.wani_global_knowledge
  to service_role;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'wani_global_knowledge'
      and policyname = 'Authenticated users read active global knowledge'
  ) then
    create policy "Authenticated users read active global knowledge"
      on public.wani_global_knowledge
      for select
      to authenticated
      using (active = true);
  end if;
end
$$;

-- Permanent audit trail. It survives deletion of an approved local row.
create table if not exists public.wani_knowledge_review_log (
  id uuid primary key default gen_random_uuid(),
  local_knowledge_id uuid not null,
  source_user_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('approved', 'rejected')),
  original_module text,
  original_topic text,
  original_object text,
  original_finding text not null,
  final_module text,
  final_topic text,
  final_object text,
  final_finding text,
  global_knowledge_id uuid references public.wani_global_knowledge(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz not null default now(),
  review_note text
);

create unique index if not exists idx_wani_knowledge_review_once
  on public.wani_knowledge_review_log (local_knowledge_id);

alter table public.wani_knowledge_review_log enable row level security;

revoke all on table public.wani_knowledge_review_log
  from public, anon, authenticated;

grant all on table public.wani_knowledge_review_log
  to service_role;

-- Admin queue with submitter email. Service-role only; normal users cannot call it.
create or replace function public.admin_list_wani_knowledge_reviews()
returns table (
  id uuid,
  user_id uuid,
  user_email text,
  module text,
  topic text,
  object text,
  finding text,
  confidence text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select
    k.id,
    k.user_id,
    u.email::text,
    k.module,
    k.topic,
    k.object,
    k.finding,
    k.confidence,
    k.created_at
  from public.wani_knowledge k
  left join auth.users u on u.id = k.user_id
  where k.admin_review_status = 'pending'
  order by k.created_at asc;
$$;

revoke all on function public.admin_list_wani_knowledge_reviews()
  from public, anon, authenticated;

grant execute on function public.admin_list_wani_knowledge_reviews()
  to service_role;

-- One transaction performs the entire admin decision.
create or replace function public.admin_review_wani_knowledge(
  p_local_id uuid,
  p_action text,
  p_reviewer_id uuid,
  p_module text default null,
  p_topic text default null,
  p_object text default null,
  p_finding text default null,
  p_note text default null,
  p_embedding vector default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_local public.wani_knowledge%rowtype;
  v_global_id uuid;
  v_module text;
  v_topic text;
  v_object text;
  v_finding text;
begin
  if p_action not in ('approve', 'reject') then
    raise exception 'Invalid review action' using errcode = '22023';
  end if;

  if p_reviewer_id is null then
    raise exception 'Reviewer is required' using errcode = '22023';
  end if;

  select *
    into v_local
    from public.wani_knowledge
   where id = p_local_id
     and admin_review_status = 'pending'
   for update;

  if not found then
    raise exception 'Knowledge entry is missing or already reviewed' using errcode = 'P0002';
  end if;

  if p_action = 'reject' then
    update public.wani_knowledge
       set admin_review_status = 'rejected',
           admin_reviewed_at = now(),
           admin_reviewed_by = p_reviewer_id,
           admin_review_note = nullif(btrim(p_note), '')
     where id = p_local_id;

    insert into public.wani_knowledge_review_log (
      local_knowledge_id, source_user_id, action,
      original_module, original_topic, original_object, original_finding,
      final_module, final_topic, final_object, final_finding,
      reviewed_by, review_note
    ) values (
      v_local.id, v_local.user_id, 'rejected',
      v_local.module, v_local.topic, v_local.object, v_local.finding,
      v_local.module, v_local.topic, v_local.object, v_local.finding,
      p_reviewer_id, nullif(btrim(p_note), '')
    );

    return jsonb_build_object('action', 'rejected', 'local_id', v_local.id);
  end if;

  v_module := coalesce(nullif(btrim(p_module), ''), v_local.module);
  v_topic := coalesce(nullif(btrim(p_topic), ''), v_local.topic);
  v_object := coalesce(nullif(btrim(p_object), ''), v_local.object);
  v_finding := coalesce(nullif(btrim(p_finding), ''), v_local.finding);

  if v_finding is null or length(v_finding) < 3 then
    raise exception 'A global finding is required' using errcode = '22023';
  end if;

  insert into public.wani_global_knowledge (
    source_local_knowledge_id,
    source_user_id,
    module,
    topic,
    object,
    finding,
    confidence,
    embedding,
    approved_by
  ) values (
    v_local.id,
    v_local.user_id,
    v_module,
    v_topic,
    v_object,
    v_finding,
    coalesce(v_local.confidence, 'verified'),
    coalesce(p_embedding, v_local.embedding),
    p_reviewer_id
  )
  returning id into v_global_id;

  insert into public.wani_knowledge_review_log (
    local_knowledge_id, source_user_id, action,
    original_module, original_topic, original_object, original_finding,
    final_module, final_topic, final_object, final_finding,
    global_knowledge_id, reviewed_by, review_note
  ) values (
    v_local.id, v_local.user_id, 'approved',
    v_local.module, v_local.topic, v_local.object, v_local.finding,
    v_module, v_topic, v_object, v_finding,
    v_global_id, p_reviewer_id, nullif(btrim(p_note), '')
  );

  delete from public.wani_knowledge where id = v_local.id;

  return jsonb_build_object(
    'action', 'approved',
    'local_id', v_local.id,
    'global_id', v_global_id
  );
end;
$$;

revoke all on function public.admin_review_wani_knowledge(
  uuid, text, uuid, text, text, text, text, text, vector
) from public, anon, authenticated;

grant execute on function public.admin_review_wani_knowledge(
  uuid, text, uuid, text, text, text, text, text, vector
) to service_role;

-- Replace user-scoped semantic retrieval so Wani searches the user's local
-- knowledge and the protected global knowledge in one ranked result set.
drop function if exists public.match_wani_knowledge(
  vector,
  double precision,
  integer
);

create function public.match_wani_knowledge(
  query_embedding vector,
  match_threshold double precision default 0.45,
  match_count integer default 5
)
returns table (
  id uuid,
  module text,
  topic text,
  object text,
  finding text,
  confidence text,
  similarity double precision,
  knowledge_scope text
)
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  with candidates as (
    select
      k.id,
      k.module,
      k.topic,
      k.object,
      k.finding,
      k.confidence,
      (1 - (k.embedding <=> query_embedding))::double precision as similarity,
      'local'::text as knowledge_scope
    from public.wani_knowledge k
    where auth.uid() is not null
      and k.user_id = auth.uid()
      and k.embedding is not null

    union all

    select
      g.id,
      g.module,
      g.topic,
      g.object,
      g.finding,
      g.confidence,
      (1 - (g.embedding <=> query_embedding))::double precision as similarity,
      'global'::text as knowledge_scope
    from public.wani_global_knowledge g
    where auth.uid() is not null
      and g.active = true
      and g.embedding is not null
  )
  select
    c.id,
    c.module,
    c.topic,
    c.object,
    c.finding,
    c.confidence,
    c.similarity,
    c.knowledge_scope
  from candidates c
  where c.similarity >= match_threshold
  order by c.similarity desc
  limit least(greatest(match_count, 1), 20);
$$;

revoke all on function public.match_wani_knowledge(
  vector,
  double precision,
  integer
) from public, anon;

grant execute on function public.match_wani_knowledge(
  vector,
  double precision,
  integer
) to authenticated, service_role;

commit;
