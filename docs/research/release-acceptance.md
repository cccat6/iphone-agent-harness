# Product acceptance — 2026-10-18

Detailed checklists: [English](../acceptance/README.md) · [简体中文](../acceptance/zh-Hans.md).

Desktop, automated, model-service and C3 transport evidence are separated from phone acceptance. Per the user’s request, no new phone cooperation or product HID action is required for this release pass. A compiled image, transmitted report or synthetic screen is never counted as an observed phone outcome.

| Area | Executed evidence | Remaining boundary |
|---|---|---|
| Web/core | **341/341** full Web tests, zero failed; [verification record](release-verification.json). Fresh [R10](independent-device-identity-r10.md) found no new issue after stable client identity and retained-error fixes | Final GitHub CI correspondence is recorded below; synthetic adapters do not establish iPhone scheduling |
| Contracts | **29/29** schemas/contracts; [validator](../../tools/validate_design_specs.py) | Actual timing and visible phone effects remain separate |
| Firmware software | **67** Core/Admission/RTC/setup scenarios + **12** implementation router cases; preserved R7 **9 + coordinate** regression and fresh R8 **11** independent cases; canonical **6**, artifact fixtures **6** | [R8](independent-firmware-r8.md) found no new issue after R6 wrong-target and R7 cancellation-coordinate fixes. Finite schedules do not establish controller/radio performance |
| Firmware macros | [R8](independent-firmware-r8.md) actually preprocessed all four pinned SDK chains: 2 connections/bonds, MTU23, MSYS1=8; C3/S3/C6 MSYS2=8, original ESP32=0 | Not a four-board physical test; final image/source agreement is a separate gate |
| Models | Real DeepSeek [Skill tool turns](harness-live-results.json), [both-protocol synthetic-image recognition](vision-provider-verification.json), [production Harness/plan workflow](phone-harness-live-verification.json) | Latter device/capture are synthetic. No actual screen/HID, Safari CORS or universal vision quality claim |
| Storage | Native Chrome [nine real isolated IndexedDB checks](desktop-storage-verification.json): migration, pagination, Blob/tool round trip, deletion/reopen/backup restore, two-handle stable client ID | Product Delete UI independently reached confirmation/cancel; no user data permanently deleted. Safari storage/eviction stays a phone boundary |
| UI | Fresh [Web R6](independent-web-r6.md): no new reproducible issue. Root additionally executed [five actual DOM panel cases × eight locales](desktop-panel-localization-verification.json); [R10](independent-device-identity-r10.md) clean after the last component fix | Desktop simulated phone UI is not physical Safari. Eight-language module/selected native flows do not claim every screen in every locale |
| Compatibility | Automated platform/API/classic ES5 gate coverage and native legacy-UA gate→public navigation | UA simulation does not establish physical old-phone behavior |
| MCP | Real [Mac production bridge](mcp-live-verification.json) and native two-origin HTTP fixture initialize/list/authorize/Task call/revoke | Public example’s browser preflight returned403; it is not a Safari success. Server must provide CORS. No stdio/full OAuth hosting |
| C3 transport | Final source `4b4ebc2e…435f8f0`, app `ccead468…afc7971` flashed only to authorized1101 without whole-chip erase. Fresh [production client TLS](device-client-live-verification.json) verifies CA+hostname, identity/capabilities, owner pair, clock and no fabricated target/control | No real HID challenge, lease or phone input. Safari trust/mDNS/public-site→LAN remains phone acceptance |
| RTT | [Finite synthetic latency checks](device-rtt-budget-verification.json): bounded RTT-aware cache avoids repeated handshake budget exhaustion | Not a physical latency benchmark; cold setup, actual polling and BLE excluded |
| Official site/community | Existing real HTTPS page/404/OPTIONS and signed publish/download/immutable revision [verification](deployment-verification.json); disposable test data removed | Final changed-source deployment/all-file hashes and post-deploy native check remain pending below |
| Repository/content | Private [CCCAT6/iphone-agent-harness](https://github.com/cccat6/iphone-agent-harness), homepage igent.cc, eight READMEs, MIT/upstream notices; [content R3](independent-release-content-r3.md) repairs independently reread | Fresh no-new-finding content pass and final push/CI are recorded below |

## Data and runtime boundary

Conversations, image Blobs, installed/private Skills and settings stay in the browser; selected context/images go directly to the configured AI backend. Credentials are memory-only by default or explicitly encrypted locally. A stable public device client ID persists independently of those tokens; it does not grant control. The community database stores only deliberately signed public Skill packages, never private sessions or model keys.

The target is Safari on iOS/iPadOS 27+. Prior iPhone12/iOS27.0.1 capture/background/HID experiments are dated evidence, not acceptance of every new product behavior. Recording/streaming is not unlimited background permission. Codex device-code/refresh/Responses adapters and registered SIWC flow are implemented; actual personal sign-in, entitlement, browser CORS and refresh remain the optional consent-dependent phone check. Static Safari cannot host a loopback listener.

Multi-target registry, two BLE host slots and multiple client grants do not establish simultaneous two-phone throughput. Firmware serves one bounded TLS session at a time, closing each REST response for sequential fairness. No Android/native multitouch/Apple Fn/arbitrary Unicode guarantee is made.

## Physical history

The earlier [physical record](device-physical-verification.json) preserved initial Wi-Fi/TLS allocation failures. It is superseded for connectivity by [CA/DNS TLS](device-tls-verification.json) and final-source [production client](device-client-live-verification.json) evidence. The Mac’s cached-IP lookup preserves the original TLS DNS-name verification; no certificate warning was bypassed. CA/Wi-Fi/owner state survived the final four-part flash. Final Web Serial installation is recorded separately when executed.

## Final release record

- Full Web341, contracts29, host67 + router12, independent R7/R8, canonical6, artifact6: passed as above; source hashes are in the reports.
- Fresh software reviews: WebR6, firmwareR8 and device/UI deltaR10 have no new reproducible issue. Fresh content pass: **release-final verification pending**.
- Final four-profile source/application hashes and strict manifest verification: **release-final verification pending**.
- Final deployed Worker identity, all served asset hashes/routes/API and native Web Serial/USB check: **release-final verification pending**.
- Final commit, private remote synchronization and actual GitHub CI result: **release-final verification pending**.
- Final source/build known-secret scan and document-link reconciliation: **release-final verification pending**. Prior scan399 files/5 known secrets/zero matches is historical; final counts go in [verification record](release-verification.json).

The [phone-only checklist](../acceptance/zh-Hans.md) remains intentionally unchecked until the user is ready. Maintainers own every desktop preparation and diagnosis item.
