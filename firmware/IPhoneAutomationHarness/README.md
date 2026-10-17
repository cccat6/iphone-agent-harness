# iPhone Agent Harness — Arduino firmware

Version 0.2 adds the protected LAN transport to the portable timed-HID core. The product firmware is separate from the preserved `phone_chain_c3*` experiments. **Compilation and host tests do not establish full physical acceptance:** the final C3 binary has passed CA/hostname HTTPS and owner-client checks; iOS trust installation, BLE pairing/challenge routing, dual-phone fairness and gesture timing remain device checks.

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

## First configuration

1. Explicitly request `{"op":"setup-info"}` through the USB/UART serial interface. Ordinary boot/status logs contain no ownership secret. Keep the returned owner and AP credentials local.
2. Either join that one-client WPA2 setup AP, open `http://192.168.4.1`, and supply the owner code, Wi-Fi, permitted HTTPS Harness origin and current phone time; or send the physical-USB `setup-config` command below. The board joins the 2.4 GHz network itself; the computer need not change Wi-Fi.
3. The board generates its own RSA-2048 CA and DNS-SAN server certificate. The CA is long-lived; the server certificate is valid for 365 days from the authenticated configuration clock, backdated one day. No shared private key ships in the binary.
4. Download the `.mobileconfig` from the protected AP or use `setup-profile` to obtain its public contents over USB. Install it on iOS and **manually enable full certificate trust**. Compare the CA SHA-256 fingerprint from the protected setup channel. The application never bypasses Safari certificate errors or falls back to HTTP control.
5. Finish configuration with the AP page's Finish button or USB `setup-finish`. The AP and its HTTP listener stop; the unique `https://harness-<12hex>.local` HTTPS endpoint starts on port 443. The mobile device returns to its normal Wi-Fi manually.
6. In the trusted Harness origin, use the owner code once to create the phone's separate client token. This opens a two-minute BLE pairing window. Pair **iPhone Agent** in system Bluetooth, enable AssistiveTouch and leave Full Keyboard Access off.
7. Focus the Harness's verification input **before** starting a target challenge. The board types eight random digits only to that target. The server never returns those digits over HTTP. Submit the trusted keyboard observations to verify the browser-to-phone mapping, then claim a writer lease.

The certificate includes the unique `.local` DNS name and setup-AP IP. Arbitrary DHCP-IP HTTPS addresses are not a supported substitute for the DNS name; certificate validation must not be bypassed when name resolution fails. mDNS is discovery, never proof of ownership. Guest networks, AP isolation and filtered multicast require network diagnosis.

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

Use the current Unix timestamp, not the illustrative value. `setup-config` validates exact fields and lengths and internally supplies ownership proof because USB access is physical authority. Response contains `secureConfigured`, the public CA fingerprint, `trustProfileChanged` and `manualTrustRequired`; it does not echo private configuration. Wi-Fi and origin are committed as one NVS record and read back before success.

`setup-info` replies with one explicitly private line:

```text
IAH_SETUP {"format":"iah-setup/1","boardId":"...","bootId":"...","apSsid":"...","apPassword":"...","setupPassword":"...","hostname":"...","httpsUrl":"...","storageReady":true,"caReady":false,"apActive":true,"publicKeyFingerprint":null,"caProfileUrl":null}
```

Fingerprint/profile URL remain unavailable until CA material is generated and validated. `setup-profile` returns `IAH_PROFILE ` followed by `{format:"iah-profile/1",publicKeyFingerprint,mobileconfig}`; the profile contains only the public CA certificate. Never dump setup-info into chat, analytics or ordinary application logs. `setup-window` cancels input and stops TLS before reopening protected configuration. It requires no external button or GPIO.

