# Independent final integration review — R7

Date: 2026-10-18. Fresh independent review after the R6 BLE handle-reuse finding and the metadata RTT cache change. Product implementation was read only. This reviewer added only two independent host regression files and this report. No Arduino build, commit, site/build publication, deployment, serial port, live API, browser, BLE device or phone operation was performed.

**Updated result: R7-F1 is a confirmed P2 cancellation-position defect, independently reproduced after the initial clean review. The repair/review loop remains open. R6-F1 is closed for the reviewed software scheduling boundary; the default RTT cache change preserves the tested boot, binding, lease, capability and release fences. This is finite host/source evidence, not physical phone acceptance.**

## Firmware scheduling and R6-F1 closure

The 13 allowlisted firmware source files independently hash to **`fbfd7a7f1a6cbf52939317b6ce97b07eca44927fa80082bb550590a08ff660cd`**, matching the coordinator's source freeze. `main.cpp` SHA-256 is `24d5a14464500b277b7af7ca89c1be55afeae9198d1c03072d86b50eb7901ba1`; `src/Core.h` is `bc6594e2749f9ee2a61c56193fdcdf530f802e8a6038af417438c1b22abce64d`.

`main.cpp:37–40` matches handle, connection epoch, stable identity, bonded/encrypted state and report subscriptions. `BleSink` copies the expected route into its single fixed job (`main.cpp:76–89`), then executes delivery on the NimBLE default host queue. Validation precedes the atomic Running→Sending boundary (`main.cpp:61–74`). Timeout can cancel Queued work or abandon Running/Sending work; the job remains unavailable until its host task terminates or cleans up. Cleanup uses the original job's identity and epoch, including in the cancelled-queued path, and checks individual available report channels. Uncertain delivery remains false to Core, which records `transport_failed` and preserves an unconfirmed release gate.

This is materially stronger than the historical R6 snapshot's separate loop reconciliation and direct handle-only notify. The historical report and reproducer remain untouched. The new independent regression does not reuse the implementation owner's ten tests: [independent_router_r7.py](../../tests/firmware/independent_router_r7.py) extracts the actual current Peer matcher and BleSink text and includes the real Core header, without rewriting their logic. A deterministic finite semaphore/event adapter adds two explicit thread suspension points: after identity validation before Sending CAS, and after Done CAS before semaphore give. Its **9/9** cases passed:

- A cancelled queued job sees a different target on the same handle, or the same identity on a new epoch; neither stale input nor old cleanup is delivered. The replacement connection's own all-up gate succeeds afterwards.
- Timeout wins after identity validation but before Sending CAS; no pressed input is sent, cleanup completes before slot reuse.
- Done is published while its semaphore give is delayed; the timeout stays unknown and a second caller cannot overwrite the live job.
- A notify already in progress finishes after caller timeout; Core retains failure/unknown release, the host job sends all-up cleanup, and Core requires its normal release gate before readiness.
- Core unbinds A and installs B while A's cancelled event remains queued; the old cleanup never goes to B, and B subsequently releases through its own route.
- Subscription loss published before host delivery blocks new input while allowing only the available release channel.
- A deadline expiring in the host queue submits zero pressed reports and yields failure even when normal all-up cleanup succeeds.
- A transport boolean failure cannot yield a completed/released receipt.

The first bullet comprises two cases, giving nine total. The tests assert individual recipients and pressed/all-up report contents, result status, release evidence, slot reclamation and connection readiness.

The serialization premise was independently traced in the pinned local NimBLE-Arduino 2.5.1 source. `nimble_port.c:289–309` runs one event from the default queue at a time. `ble_hs.c:862` selects that queue; `ble_hs.c:605–620` enqueues received HCI events there, and its host handler processes them at `539–553`. `NimBLEServer.cpp:439–637` invokes the connect, disconnect, subscription and authentication callbacks synchronously from GAP event handling. The actual `NimBLECharacteristic.cpp:272–328` uses the individual connection-handle branch and returns the transport result. No Core mutex is acquired by the product Peer callbacks; no BLE notify is performed inside the Peer critical section. This source tracing supports the host-adapter model; it does not measure controller/radio timing.

The C3 product still selects 128 events, a 7168-byte externally supplied replay filter and bounded result storage. The external Core constructor clears retained storage before the new boot accepts work, boot checks precede duplicate receipts, evicted IDs retain fail-closed tombstones, and lease IDs cannot be restarted after retirement. Re-ran the product bound and legacy/portable bounds. Reviewed R1 setup fixes at their actual call sites: fresh open/owner configuration cancels prior finish deadlines, repeated finish preserves its original countdown, and PKI reuse checks both CA and leaf validity against the supplied setup time. These files are unchanged from the reviewed R6 fixes. No new issue was established.

## Device RTT cache and capture lifecycle

`device.js` SHA-256: `5e2a32772b192ef9e2387ec6a851e4ff666cd51963e70e4ba0ad3401cd513339`.

The default cache uses successful complete-response RTT high water multiplied by five, bounded between 750 and 5000 ms (`device.js:13,24,34,43`). Explicit `cacheMs` remains fixed. Cache lifetime does not change lease expiration, expected boot/client/target matching, explicit binding refresh, capability byte ceilings, result identity checks or release acknowledgement requirements. Missing capabilities are still obtained before direct dispatch; failed discovery does not authorize fallback. Expired capabilities are refreshed before dispatch and rechecked after asynchronous hashing.

