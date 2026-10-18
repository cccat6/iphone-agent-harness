# R5 independent review: production Direct and streamed clipboard

Date: 2026-10-19. Read-only review of implementation, with host tests and a local UI simulation. No serial port, browser, phone, deployment, firmware flashing or real clipboard was used.

No new blocking issue was found in the reviewed scope after the fixes below. This is not a claim that the full phone workflow has passed physical acceptance.

## Scope and conclusions

- Reviewed the real Web producer, RTC request framing, firmware single-slot mailbox, native HTTP streaming consumer and matching copy acknowledgement. The browser owns the complete UTF-8 text; the board stores one chunk of at most 1,024 bytes. One HTTP GET streams one complete JSON document. Only a successful HTTP flush commits an offset, and only the final matching Shortcut acknowledgement establishes `copied`.
- Reviewed cancellation, stale session/target/boot responses, duplicate chunks, backpressure, idle expiry and interrupted streams. No unbounded firmware accumulation or replay of uncertain input was found. The practical browser and Shortcut memory/lifetime limits still apply.
- Reviewed onboarding import identity, failed import retry, saved credentials and IP recovery, transient ICE disconnection and firmware saved-network recovery. The new metadata persists after successful connection, and transport failure invalidates input readiness.
- Rechecked the R4 transient-memory fix: the actual pinned Arduino String implementation confirms that null assignment releases the previous allocation, whereas assigning an empty String retains its capacity.
- Reviewed the frozen TLS link guard and its integration into the build and release input hash. It requires all 20 project TLS objects, a uniform 2,048-byte record profile, eight live symbols owned by those objects, and no selected precompiled SDK TLS member. Verified the actual isolated linker map independently; its SHA-256 was `8521cd0f0d0715e732baaaf18520dc97a116d08fb0a84d12e73eaa9353af8640`.

## Main-flow repair verified during R5

The primary agent identified that running the installed Shortcut directly, without URL input, could start the board HTTP stream while the browser producer had not started: previously only pressing the browser launch button started production. I independently confirmed that gap.

The repaired UI calls `arm()` after staging. It begins status polling without navigating, copying or uploading text before an HTTP consumer starts. The launch button remains available while ready. `start()` reuses the same producer promise; it does not create another upload loop. The transition to `streaming` initiates chunk delivery for either Shortcut entry path.

The new direct-Shortcut and shared-producer tests passed. I additionally exercised real `createClipboardController`, `createDeviceClipboard` and `mountClipboardPanel` instances through destruction/remount of the clipboard view before launch. The result was one navigation, one data upload and one continuation callback; the copied receipt was not applied twice. This extra simulation is retained in local build evidence at `build/r5-remount.mjs`.

## Tests executed

- Targeted connection/import/recovery and clipboard suite: **21/21 passed** before the arm repair.
- Clipboard/controller/UI suite after the arm repair: **35/35 passed**.
- `sh tests/firmware/run.sh`: passed, including actual Core/Admission, BLE router and callback lifecycle fixtures, saved-network state, strict JSON, mailbox and streamed JSON tests.
- Actual Arduino SDK String implementation under ASan/UBSan: passed.
- TLS link guard tests: **4/4 passed**; build tool tests: **6/6 passed**. Direct script invocation is required for the tools directory imports; an initial module-mode invocation did not load those two suites, and both were rerun successfully as scripts.
- Firmware release fixtures: **11/11 passed** within the initial combined run; their printed release operations are mocked fixture operations, not GitHub publications.
- Frozen guard against `build/rtc-production-check/compiler/rtc_bridge_check.ino.map`: passed.

Logs: `build/rtc-stream-r5-web.log`, `build/rtc-stream-r5-arm.log`, `build/rtc-stream-r5-host.log`, `build/rtc-stream-r5-string.log`, `build/rtc-stream-r5-guard.log`, `build/rtc-stream-r5-builder.log`, `build/rtc-stream-r5-build.log`. Link proof: `build/rtc-stream-r5-tls-link.json`.

Reviewed content hashes:

| File | SHA-256 |
| --- | --- |
| `apps/web/core/device-clipboard.js` | `f02ba59a71c7d3643aaccc3a35dd0404e92e80a2c6318113a264806bd68d902d` |
| `apps/web/ui/clipboard.js` | `c7021218e8c9c12bc749401a640a42747d567c61867b5ff8480d08778f7bc541` |
| `firmware/IPhoneAutomationHarness/src/SecureService.h` | `8c23671b680760b3217cfcb4e4a4bbdd87670e2ef9d15cab6012525b06ffc2e7` |
| `tools/verify_rtc_tls_link.py` | `3eb48a0065ecfd87de80b2441ac3bd32f4e9bc35c1269b21c42e9069171ac905` |

## Separate physical acceptance

The final production C3 image, Chrome/Safari handshake with BLE enabled, native Shortcut HTTP permission and execution, actual long-text clipboard copy, background lifetime and resulting phone paste remain the primary agent's or user's separate acceptance steps. Host simulation does not establish these results.
