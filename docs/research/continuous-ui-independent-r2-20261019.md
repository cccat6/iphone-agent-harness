# Independent review: conversation gestures, optional testing, and continuous tasks

Reviewed the current changes independently from their implementation. This pass did not contact a model API, serial device, or phone input adapter, and did not deploy anything.

## Findings and regression evidence

1. Explicitly requesting older history did not always suspend following. When the displayed messages fitted the viewport, the near-end heuristic retained automatic following, so subsequent messages could return the reader to the bottom. The root agent added an explicit pause at the start of older-page loading. The independent regression now passes.
2. A second reading-position race exists when the user pauses while the end-of-run history refresh is awaiting storage: the late latest-page result can replace the held window. The independent regression executes the actual `sendMessage` handler with a delayed final read. The root agent removed redundant end-of-run message reloads. Both send and resume now await session metadata and then render the current history snapshot. Independent delayed-metadata regressions for both paths pass, including history navigation while the read is pending.

## Independent tests

`tests/web/continuous-ui-independent-r2.test.mjs` executes the actual root application functions in isolated view fixtures:

- Incoming frame messages defer while the reader holds older history; resume finalization preserves the held message IDs and newer-message indicator.
- Renaming an archived row retains the list destination and does not open or rename the previously active conversation.
- Explicit older-history requests pause following even with a short viewport-fitting history.
- A directly associated Bluetooth target reaches the execution context without claiming an optional keyboard proof.
- Reader intent changed during delayed final session metadata reads remains respected in both send and resume finalizers; neither finalizer reloads message history.

All six independent root regressions pass. The two reported findings were reproduced before correction and revalidated afterward. Combined with the prior independent runtime, swipe, optional-binding, and local-credential suites, 24 tests pass. No unresolved blocker or additional finding remains in this review scope.

## Source review

- Continuous execution has no default turn, tool-call, or duration ceiling. Explicit caller limits remain available for controlled tests.
- Recent frame metadata is bounded in memory; actual frame evidence and tool-call duplicate reservations are stored durably. The inspected frame metadata excludes image blobs.
- Uncertain physical outcomes remain non-replayable even after a recent in-memory entry is evicted.
- Interaction notes are bounded and filtered for the current target and orientation. Gesture correction guidance distinguishes an inertial swipe from a held-endpoint drag and requires feedback-based corrections.
- The optional keyboard test automatically confirms only after the trusted final key release; cancellation and focus loss invalidate the pending test.
- Stored, temporary, missing, unavailable, and encrypted legacy credentials are separately identified. These labels do not imply that an absent memory-only legacy key can be reconstructed.

## Verification boundary

These are code and browser-state regressions. They do not establish real iPhone pointer alignment, picker accuracy, animation timing, Bluetooth pairing, or screen-sharing survival. Those require physical acceptance with the selected firmware.
