# Device onboarding UI

`apps/web/ui/device-panel.js` is a fixed UI module used by the Harness device panel. Its localized copy is in `apps/web/locales/device.js` (80 entries in eight languages). It subscribes to language changes without translating user input, fingerprints, device IDs, or nonce content.

The setup flow is: protected hotspot/Wi-Fi setup → manually install the board's CA and explicitly enable iOS full trust → enter its unique HTTPS origin and independently obtained CA fingerprint → pair with the setup owner password → select a real connected/encrypted/HID-subscribed target → receive eight foreground trusted keyboard digits → confirm the challenge → acknowledge AssistiveTouch enabled and Full Keyboard Access disabled → start screen sharing. The website does not change iOS settings, install certificates, or bypass Safari warnings.

The password is cleared from its input before the pairing await, and the client pins the independently checked fingerprint before transmitting it. Ordinary device settings contain public origin, fingerprint and stable client identity metadata. Optional encrypted storage seals the client's exported token record using a user passphrase. Neither the token nor setup password is written to ordinary settings. Restoring saved credentials does not enable control: the current page must receive a new trusted HID challenge. A page-local proof records board, boot, client and target IDs; only matching live client state plus the two settings acknowledgements can be passed to the Harness.

The dedicated challenge input is readonly and focused synchronously before the start request. A private buffer accepts only trusted foreground keydown events: Digit codes take precedence over layout-dependent key values; numpad and ASCII fallback are supported. Synthetic, repeated, modified, pasted, and non-digit input is rejected. Digits arriving before the HTTP response are retained. The code is masked and not logged. The collector expires after 30 seconds and stops when the panel closes or its target changes.

The app supplies a dynamic device adapter to `createHarness`. Trusted run metadata supplies writer IDs and safe claim permission to `getExecutionContext`. Tasks can claim or reclaim only under the client's verified, released, idle conditions, and only the owning run can renew or end its lease. The optional explicit control check claims and then releases a temporary lease; it does not advertise persistent control. No background timer is presented as a guarantee of Safari scheduling.

## Verification, 2026-10-18

- Syntax checks passed for the module and app integration.
- Three focused Node tests passed for trusted digit parsing and all eight locale keys/placeholders.
- Two route regression tests execute the app's actual route normalizer: unsupported phone + IndexedDB failure still reaches the non-dismissable root gate; desktop and supported-phone runtime storage failure retain the homepage fallback.
- `tests/browser/device-panel.html` is an explicitly labelled isolated fixture. Its fake client performs no fetch, BLE, USB, real screen sharing or model calls. Native Chrome UI input verified pairing alone leaves control disabled; a focused readonly input accepts eight native digit keys; confirm plus settings acknowledgement publishes the mock client; mock sharing state follows the capture object. Screenshot: `screenshots/device-onboarding-mock-zh.png`.
- Chrome's extension/CDP interface timed out before command dispatch, so these checks used the documented native Chrome accessibility interface. A later reload did not visibly complete; no final mobile viewport or eight-language live DOM claim is made. Resource parity is covered by the locale test. The test tab and local-only port 18831 server were closed.

The fixture verifies UI transitions only. Production HTTPS pairing, actual board certificate trust, HID delivery, lease contention and capture-to-control execution still require the separately scheduled device integration test. No firmware was flashed or physical device contacted by this UI pass.


## USB setup information

`apps/web/ui/usb-setup.js` adds the explicitly initiated setup read to the desktop firmware page using `readDeviceSetup`. It displays only validated structured fields. AP and setup owner passwords start as masked inputs and live only inside the mounted component. The user can reveal them deliberately or clear them; navigating away disposes the component and removes their DOM and memory references. The module never calls logging, settings, or remote APIs with this record. CA profile downloads require an already-read, CA-ready board and the same independently read fingerprint in the profile response. Downloading a profile does not install or trust it.

The separate `tests/browser/usb-setup.html` fixture injects mock information and performs no serial call. Native Chrome UI verified local read → masked password inputs → explicit clear removes the information. All eight language selections updated the title, help, button and empty state through the locale subscription. The English masked-state screenshot is `screenshots/usb-setup-mock-en.png`. The test tab and local-only port 18831 server were closed after verification. The actual USB button was never used during this UI pass.

## Stable public client identity

Owner re-enrollment calls `store.ensureDeviceClientId(boardOrigin)` before pairing. The non-sensitive random ID is saved atomically per canonical HTTPS board origin in ordinary IndexedDB settings, independently of memory-only or encrypted tokens. Reloading and pairing again rotates that client’s token instead of consuming another of the board’s eight registration slots. A restored current client can seed a missing ID. This identity grants no access by itself: CA/fingerprint verification, owner proof and a fresh page-local HID challenge remain required. Concurrent IndexedDB handles converge in one readwrite transaction. Clearing site data loses this public ID as well as other local configuration.
