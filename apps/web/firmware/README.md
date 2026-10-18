# Precompiled ESP32 firmware

`manifest.json` is generated from successful real Arduino builds. Every part records its original flash offset, byte size and SHA-256; paths are relative to the manifest URL for GitHub Pages, Cloudflare and self-hosted static deployments.

Version **0.3.0-lan-http** provides local Wi-Fi setup, HTTP control and the `/harness-link` connection window. Normal onboarding does not install a CA certificate, and website servers do not forward control commands. Owner enrollment, per-client tokens, phone input verification, writer leases and timed segments remain in place.

The browser-side local-window test passed five read-only GET/POST requests, including both-tabs-hidden requests during screen sharing, on Safari 27.0.1. `physicalValidation:false` remains correct: that test did not run this firmware on a board or send HID input. See [phone transport evidence](../../../docs/research/ios-lan-probe20261018.json).

## Hardware profiles

- Minimum **4 MB flash**, 3 MB Huge APP partition; 2 MB boards are unsupported.
- ESP32-C3/S3/C6 use native USB CDC. The development board must actually route its native USB connector.
- Original ESP32 has no native USB CDC; its USB connector normally uses an external UART bridge such as CP210x/CH340.
- Generic DIO profiles do not require PSRAM and do not cover unusual octal-flash modules.
- S2 is excluded because it has no BLE; H2 because it has no Wi-Fi.
- No LED/button/sensor/display/relay/user GPIO behavior is configured; native USB/UART wiring still depends on the board.

Chip-name labels stay untranslated (`ESP32-C3`, `ESP32-S3`, `ESP32-C6`, `ESP32`). Surrounding installation UI may be localized.

## Current compiled artifacts

All four profiles were compiled from the same 16-file source SHA-256 `ac83d1513a05c40f5a3cf0ab3b2f0c9099cefd7990cadf990902f214bc1acae7` with the pinned dependencies below. No serial port was opened by this build.

| Profile | Application bytes | Application SHA-256 |
|---|---:|---|
| ESP32-C3 | 1,407,760 | `9e0b755f8272cee565fadea524e750156917cf87a211126e71debd6a899f9fcc` |
| ESP32-S3 | 1,265,952 | `d37e118a450fc641b3867731a749a6de08b3be8744a0e68fe7ae095ef441ce87` |
| ESP32-C6 | 1,569,152 | `9dca12970a68e823cbd303ae521e67a48fd001e4b54ff5f9fae4b54638d06135` |
| ESP32 | 1,341,536 | `ea8bd86861fe4c485ebd4c6d265603ab77313454ec1d0161022a488fab5102fa` |

The previous 0.2 firmware's CA-verified C3 test remains historical evidence; it is not physical acceptance of this version.

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
```

Requires ESP32 Arduino 3.3.11, ArduinoJson 7.4.3 and NimBLE-Arduino 2.5.1. Install libraries manually using Library Manager or `arduino-cli lib install "ArduinoJson@7.4.3" "NimBLE-Arduino@2.5.1"`; choose the pinned core in Boards Manager. Project-local NimBLE 2.5.1 is also supported.

The builder installs nothing, opens no serial port and contains no upload command. It compiles a clean source allowlist, excluding `config.local.h`, old experiment firmware and relay credentials. `build-report.json` records dependencies, exact FQBNs and individual/overall source hashes. Verification checks all binaries, offsets, partition bounds **and their source provenance against the current sketch**; stale or missing source records fail instead of passing old binaries as new firmware. Failed builds never appear as supported profiles.

Browser USB flashing additionally requires Web Serial; an iPhone Safari tab does not gain USB flashing merely because it runs the Harness. First setup and exact local serial/HTTPS contracts are in [Arduino README](../../../firmware/IPhoneAutomationHarness/README.md) and [protected LAN design](../../../docs/architecture/secure-lan.md).

For repeat builds, `--work-dir /absolute/dedicated/cache` retains compiler artifacts. Staging is still limited to the public source allowlist; unexpected files cause a failure. This cache never opens a port and must not be used for local credential files. `--verify-only` checks each current source hash and the combined provenance hash as well as published binary hashes/offsets.

C3/S3/C6 use MSYS pools 8/8. The classic ESP32 SDK omits the second pool size, so that target preserves its disabled second pool (8/0) rather than enabling an undefined allocation; its physical two-phone throughput remains unverified. Effective values are available in USB diagnostics.
