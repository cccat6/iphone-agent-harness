# iPhone Agent Harness — Arduino firmware

Version 0.3 uses direct LAN HTTP and an optional local connection tab for browsers that block HTTPS-page-to-HTTP requests. Normal onboarding needs no private CA installation. The product firmware is separate from preserved `phone_chain_c3*` experiments. Compilation and protocol tests do not establish physical phone control; that acceptance remains separate from the successful browser transport experiment.

## Hardware and build

Only Wi-Fi, BLE and USB/UART serial are used. No user GPIO, LED, button, display, sensor or relay behavior is added. C3/S3/C6 profiles retain native USB CDC; original ESP32 uses its development board's external USB-to-UART bridge. Boards must have at least 4 MB ordinary SPI flash. Generic DIO profiles do not cover unusual octal-flash modules; PSRAM is not required. ESP32-S2 has no BLE and is excluded; H2 has no Wi-Fi and is excluded.

Pinned dependencies: ESP32 Arduino **3.3.11**, NimBLE-Arduino **2.5.1**, ArduinoJson **7.4.3**. Install through Boards/Library Manager. Open `IPhoneAutomationHarness.ino`; implementation is in ordinary `main.cpp` and `src/`. The `.ino` intentionally has no generated-prototype-dependent code.

```sh
arduino-cli compile --fqbn esp32:esp32:esp32c3:CDCOnBoot=cdc,FlashMode=dio,FlashSize=4M,PartitionScheme=huge_app \
  --libraries tools/libraries firmware/IPhoneAutomationHarness
python3 tools/build_firmware.py
python3 tools/build_firmware.py --verify-only
./tests/firmware/run.sh
python3 tools/build_firmware_test.py
```

The development Mac needs `--build-property tools.ctags.cmd.path=/usr/bin/true` for its incompatible bundled ctags; that workaround is valid here because setup/loop are ordinary C++. Scripts compile clean allowlisted sources and never copy `config.local.h`, old relay headers, Wi-Fi secrets or model credentials into public downloads. They contain no upload command and open no serial ports. Firmware manifests list only successful builds, with actual offset/size/SHA-256 values. Source and build provenance is in `apps/web/firmware/build-report.json`.

## Daily connection and optional settings

A bridge that already knows the home Wi-Fi reconnects by itself. Its default address is **http://igent.local**; no connection code is required by default. In Harness, connect to that address and retain the local connection tab. Bluetooth pairing and the phone input test are separate from Wi-Fi setup.

Open **http://igent.local/settings** (or the bridge’s IP address followed by `/settings`) to change its local device name or enable a connection code. The page obtains its own browser token; with code protection enabled, a new browser supplies the displayed connection code first. Existing authorized browsers retain their tokens. Changing the name restarts the idle bridge and returns its new address. A running task or active control lease must stop first. The generated code stays visible if a name change and code activation are saved together.

`IAH_HOSTNAME` defaults to `"igent"` and `IAH_PAIRING_CODE_REQUIRED` to `false` in `config.example.h`. A saved `bridgeSettings` NVS record overrides these compilation defaults. Older firmware without that record upgrades to the defaults while preserving Wi-Fi, Bluetooth bonds, board identity and existing browser grants. Multiple bridges can be assigned different names through their IP-address settings pages.

## First configuration

1. After flashing, click **Read device information** on the desktop page. Keep the device Wi-Fi name/password and phone setup link.
2. On the phone, connect to the device Wi-Fi, open `http://192.168.4.1`, and enter the name/password of your 2.4 GHz home Wi-Fi. The board connects itself; no computer Wi-Fi change is needed.
3. Switch back to home Wi-Fi and use the return link. The board starts its local HTTP API on port 80. No certificate installation is needed.
4. In Harness, tap **Connect**. The device connection tab opens. Switch back to Harness and keep that tab open; connection is reported only after it answers a request while hidden.
5. Pair **iPhone Agent Bridge** in Bluetooth settings and enable AssistiveTouch. Full Keyboard Access may remain on or off. Bluetooth pairing works before connecting the webpage and has no browser-triggered time limit.
6. Run the connection test. The board automatically types eight digits into the focused field. Confirm the result before starting screen sharing and a task.

The tested Safari 27.0.1 blocked direct HTTP/WS from the public HTTPS page. Local-window foreground GET/POST succeeded, but five GET/POST requests including both-tabs-hidden requests during screen sharing subsequently passed over about 21 seconds. Current physical firmware/HID control still needs separate validation. See [connection evidence](../../docs/research/ios-lan-probe20261018.json).

A connection code is optional; per-client tokens and verified phone input remain required for control. The compatibility field `publicKeyFingerprint` is a stable identity label in HTTP mode, not a certificate or encrypted-channel assertion. No cloud service forwards device operations.

## Local serial contract

Newline-delimited JSON at 115200. Serial is configuration/status only; it accepts no segments or arbitrary HID commands.

