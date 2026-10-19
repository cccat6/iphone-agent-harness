# Firmware implementation

[Arduino setup and build](../../firmware/IPhoneAutomationHarness/README.md) · [Transport](secure-lan.md) · [Actions](actions.md)

The firmware supports ESP32-C2, C3, C5, C6, S3 and classic ESP32. C2 has separate 26/40 MHz builds and a 2 MB single-app layout. The other profiles use a 4 MB Huge APP layout. Generated manifests record flash offsets, sizes and hashes.

Local HTTP serves Wi-Fi setup, device settings and clipboard text. WebRTC Direct carries control over one ordered data channel. BLE HID supplies keyboard and pointer input. The firmware uses Wi-Fi, BLE and USB/UART serial; application GPIO peripherals are unused.

BLE callbacks publish snapshots. Directed input checks the phone identity and connection generation. Each target has a writer lease and an input state. Boot identity, payload hashes and replay records identify commands across reconnects. Cancellation, expiry, disconnect and late execution stop dependent input and release held keys and buttons.

Clipboard text streams through a temporary bounded buffer. Screenshots, model credentials and conversation history stay in the browser.

Configured capacity is two BLE connection/bond slots, eight saved browser clients and one active WebRTC peer. One RPC runs at a time.
