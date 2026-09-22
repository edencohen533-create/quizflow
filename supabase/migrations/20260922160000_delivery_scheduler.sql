begin;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
select cron.schedule('quizflow-delivery-worker','* * * * *',$job$
 select net.http_post(
 url:='https://quizflow-flax.vercel.app/api/jobs/deliver',
 headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='quizflow_delivery_cron')),
 body:='{}'::jsonb,timeout_milliseconds:=30000
 );
$job$);
select cron.alter_job((select jobid from cron.job where jobname='quizflow-delivery-worker'),active:=false);
select cron.schedule('quizflow-expire-request-buckets','*/10 * * * *',$job$ delete from public.request_buckets where window_start<now()-interval '2 hours'; $job$);
commit;
select jobname,schedule,active from cron.job where jobname like 'quizflow-%';