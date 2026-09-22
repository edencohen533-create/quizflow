# QuizFlow operations

## Deployment order

For an existing installation, review and apply only missing migrations. Never rerun an old schema blindly.

For a fresh database:
1. Apply supabase/schema.sql.
2. Apply supabase/migrations/20260922_security_boundaries.sql.
3. Apply 20260922140000_reliability.sql, then 20260922150000_mfa.sql.
4. Configure SUPABASE_SERVICE_ROLE_KEY only on the server, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and a strong QUIZ_SESSION_SECRET.
5. Generate a separate DELIVERY_CRON_SECRET. Store the same value in Vercel and Supabase Vault under quizflow_delivery_cron. Never put the value in source, logs or public environment variables.
6. Review the production hostname in 20260922160000_delivery_scheduler.sql, then apply it. It installs the delivery schedule disabled so it cannot call an application version without the worker route.
7. Deploy and verify POST /api/jobs/deliver rejects unauthenticated requests and accepts the dedicated bearer credential.
8. Enable the schedule:

```sql
select cron.alter_job(
 (select jobid from cron.job where jobname='quizflow-delivery-worker'),
 active := true
);
```

Verify cron.job_run_details and net._http_response: a successful SQL scheduling call alone does not prove HTTP delivery succeeded. The ephemeral request-bucket cleanup runs every ten minutes.

Hosted Auth settings are declared in supabase/config.toml. Inspect the CLI config diff before applying it; preserve approved preview return URLs and use exact production recovery URLs.

## Delivery failures

Settings shows recent owner-scoped job metadata. Payloads and integration secrets are not exposed by this view. Jobs use leases and bounded retries; a lost acknowledgement can cause redelivery. Receivers should deduplicate webhook deliveryId; Meta uses event_id.

Investigate dead jobs, correct credentials/destination first, and only then requeue the specifically identified jobs through an authorized server/operator path. Do not bulk replay customer events without assessing duplicates. Monitor pending age, dead count, worker HTTP errors and cron failures. Select an external alert destination before claiming paging is operational.

## Backups and restore

No available backup entries were returned by the hosted API during this audit; PITR was disabled. Do not assume a recovery capability until a restore is demonstrated.

Use an approved owner-controlled destination, encryption, restricted access and a documented retention period. Include both PostgreSQL and Storage objects. Rehearse restoration into an isolated project, check schema, RLS, Auth compatibility, record counts and media retrieval, and record restore duration. Never overwrite production for a drill. New paid infrastructure requires explicit cost approval.

## Credential rotation

Inventory each consumer and its environment first. Generate replacement credentials using the provider-supported mechanism, deploy consumers, verify successful authenticated calls, then revoke the old credential. Do not print secret values.

Rotating QUIZ_SESSION_SECRET invalidates existing visitor capabilities: schedule it intentionally or implement a bounded dual-key transition first. Rotate DELIVERY_CRON_SECRET together in Vercel and Vault and verify the scheduler. Rotating Supabase root/service or Meta tokens without updating every consumer can interrupt submissions or delivery.

Require owner enrollment for application and platform MFA, retain recovery methods securely, and rehearse account recovery. Do not enroll a factor on another person's behalf.

## Validation

Vercel builds gate deployment on npm run check:qa, TypeScript, production dependency audit and the optimized build. SQL checks under tests/sql run in transactions and roll back their fixtures. API/browser checks must use isolated test accounts and remove their objects/accounts afterward.

Function region hnd1 matches the current database region. Reevaluate it if the database moves. The measured 40-request check is not a sustained capacity guarantee.
