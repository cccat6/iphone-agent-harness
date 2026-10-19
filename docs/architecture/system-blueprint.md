# System and ownership

[Overview](overview.md) · [Phone guide](../acceptance/README.md)

| Owner | Responsibilities | Data boundary |
|---|---|---|
| Browser | Conversation, prompts, model/tool loop, capture, local skills | Private data stays in browser except selected content sent to configured services |
| ESP32 | Wi-Fi setup, target binding, writer lease, timed Bluetooth reports | No model credentials, screenshots or authoritative conversation history |
| AI provider | Configured inference API | Receives selected messages/images |
| Optional community API | Signed public skill packages and immutable revisions | Receives only explicitly published packages |

Bridge identity, boot, browser client, selected Bluetooth target and writer lease are separate. A saved address does not prove a live target. Current firmware can bind a connected, encrypted, HID-subscribed target; the digit input test is optional extra observation. Unknown delivery must be reconciled by existing receipts and current screen state rather than replayed.

The user has one conversation entry. Capability questions can be answered, plan requests produce a reviewable plan, explicit action requests can execute when prerequisites are ready. Loss of screen sharing pauses work; user Stop ends it. Completion requires observed result evidence. The default task-completion preference returns to Harness only after verification; users can disable return.

Multiple saved browser clients do not imply concurrent RTC peers. The latest multi-client enrollment/import repair is prepared in source and still needs flashing and physical validation. Two bonded phone slots likewise do not establish simultaneous phone throughput or isolation without device testing.
