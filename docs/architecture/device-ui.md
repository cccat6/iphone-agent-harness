# Device onboarding UI

`apps/web/ui/device-panel.js` is a fixed UI module used by the Harness device panel. Its localized copy is in `apps/web/locales/device.js` (eight languages). It subscribes to language changes without translating user input, fingerprints, device IDs, or nonce content.

The user flow is: configure home Wi-Fi once using the board's Wi-Fi setup page → return to Harness using the provided link → tap Connect → switch back from the device connection tab → pair the phone with ESP32 in Bluetooth settings → run Connection test (the eight-digit input test) → enable AssistiveTouch using the tutorial → start screen sharing. Full Keyboard Access is not a required setting. No CA profile is installed in this flow.

The Connect click opens the device window synchronously before the first await. The app only reports connection readiness after an actual request returns while the device tab is hidden and Harness is visible. Keep that tab open during control. There is no Direct LAN mode selector in the Safari UI. The tested Safari 27.0.1 blocked direct HTTP/WS; the local-window experiment subsequently passed five GET/POST requests including both-tabs-hidden requests during screen sharing, over about 21 seconds. Physical ESP32/HID and longer sessions remain separate checks.

The device connection code is cleared from its input before pairing. A setup return link places it in the URL fragment, removes that fragment on entry, and fills only page memory. Ordinary device settings contain public origin, stable identity metadata and client ID. The per-client device credential is saved automatically in a separate browser-local credential record, outside session exports. No user vault password or phone unlock code is requested. Restoring saved credentials does not enable control until the current page receives a new phone-input proof. Closing the connection tab invalidates that proof; reconnection is explicit.

The dedicated challenge input is readonly and focused synchronously before the start request. A private buffer accepts only trusted foreground keydown events: Digit codes take precedence over layout-dependent key values; numpad and ASCII fallback are supported. Synthetic, repeated, modified, pasted, and non-digit input is rejected. Digits arriving before the HTTP response are retained. The code is masked and not logged. The collector expires after 30 seconds and stops when the panel closes or its target changes.

The homepage and conversation header show current device readiness. New-session and send actions require a fresh device status check and completed input proof. Existing conversations remain readable while disconnected. A five-second status monitor and foreground refresh clear stale readiness when LAN or Bluetooth connectivity fails; reconnection requires another input test.

The app supplies a dynamic device adapter to `createHarness`. Trusted run metadata supplies writer IDs and safe claim permission to `getExecutionContext`. Tasks can claim or reclaim only under the client's verified, released, idle conditions, and only the owning run can renew or end its lease. The optional explicit control check claims and then releases a temporary lease; it does not advertise persistent control. No background timer is presented as a guarantee of Safari scheduling.

## Earlier UI checks (legacy transport, 2026-10-18)

- Syntax checks passed for the module and app integration.
- Three focused Node tests passed for trusted digit parsing and all eight locale keys/placeholders.
- Two route regression tests execute the app's actual route normalizer: unsupported phone + IndexedDB failure still reaches the non-dismissable root gate; desktop and supported-phone runtime storage failure retain the homepage fallback.
- `tests/browser/device-panel.html` is an explicitly labelled isolated fixture. Its fake client performs no fetch, BLE, USB, real screen sharing or model calls. Native Chrome UI input verified pairing alone leaves control disabled; a focused readonly input accepts eight native digit keys; confirm plus settings acknowledgement publishes the mock client; mock sharing state follows the capture object. Screenshot: `screenshots/device-onboarding-mock-zh.png`.
- Chrome's extension/CDP interface timed out before command dispatch, so these checks used the documented native Chrome accessibility interface. A later reload did not visibly complete; no final mobile viewport or eight-language live DOM claim is made. Resource parity is covered by the locale test. The test tab and local-only port 18831 server were closed.

The fixture verifies UI transitions only. Production device pairing, HID delivery, lease contention and capture-to-control execution still require the separately scheduled device integration test. No firmware was flashed or physical device contacted by this UI pass.


## USB setup information

The desktop flashing page reads structured board information only after a user click. It shows the device Wi-Fi name/password, pairing code, local address and phone setup link. Sensitive fields start masked and can be cleared. No CA download is presented. Legacy `httpsUrl` responses remain parseable; the new firmware reports `httpUrl` and `manualTrustRequired:false`.

## Current verification boundary

Node tests cover local address validation, setup-link import, window source/origin/nonce checks, hidden-helper readiness, cancellation, timeouts and no automatic replay. The actual firmware helper JavaScript is also executed in a host VM test. These checks do not replace Safari background or physical HID acceptance. [Real-phone evidence](../research/ios-lan-probe20261018.json) records what actually reached the LAN server.
