# Optional bridge connection review — R3

Date: 2026-10-19. Fresh scoped review of the repaired production Web and firmware sources. **No new reproducible issue found in this review.** Default code-free operation and the preset `http://igent.local` address are explicit product requirements.

## Scope and result

- Verified firmware hostname/code-mode defaults, persisted overrides, and use of the persisted hostname at boot and mDNS startup. The local `/settings` page is available directly and from the connected Web device panel.
- Read the production pairing path: a disabled connection code permits enrollment without one; enabled mode returns distinct missing/incorrect-code errors. Enrollment alone does not authorize phone input.
- Checked default-address UI, collapsed connection configuration, separate optional Wi-Fi setup, and synchronous local-window opening before storage awaits. Saved automatic hostnames migrate to the preset while retaining the prior board identity check.
- Checked explicit reconnect recovery: an expired saved credential can enroll once after a binding-read 401. A foreign board, 403 denial, or second 401 does not loop. Protected mode exposes the code input. This recovery never resends phone input or creates input-test proof.
- Read current target selection and status propagation: only a connected, encrypted, HID-subscribed target is selectable; disconnection clears input proof; refreshing state does not manufacture proof from the persistent binding.
- Checked USB and shared setup-link handling: an explicitly code-free setup carries no owner code; legacy/protected setup remains supported. The actual rendered AP page now applies the same rule using the reported persisted mode.
- Reviewed local settings save: strict hostname/Boolean validation, active-work checks, NVS write/read verification with restoration on failure, and delayed hostname restart. Both save and restart use `Core::configurationBusy(now)`, which ignores empty slots and disconnected release-pending phones while retaining live release, running-action, and unexpired-lease checks. Active input challenges also block configuration. This path does not erase Wi-Fi or Bluetooth state.
- Reviewed the rendered settings page: code-free entry, enabled-code login, stale-token recovery, retry after a busy rejection, and visible connection code/new address before restart. All eight locales are present.

## Executed checks

- `node --test tests/web/device-optional-code.test.mjs tests/web/optional-bridge-review.test.mjs tests/web/device-onboarding-flow.test.mjs`: **12 passed**.
- `sh tests/firmware/run_html_render.sh`: **passed**, using pinned ArduinoJson 7.4.3 and the production HTML renderers. Includes complete scripts, eight-language helper/AP/settings behavior, both code-free and protected AP return links, join failure/timeout, refused finish, stale settings token, hostname restart, and busy refusal.
- `sh tests/firmware/run.sh`: **passed**. Includes 18 Core scenarios in each default/256-event/128-event build, 8 admission scenarios, 3 external replay-storage scenarios, setup state scenarios, 12 BLE routing scenarios, production callback/diagnostic checks, and 11 bond-lifecycle scenarios.

No production files were modified during this review. No network requests to a real device, serial access, phone input, flashing, or deployment were performed. This report does not independently establish iOS browser behavior, physical mDNS resolution, Bluetooth pairing, or persistence across an actual board reboot; those need their separate live evidence.
