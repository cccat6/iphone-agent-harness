# Firmware implementation

[Arduino setup and build](../../firmware/IPhoneAutomationHarness/README.md) · [Transport](secure-lan.md) · [Actions](actions.md)

The firmware supports ESP32-C2, C3, C5, C6, S3 and classic ESP32. C2 has separate 26/40 MHz builds and a 2 MB single-app layout. The other profiles use a 4 MB Huge APP layout. Generated manifests record flash offsets, sizes and hashes.

Local HTTP serves Wi-Fi setup, device settings and clipboard text. WebRTC Direct carries control over one ordered data channel. BLE HID supplies keyboard and pointer input. The firmware uses Wi-Fi, BLE and USB/UART serial; application GPIO peripherals are unused.

BLE callbacks publish snapshots. Directed input checks the phone identity and connection generation. Each target has a writer lease and an input state. Boot identity, payload hashes and replay records identify commands across reconnects. Cancellation, expiry, disconnect and late execution stop dependent input and release held keys and buttons.

Clipboard text streams through a temporary bounded buffer. Screenshots, model credentials and conversation history stay in the browser.

Configured capacity is two BLE connection/bond slots, eight saved browser clients and two independent WebRTC peers. One RPC runs at a time on each connection; each phone has one active writer.

Both RTC sessions share one read-only TLS server configuration, certificate, key and RNG on their owner task. Session record buffers remain separate. A handshake owner serializes the temporary cryptographic work while established peers continue processing packets. Failed heap allocations are counted without allocating memory in the callback; serial diagnostics expose the count and requested size.

SCTP DATA requests immediate acknowledgements, and loss recovery retransmits the original bytes and sequence number. RPC IDs, monotonic request numbers and action payload hashes distinguish transport recovery from a second physical action. Completed action receipts remain queryable after an uncertain response.

RTC requests use a bounded, fallible receive buffer. The envelope body is decoded in that owned buffer and linked explicitly into the parsed document; ArduinoJson 7 otherwise copies parsed strings. Dispatch releases the envelope before parsing an action body. An allocation failure returns an explicit unexecuted response, allowing the browser to retry without replaying an uncertain input.
