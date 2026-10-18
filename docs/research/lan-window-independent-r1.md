# Independent LAN window review — 2026-10-18

Reviewed the candidate LAN HTTP connection window and its product integration. Local HTTP is an authorized architecture choice. This review did not access serial ports, flash firmware, send phone input, read real credentials, deploy, or change implementation files.

## Result

One new compatibility defect was found, reported to the implementation owner, fixed, and independently retested. No further reproducible defect was found in the reviewed scope.

The original USB setup UI generated a return link for legacy HTTPS firmware. Pasting that link hid the independent fingerprint controls and supplied an empty expected fingerprint, so HTTPS pairing necessarily failed. The fix restricts current return links to LAN HTTP, keeps legacy USB information readable with localized upgrade guidance, and retains manual HTTPS address/fingerprint handling. Independent tests verify the repaired UI and rejection of legacy links after fragment removal.

## Reviewed behavior

- The production Connect handler opens the helper synchronously before asynchronous storage access. Closing setup during allocation cancels the opening connection and prevents pairing.
- Each connection has a unique named window and nonce. The parent checks window object, exact origin and nonce; response messages additionally match helper instance and request ID. A changed helper instance closes the transport. The helper checks opener object, configured Harness origin and nonce before forwarding.
- Ready requires an identity round trip with the helper hidden and the Harness visible. A queued visibility event can retry a probe that was already running.
- The bridge forwards only fixed GET/POST routes, permitted headers, at most 8 outstanding requests, 8,192 request bytes and 262,144 response bytes. It rejects malformed UTF-8, strips credentials/referrer behavior from fetch, and disallows redirects.
- Cancellation is forwarded to the actual helper fetch. Page hide aborts pending helper work and disconnects the parent. A dropped or timed-out mutation is not automatically replayed. Request cancellation alone leaves the connection available for subsequent requests; it does not claim that device-side execution was undone.
- Firmware admits the helper marker only with its expected local Host and a same-origin or absent Origin. The existing owner code, bearer grant, target binding, writer lease and request admission fences remain in the API path. The helper itself serves only the configured HTTPS Harness opener.
- Setup fragments are erased before parsing, including malformed or legacy input. USB secrets remain masked until explicitly revealed.
- Reviewed worker/wrangler paths have no diff. No cloud command relay was introduced in the inspected changes.

## Independent verification

Added `tests/web/independent-lan-window-r1.test.mjs`. Seven tests run the actual embedded firmware JavaScript against the actual `DeviceWindowTransport`, plus production panel and USB handlers with a minimal DOM adapter:

1. Scoped request round trips and wrong-source/origin/nonce/path/header rejection.
2. Abort forwarding without duplicate mutation or late-response resurrection.
3. Helper page hide aborting an outstanding request and disconnecting once.
4. Response byte limits and malformed UTF-8 rejection.
5. Popup ordering before storage and cancellation during setup allocation.
6. Legacy HTTPS USB information without an unusable setup link.
7. Fragment erasure before malformed/legacy link rejection.

All seven passed. After the compatibility fix, the combined independent/transport/setup/prior-identity suite passed 26/26 tests. An earlier focused client/transport/setup run passed 41/41 tests. `tests/firmware/run.sh` passed its Core, admission, external replay-storage, setup-state and actual BLE-router host fixtures. Focused whitespace checks passed.

## Evidence boundary

The JavaScript tests use synthetic responses and do not establish Safari browser-policy behavior or physical ESP32 networking. The host firmware fixtures exercise admission and execution safeguards, not the ESP HTTP stack. The independently recorded iPhone fixture GET/POST evidence is in `ios-lan-probe20261018.json`; this review inspected that record but did not repeat its phone test. Physical firmware installation, product helper operation on that firmware, HID behavior and longer background operation remain separate acceptance steps. Build and publication status are owned by the main task, not inferred from this review.
