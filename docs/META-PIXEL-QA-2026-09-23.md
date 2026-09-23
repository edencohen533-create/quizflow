# Browser Meta Pixel verification

The published probiotic quiz has a browser Pixel ID and enabled PageView/Lead definitions. A server CAPI token is separate and is not required for browser tracking.

Changes:
- Use one shared SDK loader for configured tracking events and legacy Meta integrations.
- Initialize each pixel once per document; send events only to the intended pixel.
- Use trackSingleCustom for custom definitions and trackSingle for standard definitions.
- Preserve the definition/session event ID used for browser/server deduplication.
- Reject malformed Pixel IDs and normalize whitespace when saving.
- Present server tokens and test-event codes in a separate optional CAPI section; server-test failures do not describe browser Pixel health.

Seven behavioral regression tests cover initialization, multiple pixels, custom events, SDK reuse, invalid IDs, pixel-only operation without a token, and disabled/conditional events.

The commands and eventID signature follow Meta's maintained template:
https://github.com/facebook/GoogleTagManager-WebTemplate-For-FacebookPixel/blob/main/template.tpl

Browser network verification is recorded in the pull request after deployment. Loading fbevents.js alone does not prove event delivery. A successful browser request does not prove attribution or Events Manager reporting.
