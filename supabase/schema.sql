-- QuizFlow database schema
-- Run this once in Supabase SQL Editor (Project → SQL Editor → New query → paste → Run).
-- Safe to re-run: every statement is idempotent (IF NOT EXISTS / OR REPLACE / DROP ... IF EXISTS).

create extension if not exists pgcrypto;

-- ============================================================
-- 1. profiles (extends auth.users) + workspaces
-- ============================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'workspace ראשי',
  created_at timestamptz not null default now()
);

create index if not exists workspaces_owner_id_idx on public.workspaces(owner_id);

-- ============================================================
-- 2. quizzes + flow (nodes / edges / theme)
-- ============================================================

create table if not exists public.quizzes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  description text,
  slug text not null unique,
  status text not null default 'draft' check (status in ('draft', 'active', 'paused')),
  allow_back boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists quizzes_workspace_id_idx on public.quizzes(workspace_id);
create index if not exists quizzes_slug_idx on public.quizzes(slug);

create table if not exists public.quiz_nodes (
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  id text not null,
  type text not null,
  position_x double precision not null default 0,
  position_y double precision not null default 0,
  data jsonb not null default '{}'::jsonb,
  primary key (quiz_id, id)
);

create table if not exists public.quiz_edges (
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  id text not null,
  source text not null,
  source_handle text,
  target text not null,
  primary key (quiz_id, id)
);

create table if not exists public.quiz_themes (
  quiz_id uuid primary key references public.quizzes(id) on delete cascade,
  logo_url text,
  avatar_url text,
  primary_color text not null default '#10b981',
  background_color text not null default '#f8fafc',
  text_color text not null default '#0f172a',
  muted_text_color text,
  background_image_url text,
  background_image_url_mobile text,
  overlay text not null default 'none' check (overlay in ('none', 'light', 'dark')),
  font_family text not null default 'assistant' check (font_family in ('assistant', 'heebo')),
  button_style text not null default 'pill' check (button_style in ('rounded', 'square', 'pill')),
  card_position text not null default 'center' check (card_position in ('center', 'right', 'left')),
  show_progress_bar boolean not null default true,
  show_question_number boolean not null default true,
  custom_css text
);

-- ============================================================
-- 3. leads + submissions
-- ============================================================

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  quiz_id uuid references public.quizzes(id) on delete set null,
  name text,
  phone text,
  email text,
  score integer not null default 0,
  category text not null default 'cold' check (category in ('hot', 'warm', 'cold')),
  status text not null default 'new' check (status in ('new', 'in_progress', 'meeting_scheduled', 'closed', 'not_relevant')),
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  assigned_to text,
  created_at timestamptz not null default now()
);

create index if not exists leads_workspace_id_idx on public.leads(workspace_id);
create index if not exists leads_quiz_id_idx on public.leads(quiz_id);

create table if not exists public.lead_status_history (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  status text not null,
  created_at timestamptz not null default now()
);

create index if not exists lead_status_history_lead_id_idx on public.lead_status_history(lead_id);

create table if not exists public.lead_notes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  text text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists lead_notes_lead_id_idx on public.lead_notes(lead_id);

create table if not exists public.quiz_submissions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  score integer not null default 0,
  category text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  created_at timestamptz not null default now()
);

create index if not exists quiz_submissions_quiz_id_idx on public.quiz_submissions(quiz_id);
create index if not exists quiz_submissions_lead_id_idx on public.quiz_submissions(lead_id);

create table if not exists public.submission_answers (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.quiz_submissions(id) on delete cascade,
  node_id text not null,
  question_title text,
  answer_label text,
  score integer not null default 0,
  param_key text
);

create index if not exists submission_answers_submission_id_idx on public.submission_answers(submission_id);

-- ============================================================
-- 4. integrations + analytics
-- ============================================================

create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  quiz_id uuid references public.quizzes(id) on delete cascade,
  kind text not null check (kind in ('webhook', 'meta_pixel', 'tiktok_pixel')),
  name text not null,
  enabled boolean not null default true,
  url text,
  secret text,
  pixel_id text,
  last_triggered_at timestamptz,
  last_status text check (last_status in ('success', 'error')),
  last_error text,
  created_at timestamptz not null default now()
);

