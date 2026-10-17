# Independent core review R1

Date: 2026-10-18. Scope: independent problem discovery and non-UI acceptance, without changing product implementation. Browser, serial, real-device control, commits and deployment were not used. Only synthetic data and mock transports were used for the new reproductions.

Result: **three reproducible new issues; five new safety regressions fail**. The pre-existing Web suite independently passed **235/235** before these regressions were added. Passing existing tests therefore does not close this review.

## Reproduce

```sh
node --test tests/web/independent-core-r1.test.mjs
```

At review time: 5 tests, 0 pass, 5 fail. The tests express the desired safe behavior and were deliberately left failing for the implementation owner. No product fix is included in this review.

## Findings

### P2: opaque protocol state crosses backend paths on the same origin

`apps/web/core/providers.js:46` checks protocol, URL origin, account ID and model. Its scope at line 74 omits the actual backend path. Editing one account profile from `https://gateway.invalid/tenant-a/v1` to `https://gateway.invalid/tenant-b/v1`, while retaining model/account, forwards tenant A's `reasoning_content` or Anthropic signed thinking blocks to tenant B.

The first two regressions call the real `callModel()` twice through a mock fetch. The first response contains only a synthetic opaque marker. The second request changes the backend path. Inspection of the actual serialized request body finds `synthetic-private-state` in both protocol cases. Expected: opaque state must be replayed only for the same canonical backend endpoint, in addition to account/protocol/model matching. Equivalent representations of one endpoint may be canonicalized; distinct gateway paths must remain distinct.

Impact: unrequested disclosure of backend-specific opaque state across logical backends and possible invalid-signature/protocol failures after an ordinary endpoint edit. This does not claim that two different URL origins share state; the existing origin check handles that case.

### P2: streaming tool argument accumulation has no bound

`apps/web/core/providers.js` appends OpenAI `function.arguments` and Anthropic `input_json_delta.partial_json` to per-call strings without checking cumulative size or the size of the calls map. `readSSE()` bounds only the pending SSE event, so many individually small events can keep growing those strings. `JSON.parse(c.args)` occurs after the complete stream. The Harness's separate 64,000-character argument check consequently happens after accumulation and parsing.

The third and fourth regressions supply a valid 256 KB JSON argument via the real streaming parser, one case for each protocol. Both return successfully from `callModel()`; the expected capacity rejection is absent. The fixture is intentionally small and finite and performs no pressure test. The source has no cumulative tool-argument limit, so repeating small events can exceed this demonstrated size before the model-request deadline.

Impact: a malformed or excessive backend stream can consume mobile memory before the Harness rejects the result. No malformed tool is executed in this reproduction. Expected: reject excessive argument bytes/characters and excessive tool-call count during accumulation, cancel the stream reader, and keep the final validation as defense in depth. The dedicated Codex adapter already has explicit comparable bounds.

### P2: fresh running/unknown binding preserves an old released state

`apps/web/core/device.js:60` sets `#inputState='released'` for a positive idle binding, but does not revoke an existing released state when a subsequent binding response reports `inputState:'unknown', running:true` for the same target. `getExecutionContext()` consequently returns the old released value with an otherwise valid owned lease.

The fifth regression restores a synthetic credential, obtains a released binding and owned lease, then changes only the fake board's current target state to running/unknown and advances the clock past the zero-duration cache. The real `getExecutionContext()` fetches that fresh binding but returns `inputState:'released'`. A real `validatePlan()` invocation against that returned context accepts a Home plan (`valid === true`). Expected: a fresh nonreleased/running binding must change the host input state to unknown and fail input-plan admission.

Impact: the host's current-state report and preflight incorrectly authorize released-input assumptions. The current firmware `Core::accept()` has its own `t->running` busy rejection, so this review does **not** claim demonstrated concurrent physical HID execution. Firmware admission is a separate defense and does not make the browser's trusted state truthful.

## Coverage and evidence boundaries

Read the README and runtime, context, backends/auth, MCP, device-client, Skill and community architecture contracts. Traced the implementation across Harness, prompt, context, provider/Codex state replay, credential separation, storage/import/export, Skill download/ownership, signed community identity, MCP permission manager and the phone-plan/device protocol. Inspected current firmware admission read-only to qualify the device finding.

Independently ran all existing `tests/web/*.test.mjs` before adding the review file: **235 passed, 0 failed**, approximately 11 seconds. This includes existing real cryptography/SQLite community tests plus mocked cancellation, cross-tab ownership, compaction, retained image selection, import trust, Skill CAS/ownership, protocol replay, MCP authorization generations, unknown outcomes, bounded text projections, device leases and real module integration. Added the five independent boundary regressions above instead of inferring completeness from those passing tests.

No additional defect was established in the inspected compaction checkpoint commit/cancellation path, imported-system privilege downgrade, Skill ownership helper, community signature verification, or MCP revoke/unknown-call termination/projection path. This is bounded review coverage, not a proof that no other issue exists.

Reviewed the existing synthetic live provider/vision evidence and real read-only MCP report. Did not repeat paid API requests or access the private credential file. Those reports establish prior Mac Node network calls, not current independent Safari acceptance. The MCP report still explicitly records an unsuccessful browser preflight check. Actual Safari auth/CORS/background behavior, IndexedDB/CryptoKey persistence on Safari, TLS/mDNS/LAN, firmware provenance and real phone/HID outcomes remain outside this agent's acceptance scope.

The implementation owner should fix these three findings, run the five regressions and relevant existing checks, then hand the resulting source to a **new fresh independent reviewer** for R2. This R1 reviewer did not wait for or approve any subsequent fix.