`wifi-diagnostic` is read-only and replies `IAH_WIFI ` plus `{format:"iah-wifi-diagnostic/1",wifiConfigured,wifiConnected,wifiStatus,wifiMode,configuredSsidBytes,configuredPasswordBytes,attemptedSsidMatchesStored,lastDisconnectReason,disconnectCount,connectionCount,gotIpCount,lastEvent,lastEventAtMs,txPowerQuarterDbm,savedTxPowerQuarterDbm,freeHeap,httpsReady}`. Connected boards also include RSSI and local IP. These counters begin at boot. Lengths describe the saved credentials without printing them. `attemptedSsidMatchesStored` compares the current Arduino `WiFi.SSID()` getter with the saved SSID; while disconnected that getter can return an empty string. A false value therefore does not prove that the connection attempt used a different SSID. A disconnect reason is evidence, not a diagnosis. `wifiStatus` and disconnect reason are the Arduino/ESP-IDF numeric values.

`wifi-power` accepts exactly `op,dBm` with 8.5, 11, 13, 15, 17 or 19.5 dBm. It applies and persists the chosen maximum transmit-power setting and reports the actual quarter-dBm driver value. No universal reduced-power default is imposed. `wifi-reconnect` disconnects and starts a fresh connection using the existing NVS network and saved power setting; CA and ownership credentials are unchanged. Radio mutations require no running segment and no HTTPS service. They never claim that association succeeded; inspect later diagnostic events and status. They are USB-only and create no HTTP control endpoint.

## HTTPS authorization and execution

The default permitted browser origin is exactly `https://igent.cc`; self-hosters configure their own HTTPS origin. CORS never uses `*`. Public identity/clock/capabilities contain no setup password, token, Wi-Fi password or BLE nonce. All ordinary client APIs require TLS, exact Origin and an independent bearer token. NVS stores token hashes, not raw bearer tokens.

The full REST contract and timing diagrams are in [secure LAN implementation](../../docs/architecture/secure-lan.md). Main invariants:

- Stable resolved bonded identity maps to a random target ID; private over-the-air addresses are not persistent identity.
- Every notification specifies the target connection handle. Per-target input state, lease and receipts remain independent.
- One writer lease per target; same client with a different run/lease ID cannot steal an active lease. Renew requires the same unexpired ID. Cancel/expiry fences old IDs within the boot.
- A segment is schema-checked and canonical SHA-256 checked before admission. Initial network limit is 128 reports, 5 seconds total and 3 seconds held; the board Core stores the same 128-event maximum (portable host tests also exercise 512). Segment JSON is limited to 8192 UTF-8 bytes before parsing; capabilities advertise this independent byte limit.
- Cancellation, disconnect, expiry, transport failure and excessive scheduler lateness stop dependent input and attempt releases. `hid_submitted` is not evidence of a visible phone outcome.
- Screenshots and model calls stay in Web. Capture barriers split released segments. The board never receives screenshots, sessions or LLM keys.

NVS PKI updates use a persistent invalid/commit marker, readback, leaf/private-key matching, CA signature validation and certificate-expiry consistency. A power interruption cannot make mixed credentials count as TLS-ready. Failed token persistence leaves the previous RAM token active. Certificates/credentials use the board's own NVS namespace; hardware NVS encryption/secure boot is not enabled by this sketch.

## Concurrency and limits

NimBLE callbacks publish bounded peer snapshots; they never wait on Core's mutex. The TLS task receives, parses and hashes without that mutex. Tick/admission/results and the short verification-key sequence share one mutex; response network writes release it first. TLS runs at loop priority, and late HID reports fail rather than pretending their timing was met.

The first version advertises **one simultaneous TLS session**, not simultaneous network throughput for every client. Completed REST and OPTIONS responses explicitly close their socket, with LRU and bounded network waits; one phone cannot keep a socket forever. Multiple authorized clients are serviced sequentially, while the Core can schedule two different targets independently. Actual two-phone throughput, free heap, BLE/Wi-Fi coexistence and timing remain physical acceptance tests. Capability responses expose current/minimum heap for those tests.

## C3 memory budget

The stock SDK uses 16 KB TLS records. A physical C3 test of the initial build reached Wi-Fi association with 8.5 dBm and then failed `mbedtls_ssl_setup` with `-0x7F00` (allocation failure); starting the HTTPS listener alone did not prove a working TLS handshake. The resource-limited build addresses that measured failure. `build_opt.h` forces `ResourceLimits.h` into every C/C++ unit after SDK defaults so the bundled NimBLE host actually compiles for two connections/two bonds, peripheral only, ATT MTU 23, and MSYS pools of 8/8 on C3/S3/C6; classic ESP32 preserves its SDK-disabled second pool (8/0). HID reports fit that MTU; the report descriptor uses ordinary ATT long reads. These choices keep two-phone capability but their throughput and connection behavior still require physical testing. No precompiled SDK binary is patched.

