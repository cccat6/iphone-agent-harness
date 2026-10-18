# Direct LAN transport v0.3

Status: implemented source, host-tested admission/state invariants; compiled/hardware acceptance reported separately in build artifacts. `physicalValidation:false` remains deliberate. No model, screenshot or session data is stored on ESP32.

## Current connection and ownership

```mermaid
sequenceDiagram
  participant U as User
  participant W as Harness HTTPS tab
  participant H as Device HTTP tab
  participant E as ESP32 on home Wi-Fi
  participant I as iPhone Bluetooth input
  U->>E: Configure home Wi-Fi once
  U->>W: Open setup return link and tap Connect
  W->>H: Open a unique local connection window
  U->>W: Return to Harness, keep device tab open
  W->>H: Identity request via browser postMessage
  H->>E: Same-origin HTTP GET
  E-->>H: Device identity
  H-->>W: Identity response, helper hidden
  W->>H: Pair with device code
  H->>E: HTTP pair request
  E-->>W: Per-client token through local window
  W->>E: Start selected-phone input test through local window
  E->>I: Eight digits via Bluetooth HID
  I->>W: Trusted keyboard events
  W->>E: Confirm received digits; claim writer lease
```

The device's Wi-Fi password and pairing code are random per board. The Wi-Fi setup page requires possession of the device Wi-Fi connection and fills the owner code internally. The current firmware waits for a new IP event on the submitted SSID before saving Wi-Fi settings. Failed joins keep setup Wi-Fi open and preserve the previous saved network; `/finish` rejects until actually connected. A failed saved-network boot opens setup after 30 seconds. The firmware starts HTTP port 80 after setup, advertises that port through mDNS, serves `/harness-link`, and does not generate a CA for normal onboarding. No cloud service forwards control data.

The local connection page checks the configured Harness origin, exact opener, nonce and request ID. Only fixed API routes and headers can pass through. Its same-origin requests carry `X-Harness-Window: 1`; the server accepts that path only with its own Host and same-origin/no-Origin requests, then retains the normal client token, target proof, writer lease, replay and timing checks. The header alone is never an input credential.

For HTTP, `publicKeyFingerprint` is a stable identity label derived from the random owner code, not a certificate or encryption proof. Older HTTPS/CA behavior is historical compatibility, not a user setup requirement. Direct HTTP from the HTTPS page failed on the tested Safari 27.0.1; a local-window GET/POST experiment passed. Five read-only local-window HTTP requests, including both-tabs-hidden requests during screen sharing, subsequently passed over about 21 seconds. Physical ESP32/HID acceptance remains separate.

## REST contract

All paths below use HTTP port 80 in the current firmware. Except public GET identity/clock/capabilities, requests require the configured Harness origin (or the validated same-origin local-window route) and `Authorization: Bearer <token>`. Tokens are random 256-bit values, returned once by pair; only their SHA-256 hashes are persisted. Default origin is `https://igent.cc`.

| Method / path | Request | Successful response |
|---|---|---|
| GET `/v1/identity` | none | boardId, bootId, hostname, protocolVersion, publicKeyFingerprint (stable HTTP identity label), firmwareVersion, tls, requiresManualTrust |
| GET `/v1/clock` | none | boardId, bootId, deviceTimeMs |
| GET `/v1/capabilities` | none | executionEnabled, operations, maxEvents=128, maxRequestBytes=8192, reportIntervalMs=40, pointerSettleMs=20, maxSegmentMs=5000, maxHoldMs=3000, maxLeaseMs=15000, maxTargets=2, maxClients=8, maxConcurrentRequests=2, physicalValidation=false, heap metrics |
| POST `/v1/pair` | `{clientId,setupPassword}` | 200 `{clientId,token,boardId,bootId,hostname,publicKeyFingerprint}` |
| GET `/v1/binding` | none | boardId, bootId, clientId, targetId or null, bindingVerified, targets[] with connected/encrypted/hidSubscribed/inputState/running |
| POST `/v1/targets/:id/challenge/start` | `{}` | 202 `{challengeId,targetId,length:8,expiresInMs:30000,expiresAtDeviceMs,status:"typing",boardId,bootId}` |
| POST `/v1/targets/:id/challenge/confirm` | `{challengeId,observedNonce}` | 200 `{boardId,bootId,clientId,targetId,bindingVerified:true}` |
| POST `/v1/targets/:id/leases/claim` | `{leaseId,ttlMs}` | 200 `{boardId,bootId,targetId,clientId,leaseId,expiresAtDeviceMs,inputState:"released"}` |
| POST `/v1/targets/:id/leases/renew` | same exact fields | same fields; inputState can be unknown while segment is running |
| POST `/v1/targets/:id/segments` | existing device-segment v1 wire object | 202 receipt, including running or terminal status |
| GET `/v1/targets/:id/results/:segmentId` | none | 200 receipt |
| POST `/v1/targets/:id/release` | `{leaseId,cancelPending:true,invalidateLease:true}` | 200 `{boardId,bootId,targetId,status:"released",leaseInvalidated:true,releaseSubmitted:true}` |

