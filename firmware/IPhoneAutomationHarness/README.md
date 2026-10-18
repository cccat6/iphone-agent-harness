# iPhone Agent Harness — Arduino firmware

Version **0.4.0-rtc-direct** connects the Harness page to the bridge through WebRTC Direct on the local network. HTTP remains available for Wi-Fi setup, device settings and clipboard Shortcuts. Daily control uses one Harness page, without a persistent connection tab, connection code or phone certificate installation.

The production firmware is separate from the preserved `phone_chain_c3*` and `firmware/experiments/rtc_direct_probe` experiments. Its integrated BLE/RTC hardware acceptance is recorded separately from the successful short phone transport prototype tests.

## Hardware and build

Only Wi-Fi, BLE and USB/UART serial are used. No user GPIO, LED, button, display, sensor or relay behavior is added. C3/S3/C6 retain native USB CDC; original ESP32 uses its development board's USB-to-UART bridge. Boards need at least 4 MB ordinary SPI flash. Generic DIO profiles require no PSRAM. ESP32-S2 has no BLE and H2 has no Wi-Fi, so neither is supported.

Pinned dependencies: ESP32 Arduino **3.3.11**, NimBLE-Arduino **2.5.1**, ArduinoJson **7.4.3**. Open `IPhoneAutomationHarness.ino`; the implementation is in ordinary `main.cpp` and `src/`.

```sh
arduino-cli compile --fqbn esp32:esp32:esp32c3:CDCOnBoot=cdc,FlashMode=dio,FlashSize=4M,PartitionScheme=huge_app \
  --libraries tools/libraries firmware/IPhoneAutomationHarness
python3 tools/build_firmware.py
python3 tools/build_firmware.py --verify-only
./tests/firmware/run.sh
sh tests/firmware/rtc/run.sh
python3 tools/build_firmware_test.py
```

The development Mac additionally uses `--build-property tools.ctags.cmd.path=/usr/bin/true`. The clean builder copies allowlisted product sources, excluding private Wi-Fi configuration, model credentials and experimental firmware. It opens no serial port and contains no upload command. Build provenance, offsets, sizes and hashes are recorded with the downloadable firmware.

## First configuration and daily connection

1. After flashing, choose **Read device information** on the desktop installer. It provides the device Wi-Fi details and a phone connection link.
2. For a new board, connect the phone to that device Wi-Fi, open `http://192.168.4.1` and enter the home 2.4 GHz Wi-Fi details. A board already configured for that network can skip this step.
3. Return the phone to the home network. Open the supplied link, or visit `http://igent.local/settings` and choose **Return to Harness**. That same-tab return imports the board's actual numeric RTC address; no manual IP entry or direct WebRTC resolution of `igent.local` is needed.
4. In Harness, choose **Connect ESP32 bridge**. The connection stays inside the Harness page; the manager does not need to remain open.
5. Pair **iPhone Agent Bridge** in iOS Bluetooth settings and enable AssistiveTouch. Full Keyboard Access may stay on or off. Bluetooth pairing has no browser-triggered time window.
6. Start the connection test and confirm the eight digits automatically received through HID, then share the screen and start a task.

The default local management name is `igent.local`. `/settings` changes the hostname while the bridge is idle and supplies its new address. Saved browser credentials are reused, but phone input proof must be current. Multiple bridges can use different names.

Connection codes are removed. Old `pairingCodeRequired` settings and legacy supplied `setupPassword` values do not reinstate them. Normal updates preserve Wi-Fi settings, Bluetooth bonds, board identity and browser grants.

## RTC transport and identity

`src/RtcBridge.h` owns UDP 18948, ICE-lite, DTLS and the bounded SCTP/RPC adapter. It connects one ordered, negotiated data channel, ID 0. `RtcSctp.h` implements receive reordering, duplicate suppression, SACKs, finite retransmission, cookie/tag/checksum checks and heartbeat/closing. `RtcRpc.h` assembles 256-byte chunks into bounded requests and replies; monotonic request numbers prevent same-connection replay before application dispatch.

The shared long-lived ECDSA certificate in `RtcIdentity.h` matches `apps/web/firmware/rtc-defaults.json`. The project uses this common communication configuration rather than per-device certificate maintenance. It is not a board identity or authorization token: the application still checks the board, boot, browser token, verified phone, writer lease and operation identity. It contains no website or model-service credentials.

The RTC callback dispatches the same application routes used by the local service. No website server forwards commands. Closing or losing a connection cancels its coordination; unknown mutation delivery is reconciled by receipt ID rather than automatically repeated.

## Local HTTP and the clipboard

HTTP port 80 serves provisioning, `/settings`, status and Shortcut requests. The configured Harness origin defaults to `https://igent.cc` and can be changed for self-hosting. USB output and the local manager's return link provide `rtc:{ip,port,fingerprint}`; the actual IP is supplied once Wi-Fi is connected.

