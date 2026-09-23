begin;
set local statement_timeout='15s';
select set_config('qa.user_id',gen_random_uuid()::text,true);
select set_config('qa.lead_id',gen_random_uuid()::text,true);
select set_config('qa.conversation_id',gen_random_uuid()::text,true);
insert into auth.users(id) values(current_setting('qa.user_id')::uuid);
do $test$
declare role_name text; function_name text;
begin
 if not exists(select 1 from public.profiles where id=current_setting('qa.user_id')::uuid) then raise exception 'profile trigger failed'; end if;
 if not exists(select 1 from public.workspaces where owner_id=current_setting('qa.user_id')::uuid) then raise exception 'workspace trigger failed'; end if;
 foreach role_name in array array['anon','authenticated'] loop
  foreach function_name in array array['set_updated_at','handle_new_user','log_initial_lead_status','on_conversation_message_insert'] loop
   if has_function_privilege(role_name,'public.'||function_name||'()','EXECUTE') then raise exception 'unexpected direct execute: % %',role_name,function_name; end if;
  end loop;
 end loop;
end $test$;
select set_config('qa.workspace_id',(select id::text from public.workspaces where owner_id=current_setting('qa.user_id')::uuid),true);
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('qa.user_id'),true);
insert into public.leads(id,workspace_id,name) values(current_setting('qa.lead_id')::uuid,current_setting('qa.workspace_id')::uuid,'rollback trigger QA');
insert into public.conversations(id,workspace_id,customer_name,is_demo) values(current_setting('qa.conversation_id')::uuid,current_setting('qa.workspace_id')::uuid,'rollback trigger QA',true);
insert into public.conversation_messages(conversation_id,workspace_id,sender_type,body,is_demo) values(current_setting('qa.conversation_id')::uuid,current_setting('qa.workspace_id')::uuid,'customer','rollback-only message',true);
insert into public.quizzes(id,workspace_id,name,slug) values(current_setting('qa.lead_id')::uuid,current_setting('qa.workspace_id')::uuid,'trigger QA','trigger-qa-'||current_setting('qa.lead_id'));
update public.quizzes set name='updated rollback QA',updated_at='2000-01-01'::timestamptz where id=current_setting('qa.lead_id')::uuid;
do $test$
begin
 if not exists(select 1 from public.lead_status_history where lead_id=current_setting('qa.lead_id')::uuid) then raise exception 'status history trigger failed'; end if;
 if not exists(select 1 from public.conversations where id=current_setting('qa.conversation_id')::uuid and unread_count=1 and last_message_preview='rollback-only message') then raise exception 'conversation trigger failed'; end if;
 if not exists(select 1 from public.quizzes where id=current_setting('qa.lead_id')::uuid and updated_at>'2000-01-02'::timestamptz) then raise exception 'timestamp trigger failed'; end if;
end $test$;
rollback;
select 'PASS: public RPC grants denied; profile, workspace, lead history, timestamp and conversation triggers still operate; fixtures rolled back' as result;