A receipt contains boardId/bootId/targetId/clientId/segmentId/planId/payloadHash/status/releaseSubmitted and device accepted/start/end times, submitted count and observed lateness. Successful HID submission does not assert any UI outcome. A missing receipt is 404 `result_unknown`; cached-ID conflicts/stale boot/lease conflicts are 409. The client queries the same ID and never blindly resends unknown input as a new ID.

Challenge responses never expose the secret nonce. The Web input listener must be installed and focused **before** POST start; HID digits can arrive before the HTTP response. Only normal digit usages are submitted, with directed down/up reports and a final release. A challenge is limited to three observed-nonce attempts, a 30-second expiry, and one per client per 30 seconds. Grant/client/target/challenge IDs must all match. Ordinary input remains inaccessible until proof succeeds. During initial binding, target input is held unavailable rather than interleaving another user's plan with the proof.

Claim requires idle, known released input. Renew accepts only the same authenticated client and same unexpired lease ID, including during a running segment. New runs must use a fresh random ID; cancelled/expired IDs cannot be revived in the same boot. Same-client tabs do not gain permission to replace another run's active writer. Result idempotency and retired-lease tombstones are boot-local and bounded; power loss changes bootId and requires reconciliation.

## Scheduling and socket fairness

```mermaid
flowchart LR
  HTTP[HTTP task: request receive / parse / SHA-256] --> Lock[Short Core mutex]
  BLE[NimBLE callback: fixed snapshots / atomic pairing gate] --> Loop[loop: peer reconciliation + tick]
  Loop --> Lock
  Lock --> A[Target A lease / segment / directed handle]
  Lock --> B[Target B lease / segment / directed handle]
  Lock --> Copy[Copy result metadata]
  Copy --> Unlock[Unlock before network response]
  Unlock --> Close[Complete REST response and close session]
```

The HTTP task runs at priority 1, alongside the Arduino loop. Parsing, canonical hashing and network writes do not hold the Core mutex. NimBLE callbacks never acquire it. The main loop and HTTP handler each use an 8 KB stack. Normal setup performs no RSA/CA generation.

The HTTP server accepts two socket sessions, with a two-second send/receive limit. Each REST response explicitly closes its session; request handling remains sequential. The local helper page has a separate bounded request map, not a second firmware control engine. Physical two-phone fairness still needs testing.

## Durable configuration and failures

Wi-Fi and permitted origin commit as one NVS JSON value, with readback before success. Client grants use a candidate copy: persist successfully before replacing the active RAM token/binding. Failures do not acknowledge a new credential whose token was never returned.

Normal HTTP configuration does not read or update old private-CA materials. Existing Wi-Fi and owner credentials remain in NVS. Current setup reports `manualTrustRequired:false`. The device's pairing and client-token records still use readback/commit checks before becoming active.

Cancelling, expired leases, disconnected BLE, notify failure and missed timing request releases for the same target only. Network/window scheduling delays do not turn into fabricated precise gestures; Core records a timing miss and stops. Screenshots remain Web barriers after released input, or a separate parallel sampling window during a complete gesture. ESP32 never fabricates a screenshot acknowledgment.

The API does not provide unattended discovery trust, a cloud relay, stdio MCP, shell commands, arbitrary JSON-to-HID forwarding or executable plugin loading. Device management and private Web sessions remain distinct.

## Remaining physical gates

