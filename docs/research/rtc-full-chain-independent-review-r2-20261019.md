# WebRTC Direct full-chain independent review — round 2

Date: 2026-10-19 (Asia/Shanghai).

Scope: fresh review of current production RTC framing and lifecycle, C3 SCTP/RPC dispatch, client/target/lease admission, persisted connection metadata, clipboard HTTP pickup and copy acknowledgement, and generated Shortcut action ordering. This reviewer used no serial ports, browser automation, phone input, deployment or GitHub Actions.

## New findings and resolution

**Clipboard capacity and RTC wire capacity disagree.** The clipboard API and tool prompt accept and advertise up to 8192 UTF-8 bytes. The RTC transport serializes the already serialized HTTP body inside another JSON envelope, and limits that envelope to 12288 bytes. Ordinary JSON text containing quotes can exceed the wire limit while remaining below the clipboard limit. Reproduction: `JSON.stringify(Array.from({length:350},(_,id)=>({id,name:'a'})))` is 7591 bytes; with normal IDs and authorization metadata the wire envelope is 14289 bytes and `encodeRTCFrames` rejects it with `DEVICE_REQUEST_TOO_LARGE` before sending. Plain 8192-byte text does fit. This is a functional capacity mismatch, not a replay or partial-input bug. Root notified to resolve the advertised/accepted contract or support the full bound.

The Web path now uses `textBase64`, preserving the 8192-byte limit without double JSON escaping or increasing RTC capacity. A new independent regression uses the real `DeviceClient` and real RTC encoder to send full-size quotation marks, newlines, and mixed Chinese/newline/quotation-mark text; all three reassemble byte-for-byte within the 12288-byte envelope and 512-byte frame limits. It failed before the fix and passes afterward. Firmware Base64 decoding was reviewed for canonical padding, decoded-size limit, UTF-8 and NUL handling.

**HTTP JSON pickup must escape raw C0 controls.** The new wire host test stopped at its expected JSON expansion assertion: the pinned ArduinoJson serializer does not perform the assumed `U+0001` escaping. The firmware author corrected the buffered writer to track JSON-string and escape state, escape raw C0 bytes inside strings, and retain a bounded 512-byte output buffer. Independent rerun with AddressSanitizer and UndefinedBehaviorSanitizer now passes: full-size UTF-8/Base64 boundaries, malformed encoding rejection, 48 KB escaped output, mixed quotation marks/backslashes/Unicode, exact round-trip text, and a latched failed sink. Static review found no new issue in the repaired decoder/writer.

Both round-2 findings are resolved in the working tree. No additional blocking finding was identified within this review's scope after the repairs. A fresh reviewer should inspect the final integrated sources before release.

## Verified current behavior

- 23 focused Web cases pass: RTC framing, request ordering and queue cancellation, transport close without replay, enrollment, setup imports and stale-IP recovery, clipboard receipt matching and UI continuation.
- The repaired imported-board check survives two consecutive wrong-board connection attempts. Neither attempt enrolls or saves credentials. `pendingSetup` is cleared only after successful public-settings persistence.
- The RTC protocol host suite passes with AddressSanitizer and UndefinedBehaviorSanitizer, including retransmission, receive gaps, duplicate suppression, sequence wraparound, heartbeat, shutdown and the last-response/next-request ordering case.
- The full firmware host suite passes: Core, admission, clipboard mailbox, setup lifecycle, real BLE routing/callback definitions, bond handling and strict JSON parsing.
- Clipboard HTTP pickup changes the job to delivered; it does not authorize paste. The generated Shortcut copies before sending the correlated acknowledgement. Browser completion checks the exact request/session/target/client/board/boot identities. Session change or transport loss prevents continuation.
- Production RTC uses an empty ICE server list and one local candidate. No helper tab or cloud signaling was added. Shared transport certificate behavior is the explicitly requested design and was not treated as a review defect.

## Acceptance boundaries

This review does not establish actual iPhone Shortcut import or execution, native clipboard contents, HTTP local-network permission, BLE typing/pointer effect, Safari background longevity or production radio coexistence. The earlier echo prototype is separate evidence. These remain physical acceptance work; host checks are not a substitute.
