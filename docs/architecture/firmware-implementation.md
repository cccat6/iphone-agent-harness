# Firmware implementation

[Arduino setup and build](../../firmware/IPhoneAutomationHarness/README.md) · [Transport](secure-lan.md) · [Actions](actions.md)

The firmware targets Wi-Fi/BLE ESP32 families listed in the release manifest. C2 uses a 2 MB single-app layout with separately built 26/40 MHz SDK variants; other declared profiles use a 4 MB Huge APP layout. No application-specific GPIO peripherals are required. Pinned dependencies and reproducible build instructions are in the Arduino guide; generated manifests identify actual offsets, sizes and hashes.

Local HTTP provides Wi-Fi provisioning, device settings and clipboard handoff. WebRTC Direct carries normal control through one ordered data channel. Shared communication certificate configuration removes per-board CA installation; board identity and browser tokens remain separate application checks.

BLE callbacks publish bounded snapshots rather than waiting on the Core lock. Directed reports validate stable identity and connection generation. Each target has a writer lease and released/unknown input state. Canonical payload hashing, bounded admission, boot fencing and replay tracking precede scheduling. Cancellation, expiry, disconnect and lateness terminate dependent input and attempt release.

The board stores no screenshots, model keys or authoritative conversations. Clipboard streaming retains a bounded temporary slot, bound to the intended job; download is not copy confirmation. Network and held-input limits are independent of total task duration.

There are two configured BLE connection/bond slots, eight saved browser clients and one active RTC peer/RPC. These capacities are not claims of measured simultaneous-phone performance. The latest multi-client enrollment/import repair remains unflashed and physically unverified. Protocol tests, TLS linkage checks and compilation do not establish phone gesture behavior, combined radio memory or background reliability.
