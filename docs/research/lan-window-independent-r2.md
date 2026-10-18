# Independent LAN window review, round 2 — 2026-10-18

## Result and scope

No new actionable defect was reproduced in this round. The R1 legacy-HTTPS setup-link defect remains fixed: current return links admit local HTTP only, and older USB setup information displays upgrade guidance without generating an unusable return link.

Reviewed `core/device-window.js`, `core/device.js`, `core/device-setup.js`, `ui/device-panel.js`, `ui/usb-setup.js`, device translations, firmware `LanBridgePage.h`, `SecureService.h`, `main.cpp`, and the firmware builder's source allowlist and released artifacts. This review changed only its independent test and this report. It did not open serial ports, flash a board, read real credentials, send device or phone commands, touch the diagnostic server, deploy, or run GitHub Actions.

## Findings checked

- The Connect and vault-restore paths allocate the helper synchronously before their first storage/decryption await. They clear prior phone proof and challenge state before opening a replacement connection. Closing setup aborts a pending opening and prevents later pairing from an obsolete operation.
- A helper-ready message alone does not complete the connection. The actual identity GET must return while the helper reports hidden and the Harness is visible. The newly added race test holds a completed foreground response, delivers the visibility-ready event while the original probe remains pending, then releases the old response: a second identity GET is required before readiness.
- Parent messages require the exact child window, origin and nonce. Responses must additionally match the current helper instance and a pending request ID; a different instance's response cannot settle the pending request. The actual embedded helper independently checks its opener, configured HTTPS Harness origin, nonce, methods, paths, header names and sizes.
- Both parent and helper independently enforce eight concurrent requests. New tests fill each side separately and verify overflow does not create a ninth fetch. Request and response byte limits remain enforced. Abort is forwarded; timeout closes the transport; neither path resends a mutation. Abort is not represented as evidence that already accepted device work was undone.
- Disconnect invalidates the page's previously observed phone proof. Pairing and restoration still require identity and target checks, and input remains subject to fresh phone proof, the accessibility confirmations, authenticated grants, target binding and writer leases.
- The firmware's helper marker is admitted only with an expected local Host and an absent or matching local Origin. Protected API routes retain the grant and Core admission path. The helper has same-origin fetch, no credentials/referrer, redirect rejection, no-store and frame restrictions. The inspected changes do not add a cloud command relay.
- Current onboarding describes the connection tab and returning to Harness, and explicitly says certificate installation is unnecessary. Legacy HTTPS fingerprint support is behind the legacy address path. The USB return link remains masked with the owner code, and consumed setup fragments are removed before parsing or rejection. This was a source/component review, not a new eight-language visual acceptance sweep.

## Independent validation

Added `tests/web/independent-lan-window-r2.test.mjs` with three tests that execute the actual embedded firmware JavaScript with the actual `DeviceWindowTransport`. They cover the queued visibility handshake race, parent concurrency overflow without a ninth mutation, and separate helper concurrency enforcement plus rejection of an incorrect response instance. HTTP responses and window/document events are synthetic.

The combined R2, R1, transport, LAN setup, independent prior identity, and DeviceClient suites passed **56/56** tests. The host firmware runner also passed: 16 Core scenarios in each of three configurations, seven admission scenarios, three external replay-storage scenarios, nine setup/time scenarios, and twelve actual BLE-router/epoch/deadline scenarios. Host tests do not exercise the ESP HTTP stack or physical radio behavior.

The firmware verifier passed for **four profiles and fourteen current source files**. An additional independent hash calculation, without importing the builder, confirmed that current source bytes match both `build-inputs.json` and `build-report.json`, and that their combined hash is:

`c8c7418b8f8bd27fd1ba93c11f6f322a006f7ee51c2fdff99011e9dd95979bc9`

All **16 binary sizes and SHA-256 values** match the manifest. The build report records successful C3, S3, C6 and ESP32 compilation, and the manifest reports `0.3.0-lan-http`, no manual trust requirement, and `physicalValidation: false`. This round verified those artifacts and provenance; it did not independently rerun the four compilers. The allowlist includes `src/LanBridgePage.h` and excludes local configuration files. The source-aware verifier additionally checked image layout and partition bounds.

## Evidence boundary

The recorded iPhone Safari 27.0.1 diagnostic evidence in `ios-lan-probe20261018.json` shows failed direct HTTPS-page HTTP/WS attempts, successful top-level HTTP navigation, and five successful fixture helper requests spanning about 21 seconds, including both-tabs-hidden requests during recording. This review inspected that record and did not rerun the phone test.

That diagnostic used the Mac LAN fixture. It does **not** establish that the newly built physical ESP32's `/harness-link` page, pairing, target binding or HID input has passed on the phone. A physical installation/read-only API check and a phone test of the actual product helper remain distinct acceptance steps owned by the main task. The short recorded background interval is not an indefinite background guarantee. No deployment or physical-product completion is inferred from this clean source review.