Added [independent-integrated-r7.test.mjs](../../tests/web/independent-integrated-r7.test.mjs), **8/8 passed**. Its finite monotonic-time server independently checks the default expiration floor/cap, explicit 1200/zero cache overrides at 1100 ms RTT, lease expiry, immediate explicit retargeting, cached metadata followed by a server boot fence, missing/failed capabilities and the new byte ceiling, and unknown release. In particular, stale cached metadata can still cause an attempted POST after a server reboot; the server fence rejects it, DeviceClient marks the mutation unknown, and subsequent boot metadata clears the lease. A cache hit alone is never proof of a current boot. Unknown release retires the local lease and does not become successful release evidence.

Re-ran the implementation's eight RTT integration tests through the real DeviceClient and plan executor. At 1000/1300 ms synthetic request RTT, warm context calls used `[0,0,0]` / `[1,0,0]` requests; Home completed in 3000/2600 ms and two gestures with a capture barrier in 4025/5225 ms. These reproduce the after-fix numbers in `device-rtt-budget-verification.json`. They exclude cold setup and simulate immediate terminal HID receipts; they do not measure asynchronous firmware polling or physical gesture latency.

`capture.js` and `harness.js` hashes remain R6's `58a1a86804e7a702dac4e8f2d6653d52ec2ddd00b7775f08c0e83b28574bcf2a` and `a24af5b4aaea6602f017e1238ddb3f6e9aabec25a2fa8a06a7f0c7a6e7d47619`. Re-read the source-stop ownership fence, bitmap finally cleanup, late encoder/FileReader rejection, old stream callback guard, run cancellation subscription, fresh-signal release, listener removal and writer cleanup. All seven original capture lifecycle and six independent R6 cases passed again. No integration regression was found.

## Executed verification

- Independent extracted BleSink/Core scheduler: **9/9**.
- New R7, original RTT, original capture lifecycle and independent R6 suites together: **29/29**.
- Device, device runtime, plan, Harness and independent Core R1–R5 suites: **98/98**.
- Firmware Core/Admission/product-capacity/external-RTC/setup-time host suite: **67/67**, plus implementation router suite **10/10**. The host command exited 0.
- Actual pinned ArduinoJson canonical streaming: **6/6**.
- Offline firmware artifact validator fixture suite: **6/6**. These fixtures do not inspect or certify the separate owner's in-progress binary files.

## Limits

No actual C3 heap/stack measurement, final image correspondence, TLS handshake, NVS interruption, real reconnect/RPA/handle reuse, iOS trust, Safari capture/background scheduling, phone action or two-phone throughput result is claimed. The scheduling adapters cover explicitly constructed finite interleavings and preserve the host queue's serialization premise; they are not exhaustive concurrency model checking. Prior memory was used only to keep HID submission evidence distinct from observed phone behavior. Physical cooperation remains deferred as requested.

## Addendum — R7-F1, P2: cancelled queued move supplies an unsubmitted release position

The firmware implementation owner identified this candidate after the initial R7 report. This independent reviewer then verified it on the same unchanged `main.cpp` SHA-256 `24d5a14464500b277b7af7ca89c1be55afeae9198d1c03072d86b50eb7901ba1`, both with the owner's opt-in case and an independently added actual-Core scheduling case. The original nine independent scenarios remain passing; they checked cleanup recipients/buttons but did not previously assert pointer coordinates.

At `main.cpp:82`, `send()` changes `route->x/y` to the pointer event's position **before** its job has executed, and copies that position into `job_.releaseX/Y`. When a queued move times out, `send()` changes Queued to Cancelled (`main.cpp:86`). The later host event enters the Cancelled branch (`main.cpp:63`) and calls `safetyRelease()`, which emits an all-up pointer report at the copied position (`main.cpp:57–58`). The cancelled movement report was never notified, but its endpoint still reaches the target inside cleanup.

Independent actual-Core reproduction:

1. Accept a valid pointer sequence: down at x=5000 at t=0, held move to x=9999 at t=1, up at x=9999 at t=2.
2. `Core::tick(0)` submits the down report at x=5000.
3. Keep the next host job queued and call `Core::tick(1)`. The move submission times out; Core records `transport_failed`, one submitted event and `releaseSubmitted:false`. Its ordinary release attempts cannot acquire the still-cancelled job slot.
4. Drain that cancelled host event. No held move has been sent. Its safety cleanup nevertheless emits pointer all-up at x=9999, followed by the keyboard/consumer all-up reports.

Run the preserved opt-in independent reproducer:

```sh
IAH_R7_CANCEL_POSITION_REPRO=1 python3 tests/firmware/independent_router_r7.py
```

It intentionally exits 1 on the reviewed defective source, after the original nine cases pass:

```text
9 independent extracted BleSink/Core scheduling cases passed
R7-F1 REPRODUCED: Core submitted pointer-down at 5000, queued move 9999 never notified, cancelled host cleanup released at 9999; receipt=transport_failed, releaseSubmitted=false
```

The owner's `IAH_CANCEL_POSITION_REPRO=1 python3 tests/firmware/ble_router_test.py` independently failed its expected `lastPointerX==5000` assertion. Neither run modified implementation or contacted hardware.

This proves unexpected pointer relocation during cancellation cleanup. A phone may interpret the report as an endpoint release/drag, but no iOS gesture interpretation was measured here. Identity fencing and unknown-result reporting still work; they do not remove the unsubmitted coordinate from the cleanup report. The implementation must distinguish a job cancelled before sending from a report already attempted and choose cleanup coordinates from the appropriate delivered/attempted state. A fresh independent R8 should include both pre-Sending cancellation and already-Sending uncertainty before claiming closure. No implementation fix was made by this reviewer.
