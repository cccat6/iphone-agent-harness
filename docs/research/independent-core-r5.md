# Independent core review R5

Date: 2026-10-18. Fresh independent review after R1–R4 and the known MCP query-credential masking change. Product source was read only. No browser, serial connection, phone input, real API request, private credential file, cloud mutation, commit or deployment was used. All new requests used finite synthetic adapters with the actual product modules.

Result: **no new reproducible product issue established within this review's scope**. The final complete Web suite independently passed **293/293**, including six additional R5 regressions, in approximately **19.2 seconds**. The new R5 file also passed **6/6** separately. This is bounded review evidence, not a guarantee that the product has no other bugs.

## Independent work and new regressions

```sh
node --test tests/web/independent-core-r5.test.mjs
npm test
```

The six new cases exercise the local change together with its surrounding boundaries:

- Real Harness `mcp_list_tools` in Chat carries the masked server label and nested schema description into the next model request, durable messages and session export. The editable page-local snapshot still retains the configured URL. The test checks the decoded, URI, component, form and full-endpoint forms of one synthetic credential.
- A completely received successful text response larger than the 64 KB model budget, with credential echoes near the retained-prefix boundary and in annotations, structured content and result metadata, remains a known returned result. Its bounded ordered projection contains no configured secret, explicitly records omitted structured content, fits the envelope budget and performs exactly one remote call.
- Reconfiguring a server during a dispatched call produces an uncertain outcome, discards its late credential-bearing reply, clears the old grants and denies another call before dispatch. It does not expose old metadata or silently transfer permission to the replacement configuration.
- Cancelling the real Harness during an MCP mutation records exactly one durable unknown result for that call and one not-executed result for the dependent call, ignores a late secret-bearing response, makes no next model call and releases the local run lock. The test expects the existing `status:'cancelled'` rejection contract.
- OpenAI-compatible and Anthropic-compatible HTTP failures each retain the stable discovery/inference error code, numeric status and `(HTTP 429)` suffix, without including the synthetic remote error body. These tests cover the error-presentation change without modifying routing.

No product fix is included. R1–R4 and the six original MCP secret-boundary tests were not modified. The R5 cancellation test initially expected a successful resolved run; source inspection and the existing cancellation contract established that a cancelled run correctly rejects. That test expectation was corrected before the final 293-test passing run; this was not a product finding.

## Source tracing and retained guarantees

Read README, all four prior independent reports and their raw regressions, and the MCP, model/auth, runtime, execution and device-client contracts. The fresh source review concentrated on `core/mcp.js`, `core/harness.js`, `core/providers.js`, `core/control.js`, `core/http.js`, `core/store.js`, the MCP settings wiring and the new error-catalog entries.

Traced configured-secret collection through exact-literal escaping, longest-first masking, schema/catalog admission, server labels, nested result keys/values, bounded text projection, Harness tool-result settlement, subsequent context preparation and session export. The current identity checks reject known secrets in tool names, local server IDs and schema property/reference identities before an allowlist is established. The new tests exercise metadata and result persistence independently of the original six regressions. Ordinary routing query values remain supported by the unchanged public-query regression.

Traced configuration generations, discovery revocation, selected-tool enablement, direct Chat/Plan denial, the pre-dispatch microtask recheck, post-dispatch uncertainty, cancellation races and dependent-batch termination. Remote metadata and read-only annotations do not add executable tool names or authorize Task operations. Transport cleanup and the existing reader-cancellation, stalled SSE, UTF-8 and 2 MB tests remain in the passing suite. The HTTP error presentation preserves the existing provider URL construction and opaque-state scoping; unchanged R3/query-scope tests pass.

The full suite also retains the earlier independent fixes: same-origin tenant-path opaque-state isolation, provider tool/state capacity and split-surrogate UTF-8 boundaries, stale released-state revocation, complete-plan capability rechecks, Chat independence from device/capture adapters, direct DeviceClient capability acquisition, query-aware inference routing, native-fetch receivers, context checkpoint atomicity, tool-group settlement, Skill ownership/CAS/signatures and the local SQLite community backend. These passing tests are regression evidence; R5 did not reimplement or claim a new exhaustive review of every component.

## Limits

Known-configuration masking is not arbitrary DLP. It covers the configured bearer, endpoint and recognized credential-query values and the explicitly collected encodings. It does not establish detection of unrelated secrets, every possible query-name convention, arbitrary encodings or all remote sensitive data. The trusted editable `getSnapshot().url` retaining query authentication is intentional; the reviewed model/history paths use the bounded masked projections.

No current browser/Safari acceptance, Safari IndexedDB/CryptoKey persistence, CORS/background behavior, real subscription sign-in/refresh, public-HTTPS-to-LAN connectivity, TLS/mDNS, screenshot-source/phone association, physical HID/timing/inertia or multi-phone isolation was established here. No live DeepSeek/MCP request was repeated or promoted to Safari acceptance. Concurrent firmware optimization and unfinished binaries were outside this review, and were treated as unverified work rather than defects or acceptance evidence. The separate Web reviewer owns the latest browser and dynamic-localization checks.

**This round found no new reproducible issue in the inspected paths.** The local MCP fix and its authorization/projection/cancellation chain have independent synthetic evidence; the physical and browser boundaries still require their own direct evidence.
