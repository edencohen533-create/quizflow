-- Additive reliability baseline. Deploy before the application using these RPCs.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table public.quizzes add column if not exists flow_revision bigint not null default 0;

create table if not exists public.delivery_jobs (
 id uuid primary key default gen_random_uuid(),
 dedupe_key text not null unique,
 quiz_id uuid not null references public.quizzes(id) on delete cascade,
 integration_id uuid references public.integrations(id) on delete cascade,
 kind text not null check(kind in ('webhook','capi')),
 payload jsonb not null,
 status text not null default 'pending' check(status in ('pending','running','sent','dead')),
 attempts integer not null default 0,
 available_at timestamptz not null default now(),
 lease_token uuid,
 last_error text,
 created_at timestamptz not null default now(),
 finished_at timestamptz
);
create index if not exists delivery_jobs_due_idx on public.delivery_jobs(available_at) where status in ('pending','running');
alter table public.delivery_jobs enable row level security;
revoke all on public.delivery_jobs from anon,authenticated;
grant all on public.delivery_jobs to service_role;
drop policy if exists delivery_jobs_owner_read on public.delivery_jobs;
create policy delivery_jobs_owner_read on public.delivery_jobs for select to authenticated
 using(exists(select 1 from public.quizzes q join public.workspaces w on w.id=q.workspace_id where q.id=delivery_jobs.quiz_id and w.owner_id=auth.uid()));
-- Payload contains contact information; expose only operational metadata to owners.
grant select(id,quiz_id,kind,status,attempts,available_at,last_error,created_at,finished_at) on public.delivery_jobs to authenticated;

create table if not exists public.request_buckets (
 key text primary key,
 window_start timestamptz not null,
 count integer not null
);
alter table public.request_buckets enable row level security;
revoke all on public.request_buckets from anon,authenticated;
grant all on public.request_buckets to service_role;

create or replace function public.consume_request_budget(p_key text,p_limit integer,p_seconds integer default 60)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer; t timestamptz:=clock_timestamp();
begin
 if length(p_key)<>64 or p_limit<1 or p_limit>10000 or p_seconds<1 or p_seconds>3600 then raise exception 'invalid budget'; end if;
 insert into public.request_buckets as b(key,window_start,count) values(p_key,t,1)
 on conflict(key) do update set
 count=case when b.window_start<=t-make_interval(secs=>p_seconds) then 1 else least(b.count+1,p_limit+1) end,
 window_start=case when b.window_start<=t-make_interval(secs=>p_seconds) then t else b.window_start end
 returning count into n;
 return n<=p_limit;
end $$;
revoke all on function public.consume_request_budget(text,integer,integer) from public,anon,authenticated;
grant execute on function public.consume_request_budget(text,integer,integer) to service_role;

create or replace function public.save_quiz_flow(p_quiz_id uuid,p_expected_revision bigint,p_nodes jsonb,p_edges jsonb)
returns bigint language plpgsql security definer set search_path=public,pg_temp as $$
declare revision bigint;
begin
 if coalesce(auth.jwt()->>'aal','aal1')<>'aal2' and exists(select 1 from auth.mfa_factors where user_id=auth.uid() and status='verified') then raise exception 'MFA required' using errcode='42501'; end if;
 select q.flow_revision into revision from public.quizzes q join public.workspaces w on w.id=q.workspace_id
 where q.id=p_quiz_id and w.owner_id=auth.uid() for update of q;
 if not found then raise exception 'Not authorized' using errcode='42501'; end if;
 if revision<>p_expected_revision then raise exception 'Flow changed in another editor; reload before saving' using errcode='40001'; end if;
 if jsonb_typeof(p_nodes)<>'array' or jsonb_typeof(p_edges)<>'array' or jsonb_array_length(p_nodes)>500 or jsonb_array_length(p_edges)>2000 then raise exception 'Invalid graph'; end if;
 if exists(select 1 from jsonb_array_elements(p_nodes) n where n->>'id' is null or n->>'type' is null or n->'data'->>'kind' is distinct from n->>'type') then raise exception 'Invalid node'; end if;
 if exists(select 1 from jsonb_array_elements(p_edges)e where not exists(select 1 from jsonb_array_elements(p_nodes)n where n->>'id'=e->>'source') or not exists(select 1 from jsonb_array_elements(p_nodes)n where n->>'id'=e->>'target')) then raise exception 'Invalid edge'; end if;
 insert into public.quiz_nodes(quiz_id,id,type,position_x,position_y,data)
 select p_quiz_id,n.id,n.type,n.position_x,n.position_y,n.data from jsonb_to_recordset(p_nodes) as n(id text,type text,position_x float8,position_y float8,data jsonb)
 on conflict(quiz_id,id) do update set type=excluded.type,position_x=excluded.position_x,position_y=excluded.position_y,data=excluded.data;
 insert into public.quiz_edges(quiz_id,id,source,source_handle,target)
 select p_quiz_id,e.id,e.source,e.source_handle,e.target from jsonb_to_recordset(p_edges) as e(id text,source text,source_handle text,target text)
 on conflict(quiz_id,id) do update set source=excluded.source,source_handle=excluded.source_handle,target=excluded.target;
 delete from public.quiz_edges e where e.quiz_id=p_quiz_id and not exists(select 1 from jsonb_array_elements(p_edges)x where x->>'id'=e.id);
 delete from public.quiz_nodes n where n.quiz_id=p_quiz_id and not exists(select 1 from jsonb_array_elements(p_nodes)x where x->>'id'=n.id);
 update public.quizzes set flow_revision=revision+1 where id=p_quiz_id;
 return revision+1;
