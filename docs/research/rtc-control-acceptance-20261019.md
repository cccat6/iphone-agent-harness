# WebRTC Direct control integration — 2026-10-19

The production C3 firmware and production Web client now communicate through a local WebRTC data channel. The final app hash is `0ca0500ee626f8eece9b39cd76957d21ca42d43347b08d577ff0c03f355a4b6e`, source set `1299070b61333af8b5dd9227b2e2132d216cc01ad4811cc4860c4ef8e4c43523`; its [final Safari repeat](rtc-control-final-safari-20261019.json) includes empty-clipboard and language-query checks. Earlier transport measurements below retain their original hashes. This report distinguishes completed desktop/board verification from remaining phone acceptance.

## Verified

- Earlier C3 transport application `f4bbb07aa39d3c9325d74319b0b266076ace2819787b9c5d712052293a815c1f`, source set `8ec1b81184bfaa8fbde0842f326154b27a59b4dfd5b803379eb16f46fe4dbf1d`. Only the authorized `1101` device was flashed. Application readback verification passed; Wi-Fi settings and the existing Bluetooth bond were retained.
- [Chrome](rtc-control-chrome-20261019.json) and [Safari 27.0.1](rtc-control-safari-20261019.json) each passed real-board identity, browser enrollment, binding status, capability discovery, clock synchronization, unauthenticated-request rejection, a 7,000-byte fragmented request, subsequent reads and disconnect/reconnect with saved credentials. No HID input was sent.
- [The production Harness UI](rtc-control-ui-20261019.json) connected to the real board, distinguished bridge connectivity from phone Bluetooth connectivity, saved connection information, and reconnected after reload. The local test fixture simulated mobile identification only; RTC used the actual C3.
- [Board diagnostics](rtc-control-board-20261019.json) confirmed Wi-Fi, HTTP, RTC and BLE initialization together. BLE advertised **iPhone Agent Bridge**, with one retained bond and zero currently connected phones. This does not establish input under simultaneous active BLE traffic.
- Safari could open `http://igent.local/settings` and obtain the return link with the current numeric RTC address. [Using `igent.local` directly as an RTC candidate timed out](rtc-mdns-safari-20261019.json). First-time users should use the board's return link or the desktop flashing page's generated link; no manual IP entry or persistent helper tab is needed.
- [Native Mac Shortcuts](shortcuts-stream-http-mac-20261019.json) received 112,000 bytes through one HTTP request, waited for the final chunk, and returned byte-identical text. That test did not write the system clipboard.
- The transport-stage Web suite passed 589 tests; subsequent session and layout checks are recorded in the later independent reports. Firmware host tests, ASan/UBSan protocol tests, actual Arduino String allocation tests and TLS-link ownership tests passed. Independent reviews [R5](rtc-stream-independent-review-r5-20261019.md), [R6](rtc-runtime-independent-review-r6-20261019.md) and [R7](rtc-packet-independent-review-r7-20261019.md) record their separate scopes.

## Changes resulting from real-board verification

The first combined firmware exhausted most free heap. The project now rebuilds the exact SDK-matched TLS implementation with 2 KiB record buffers, verifies linker ownership, uses bounded clipboard streaming and releases request allocations before dispatch. No precompiled TLS implementation with different buffer assumptions is mixed in. Control-interface measurements showed approximately 43 KiB free heap; minimum heap dropped during large requests, as recorded in the linked evidence.

The first RPC also exposed a stale-clock unsigned subtraction that could immediately misclassify a request as timed out. Fresh clock reads and bounded signed elapsed-time checks fixed it. Larger browser requests exposed the need for SCTP DATA reassembly even when each application message is small. The receiver now reassembles messages up to 512 bytes, accepts packed records up to 2 KiB, preserves ordering and suppresses duplicates. Both repairs have failing-old/passing-new or independent packet regressions and subsequent real-browser evidence.

## Clipboard flow

The browser retains the full text. A native Shortcut opens one HTTP request; the C3 forwards one UTF-8 chunk at a time from WebRTC into that response, using one 1 KiB pending slot. HTTP progress advances the producer offset. Interrupted responses remain incomplete and cannot authorize paste. Only the Shortcut's acknowledgement after copying produces a copied receipt. With no pending text, the endpoint returns an empty result and the Shortcut exits without changing the clipboard. There is no dedicated 8 KiB or 20,000-character text cap; browser, Shortcut, model and destination-app resource limits still apply.

The webpage arms the producer when text is prepared, so running the installed Shortcut directly also works at the protocol level. Launching the Shortcut automatically through a Bluetooth keyboard shortcut has not been physically accepted.

## Phone acceptance remaining

Use the [short Chinese guide](../acceptance/zh-Hans.md). The remaining physical checks are Bluetooth reconnection and input proof, gestures while screen sharing, background control, and the actual iPhone Shortcut copy/acknowledgement/paste cycle. Earlier echo-prototype background results remain separate from this production-firmware acceptance. The production screen-sharing component has no fixed 35-second stop; that duration belonged to the old diagnostic procedure.

## Session and layout follow-up

[Real-browser history checks](session-history-browser-20261019.json) covered a 240-message session, both paging directions, a bounded 120-message working set, visible-only images and a complete file-backup round trip. [Viewport checks](viewport-browser-20261019.json) covered landscape, simulated pinch/pan and keyboard geometry. These use production DOM and real IndexedDB but synthetic phone viewport signals, so physical iPhone rotation and pinch remain part of the phone checklist. [R8](session-paging-independent-review-r8-20261019.md) found and verified a repaired image visibility race; a fresh [R9](final-ui-independent-review-r9-20261019.md) found no additional issue. Old backup records still require one complete record to be parsed, as described in the runtime architecture; the implementation does not claim constant memory for an arbitrarily large legacy record.
