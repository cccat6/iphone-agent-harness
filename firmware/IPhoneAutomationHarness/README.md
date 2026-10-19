# iPhone Agent Harness — Arduino firmware

The ESP32 receives commands from Harness over local Wi-Fi and sends Bluetooth keyboard and pointer input to the phone. Version **0.5.1-rtc-direct** uses WebRTC for commands and HTTP for Wi-Fi setup, settings and clipboard Shortcuts.

## Hardware and build

The firmware uses Wi-Fi, BLE and USB/UART serial. External GPIO peripherals are unused. C3/C5/C6/S3 retain native USB CDC; original ESP32 uses its development board's USB-to-UART bridge. C2 boards need at least 2 MB flash; other declared profiles need at least 4 MB ordinary SPI flash. C2 has separate 26/40 MHz SDK builds and uses USB-to-UART.

Pinned dependencies: ESP32 Arduino **3.3.11**, NimBLE-Arduino **2.5.1**, ArduinoJson **7.4.3**. Open `IPhoneAutomationHarness.ino`; the implementation is in ordinary `main.cpp` and `src/`.

```sh
arduino-cli compile --fqbn esp32:esp32:esp32c3:CDCOnBoot=cdc,FlashMode=dio,FlashSize=4M,PartitionScheme=huge_app \
  --libraries tools/libraries firmware/IPhoneAutomationHarness
python3 tools/build_c2_sdk.py --jobs 2
python3 tools/build_firmware.py --parallel 2 --jobs 2
python3 tools/build_firmware.py --verify-only
./tests/firmware/run.sh
sh tests/firmware/rtc/run.sh
python3 tools/build_firmware_test.py
```

The build script creates firmware and a manifest containing flash offsets, sizes and hashes. Use the [browser installer](https://igent.cc/flash) to write a board.

## Connect a phone

1. Flash the board on the [desktop installer](https://igent.cc/flash), then choose **Read device information**.
2. Connect to the board’s setup Wi-Fi and save your usual 2.4 GHz Wi-Fi network.
3. Put the phone on that network. Open the installer’s phone link, or use **Get bridge information** in Harness.
4. Pair **iPhone Agent Bridge** in iOS Bluetooth settings and enable **Settings → Accessibility → Touch → AssistiveTouch**.
5. In Harness, connect the bridge and choose the phone. Share the screen when starting a task.

The local settings page is `http://igent.local/settings`. Use it to change Wi-Fi or the bridge name. A normal firmware update preserves these settings and Bluetooth pairings.

## RTC transport and identity

`src/RtcBridge.h` provides two independent control slots on UDP 18948 and 18949, each with ICE-lite, DTLS and its own SCTP/RPC state. Each connection uses one ordered, negotiated data channel, ID 0. `RtcSctp.h` implements receive reordering, duplicate suppression, SACKs, finite retransmission, cookie/tag/checksum checks and heartbeat/closing. `RtcRpc.h` assembles 256-byte chunks into bounded requests and replies; monotonic request numbers prevent same-connection replay before application dispatch.

`RtcIdentity.h` and `apps/web/firmware/rtc-defaults.json` contain the shared DTLS certificate and fingerprint. Board ID, boot ID, browser token and target lease identify the device and current control session.

The RTC callback dispatches local application routes. Commands travel directly between phone and bridge. After a connection loss, the browser checks receipt IDs before continuing.

## Local HTTP and the clipboard

HTTP port 80 serves provisioning, `/settings`, status and Shortcut requests. USB output and the local manager's return link provide `rtc:{ip,port,fingerprint}`; the actual IP is supplied once Wi-Fi is connected.

The downloadable [iPhone Agent Clipboard Shortcut](https://igent.cc/shortcuts/clipboard.html) fetches a temporary text job through one HTTP stream, copies it to the phone clipboard and acknowledges completion. The browser supplies text in chunks through one 1 KiB bridge buffer. The Harness waits for that acknowledgement before continuing. Jobs are tied to the current browser/phone context, expire and can be cancelled. Clipboard content stays in a temporary transfer buffer.

## Local serial contract

The configuration and diagnostic interface uses newline-delimited JSON at 115200 baud:

```json
{"op":"setup-info"}
{"op":"setup-finish"}
{"op":"setup-window"}
{"op":"status"}
{"op":"wifi-diagnostic"}
{"op":"wifi-power","dBm":8.5}
{"op":"wifi-reconnect"}
```

For `setup-config`, supply exactly `op`, `ssid`, `password`, `origin` and a current numeric `unixTime` in seconds; use your network values and the deployed Harness HTTPS origin. `setup-config` acknowledges `configurationAccepted:true` with `status:"connecting"`; configuration completes only after a fresh IP event for the submitted SSID. Check status before `setup-finish`. Failed joins preserve the previous saved network and keep setup available. A failed saved-network boot opens setup after 30 seconds.

`setup-info` returns `IAH_SETUP` with board/boot identity, device Wi-Fi details, `httpUrl`, `transport:"webrtc-direct"` and RTC configuration. `setup-window` cancels input and reopens device Wi-Fi.

`wifi-diagnostic` reports state, disconnect reason, counters, credential byte lengths, current IP, power and heap metrics. USB-only `wifi-power` accepts 8.5, 11, 13, 15, 17 or 19.5 dBm; `wifi-reconnect` reuses the saved network.

## Scheduling and resources

The product supports two BLE connections/bonds, eight registered network clients and one writer lease per phone. The RTC adapter supports two independent peers, each with one active RPC. Each phone has a separate writer lease, released when its task ends or the connection is lost. An additional phone can replace an offline saved pairing; connected phones remain paired.

The RTC task runs on core 0 at priority 1 with an 8 KiB stack. HTTP management and the Arduino loop each use a 6 KiB stack and remain separate. Network receive, JSON and hashing stay outside the short Core mutex. NimBLE jobs validate the stable phone identity and connection generation immediately before notification; callbacks publish state through a queue.

`src/RtcTls` builds the complete TLS source family matching the ESP-IDF SDK, with 2048-byte input and output record content limits. Crypto and X.509 retain the matching SDK libraries. This reduces the two calculated record-buffer allocations by 28,672 bytes; the [link guard](../../tools/verify_rtc_tls_link.py) checks that all TLS objects use this configuration. See the [source and configuration record](src/RtcTls/README.md).

`ResourceLimits.h` retains peripheral-only NimBLE, ATT MTU 23, two connections/bonds and MSYS pools 8/8 on C3/C5/C6/S3; original ESP32 preserves its SDK-disabled second pool, 8/0. Core has 128 events per target and an 8192-byte request ceiling. Motion reports have a 40 ms minimum interval and 20 ms pointer settling. Each held gesture travels in one network request.

The 7168-byte boot-local segment replay filter resides in RTC RAM and is cleared for each new Core boot. This is separate from RPC's constant-memory monotonic request numbering. Cancelling, lease expiry, BLE loss and timing misses stop dependent work and request input release. The browser captures screenshots and reports their completion.

## Checks

`--verify-only` compares the binaries, flash layout and source hashes with the current project. Host tests cover scheduling, replay detection, cancellation and transport limits. The build report records these results for each profile.

[Phone guide](../../docs/guide/README.md) · [Architecture](../../docs/architecture/overview.md) · [Manual releases](../../docs/architecture/manual-release.md)
