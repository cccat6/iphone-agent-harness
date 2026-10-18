# Mobile repair independent review R2 — 2026-10-18

Scope: fresh review of the mobile session/device gate, account editor, MCP persistence, device onboarding, and keyboard layout. No firmware was flashed, no physical device contacted, and no production service deployed by this reviewer.

## Findings and resolution

1. **Device status could conceal a disconnection while capture remained active.** `renderDeviceStatus()` selected `sharing` before checking LAN connection or input proof. The device panel correctly invalidated readiness but the home and conversation banners still said screen sharing. Root changed status priority; this review independently added three executable regressions covering LAN loss, input-proof loss and valid sharing. All pass.
2. **Active architecture documents described obsolete onboarding and MCP behavior.** Updated `mcp-ui.md`, `device-ui.md`, `device-client.md` and the remaining temporary-token phrase in `mcp.md`: multiple saved MCP servers and refresh restoration, local device credentials without user vault password, no Full Keyboard Access requirement or direct-LAN selector, offline history reading versus blocked creation/send. Historical research records were preserved.

## Executed checks

- `independent-mobile-repair-r1.test.mjs`: 10 passing tests, including offline creation/send, fresh readiness checks, readable old conversations, account-save cancellation and single-flight behavior, and MCP hydration/startup races.
- `independent-mobile-repair-r2.test.mjs`, `mcp-persistence.test.mjs`, `device-onboarding-flow.test.mjs`: 14 passing tests, including the three new status regressions and persistent two-server credential/permission recovery.
- Actual in-app browser at 390 × 844: clean white session list, visible disconnected bridge state; clicking New session opens connection setup and creates zero sessions.
- Account editor replaces the Settings content. Its initial active element is the Close button, body scroll is zero, document scroll is zero, and the first name field is visible at y=150.3. No automatic input focus occurred.
- Device UI shows Connection test, AssistiveTouch guidance, and only the first-connection device code password field. No Full Keyboard Access acknowledgement, vault password or direct-LAN selector is exposed. Unavailable test/share actions are disabled.
- A synthetic `notes.mcp.example` server was saved with a synthetic token, lookup selected and enabled. After reload it reconnected automatically; Settings showed a collapsed card with one enabled tool. Expanding confirmed both tool selection and enabled state restored. The test entry was removed afterward.
- Production UI in `mobile-viewport.html` with simulated keyboard viewport height 430 and offsetTop 70: both search and independent account editor matched viewport bounds exactly; document scroll remained zero, body/sidebar backgrounds were white, and footer was hidden. Account Close button stayed inside the viewport at y=78.5–122.5.

After the root's status correction, no further reproducible defect was found in these inspected paths. This is desktop browser, production-module and simulated viewport evidence, not physical iOS keyboard, BLE pairing, screen-sharing lifecycle or long-running phone acceptance. Temporary browser tab was closed and viewport override reset; no user tabs were modified.
