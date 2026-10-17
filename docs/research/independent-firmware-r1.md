# Independent firmware / Web protocol review — R1

Date: 2026-10-18. Scope: fresh read-only review of the product firmware and its Web wire integration. This reviewer did not implement the firmware. No Arduino build, flash, serial, BLE, browser, phone, cloud, deployment, or commit operation was performed. The separate build owner controls four-profile compilation; intermediate binaries/manifests were not treated as failures.

## Findings requiring implementation-owner action

### R1-F1 — P2: a previous finish deadline closes a newly opened setup window

Source snapshot: `src/SecureService.h` SHA-256 `7b22ca1d75caa15fbbb047047148a7a1a82289fea5b2b8befa21db48a47144f5`.

`finishSetup()` (line 187) accepts a configured device even when no AP is active and assigns `finishAt_ = now() + 2000`. `loop()` (line 213) consumes/clears that deadline only while `apActive_` is true. `openSetup()` (lines 199–205) does not reset it.

Minimal reachable sequence, described without executing hardware commands:

1. A configured device is serving HTTPS and has no setup AP.
2. USB `setup-finish` succeeds and records a deadline; wait more than two seconds.
3. USB `setup-window` opens the protected AP.
4. The next `SecureService::loop()` sees the old elapsed deadline and immediately stops this newly opened AP.

Reopening setup during the normal two-second finish grace period also inherits the old window's countdown. The result is an unavailable or prematurely disappearing recovery/configuration UI despite an explicit request to open it. Clear the pending deadline when opening a fresh setup window, and make finish requests state-aware/idempotent. A regression should cover finish with no active AP and reopening during a pending finish.

### R1-F2 — P2: correcting a future setup clock still acknowledges a future-dated certificate

Source snapshot: `src/Pki.h` SHA-256 `b0cf009cb1cc44bb5623735a4b383a17aed2765e8bd3f7a9c183192eeb34b3e0`.

`load()` intentionally tolerates `MBEDTLS_X509_BADCERT_EXPIRED` and `MBEDTLS_X509_BADCERT_FUTURE` (line 26), which accommodates boot without a trusted RTC. However, `provision()` (line 50) uses that same permissive load as its reuse test and checks only `expiresAt > now + 7 days`. At this point `configure()` has already accepted a supplied Unix time and called `settimeofday()` (`SecureService.h` lines 165–175).

Minimal reachable sequence, with both input times within the supported 2024–2100 range:

1. First configure a clean device with time `N + 3 days`.
2. Its CA and leaf are generated with `notBefore = N + 2 days`, because certificate generation backdates only one day (`Pki.h` line 37).
3. Correct setup time to `N` and configure again.
4. `load()` accepts the future validity flags and the expiry-only fast path returns success. The existing future CA/leaf are retained; configuration reports success.
5. A browser with correct time rejects the certificate until the future validity date arrives.

Known-time provisioning must check the leaf and CA validity interval before acknowledging reuse. Since the CA may itself be future-dated, merely resigning the leaf is insufficient; repair the CA using the retained key or report an explicit recoverable setup failure requiring refreshed trust. The same interval check also addresses an expired CA retained during later leaf renewal. A regression should provision under a future clock, correct it, and inspect both resulting certificate validity intervals and the reported outcome.

Both findings were sent to the root coordinator for implementation-owner fixes. No product source was modified by this reviewer.

## Covered paths with no additional confirmed finding

