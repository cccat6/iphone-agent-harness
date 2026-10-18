# Mobile repair independent review, round 4

Date: 2026-10-18 (Asia/Shanghai)

Result: One reproducible provider-editor lifecycle defect found in the additional targeted OAuth cancellation review. Production code was not modified by this reviewer. This is source review plus deterministic regression execution, not mobile or hardware acceptance.

## Scope and inspection

Production files were read without modifying them:

- `apps/web/app.js`: new-session and send entry checks; existing conversation opening; skill refinement's new-session return handling; standalone provider editor entry, cancellation/back, and save lifecycle; device status presentation and startup MCP restoration.
- `apps/web/ui/device-panel.js`: readiness derivation, fresh identity/binding reads, proof invalidation, foreground/background status refresh, and readiness returned to the session entry points.
- `apps/web/ui/mcp-settings.js`: local credential hydration, serialized writes, reconnect restoration, settings-view disposal/reopening, tool selection and enablement.

The review traced behavior before executing the earlier independent regression files:

1. New-session and send paths await device readiness; a failed check opens device settings without creating a session or calling the model. New-session creation from send follows that check and still verifies current device state.
2. Existing conversations remain readable without a device; opening one does not submit a model request.
3. Skill refinement checks the actual new-session result. If device readiness prevents creation, the existing conversation's mode and unsent draft are not replaced.
4. Provider editing uses a separate panel. Back/cancel returns to settings; unsaved subscription draft credentials are discarded. Save is single-flight, and cancellation during credential encryption stops the abandoned save before persistence.
5. Home/conversation status gives lost LAN connection and missing input proof precedence over ongoing screen capture. Device readiness requires both current Bluetooth input availability and the page's matching proof.
6. MCP restoration belongs to the application rather than the settings panel. Reopening or disposing that view preserves an active startup restore; local credential updates wait for hydration and merge only their intended changes.

## Executed verification

Command:

```sh
node --test tests/web/independent-mobile-repair-r1.test.mjs tests/web/independent-mobile-repair-r2.test.mjs tests/web/independent-mobile-repair-r3.test.mjs
```

Result: **14 passed, 0 failed, 0 skipped**.

These tests execute extracted production handlers and the real MCP settings/access model with deterministic fixtures. They corroborate the inspected paths; passing them alone is not the basis for the source-review conclusion.

## Limits

No browser, iPhone, serial port, BLE pairing, screen recording, live provider API, firmware flashing, or deployment was performed in this review. Earlier round-2 browser evidence was not represented as this reviewer's own observation. Unchanged product features and long-duration background behavior were outside this narrowly requested final review.

## Finding R4-1 — cancelled login writes into a replacement editor

Severity: P2. Both `startCodexLogin` and `completeCodexLogin` catch blocks call `loginStatus` after an awaited request fails. That helper looks up `#codex-login-status` at completion time without verifying the original editor is still active.

Minimal sequence: start login; leave the provider editor; open another provider editor; let the aborted original request reject. The new editor's initial status changes to “登录已取消。” even though that login belongs to the previous editor.

`tests/web/independent-mobile-repair-r4.test.mjs` extracts the production status helper and both handlers and deterministically reproduces both branches with delayed rejection, without network calls. Initial result: **2 failed**, with replacement status actually “登录已取消。” instead of the unchanged initial value. Parent was notified for repair and subsequent fresh review.

The later-added vault field visibility was also inspected: new profiles hide the passphrase field until encryption is selected, while an existing encrypted vault keeps its unlock input available. The field remains in the form; this does not change credential save logic. No defect was found in that limited visibility change.

## Repair verification

The parent added editor-lifetime guards to both localized status helpers and controller/abort checks to the login completion/error paths. This reviewer re-read the changed branches and reran the regression against the repaired source.

The new R4 file now covers both start/complete failure callbacks after replacement of the editor and after starting a new controller within the same editor. **All four R4 regressions pass.** Running the R1–R4 independent files together yields **18 passed, 0 failed, 0 skipped**. R4-1's reproduced cancellation/status defect is resolved. A further fresh reviewer should provide the requested subsequent independent pass; this repair verification is not presented as that fresh pass.
