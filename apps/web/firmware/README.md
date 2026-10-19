# ESP32 firmware files

The [browser installer](https://igent.cc/flash) reads `manifest.json` to choose and flash a board. Each part has a path, offset, byte size and SHA-256 hash. The firmware uses WebRTC Direct for commands, Bluetooth HID for phone input, and HTTP for setup and clipboard Shortcuts.

## Board profiles

| Chip | Flash | USB connection |
|---|---|---|
| C2 | 2 MB | USB-to-UART; separate 26/40 MHz crystal builds |
| C3, C5, C6, S3 | 4 MB | Native USB CDC or the board’s USB-to-UART connector |
| Classic ESP32 | 4 MB | USB-to-UART |

These profiles use standard SPI flash in DIO mode. PSRAM and external peripherals are unused. The installer detects a C2 board’s crystal and selects the matching image.

C2 uses one factory application partition of 1,966,080 bytes. The other profiles use the 3 MB Huge APP partition layout.

## Manifest and build records

`manifest.json` describes the files the installer writes. `build-inputs.json` records the source and toolchain, and `build-report.json` records the build results.

A profile contains:

```text
{id,label,chip,board,minFlashMB,usbCdc,flashFreq,
 parts:[{path,offset,sha256,size}]}
```

| Part | Offset |
|---|---|
| Bootloader | C5: `0x2000`; classic ESP32: `0x1000`; others: `0x0000` |
| Partition table | `0x8000` |
| Initial OTA metadata | `0xe000` |
| Application | `0x10000` |

The builder reads offsets from Arduino’s generated `flash_args`. Normal installation preserves NVS, which holds Wi-Fi settings and Bluetooth pairings.

## Build locally

Install ESP32 Arduino **3.3.11**, ArduinoJson **7.4.3** and NimBLE-Arduino **2.5.1**, then run from the repository root:

```sh
python3 tools/build_c2_sdk.py --jobs 2
python3 tools/build_firmware.py --parallel 2 --jobs 2
python3 tools/build_firmware.py --verify-only
```

The C2 SDK script builds the two crystal variants in a project cache using pinned Espressif sources. Subsequent runs reuse matching cached files. `--work-dir /absolute/cache` lets the firmware builder reuse compiler artifacts.

Verification checks source hashes, dependencies, binary hashes, flash offsets and partition sizes. The [manual release workflow](../../../docs/architecture/manual-release.md) reuses firmware with matching inputs.

[Arduino source and serial interface](../../../firmware/IPhoneAutomationHarness/README.md) · [WebRTC transport](../../../docs/architecture/secure-lan.md)
