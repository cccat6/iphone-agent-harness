# Independent lifecycle and firmware integration review — R6

Date: 2026-10-18. Fresh review after `independent-core-r5.md` and the two fixes requested by `independent-firmware-r1.md`. Product source was read only. No Arduino compilation, serial/USB/BLE access, browser, phone input, live API, cloud change, commit or deployment was performed. Only finite host adapters, host C++ compilation and local tests were used. The concurrent firmware build and Web locale owners retain their respective scopes.

**Result: A has no new reproducible issue in the reviewed scope. B confirms the two previous fixes, but has one new P2 target-isolation counterexample, R6-F1. This round does not support closing the repair/review loop.**

## A — screen-sharing stop and run lifecycle

Read actual `core/capture.js`, `core/harness.js`, `core/plan.js`, `core/device.js`, the live app context construction and the existing seven capture lifecycle regressions. Owned stop clears stream/recorder references and advances the epoch before reentrant recorder/track operations and listener notification. Repeated stop does not notify again. Pending bitmap, encoding and data-URL paths recheck their starting stream/track, and the bitmap `finally` closes late or failing reads. An old stream's ended callback checks ownership before stopping a replacement.

Non-Chat Harness runs subscribe after resolving their mode. Stop aborts their run signal; pre-dispatch guards and the real executor then prevent subsequent input. Dispatched work uses the existing fresh-signal release path before lease cleanup. The finally path detaches the listener, ends the device writer lease, settles unfinished tool calls and releases session/run ownership. Chat short-circuits before accessing `subscribe`; old capture fakes without this optional method remain supported. Actual app context uses the capture's current epoch, and plan context checks fence stale frames across later runs.

Added `tests/web/independent-lifecycle-r6.test.mjs`, without changing product code or prior expectations. All six independent cases passed:

- Native track end while FileReader is pending rejects its late image after bitmap closure.
- Draw failure closes the bitmap and leaves subsequent stop idempotent.
- Stop while the device intent journal write is pending causes zero device submissions, ends the writer once, detaches the listener, and settles the dependent call exactly once as not executed.
- One Harness completes, fails its provider, cancels, and then completes a later run with zero retained listeners after each run.
- A delayed ended event from the previous source cannot cancel a later run on the replacement source.
- Plan mode is cancelled by source stop, while the legacy adapter without `subscribe` still completes an observation-free Plan run.

Independently reran the original capture, Harness, device, plan and R5 suites together: **82/82 passed**. The six new cases passed separately: **6/6**. Existing tests include stop during a stalled model response, stop during an already submitted segment with release ordering, late bitmap/encoder cleanup, capability rechecks around hashing, uncertain receipts and bounded capture deadlines. No browser or physical capture claim follows from these finite adapters.

## B — firmware integration

### Previous findings fixed at actual call sites

R1-F1: `SetupDeadline` is used by `SecureService::openSetup()`, owner-validated `configure()`, `finishSetup()` and `loop()`. Opening/reconfiguring cancels the old deadline; finish while inactive leaves none; repeated active finish keeps the initial deadline. The nine deadline/time host scenarios passed.

R1-F2: authenticated setup time is passed to the temporary PKI worker. `Pki::provision()` checks parsed CA **and** leaf validity intervals before reuse. Future/expired CA reissuance retains the CA private key and reissues the leaf. Future leaf also leaves the fast path. Verified storage is reloaded before the committed marker, final load recomputes the DER fingerprint, and successful repair reports the changed fingerprint, `trustProfileChanged` and `manualTrustRequired`. Failed issuance clears RAM leaf/key/expiry so finish cannot accept a partial configuration. This is source tracing plus helper tests; no real mbedTLS provisioning or iOS trust installation was executed by this reviewer.

### R6-F1 — P2: a reused BLE handle can receive the previous target's input before peer reconciliation

Reviewed `main.cpp` SHA-256: `6ad80977ae9dc9571f3b2891b760b143d99da6838ca55a231962dc5339b48cff`.

Relevant source: `BleSink::submit/release` lines 36–45; callback-only peer publication lines 64–92; snapshot reconciliation lines 109–118; separated reconcile/tick calls at line 190. `Core::tick()` sends via the stored numeric handle at `src/Core.h:197`; completion/release uses it at lines 86–90. The sink receives no expected identity or connection generation and never checks the callback snapshot.

Minimal reachable scheduling sequence:

