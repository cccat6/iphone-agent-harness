# Independent core review R2

Date: 2026-10-18. Fresh independent review after the R1 fixes. Product implementation was not modified. No browser, serial, phone input, deployment, real API credential or paid model request was used.

Result: **two reproducible new issues; two new desired-behavior regressions fail**. The existing Web suite, including R1's five unchanged regressions and the newer provider/request-memory tests, independently passed **254/254** before adding R2 tests.

## Reproduce

```sh
node --test tests/web/independent-core-r2.test.mjs
```

At this review: 2 tests, 0 pass, 2 fail. These tests use real Harness, memory store and DeviceClient modules with finite synthetic network adapters. They intentionally express the safe expected behavior and contain no product fix.

## Findings

### P2: a previously configured offline bridge blocks unrelated Chat

`apps/web/core/harness.js:98` unconditionally awaits the live device context before every model request, including Chat. The product's `deviceContext()` at `apps/web/app.js:229-233` forwards the lookup to the selected DeviceClient in every mode. The `mode !== 'chat'` condition at Harness line 89 skips only the initial runtime message; it does not skip this later lookup.

Minimal ordinary trigger: complete the device onboarding, leave that bridge selected, let its network become unavailable, switch to Chat and send a text-only question. DeviceClient attempts the board identity/binding/capabilities path; the HTTPS error fails the run before the first model call. Having no selected bridge allows the same Chat to work.

The first regression restores a synthetic DeviceClient credential, makes the mock board transport throw a network error, and connects `getContext` through the same DeviceClient call as the app. The real Chat run rejects with `Device HTTPS connection failed...`; the model invocation count remains zero. No phone operation or physical-input tool is requested.

Impact: normal text questions, local Skill authoring and other Chat operations become unavailable solely because a phone bridge is offline. Chat needs no live phone state and must not inherit that hardware prerequisite. Do not fix this by granting phone tools or manufacturing verified device state.

### P2: direct DeviceClient submission mistakes an unqueried capability cache for legacy firmware

`apps/web/core/device.js:81` falls back to 98,304 bytes when `#caps` is absent. `submitSegment()` at line 82 ensures binding and lease, but does not obtain capabilities. `claimLease()` also does not obtain them. Therefore the public `claimLease() -> submitSegment()` path can submit a body above the constrained firmware's advertised 8,192-byte limit without ever requesting `/v1/capabilities`.

The second regression restores a synthetic client, claims a valid released lease, builds and hashes one complete 200-event pointer segment, and calls the real `submitSegment()`. Its body exceeds 8,192 bytes but remains below the host's general limit. The mock capability route advertises 8,192 bytes if queried. It is never queried; the segment POST occurs and is accepted by the finite mock, so the expected early `DEVICE_REQUEST_TOO_LARGE` rejection is absent.

Impact: the independently exposed adapter bypasses the new memory admission guard when its normal execution-context helper has not populated the cache. A real constrained board must then reject the oversized request; the client unnecessarily sends it and changes its input state/segment bookkeeping before discovering rejection. This review does **not** claim that the current Harness path, which reads capabilities, sends this oversized segment, or that a real board executed it.

Expected: obtain current capabilities before independent segment admission when none have been fetched; preserve the legacy fallback only for a successfully read older capability report lacking that field. Continue checking the actual body before and after asynchronous hashing.

## Independent coverage and limits

Read README, runtime/context, execution, model/auth, MCP, device-client, Skill and community architecture documents, plus the R1 report and its five regressions. Traced the real implementations across Harness tool dispatch/terminal handling, cancellation and late promises, run/session ownership, compaction checkpoint commit and image projection, compatible-provider opaque state and capacity, Codex account replacement/refresh/state replay, credential storage, session import/export, local Skill pinning and ownership, signed community validation, MCP authorization generations/result projection, full-plan compilation and DeviceClient leases/receipts.

Executed the complete pre-R2 Web suite: **254 passed, 0 failed**, approximately 14.2 seconds. That includes actual cryptography and SQLite community tests, both provider protocols and response modes, R1 path-scope/stream/input-state regressions, MCP cancellation/unknown outcomes, and cross-module 8KB plan admission. Passing these was used as baseline evidence, not as proof of exhaustive correctness; the two additional R2 scenarios were independently constructed afterward.

A synthetic mutable-context probe also demonstrated that `phone_observe` can report a different target ID from its persisted frame if an injected trusted context changes during capture. It is **not accepted as a product finding** in this review: the real onboarding UI forbids same-page rebinding while a run is busy, and no reachable alternate mutation path was independently established. The exploratory probe was removed from the retained test file. No claim of cross-phone execution follows from it.

No additional reproducible issue was established in the inspected cancellation settlement, compaction commit, imported-system downgrade, Skill ownership/CAS, community signature, MCP revoke/unknown-termination or ordered-text-prefix projection paths. This is bounded coverage, not a proof that those components have no further bugs.

Real Safari/IndexedDB/CryptoKey, CORS, local-network HTTPS/mDNS, Codex sign-in/refresh, firmware TLS heap, physical HID/timing/inertia, screenshot-source/phone association and multi-phone acceptance remain outside this agent's validation. The firmware was being rebuilt concurrently; no unfinished binary was treated as accepted. Existing live DeepSeek and MCP reports were not rerun, and a previously reported unsuccessful MCP browser preflight was not promoted to Safari success.

Fix these findings and run their regressions and relevant existing checks, then hand the resulting implementation to a new fresh R3 reviewer. This R2 reviewer did not implement or approve subsequent fixes.
