# Independent Web Acceptance R3 — 2026-10-18

Fresh independent review of the existing `build/site` Web candidate, using native Chrome accessibility and screenshots. README, R1/R2 and the Web, legacy, MCP and device UI/client documents were read first. The reviewer did not change implementation, rebuild, commit, deploy, open serial/USB, contact a board or operate a phone. Root kept this candidate unchanged during browser acceptance; source changes reported later are deliberately not treated as repaired-build acceptance.

## Finding

### R3-WEB-01 · P2 · Localized UI retains untranslated dynamic status and model accessibility names

Three related reproducible omissions remain in the reviewed candidate:

1. Open Settings in English, then choose Español in the language selector. Headings, form labels, buttons and context-budget validation switch to Spanish, but the live storage estimate remains `Used 0.2 MB · estimated limit 10240.2 MB · Best-effort storage`. Closing and reopening Settings produces `Usado 0.2 MB · límite estimado 10240.2 MB · Almacenamiento estándar`, confirming the estimate has a valid translation which is not refreshed on locale change.
2. On a fresh English Harness fixture, open Settings → Add account; use a fake name/key, a manual model ID and the loopback mock base URL `http://127.0.0.1:18862/qa-models`. Get models returns two valid models. Save, reopen Edit and change the URL to `http://127.0.0.1:18862/qa-missing`; Get models correctly reports HTTP 404 and preserves the manual ID, but displays `Could not complete: 模型目录返回 HTTP 404；可检查权限、CORS 或手动填写模型 You can enter a model ID manually.` English users receive the substantive error in Chinese.
3. In English and Spanish composer accessibility trees, the model selector retains accessible name `模型`. With no configured account it also retains help/title `选择模型与账号`. The visible placeholder is correctly localized, so the unlocalized accessible name is easy to miss visually.

**Expected and impact:** Selected-language status/error text and accessibility names should stay in the selected language. The model-directory failure is an important recovery path; its untranslated explanation is inaccessible to users who cannot read Chinese. Storage estimates also should update without closing the panel.

**Locations in reviewed source:** `apps/web/app.js`, `renderStorage()`, locale `subscribe()` callback, `renderModelOptions()` and model-change handler; `apps/web/index.html`, `#model-select` with `data-no-i18n`; `apps/web/core/providers.js`, `discoverModels()` HTTP-error construction. The broad no-i18n exemption protects user model names but also excludes the selector's UI-owned aria-label/title.

**Evidence:** Native CUA AX snapshots in this review show each exact string above; a second Settings opening changes only the estimate's language, confirming the missing refresh. The successful two-model directory and failing HTTP 404 are actual loopback HTTP responses, not injected model-directory functions.

**Disposition:** Root was notified during R3 and reported source repairs for all three paths plus focused tests. Those repairs were not rebuilt or independently browser-retested in this pass. A fresh R4 must verify the rebuilt candidate and continue the requested new-finding loop.

## Previous repair checks

| Earlier issue | R3 result |
| --- | --- |
| Modal toast visual stacking and accessibility | Invalid trigger=12000, target=8000, reserve=4000 produces clear foreground English toast and AX text while Save stays focused. Immediate combined AX+screenshot captured both. Unlock success is also in the modal AX tree. |
| Context-budget error locale | English and Español validation errors are correctly translated. All-eight coverage is resource/test evidence, not eight complete browser walkthroughs. |
| URL JSON Skill normalization and forced readonly ownership | Current-build direct module reproduction checks `content`, `instructions`, `body`, extensionless JSON content-type and forged authored metadata. All yield the actual instruction text with community/readonly ownership and no forged creator ID. |
| Native fetch receiver | Real Chrome MCP HTTP chain passes. Community GET, DeviceClient TLS attempt to loopback and DeviceCodeAuth preflight/POST reach the network layer; failures are expected fixture/protocol failures, with no Illegal invocation. No real authentication or device acceptance is inferred. |

## Additional browser coverage

