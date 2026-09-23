# Security implementation and remaining dependencies — 2026-09-23

## Browser boundary

Application pages now receive fresh script nonces, script-src-attr 'none', restricted resource directives and private/no-store responses. Rendering waits for the request so framework scripts receive the matching nonce. Inline styles remain allowed for ReactFlow and authored themes. Trusted scripts may load dynamic descendants through strict-dynamic; this does not make third-party scripts intrinsically trustworthy.

Custom tracking moved from srcdoc (which inherits the parent policy) to an HTTP document with a mandatory sandbox allow-scripts CSP. Both embedded and direct/top-level loads have an opaque origin. It never receives a signed visitor capability or backend credentials.

Actual Chromium checks passed:
- public quiz hydration, first transition and fresh nonces on a second document;
- parser-injected script and inline event handler both blocked, with script-src-elem/script-src-attr violations;
- custom tracking code executes but cannot access parent DOM or localStorage;
- direct tracking URL cannot access localStorage;
- authenticated login, real graph edit/save, Settings, Leads and Inbox;
- no legitimate CSP violations or runtime page errors in those checks.

The first injection probe used privileged DevTools evaluation and was unsuitable for evaluating parser-injected XSS. It was replaced with interception of the HTML response before browser parsing. The first editor probe made no changes, so no revision increment was expected; adding a node and awaiting the actual save RPC verified persistence. Both temporary authenticated QA accounts were deleted with their workspaces/quizzes after testing.

## Stability

First bounded run: 110/120 HTTP 200 responses and ten requests without an HTTP response; median 446 ms, p95 7971 ms, total 373 seconds. Preview server error logs did not show a corresponding error, but that does not establish the transport failure's root cause.

Repeat with transport diagnostics: 120/120 HTTP 200, no transport errors, 300 seconds, concurrency two, pairs every five seconds, median 455 ms, p95 660 ms. These are client-observed stability checks, not sustained high-concurrency capacity or DDoS certification.

## Credentials and dependency protection

Production now has a dedicated sensitive QUIZ_SESSION_SECRET. The database service key is no longer an implicit signing fallback. A verification-only previous key with explicit UTC expiry preserves existing four-hour visitor capabilities during rollout. Its verification window ends at 2026-09-23T09:04:03.555Z, independent of future operator action. Remove the expired previous-key environment entries during maintenance.

Regression coverage verifies current-key issuance, old-key acceptance during grace, expiry rejection, invalid-deadline rejection and denial when only a database key is present. This transition does not revoke Supabase service/root API credentials for other consumers.

GitHub secret scanning and push protection were already enabled. Dependabot alerts and automated security-fix PRs are now enabled. The respective APIs returned zero open secret-scanning and dependency alerts at verification time. This is not proof that no unknown secret or vulnerability exists.

## Meta

Connection tests now require the owner's Test Events code and events_received > 0. Provider errors 190/100 return actionable, sanitized messages; transport failures reset the UI's busy state. The code is sent only for the explicit test request and is not stored as production tracking configuration.

Actual provider delivery/attribution remains unverified until the owner supplies valid credentials and a Test Events code and confirms receipt in Events Manager. Prior read-only checks found one invalid token and two object/permission errors. Do not interpret mocked provider acknowledgements as a live Meta verification.

## Still dependent on owner input or external work

- Approved backup destination, encryption-key custody and isolated restore target. No customer database/media backup was exported to an unapproved destination.
- External alert recipient/service. Repository security alerts and in-app delivery status are operational; application paging has not been configured or tested.
- Owner enrollment/recovery verification for GitHub, Vercel and Supabase MFA.
- Root/service/Meta credential inventory and provider-level revocation after all consumers are known.
- Independent penetration assessment. This engineering work cannot be described as independent certification.
- Optional hosted leaked-password protection requires Pro or higher; the current organization is Free and no paid plan was enabled.

See OPERATIONS.md for deployment, rotation, backup and delivery procedures. Prior reliability/MFA/scheduler SQL was applied outside migration-history tracking; compare schema before automatic migration pushes.
