# Optional bridge connection review — R1

Date: 2026-10-19. Independent review of the current working tree; no serial access, firmware flashing, real-network mutation or deployment performed.

## Finding

**P1: a stored expired browser credential permanently blocks default code-free reconnect.** The device panel restores its saved credential and verifies the board identity, then `/v1/binding` returns 401. The saved token is retained and every later Connect repeats the same failure; the normal code-free flow provides no way to discard it. Reproduced with the production `DeviceClient` and production panel handler in `tests/web/optional-bridge-review.test.mjs`. Requested recovery is confined to an explicit connection attempt, after verifying the same board, and to one enrollment retry for an authentication-expired response. Other origin/network/identity errors must not trigger enrollment or phone input.

## Checked

- Firmware defaults are `igent.local` and connection-code disabled, including existing NVS installations with no new settings record; explicit persisted hostname/mode overrides survive loading.
- Settings persistence verifies the written record; hostname changes schedule a restart after idle checks, without erasing Wi-Fi or Bluetooth data.
- `/settings` is a standalone local page. Its same-origin `/v1/settings` requests are separate from the restricted Harness helper path list. Owner code is not returned by public identity and is returned only to the authenticated settings page when enabled.
- The AP setup page still embeds its internal owner value for `/configure` and `/finish`; the user does not need to supply that value. USB setup and ordinary return links accept explicit code-free mode.
- Current and legacy endpoints, stored identity checks, default address, required-code prompt, locally persisted tokens and UI readiness boundaries were inspected. Pairing a browser does not fabricate phone input proof.
- Manager page handles code-free entry, protected entry, wrong code, stale token, all eight locales, hostname restart link and code display before reboot. Failed save leaves the form retryable.

## Executed checks

- `node --test tests/web/device-optional-code.test.mjs tests/web/device-onboarding-flow.test.mjs tests/web/device-ui.test.mjs tests/web/device-window.test.mjs`: 18 pass.
- `sh tests/firmware/run_html_render.sh`: actual ArduinoJson 7.4.3 rendered helper/AP/manager scripts pass; eight language DOM checks, AP success/failure/timeout/finish refusal, manager login/restart/busy refusal pass.
- Added independent saved-credential recovery scenarios: successful expired-token recovery, required-code prompt after expiry, no retry for 403 or different board, and at most one retry when the replacement token also fails. Before the fix: 3 fail, 2 pass, matching the finding above.

Physical mDNS resolution, browser background lifecycle, Bluetooth and phone input are outside this read-only review.

## Fix verification

The UI author corrected the saved-token path during this review. I re-read the implementation and independently reran production client/panel scenarios: 19 related tests pass, including all five added regression scenarios. Recovery is available only to the explicit Connect operation and only from the authenticated binding read's exact 401/`DEVICE_AUTH_EXPIRED`; the saved board fingerprint and client ID are retained. A second 401 fails normally. Required-code mode opens the code field, while 403 and a different board never cause enrollment. No phone input is emitted by this recovery.

No further reproducible defect was found in this review's scope after that correction. A fresh reviewer should still perform the next independent pass required by the overall task.
