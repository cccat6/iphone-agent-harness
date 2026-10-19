# Interaction refinement: independent review R1

Date: 2026-10-19

## Result

No unresolved blocking defect was found in the final reviewed changes. This review identified concrete state, scrolling, and memory-budget defects during development, supplied independent reproductions, and rechecked the main agent's fixes. It did not implement the application fixes.

The review covered provider settings, model selection, retained onboarding completion, unified conversational intent, proposed-plan execution, capture pause/resume, ordinary versus developer history, image presentation, scrolling, and pointer compilation/recovery. Source and simulated runtime checks are distinguished from the main agent's separate browser observations.

## Findings and verified fixes

1. **Continue remained disabled after a paused submission.** The submission cleanup rendered controls while `submitting` was still true and then cleared the flag without updating the controls. Cleanup now clears the flag before its final control update. The independent test executes the actual extracted submission function and checks the resulting button state.
2. **A paused session affected another session.** A global boolean made Continue appear in unrelated sessions that had no resumable task. Transient pause state is now tied to the current session ID, and opening another session clears the transient value. Durable continuation still comes from the selected session's checkpoint.
3. **An empty startup appeared paused.** The first session-ID comparison treated two absent IDs as equal. The final condition requires an actual current-session ID. Fresh startup no longer exposes an unusable Continue button or paused status.
4. **Fast consecutive output interrupted bottom following.** Before the scheduled scroll frame ran, a second render interpreted increased content height as the user having scrolled away. The follow controller now preserves its follow state while its prior scroll frame is pending. Explicit scrolling away still stops following; returning to the bottom restores it.
5. **Diagnostic arguments bypassed the history memory budget.** The new tool-call projection retained arguments without counting them in the resident window's byte budget. Window accounting now includes serialized tool-call and proposed-plan metadata. Ordinary history omits tool-call arguments both on storage projection and append; developer history retains them within the same resident budget. A single oversized record may remain as the established window policy, rather than losing the only available message.
6. **The main agent's browser check found Execute plan remained disabled after a response ended.** This was independently reproduced at the control-function level after its fix: proposal actions now refresh with `running || submitting` and become available after both flags clear.
7. **A retired session model could leave the native model selector blank.** Model selection now falls back to an actual available option after the browser rejects a no-longer-present option value. A valid saved selection is preserved. The independent fixture models native select assignment behavior rather than assuming arbitrary values remain selected.

An early concern that a proposal followed by a physical tool in the same model batch could execute was withdrawn after locating the existing terminal guard. An independent regression confirms the physical executor is never called in that case. This is verified preserved behavior, not a newly fixed defect.

## Independent regressions

`tests/web/refinement-independent-r1.test.mjs` contains eleven checks:

1. A paused submission ends with Continue enabled.
2. A pause belonging to another session does not expose Continue.
3. Fresh startup without a current session is not shown as paused.
4. Execute plan becomes available after completion and is disabled during another submission/run.
5. A retired model falls back to an available option while a valid model remains selected.
6. A proposed plan terminates a mixed tool batch before physical execution.
7. Ordinary tool presentation hides execution JSON while developer presentation retains details.
8. Stream growth follows the bottom, respects scrolling away, and resumes at the bottom.
9. Two growing renders before the next animation frame still follow the latest content.
10. Proposed steps and developer-only runtime visibility survive independent history reloads.
11. Diagnostic tool arguments participate in the bounded resident-history budget.

The eleven independent checks passed after the final fixes. A broader targeted run completed with **47 passed, 0 failed**, using:

```sh
node --test tests/web/refinement-independent-r1.test.mjs tests/web/unified-runtime.test.mjs tests/web/precision-and-recovery.test.mjs tests/web/capture-lifecycle.test.mjs tests/web/history-window.test.mjs tests/web/provider-refinement.test.mjs tests/web/message-presentation-refinement.test.mjs
```

`git diff --check` also passed. The full repository suite and deployment verification are owned and reported separately by the main agent; this report does not substitute its targeted count for those checks.

## Additional reviewed behavior

- Provider endpoints normalize supported inference-path suffixes before discovery/inference. Both supported API styles have matching model-discovery and request-path tests.
- Local API and subscription credentials survive a database reopen without introducing a new passphrase requirement. Credential records remain separate from settings and session exports. Legacy encrypted records retain an explicit migration path.
- The model editor uses one editable model input with discovered options. All discovered models remain available in the conversation selector; choosing a default does not create a separate model allowlist.
- Planning remains a reviewable proposal. The Execute action sends the selected proposal's goal and numbered steps, rather than only its goal.
- Stopping capture interrupts the current run and persists continuation state. Explicit resume observes the current screen before further input; reload recovery does not duplicate the original user message or blindly replay uncertain physical input.
- Known failed batches skip their remaining operations. Subsequent recovery requires fresh observation and a newly considered action. Uncertain delivery remains distinct from a known released-input failure.
- Full-display coordinate metadata and pointer timing tests preserve the distinction between a stopped drag and a moving release. Image compression preserves the full captured image. These tests do not establish real pointer accuracy on an iPhone.
- Ordinary history uses concise activity text and small screenshot controls; developer mode exposes protocol details without changing the original stored records. The preview and actual visual layout are part of the main agent's separate browser check.

## Verification limits

This reviewer did not open or inspect real user conversations, provider keys, browser account data, or the production phone. No serial port, Bluetooth pairing, HID command, firmware flash, cloud deployment, or physical iPhone interaction was performed.

Tests use synthetic credentials, model replies, capture streams, browser controls, and local stores. They verify control state, persistence, ordering, bounded projections, and gesture compilation. They do not prove that a real alarm was set, that AssistiveTouch accurately reached a target, that Safari will remain active indefinitely, or that every external provider permits browser access. Physical phone acceptance remains separate.