create index if not exists integrations_workspace_id_idx on public.integrations(workspace_id);
create index if not exists integrations_quiz_id_idx on public.integrations(quiz_id);

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  event_type text not null check (event_type in ('view', 'start', 'complete')),
  utm_source text,
  created_at timestamptz not null default now()
);

create index if not exists analytics_events_quiz_id_idx on public.analytics_events(quiz_id);
create index if not exists analytics_events_created_at_idx on public.analytics_events(created_at);

-- ============================================================
-- 5. housekeeping triggers
-- ============================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists quizzes_set_updated_at on public.quizzes;
create trigger quizzes_set_updated_at
  before update on public.quizzes
  for each row execute function public.set_updated_at();

-- Auto-provision a profile + a default workspace the moment someone signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');

  insert into public.workspaces (owner_id, name)
  values (new.id, 'workspace ראשי');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Auto-log the initial status whenever a lead is created — works for both
-- authenticated owners and anonymous public quiz submissions, which is why
-- this lives in a trigger rather than requiring a public INSERT policy on
-- lead_status_history.
create or replace function public.log_initial_lead_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.lead_status_history (lead_id, status) values (new.id, new.status);
  return new;
end;
$$;

drop trigger if exists on_lead_created on public.leads;
create trigger on_lead_created
  after insert on public.leads
  for each row execute function public.log_initial_lead_status();

-- ============================================================
-- 6. Row Level Security
-- ============================================================

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.quizzes enable row level security;
alter table public.quiz_nodes enable row level security;
alter table public.quiz_edges enable row level security;
alter table public.quiz_themes enable row level security;
alter table public.leads enable row level security;
alter table public.lead_status_history enable row level security;
alter table public.lead_notes enable row level security;
alter table public.quiz_submissions enable row level security;
alter table public.submission_answers enable row level security;
alter table public.integrations enable row level security;
alter table public.analytics_events enable row level security;

-- profiles: a user can only see/edit their own profile row.
drop policy if exists "profiles_owner_select" on public.profiles;
create policy "profiles_owner_select" on public.profiles
  for select using (id = auth.uid());
drop policy if exists "profiles_owner_update" on public.profiles;
create policy "profiles_owner_update" on public.profiles
  for update using (id = auth.uid());

-- workspaces: owner-only.
drop policy if exists "workspaces_owner_all" on public.workspaces;
create policy "workspaces_owner_all" on public.workspaces
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- quizzes: workspace owner has full access; anyone (anon incl.) can read an ACTIVE quiz
-- (needed so the public /q/[slug] runtime page can load it without logging in).
drop policy if exists "quizzes_owner_all" on public.quizzes;
create policy "quizzes_owner_all" on public.quizzes
  for all using (
    exists (select 1 from public.workspaces w where w.id = quizzes.workspace_id and w.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.workspaces w where w.id = quizzes.workspace_id and w.owner_id = auth.uid())
  );
drop policy if exists "quizzes_public_read_active" on public.quizzes;
create policy "quizzes_public_read_active" on public.quizzes
  for select using (status = 'active');

-- quiz_nodes / quiz_edges / quiz_themes: same pattern, scoped through the parent quiz.
drop policy if exists "quiz_nodes_owner_all" on public.quiz_nodes;
create policy "quiz_nodes_owner_all" on public.quiz_nodes
  for all using (
    exists (
      select 1 from public.quizzes q
      join public.workspaces w on w.id = q.workspace_id
      where q.id = quiz_nodes.quiz_id and w.owner_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.quizzes q
      join public.workspaces w on w.id = q.workspace_id
      where q.id = quiz_nodes.quiz_id and w.owner_id = auth.uid()
    )
  );
drop policy if exists "quiz_nodes_public_read_active" on public.quiz_nodes;
create policy "quiz_nodes_public_read_active" on public.quiz_nodes
  for select using (
    exists (select 1 from public.quizzes q where q.id = quiz_nodes.quiz_id and q.status = 'active')
  );