| Area | Observed result |
| --- | --- |
| Desktop root/public community | `/` replaced by `/main`; community renders ten built-ins with truthful no-backend state and separate advanced endpoint configuration. No production community publication. |
| Creator identity | Fresh isolated identity encrypted and downloaded as a 735-byte JSON; exact file selected through native picker; explicit restore confirmation; success AX toast; creator ID unchanged after round trip. Only the disposable test identity was involved. |
| Owned Skill | Created `Independent R3 Skill` / `qa-r3-skill`, verified owner namespace and Edit control. Edited title; version 1.0.0 → 1.0.1; slug is readonly. |
| Skill text safety | Viewer shows `<script>alert(1)</script>` literally in body, with no alert execution. |
| Skill sharing/readonly | Built-in cards expose no Edit. Self-authored sharing has Export only and truthful no-community notice. Test Skill export file was created. Native import picker was attempted but cancelled after a file-picker automation issue; no new browser import-completion claim is made. R1 import evidence and automated ownership coverage remain separate. |
| Sessions | Created A and B; renamed A; typed distinct draft A/B; switching restores A only. Archive removes A from ordinary list; archive list contains A; Unarchive removes it from archive and reopening/reload shows A in ordinary list. |
| Local persistence | Reload retains named session and fake provider/model directory. Draft refresh persistence is not claimed. |
| Models | Actual loopback model directory returns qa-r3-alpha / qa-r3-beta. Manual qa-r3-manual is retained as default and included alongside the two discovered models. Failing 404 preserves manual model and produces no invented successful directory. Finding above concerns its language. |
| Credential vault | Fake API key encrypted with fake test passphrase, then reload visibly shows stored-but-locked. Explicit unlock clears passphrase field and gives accessible success toast. No real account or key used. Browser password-manager save prompt was declined. |
| Settings | Storage estimate is truthful. Invalid context budgets rejected. Locale selector exposes all eight configured choices; English/Spanish UI and errors exercised live. Storage locale omission reported above. |
| MCP native HTTP/CORS | Separate origins 18861→18863; server logs confirm OPTIONS plus initialize, notifications/initialized, tools/list and exactly one tools/call. Session/protocol headers and fake bearer validated server-side. Connect yields zero authorized tools; selection alone still zero; explicit enable exposes echo only; Chat rejects; Task echo returns expected text; revoke restores zero; revoked call rejected locally with no additional POST. |
| Legacy | Current-build index/bootstrap with isolated old Safari capability fixture. Root exposes only compatibility gate. Esc + Tab retain gate and homepage-button focus. Clicking homepage changes actual URL to `/main`; links then reach readable `/skills` and `/flash` fallback pages with no functional install/Skill controls. |

## Automated verification and snapshot boundary

- Direct `node --test tests/web/*.test.mjs`, without pretest/build: **282 tests, 280 passed, 2 failed**. Failures were the two concurrently introduced `mcp-secret-boundary.test.mjs` regressions. Log: `/tmp/independent-web-r3-tests.txt`. Root explained the source was concurrently under repair and subsequently reported passing retests; R3 does not convert that statement into independent all-green evidence. Fresh core acceptance owns those repairs.
- Direct focused Skill-download/fetch-receiver/i18n rerun: **13 passed** (`/tmp/independent-web-r3-targeted.txt`). Some source locale repairs had arrived by then, so this is source-test evidence, distinct from the unchanged browser candidate and not the final source/build consistency check.
- Direct reproduction imports the reviewed `build/site/core/skills.js`, so the earlier Skill-download repair is also checked against the actual browser candidate.
- Repository Git status was unavailable through the system Git because of an outstanding local Xcode license requirement. No license was accepted and no commit operation attempted.

## Isolation, limits and cleanup

All browser actions used a single reviewer-created Chrome tab and unique loopback origins: desktop 18861, explicit phone-UI fixture 18862, cross-origin HTTP MCP mock 18863, legacy fixture 18864. The phone fixture injects a labelled test UA before production scripts; this is not real Safari, a production UA bypass, capture evidence or device readiness. Fake provider/key/passphrase and clearly named test records remain only at the isolated origins. Exported test files are disposable local artifacts; no unrelated user records were removed.

The session export/import/delete/search/pin/pagination UI, real image capture, all-screen/all-language visual review, physical Safari keyboard/viewport/background behavior, actual Codex subscription authorization/refresh, live provider CORS/generation, public community publication, USB flashing/setup, TLS trust, provisioning, HID proof/control and multi-phone isolation are not independently accepted here. Existing automated tests cover portions of those contracts; they are not physical or browser end-to-end proof. Real model service, external MCP mutations, accounts, production community and hardware were not contacted.

One new actionable finding group was reported. R3 is complete as a finding-bearing independent review, not clean final acceptance. Root's source repair must be rebuilt and reviewed afresh. No absolute bug-free guarantee is made.

Cleanup verified: the one reviewer-created Chrome tab was closed, returning to the pre-existing unrelated tab. Both fixture-server processes stopped; socket probes confirm 18861, 18862, 18863 and 18864 are all closed. The disposable local identity and Skill exports were retained as evidence; no user's unrelated data was deleted.
