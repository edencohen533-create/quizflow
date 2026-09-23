begin;
-- These trigger functions are not public RPCs. Trigger execution keeps working
-- after revoking direct EXECUTE from application roles.
alter function public.set_updated_at() set search_path = '';
alter function public.handle_new_user() set search_path = '';
alter function public.log_initial_lead_status() set search_path = '';
alter function public.on_conversation_message_insert() set search_path = '';
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.log_initial_lead_status() from public, anon, authenticated;
revoke execute on function public.on_conversation_message_insert() from public, anon, authenticated;
commit;
