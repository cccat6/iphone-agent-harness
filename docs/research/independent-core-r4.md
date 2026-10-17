# Independent core review R4

Date: 2026-10-18. Fresh independent review after R1/R2/R3 fixes and the separately discovered native-fetch receiver fix. Product implementation was read only. No browser, serial connection, phone input, real model request, credential file, cloud mutation, commit or deployment was used. The new checks use finite synthetic streams and trusted-state mocks with actual product modules.

Result: **no new reproducible product issue established within this review's scope**. The complete pre-R4 Web suite independently passed **275/275** in approximately 12.6 seconds. Five additional independently constructed boundary regressions pass **5/5**. This is bounded review evidence, not a guarantee that the product has no other bugs.

## Additional reproductions

```sh
node --test tests/web/independent-core-r4.test.mjs
```

The retained five tests check two boundaries beyond simply rerunning the previous findings:

- OpenAI and Anthropic tool arguments whose reconstructed JSON is exactly 64,000 UTF-8 bytes remain accepted when one Unicode surrogate pair is split between complete SSE events. Adding a three-byte character above that boundary rejects with `PROVIDER_RESPONSE_LIMIT`, for both protocols. These cases exercise the incrementally maintained byte counts at their acceptance and rejection edges, including escaped lone-surrogate fragments that later form one valid character.
- After initial full-plan validation and asynchronous hashing, a fresh trusted capability report removes a later Home operation while leaving the first Tap permitted. The actual executor rejects the whole batch before the first segment submission and marks the later step skipped. No release or receipt query is manufactured before a dispatch occurred.

No product fix is included. R1/R2/R3 regression files and their desired-behavior expectations were not edited. The known browser-fetch receiver issue was not counted as a new R4 finding; the current four receiver regressions were included in the passing baseline.

## Independent source coverage

Read README, all three prior independent reports and their raw regressions, and runtime, model/auth, device-client, execution, MCP and Skill/community contracts. Traced:

- Harness synchronous run reservation, persistent session ownership, mode-specific fixed tools, Chat isolation, terminal tool batches, durable result settlement, cancellation, heartbeat and run cleanup. Local Skill authoring and external/physical mutations retain distinct uncertainty semantics.
- Context pagination and contiguous sequence checks, complete tool groups, imported/historical-system downgrade, latest-user anchoring, model/extractive summaries, checkpoint commit after successful complete reads, cancellation, image-selection boundaries and final-only attachment hydration.
- API credential separation, encrypted local vault helpers, provider/model selection, complete inference URL construction and query-aware opaque scopes, provider stream completion, cumulative UTF-8 tool/state bounds and duplicate identities. Codex official endpoint restrictions, login/identity checks, refresh generation/account binding, cancellation, terminal Responses admission and opaque replay consistency were inspected independently.
- Session export/import reconstruction, local attachment storage, search's exclusion of opaque state, built-in Skill namespace restoration, downloaded Skill namespaces and bounded/hash-checked resource reads. Authored creation/update use identity ownership and atomic creation/digest CAS; identity backup restores verify key pairing.
- Community package/schema limits, canonical signatures, creator namespaces and publication revision/digest checks. The Worker admission and conditional immutable revision insert were read; existing tests exercised actual local cryptography and SQLite. No live community publication was performed.
- MCP configuration generations, per-tool user authorization, Task-only dispatch, bounded remote schema traversal, post-dispatch unknown outcomes and Harness termination, ordered bounded text projections, redaction and stream cleanup. No live server call was repeated.
- Plan schema and held-gesture compilation, full JSON-envelope byte preflight, current capability rechecks across hashing, receipt reconciliation without resend, observation barriers, failure/cancellation release fences, and DeviceClient identity/binding/capability/lease/receipt lifecycle. Firmware source was read only to corroborate advertised 40ms reports/request limits and independent busy/lease/hash admission; unfinished firmware binaries were not assessed.

The baseline includes all unchanged prior findings, provider URL/byte tests, native-fetch receiver tests, and current JSON Skill download normalization tests. Passing those tests was used as baseline evidence; the source tracing and five new boundary tests above constitute the independent R4 work.

## Limits

This reviewer did not establish current browser/Safari acceptance, IndexedDB/CryptoKey behavior on Safari, CORS/background execution, actual subscription login/refresh, LAN HTTPS/mDNS, screenshot-source/phone association, physical HID/timing/inertia or multi-phone isolation. The separate browser reviewer owns browser work; no browser surface was opened here. Existing real DeepSeek and MCP evidence was not rerun or promoted to Safari success. Concurrent firmware optimization and incomplete artifacts were treated as unverified work, not as either acceptance or a new defect.

No additional reproducible issue was established in the inspected paths. Further physical and browser acceptance still needs its own direct evidence.