1. Known bonded phone A is ready on handle 11. Client A holds its lease and has a valid accepted segment queued. `syncPeers()` has reconciled that identity and handle.
2. Before a report is submitted, the loop is preempted. NimBLE disconnects A and reconnects another already known bonded phone B using handle 11, with encryption and report subscriptions ready. These callbacks update only `peers`; they do not invalidate Core or wait for its mutex.
3. The old tick resumes. Core still sees A as ready and `BleSink` directs A's report to numeric handle 11, which now selects B. The next `syncPeers()` is too late to retract it. Preemption may occur after `nowMs()` argument evaluation (or after the lateness check), so the 40 ms lateness threshold is not an identity fence.
4. A later tick may even produce A's `hid_submitted` / `releaseSubmitted:true` result after notifications went to B.

This concerns sequential disconnect/reconnect and target-bound delivery, not a promised throughput/fairness level for concurrent phones. `docs/architecture/firmware-implementation.md` explicitly promises checking handle reuse against current resolved identity. The Core mutex does not cover callback publication, so keeping it locked during tick does not solve this gap. R1's statement that identity mismatch is invalidated before new input was too strong for the actual interleaving.

The host counterexample **extracts the unmodified actual BleSink class from main.cpp**, includes the actual Core.h, and supplies only a finite `NimBLECharacteristic::notify` transport adapter mapping handle 11 to its current peer. It models callback publication replacing the physical handle owner between reconciliation and tick. Reproduction:

```sh
python3 docs/research/repros/lifecycle-r6-handle-reuse.py
```

Observed output on the reviewed source:

```text
R6-F1 REPRODUCED: 5 old-target notifications reached replacement id-b; target-a receipt=hid_submitted, releaseSubmitted=true
```

The script intentionally exits **1** when this wrong-target counterexample occurs. It is a review reproducer, outside the ordinary green regression suite. It compiles host C++ only and neither invokes Arduino nor contacts a radio. It establishes the missing integration guard under the allowed callback schedule; it does not measure the frequency or duration of that schedule on physical NimBLE hardware.

The implementation owner should fence input **and release** against a connection identity/generation at the delivery boundary, abort stale work, and test disconnect/reconnect publication between reconciliation and delivery. Repeating an unfenced snapshot immediately before notify still leaves an interleaving; the solution also must preserve the no-Core-lock-in-callback rule and avoid holding a short peer critical section across blocking NimBLE operations. No product fix was made here.

### Other reviewed boundaries and verification

Traced Core-before-peer lock order, callbacks' atomic pairing gate, temporary PKI task/semaphore lifetime, setup/TLS exclusion, grant-before-activation persistence, network read-back, PKI commit marker and signature/key consistency, per-client lease/result scoping, retired lease IDs, boot checks before duplicate results, external RTC storage reset, bounded wire schemas and canonical hashing. No further new reproducible issue was established in these paths. The new handle-reuse finding qualifies the earlier directed-notification evidence; explicit handle selection alone is insufficient identity binding.

Host commands and outcomes:

```sh
sh tests/firmware/run.sh
sh tests/firmware/run_canonical.sh
python3 tools/build_firmware_test.py
```

**67** Core/Admission/capacity/external-RTC/setup-time scenarios passed; **6** actual pinned ArduinoJson canonical-streaming scenarios passed; **6** offline artifact-integrity tests passed. Artifact tests use temporary fixtures; concurrent intermediate firmware binaries were not validated or treated as defects.

Reviewed hashes: `Core.h` `a1e6864487933ed3cee5a6a8c50bc4aff51b3d6f7af69d282a59773fdc468352`; `SecureService.h` `ef99867861633e6bb43232bff472b0ec0e4dde3ac329f4316df05d5615ccb39b`; `Pki.h` `7e43c08dc5b9e1c23f2a71b19cc6625c0377521f8b0d0cb670351c2e6c41681d`; `SetupState.h` `3031424c801b77064393fb44f47d9573fa4559dd5818149c2baed6a28b5bd1a0`; `capture.js` `58a1a86804e7a702dac4e8f2d6653d52ec2ddd00b7775f08c0e83b28574bcf2a`; `harness.js` `a24af5b4aaea6602f017e1238ddb3f6e9aabec25a2fa8a06a7f0c7a6e7d47619`.

### Limits

No C3 TLS handshake, heap headroom, stack high-water result, NVS power-interruption experiment, actual BLE handle reuse/RPA reconnect, iOS CA trust, Safari persistence/background capture, LAN browser connectivity or visible phone action was established. The pre-existing physical TLS allocation failure and the in-progress four-profile build remain separate root-owned gates. Memory was used only to retain the distinction between submitted HID receipts and observed phone behavior, not as current acceptance evidence.
