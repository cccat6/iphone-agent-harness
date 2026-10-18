# R6 independent review: RTC runtime clocks

Date: 2026-10-19. Read-only production-source review, host execution and linker-map inspection. This reviewer did not access a serial port, browser, phone or deployment, and changed no production source.

No new blocking issue was found in the reviewed scope. The runtime correction addresses the reported first-RPC disconnect; actual production-board reconnection remains a separate acceptance step.

## Runtime ordering

- `RtcBridge::loop()` formerly retained a timestamp captured before DTLS/STUN and application callbacks. Those callbacks can update activity or RPC start times using a later `millis()`. An unsigned subtraction against the older loop timestamp can consequently resemble a very large elapsed interval.
- The reviewed implementation obtains fresh timestamps for SCTP/RPC ticks and the final peer-idle check. `Rpc::tick()` additionally uses a signed modular difference for its 30-second timeout, so a slightly older caller timestamp does not cause an immediate failure.
- Reviewed handshake start, DTLS-ready start, STUN activity updates, peer replacement, SCTP cookie expiry, retransmission deadlines, heartbeat and shutdown deadlines. No remaining callback path was found that moves the compared start timestamp forward and then uses an older timestamp to expire that same interval. SCTP deadline checks already use signed modular comparisons. Its elapsed heartbeat checks receive the fresh post-callback clock from the bridge.
- Peer replacement applies after returning from the DTLS call; the loop then returns. New handshake timestamps therefore are not compared against the previous loop timestamp. Clear/reset also clears the RPC state and reinitializes SCTP before the next peer. Existing active-writer replacement checks remain in place.

## Executed verification

- `RTC_SANITIZE=1 sh tests/firmware/rtc/run.sh`: passed under AddressSanitizer and UndefinedBehaviorSanitizer. This includes the newly added real SCTP DATA callback → RPC dispatch → response regression at ordinary time and across `uint32_t` clock rollover. Incomplete collection still succeeds at exactly 30,000 ms and expires at 30,001 ms; a stale timestamp does not expire it. Existing loss, reorder, duplicate, CRC, cookie, heartbeat, close and response-tail ordering cases also passed.
- Clipboard/controller/UI suites: **43/43 passed**. Rechecked `mountClipboardPanel` arming immediately after staging, shared producer-promise reuse from `start()`, and native Shortcut delivery beginning the streaming phase. The browser remains the complete-text owner; this is not physical Shortcut execution evidence.
- TLS link-guard tests: **5/5 passed**, including accepting the project's `RtcTls/objs.a` archive and rejecting another directory's archive or precompiled SDK TLS members.
- Re-ran the guard on the actual production C3 build directory `build/bridge-optional-cache/esp32c3-build`: all 20 TLS compilation units and eight live symbols passed with the uniform 2,048-byte record profile, with no selected precompiled SDK TLS member. The observed linker-map SHA-256 was `cf9bfe648a8e2b76a42d2c6129b1f09c60c0f581da4467605e8f4cf124780631`. This check establishes TLS linkage for that map, not that this build contains the latest runtime patch or has been flashed.

Evidence logs: `build/rtc-runtime-r6-protocol.log`, `build/rtc-runtime-r6-clipboard.log`, `build/rtc-runtime-r6-tls-link.json`.

## Reviewed hashes

| File | SHA-256 |
| --- | --- |
| `firmware/IPhoneAutomationHarness/src/RtcBridge.h` | `3aa329e90e0cb347250807331a5a8dbb1e4d15089cd2f268b5bd19368071c8b8` |
| `firmware/IPhoneAutomationHarness/src/RtcRpc.h` | `956ac12af461584748336c929aa630d2f49fc138ce3a9e2ac7a60b4d3e1366f2` |
| `firmware/IPhoneAutomationHarness/src/RtcSctp.h` | `088411f13c2b950803941304d911e1a52c832def3d989fbe0faffd0cb2b72927` |
| `tests/firmware/rtc/protocol_test.cpp` | `8c09ce34cc8829972d3aaad95f20a08124580c0ea737e84c0282111842b9394b` |
| `tools/verify_rtc_tls_link.py` | `ccda6913da963200ea367112c350e05bb733761324d50804c0c808d8a5da4b8b` |

The final production image, physical first RPC and reconnect, BLE coexistence, iPhone background duration, native Shortcut permissions and complete long-text copy/paste remain distinct physical acceptance steps.