drop policy if exists "quiz_edges_owner_all" on public.quiz_edges;
create policy "quiz_edges_owner_all" on public.quiz_edges
  for all using (
    exists (
      select 1 from public.quizzes q
      join public.workspaces w on w.id = q.workspace_id
      where q.id = quiz_edges.quiz_id and w.owner_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.quizzes q
      join public.workspaces w on w.id = q.workspace_id
      where q.id = quiz_edges.quiz_id and w.owner_id = auth.uid()
    )
  );
drop policy if exists "quiz_edges_public_read_active" on public.quiz_edges;
create policy "quiz_edges_public_read_active" on public.quiz_edges
  for select using (
    exists (select 1 from public.quizzes q where q.id = quiz_edges.quiz_id and q.status = 'active')
  );

drop policy if exists "quiz_themes_owner_all" on public.quiz_themes;
create policy "quiz_themes_owner_all" on public.quiz_themes
  for all using (
    exists (
      select 1 from public.quizzes q
      join public.workspaces w on w.id = q.workspace_id
      where q.id = quiz_themes.quiz_id and w.owner_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.quizzes q
      join public.workspaces w on w.id = q.workspace_id
      where q.id = quiz_themes.quiz_id and w.owner_id = auth.uid()
    )
  );
drop policy if exists "quiz_themes_public_read_active" on public.quiz_themes;
create policy "quiz_themes_public_read_active" on public.quiz_themes
  for select using (
    exists (select 1 from public.quizzes q where q.id = quiz_themes.quiz_id and q.status = 'active')
  );

-- leads / lead_status_history / lead_notes: workspace owner only for read/update/delete.
-- INSERT is also open to the public, because a lead is created by an anonymous visitor
-- filling out a public quiz — but only when quiz_id points at a real, active quiz.
drop policy if exists "leads_owner_all" on public.leads;
create policy "leads_owner_all" on public.leads
  for all using (
    exists (select 1 from public.workspaces w where w.id = leads.workspace_id and w.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.workspaces w where w.id = leads.workspace_id and w.owner_id = auth.uid())
  );
drop policy if exists "leads_public_insert" on public.leads;
create policy "leads_public_insert" on public.leads
  for insert with check (
    quiz_id is not null
    and exists (select 1 from public.quizzes q where q.id = leads.quiz_id and q.status = 'active')
  );

drop policy if exists "lead_status_history_owner_all" on public.lead_status_history;
create policy "lead_status_history_owner_all" on public.lead_status_history
  for all using (
    exists (
      select 1 from public.leads l
      join public.workspaces w on w.id = l.workspace_id
      where l.id = lead_status_history.lead_id and w.owner_id = auth.uid()
    )
  );

drop policy if exists "lead_notes_owner_all" on public.lead_notes;
create policy "lead_notes_owner_all" on public.lead_notes
  for all using (
    exists (
      select 1 from public.leads l
      join public.workspaces w on w.id = l.workspace_id
      where l.id = lead_notes.lead_id and w.owner_id = auth.uid()
    )
  );

-- quiz_submissions / submission_answers: owner reads; public (anon) can insert against an active quiz.
drop policy if exists "quiz_submissions_owner_select" on public.quiz_submissions;
create policy "quiz_submissions_owner_select" on public.quiz_submissions
  for select using (
    exists (
      select 1 from public.quizzes q
      join public.workspaces w on w.id = q.workspace_id
      where q.id = quiz_submissions.quiz_id and w.owner_id = auth.uid()
    )
  );
drop policy if exists "quiz_submissions_public_insert" on public.quiz_submissions;
create policy "quiz_submissions_public_insert" on public.quiz_submissions
  for insert with check (
    exists (select 1 from public.quizzes q where q.id = quiz_submissions.quiz_id and q.status = 'active')
  );

drop policy if exists "submission_answers_owner_select" on public.submission_answers;
create policy "submission_answers_owner_select" on public.submission_answers
  for select using (
    exists (
      select 1 from public.quiz_submissions s
      join public.quizzes q on q.id = s.quiz_id
      join public.workspaces w on w.id = q.workspace_id
      where s.id = submission_answers.submission_id and w.owner_id = auth.uid()
    )
  );
