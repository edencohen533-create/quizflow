# QA and security review — 2026-09-22

Scope: QuizFlow application, hosted Supabase project, preview and production deployment. Source changes were made directly through GitHub. This is engineering verification, not an independent penetration-test certification.

## Implemented controls

- Expiring HMAC visitor capabilities bind quiz, workspace, session, lead and submission identifiers. Anonymous writes and the legacy unprotected answer endpoint are denied.
- Server-side answer validation derives labels, scores and keys from the published graph. Submission path reconstruction rejects skipped required questions and off-path answers; disconnected contact blocks do not impose consent requirements.
- Explicit ownership protects editor access and Meta credentials even when the underlying quiz is publicly readable.
- Transactional submission RPC writes lead, submission, answers and webhook outbox together. Retries use stable IDs. A failed answer insert rolls the entire transaction back.
- Transactional graph saves lock the quiz and compare its revision. Concurrent stale editors get an actionable conflict without overwriting newer changes. SQLSTATE PT409 avoids PostgREST's serialization retry behavior observed with 40001.
- Shared database request budgets supplement the per-instance limiter. Visitor issuance and write APIs fail closed when the shared limiter is unavailable. Auth has separate hosted rate limits.
- Durable leased delivery jobs retry transient network/HTTP failures with exponential backoff and stop after eight attempts. Stable deliveryId/event_id supports receiver deduplication. Delivery is at least once, not exactly once.
- Webhooks enforce public HTTPS/443, validate every DNS answer, pin connections and reject redirects/private networks. Browser custom scripts run in an opaque sandbox.
- Optional TOTP MFA is implemented in the application and enforced at the data boundary. Password recovery, minimum 12-character passwords, correct site/return URLs and database SSL enforcement are configured.
- Storage restricts writes to the owner's prefix, raster MIME types and 5 MiB. CSV formulas and unsafe author links are neutralized.
- Conditions evaluate configured answers/scores/UTMs, A/B assignment is stable within a signed session, and redirects wait for successful submission. Unsupported CRM/email/action-node operations block publishing rather than silently doing nothing.
- Functions run in hnd1 alongside the Tokyo database. Existing image, bundle and query performance improvements are retained.

## Verification completed

- Remote deployment gates run security/reliability unit tests, performance regression tests, targeted ESLint, TypeScript, optimized Next.js build and production dependency audit. See the final deployment logs for authoritative counts.
- Two actual isolated Auth accounts exercised password login, workspace provisioning, own editor save/publish, foreign editor denial, leads and inbox.
- Browser and API TOTP enrollment/challenge succeeded. A pre-MFA aal1 token lost workspace access after enrollment; aal2 retained access. Browser recovery changed a fixture password and logged in with the new password.
- Actual Storage API tests: own PNG upload succeeded; foreign-prefix upload/overwrite and foreign deletion failed to change the object; SVG, HTML and files over 5 MiB were rejected.
- Actual cross-tenant and cross-quiz checks covered workspaces, quiz updates, integrations, sessions and conversation messages.
- Rollback-only SQL tests cover transactional rollback, idempotency, optimistic conflicts, unauthorized RPC use, exclusive queue leases, stale acknowledgements and shared budgets.
- Real signed submission requests persisted only isolated QA leads. Repeating the same request did not duplicate the lead/submission or trust the supplied score.
- A synthetic webhook job received HTTP 503, remained pending, then succeeded on its second attempt against HTTP 200. A later worker run did not send the completed job again. Only generated QA payloads were sent to httpbin.
- Thirty concurrent shared-budget calls with limit ten admitted exactly ten.
- Limited preview load: 40 successful HTTP 200 page requests at concurrency four; median 604 ms, p95 1095 ms from this test client, function region hnd1. This is a smoke load check, not a capacity benchmark or DDoS test.
- Desktop/mobile browser checks include no horizontal overflow, retained logo/avatar presentation, failure/retry and redirect gating. Earlier complete customer-quiz traversal intercepted writes; persisted tests used only isolated QA workspaces.
- Enabling SSL briefly caused production PGRST002 schema-cache errors during reload. Subsequent checks recovered to HTTP 200. No continuing outage was observed.

## Operational dependencies still open

1. Supabase backup listing returned no available backup entries and PITR was disabled. A user-owned backup destination or approval of a paid service is required before implementing encrypted backups and an isolated restore rehearsal. Database backups alone do not include Storage objects.
2. Actual Meta attribution/delivery is not certified. Read-only checks returned error 190 for one configured token and error 100 for two pixel/object queries (which may indicate permissions or an incorrect object). Correct owner-controlled credentials and a test-event setup are needed. No real conversion was generated to validate this.
3. Application MFA is available and tested; owners must enroll their own factors. MFA for GitHub, Vercel and Supabase platform accounts remains owner-operated.
4. Failed-delivery status is visible in Settings and worker failures are logged. External paging requires an owner-selected destination. No email or Slack recipient was guessed.
5. Existing root/service credentials were not blindly rotated because undiscovered consumers could break. The worker has a new dedicated credential in Vercel and Vault. Follow the rotation procedure in OPERATIONS.md.
6. Independent penetration testing, sustained capacity tests, full nonce-based script CSP and long-term alert/backup drills are outside the checks demonstrated here.

See [operations runbook](OPERATIONS.md) for deployment order, worker activation, recovery and rotation. Do not treat mocked unit tests, SQL role simulations, real API tests and real browser tests as interchangeable evidence.
