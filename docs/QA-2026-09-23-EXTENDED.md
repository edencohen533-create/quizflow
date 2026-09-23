# Extended QA — 2026-09-23

## Confirmed defects corrected

- The API accepted arbitrary/invalid calendar dates, including a non-leap February 29.
- A required numeric answer could use the optional skip marker; JavaScript-specific numeric forms such as hexadecimal also passed despite not being valid number-input values.
- Optional rating questions forced a selection in the browser and rejected the empty marker on the server.
- Name answer payloads accepted up to 4,000 characters although the visible name field and contact record support 200.
- Freeform text/number/date controls did not submit on Enter and did not enforce the API text limit before the final save.
- Session tracking accepted completion with missing required answers or an unrelated terminal node, but rejected legitimate redirect-action endings.

A shared pure validator now handles dates, finite decimal/scientific numbers and ratings in both runner and API. Numeric/date/rating optional skips remain supported. Long-text Enter remains a newline; number/date/text use native form submission. Text fields have accessible names and a 4,000-character limit.

Completed session reports now reconstruct the signed session's actual quiz path and check the reported terminal ID before any database write.

## Verification

- Three focused normalization regressions reproduced failures against the previous implementation; all passed after the change.
- Five new automated regression tests cover input validation, optional skips, name limits, rejected completion and redirect completion.
- Vercel preview: **112 security tests + 11 performance tests passed**; lint, TypeScript, production build passed. Dependency audit: **zero vulnerabilities**. GitHub: **zero open Dependabot alerts**.
- Real Chrome mobile-width fixture: missing required number blocked; decimal and leap-day answers advanced with Enter; multiline Enter remained a newline; optional rating skipped; real submission succeeded with score zero; redirect reached its target; stored session was completed.
- Direct signed API attempts: required-number skip, invalid leap day, skipped required answers and unrelated terminal completion returned 400; no lead was written for rejected submissions.
- Existing probiotic questionnaire regression: name/Back/edit personalization, phone/email/consent validation, layout overflow, displayed save failure and retry passed. Writes and external tracking were intercepted for this existing customer quiz.
- Isolated fixture users/workspaces were deleted. Independent SQL confirmed all three preview audit users were gone.

The first redirect test waited for a Playwright response event after navigation and timed out. Investigation verified the actual stored session was completed. The corrected assertion checks persisted state after navigation; this was a test-observation issue, not an additional application fix.

## Infrastructure findings and limits

Supabase advisor findings were reviewed without weakening RLS or changing account plans:
- Server-only secret/rate-limit tables intentionally have RLS with no client policy.
- The previously reviewed owner/MFA-checked SECURITY DEFINER functions remain flagged.
- Leaked-password protection remains disabled. [Supabase guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- Performance advisories remain: nine foreign-key indexes, 24 auth/RLS initplan recommendations, 36 overlapping permissive-policy observations and six unused-index observations. These are advisory opportunities, not measured regressions in this run; no bulk production policy/index changes were made. [RLS performance guidance](https://supabase.com/docs/guides/database/postgres/row-level-security#rls-performance-recommendations).

This pass adds behavioral and API regression coverage; it is not an independent penetration test, exhaustive proof of security, multi-hour load test or backup/restore drill. Backup restoration, verified email alert receipt and gift-email automation remain operational follow-ups.
