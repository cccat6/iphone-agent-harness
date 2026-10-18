# Mobile repair independent review, round 5

Date: 2026-10-18 (Asia/Shanghai)

Result: One additional provider-editor lifecycle defect found. This round is not a clean acceptance. Production code was not modified by this reviewer.

## Fresh inspection

Read production `apps/web/app.js`, `apps/web/ui/device-panel.js`, `apps/web/ui/mcp-settings.js`, the local credential store methods, and relevant `core/codex.js` login/model/registration code before concluding. Traced new-session/send readiness checks, existing-session reading, cancelled skill refinement, separate provider editor and asynchronous save/login/unlock behavior, live device status refresh and proof invalidation, and MCP local hydration/reconnect/view disposal.

The previously repaired checks are present: new-session/send await current readiness, cancelled skill refinement preserves the old conversation and draft, save checks the original editor after encryption and is single-flight, login error status checks editor/controller ownership, device badges prioritize lost connectivity over capture, and MCP startup restoration survives opening its settings view.

Executed all four independent regression files with Node's test runner:

`tests/web/independent-mobile-repair-r{1,2,3,4}.test.mjs`

**18 passed, 0 failed, 0 skipped.** This corroborates the inspected paths but does not exercise the additional unlock defect below.

## R5-1 — cancelled unlock applies to an abandoned or replacement editor

Severity: P2. In `apps/web/app.js`, the `#unlock-provider` handler awaits `unsealCredentials` and then reads `isCodex()` from the current form without checking the original editor's lifetime. This differs from the repaired save/login handlers.

Reproduction:

1. Open an existing API profile with encrypted credentials and start unlocking it.
2. Before decryption finishes, leave that editor and open a subscription profile.
3. The old decrypt completes; the handler consults the replacement profile's protocol and attempts `registerCodexAccount(oldProfileId, {apiKey: ...})`.
4. Real registration rejects the API payload as invalid subscription credentials, producing an unrelated unlock failure in the replacement screen. Leaving the editor without switching protocols can instead finish installing credentials and show success after cancellation.

A one-off Node VM harness executed the exact production handler with delayed decryption and a replacement protocol. Recorded attempted call: `registerCodexAccount("old", {apiKey: "synthetic-api-key"})`. Only synthetic values were used; there were no network requests, token storage writes, or actual account modifications. The registration call was captured rather than invoking the real token registry; the production token validation branch was separately inspected.

Suggested repair: capture profile/protocol/passphrase at the start, enforce original editor ownership after the await, and use a request generation or single-flight state for repeated unlock clicks. The parent was notified for repair and fresh follow-up review.

## Limits

No browser interaction, iPhone test, serial port, BLE pairing, capture, provider API, firmware change, flashing, or deployment was performed. This is targeted source and deterministic lifecycle acceptance, not a visual or hardware pass. No finding outside the requested changed workflow scope was pursued.

## Repair verification

The parent changed the production unlock handler to capture the original form, profile, protocol and passphrase; enforce editor ownership and an unlock generation after decryption; invalidate that generation when protocol changes; and disable duplicate clicks while an unlock is pending. Stale success and failure both return without installing credentials or producing feedback.

This reviewer re-read the updated handler and actual `protocolChanged` function, then added `tests/web/independent-mobile-repair-r5.test.mjs`. Its seven deterministic tests execute those production snippets and cover:

- Cancellation before successful decryption.
- Replacement by another editor before successful decryption.
- Protocol changing away and back in the same editor.
- A failed decryption after cancellation.
- Active API unlock success, including suppression of duplicate clicks.
- Active subscription unlock success, including original profile and passphrase retention for refresh.
- Active failure reporting and button re-enablement for retry.

**All seven new tests pass. R1–R5 together: 25 passed, 0 failed, 0 skipped.** R5-1 is resolved by this verification. No production changes were made by this reviewer. This records verification of the reported repair; a subsequent fresh independent reviewer remains responsible for a new no-findings acceptance round.
