# Device client and task writer lifecycle

`apps/web/core/device.js` implements the device protocol. `apps/web/core/device-rtc.js` supplies its normal browser transport. The logical `/v1` routes stay the same; Harness requests travel over one WebRTC Direct data channel rather than browser HTTP requests to the LAN.

## Connection and saved information

`DeviceRTCTransport` connects from the existing Harness page. It uses the imported `rtc:{ip,port,fingerprint}` or the project defaults at `/firmware/rtc-defaults.json` with the saved local address. The USB setup link and the bridge's `/settings` return link supply the actual LAN IP, avoiding dependence on browser resolution of a device name. The return link navigates back in the same tab, then its fragment is removed. In the 2026-10-19 Safari check, HTTP `igent.local/settings` resolved and returned the correct import link, while using `igent.local` directly as an RTC candidate timed out. The first-use flow therefore obtains the numeric address from settings or USB rather than promising automatic mDNS discovery inside WebRTC.

The adapter creates a peer with no ICE servers, keeps the browser-generated local offer unchanged, constructs the Direct v2 remote answer and opens negotiated ordered data channel 0. No persistent helper tab, external signaling service, TURN server or cloud command relay is part of this flow. HTTP remains available for local setup, management and Shortcuts.

The shared RTC certificate is communication configuration distributed with the firmware and website. It does not identify an individual board. Device identity checks still compare `boardId`, `bootId` and saved metadata; browser enrollment returns a separate token, and current firmware binds the selected ready target. An optional phone input test can additionally verify actual typed input. The compatibility `publicKeyFingerprint` identity label is distinct from the DTLS certificate fingerprint in `rtc.fingerprint`.

Pairing does not use a connection code. Ordinary settings retain the address and identity metadata; the separate browser-local credential record retains its token without asking for another password. Restoring that record does not restore live readiness: the client must check the current target and connection. Fresh digit proof is optional on current firmware.

## Transport contract

```js
const transport = new DeviceRTCTransport({baseUrl, rtc, onDisconnect});
await transport.open({signal});
const device = new DeviceClient({baseUrl, fetchImpl: transport.fetch});
```

The adapter permits the fixed identity, capability, binding, clock, pairing, phone-control and clipboard routes. It normalizes the supported JSON/authentication headers and returns a normal `Response` to `DeviceClient`.

One RPC is active at a time; up to eight browser requests may wait. Frames contain `{v,type,id,n,seq,end,data}` and are at most 512 UTF-8 bytes. All non-final decoded chunks are 256 bytes. Request envelopes are at most 12,288 bytes and response envelopes 16,384 bytes. `n` is assigned when a queued request actually starts, increases from 1 for each connection, and is echoed in the response. `id` remains the UUID correlation key; `seq` orders chunks within that RPC.

A queued request cancelled before sending is removed without consuming `n`. Cancelling or timing out an active request closes the peer and rejects the remaining queue. Mutations are not replayed after cancellation, disconnection or reconnection. The request-number and framing implementation is shared with the [firmware contract](secure-lan.md#transport-and-rpc).

## Target binding and optional input proof

Current firmware accepts explicit binding of a connected, encrypted, HID-subscribed target and reports `bindingVerified`; the UI treats that usable bound target as `targetBound` and ready. The optional digit test is extra observed-input evidence. A 404 from an older binding endpoint retains optional legacy-test/update guidance and does not fabricate a binding.

Authenticated calls carry a Bearer token and request ID. `getBinding()` returns the current targets. `startChallenge(targetId)` requires connected, encrypted, subscribed Bluetooth input and returns only the challenge ID, length and expiry. The UI focuses its trusted-key collector before requesting the test, because HID digits may arrive before the response.

`confirmChallenge(targetId,{challengeId,observedNonce})` submits the eight digits actually received. Verification must match the current board, boot, browser and target. A `typing` response, saved token or Bluetooth pairing record alone does not establish proof. Target status includes connectivity, HID subscription, released/unknown input state and running state.

## Client API

```js
device.identity({signal})
device.capabilities({signal})
device.clockSync(3,{signal})
device.pair({clientId?,expectedFingerprint?},{signal})
device.exportCredentials()
device.restoreCredentials(record)
device.clearCredentials()
device.getBinding({signal})
device.targets({signal})
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

Display getters include `paired`, `clientId`, `boardId`, `bootId`, `targetId`, `leaseId`, `leaseVerified`, `identityVerified` and `bindingVerified`. `status()` is safe for the UI. Clipboard methods prepare, query and cancel a target-bound temporary text job; the Shortcut confirms the actual copy separately.

## Lease and execution lifecycle

The Task, rather than the model, owns the writer ID and its short lease. Between plans it may claim a verified, idle and released target. During a plan it may only renew the same unexpired lease; it cannot continue an old segment under a replacement lease. Concurrent same-writer renewal is serialized, and another run cannot take the active lease.

Task-owned renewal continues during a long model request where browser scheduling permits it. Stopping the run aborts this work, waits for bounded plan cleanup and then releases its own writer. Renewal is not a guarantee that Safari will run indefinitely in the background.

Execution context includes the full board/boot/browser/target/lease scope, orientation epoch, current capabilities, released-input state and clock estimate. A fresh running or unknown status replaces older released-input evidence immediately. Missing or expired capabilities must be read before segment admission.

The plan executor measures every complete wire segment before dispatch, including identity, plan and hash metadata. An oversized later gesture rejects the whole plan before earlier gestures run. Each segment is checked again after asynchronous hashing. The transport's envelope limit does not raise the board's smaller `maxRequestBytes` or event limits, and held gestures are not split to bypass those limits.

## Receipts, capture and disconnection

Receipts must match board, boot, target, browser, segment and known payload/plan IDs. Successful HID submission and release do not prove the visible app result; the browser observes that through a screenshot. A missing receipt is `DEVICE_RESULT_UNKNOWN`, not evidence that an operation was never sent. Callers query the existing segment ID instead of repeating a mutation with a new ID.

A confirmed release requires released status, lease invalidation and successful release submission. Failed cleanup leaves input unknown. A boot change clears leases and image-dependent execution baselines. Stopping or replacing screen sharing invalidates in-flight capture results and aborts non-Chat runs before a late model response can use an old image.

Bridge state is included in model context. Existing conversations can continue when the bridge is absent, but phone-input tools fail with that explicit reason. The Chat runtime does not claim a writer or access phone tools. New-session UI entry checks the live connected, bound, usable target; the digit test is optional on current firmware. Unbound older firmware retains legacy-test/update guidance rather than silently gaining readiness.

Metadata caching is bounded between its normal 750 ms floor and 5 seconds, adapting to observed request latency. Explicit binding/capability responses take effect immediately; caching does not replace board-side admission or prove released input.

## Verification

Browser tests cover framing, queue ordering, cancellation, setup imports and the real DeviceClient/plan integration using mocks. Firmware host tests cover SCTP loss/reordering/duplicates, RPC limits and the final-response/next-request race. [Phone prototype measurements](../research/rtc-direct-c3-iphone-20261019.json) remain distinct from integrated production RTC/BLE and actual phone-operation acceptance.
