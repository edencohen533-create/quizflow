# QA and security review — 2026-09-22

Scope: QuizFlow repository, deployed public quiz, public/server API boundaries, editor persistence, browser content, file-upload rules, and dependency/build checks. Source was edited directly through GitHub; no local source checkout was changed.

This is an engineering audit with regression coverage, not a penetration-test certification or a claim that all attacks are prevented.

## Findings addressed in application code

| Severity | Finding | Change |
| --- | --- | --- |
| Critical | Published quiz visibility was treated as ownership before writing/using Meta secrets | Explicit authenticated workspace owner check, with negative regression tests |
| Critical | Privileged public endpoints accepted arbitrary lead/submission/session identifiers | Expiring HMAC capabilities bind quiz, workspace, session, lead and submission IDs; old unprotected answer endpoint retired |
| Critical | Integration selection by quiz alone could mix tenants | Dispatch requires both quiz ID and workspace ID and the visitor's own signed lead/submission |
| High | Unauthenticated arbitrary webhook relay, private-network requests, DNS rebinding and redirects | Owner-only saved integration tests; HTTPS/443 only; all DNS addresses checked; connection pinned; redirects not followed; timeouts and size limits |
| High | Author JS/GTM ran in the authenticated application's origin | Opaque-origin sandbox without allow-same-origin, forms or top navigation; browser verified parent DOM/storage inaccessible |
| High | Client could supply scores, answer titles and webhook field names | Server loads quiz configuration, validates nodes/options, derives scores/labels/keys and bounds input |
| High | Repeat submissions and repeated integration/event requests | Stable signed IDs and idempotent upserts; database-backed delivery claims using existing tracking activity rows |
| Medium | Missing request limits, input validation and safe errors | Bounded streaming JSON, content-type/origin checks, non-object rejection, generic server errors, per-instance request budgets |
| Medium | Potential spreadsheet formula injection and unsafe author URLs | CSV formula neutralization; link and redirect allowlists; same-origin authentication return paths |
| High (reliability) | Editor deleted all flow rows before checking replacement writes; save button only displayed success | Replacement-first writes, serialized saves, visible errors, real manual save, publish waits for save |
| Medium (reliability) | Submission failures were hidden; duplicate clicks raced transitions; delayed heartbeats reopened sessions | Errors and retry, latest contact state, click guard, terminal session guard; redirects wait for save |
| Medium (reliability) | Automatic-node cycles returned an unusable node | Cycle detection resolves to no renderable target |

Compatibility changes: webhook destinations must use public HTTPS on port 443 and must not redirect. Custom JS/GTM can no longer access the parent DOM/cookies/storage; custom Meta snippets get a local sandbox pixel stub. Browser tracking/cookie attribution should be checked against the owner's actual marketing setup.

## Verification

- 92 automated tests passed (81 security/reliability and 11 performance). Automated Node tests execute real TypeScript helpers/routes with database/network mocks. Coverage includes tampered/expired capabilities, cross-tenant denial, anonymous API rejection, DNS pinning/private ranges, dangerous URLs, CSV injection, score tampering, replay suppression, persistence failures and overlapping saves.
- Existing performance regressions remain enabled.
- Targeted ESLint, TypeScript and optimized Next.js build run remotely in Vercel.
- Production dependency audit (`npm audit --omit=dev --audit-level=high`) reported zero known vulnerabilities on 2026-09-22. This is not a code-security guarantee.
- Preview HTTP checks: all nine guarded/retired write endpoints rejected unauthorized requests; malformed JSON shapes, foreign/null origins, unsupported media type and oversized bodies were rejected.
- Chromium: desktop 991x640 and mobile 390x844, no horizontal overflow, logo/avatar rendering retained, double-click protection and back navigation passed; unauthenticated dashboard redirected to login; no runtime page errors.
- Real browser sandbox probe confirmed a null/opaque origin and denied parent DOM and localStorage access.
- Browser write requests were intercepted. No production leads were created and no marketing/webhook events were sent by those tests.
- The complete contact-capture path was exercised with intercepted writes: ten answers and the latest name/phone were included, an injected 503 produced a visible error, automatic redirection stayed paused, and retry succeeded. This verifies browser behavior; actual persisted database rows and external delivery were not exercised.

