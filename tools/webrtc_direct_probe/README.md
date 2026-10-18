# WebRTC Direct v2 local echo probe

This is a desktop reference endpoint for testing Safari's **direct UDP transport**, before porting that transport to the ESP32-C3. It is not a relay and never controls a phone. It uses Pion's complete DTLS/SCTP implementation, an ICE-lite listener and a negotiated, ordered data channel with ID 0. It does not implement the complete libp2p protocol or Noise authentication.

There is no HTTP signaling service, external STUN server, TURN server or internet data path. The first local STUN Binding request supplies the Direct v2 credentials. The reference endpoint accepts loopback and private source addresses only, allows at most two peers, expires application-idle peers after 60 seconds, and rejects application messages above 512 bytes. Logs contain state and byte counts, never SDP, ICE passwords or message contents.

## Build and run

Use a Go toolchain, with caches under ignored `build/rtc-direct` if desired:

```sh
cd tools/webrtc_direct_probe
go test -buildvcs=false ./...
go build -buildvcs=false -o ../../build/rtc-direct/probe .
cd ../..
build/rtc-direct/probe -state build/rtc-direct -host 192.168.0.107 -port 18948 -self-test
build/rtc-direct/probe -state build/rtc-direct -host 192.168.0.107 -port 18948
```

The local self-test creates a normal Pion client offer, leaves its ICE credentials unchanged, synthesizes the server answer and verifies an echo through the listening UDP socket. It does not prove Safari or C3 interoperability.

The endpoint creates a fixed test ECDSA certificate and matching private key only when neither exists. They stay in the ignored state directory, mode 600. `endpoint.json` contains only public parameters and can be published alongside the HTTPS browser diagnostic. Never publish `private-key.pem`. Shared test key material identifies a prototype endpoint, not an authorized phone or session.

To test a different implementation with the reference client:

```sh
build/rtc-direct/probe -client-config build/rtc-direct/other-endpoint.json
```

An optional `-client-diagnostic build/rtc-direct/client-dtls.log` records only
DTLS handshake stages, alerts and the transport failure reason in a mode-600,
32-KiB-bounded local file. ICE/connection states are also reported. It does not
enable packet dumps, SDP logging, ICE credential logging or TLS key logging.

## Browser contract

Public configuration: `version: 1`, `ip`, `port`, `fingerprint` (SHA-256 colon hex), `transport: "webrtc-direct-v2"`, `maxMessageBytes: 512`. `host` and `fingerprintSHA256` repeat the corresponding values for diagnostic compatibility.

Create `RTCDataChannel` with `{negotiated: true, ordered: true, id: 0}`. Create/set the local offer without modifying it. Read its `a=ice-pwd`, then create the synthetic remote answer with:

- `a=ice-lite`
- remote `a=ice-ufrag` and `a=ice-pwd` both equal to `libp2p+webrtc+v2/` plus that local password
- `a=setup:passive`
- SHA-256 fingerprint from the public configuration
- host UDP candidate using the advertised IP and port
- SCTP port 5000; SDP `a=max-message-size:16384` (application limit remains 512 bytes)

Send UTF-8 JSON `{"probe":true,"nonce":"unique-test-id"}`. The reply includes `{"probe":true,"nonce":"unique-test-id","phoneInputSent":false,"transport":"udp"}` and `serverPeerAddress` from Pion's selected remote ICE candidate. That server-side address is diagnostic cross-check evidence when Safari omits candidate-pair statistics. Nonces use 1–80 ASCII letters, digits, `.`, `_`, `:` or `-`. Logs include the initial STUN source and up to eight echo records per peer, including the selected remote address; they do not record request contents or ICE credentials.

Reference design: [libp2p WebRTC Direct v2](https://github.com/libp2p/specs/blob/master/webrtc/webrtc-direct.md), [Pion WebRTC](https://github.com/pion/webrtc). The server deliberately does not verify the browser's DTLS certificate fingerprint because it was not exchanged; this unauthenticated echo diagnostic is not the production phone-control authorization layer.
