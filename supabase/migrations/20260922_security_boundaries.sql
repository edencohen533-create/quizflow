-- APPLY ONLY AFTER the signed quiz API application release is live.
-- Baseline verified present in production on 2026-09-22; see the QA report.
-- Application of this file by the agent was unnecessary.
-- No rows/objects are deleted. Existing anonymous tabs must reload.
begin;

-- Anonymous visitors now submit via signed server routes, never raw PostgREST.
drop policy if exists "leads_public_insert" on public.leads;
drop policy if exists "quiz_submissions_public_insert" on public.quiz_submissions;
drop policy if exists "submission_answers_public_insert" on public.submission_answers;
drop policy if exists "analytics_events_public_insert" on public.analytics_events;
revoke insert, update, delete on public.leads, public.quiz_submissions,
  public.submission_answers, public.analytics_events from anon;
revoke execute on function public.is_active_quiz_submission(uuid) from public, anon, authenticated;

-- Restrictive policies AND with all existing permissive policies. Owning a
-- workspace must never permit attaching another workspace's quiz/lead.
drop policy if exists "integrations_tenant_boundary" on public.integrations;
create policy "integrations_tenant_boundary" on public.integrations as restrictive
  for all to authenticated
  using (quiz_id is null or exists (
    select 1 from public.quizzes q where q.id = integrations.quiz_id and q.workspace_id = integrations.workspace_id
  ))
  with check (quiz_id is null or exists (
    select 1 from public.quizzes q where q.id = integrations.quiz_id and q.workspace_id = integrations.workspace_id
  ));

drop policy if exists "leads_tenant_boundary" on public.leads;
create policy "leads_tenant_boundary" on public.leads as restrictive
  for all to authenticated
  using (quiz_id is null or exists (
    select 1 from public.quizzes q where q.id = leads.quiz_id and q.workspace_id = leads.workspace_id
  ))
  with check (quiz_id is null or exists (
    select 1 from public.quizzes q where q.id = leads.quiz_id and q.workspace_id = leads.workspace_id
  ));

drop policy if exists "submissions_tenant_boundary" on public.quiz_submissions;
create policy "submissions_tenant_boundary" on public.quiz_submissions as restrictive
  for all to authenticated
  using (lead_id is null or exists (
    select 1 from public.leads l where l.id = quiz_submissions.lead_id and l.quiz_id = quiz_submissions.quiz_id
  ))
  with check (lead_id is null or exists (
    select 1 from public.leads l where l.id = quiz_submissions.lead_id and l.quiz_id = quiz_submissions.quiz_id
  ));

drop policy if exists "sessions_tenant_boundary" on public.quiz_sessions;
create policy "sessions_tenant_boundary" on public.quiz_sessions as restrictive
  for all to authenticated
  using (exists (
    select 1 from public.quizzes q where q.id = quiz_sessions.quiz_id and q.workspace_id = quiz_sessions.workspace_id
  ))
  with check (exists (
    select 1 from public.quizzes q where q.id = quiz_sessions.quiz_id and q.workspace_id = quiz_sessions.workspace_id
  ));

drop policy if exists "messages_tenant_boundary" on public.conversation_messages;
create policy "messages_tenant_boundary" on public.conversation_messages as restrictive
  for all to authenticated
  using (exists (
    select 1 from public.conversations c where c.id = conversation_messages.conversation_id and c.workspace_id = conversation_messages.workspace_id
  ))
  with check (exists (
    select 1 from public.conversations c where c.id = conversation_messages.conversation_id and c.workspace_id = conversation_messages.workspace_id
  ));

-- Existing public image URLs continue to work; only mutation rules change.
update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/png','image/jpeg','image/webp','image/gif','image/avif']
where id = 'quiz-media';
drop policy if exists "quiz_media_authenticated_write" on storage.objects;
drop policy if exists "quiz_media_authenticated_update" on storage.objects;
drop policy if exists "quiz_media_authenticated_delete" on storage.objects;
create policy "quiz_media_authenticated_write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'quiz-media' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "quiz_media_authenticated_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'quiz-media' and owner_id = (select auth.uid()::text))
  with check (bucket_id = 'quiz-media' and owner_id = (select auth.uid()::text));
create policy "quiz_media_authenticated_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'quiz-media' and owner_id = (select auth.uid()::text));

commit;
