# HTTPS device client and task writer lifecycle

2026-10-18. `apps/web/core/device.js` implements the browser side of the Arduino protocol. This is protocol code with mock acceptance, not evidence that Safari has connected to a physical board. This work did not access the LAN, open a serial port, flash firmware or send real HID input.

## Identity before credentials

Use only the board's HTTPS origin, such as `https://iah-a.local`. URLs with HTTP, embedded credentials, query/hash or a non-root path are rejected. There is no HTTP fallback, redirect following, certificate-warning bypass or browser-side TLS override.

The user obtains the CA fingerprint and owner password from the protected provisioning channel or the explicit USB `setup-info` command. Ordinary boot/status logs must not print these secrets. The Arduino implementation owns that command and its hardware acceptance.

```js
const device = new DeviceClient({baseUrl});
await device.pinIdentity(expectedFingerprint, {signal});
await device.pair({
  clientId: stableLocalClientId,
  setupPassword: userSuppliedOwnerPassword,
  expectedFingerprint
}, {signal});
```

Before sending the owner password, `pair` requires the expected 64-hex CA fingerprint and compares it with the HTTPS identity response. mDNS hostname discovery and an unverified public identity response do not grant execution. On iOS, the user must install the CA belonging to their own board and enable full trust; network failure messages also mention local-network permission and CORS.

JavaScript cannot inspect the actual peer certificate chain or implement native SPKI pinning. The application fingerprint check supplements the browser's TLS validation and the user's physical-channel trust setup; it does not replace them or prove which installed CA the browser selected.

`pair` returns a safe status snapshot without the bearer token. `exportCredentials()` is the deliberate secret-bearing operation, intended only for the user-encrypted vault. No ordinary settings, status or error contains the token. `restoreCredentials(record)` accepts only the same origin and requires renewed identity verification before execution. The owner password is never retained. Do not log pair request bodies or vault exports.

## Input target proof

The client sends Bearer authentication and a fresh `X-Request-Id` on authenticated requests. Binding is distinct from board pairing:

1. `getBinding()` returns the authenticated client ID and target list.
2. `startChallenge(targetId)` requires a connected, encrypted, subscribed target. The HTTP result gives only the challenge ID and eight-character length, never its nonce.
3. The focused phone input receives the actual eight digits through HID. UI code must collect trusted keyboard events; it should be ready before starting the request because input can arrive before the HTTP acknowledgement.
4. `confirmChallenge(targetId,{challengeId,observedNonce})` submits only the observed digits. Binding becomes verified only on the exact board/boot/client/target response.

The client rejects wrong identities, missing readiness and a challenge start response that leaks nonce fields. A status of `typing` is not successful target proof.

Targets expose `{targetId,connected,encrypted,hidSubscribed,inputState,running}`. No display name or `bonded` field is assumed by this client.

## API used by UI and Harness

```js
DeviceClient.createURL(value) // normalized HTTPS origin
new DeviceClient({baseUrl,expectedFingerprint?,fetchImpl?})
device.identity({signal})
device.capabilities({signal})
device.clockSync(3,{signal})
device.pinIdentity(expectedFingerprint,{signal})
device.pair({clientId?,setupPassword,expectedFingerprint?},{signal})
device.exportCredentials()                    // private; encrypt before persisting
device.restoreCredentials(record)
device.clearCredentials()                    // local forget, not remote release

device.getBinding({signal})
device.targets({signal})                     // array from getBinding

device.startChallenge(targetId,{signal})
device.confirmChallenge(targetId,{challengeId,observedNonce},{signal})
device.claimLease({writerId?,leaseId?,ttlMs?},{signal})
device.renewLease({writerId?,ttlMs?},{signal})
device.getExecutionContext({orientationEpoch,writerId,allowClaim,renewLease,signal})
device.submitSegment(segment,{signal})
device.getResult(query,{signal})
device.release(binding,{signal})
device.endRun({writerId,signal})
```

Safe getters include `paired`, `clientId`, `boardId`, `bootId`, `targetId`, `leaseId`, `leaseVerified`, `identityVerified` and `bindingVerified`; `status()` is safe for display. `pinIdentity` reports `fingerprintVerified`; this is not the same as a completed client pairing or target proof.

## Short lease, long model wait

A writer lease lasts at most 15 seconds, while a model can take longer. The Task owns coordination, not the model. The trusted caller passes the current `runId` as `writerId`:

- Between plans, `allowClaim:true` may claim a bound, released, idle target or reclaim after expiration using a new random fencing lease ID.
- During an executing plan, `allowClaim:false` permits only same-ID renewal. Expiration, boot changes or a new baseline stop that plan; they never resume old segments under a replacement lease.
- Another writer's active local lease is not shared or replaced; context returns `writerBusy` with execution disabled. Board admission must also prevent another tab using the same client token from replacing an active lease with a new ID.
- Concurrent same-writer claims and renewals are serialized. Renewals preserve the lease ID; fresh claims never intentionally reuse a previous ID.
- The root Harness may run a task-owned heartbeat while waiting for the model. It must use `allowClaim:false`, stop it in finally, and treat failure as lost coordination. This timer is not a browser background-life guarantee.
- `endRun({writerId})` releases and invalidates only that writer's lease. If another run owns the lease, it does not send an HTTP release. A separate bounded cleanup signal allows release after the main run was cancelled.

