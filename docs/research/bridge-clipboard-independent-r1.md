# Bridge and clipboard independent review — 2026-10-18

Scope: offline model context and input failure semantics; foreground clipboard preparation/copy and task continuation; app integration and conversation lifecycle. Read production code and exercised it with mocked browser/phone adapters. No serial device, system clipboard, phone input, or real model request was used by this reviewer.

## Findings

1. **Copy continuation inherited the current mode selector.** A task can pause to copy, the user can select Chat or Plan, and the original button then resumes the wrong mode. Root fixed this with an explicit task override while retaining the unsent composer draft. Independent regression now passes for both Chat and Plan.
2. **Successful copy plus failed session callback had no recovery action.** The copied receipt remained valid, but all actions were hidden. The implementation now offers a retry which reuses the receipt and never writes the clipboard a second time. Independent regression passes.
3. **Reopening the same conversation discarded the callback recovery state.** The copied receipt survived in the controller, but its failure state lived only in the destroyed UI view. The next view showed neither continuation nor retry. Shared controller-associated continuation state now survives both remount-after-failure and remount-while-saving; both independent regressions pass. The related earlier window (remount while the browser write itself is unresolved) was also repaired and independently verified.

## Checks

Reviewed latest bridge status before model turns and before operation execution; disconnected tools return explicit missing-bridge errors without executing input. Submitted input with a later network loss retains unknown outcome. Chat can continue offline without accessing physical adapters. Clipboard metadata is scoped to session/target; canceled or pending copy blocks paste. New continuation preserves the unsent draft and starts task mode.

Independent tests: `tests/web/independent-bridge-clipboard-r1.test.mjs`. Related tests: `tests/web/clipboard.test.mjs`, `tests/web/bridge-runtime-awareness.test.mjs`.

This is not phone acceptance. Safari copy user activation, switching to another app, and actual HID paste still need a real phone run.

## Final R1 result

All three findings were fixed and rechecked. The five independent regression cases and related bridge/clipboard cases pass: **32 tests, 32 passed**. No additional substantive defect was found in this review scope after the fixes. Fresh R2 review remains separate.
