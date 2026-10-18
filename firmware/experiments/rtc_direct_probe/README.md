# C3 WebRTC Direct v2 data-only probe

This isolated experiment is separate from the production sketch. Reproducible public source is in `firmware/experiments/rtc_direct_probe`; generated key material and build artifacts stay under ignored `build/rtc-c3`. Its build does not modify the production release binaries or installed SDK and never opens a serial port.

- libpeer source: `sepfy/libpeer` commit `5b849de378545c31d34759a145413846953e1366`, MIT (license copied beside this document).
- Protocol reference: `libp2p/specs/webrtc/webrtc-direct.md`, Direct v2, retrieved 2026-10-19 into `build/reference/webrtc-direct.md`; see https://github.com/libp2p/specs/blob/master/webrtc/webrtc-direct.md.
- Reused upstream code: `sctp.c`, `sctp.h`, `utils.h`. `config.h` forces the small built-in SCTP implementation. A data-only `dtls_srtp.h` adapter retains the upstream function names but includes no SRTP implementation.
- SDK: Arduino ESP32 3.3.11; existing SDK mbedTLS DTLS 1.2 server, ECDSA certificate, UDP port 18948, IPv4, one nominated peer.
- No media, SRTP, TURN, public signaling, BLE, HID, external GPIO, core-1 tasks or PSRAM allocation.
- Reads saved Wi-Fi and RF transmit power from `iah-product` NVS in read-only mode; does not change its configuration. Wi-Fi initialization disables SDK credential persistence. No Wi-Fi passwords are compiled into the source or printed.
- Shares the Mac test peer certificate at `build/rtc-direct/certificate.pem` and `private-key.pem`; generated `config.local.h` remains ignored, mode 600. Fingerprint: `6D:26:26:CC:2C:8A:1B:D7:2F:3E:D5:2D:E8:A0:38:25:74:C1:B6:98:EB:E8:1D:E4:6D:92:37:1A:53:2D:5D:55`.

## Wire behavior

The server accepts valid STUN Binding requests whose USERNAME is `libp2p+webrtc+v2/<client_pwd>:<client_ufrag>`. It checks the ICE character/length rules and HMAC-SHA1 MESSAGE-INTEGRITY using the server fragment as its password, then replies with XOR-MAPPED-ADDRESS, MESSAGE-INTEGRITY and FINGERPRINT. A valid USE-CANDIDATE request selects the peer tuple. It never sends ICE checks itself. DTLS runs as the server and the browser verifies the fixed certificate fingerprint. As in Direct v2, this probe does not authenticate the browser certificate or implement libp2p Noise.

After DTLS, the probe accepts the built-in SCTP handshake and DCEP OPEN/ACK, or a negotiated channel, and accepts only nonempty, unfragmented messages up to 512 bytes. An input object must contain exactly `probe:true` and a `nonce` of 1–128 ASCII letters, digits, underscore or hyphen; the same stream receives `{probe:true,nonce,phoneInputSent:false}` as text. The echo is queued until after the upstream SCTP callback returns, avoiding corruption of the upstream shared output buffer. Large/fragmented input, oversized datagrams and unsupported client INIT_ACK paths are rejected before the upstream parser.

## Limits — not a production transport

The upstream built-in SCTP implementation is incomplete: it has no usable retransmission/congestion control, no correct out-of-order/gap tracking or fragment reassembly, fixed association values/cookie, and incomplete stream lifecycle. This probe adds bounded input checks, not a replacement SCTP stack. It does not guarantee reliable delivery, full reconnection, multiple simultaneous clients, binary payload preservation, or any phone action. A new valid nominated peer/ICE credential can replace the previous one at most once per second. Only one bounded replacement is queued; TLS/SCTP reset occurs in the outer loop, never inside the TLS receive callback. DTLS close/failure clears the peer so another attempt can start. This minimal reset is for repeated echo experiments and is not a production reconnection state machine. The root task subsequently flashed the exact application below to the authorized C3 and observed three matching echoes in Chrome and three in macOS Safari 27.0.1. At the Safari handshake the board reported 158,992 free heap bytes and a 141,848-byte minimum; echo processing reported 160,904 free bytes. These measurements are for the data-only prototype, without BLE. iPhone Safari 27.0.1 subsequently completed five hidden-page echo rounds directly to C3. The run also contained a 4.526-second ICE disconnect/recovery and a 5,993 ms reply, so it is transport feasibility evidence, not a reliable production-control acceptance. Recording callbacks continued through the network interruption; the diagnostic stopped capture explicitly after its fifth round. See the [raw phone result](../../../docs/research/rtc-direct-c3-iphone-20261019.json).

