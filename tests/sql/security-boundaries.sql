-- Run against a disposable database or as an authorized rollback-only production check.
-- Fixed fixture IDs intentionally fail if already present. Never disable Storage deletion guards.
-- SQL DELETE denial does not replace Storage API authorization tests.
begin;
set local statement_timeout='15s';
insert into auth.users(id) values ('10000000-0000-4000-8000-000000000091'),('10000000-0000-4000-8000-000000000092');
insert into public.workspaces(id,owner_id,name) values ('20000000-0000-4000-8000-000000000091','10000000-0000-4000-8000-000000000091','rollback QA A'),('20000000-0000-4000-8000-000000000092','10000000-0000-4000-8000-000000000092','rollback QA B');
insert into public.quizzes(id,workspace_id,name,slug,status) values ('30000000-0000-4000-8000-000000000091','20000000-0000-4000-8000-000000000091','QA A','rollback-qa-a-91','active'),('30000000-0000-4000-8000-000000000092','20000000-0000-4000-8000-000000000092','QA B','rollback-qa-b-92','active');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000091',true);
do $test$
declare n int;
begin
select count(*) into n from public.workspaces where id in ('20000000-0000-4000-8000-000000000091','20000000-0000-4000-8000-000000000092');
if n<>1 then raise exception 'tenant visibility failed'; end if;
insert into public.leads(workspace_id,quiz_id,name) values ('20000000-0000-4000-8000-000000000091','30000000-0000-4000-8000-000000000091','rollback QA');
begin
insert into public.leads(workspace_id,quiz_id) values ('20000000-0000-4000-8000-000000000091','30000000-0000-4000-8000-000000000092');
raise exception 'cross quiz lead accepted';
exception when insufficient_privilege then null; end;
begin
insert into public.leads(workspace_id,quiz_id) values ('20000000-0000-4000-8000-000000000092','30000000-0000-4000-8000-000000000092');
raise exception 'cross tenant lead accepted';
exception when insufficient_privilege then null; end;
begin
insert into public.quiz_sessions(id,workspace_id,quiz_id) values (gen_random_uuid(),'20000000-0000-4000-8000-000000000091','30000000-0000-4000-8000-000000000092');
raise exception 'cross quiz session accepted';
exception when insufficient_privilege then null; end;
insert into storage.objects(bucket_id,name,owner_id) values ('quiz-media','10000000-0000-4000-8000-000000000091/rollback-qa.png','10000000-0000-4000-8000-000000000091');
begin
insert into storage.objects(bucket_id,name,owner_id) values ('quiz-media','10000000-0000-4000-8000-000000000092/rollback-qa.png','10000000-0000-4000-8000-000000000091');
raise exception 'foreign storage prefix accepted';
exception when insufficient_privilege then null; end;
end $test$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000092',true);
do $test$
declare n int;
begin
select count(*) into n from public.leads where workspace_id='20000000-0000-4000-8000-000000000091';
if n<>0 then raise exception 'foreign leads visible'; end if;
update storage.objects set name='10000000-0000-4000-8000-000000000091/hijacked.png' where bucket_id='quiz-media' and name='10000000-0000-4000-8000-000000000091/rollback-qa.png';
get diagnostics n=row_count;
if n<>0 then raise exception 'foreign storage update accepted'; end if;
begin
delete from storage.objects where bucket_id='quiz-media' and name='10000000-0000-4000-8000-000000000091/rollback-qa.png';
get diagnostics n=row_count;
if n<>0 then raise exception 'foreign storage delete accepted'; end if;
exception when insufficient_privilege then null; end;
end $test$;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $test$
declare n int;
begin
select count(*) into n from public.quizzes where id in ('30000000-0000-4000-8000-000000000091','30000000-0000-4000-8000-000000000092');
if n<>2 then raise exception 'public active quiz read broken'; end if;
begin
insert into public.leads(workspace_id) values ('20000000-0000-4000-8000-000000000091');
raise exception 'anonymous insert accepted';
exception when insufficient_privilege then null; end;
end $test$;
rollback;
select 'PASS: owner insert, tenant isolation, cross-quiz lead/session denial, storage prefix/update isolation and direct-SQL delete denial, anonymous rejection, public quiz read; all fixtures rolled back' as result;