- Fresh firmware on the physical C3, Wi-Fi onboarding and hidden-helper request round trips.
- Both Safari tabs backgrounded while screen sharing and another app is foreground.
- Actual Bluetooth pairing, eight-digit input proof, gestures, cancellation and screenshot barriers.
- Two phones using one board without cross-target input or request starvation.

The previous 0.2 HTTPS firmware's CA-verified tests remain historical evidence in [the earlier device report](../research/device-client-live-verification.json). They do not validate the current HTTP-window firmware.

### USB radio diagnostics

Read-only `wifi-diagnostic` reports status, disconnect reason, event counters, configured credential byte lengths and SSID equality only; it never prints credentials. The SSID equality field uses `WiFi.SSID()` and may be false simply because the disconnected driver reports an empty SSID; it does not establish which credentials were actually transmitted. Optional `wifi-power` and `wifi-reconnect` are physical USB maintenance operations and are refused while the HTTP service or a segment is running. A saved power limit is applied at boot, and reconnect reuses the existing network. They permit a measured low-power comparison without assuming that signal strength or board type caused an authentication failure. See the firmware README for exact JSON.

The current product Core has 128 events per target. Its 7168-byte, 16-probe boot-local replay filter lives in RTC RAM and is explicitly cleared on each new Core/boot ID; it remains fail-closed and can falsely reject new IDs when saturated. Host tests include retained storage and stale-boot replay. The ordinary heap is reserved for BLE/HTTP/JSON rather than an always-resident replay bitmap.

### Setup reopening

The portable SetupDeadline state remains in use: repeated finish does not extend the deadline, already-finished requests leave no pending deadline, and reopening the setup Wi-Fi clears the previous finish deadline. HTTP setup does not issue, renew or ask users to trust certificates.

### BLE connection-generation fence

All actual HID notifications execute as bounded jobs on NimBLE's default host event queue. The same host context owns connect/disconnect/authentication/subscription updates, so it validates the Core-pinned stable identity and connection generation immediately before notification without another host callback interleaving. A numeric connection handle alone is never sufficient. No portMUX is held across notify, and host callbacks never take the Core mutex. A fixed job slot is not reused until a cancelled/abandoned job is consumed; late queued jobs never deliver their requested action; a same-identity/generation safety release may still follow. Releases retain the same identity/generation fence and can release an available report channel even if another channel unsubscribed. Core disconnect/reconnect invalidates the old generation/lease. Receipts record actual host submission time; late/expired work stops.

Pointer cleanup uses host-owned last-submitted coordinates scoped to the same peer generation. Coordinates change only after a pointer notify succeeds; enqueueing an unsubmitted move does not change them. A cancelled move releases at the previous submitted position. An already committed move releases at its committed position, including an abandoned caller; later releases cannot jump back to stale Core coordinates. Pose writes and reads use the short Peer lock, while Route bindings remain Core-thread-owned.

C3/S3/C6 use MSYS pools 8/8. The classic ESP32 SDK omits the second pool size, so that target preserves its disabled second pool (8/0) rather than enabling an undefined allocation; its physical two-phone throughput remains unverified. Effective values are available in USB diagnostics.

## Default address and optional connection code

The current default mDNS name is `igent.local`, with the connection code disabled. `/v1/identity` exposes `pairingCodeRequired`. The existing `/v1/pair` request retains a `setupPassword` field but accepts an empty string by default; when explicitly enabled, missing and incorrect codes return distinct 403 reasons. Browser tokens and phone input verification remain separate requirements.

The device serves its local management page at `/settings` and `/`. An enrolled browser uses Bearer-authenticated GET/POST `/v1/settings` to inspect or change `{hostname,pairingCodeRequired}`. Only an authenticated response exposes the generated code when enabled. A changed hostname is persisted and returned as `newURL`, then the idle bridge restarts. Active input, valid leases and connected unresolved releases prevent settings mutation; empty target slots or offline release flags do not.

Default no-code USB and AP return links omit owner credentials. `IAH_HOSTNAME` and `IAH_PAIRING_CODE_REQUIRED` provide compile-time defaults; saved local management settings override them. The optional Wi-Fi setup page keeps its internal owner field for its existing AP-only configuration protocol, without making the user enter a code.
