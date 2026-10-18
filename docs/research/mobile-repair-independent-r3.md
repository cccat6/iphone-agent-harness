# Mobile repair independent review R3

Date: 2026-10-18 (Asia/Shanghai)

Scope: fresh source review of the revised session home, provider editor cancellation and save lifecycle, live device readiness and status priority, and persisted MCP restoration. This review did not use previous review reports as evidence. It did not open a browser, contact a model provider, flash a board, or deploy.

## Finding and correction

Found one reproducible cancellation defect in the skill “refine in chat” action: with an existing conversation and no ready device, `newSession()` declined creation, but the action subsequently treated the old `state.current` as the new conversation. It changed the old conversation to chat mode and replaced the unsent draft.

The main agent corrected `newSession()` to return the successfully created session and made the skill action stop explicitly when creation returns `null`. The independent regression `tests/web/independent-mobile-repair-r3.test.mjs` failed before the correction and passed afterward. Other `newSession()` callers were reviewed; no equivalent existing-conversation mutation was found.

## Verification

Executed together:

- `tests/web/independent-mobile-repair-r1.test.mjs`
- `tests/web/independent-mobile-repair-r2.test.mjs`
- `tests/web/independent-mobile-repair-r3.test.mjs`

Result: **14 passed, 0 failed** after the correction. These cover offline and stale-readiness session/send gates, offline reading, canceled account encryption, single-flight account saves, MCP token preservation during hydration and startup restoration across a settings remount, device-offline/input-unverified status taking priority over recording, and the newly identified skill cancellation path.

Readiness was traced through the production `ensureReady()` → fresh identity and binding requests, rather than only the cached home status. Provider editor lifecycle checks use editor identity and cancel guards around asynchronous encryption; MCP background restoration survives view disposal while explicit row edits cancel obsolete work. Source inspection of the updated layout confirmed the separate provider editor, shared page background, visual viewport sizing, and fixed dialog header structure.

No further reproducible issue was found within this bounded review after the correction. Browser appearance and iOS keyboard behavior remain the separate browser/phone acceptance scope; these Node tests and source checks do not establish physical Bluetooth pairing or Safari background reliability.
