begin;
-- Tests run inside the caller's transaction and must be rolled back.
insert into auth.users(id) values ('10000000-0000-4000-8000-000000000081'),('10000000-0000-4000-8000-000000000082');
insert into public.workspaces(id,owner_id) values ('20000000-0000-4000-8000-000000000081','10000000-0000-4000-8000-000000000081'),('20000000-0000-4000-8000-000000000082','10000000-0000-4000-8000-000000000082');
insert into public.quizzes(id,workspace_id,name,slug,status) values ('30000000-0000-4000-8000-000000000081','20000000-0000-4000-8000-000000000081','QA rollback','qa-rollback-atomic-81','active');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000081',true);
do $test$
declare revision bigint;
begin
 revision:=public.save_quiz_flow('30000000-0000-4000-8000-000000000081',0,'[{"id":"start","type":"start","position_x":0,"position_y":0,"data":{"kind":"start"}}]','[]');
 if revision<>1 then raise exception 'revision not incremented'; end if;
 begin
 perform public.save_quiz_flow('30000000-0000-4000-8000-000000000081',0,'[]','[]');
 raise exception 'stale revision accepted';
 exception when sqlstate 'PT409' then null; end;
 if (select count(*) from public.quiz_nodes where quiz_id='30000000-0000-4000-8000-000000000081')<>1 then raise exception 'conflict deleted graph'; end if;
 begin
 perform public.submit_quiz_response('{}','{}','[]');
 raise exception 'authenticated service RPC allowed';
 exception when insufficient_privilege then null; end;
end $test$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000082',true);
do $test$
begin
 begin
 perform public.save_quiz_flow('30000000-0000-4000-8000-000000000081',1,'[]','[]');
 raise exception 'foreign editor allowed';
 exception when insufficient_privilege then null; end;
end $test$;
reset role;
insert into public.integrations(workspace_id,quiz_id,kind,name,url) values('20000000-0000-4000-8000-000000000081','30000000-0000-4000-8000-000000000081','webhook','QA never delivered','https://example.com/test');
do $test$
declare
 l jsonb:='{"id":"40000000-0000-4000-8000-000000000081","workspace_id":"20000000-0000-4000-8000-000000000081","quiz_id":"30000000-0000-4000-8000-000000000081","name":"QA","score":3,"category":"cold"}';
 s jsonb:='{"id":"50000000-0000-4000-8000-000000000081","lead_id":"40000000-0000-4000-8000-000000000081","quiz_id":"30000000-0000-4000-8000-000000000081","score":3,"category":"cold"}';
 j public.delivery_jobs;
begin
 begin
 perform public.submit_quiz_response(l,s,'[{"id":"60000000-0000-4000-8000-000000000081","node_id":"q","score":null}]');
 raise exception 'invalid answer accepted';
 exception when not_null_violation then null; end;
 if exists(select 1 from public.leads where id=(l->>'id')::uuid) then raise exception 'partial lead persisted'; end if;
 perform public.submit_quiz_response(l,s,'[{"id":"60000000-0000-4000-8000-000000000081","node_id":"q","score":3,"answer_label":"ok"}]');
 perform public.submit_quiz_response(l||'{"name":"replay"}',s,'[]');
 if (select name from public.leads where id=(l->>'id')::uuid)<>'QA' then raise exception 'replay overwrote'; end if;
 if (select count(*) from public.delivery_jobs where quiz_id=(l->>'quiz_id')::uuid)<>1 then raise exception 'outbox duplication'; end if;
 select * into j from public.claim_delivery_jobs(1) where quiz_id=(l->>'quiz_id')::uuid;
 if j.id is null then raise exception 'job not claimed'; end if;
 if exists(select 1 from public.claim_delivery_jobs(1) where id=j.id) then raise exception 'job double claimed'; end if;
 if public.finish_delivery_job(j.id,gen_random_uuid(),true) then raise exception 'wrong lease accepted'; end if;
 if not public.finish_delivery_job(j.id,j.lease_token,false,'simulated retry',false) then raise exception 'retry not acknowledged'; end if;
 if (select status from public.delivery_jobs where id=j.id)<>'pending' then raise exception 'retry not queued'; end if;
 if not public.consume_request_budget(repeat('a',64),2,60) or not public.consume_request_budget(repeat('a',64),2,60) or public.consume_request_budget(repeat('a',64),2,60) then raise exception 'shared budget failed'; end if;
end $test$;

rollback;