The downloadable [iPhone Agent Clipboard Shortcut](https://igent.cc/shortcuts/clipboard.html) fetches a temporary text job through one HTTP stream, copies it to the phone clipboard and acknowledges completion. The browser supplies chunks as the stream drains; the bridge keeps one 1 KiB slot, rather than buffering the whole text. There is no 8 KiB total clipboard-text limit. The Harness waits for that acknowledgement before continuing. Jobs are tied to the current browser/phone context, expire and can be cancelled. Clipboard content is transient; the board does not store conversations or screenshots.

## Local serial contract

Newline-delimited JSON at 115200 supports configuration and diagnostics, not arbitrary HID input:

```json
{"op":"setup-info"}
{"op":"setup-config","ssid":"YOUR_WIFI","password":"YOUR_PASSWORD","origin":"https://igent.cc","unixTime":1792252800}
{"op":"setup-finish"}
{"op":"setup-window"}
{"op":"status"}
{"op":"wifi-diagnostic"}
{"op":"wifi-power","dBm":8.5}
{"op":"wifi-reconnect"}
```

Use the current Unix timestamp. `setup-config` acknowledges `configurationAccepted:true` with `status:"connecting"`; configuration completes only after a fresh IP event for the submitted SSID. Check status before `setup-finish`. Failed joins preserve the previous saved network and keep setup available. A failed saved-network boot opens setup after 30 seconds.

`setup-info` returns `IAH_SETUP` with board/boot identity, device Wi-Fi details, `httpUrl`, `transport:"webrtc-direct"` and RTC configuration. Compatibility fields report an empty setup password, `pairingCodeRequired:false` and `manualTrustRequired:false`. Return links contain no owner credential. Legacy `setup-profile` remains parseable but supplies no profile for ordinary setup. `setup-window` cancels input and reopens device Wi-Fi.

`wifi-diagnostic` reports state, disconnect reason, counters, credential byte lengths, current IP, power and heap metrics without printing credentials. USB-only `wifi-power` accepts 8.5, 11, 13, 15, 17 or 19.5 dBm; `wifi-reconnect` reuses the saved network. Their existing maintenance gates still apply.

## Scheduling and resources

The product supports two BLE connections/bonds, eight registered network clients and one writer lease per phone. The current RTC adapter has one active peer and one active RPC. New ICE traffic cannot evict a live connection or active writer. An additional phone can replace an offline saved phone, but connected phones are not evicted and each replacement needs its own input test.

The RTC task runs on core 0 at priority 1 with an 8 KiB stack. HTTP management and the Arduino loop each use a 6 KiB stack and remain separate. Network receive, JSON and hashing stay outside the short Core mutex. NimBLE jobs validate the stable phone identity and connection generation immediately before notification; callbacks do not wait on the Core mutex.

`src/RtcTls` builds the complete TLS source family matching the ESP-IDF SDK, with 2048-byte input and output record content limits. Crypto and X.509 retain the matching SDK libraries. This reduces the two calculated record-buffer allocations by 28,672 bytes; the [link guard](../../tools/verify_rtc_tls_link.py) checks that no precompiled SDK TLS objects are mixed in. See the [source and configuration record](src/RtcTls/README.md). Full combined BLE, HTTP and RTC acceptance remains tracked separately from this allocation calculation.

`ResourceLimits.h` retains peripheral-only NimBLE, ATT MTU 23, two connections/bonds and MSYS pools 8/8 on C3/S3/C6; original ESP32 preserves its SDK-disabled second pool, 8/0. Core has 128 events per target and an 8192-byte request ceiling. Motion reports have a 40 ms minimum interval and 20 ms pointer settling. A held gesture is not split to fit a network request.

The 7168-byte boot-local segment replay filter resides in RTC RAM and is cleared for each new Core boot. This is separate from RPC's constant-memory monotonic request numbering. Cancelling, lease expiry, BLE loss and timing misses stop dependent work and request input release. Screenshots remain browser-owned; the board never invents screenshot completion.

## Verification status

The manifest and build report identify actual compiled artifacts; `--verify-only` rejects stale source provenance. Protocol tests cover packet loss/reordering/duplicates, RPC size/replay boundaries and the final-response/next-request race. They do not measure BLE plus DTLS runtime memory or actual phone behavior.

The final C3 candidate uses source `1299070b61333af8b5dd9227b2e2132d216cc01ad4811cc4860c4ef8e4c43523` and application SHA-256 `0ca0500ee626f8eece9b39cd76957d21ca42d43347b08d577ff0c03f355a4b6e` (1,558,032 bytes). [Final Safari evidence](../../docs/research/rtc-control-final-safari-20261019.json) records the flashed boot, a 7000-byte request and reconnect passing all eight checks, an HTTP 200 empty clipboard result, and Japanese device settings. Phone HID and the combined phone workflow still require their own checks.

Earlier transport evidence: on 2026-10-19, the complete C3 production candidate passed eight desktop-browser checks in both [Chrome](../../docs/research/rtc-control-chrome-20261019.json) and [Safari 27.0.1](../../docs/research/rtc-control-safari-20261019.json), including a 7000-byte request, authorization checks and disconnect/reconnect. Its application SHA-256 is `f4bbb07aa39d3c9325d74319b0b266076ace2819787b9c5d712052293a815c1f`, built from source `8ec1b81184bfaa8fbde0842f326154b27a59b4dfd5b803379eb16f46fe4dbf1d`. BLE initialized and advertised with one saved bond and no connected phone. This establishes the desktop-to-board transport path; phone HID, background capture, Shortcut use and combined task acceptance remain separate.

[Short phone prototype results](../../docs/research/rtc-direct-c3-iphone-20261019.json) include successful foreground/background requests and intermittent failures. The complete production RTC/BLE firmware, Shortcut use, gestures and multi-phone behavior are being accepted separately. Historical HTTP and connection-window reports remain historical evidence.
