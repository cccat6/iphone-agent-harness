# Mobile repair independent review — 2026-10-18

Scope: current uncommitted mobile UI, device readiness gating, provider editor lifecycle and persistent MCP settings. Production implementation was read but not edited by this reviewer. Tests added in `tests/web/independent-mobile-repair-r1.test.mjs` execute extracted production app handlers and real MCP model/access modules; they are not physical phone or firmware acceptance.

## Findings

1. **Device readiness remained cached after Bluetooth or board loss (P1).** `ui/device-panel.js` originally read a cached `targets` array and `connectionActive`; failed manual refresh left the old proof intact. `app.js` new/send gates could therefore allow a session based on stale readiness. The implementation author added fresh identity/binding verification at new/send, bounded status polling and foreground verification. A lost link now clears proof; recovering the link does not silently restore input verification. The updated author-side device flow tests and independent app handler checks pass.

2. **MCP selection during private credential loading erased the saved token (P1).** Opening settings creates an initial row with an empty token while IndexedDB reads the private record. Previously, selecting tools or toggling enable immediately snapshotted that empty token for a subsequent save. Two independent tests reproduced an actual persisted empty token. The author changed queued saves to await hydration and merge only the requested fields. Both independent tests pass after this change.

3. **Cancelling an account editor while encryption was pending still saved it (P2).** The save handler continued after `sealCredentials()` even after leaving the editor, persisted the abandoned profile and reopened settings. An independent production-handler test reproduced this. The root added editor-lifetime checks and single-flight saving, delaying credential registration until the settings save. Independent cancellation, duplicate-submit and successful-save checks now pass.

4. **Opening settings during startup MCP reconnection cancelled it (P2).** The view's `disposeView()` called `cancelPending()` and `mount()` reloaded rows, terminating a previously saved server's startup initialization without restarting it. The independent final test reproduces this with a delayed initialize response. The author separated app-owned startup restoration from settings view disposal and retained matching in-flight rows. The independent delayed-initialize test now passes; explicit disconnect/edit/remove still cancel restoration in the author-side lifecycle tests.

## Browser observations

Used a new Chrome tab at the local isolated `/apps/web/?fixture=mobile-review-r1` page. Checked settings → add account/API as a separate editor; used the fixture's synthetic device-code request and returned to settings; clicked New session with no connected device and observed the connection panel instead of a created conversation. Closed the temporary tab afterward. No real account credential, model request, phone input, serial device or deployment was used.

The fixture uses a simulated iOS user agent; this does not establish real Safari keyboard behavior. The previous `tests/browser/main-flows.html` whole-flow assertions assume offline sessions can be created and are obsolete for this policy; they were not claimed as passing acceptance.

## Limits

No real iOS keyboard/safe-area rendering, Bluetooth pairing, recording, HID action or board flash was performed. Source inspection supports the visual viewport offset/height and fixed-body changes, but does not substitute for a real iPhone keyboard test. Session exports contain session/message records; the separate local credential record APIs do not add private MCP data to exports.

## R1 retest result

After the root/implementation agents repaired all four findings, the reviewer reran the ten independent tests plus device onboarding and MCP persistence tests: **21 passed, 0 failed**. No further defect was identified in this R1 follow-up. A fresh independent reviewer should perform the next review round rather than treating this same-reviewer retest as a new review.