The execution context includes board/boot/client/target/lease IDs, orientation epoch, identity/binding/lease flags, input state, normalized capability limits and clock estimate. Missing binding never opens phone tools. All readiness flags and the board's `executionEnabled` must hold. A lease alone does not prove input is released; a claim must explicitly return `inputState:'released'`. A renewal during motion may return `unknown` and must not fabricate release.

## Receipt and unknown delivery

The plan adapter uses the canonical segment SHA-256 and verifies the exact identity scope. Segment bodies go directly to `/v1/targets/:targetId/segments`; the client never retries a mutation automatically. Duplicate segment submission is rejected locally; callers query the existing ID instead. A result 404 is `DEVICE_RESULT_UNKNOWN`, not evidence that the command was never delivered.

Receipts must match board, boot, target, client, segment and known hash/plan IDs. Successful HID submission with a positive release flag establishes stack submission and released input only; visible phone outcome still requires a frame. Cancellation, unknown delivery, wrong scope and failed release stop dependent work.

Release always sends `{leaseId,cancelPending:true,invalidateLease:true}`. Only `status:'released'`, `leaseInvalidated:true` and `releaseSubmitted:true` establish a confirmed release. Lease state is cleared even if release fails; input stays unknown in that case. Boot changes clear leases, frame-dependent execution baselines and cached state.

Requests carry bounded JSON (256 KiB response, 96 KiB host request ceiling; segments additionally honor the advertised `capabilities.maxRequestBytes`), a timeout, external cancellation, no ambient cookies and no referrer. Errors expose stable codes without echoing token, owner password or response body. Common UI codes include `DEVICE_HTTPS_REQUIRED`, `DEVICE_IDENTITY_UNVERIFIED`, `DEVICE_IDENTITY_MISMATCH`, `DEVICE_BINDING_UNVERIFIED`, `DEVICE_TARGET_NOT_READY`, `DEVICE_WRITER_BUSY`, `DEVICE_LEASE_EXPIRED`, `DEVICE_RESULT_UNKNOWN`, `DEVICE_REBOOTED` and `DEVICE_TLS_OR_NETWORK_ERROR`.

## Validation status

`tests/web/device.test.mjs`: 21 mock tests pass, including the actual plan executor consuming the actual DeviceClient through a fake HTTPS backend. Existing core tests remain compatible; the combined smoke test passed, followed by an additional running-renewal state test. Coverage includes pin-before-password, nonce proof, encrypted-export boundary, writer isolation, renew serialization, expiration/reclaim fencing, reboot, hash/target validation, unknown results, no duplicate dispatch, release ownership, bounded JSON and reader cancellation.

The mock tests do not validate actual certificates, CORS, mDNS, Safari local-network permission, BLE timing, USB setup output or real phone input. Those still need physical acceptance against the compiled Arduino implementation.

## Runtime lifecycle regression check

The final Harness review added a separate run-lifecycle signal, combined with external cancellation and each frame node's sampler signal. A timed-out frame that finishes later cannot read a fresh execution context, claim a lease, or resume work after `endRun`. Reading target metadata after a capture always uses `allowClaim:false`.

The built-in plan executor already performs bounded cancellation cleanup. Harness now waits for that cleanup before its final writer release, avoiding concurrent `plan.release` and `endRun` requests. Injected executors remain interruptible; late capture callbacks still lose their lifecycle permission. Stopping a run clears the five-second renewal timer and aborts pending heartbeat work before final cleanup. Neither normal completion nor cancellation transfers writer ownership to another run.

`tests/web/device-runtime.test.mjs` covers heartbeat ownership and termination, no heartbeat for chat/plan, late-frame fencing, cleanup ordering, no replacement claim during a plan, and the actual Harness → DeviceClient → plan adapter contract through a fake HTTPS backend. Together with Harness, runtime-integration and plan tests, the final targeted run passed **72 tests**. Positive capture fixtures use a one-second test budget to tolerate simultaneous firmware compilation; explicit stalled-frame/result cases retain 100ms deadlines. Production timing limits were not relaxed. This is mock/runtime evidence, not a physical-phone acceptance result.

A fresh binding response that reports the bound target as running, nonreleased or missing immediately replaces any old host-side released-input evidence with `unknown`. A still-valid owned lease is coordination authority, not proof that input is released; input-plan preflight must reject the new unknown state. R1's unchanged independent regression covers this stale-state transition.

## Firmware request-memory admission

