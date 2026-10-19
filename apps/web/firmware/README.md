# Precompiled ESP32 firmware

`manifest.json` is generated from successful real Arduino builds. Every part records its original flash offset, byte size and SHA-256; paths are relative to the manifest URL for GitHub Pages, Cloudflare and self-hosted static deployments.

The current product source is **0.4.0-rtc-direct**. Harness control uses a single-page WebRTC Direct connection; local HTTP remains for Wi-Fi setup, `/settings` and clipboard Shortcuts. The Bluetooth name is **iPhone Agent Bridge**. First-use USB or settings-page return links import the actual RTC address; no persistent helper tab or connection code is needed.

`RtcIdentity.h` and `rtc-defaults.json` provide the same long-lived communication certificate/fingerprint for every board. Users do not install a CA or maintain per-device certificates. Board identity, browser tokens, phone input proof and writer leases remain separate authorization checks.

The current four-profile build uses source `d6d8f75211fd14b8aa57d3f5ebf0f32d7fa425fe4f588df263a4eeb62a4b244a`. Its C3 application SHA-256 is `e77b201b3dd2ed6014b1206957ade1380f8e7ea5ad4b2ecd901c44fd914412df` (1,569,472 bytes). This revision adds authenticated phone association without mandatory keyboard testing, automatic native-key verification after one test action, and own-challenge cancellation. Identity, active-target, lease and pending-release fences remain. All four builds are compiled and sealed; this revision has not been physically flashed or phone-validated in the current run.

The [previous Safari evidence](../../../docs/research/rtc-control-final-safari-20261019.json) covers application `0ca0500ee626f8eece9b39cd76957d21ca42d43347b08d577ff0c03f355a4b6e`, not the current build. It records a 7000-byte request, reconnect passing eight checks, an HTTP 200 empty clipboard result and Japanese device settings. Phone HID and the combined phone workflow still require their own checks.

Earlier transport evidence: on 2026-10-19, the complete C3 production candidate passed eight desktop-browser checks in both [Chrome](../../../docs/research/rtc-control-chrome-20261019.json) and [Safari 27.0.1](../../../docs/research/rtc-control-safari-20261019.json), including a 7000-byte request, authorization checks and disconnect/reconnect. Its application SHA-256 is `f4bbb07aa39d3c9325d74319b0b266076ace2819787b9c5d712052293a815c1f`, built from source `8ec1b81184bfaa8fbde0842f326154b27a59b4dfd5b803379eb16f46fe4dbf1d`. BLE initialized and advertised with one saved bond and no connected phone. This establishes the desktop-to-board transport path; phone HID, background capture, Shortcut use and combined task acceptance remain separate.

The full phone workflow is undergoing hardware acceptance. [Phone prototype results](../../../docs/research/rtc-direct-c3-iphone-20261019.json) include short successes and intermittent failures; they do not establish complete product acceptance. The exact downloadable firmware version and validation fields come from the release's manifest.

## Hardware profiles

- Minimum **4 MB flash**, 3 MB Huge APP partition; 2 MB boards are unsupported.
- ESP32-C3/S3/C6 use native USB CDC. The development board must actually route its native USB connector.
- Original ESP32 has no native USB CDC; its USB connector normally uses an external UART bridge such as CP210x/CH340.
- Generic DIO profiles do not require PSRAM and do not cover unusual octal-flash modules.
- S2 is excluded because it has no BLE; H2 because it has no Wi-Fi.
- No LED/button/sensor/display/relay/user GPIO behavior is configured; native USB/UART wiring still depends on the board.

Chip-name labels stay untranslated (`ESP32-C3`, `ESP32-S3`, `ESP32-C6`, `ESP32`). Surrounding installation UI may be localized.

## Current compiled artifacts

`manifest.json` and `build-report.json` are the authoritative record for the binaries in this directory: firmware version, source hashes, pinned dependencies and per-profile build results. Each application and auxiliary image has its own byte count and SHA-256. The clean builder verifies the current source allowlist before publication, so an older binary is not presented as a new RTC build merely because the source has changed.

Build verification opens no serial port. Hardware results are recorded separately from compilation and hash checks.

## Manifest

Schema version 1 includes `firmwareVersion`, `stage`, `executionEnabled`, `physicalValidation`, `requiresManualTrust` and profiles with:

```text
{id,label,chip,board,minFlashMB,usbCdc,
 parts:[{path,offset,sha256,size}]}
```

Chip names use lowercase esptool identifiers. Each actual profile has four parts:

| Part | C3 / S3 / C6 | Original ESP32 |
|---|---:|---:|
| Bootloader | `0x0000` | `0x1000` |
| Partition table | `0x8000` | `0x8000` |
| Initial OTA metadata | `0xe000` | `0xe000` |
| Application | `0x10000` | `0x10000` |

Offsets are parsed from Arduino's generated `flash_args`; they are not guessed. NVS is not included in these part writes. Normal writes and explicit full-chip erase are different operations.

## Reproduction

```sh
python3 tools/build_firmware.py --parallel 2 --jobs 4
python3 tools/build_firmware.py --verify-only
python3 tools/build_firmware_test.py
./tests/firmware/run.sh
sh tests/firmware/rtc/run.sh
```

Requires ESP32 Arduino 3.3.11, ArduinoJson 7.4.3 and NimBLE-Arduino 2.5.1. Install libraries manually using Library Manager or `arduino-cli lib install "ArduinoJson@7.4.3" "NimBLE-Arduino@2.5.1"`; choose the pinned core in Boards Manager. Project-local NimBLE 2.5.1 is also supported.

The builder installs nothing, opens no serial port and contains no upload command. It compiles a clean source allowlist, excluding `config.local.h`, old experiment firmware and relay credentials. `build-report.json` records dependencies, exact FQBNs and individual/overall source hashes. Verification checks all binaries, offsets, partition bounds **and their source provenance against the current sketch**; stale or missing source records fail instead of passing old binaries as new firmware. Failed builds never appear as supported profiles.

Browser USB flashing additionally requires Web Serial; an iPhone Safari tab does not gain USB flashing merely because it runs the Harness. First setup and exact local serial/HTTP contracts are in [Arduino README](../../../firmware/IPhoneAutomationHarness/README.md) and [protected LAN design](../../../docs/architecture/secure-lan.md).

For repeat builds, `--work-dir /absolute/dedicated/cache` retains compiler artifacts. Staging is still limited to the public source allowlist; unexpected files cause a failure. This cache never opens a port and must not be used for local credential files. `--verify-only` checks each current source hash and the combined provenance hash as well as published binary hashes/offsets.

C3/S3/C6 use MSYS pools 8/8. The classic ESP32 SDK omits the second pool size, so that target preserves its disabled second pool (8/0) rather than enabling an undefined allocation; its physical two-phone throughput remains unverified. Effective values are available in USB diagnostics.