```json
{"op":"setup-info"}
{"op":"setup-config","ssid":"YOUR_WIFI","password":"YOUR_PASSWORD","origin":"https://igent.cc","unixTime":1792252800}
{"op":"setup-profile"}
{"op":"setup-finish"}
{"op":"setup-window"}
{"op":"status"}
{"op":"wifi-diagnostic"}
{"op":"wifi-power","dBm":8.5}
{"op":"wifi-reconnect"}
```

Use the current Unix timestamp rather than the illustrative value. `setup-config` validates exact fields and supplies owner proof internally for the physical USB operation. The reply acknowledges `configurationAccepted:true` and `status:"connecting"`; `secureConfigured` remains false until connection has actually been established. Check `status` for `configurationStatus:"connected"` before requesting `setup-finish`. A fresh IP event for the submitted SSID is required before saving the candidate network as one NVS record. Failed joins leave the previous saved network intact and keep setup Wi-Fi open; a failed saved-network boot automatically opens setup after 30 seconds. An automatically opened setup network remains open until setup is completed, even if the saved network later becomes reachable. No reply echoes Wi-Fi credentials.

`setup-info` returns `IAH_SETUP` plus the board ID, device Wi-Fi information, optional connection code (`setupPassword` is empty when disabled), `pairingCodeRequired`, `httpUrl`, `transport:"http"`, `caReady:false`, `manualTrustRequired:false` and stable identity label. The desktop UI keeps these values in memory and masks the connection code and setup link. `setup-profile` remains parseable for old tooling but returns no profile in this version. `setup-window` cancels input and stops the HTTP service before reopening setup Wi-Fi.

`wifi-diagnostic` reports connection state, disconnect reason, counters, credential byte lengths, current IP, power setting and heap metrics without printing the credentials. `wifi-power` accepts 8.5, 11, 13, 15, 17 or 19.5 dBm and persists that maximum. `wifi-reconnect` reuses the saved network. Both radio mutations are USB-only and require the network service and current input to be stopped.

## Local HTTP authorization and control

The default Harness origin is `https://igent.cc`. A self-hosted origin can be supplied through USB configuration. Direct cross-origin requests require that exact origin. The local `/harness-link` page accepts messages only from its actual opener at the configured origin, with the current random connection nonce and request ID. It then uses same-origin HTTP to the board. No website server forwards the operation.

The parent browser opens a unique connection window before awaiting any storage work. It reports ready only after the window answers an identity request while hidden and the Harness tab is visible. Closed/reloaded windows and request timeouts require explicit reconnection. A possibly executed operation is not automatically repeated.

Client tokens are separate random values. NVS stores their hashes. Each browser must pass a fresh eight-digit phone input test before control. The Core retains board/boot/client/target/lease/segment fences, replay rejection, measured execution receipts and fail-closed cancellation. The board never reports that a screenshot was taken; capture barriers belong to the browser.

## Resources and scheduling

The supported configuration has two BLE connections/bonds, eight registered network clients, two HTTP socket sessions and one writer lease per phone. An additional phone can replace an offline saved phone; connected phones are never evicted to make room. The replacement needs its own connection test. HTTP handlers run sequentially. Per-phone input schedules remain independent and address the exact current Bluetooth connection handle and generation.

The HTTP handler and Arduino loop each use an 8 KB stack. Network receive/JSON/hash work does not hold the short Core mutex. NimBLE callbacks publish bounded snapshots and never wait for that mutex. Normal setup generates no CA and runs no TLS listener.

`ResourceLimits.h` is included after the SDK settings in every C/C++ compilation unit. It sets peripheral-only NimBLE, ATT MTU 23, two connections/bonds and MSYS pools 8/8 on C3/S3/C6; original ESP32 preserves its SDK-disabled second pool, 8/0. The Core has 128 events per target and an 8192-byte request ceiling. Motion reports have a 40 ms minimum interval and 20 ms pointer settling. Long held gestures are not split across network submissions.

The 7168-byte boot-local replay filter uses RTC RAM and is cleared for every new Core boot. Cancelled or uncertain operations do not get invented successful receipts. Repeated setup finish is idempotent; opening setup again clears any previous finish deadline.

## Verification

The build report and manifest identify the actual compiled source and all four chip profiles. `physicalValidation:false` remains set until the new version's physical behavior is tested. Host tests cover Core/admission/routing invariants; browser transport tests cover strict message routing, hidden-window readiness, cancellation, timeouts and no replay.

The Safari 27.0.1 read-only local-window experiment passed five GET/POST requests over about 21 seconds, including requests while both tabs were hidden during screen sharing. It used a local fixture, not this ESP32 firmware. Actual C3 HTTP readback, Bluetooth input, gestures and multi-phone behavior are separate observations. The older HTTPS firmware's [hardware report](../../docs/research/device-client-live-verification.json) remains historical evidence only.