The board Core stores 128 events per target instead of 512; advertised limits match. `maxRequestBytes:8192` is enforced before JSON parsing with HTTP 413, separately from `maxEvents:128`; callers must shorten or sparsify a gesture, or split a batch into complete released gestures. JSON trees, canonical hashes and TLS still need heap during requests, so a full 128-event body is never promised regardless of serialization size. Capabilities advertise `reportIntervalMs:40` and `pointerSettleMs:20`, keeping a three-second ordinary gesture near 75 reports. A held gesture is never split across network submissions. Diagnostic fields expose effective host macros, largest free block and loop stack watermark to guide measured adjustments.

## Host verification of canonical hashing

`tests/firmware/run.sh` exercises the state machine at the portable 512-event bound and the 256/128-event bounds, plus authorization. `tests/firmware/run_canonical.sh /path/to/ArduinoJson/src` tests the actual fixed-memory canonical writer with pinned ArduinoJson 7.4.3. The writer uses a fixed 12-key pointer array and feeds SHA-256 incrementally; it does not build an event-array-sized or full-request-sized canonical string. Golden output, input-order independence, refusal on writer failure, validated-key bounds and a 256-event streaming case are checked. The original JSON tree still occupies heap, so byte limits and real request-memory acceptance remain necessary.

The board's current 128-event override is local to `main.cpp`; `ResourceLimits.h` retains the independent global NimBLE options so a Core change does not alter host-library settings. The replay filter is 7168 bytes in internal RTC RAM rather than ordinary heap. Core explicitly clears it on each new boot before admission, and the new boot ID rejects earlier-boot segments. It retains 16-probe fail-closed behavior: saturation can reject a new ID, so this is not an unlimited replay ledger. Host tests cover retained-memory clearing, cache-evicted replay rejection and stale-boot rejection. No RTC GPIO or external pin is used.

The normal loop reserves 8 KB after a measured 16 KB build showed 12,448 bytes unused at its peak. PKI provision uses a separate temporary 16 KB task only during protected setup, preserving the former RSA-generation stack budget. HTTPD keeps its 12 KB stack. These changes follow a resource build with 43,600 bytes free/34,804 contiguous that still failed SSL setup; actual handshake acceptance remains separate.

Repeated finish is idempotent, and reopening setup discards every earlier finish timer. During authenticated reconfiguration, certificate reuse checks both CA and leaf validity against the supplied current time. A future/expired leaf is reissued. If the CA itself has a conflicting validity interval, its certificate and leaf are reissued with the existing key; the CA DER fingerprint changes. The configure response exposes `trustProfileChanged:true`, the new `publicKeyFingerprint` and `manualTrustRequired:true`. Download and reinstall the new profile and enable full trust again before updating the browser's expected fingerprint. Do not accept the changed fingerprint silently. A failed reissue remains a failed configuration.

### Observed C3 transport acceptance

Root re-flashed the final 13-source C3 build without erasing NVS and passed six production DeviceClient checks over actual CA+hostname-verified HTTPS, including owner enrollment and refusal of unverified-phone control. The final build reported 58,124 bytes free / 55,284 largest block before TLS; the final clock round trip was 1024 ms with 512 ms uncertainty, so exact screenshot/input synchronization is not claimed. See the [final client report](../../docs/research/device-client-live-verification.json) for exact source/application hashes and the [earlier TLS report](../../docs/research/device-tls-verification.json) for historical measurements. No HID challenge, lease, action or phone interaction was used; iOS trust, real gestures, reconnects and multi-phone acceptance remain unverified.

C3/S3/C6 use MSYS pools 8/8. The classic ESP32 SDK omits the second pool size, so that target preserves its disabled second pool (8/0) rather than enabling an undefined allocation; its physical two-phone throughput remains unverified. Effective values are available in USB diagnostics.