-- Nested RLS pitfall: this policy's check must read quiz_submissions, but anon
-- has no SELECT policy on that table (only the owner does), so a plain
-- subquery here would silently see zero rows and reject every insert. Route
-- the check through a SECURITY DEFINER function so it evaluates with the
-- function owner's privileges instead of the caller's — it only ever returns
-- a boolean, so no row data is exposed.
create or replace function public.is_active_quiz_submission(p_submission_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.quiz_submissions s
    join public.quizzes q on q.id = s.quiz_id
    where s.id = p_submission_id and q.status = 'active'
  );
$$;

drop policy if exists "submission_answers_public_insert" on public.submission_answers;
create policy "submission_answers_public_insert" on public.submission_answers
  for insert with check (public.is_active_quiz_submission(submission_answers.submission_id));

-- integrations: workspace owner only, never exposed publicly.
drop policy if exists "integrations_owner_all" on public.integrations;
create policy "integrations_owner_all" on public.integrations
  for all using (
    exists (select 1 from public.workspaces w where w.id = integrations.workspace_id and w.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.workspaces w where w.id = integrations.workspace_id and w.owner_id = auth.uid())
  );

-- analytics_events: owner reads; public (anon) can insert (page views / starts / completions)
-- against an active quiz — this is how the public runtime reports funnel events.
drop policy if exists "analytics_events_owner_select" on public.analytics_events;
create policy "analytics_events_owner_select" on public.analytics_events
  for select using (
    exists (
      select 1 from public.quizzes q
      join public.workspaces w on w.id = q.workspace_id
      where q.id = analytics_events.quiz_id and w.owner_id = auth.uid()
    )
  );
drop policy if exists "analytics_events_public_insert" on public.analytics_events;
create policy "analytics_events_public_insert" on public.analytics_events
  for insert with check (
    exists (select 1 from public.quizzes q where q.id = analytics_events.quiz_id and q.status = 'active')
  );

-- ============================================================
-- 7. Inbox module (מרכז שיחות) — fully additive, does not touch
--    any table/policy/trigger defined above.
-- ============================================================

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  customer_name text not null,
  customer_phone text,
  customer_email text,
  customer_avatar_url text,
  channel text not null default 'webchat' check (channel in ('whatsapp', 'webchat', 'email', 'instagram', 'messenger')),
  status text not null default 'open' check (status in ('open', 'pending', 'snoozed', 'closed')),
  assigned_to uuid references auth.users(id) on delete set null,
  tags text[] not null default '{}',
  unread_count integer not null default 0,
  last_message_at timestamptz not null default now(),
  last_message_preview text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists conversations_workspace_id_idx on public.conversations(workspace_id);
create index if not exists conversations_last_message_at_idx on public.conversations(last_message_at desc);

