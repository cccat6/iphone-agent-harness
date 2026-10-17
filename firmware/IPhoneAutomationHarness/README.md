# iPhone Automation Harness — Arduino framework

This is the **product scaffold**, separate from the preserved `phone_chain_c3*` experiments. It compiles for ESP32-C3 and has a host-tested scheduler. It has **not** been flashed or tested with a phone. Network control is deliberately unavailable until authenticated pairing and browser-to-target verification exist.

## What runs today

- Stable board ID, per-boot ID and monotonic millisecond clock.
- Wi-Fi station mode using this sketch's own `iah-product` NVS namespace. It never reads the old experiment's Wi-Fi or relay namespace.
- Unique `harness-xxxxxxxxxxxx.local` name and `_iah._tcp` mDNS service when Wi-Fi connects.
- `GET /v1/identity`, `/v1/capabilities`, `/v1/clock` diagnostic endpoints. `identityVerified:false` and `executionEnabled:false` are intentional.
- Exact-origin opt-in CORS, `Cache-Control:no-store`, no wildcard origin. Read endpoints contain no credentials.
- Absolute-pointer, ordinary keyboard and Consumer Home BLE reports with **explicit connection-handle notifications**. No report is broadcast to all peers.
- BLE callbacks publish bounded snapshots. Only `loop()` mutates scheduler/registry state or writes NVS.
- Bond identity mapping persists resolved public/static identity address **with address type**, not a rotating over-the-air private address. `targetId` is separately generated and is not the address itself. Encryption and bonding are required; unknown/RPA identities are not admitted.
- Reconnection begins with released input. A disconnection is recorded without claiming its release was delivered.
- Core limits: 2 target records, 8 local client records, 512 events per segment, 5-second segment, 3-second maximum held channel, 15-second lease, 16 result receipts. These are implementation limits, **not verified simultaneous-phone capacity**.

HID descriptors preserve the tested probe's absolute coordinates and Home structure, but remove the unsuccessful Fn field and explicitly cover keyboard usages through 231. The product descriptor is changed and still needs fresh physical validation. Manufacturer identification is generic Espressif, not Apple.

## What does not run yet

- Protected SoftAP provisioning/captive portal and physical pairing-window UX.
- Per-client cryptographic pairing, signed-request verification, counters/nonces and identity fingerprint.
- Proof that a browser client controls the intended bonded phone. A recorded BLE bond is **not** proof of browser-to-phone ownership.
- Persistent browser client grants or wire parsing/canonical SHA-256 verification.
- Authenticated lease/segment/cancel/settings HTTP routes. All non-GET requests return `503 transport_auth_not_implemented`.
- HTTPS/local-network-access policy testing, asynchronous network integration or timing/velocity validation.
- Screenshots, media streams, AI calls or user session history on the board. Those belong to Web.

The portable `Core` admission methods are internal calls for a future authenticated transport. The caller must validate the complete wire schema, canonical payload hash and authenticated identity before calling them. Do not route arbitrary JSON directly into `Core::accept()` or expose `bindClient()` as an unprotected route.

## Build

Supported build target used here:

- Arduino ESP32 core **3.3.11**.
- NimBLE-Arduino **2.5.1**; lock this version for callback/targeted-notification APIs.
- ArduinoJson **7.4.3**.
- Board: **ESP32C3 Dev Module**, 4 MB flash, USB CDC on boot, DIO, **Huge APP (3 MB No OTA/1 MB SPIFFS)** partition.

Open `IPhoneAutomationHarness.ino` in Arduino IDE. Install the listed dependencies. The implementation is in `main.cpp`; the `.ino` intentionally contains no generated-prototype-dependent functions. With Arduino CLI from the repository root:

```sh
arduino-cli compile \
  --fqbn esp32:esp32:esp32c3:CDCOnBoot=cdc,FlashMode=dio,PartitionScheme=huge_app \
  --libraries tools/libraries \
  firmware/IPhoneAutomationHarness
```

On the development Mac only, an incompatible Arduino ctags binary requires `--build-property tools.ctags.cmd.path=/usr/bin/true`. This is valid here because all implementation is ordinary C++ with an empty `.ino`; do not use that workaround for arbitrary sketches needing generated prototypes.

No upload command is included in automated tests. Selecting a port and flashing remains a separate physical step.

## Development configuration

Production hotspot onboarding is not implemented. For a local development build, create `config.local.h` alongside the sketch using the keys shown in `config.example.h`. This file is ignored. Keep credentials out of source control and build logs.

Alternatively the sketch accepts a newline-delimited USB JSON configuration message:

```json
{"op":"configure-wifi","ssid":"YOUR_NETWORK","password":"YOUR_PASSWORD"}
```

It stores credentials only in its own NVS namespace and returns configuration status without echoing secrets. `{"op":"status"}` reports diagnostics. USB does not accept input or segment commands. Normal station connection is asynchronous; `configured:true` does not mean connected.

The diagnostic API is plain HTTP. Do not put sensitive endpoints on it or assume CORS provides authentication/encryption. Setting `IAH_ALLOWED_ORIGIN` only enables diagnostic reads from that exact browser origin; it does not establish trusted identity or bypass Safari network policy.

## Host verification

```sh
./tests/firmware/run.sh
```

Tests exercise real portable C++ scheduler state with a fake report sink. No serial ports, Bluetooth connections or board commands are used. See [firmware architecture](../../docs/architecture/firmware-implementation.md) for invariants and remaining integration work.
