# Independent Web Serial reset and setup lifecycle review R11 — 2026-10-18

## Result

**No new reproducible product bug was found in the reviewed source snapshot.** The reset override uses the actual vendored loader extension point, propagates reset failures, and disconnects before returning a verified result. The setup deadline begins after native port selection, and an open that completes after cancellation is closed by the request that initiated it.

This reviewer added only `tests/web/independent-serial-r11.test.mjs` and this report. No implementation, existing test expectations, vendor source, firmware, build, built site, commit or deployment was changed. No browser, serial device, phone or live API was operated.

## Source review

- The vendored `esptool-js` metadata identifies version 0.7.0. Its actual `HardReset.reset()` releases RTS but does not assert it. `ESPLoader` merges a supplied `resetConstructors.hardReset`, and its actual `after('hard_reset')` awaits the constructed reset object's `reset()` method. The application override therefore runs on the production path.
- Actual `Transport.setDTR(value)` updates `_DTR_state` and sends the DTR signal; `setRTS(value)` sends RTS and then replays that cached DTR through `setDTR`. Clearing DTR before asserting RTS is necessary to avoid restoring the previous download-mode DTR state. The override awaits DTR false, RTS true, a 200 ms pulse, RTS false, and an additional 200 ms only when the loader supplies a truthy USB OTG flag.
- `flashFirmware` awaits `writeFlash` and then `after` before constructing `{verified:true}`. Any rejected reset step rejects the operation. Its outer `finally` awaits transport disconnection and clears the shared operation guard even if disconnection rejects. No hash/chip/capacity gate was moved or removed.
- Download bytes still require exact manifest size and SHA-256 before constructing a transport. Chip and minimum 4 MB capacity checks precede `writeFlash`. The write retains DIO / 40 MHz / 4 MB, compression, no full erase, original part offsets, and the MD5 callback. The actual vendor `writeFlash` computes the callback hash over the final image bytes, compares it with `flashMd5sum`, and throws on mismatch. The independent tests simulate the write adapter; no actual flash MD5 command was executed.
- `readDeviceSetup` checks external cancellation both before requesting a port and after the chooser returns. Its I/O timer starts only after that second check. Native selection remains awaited until the chooser settles; the cancellation guarantee reviewed here is that an aborted request never opens or touches the subsequently selected port.
- The setup request records ownership only after a successful awaited open. A timeout or abort while native open is pending attaches a fulfillment cleanup to that same open promise, consumes late rejection, and does not close an unacquired port. An already-open borrowed port is unlocked but not closed by the reader. Closing another port or stealing another stream owner's locks was not observed in the finite simulated cases.

## Executed checks

Node v24.19.0, without npm lifecycle scripts, asset synchronization or build commands:

```text
node --test tests/web/independent-serial-r11.test.mjs \
  tests/web/serial-lifecycle.test.mjs tests/web/serial-setup.test.mjs \
  tests/web/runtime-integration.test.mjs
41 passed, 0 failed, 0 skipped

node --test tests/web/*.test.mjs
354 passed, 0 failed, 0 skipped
```

The nine independent R11 tests cover:

1. The actual vendored `Transport` and actual inherited `ESPLoader.after()` invoking the application's override, with cached DTR initially true, and no verified return before the 200 ms non-OTG pulse completes.
2. The same production reset path retaining the additional 200 ms USB OTG settling delay.
3. Failure at DTR clear, RTS assertion and RTS release: no successful result, exactly one disconnect, and a subsequent flash can acquire the operation guard.
4. Same-length corrupted download rejection before transport construction; wrong chip / 2 MB rejection before write; write verification failure before reset, with disconnect.
5. Pre-aborted setup never invoking the chooser, followed by a successful independent setup request.
6. Abort during chooser selection leaving a late selected borrowed port and its existing reader/writer locks untouched.
7. Timeout during native open, another request completing on a different port, and eventual cleanup only of the original late-open port.
8. Rejected late native open being consumed without closing an unacquired port, followed by a successful setup request.
9. Successful reading from an already-open borrowed port releasing its locks without closing it.

An initial in-progress revision of the new test file was picked up by root's concurrent suite run. It inspected reset events after a single event-loop turn, before asynchronous SHA-256 completed (`events=[]`), and its abandoned pending flash caused subsequent `flash_busy` failures. This was a test synchronization defect. The finalized tests wait for an explicit reset stage before advancing the simulated clock; rejection cases use real finite pulse timers. Both complete runs above use the finalized file and pass. Existing test expectations and production source were not changed to accommodate that failure.

## Exact inspected snapshot

SHA-256, paths relative to the repository:

```text
apps/web/core/flasher.js                       5993cfb80bb73b7966d9ca63a16c6bbdce0886e04864593890df619a6d9142a2
apps/web/core/control.js                       4f070ed1803f154f83770e66fa73fba0fc4d7c55c77dabc749c28e9ac2241e58
apps/web/vendor/esptool-js/bundle.js            00ebe6fb0b202976d3e2a3c6b9a6bd438c26a81d2af6739c95ac276a64c1a84e
apps/web/vendor/esptool-js/source.json          d1cc71fc2b7d26d1fdaefa0ec6d0348b09fc660a2687abe82a612d44680bf84c
tests/web/serial-lifecycle.test.mjs             448c2ef8eec4890ebbedbaf2664cb7d10e0fd520775e1a2d42f73b5a11168ae3
tests/web/independent-serial-r11.test.mjs        80eb19998969b2c1d9b04c3bf22b5024b17111b27b981087d4cdc2dfb492cf5e
```

## Limits

The reset tests execute real vendored constructor, transport signal methods and reset dispatch against finite fake port signals. Connection, chip detection, device capacity response and flash writing are simulated. Setup tests use JavaScript streams and finite deferred native-open promises. They do not prove Chrome's native chooser behavior, OS/USB line propagation, real device reboot or reconnect, USB OTG board behavior, serial readback, browser CORS/TLS, phone pairing or HID delivery. Physical C3 acceptance, other board acceptance, release builds, public deployment and CI synchronization remain separate root-owned work.
