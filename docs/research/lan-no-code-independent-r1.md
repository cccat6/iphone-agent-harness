# LAN handshake and code-free connection: independent review

Date: 2026-10-19

Result: no new reproducible defect found in the reviewed change. This is source, host-rendering and simulated-browser verification; it is not proof of Safari behavior on the user's phone or of flashed firmware.

## Scope

Read the actual transport, device client and panel, setup-link and USB parsing, firmware LAN helper, settings page, settings parser and HTTP handlers before running the relevant tests. The intended removal of the connection-code feature is treated as an explicit product requirement. Bearer tokens and the phone input-verification requirement remain in scope.

## Findings checked

- A helper with no `window.opener` can bind through the parent's proactive hello. It accepts only the configured Harness origin and matching fragment nonce, then pins the exact source window. Requests before binding and messages from a different source do not reach the HTTP service.
- The parent validates source, local origin, nonce and helper instance. It requires a successful identity response with the helper hidden and Harness visible before becoming ready. The existing queued visibility/probe race is covered.
- Lost initial hello messages are retried within the connection deadline. These retries do not replay HTTP operations. Cancellation, timeout and helper reload invalidate the connection; late responses do not restore it.
- The routing nonce stays in the helper fragment so reload is detectable through a new helper instance. Every explicit connection uses a unique window name, avoiding reuse of an orphaned tab.
- The connected/waiting helper tells the user to return using Safari's tab switcher and keep the helper open. It no longer offers a focus button that could appear to work while doing nothing. A page with no nonce instead has a real Harness link.
- Firmware enrollment accepts `clientId` without a connection code. Legacy code fields are tolerated for compatibility but not enforced or persisted. Existing `pairingCodeRequired: true` settings cannot re-enable the removed feature.
- The browser no longer displays a code input, exports codes in setup links, imports old setup-link secrets, or retains old USB enrollment secrets. Legacy firmware that still requires a code produces an upgrade error rather than asking the user to enter a secret.
- Enrollment still returns a bearer token, protected routes still authenticate it, and network enrollment does not fabricate a verified phone input target. Existing route, origin, body-size and concurrency limits remain intact.

## Executed validation

All 36 tests passed in:

- `tests/web/lan-handshake-recovery.test.mjs`
- `tests/web/device-window.test.mjs`
- `tests/web/independent-lan-window-r1.test.mjs`
- `tests/web/independent-lan-window-r2.test.mjs`
- `tests/web/device-optional-code.test.mjs`
- `tests/web/device-lan-setup.test.mjs`
- `tests/web/optional-bridge-review.test.mjs`

`sh tests/firmware/run_html_render.sh` also passed. It compiled and ran the production renderers using ArduinoJson, checked the HTML replacement regression and script-boundary escaping, executed both rendered pages for all eight locales, and exercised Wi-Fi completion/error paths and the settings page's code-free enrollment, expired credential, hostname change and busy response. Rendered helper: 8,800 bytes; setup page: 5,499 bytes.

No production source was changed by this review. No network request, serial access, firmware flash, clipboard operation, phone input, deployment or GitHub Action was performed.

## Remaining physical evidence

The parent session must verify the flashed C3 serves the current helper and that the user's Safari connection returns to a working Harness connection. Simulated `WindowProxy`/visibility events cannot establish Safari's actual scheduling or opener behavior. Code-free settings migration was exercised with the production parser on the host, not by this reviewer against physical NVS.
