# Hosted security audit — 2026-10-03

## Fixed: Storage mutations bypassed enrolled MFA

After MFA enrollment, password-only sessions could still mutate their own quiz-media objects. Existing ownership policies did not enforce the second factor. The accompanying migration adds restrictive INSERT, UPDATE, and DELETE policies using session_meets_mfa(), combined with the existing ownership policies. Public reads and other buckets are unaffected.

The migration was applied to the hosted project and verified through real Auth, Storage, database REST, and application HTTP requests using two disposable synthetic users. All fixtures were cleaned up. Results after the fix: 32/32 checks, including cleanup. The pre-fix run reproduced password-only upload/update/delete access.

## Checks after fix

- PASS: owner_reads_own_fixture
- PASS: other_user_cannot_read_lead
- PASS: other_user_cannot_read_draft
- PASS: other_user_cannot_read_tracking_secret
- PASS: anonymous_cannot_read_lead
- PASS: anonymous_cannot_read_draft
- PASS: anonymous_cannot_read_tracking_secret
- PASS: cross_tenant_update_denied
- PASS: cross_quiz_insert_denied
- PASS: ownership_transfer_denied
- PASS: storage_owner_upload
- PASS: storage_foreign_prefix_denied
- PASS: storage_foreign_update_denied
- PASS: storage_foreign_delete_denied
- PASS: storage_svg_rejected
- PASS: app_foreign_owner_route_denied
- PASS: app_authenticated_dashboard_available
- PASS: mfa_totp_upgrades_to_aal2
- PASS: mfa_aal1_cannot_read_leads
- PASS: mfa_aal1_redirected_to_challenge
- PASS: mfa_aal1_owner_api_denied
- PASS: mfa_aal1_storage_upload_denied
- PASS: mfa_aal1_storage_update_denied
- PASS: mfa_aal1_storage_delete_denied
- PASS: mfa_aal2_storage_update_allowed
- PASS: mfa_aal2_storage_upload_allowed
- PASS: mfa_aal2_can_read_leads
- PASS: mfa_aal1_cannot_remove_factor
- PASS: cleanup_storage
- PASS: cleanup_test_user
- PASS: cleanup_test_user
- PASS: cleanup_workspaces

## Additional evidence and limitations

- Scanned 598 reachable historical Git blobs and 11 public JavaScript assets: no matches for checked secret patterns or available active service-role/cron values. This is not a guarantee that every secret format or unavailable secret was covered.
- All 25 public tables have RLS. Internal tables with no client policy intentionally deny client access. Reviewed intentionally exposed SECURITY DEFINER RPCs for ownership/MFA checks.
- Both existing users lack verified MFA; owners must enroll their own factors.
- Backup availability and an actual restore remain unverified. Management authentication, an approved private backup destination, and an isolated restore environment are still needed. No customer backup was exported or paid service purchased.
- Leaked-password protection remains disabled according to the hosted security advisor.
- This is a scoped review, not an independent comprehensive penetration test. Full browser journeys, denial-of-service/load testing, all cloud account permissions, all secret rotation history, and external-provider delivery were not verified.
- Earlier release validation passed 147 tests, lint, and production build. Production dependency audit had zero findings; nine high development dependency findings rooted in braces remain unresolved.