create table if not exists public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  sender_type text not null check (sender_type in ('customer', 'agent', 'system')),
  sender_id uuid references auth.users(id) on delete set null,
  body text,
  attachment_url text,
  attachment_type text,
  attachment_name text,
  status text not null default 'sent' check (status in ('sent', 'delivered', 'read')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists conversation_messages_conversation_id_idx on public.conversation_messages(conversation_id);
create index if not exists conversation_messages_workspace_id_idx on public.conversation_messages(workspace_id);

create table if not exists public.conversation_notes (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  text text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists conversation_notes_conversation_id_idx on public.conversation_notes(conversation_id);

create table if not exists public.quick_replies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  label text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.inbox_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  demo_live_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Keep conversations.last_message_at / preview / unread_count in sync whenever
-- a message is inserted, so the list can just order by last_message_at.
create or replace function public.on_conversation_message_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
  set
    last_message_at = new.created_at,
    last_message_preview = left(coalesce(new.body, case when new.attachment_url is not null then '📎 קובץ מצורף' else '' end), 140),
    unread_count = case when new.sender_type = 'customer' then unread_count + 1 else unread_count end
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists on_conversation_message_insert on public.conversation_messages;
create trigger on_conversation_message_insert
  after insert on public.conversation_messages
  for each row execute function public.on_conversation_message_insert();

alter table public.conversations enable row level security;
alter table public.conversation_messages enable row level security;
alter table public.conversation_notes enable row level security;
alter table public.quick_replies enable row level security;
alter table public.inbox_settings enable row level security;

-- Everything here is an internal operator tool — owner-only, no public access.
drop policy if exists "conversations_owner_all" on public.conversations;
create policy "conversations_owner_all" on public.conversations
  for all using (
    exists (select 1 from public.workspaces w where w.id = conversations.workspace_id and w.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.workspaces w where w.id = conversations.workspace_id and w.owner_id = auth.uid())
  );

drop policy if exists "conversation_messages_owner_all" on public.conversation_messages;
create policy "conversation_messages_owner_all" on public.conversation_messages
  for all using (
    exists (select 1 from public.workspaces w where w.id = conversation_messages.workspace_id and w.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.workspaces w where w.id = conversation_messages.workspace_id and w.owner_id = auth.uid())
  );

drop policy if exists "conversation_notes_owner_all" on public.conversation_notes;
create policy "conversation_notes_owner_all" on public.conversation_notes
  for all using (
    exists (
      select 1 from public.conversations c
      join public.workspaces w on w.id = c.workspace_id
      where c.id = conversation_notes.conversation_id and w.owner_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.conversations c
      join public.workspaces w on w.id = c.workspace_id
      where c.id = conversation_notes.conversation_id and w.owner_id = auth.uid()
    )
  );

drop policy if exists "quick_replies_owner_all" on public.quick_replies;
create policy "quick_replies_owner_all" on public.quick_replies
  for all using (
    exists (select 1 from public.workspaces w where w.id = quick_replies.workspace_id and w.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.workspaces w where w.id = quick_replies.workspace_id and w.owner_id = auth.uid())
  );

drop policy if exists "inbox_settings_owner_all" on public.inbox_settings;
create policy "inbox_settings_owner_all" on public.inbox_settings
  for all using (
    exists (select 1 from public.workspaces w where w.id = inbox_settings.workspace_id and w.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.workspaces w where w.id = inbox_settings.workspace_id and w.owner_id = auth.uid())
  );

-- Turn on Realtime (Postgres change feed) for the two tables the Inbox UI
-- needs to live-update on. Safe to re-run: skips if already added.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversations'
  ) then
    alter publication supabase_realtime add table public.conversations;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversation_messages'
  ) then
    alter publication supabase_realtime add table public.conversation_messages;
  end if;
end $$;

-- ============================================================
-- 8. Quiz tracking (Meta Pixel/CAPI + GTM) — additive only, does
--    not touch any table/policy/trigger defined above.
-- ============================================================

-- Non-secret settings: safe for the owner's dashboard AND the public
-- runtime (for an active quiz) to read directly.
create table if not exists public.quiz_tracking_settings (
  quiz_id uuid primary key references public.quizzes(id) on delete cascade,
  meta_pixel_id text,
  meta_has_token boolean not null default false,
  meta_last_test_status text not null default 'untested' check (meta_last_test_status in ('untested', 'success', 'error')),
  meta_last_test_error text,
  meta_last_test_at timestamptz,
  gtm_container_id text,
  updated_at timestamptz not null default now()
);