## Open items — do not mark the security work fully complete

1. **Database baseline verified live on 2026-09-22.** Authenticated Supabase CLI access confirmed that the policies/grants in `20260922_security_boundaries.sql` were already present. No redundant migration was applied. All 23 public tables have RLS enabled; anonymous INSERT/UPDATE/DELETE grants are absent on leads, submissions, answers and analytics, and the helper RPC is not executable by anon/authenticated. Storage enforces the owner directory for inserts, owner checks for changes, a 5 MiB cap and the raster MIME allowlist.
2. **Live SQL tenant tests passed; API storage checks remain.** Two temporary users/workspaces in one rolled-back transaction verified owner lead insertion, workspace/lead isolation, cross-quiz lead and session rejection, own storage-prefix insertion, foreign-prefix rejection, foreign storage UPDATE affecting zero rows, anonymous lead rejection and published quiz reads. Storage DELETE was blocked by the platform's direct-SQL deletion guard, so this does not prove DELETE behavior through Storage API. Integration/submission/message relationship tests, actual MIME/size upload rejection and authenticated Storage API tests remain.
3. **Distributed abuse control.** The built-in limiter is per server instance, not a shared quota. Configure and test a WAF/shared rate limiter for visitor issuance, API requests and sign-up. No new paid infrastructure was provisioned.
4. **Atomic persistence/concurrency.** Lead/submission/answer writes are idempotent but not one database transaction. Interrupted requests may leave partial data until retry. Flow saves are serialized within a client, not across editors; a transactional RPC with optimistic revision checks is the next step.
5. **Delivery guarantees.** A persistent claim prevents duplicate dispatch but gives at-most-once attempts, not a durable retry queue. A crash or network failure after claiming needs operator reconciliation. No real external credentials/endpoints were used to validate deliveries.
6. **Authenticated end-to-end QA.** Real account login/recovery, editor save/publish, inbox, leads, destructive operations and file uploads still need isolated test accounts/workspaces. No real customer records were altered to test these.
7. **Remaining flow features.** Condition/action nodes currently have incomplete execution/configuration paths; A/B choices use runtime randomness. Review intended branching/action semantics before relying on these blocks. Existing cycle handling was repaired; this review did not implement new CRM/email integrations.
8. **Deployment/platform posture.** Account MFA, secret rotation/history, backups/restore, audit retention, hosting configuration, stricter nonce-based script CSP, and sustained load testing require a separate operational verification. The added CSP covers framing/base/object/form restrictions; it is not a full script-src policy.
9. **Meta API version lifecycle and attribution.** Existing version pin and actual provider compatibility need validation with the owner's Meta app. No outbound test conversions were generated.

## Database verification checklist after connecting Supabase

Run the migration in a transaction, inspect the resulting policies/grants and storage bucket limits, and verify:
- anon cannot insert/update/delete leads, submissions, answers or analytics directly;
- published quiz/theme/node reads still work;
- authenticated tenant A cannot mutate tenant B's integrations, metadata, messages or media;
- arbitrary cross-workspace quiz/lead references are rejected;
- signed API submission succeeds and is idempotent, including a retry after injected answer-write failure;
- owner uploads allowed raster types up to 5 MiB; SVG/HTML/oversize uploads fail;
- existing image URLs remain readable.

Do not blindly rerun an older schema file: it may recreate the insecure public policies. The current schema's final section includes the same security baseline.

## Supabase connection and live verification

The official CLI authenticated successfully in this conversation against project `fqxsmxshcyjbmuegkalu` (QuizFlow). Verification uses actual PostgreSQL `authenticated`/`anon` roles and JWT subject settings, not mocked policies. Reproducible rollback-only checks are in `tests/sql/security-boundaries.sql`. The initial run encountered Storage's direct deletion guard and rolled back; the revised run accepted that explicit denial without disabling the guard and passed. No customer records or stored files were deleted, and no test fixtures were committed. No production SQL change was necessary because the intended security baseline was already installed when inspected.
