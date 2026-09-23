# TikTok browser events — 2026-09-23

## Configuration

In the quiz editor, open **טראקינג**, save the **TikTok Pixel Code**, then choose **הוסף אירוע TikTok**. This shortcut enables only the TikTok browser destination by default. The ordinary event dialog can target TikTok, Meta Pixel, Meta CAPI and GTM independently.

Supported selections match the existing event editor: PageView, Lead, ViewContent, InitiateCheckout, Purchase, CompleteRegistration and Custom. Configure a trigger, optional answer/score condition, optional monetary value and currency, and enabled state. Event editing reloads the selected definition; clearing conditions or value persists the removal. Failed saves keep the dialog open for retry.

Triggers:
- Quiz load.
- After answering a selected question (conditions can inspect that answer).
- After the contact form passes validation.
- After successful submission persistence.
- Quiz completion; when a submission is required, this waits for successful persistence too.

Prefer **לאחר שמירה מוצלחת של הפרטים** for a saved-lead conversion. The contact-form trigger measures the form step, not durable persistence.

The existing enabled TikTok integration remains the pixel-ID source; no token or TikTok account login is required for browser tracking. Until any explicit TikTok event definition exists, legacy integrations send PageView on quiz load and Lead after successful save. Once explicit TikTok definitions exist, including disabled ones, those definitions replace the automatic pair. Configure PageView explicitly if desired. Disabling the pixel integration disables all TikTok delivery.

## Delivery behavior

- One SDK initialization per pixel; calls use the configured pixel instance instead of broadcasting.
- Stable definition/session event IDs and local deduplication prevent Back/repeated-step duplicates.
- Trigger snapshots queue while settings load, preserving the answer values at trigger time.
- TikTok configuration is scoped to the signed quiz and workspace; only enabled, validated public pixel IDs are returned.
- The SDK is preloaded and redirects wait for configuration plus bounded SDK readiness. Blocked SDKs do not trap visitors indefinitely.
- TikTok configuration failure falls back independently so it does not permanently suppress Meta/GTM.
- The legacy integration-dispatch callback no longer sends another TikTok lead.
- Event properties include configured value/currency, not questionnaire answers, names, email or phone. Conditions are evaluated locally.
- Meta CAPI remains a separate Meta-only server destination. TikTok Events API is not part of this browser-pixel feature.

The additive migration `20260923122758_tiktok_tracking_events.sql` adds `send_to_tiktok boolean not null default false`; existing definitions and RLS are retained.

## Validation

- 119 security tests and 15 query/performance tests passed, plus lint, TypeScript, build and dependency audit (zero vulnerabilities).
- Chrome fixture: create/edit/reload TikTok events; persistence of destination, trigger and value; clearing condition; delayed configuration; answer-condition matching; Back dedupe; failed-save/retry gating; stable IDs; one SDK script; Meta completion regression; disabled pixel.
- Fast automatic redirect with delayed pixel configuration retained the queued completion event before navigation; blocked SDK readiness released within the bounded wait.
- Conversion tests used isolated fixtures and blocked external SDK traffic, inspecting actual SDK queues rather than generating fake customer conversions.
- Real SDK test on the existing configured pixel: SDK resources and TikTok collection POSTs returned HTTP 200, without JavaScript errors. Only a real page visit was made; no fabricated Lead/Purchase was sent.
- Temporary fixture owners and their workspaces were removed.

HTTP 200 and correct SDK calls verify transport and application behavior, not attribution or final Events Manager reporting. Those account-side reports were not accessed. Ad blockers, browser privacy controls and third-party outages can still prevent delivery.

## Official references

TikTok recommends Lead/Purchase for new setups; legacy SubmitForm/CompletePayment remain supported: [updated standard events](https://ads.tiktok.com/help/article/how-to-adopt-tiktoks-updated-standard-events?lang=en).

Custom event names are limited to 50 characters with the documented character rules: [custom events](https://ads.tiktok.com/help/article/custom-events?lang=en).

Stable event IDs support provider-side duplicate suppression: [event deduplication](https://ads.tiktok.com/help/article/event-deduplication?lang=en).
