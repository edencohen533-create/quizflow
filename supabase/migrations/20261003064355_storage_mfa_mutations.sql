begin;
-- MFA enrollment must protect Storage mutations as well as workspace data.
-- These restrictive policies AND with the existing ownership policies.
-- Public quiz images remain readable, and unrelated buckets are unaffected.
create policy quiz_media_mfa_insert on storage.objects as restrictive
  for insert to authenticated
  with check (bucket_id <> 'quiz-media' or (select public.session_meets_mfa()));
create policy quiz_media_mfa_update on storage.objects as restrictive
  for update to authenticated
  using (bucket_id <> 'quiz-media' or (select public.session_meets_mfa()))
  with check (bucket_id <> 'quiz-media' or (select public.session_meets_mfa()));
create policy quiz_media_mfa_delete on storage.objects as restrictive
  for delete to authenticated
  using (bucket_id <> 'quiz-media' or (select public.session_meets_mfa()));
commit;
