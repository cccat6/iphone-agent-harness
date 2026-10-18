# Navigation review, 2026-10-18, round 1

Scope: conversation-list hierarchy, hidden search, Settings directory and child pages, returning from skills/devices/account editing, and completion of delayed local reads/writes after navigation. This review did not change production files, deploy, control hardware, or claim native iPhone touch proof.

## Findings and repair verification

1. **Settings and skills opening could outlive the requested page.** A delayed local read could overwrite a later selection or reopen a closed sheet. Production now gives each navigation a generation and checks it after reads; panel presentation and closing invalidate old requests. Independent delayed-read tests confirm the final selection wins and closing remains closed.
2. **Storage-page completion could put a second back button on a replacement page.** The back button was installed only after awaiting the storage estimate. It is now installed before that wait; completion checks the original status node. The independent test leaves Language with exactly one back button.
3. **A context save could report success in a newly opened, edited form.** Completion queried a global result element. It now keeps the original form/result identity; the independent test verifies a later form with unsaved values is not marked saved, while normal saving still reports success.
4. **The first pending device-page opening was not cancelled by closing Settings.** Its own close listener was not registered yet. Production now passes navigation validity into `devicePanel.open`, disposes pending device opening on sheet close, returns the actual opened root, and adds Settings Back only to that current root. Independent tests verify both navigation cancellation and dispose during the storage read prevent DOM reopening.

## Checks

- `tests/web/independent-navigation-r1.test.mjs`: 9/9 passed after repairs, exercising the real extracted Settings functions and the real device-panel constructor/open function with controlled deferred promises.
- Full web suite after the first seven independent tests: **471/471 passed** (`build/navigation-independent-final-tests.log`). Two additional late-search/archive tests subsequently passed in the targeted 9-test run; the main session owns the final full-suite run.
- Added independent real-function delayed-list tests: cancelling search retains the unfiltered results even when old filtered results arrive later; entering Archive retains archived results when an old active-list request arrives later.
- Inspected search controller and its 12 tests: initial hidden state, explicit search/focus, deliberate pull from the list top, ordinary scroll preservation, cancellation/reset, IME Escape handling, one compatibility-click suppression, and next real row-tap preservation.
- Inspected explicit Settings back navigation for accounts, MCP, context, language, storage and skills; provider cancel/save returns to the accounts list. Home has no opaque list ellipsis and only New conversation is the footer primary action.

The identified defects are repaired at the reviewed checkpoint. Browser visuals and native iPhone pull/keyboard behavior remain separate checks owned by the main review; the unit tests do not substitute for those observations.
