# Optional bridge connection review — R2

Date: 2026-10-19. Fresh independent review of the working tree. No serial access, physical network requests, phone input, flashing or deployment performed. Default code-free operation is an explicit product requirement and was reviewed as such.

## Finding

**P2: the AP Wi-Fi setup return link still contains the hidden owner code in default code-free mode.** `WifiSetupPage.h` constructs `{v:1,url:connected.httpUrl,id:connected.boardId,owner}` after successful provisioning. `/connection-status` does not currently advertise the code mode. This bypasses the corrected shared Web link builder: the returned link is treated as a legacy protected link, prepopulates the code field, and opens the configuration section even though the bridge is configured to require no connection code.

Reproduced using the actual ArduinoJson-rendered AP page, running its production submit handler with successful simulated `/configure`, `/connection-status` and `/finish` responses. Even when the status fixture explicitly included `pairingCodeRequired:false`, decoding the produced return fragment showed `linkHasOwner:true` and no explicit code-free flag. No secret value was printed. The AP's internal configure/finish proof can remain; only the outward Harness link needs to follow the selected mode.

Reported to the main agent before any source modification, because firmware builds were in progress.

## Checked

- `igent.local` and code-disabled defaults are used when no persisted bridge settings exist; valid saved hostname and code-mode settings override those defaults.
- Public identity reports code mode without the code. Pairing enforces the code only when enabled; missing and invalid code responses map to distinct Web errors.
- Shared Web setup-link creation omits the owner in code-free mode; legacy protected links still parse. USB parsing accepts an empty code only when the firmware explicitly reports code-free mode.
- Daily connection begins at the preset address, with configuration collapsed. The local window opens synchronously before storage awaits. Wi-Fi provisioning is separate from opening the browser-to-bridge connection.
- Existing automatic hostname credentials migrate while retaining board identity checks. The R1 expired-token fix permits only one enrollment attempt from an authenticated binding-read 401 during explicit reconnect. 403 and board mismatch do not enroll, and enrollment does not grant phone input proof.
- The local settings page supports code-free entry and protected login, stores its client identifier, recovers a stale session token, displays enabled code before a hostname restart, and remains retryable after a rejected save.
- Firmware settings writes validate hostname and Boolean mode, check active task/challenge/lease/release state, verify NVS writeback, and defer hostname reboot. Wi-Fi and Bluetooth storage are not erased by this path.
- The 18-file firmware source allowlist includes both new settings headers.

## Executed checks

- `node --test tests/web/optional-bridge-review.test.mjs tests/web/device-optional-code.test.mjs tests/web/device-onboarding-flow.test.mjs tests/web/device-ui.test.mjs tests/web/device-window.test.mjs`: **23 passed**.
- `sh tests/firmware/run_html_render.sh`: actual ArduinoJson rendering, complete helper/AP page scripts, eight locales, AP join/failure/timeout/finish refusal, settings login/stale token/restart/busy behavior passed.
- Additional actual-rendered AP submit reproduction described above: confirmed the return-link defect.

This review does not establish physical mDNS resolution, Bluetooth pairing, iOS background lifetime, or a real reboot/settings persistence round trip.

## Repair verification

The AP return-link omission is repaired. `/connection-status` now reports the persisted mode. The actual rendered AP script emits `pairingCodeRequired:false` with no `owner` when disabled, and includes the owner only for explicitly enabled mode. Reran the actual ArduinoJson renderer and both successful AP modes; decoded-link assertions pass, along with failure/timeout/refused-finish cases.

The main agent's physical test subsequently found a separate settings refusal: empty target slots initialize `releasePending=true`, which the original settings/restart checks treated as active phone work. The shared production `Core::configurationBusy(now)` now ignores empty targets and disconnected release-pending targets, while retaining active-running, unexpired-lease and connected-release-pending checks. Independently re-read both HTTP settings and delayed-restart call sites: both use that shared predicate and still block active challenges. Reran `sh tests/firmware/run.sh`: 18 Core scenarios passed in each default/256-event/128-event build, with admission, replay storage, setup, BLE routing and bond-lifecycle scenarios also passing. The new production Core regression explicitly covers empty slots, offline stored phones, connected pending release, running input and lease expiry.

Reran the focused optional-code/onboarding/credential-recovery JavaScript suite after the fixes: 12 passed. No further reproducible defect was found in this targeted repair verification. Physical settings success and flashing remain evidence owned by the main agent, not this read-only review. A fresh R3 review follows separately.
