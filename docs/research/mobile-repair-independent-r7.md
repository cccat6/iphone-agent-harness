# Mobile repair independent review, round 7

Date: 2026-10-18 (Asia/Shanghai)

Result: **No new reproducible defect found in the reviewed mobile-repair paths.** This is a fresh review of the current production source after the round 6 fix; the reviewer did not change production code.

## Scope inspected

- Read the provider editor's asynchronous operations, including model discovery and persistence, device-code creation/completion, encrypted credential unlock, save, cancellation, protocol changes and editor replacement. Checked the actual Codex helpers to distinguish UI guards from transport cancellation and token-registration checks.
- Read new-session and send gates, existing-session viewing, and skill refinement's handling when the device gate does not create a session.
- Read home/conversation device status and the device panel's live identity/binding refresh, connection epochs, input proof, Bluetooth subscription state and readiness checks.
- Read MCP local credential hydration, saved reconnection, view reopening, cancellation generations, endpoint changes and ordered local writes.

The round 6 model-list fix captures the form, normalized models and request sequence, and checks ownership after the settings write before rendering. The device-code start handler now holds the response in `issuedLogin` and assigns it to the active login only after checking cancellation, controller ownership and editor ownership.

## Executed verification

Executed the production-function and integration regressions in `tests/web/independent-mobile-repair-r1.test.mjs` through `independent-mobile-repair-r6.test.mjs`: **29 passed, 0 failed, 0 skipped**.

Also executed `tests/web/independent-lifecycle-r6.test.mjs`: **6 passed, 0 failed, 0 skipped**. These cover capture-end cancellation, bitmap cleanup, cancellation while persisting an input intent, listener cleanup and replacement-stream isolation.

Separately ran two synthetic exact-handler checks against the current production device-code start handler. A successful response arriving after cancellation or controller replacement left the newer login object and verification controls untouched. Both passed. These supplemental checks made no network requests and were executed as an inline review probe rather than added as another permanent test file.

No additional actionable finding emerged from this scoped review. Passing deterministic tests does not establish phone rendering or physical Bluetooth behavior.

## Limits

No browser interaction, physical phone or Bluetooth test, serial-port access, firmware change, flashing, provider API request or deployment was performed. Credentials, accounts and endpoints in the executed checks were synthetic. Visual keyboard behavior and the reported Bluetooth pairing timeout still require their separately documented acceptance; this report does not claim those were physically verified.
