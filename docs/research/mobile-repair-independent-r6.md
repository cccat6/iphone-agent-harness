# Mobile repair independent review, round 6

Date: 2026-10-18 (Asia/Shanghai)

Result: One additional reproducible provider-editor lifecycle defect found. This round is not a clean acceptance. The reviewer made no production changes.

## Inspection and executed checks

Read the current production provider editor, including the R5 guarded credential unlock, new-session and send gates, skill refinement's cancelled-session handling, home/conversation device status, device `ensureReady` and status refresh, and MCP local hydration/reconnection. Examined the asynchronous continuations and their consumers independently of earlier reports.

Executed `tests/web/independent-mobile-repair-r{1,2,3,4,5}.test.mjs`: **25 passed, 0 failed, 0 skipped**. The R5 unlock captures the original form/profile/protocol/passphrase, ignores stale decrypt outcomes, invalidates on protocol change, and prevents duplicate active attempts.

## R6-1 — model-list persistence resumes against a changed editor

Severity: P2. `applyModels` in `apps/web/app.js` initially checks `editorActive()`, then persists fetched models for an existing profile. After awaiting `store.saveSettings`, it writes the global discovered-model controls and consults mutable `state.providerModels` without checking whether the original editor/request is still current.

An exact-production-function VM reproduction delayed only the settings write:

1. Fetch models for an existing API profile.
2. While their local persistence is pending, close the editor, open another profile, or change the endpoint in the same editor.
3. Resolve the pending write.

Observed outcomes: a replacement profile's dropdown is overwritten by the old profile's models; a closed editor throws while accessing removed controls; same-editor endpoint invalidation clears the mutable list, causing an undefined-model error.

Added `tests/web/independent-mobile-repair-r6.test.mjs`, exercising the actual production function. Before repair: **three reproducing failures and one active-editor positive pass**. The recommended repair is to capture the model request sequence and model list and recheck editor/request ownership after the persistence await before touching controls. This does not require undoing a database write that has already begun.

## Scope limits

No browser interaction, physical phone or Bluetooth test, serial-port access, firmware change, flashing, provider API request, or deployment was performed. All credentials and model endpoints in these tests are synthetic. This report is source and deterministic lifecycle verification, not visual or hardware acceptance.

## Repair verification

The parent changed `applyModels` to capture the original form, request sequence and normalized model list. It now checks editor and sequence ownership again after the settings write and before rendering, and uses the captured list instead of mutable shared state. The reviewer re-read this production change and reran all R1–R6 tests: **29 passed, 0 failed, 0 skipped**, including all four R6 tests.

R6-1 is resolved. This is verification of the reported repair; a fresh independent round remains responsible for the next no-new-findings determination.