The iPhone Safari-to-Mac reference path passed foreground and five hidden-page echo rounds before the C3 was flashed. The Mac reference service is now stopped; the hosted diagnostic targets the C3 directly. See [transport trial evidence](../../../docs/research/transport-trials-20261019.json).

## Reproduce without touching a device

Requires the existing Arduino ESP32 3.3.11 core and ArduinoJson 7.4.3, Python 3, and OpenSSL. No library installer or firmware uploader runs. The current compile wrapper is for macOS (the same ctags workaround as the project builder).

Generate a test-only key/certificate under ignored build output, or reuse the Mac peer pair so the browser fingerprint matches:

```sh
mkdir -p build/rtc-direct
# Only run these two commands when creating a NEW test identity.
openssl ecparam -name prime256v1 -genkey -noout -out build/rtc-direct/private-key.pem
openssl req -new -x509 -key build/rtc-direct/private-key.pem -out build/rtc-direct/certificate.pem -days 3650 -subj /CN=iah-rtc-probe
chmod 600 build/rtc-direct/private-key.pem build/rtc-direct/certificate.pem
python3 firmware/experiments/rtc_direct_probe/prepare.py --cert build/rtc-direct/certificate.pem --key build/rtc-direct/private-key.pem
sh firmware/experiments/rtc_direct_probe/compile.sh
```

`prepare.py` checks the public keys match, stages the eight source files, generates mode-600 `config.local.h`, and records public source hashes and certificate fingerprint. Never use or publish this experiment's shared test key as a product identity. It is only a transport feasibility probe.

The isolated host test uses the same ArduinoJson reply function as the firmware. Run `sh firmware/experiments/rtc_direct_probe/tests/run.sh`; it checks the browser reply contract and rejected nonce/input boundaries, not radio or DTLS behavior.

## Verified compile, 2026-10-19

The final data-only prototype compiled with Arduino ESP32 3.3.11 and ArduinoJson 7.4.3. Linker program use is **1,048,887 bytes** of 3,145,728; static RAM is **42,112 bytes**, leaving 285,568 before dynamic runtime allocation. This is not a measured free-heap result.

The generated application is **1,049,040 bytes**, SHA-256 `ec96708d9592eb6d9b0f945cfea008b2876f3bb129b2368eb942efe3cc72e770`. The eight-source manifest SHA-256 is `a2f3ef536a8df8c28b5dbca9a2a58911755f0032ffa20a19f4827c6c173b9b1e`. The certificate is excluded from the public source hash and identified by its fingerprint above. Full local provenance/part offsets are in ignored `build/rtc-c3/compile-result.json`; the experimental application is `build/rtc-c3/firmware/esp32c3/application.bin`.

The compiled bootloader, partition table and initial OTA metadata match the current project's C3 production artifacts byte for byte. On the already-configured development C3 with that same layout, replacing only the application at `0x10000` is sufficient and does not overwrite its NVS region. This does not establish compatibility with a different board/partition layout. No upload is part of the build scripts.

## Reference-client compatibility

The Pion high-level WebRTC client timed out against this C3 build while Chrome and macOS Safari succeeded. Source inspection identifies Pion's unconditional SRTP-profile negotiation as a likely difference; this candidate is not claimed as confirmed without its diagnostic alert. The C3 SDK does contain the SRTP handshake-extension API even though this pure-data probe does not enable it. No media implementation or global SDK change has been made.
