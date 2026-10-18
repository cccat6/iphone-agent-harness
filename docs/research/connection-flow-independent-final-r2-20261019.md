# Device connection flow: final independent R2 review

Date: 2026-10-19

This is a fresh review following the main agent's live-browser discovery of browser-registration capacity and the subsequent error-detail and enrollment fixes. It covers the latest Web files, the Admission/SecureService replacement policy, and the frozen bridge information-page retry change. This reviewer did not open a browser or serial port, send HID input, flash firmware, or deploy.

## Finding closed during this review

The information-page request helper originally accessed `value.error` after decoding an unsuccessful HTTP response. A legitimate HTTP 403 with a JSON `null` body therefore threw a JavaScript TypeError: the page classified it as a network error, retried it, and lost the HTTP status in the displayed failure. The implementation agent changed this access to `value?.error` and added all-eight-language cases for HTTP 403/null and HTTP 503/null. Independent execution of the actual rendered firmware page passed after the fix: 403 is not retried and retains its status; 503 is retried once and retains its status. Closed.

No additional blocking defect was found after that correction.

## Independent checks

- Fresh browser information acquisition remains a prerequisite. Saved/imported metadata is durably stored before enabling Connect, and failed or superseded manual imports cannot enable a connection using the wrong address. Successive writes are serialized. Storage failure keeps connection/input/sharing blocked.
- Normal return navigation and persisted-page restoration reopen the device panel through the tab-local marker. Leaving suspends the previous RTC connection. Returning keeps saved information and requires an explicit Connect action. Malformed import fragments are retained for correction.
- Failed connection cleanup preserves the original error and permits retry. Old transport disconnect callbacks cannot mark a replacement connection disconnected; stale client status reads are guarded by client and connection epoch.
- Firmware conflict responses now distinguish browser-registration capacity, bridge availability, phone availability, writer conflict, expired state, and unknown results. Normal user-facing text is localized in eight languages. The optional details retain bounded protocol/HTTP identifiers and never display arbitrary request/response messages. Retry clears previous details.
- Enrollment may replace an idle, unbound browser registration when capacity is exhausted. Bound registrations, current RTC clients, clipboard owners, and current lease/running owners are protected from eviction. An active challenge blocks enrollment. The candidate is committed only after persistence of its exact slot succeeds; tests verify refusal, target ownership preservation, and reconstruction after reboot.
- Bridge information acquisition reads only public `/v1/identity`, without management enrollment or private storage. It retries one read after 500 ms only for network failures, timeout, or HTTP 5xx, and does not retry HTTP 4xx or invalid metadata. Return-link and metadata failures remain errors without navigation. Native page hidden semantics and all eight languages execute successfully.

## Executed validation

**37 Web tests passed, 0 failed:**

```sh
node --test tests/web/connection-guidance.test.mjs tests/web/connection-flow-independent-r1.test.mjs tests/web/connection-flow-independent-r3.test.mjs tests/web/device-conflict-errors.test.mjs tests/web/device-onboarding-flow.test.mjs tests/web/device-rtc-recovery.test.mjs tests/web/rtc-import-identity-independent.test.mjs tests/web/device-rtc.test.mjs tests/web/device-setup.test.mjs
```

`sh tests/firmware/run.sh` completed successfully, including 15 Admission scenarios, the production BLE lifecycle tests, and existing Core and clipboard coverage. The log is `build/connection-flow-r2-final-host.log`.

`sh tests/firmware/run_html_render.sh` completed successfully after the null-body correction. The log is `build/connection-flow-r2-final-html.log`. This executes the actual compiled firmware HTML, including eight-language failure/recovery tests and the non-retry 403/null and retry-once 503/null cases.

`git diff --check` passed at review time.

## Limits

These tests validate implementation sequencing, storage state, protocol/error handling, and actual page scripts in a host environment. They do not substitute for Safari Back/BFCache behavior on the user's iPhone, local multicast-DNS availability, physical C3/BLE coexistence, or final phone input acceptance. The main agent owns separate live browser/network and board evidence. This review makes no claim that the observed Mac multicast-DNS environment issue has been repaired.

## Final narrow freeze check

The final firmware-only follow-up reuses the safe error-detail formatter for ordinary bridge settings-page load and save failures as well as information import. The localized prefix remains specific to the page and board-busy state; HTTP status and recognized firmware reason are appended. No new request replay was added to management operations. The actual HTML suite was independently rerun after this final source freeze and exited successfully, including all-eight-language management GET/403 and save/409 checks. No new blocker was found. This narrow check did not repeat the unchanged Web or host suites.

## Final Web refresh deadline check

The last Web-only change distinguishes the panel's own eight-second refresh deadline from an external caller cancellation. Independent source review confirmed that deadline expiration now yields `DEVICE_TIMEOUT`, invalidates connection readiness, and leaves retry available; closing the panel keeps caller cancellation and cannot produce a late visible timeout on reopening. The refresh timer and abort listener are removed in `finally`. Four targeted suites (`connection-flow-independent-r3`, `connection-flow-independent-r1`, `device-onboarding-flow`, and `device-rtc-recovery`) completed with **14 passed, 0 failed**, including the two new fake-timer cases. No new blocker was found; no firmware, browser, serial, or deployment action was performed for this narrow check.
