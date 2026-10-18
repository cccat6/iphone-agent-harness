# Device connection flow: independent review R1

Date: 2026-10-19

Scope: current device onboarding changes in the Web UI, setup-link return lifecycle, WebRTC progress reporting, and the bridge's public information page. This review did not open a serial port, flash firmware, send phone input, deploy, or claim iPhone acceptance.

## Findings and resolution

1. The connection card always carries `data-unavailable` with the string `true` or `false`. The original CSS attribute selector matched both values, leaving a configured bridge styled as unavailable. Reported to the main agent; the selector now explicitly matches `data-unavailable="true"`. Closed.
2. Two existing handler fixtures omitted browser `location`, causing setup-link inspection to throw and the new prerequisite gate to reject their saved metadata. This was a test-environment problem, not evidence of failure in a browser. Reported to the main agent; an absent location/hash is now treated as no import, while malformed actual import fragments still fail. Existing fixtures pass. Closed.

No additional blocking defect was found in the reviewed lifecycle after those changes.

## Independent regression coverage

Added `tests/web/connection-flow-independent-r1.test.mjs` with five lifecycle scenarios:

- A fresh browser displays information acquisition first. Connect, phone input, and sharing remain blocked; invoking the disabled handler directly sends no request.
- Imported public RTC metadata is stored before any connection attempt. An identity/read failure leaves that information available for retry and panel reopening, closes the failed transport, and preserves the original localized error rather than replacing it with a cleanup error.
- A failure before data-channel readiness leaves its error visible and the connection button available for another explicit attempt.
- Leaving for the bridge closes the old RTC connection while retaining saved metadata and the tab-local return marker. On reopening the panel, no connection occurs until the user chooses Connect.
- The return marker expires, is consumed once, and the import URL carries the selected language and original HTTPS session URL without an old fragment.

The handler tests use a simulated DOM, simulated transport, and in-memory store. They validate application sequencing and state, not Safari navigation mechanics or Bluetooth behavior.

## Executed checks

The following command completed with **26 passed, 0 failed**:

```sh
node --test tests/web/connection-flow-independent-r1.test.mjs tests/web/device-onboarding-flow.test.mjs tests/web/device-rtc-recovery.test.mjs tests/web/rtc-import-identity-independent.test.mjs tests/web/device-lan-setup.test.mjs tests/web/device-rtc-setup.test.mjs tests/web/device-rtc.test.mjs
```

`sh tests/firmware/run_html_render.sh` also passed. It compiles the actual page strings and executes their scripts, including all eight languages, public identity-only import without management enrollment, blocked local storage, request retry, safe return URL selection, and hidden management controls.

Source review additionally checked that application boot reopens the device panel on either a returned import fragment or a pending return marker, and that persisted-page restoration uses the `pageshow` return path. Real Chrome/Safari UI and live bridge checks belong to the main agent's separate acceptance work. The user's iPhone remains the authority for final phone input and navigation acceptance.
