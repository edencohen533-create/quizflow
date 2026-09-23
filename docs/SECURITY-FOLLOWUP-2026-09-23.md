# Security follow-up — 2026-09-23

## Live changes and validation

Supabase's security advisor identified mutable search_path on set_updated_at and unnecessary direct EXECUTE grants on three SECURITY DEFINER trigger functions. These functions return trigger and are intended for database-trigger execution; the advisory is not evidence of an observed compromise or a successful remote exploit.

Migration 20260923020552_restrict_internal_trigger_functions.sql pins an empty search_path on all four functions and revokes direct EXECUTE from PUBLIC, anon and authenticated. Referenced application tables were already schema-qualified; PostgreSQL built-ins resolve through pg_catalog.

Rollback-only tests in tests/sql/internal-trigger-functions.sql verified:
- signup still provisions profile/workspace;
- authenticated lead inserts still create status history;
- authenticated conversation messages still update preview/unread count;
- quiz updates still refresh updated_at;
- neither anon nor authenticated has direct EXECUTE on the four internal functions.

The initial test referenced a nonexistent leads.updated_at column and rolled back. It was corrected to exercise the actual quizzes timestamp trigger; the corrected test passed with all fixtures rolled back.

The follow-up live advisor no longer reports mutable search_path or anonymous SECURITY DEFINER exposure for these functions.

## Reviewed intentional findings

- quiz_tracking_secrets and request_buckets intentionally have RLS with no user policies: these are server-only tables. Adding permissive policies to silence an INFO finding would weaken the boundary.
- save_quiz_flow is intentionally executable by authenticated callers; it explicitly checks caller ownership and MFA and uses optimistic revision checks.
- session_meets_mfa is intentionally executable by authenticated callers so RLS can evaluate their assurance level.

## Remaining work

Leaked-password protection is disabled. Supabase documents this as a Pro-or-higher feature; no paid upgrade was requested or performed. See [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Backups/restore need an approved destination or cost approval; platform MFA requires owner enrollment; external paging requires a destination; Meta needs owner configuration; full nonce-based script CSP, managed credential transition and independent penetration/capacity testing remain open. This follow-up does not certify complete security.

The delivery scheduler remained active and successfully executing during the audit.

Operational note: the earlier reliability/MFA/scheduler SQL was applied using the SQL CLI and is not recorded in hosted migration history. Check actual schema and the documented application order before using automatic migration push; do not blindly replay or mark migrations without comparison.

Advisor references:
- [Function search_path](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable)
- [Anonymous SECURITY DEFINER execution](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)
- [Authenticated SECURITY DEFINER execution](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
