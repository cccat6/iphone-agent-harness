# Independent core review R3

Date: 2026-10-18. Fresh independent review after R1/R2 implementation changes. Product implementation was read only. No browser, serial, physical phone, real model request, private credential, commit or deployment was used. New network evidence uses finite synthetic adapters with the real product modules.

Result: **one reproducible new issue; four desired-behavior regressions fail**. Before the new review file, the complete Web suite independently passed **263/263**, including the unchanged R1 and R2 regressions, in approximately 14.3 seconds.

## Reproduce

```sh
node --test tests/web/independent-core-r3.test.mjs
```

At review time: 4 tests, 0 pass, 4 fail. The four cases cover both compatible protocols and both base URLs and complete inference endpoints. Each first successfully obtains a model catalog with the same query configuration, then inspects the URL actually passed by `callModel()` to its network adapter. The tests retain the intended safe behavior and contain no product fix.

## Finding

### P2: inference URL construction moves routing suffixes into query parameters

`apps/web/core/providers.js:78` checks `base.href.endsWith('/'+suffix)` and appends inference suffixes to `root.href` as a string. Since `href` includes the query string, an otherwise valid configured HTTPS URL containing ordinary noncredential parameters loses the expected inference path and corrupts the last parameter value.

An exact minimal trigger is configuring the OpenAI-compatible endpoint as:

```text
https://gateway.invalid/tenant/v1/chat/completions?api-version=2026-01-01
```

The real `callModel()` sends its POST to:

```text
https://gateway.invalid/tenant/v1?api-version=2026-01-01/chat/completions
```

The actual pathname is `/tenant/v1`, and `api-version` is `2026-01-01/chat/completions`. A base URL ending at `/tenant/v1?api-version=...` fails the same way. Anthropic-compatible URLs similarly append `/messages` into the query. With multiple parameters, the last parameter receives the suffix instead.

Impact: an accepted provider configuration requiring API-version or gateway-routing parameters cannot make a correctly routed inference request. The ordinary settings UI accepts and saves these URLs through `safeURL()` and the provider form submit handler in `apps/web/app.js`. This can appear as a confusing model connection failure even after successful model discovery. The reproduction does not claim a real external provider was contacted, credentials crossed origins, or phone input occurred.

`discoverModels()` was checked explicitly for the same root cause. Its generic OpenAI/Anthropic paths (`providers.js:62-63`) use a URL object's `pathname`, so all four synthetic catalog calls retain `/tenant/v1/models` and the exact `api-version` and `route` parameters. Those assertions pass before each inference assertion fails. There is no second discovery finding. The official DeepSeek special catalog route deliberately uses the shared official `/models` URL and was not treated as a generic tenant-query contract.

Expected: build and recognize inference routes through URL path components while preserving legitimate query parameters. A complete inference endpoint with a query should remain that endpoint. Keep the existing complete-endpoint opaque-state isolation. Rejecting all nonsecret query parameters would remove the supported configuration instead of fixing construction.

## Independent coverage and limits

Read README, the R1/R2 reports and regressions, and runtime, execution, model/auth and Skill/community contracts. Traced Harness mode gates and fixed tool availability; complete call groups, terminal tools, error settlement and cancellation cleanup; plan barriers, full preflight, latest-capability checks and receipt uncertainty; DeviceClient identity, credential generations, binding, capability acquisition, lease ownership and release fences; compatible-provider state scope and streamed accumulation; Codex account replacement, token refresh and replay; credential vault separation; context paging, compaction checkpoint commits and image selection/hydration; session import/export and historical-system downgrade; Skill installation, namespaces, authoring CAS and signed community packages; and MCP permission generations, bounded arguments/results and unknown-outcome termination.

The 263-test baseline independently confirms the previous fixes, including Chat's isolation from all device/capture proxies, direct DeviceClient capability acquisition before request admission, full backend endpoint scope, UTF-8 provider argument bounds, and released-state revocation for fresh running/unknown bindings. These passing tests were baseline evidence; the additional endpoint-query cases were constructed afterward from implementation tracing.

No additional reproducible defect was established in the inspected cancellation/cleanup, credential scoping, image-reference binding, import trust, tool sequencing, Skill ownership/signatures or MCP authorization paths. This is bounded review coverage, not an absolute guarantee that those components contain no other bugs. Generic `DeviceCodeAuth` was inspected, but the actual subscription UI uses the separately reviewed Codex account implementation; unused-helper behavior was not promoted to a product defect.

Browser/Safari execution, actual IndexedDB and CryptoKey persistence, CORS/background behavior, official subscription login, LAN HTTPS/mDNS, capture-source/phone association, physical HID/timing/inertia and multi-phone acceptance remain outside this reviewer. The concurrent firmware build and unfinished binaries were not treated as accepted or as defects. Existing live DeepSeek/MCP reports were not rerun or promoted to Safari acceptance. The existing unsuccessful browser MCP preflight remains a limitation.

The implementation owner should fix this finding and run these four unchanged regressions plus relevant existing checks, then use a **fresh independent R4 reviewer**. This R3 reviewer did not implement or approve a subsequent fix.
