# Actions, timing and evidence

The model proposes a bounded plan; the browser validates it and compiles timed input segments for the ESP32. Screenshots remain browser-owned and never pass through the bridge.

| Operation | Meaning |
|---|---|
| `tap` | Move, press, hold briefly, release |
| `drag` | Held path with optional endpoint hold before release |
| `swipe` | Timed path released while moving, without an endpoint hold |
| `pointer_sequence` | Complete down/move/up sequence |
| `key`, `home` | Supported keyboard and Consumer Home reports |
| `wait`, `capture` | Bounded delay or released screenshot barrier |
| `observe` | Complete gesture alongside a bounded frame request |

One HID pointer is available, not native multitouch. Coordinates are 0–10000 over the full display, with explicit frame/orientation metadata. Stale frame, target or orientation invalidates continuation. Keyboard mappings and app responses must be observed; arbitrary Unicode, Apple Fn and wheel behavior are not universally promised.

Plans have at most 30 steps and 15 seconds of execution budget. Device segments have at most 128 reports, 8192 UTF-8 bytes and five seconds, with three seconds maximum held input; negotiated capabilities may be stricter. A held gesture is never split across network requests.

Post-release settling defaults are tap 250 ms, key 150 ms, Home 450 ms, drag/pointer sequence 350 ms and swipe 700 ms. `settleMs` may override 0–3000 ms and counts toward the plan budget. Pickers may need 1200–2000 ms and fresh frames. Waiting is not proof of visual stability; a swipe's post-release delay does not alter its release velocity.

A capture barrier persists a released frame before continuing. `review` returns to the model before a decision. Motion observation reports actual frames/timing and insufficient evidence where necessary; requested cadence is not guaranteed. Received plan, submitted HID and visible success are distinct.

Cancel, lost sharing, disconnection, expiry or late execution stop dependent work and attempt release. Unknown delivery is reconciled, never blindly replayed. Use [gesture-correction](../../apps/web/skills/gesture-correction/SKILL.md) and [clock-and-time](../../apps/web/skills/clock-and-time/SKILL.md) for measured correction or supported direct entry.

[Plan schema](../../specs/action-plan.schema.json) · [Examples](../../specs/examples/)