The complete plan preflight compiles every actual wire segment and measures its UTF-8 JSON body, including all identity/lease/plan metadata, a 36-character segment UUID and a 64-character hash. A later oversized gesture rejects the whole batch before any earlier gesture is submitted. The same full-batch check is repeated against fresh capabilities before the first dispatch; each actual segment's events and request size are checked again after asynchronous hashing immediately before dispatch. `DeviceClient.submitSegment()` independently enforces its currently known request-byte limit before/after hashing, before recording or sending the segment.

The product firmware advertises `maxRequestBytes:8192` and `maxEvents:128`. The accepted-motion mock fixture uses a separate 256-event capacity and a 40 ms advertised report interval; this does not change the product limit. Actual limits and timing come from the successful capability response. The 98,304-byte compatibility default applies only to a successfully read legacy report lacking the byte-limit field, not to failed or missing discovery. A held gesture is never split across network segments to fit the limit: excessive paths fail explicitly, so the next plan can shorten or sparsify the motion without destroying release velocity. No automatic interpolation reduction is introduced here.

Four new cross-module mock tests cover tap-before-oversized-swipe zero dispatch, accepted complete 8 KB sparse paths, exact envelope byte accounting, a request-capability shrink while hashing, and direct DeviceClient rejection without unknown input or HTTP dispatch. These tests validate JavaScript integration only; they do not establish C3 TLS heap capacity or actual iPhone gesture results.

Capability absence is not evidence of legacy firmware. Independent `claimLease() → submitSegment()` obtains `/v1/capabilities` whenever its cache is missing or expired, including a post-hash refresh if needed. A failed read stops before segment submission or input-state mutation. The 98,304-byte compatibility default applies only after a successful capability report lacks `maxRequestBytes`. R2's unchanged independent regression and two additional cache/discovery tests cover unknown, expired, failed and positively queried legacy cases.

Chat never queries the input bridge: the core constructs `chatExecutionContext()` with all execution-verification flags false, unknown input and an unbound screen, without calling the injected live context, capture setup or device `endRun`. The app has the same early mode guard. Existing stored conversations and local Skill tools remain usable when a selected board is offline; this does not grant phone tools to Chat. A strict adapter-access test exercises two model rounds with a local Skill-list call.

## Screen-sharing stop boundary

`ScreenCapture.subscribe(listener)` returns an unsubscribe function. An owned stream/recorder stop clears both references and advances `orientationEpoch` before recorder or track callbacks, then emits `{type:'stopped',orientationEpoch}`. Stopping an already idle capture is a no-op. Observer exceptions cannot prevent resource cleanup; a delayed ended event from a replaced stream cannot stop its replacement.

`grab()` retains its starting stream/track identity. After bitmap retrieval and each asynchronous blob/data-URL operation it rejects stopped/replaced sources with `CAPTURE_SOURCE_CHANGED`; bitmap cleanup runs even when the late result is discarded. This is source-lifecycle fencing, not a new OS rotation-event strategy.

Every non-Chat Harness run subscribes to capture stop and aborts that run. A pending model reply cannot later execute an old-frame plan; an already submitted plan follows existing bounded input-release and run-owned lease cleanup. The subscription is removed in finally on success, failure or cancellation. Chat never accesses this API, and older synthetic adapters without `subscribe` retain their trusted-context contract. Seven offline lifecycle tests include real ScreenCapture with fake tracks/encoders, a model waiting after an observed frame, source replacement, listener removal and release-before-endRun ordering. No real screen, model request or HID was used.

## Metadata cache under measured transport latency

The default metadata cache retains its 750 ms floor for low-latency clients, but expands to five times the high-water successful HTTP round-trip observed by that DeviceClient, capped at 5,000 ms. A caller-supplied `cacheMs` (including zero) remains a fixed override. Clearing credentials also clears the observed timing history. Binding and capability checks still execute; they may use those bounded cached reports instead of restarting two costly HTTPS handshakes on every synchronous state guard.

Unknown or expired capabilities must still be fetched before segment admission. An explicit `getBinding()` always applies fresh unknown/running state immediately. Explicitly fetched capability changes govern post-hash admission immediately. Expired leases, boot changes and board-side request fencing are unchanged; the cache is not new evidence of released input or a replacement for server admission.

Eight offline regressions integrate the actual DeviceClient and plan executor with a fake monotonic clock advanced by 1.0 or 1.3 seconds per request. Before the change, all six normal/warm checks failed: even Home exhausted the 15s plan wall budget, and each warm context repeated two handshakes. After the bounded adaptive cache, Home takes 2.6–3.0 simulated seconds and two gestures with a capture take 4.025–5.225s; warm sequences make zero repeated requests after any first stale report is refreshed. Additional cases retain the five-second stale/reboot cutoff and immediate explicit binding invalidation. See [the measured fixture report](../research/device-rtt-budget-verification.json) for counts and limitations. These are finite synthetic transport measurements, not real C3 or phone performance acceptance.
