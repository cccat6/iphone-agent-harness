# Actions, timing and evidence

The model proposes a bounded plan; the browser validates it and compiles timed input segments for the ESP32. The browser captures and stores screenshots.

| Operation | Meaning |
|---|---|
| `tap` | Move, press, hold briefly, release |
| `drag` | Held path with optional endpoint hold before release |
| `swipe` | Timed path released while moving |
| `pointer_sequence` | Complete down/move/up sequence |
| `key`, `home` | Supported keyboard and Consumer Home reports |
| `wait`, `capture` | Bounded delay or released screenshot barrier |
| `observe` | Complete gesture alongside a bounded frame request |

Input uses one HID pointer. Coordinates are 0–10000 over the full display, with explicit frame/orientation metadata. Stale frame, target or orientation invalidates continuation. Use the clipboard Shortcut for arbitrary Unicode text. Observe the result of keyboard shortcuts and wheel input in the target app.

Plans have at most 30 steps and 15 seconds of execution budget. Device segments have at most 128 reports, 8192 UTF-8 bytes and five seconds, with three seconds maximum held input; negotiated capabilities may be stricter. A complete held gesture stays in one network request.

Post-release settling defaults are tap 250 ms, key 150 ms, Home 450 ms, drag/pointer sequence 350 ms and swipe 700 ms. `settleMs` may override 0–3000 ms and counts toward the plan budget. Pickers may need 1200–2000 ms and fresh frames. After waiting, use a fresh frame to check that the control has settled. A swipe's release velocity is set by its path timing.

Each observation provides a short run-scoped reference for action plans and completion evidence, while retaining its original stored frame ID. A capture barrier persists a released frame before continuing. `review` returns to the model before a decision. Motion observation returns frames with their capture times. The runtime uses fresh observations to check the effect of submitted input.

Cancel, lost sharing, disconnection, expiry or late execution stop dependent work and attempt release. Unknown delivery is reconciled before subsequent input. Use [gesture-correction](../../apps/web/skills/gesture-correction/SKILL.md) and [clock-and-time](../../apps/web/skills/clock-and-time/SKILL.md) for measured correction or supported direct entry.

[Plan schema](../../specs/action-plan.schema.json) · [Examples](../../specs/examples/)


The compiler sends the last absolute position while pressed, then sends button-up separately after a short report gap. This preserves the endpoint on iOS. Gesture timing records scheduled and device-reported input time separately from RPC time, receipt polling, settling and capture. Input execution overlaps receipt polling; those figures are not added to calculate wall time.

Bridges advertising `segmentEncoding: gesture-v2` receive a compact `gesture` tuple instead of expanded `events`. Tap, key and Home carry their parameters; paths carry positioning time, report cadence, motion duration, release hold and `[x,y,t]` keyframes. The MCU expands the path into its bounded scheduler. Explicit pointer sequences and batched keys use compact report tuples. Consecutive taps with explicit `settleMs: 0` also share one device-scheduled segment; capture steps and taps requesting a wait end the batch. Version 1 remains available for older firmware; both versions retain identity, lease, request hash and execution receipts.

Motion planning uses feedback from the actual control. Native lists and native time wheels are measured separately. Large moves can use inertia, followed by short held drags near the target. Custom or unidentified controls start with a small held drag. Stop-time estimates come from time-separated frames of the control and are revised after overshoot, rebound or a changed layout.
