# Interaction refinement: independent review R2

Date: 2026-10-19

## Result

No new unresolved blocking defect was found in the reviewed final state. This reviewer did not author the application changes. The review focused on the integration between submission, explicit continuation, capture lifecycle, durable history metadata, model availability, and the ordinary/developer presentation boundary.

A clipboard-continuation race was identified while reviewing `resumeRun`: unlike a normal submission, a resumed run previously did not publish a fresh completion promise. A clipboard receipt could therefore wait on an already completed older submission, attempt continuation while the resumed run was still active, and lose that continuation to the busy guard. The main agent independently identified and changed this path before this reviewer's first regression execution. The regression verifies the changed behavior; this report does not claim an executed failing reproduction of the previous revision.

## Independent regression

`tests/web/refinement-independent-r2.test.mjs` extracts the actual `resumeRun` and `renderClipboard` functions from the application. It holds a resumed run pending, delivers a clipboard copy receipt, and verifies that:

1. No automatic continuation is attempted while the resumed run remains pending.
2. Completing the resumed run releases the current completion promise.
3. The eventual continuation observes both `running` and `submitting` cleared.

The check passed against the final change. The fake provider/capture/store isolate this lifecycle behavior and do not perform device input.

## Reviewed paths

- The single send path selects automatic intent. A plan proposal remains structured and terminal for its tool batch, and execution requires a separate user action. The selected proposal supplies its actual steps to the new request.
- Capture stop invalidates the current source and orientation epoch. Late image reads and old recorder/track callbacks cannot provide an old frame or stop the replacement source. Stop during an in-flight physical segment reaches release/cleanup before finishing the run.
- Explicit continuation reads the durable checkpoint, starts from fresh observation, avoids adding a duplicate visible user task, and preserves uncertainty constraints against repeating the same interrupted action sequence.
- Known failed batches skip their remaining actions and require fresh observation before corrected execution. Unknown outcomes remain distinct from known released-input failures; explicit cancellation does not trigger automatic correction.
- Continue visibility belongs to the selected session. It is hidden for fresh startup and unrelated sessions, and enabled after submission finalization. Proposal execution controls also become available only after both busy flags clear.
- Conversation history loads bounded pages. Ordinary records omit internal runtime content and diagnostic tool-call arguments; developer arguments and proposed-plan metadata participate in the resident memory budget. Local history reload retains proposal metadata. File export/import changes identified separately by the main agent are outside this report's completed check.
- Ordinary physical-tool results use concise presentation and screenshot thumbnail controls. Debug JSON remains derived from the original records when developer mode is enabled. Screenshot assets are hydrated only near the visible region, with a maximum visible image count and object URL cleanup.
- The scroll follow controller handles successive growing renders before the next animation frame, image-ready growth, and explicit user scrolling away from the newest content.
- A retired saved model falls back to a real available catalog option. Provider discovery and inference endpoint normalization are covered for both supported API styles; browser credential persistence does not introduce a new passphrase requirement.

## Checks executed

The targeted run passed **48 tests, 0 failures**:

```sh
node --test tests/web/refinement-independent-r2.test.mjs tests/web/refinement-independent-r1.test.mjs tests/web/unified-runtime.test.mjs tests/web/capture-lifecycle.test.mjs tests/web/precision-and-recovery.test.mjs tests/web/history-window.test.mjs tests/web/message-presentation-refinement.test.mjs tests/web/provider-refinement.test.mjs
```

## Verification boundaries

This reviewer did not read real user sessions or browser credentials, access a serial port, change firmware, send phone input, make provider requests, or deploy the site. The main agent owns browser observations, real-provider functional checks, full-suite counts, firmware/deployment checks, and the separately identified file import/export metadata refinement. These simulated checks do not establish physical pointer accuracy, correct alarm creation, or indefinite Safari background execution.

## Final follow-up review

The final file import/export and viewport follow refinements were reviewed after the initial R2 report. No new blocking issue was found. Two additional independent regressions were added to `refinement-independent-r2.test.mjs`:

- Both incremental file import and direct store import preserve the structured proposal and tool-name presentation fields. Invalid proposal status, excessive step count, and malformed tool names are rejected without creating an extra session. The file path was exercised with 7-byte parse chunks.
- A viewport-layout callback follows the bottom when following is active and preserves the reader's position after an explicit upward scroll. It does not override reading intent.

The follow-up run passed **20 tests, 0 failures**:

```sh
node --test tests/web/refinement-independent-r2.test.mjs tests/web/message-presentation-refinement.test.mjs tests/web/session-files.test.mjs tests/web/viewport.test.mjs
```

`showImagePreview` was also inspected: it reads the referenced image, creates a separate modal, closes from its button or backdrop, and removes its image source and dialog on close. It does not rewrite stored images. Visual portrait/landscape observations remain the main agent's browser evidence; this reviewer checked the follow controller and viewport tests, not a physical iPhone rotation.

## Finalization failure regression

A final spot check by the main agent identified a second continuation-cleanup defect: a rejected saved-session read in `resumeRun` finalization could skip the running-state reset and never resolve the completion promise. This reviewer added a fourth R2 regression and executed it against the previous finalizer, observing the genuine failure (`running` stayed true). After the main agent's nested `try/finally` cleanup change, the same test passes: a waiting clipboard receipt is released, `abort` is cleared, and both busy flags are false even when session reload rejects. The ordinary successful-resume fixture was updated to provide the newly invoked render-control callback.

The final focused lifecycle run passed **31 tests, 0 failures**:

```sh
node --test tests/web/refinement-independent-r2.test.mjs tests/web/refinement-independent-r1.test.mjs tests/web/unified-runtime.test.mjs tests/web/capture-lifecycle.test.mjs
```

No unresolved blocker remains in these reviewed paths.