end $$;
revoke all on function public.save_quiz_flow(uuid,bigint,jsonb,jsonb) from public,anon;
grant execute on function public.save_quiz_flow(uuid,bigint,jsonb,jsonb) to authenticated;

create or replace function public.submit_quiz_response(p_lead jsonb,p_submission jsonb,p_answers jsonb)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare lid uuid:=(p_lead->>'id')::uuid; sid uuid:=(p_submission->>'id')::uuid; qid uuid:=(p_lead->>'quiz_id')::uuid; wid uuid:=(p_lead->>'workspace_id')::uuid; qname text; answer_data jsonb;
begin
 -- Called only by service_role after signature and answer normalization.
 perform pg_advisory_xact_lock(hashtextextended(sid::text,0));
 select name into qname from public.quizzes where id=qid and workspace_id=wid and status='active';
 if not found or (p_submission->>'quiz_id')::uuid<>qid or (p_submission->>'lead_id')::uuid<>lid then raise exception 'Invalid scope'; end if;
 if exists(select 1 from public.quiz_submissions where id=sid) then
   if not exists(select 1 from public.quiz_submissions where id=sid and quiz_id=qid and lead_id=lid) then raise exception 'Invalid replay'; end if;
   return lid;
 end if;
 insert into public.leads(id,workspace_id,quiz_id,name,phone,email,score,category,status,utm_source,utm_medium,utm_campaign,utm_content)
 values(lid,wid,qid,p_lead->>'name',p_lead->>'phone',p_lead->>'email',(p_lead->>'score')::integer,p_lead->>'category','new',p_lead->>'utm_source',p_lead->>'utm_medium',p_lead->>'utm_campaign',p_lead->>'utm_content');
 insert into public.quiz_submissions(id,quiz_id,lead_id,score,category,utm_source,utm_medium,utm_campaign)
 values(sid,qid,lid,(p_submission->>'score')::integer,p_submission->>'category',p_submission->>'utm_source',p_submission->>'utm_medium',p_submission->>'utm_campaign');
 insert into public.submission_answers(id,submission_id,node_id,question_title,answer_label,score,param_key)
 select a.id,sid,a.node_id,a.question_title,a.answer_label,a.score,a.param_key
 from jsonb_to_recordset(p_answers) as a(id uuid,node_id text,question_title text,answer_label text,score integer,param_key text);
 select coalesce(jsonb_object_agg(coalesce(nullif(a->>'param_key',''),a->>'node_id'),a->>'answer_label'),'{}'::jsonb) into answer_data from jsonb_array_elements(p_answers)a;
 insert into public.delivery_jobs(dedupe_key,quiz_id,integration_id,kind,payload)
 select 'webhook:'||sid||':'||i.id,qid,i.id,'webhook',
 jsonb_build_object('leadId',lid,'quizId',qid,'quizName',qname,'name',p_lead->>'name','phone',p_lead->>'phone','email',p_lead->>'email','score',(p_lead->>'score')::integer,'category',p_lead->>'category','utmSource',p_lead->>'utm_source','utmMedium',p_lead->>'utm_medium','utmCampaign',p_lead->>'utm_campaign','createdAt',now(),'data',answer_data,'params',coalesce((select jsonb_object_agg(x->>'key',x->>'value') from jsonb_array_elements(i.extra_params)x),'{}'::jsonb))
 from public.integrations i where i.quiz_id=qid and i.workspace_id=wid and i.enabled and i.kind='webhook' and i.url is not null
 on conflict(dedupe_key) do nothing;
 return lid;
end $$;
revoke all on function public.submit_quiz_response(jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.submit_quiz_response(jsonb,jsonb,jsonb) to service_role;

create or replace function public.claim_delivery_jobs(p_limit integer default 5)
returns setof public.delivery_jobs language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update public.delivery_jobs set status='dead',finished_at=now(),last_error='Retry budget exhausted after expired lease'
 where status='running' and available_at<=now() and attempts>=8;
 return query update public.delivery_jobs j set status='running',attempts=attempts+1,available_at=now()+interval '2 minutes',lease_token=gen_random_uuid()
 where j.id in(select id from public.delivery_jobs where status in('pending','running') and available_at<=now() and attempts<8 order by available_at for update skip locked limit least(greatest(p_limit,1),10))
 returning j.*;
end $$;
revoke all on function public.claim_delivery_jobs(integer) from public,anon,authenticated;
grant execute on function public.claim_delivery_jobs(integer) to service_role;

create or replace function public.finish_delivery_job(p_id uuid,p_lease uuid,p_success boolean,p_error text default null,p_permanent boolean default false)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update public.delivery_jobs set status=case when p_success then 'sent' when p_permanent or attempts>=8 then 'dead' else 'pending' end,
 last_error=left(p_error,200),finished_at=case when p_success or p_permanent or attempts>=8 then now() else null end,
 available_at=now()+make_interval(secs=>least(3600,30*(2^attempts)::integer)),lease_token=null
 where id=p_id and status='running' and lease_token=p_lease;
 return found;
end $$;
revoke all on function public.finish_delivery_job(uuid,uuid,boolean,text,boolean) from public,anon,authenticated;
grant execute on function public.finish_delivery_job(uuid,uuid,boolean,text,boolean) to service_role;
commit;