- **RTC and boot isolation:** `main.cpp` chooses Core128 / 7168-byte external RTC storage; the external Core constructor clears retained bytes before admission. Boot identity is checked before duplicate/result handling. Cache eviction retains a boot-local fail-closed tombstone.
- **Client/target/lease isolation:** authenticated request target/client cross-checks precede admission; immutable Admission binding and Core binding agree. Same-client different-run lease replacement is refused, same lease renewal is allowed, expired/cancelled IDs are fenced, results are client-scoped and route target-checked. Release/cancel checks the exact active lease before clearing it.
- **Directed BLE:** each submit/release includes the specific connection handle. The actual pinned NimBLE 2.5.1 `sendValue()` implementation takes the individual-handle branch. Peer snapshots compare resolved identity plus address type; disconnect or identity mismatch invalidates Core state before new input. Subscription loss, notify failure and reconnection release gates fail closed.
- **Wire/canonical agreement:** validated schemas admit bounded ASCII IDs, fixed ASCII field names, integer values and fixed event kinds. ArduinoJson recursive sorted-key streaming agrees with Web recursive sorting for this schema; array order is retained and the payloadHash field is omitted. Full UTF-8 wire byte limits are distinct from event limits, and Web rechecks bytes and fresh capability limits around asynchronous hashing before dispatch.
- **Lock ordering:** TLS read/parse/hash and socket writes occur outside the Core mutex. NimBLE callbacks take only the peer critical section and atomic pairing gate, never the Core mutex. Main-loop peer reconciliation takes Core before the short peer snapshot; BLE callbacks do not acquire the reverse order. `openSetup()` releases Core before waiting for `httpd_ssl_stop()`.
- **PKI worker lifetime:** setup rejects active Core input/TLS; the loop waits for the worker semaphore before the stack-local job disappears, and the worker copies its semaphore before signalling completion. NVS work does not overlap a live TLS request handler in this path. The temporary 16 KB worker is separate from the 8 KB main loop and 12 KB HTTPD stacks.
- **NVS commit structure:** network/origin are one read-back value; grant candidates persist before RAM activation; PKI invalid/valid marker, key matching, signature checking and expiry-field consistency reject mixed records. Persistence/acknowledgement uncertainty is not treated as physical completion.
- **TLS capacity:** HTTPD SSL defaults in the installed pinned SDK explicitly enable LRU purge (the plain HTTP default differs). REST and OPTIONS responses request close and return handler failure after a successful send, freeing the single slot. Receive/send timeouts are bounded. No claim of measured two-phone fairness follows from these static checks.
- **Input termination:** late scheduling, TTL, lease expiry, disconnect and transport errors terminate the segment and submit target-specific releases where a link exists. Failed releases leave readiness unknown; a completed HID submission receipt never establishes a visible iPhone action.

## Verification and limits

This review reran `sh tests/firmware/run.sh` and `sh tests/firmware/run_canonical.sh`: all 58 Core/Admission/RTC scenarios passed (Core 16 each at 512, 256 and product 128 events; Admission 7; external RTC 3), followed by all 6 real pinned-ArduinoJson canonical streaming scenarios. The combined process exited 0. No new mirror-of-implementation tests were added; the two newly found setup/PKI cases need tests at the implementation boundary when fixed.

Static source review does not establish C3 heap headroom, stack high-water values, successful TLS handshake, real NVS interruption recovery, iOS CA trust, RPA reconnect behavior, or two-phone scheduling throughput. Those remain root-owned hardware gates and are not additional defects merely because this read-only review did not measure them. Existing memory was used only to preserve the distinction between submitted HID reports and observed phone behavior.

Reviewed hashes: `main.cpp` `8d7cae63b64570d1649a9db851a24e0a560222204adca3243283438c505af06a`; `Core.h` `a1e6864487933ed3cee5a6a8c50bc4aff51b3d6f7af69d282a59773fdc468352`; `Canonical.h` `1bf42934d802b3eab3921723c7f1a1af94e89527d01ef2b6355cbcd6928048ff`; `Wire.h` `92d87161708ad530a90d6dbb576ff5b2e83dc7d65ea19298e31feaa8a248a5d4`; Web `device.js` `40d9a5a56c3a1b2bc60bfe73ad9fd8224f76a6c2cbc940d27d49b44a5dd698ed`; Web `plan.js` `143f2396614c70d045da196f1dcd309cee656837971f8c02c76b12b53a3a1048`.