-- The actual secret. RLS is enabled with NO policies at all below, so
-- neither anon nor an authenticated owner can read/write it directly —
-- only a server route using the service-role key can, which is the
-- only place the Conversions API call is allowed to happen from.
create table if not exists public.quiz_tracking_secrets (
  quiz_id uuid primary key references public.quizzes(id) on delete cascade,
  meta_access_token text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.quiz_tracking_events (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  name text not null check (name in ('PageView', 'Lead', 'ViewContent', 'InitiateCheckout', 'Purchase', 'CompleteRegistration', 'Custom')),
  custom_name text,
  trigger_node_id text,
  send_to_pixel boolean not null default true,
  send_to_capi boolean not null default true,
  send_to_gtm boolean not null default false,
  send_to_custom_code boolean not null default false,
  custom_code text,
  condition_field text,
  condition_operator text check (condition_operator in ('eq', 'neq', 'gt', 'gte', 'lt', 'lte')),
  condition_value text,
  value numeric,
  currency text default 'ILS',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists quiz_tracking_events_quiz_id_idx on public.quiz_tracking_events(quiz_id);

create table if not exists public.quiz_tracking_activity (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  message text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists quiz_tracking_activity_quiz_id_idx on public.quiz_tracking_activity(quiz_id);

alter table public.quiz_tracking_settings enable row level security;
alter table public.quiz_tracking_secrets enable row level security;
alter table public.quiz_tracking_events enable row level security;
alter table public.quiz_tracking_activity enable row level security;

drop policy if exists "quiz_tracking_settings_owner_all" on public.quiz_tracking_settings;
create policy "quiz_tracking_settings_owner_all" on public.quiz_tracking_settings
  for all using (
    exists (
      select 1 from public.quizzes q
      join public.workspaces w on w.id = q.workspace_id
      where q.id = quiz_tracking_settings.quiz_id and w.owner_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.quizzes q
      join public.workspaces w on w.id = q.workspace_id
      where q.id = quiz_tracking_settings.quiz_id and w.owner_id = auth.uid()
    )
  );
drop policy if exists "quiz_tracking_settings_public_read_active" on public.quiz_tracking_settings;
create policy "quiz_tracking_settings_public_read_active" on public.quiz_tracking_settings
  for select using (
    exists (select 1 from public.quizzes q where q.id = quiz_tracking_settings.quiz_id and q.status = 'active')
  );

-- quiz_tracking_secrets: deliberately NO policies — default-deny for
-- every role. Only the service-role key (which bypasses RLS) can touch it.

drop policy if exists "quiz_tracking_events_owner_all" on public.quiz_tracking_events;
create policy "quiz_tracking_events_owner_all" on public.quiz_tracking_events
  for all using (
    exists (
      select 1 from public.quizzes q
      join public.workspaces w on w.id = q.workspace_id
      where q.id = quiz_tracking_events.quiz_id and w.owner_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.quizzes q
      join public.workspaces w on w.id = q.workspace_id
      where q.id = quiz_tracking_events.quiz_id and w.owner_id = auth.uid()
    )
  );
drop policy if exists "quiz_tracking_events_public_read_active" on public.quiz_tracking_events;
create policy "quiz_tracking_events_public_read_active" on public.quiz_tracking_events
  for select using (
    exists (select 1 from public.quizzes q where q.id = quiz_tracking_events.quiz_id and q.status = 'active')
  );

drop policy if exists "quiz_tracking_activity_owner_all" on public.quiz_tracking_activity;
create policy "quiz_tracking_activity_owner_all" on public.quiz_tracking_activity
  for all using (
    exists (
      select 1 from public.quizzes q
      join public.workspaces w on w.id = q.workspace_id
      where q.id = quiz_tracking_activity.quiz_id and w.owner_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.quizzes q
      join public.workspaces w on w.id = q.workspace_id
      where q.id = quiz_tracking_activity.quiz_id and w.owner_id = auth.uid()
    )
  );

-- ============================================================
-- 9. Live quiz sessions (in-progress + finished, for the מרכז שיחות
--    live-tracking view: who's on which question right now, who dropped
--    off, who completed). Writes only happen through a server route using
--    the admin client, so this table has zero anon-facing policies.
-- ============================================================

create table if not exists public.quiz_sessions (
  id text primary key,
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  quiz_name text not null default '',
  step_index integer not null default 0,
  total_steps integer not null default 0,
  current_node_id text,
  current_node_title text,
  status text not null default 'active' check (status in ('active', 'completed')),
  name text,
  phone text,
  email text,
  score integer not null default 0,
  category text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  answers jsonb not null default '[]'::jsonb,
  is_demo boolean not null default false,
  started_at timestamptz not null default now(),
  last_event_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists quiz_sessions_workspace_id_idx on public.quiz_sessions(workspace_id);
create index if not exists quiz_sessions_last_event_at_idx on public.quiz_sessions(last_event_at desc);

alter table public.quiz_sessions enable row level security;

-- owner has full CRUD on their own workspace's sessions (read the live
-- list, delete demo data, and write demo-simulated sessions directly from
-- the dashboard). Real visitor sessions are written by the untrusted
-- public runtime through /api/quiz-sessions/track using the admin client,
-- which bypasses RLS entirely — there is intentionally no anon policy here.
drop policy if exists "quiz_sessions_owner_all" on public.quiz_sessions;
create policy "quiz_sessions_owner_all" on public.quiz_sessions
  for all using (
    exists (select 1 from public.workspaces w where w.id = quiz_sessions.workspace_id and w.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.workspaces w where w.id = quiz_sessions.workspace_id and w.owner_id = auth.uid())
  );

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'quiz_sessions'
  ) then
    alter publication supabase_realtime add table public.quiz_sessions;
  end if;
end $$;

-- ============================================================
-- 10. Custom-code tracking events (run arbitrary JS on trigger, e.g.
--     window.fbq('track','Contact')), added to an already-deployed
--     quiz_tracking_events table.
-- ============================================================

alter table public.quiz_tracking_events add column if not exists send_to_custom_code boolean not null default false;
alter table public.quiz_tracking_events add column if not exists custom_code text;

-- ============================================================
-- 11. Public storage bucket for message-block images, so an editor
--     can upload an image instead of pasting an external URL. Public
--     read (quiz visitors load these unauthenticated), authenticated
--     write (any logged-in dashboard user — matches how the rest of
--     the editor has no per-workspace object ownership yet).
-- ============================================================

insert into storage.buckets (id, name, public)
values ('quiz-media', 'quiz-media', true)
on conflict (id) do nothing;

drop policy if exists "quiz_media_public_read" on storage.objects;
create policy "quiz_media_public_read" on storage.objects
  for select using (bucket_id = 'quiz-media');

drop policy if exists "quiz_media_authenticated_write" on storage.objects;
create policy "quiz_media_authenticated_write" on storage.objects
  for insert with check (bucket_id = 'quiz-media' and auth.role() = 'authenticated');

drop policy if exists "quiz_media_authenticated_update" on storage.objects;
create policy "quiz_media_authenticated_update" on storage.objects
  for update using (bucket_id = 'quiz-media' and auth.role() = 'authenticated');

drop policy if exists "quiz_media_authenticated_delete" on storage.objects;
create policy "quiz_media_authenticated_delete" on storage.objects
  for delete using (bucket_id = 'quiz-media' and auth.role() = 'authenticated');

-- ============================================================
-- 12. Per-answer webhook parameter key, so a webhook payload can key each
--     answer by a custom name (e.g. "age") instead of the raw node id.
-- ============================================================

alter table public.submission_answers add column if not exists param_key text;

-- ============================================================
-- 13. Real theme customization for the live chat runtime: a custom avatar
--     image, muted/help text color, and separate desktop/mobile background
--     images, added to an already-deployed quiz_themes table.
-- ============================================================

alter table public.quiz_themes add column if not exists avatar_url text;
alter table public.quiz_themes add column if not exists muted_text_color text;
alter table public.quiz_themes add column if not exists background_image_url_mobile text;

-- ============================================================
-- 14. Ad name (utm_content) captured per lead, so the leads table can show
--     which specific ad drove each lead, added to an already-deployed
--     leads table.
-- ============================================================

alter table public.leads add column if not exists utm_content text;

-- ============================================================
-- 15. Missing indexes on foreign-key columns that listLeads() and the
--     webhook dispatch route filter on with .in()/.eq() — Postgres does
--     not auto-index the referencing side of a foreign key, so these
--     were full/sequential scans on every leads-page load and every lead
--     submission. Pure additive indexes, no behavior change.
-- ============================================================

create index if not exists lead_status_history_lead_id_idx on public.lead_status_history(lead_id);
create index if not exists lead_notes_lead_id_idx on public.lead_notes(lead_id);
create index if not exists quiz_submissions_lead_id_idx on public.quiz_submissions(lead_id);
create index if not exists submission_answers_submission_id_idx on public.submission_answers(submission_id);

-- ============================================================
-- 16. Integrations move from workspace-level to per-quiz. workspace_id
--     stays (RLS still checks it, unchanged) but each integration is now
--     also scoped to one quiz via quiz_id, added to an already-deployed
--     integrations table.
-- ============================================================

alter table public.integrations add column if not exists quiz_id uuid references public.quizzes(id) on delete cascade;
create index if not exists integrations_quiz_id_idx on public.integrations(quiz_id);
