# Independent Web Acceptance R2 — 2026-10-18

Fresh independent reviewer, native Chrome accessibility and screenshots, current `build/site` on loopback. The reviewer read README, R1 findings and the web/MCP/legacy/device UI architecture documents before testing. No production implementation, firmware, deployed site, existing user records, serial port, USB or physical phone was changed by this reviewer. Root supplied a replacement web build after the findings below; those targeted repairs were then retested in the same review. A fresh R3 remains necessary for the requested independent clean-pass loop.

## Findings and disposition

### R2-WEB-01 · P1 · Class transports cannot call native browser fetch

Before the repair, the default `createMCPAccess()` connected to the live loopback HTTP mock failed immediately with `MCP_CONNECTION_FAILED`. A direct `MCPClient.initialize()` diagnostic exposed `TypeError: Illegal invocation` at `core/mcp.js:19:66`. No OPTIONS or POST reached the mock. The constructor stored native `fetch` in `this.fetchImpl`, then invoked it as an instance method, giving the browser WebIDL function a non-Window receiver. Node's native fetch and injected arrow mocks do not enforce this receiver check.

The same default receiver pattern appeared in `community/client.js:5`, `core/device.js:36` and `core/auth.js:5`. Independent native diagnostics showed COMMUNITY_UNREACHABLE, DEVICE_TLS_OR_NETWORK_ERROR and `Failed to execute 'fetch' on 'Window': Illegal invocation`, respectively, with no corresponding fixture requests. The DeviceClient test used only the fixture address `https://127.0.0.1:18853`; it did not contact a board. This affects community requests and device onboarding as well as MCP, so its scope is more serious than one optional endpoint failing.

**Root repair:** invoke these transports with the global receiver. **Independent retest:** production `createMCPAccess()` using default native fetch completed the cross-origin HTTP chain below. Four browser-style receiver regression tests also passed. Full real board HTTPS and production account OAuth are still outside this pass.

### R2-WEB-02 · P2 · Modal toast remained absent from accessibility tree

The R1 Popover repair made the invalid context-budget error visually clear above the settings dialog. However, after clicking Save with trigger=12000, target=8000, reserve=4000, native Chrome reported no AX change and exposed no error text. The global Popover was still outside the modal's accessible DOM subtree.

**Root repair:** move the unique toast into the active dialog before showing it, retaining the Popover rendering and live-region properties. **Independent retest:** the same invalid combination produced crisp foreground text and AX text `The compaction target plus response reserve must be below the trigger threshold.` while Save remained focused. Passed visually and through the native accessibility tree; no screen-reader speech claim is made.

### R2-WEB-03 · P2 · Context validation ignored selected language

English Settings emitted the Chinese context-budget error above. The literal was absent from the error localization catalog.

**Root repair:** add the literal and CONTEXT_BUDGET_INVALID to the eight-language error catalog. **Independent retest:** English error appeared in both screenshot and AX tree. Locale tests passed; all eight versions of this specific error were not individually clicked in the browser.

## R1 fixes independently checked

- R1-WEB-01 visual obstruction: confirmed fixed on the initial R2 build; the additional accessible-DOM issue was then found and repaired as R2-WEB-02.
- R1-WEB-02 JSON Skill downloads: four focused tests passed for content/instructions/body extraction, extensionless JSON media types, wrong identity/invalid body rejection, Markdown preservation and forced community readonly provenance. The source was inspected. No new browser catalog-install test was completed in R2, so this is a focused functional regression result rather than a new full UI import/export acceptance claim.

## Real browser HTTP MCP integration

`tests/browser/independent-web-r2-server.py` binds only loopback: candidate page at 18851, phone-UI simulation at 18852, mock MCP service at 18853. `tests/browser/mcp-http-r2.html` imports the candidate's real access manager with no fetch injection. The mock service provides actual CORS responses and checks fake-token auth, exposed MCP-Session-Id and negotiated MCP-Protocol-Version. No external server, real token or model is used.

Native Chrome displayed PASS after the repair:

```text
initialize + initialized + tools/list: OK
initial authorized count: 0
selected while disabled count: 0
enabled authorized tools: echo
Chat call blocked: MCP_MODE_NOT_ALLOWED
Task HTTP echo: independent-r2-readonly-echo
after revoke authorized count: 0
revoked call blocked: MCP_NOT_CONFIGURED
```

The actual server log (`build/independent-web-r2/http.log`, local generated evidence) records OPTIONS with Origin `http://127.0.0.1:18851` and authorization/content-type request headers, then exactly initialize, notifications/initialized, tools/list and one tools/call. The last three carried `r2-session`, `2025-11-25` and the expected fake auth. The preauthorization Chat call and revoked call caused no tools/call. This establishes browser CORS + protocol integration with a real HTTP mock, not interoperability with a third-party MCP provider. The previously observed Cloudflare docs MCP Origin policy restriction remains unaccepted for Safari.

## Additional native browser coverage

| Feature | This pass observed |
| --- | --- |
| Desktop default | `/` replaced by `/main`, modern project homepage visible, no Harness control entry. |
| Public navigation | Actual homepage → `/skills` → `/flash`, correct URLs and content; community had ten bundled entries and truthful unconfigured-service notice. |
| Firmware preparation | C3 diagnostic scaffold manifest and not-opened-USB state displayed. Install/read-setup buttons were not clicked. This does not accept the final firmware. |
| Supported-phone UI fixture | Explicit test-only iPhone/Safari 27 UA served at isolated origin 18852; real candidate app and store loaded, no production bypass. This is desktop Chrome UI evidence only. |
| Sessions | Created and renamed `Independent R2 disposable session`, archived it, confirmed absent from active list and present in archive. Refreshed and confirmed active list still empty. Restore/export/delete were not completed in this pass. The record remains solely at its isolated test origin. |
| Context controls | Actual invalid 12000/8000/4000 rejected; final error visible, accessible and English. No invalid settings persisted. |

The first fixture startup briefly fell back to simplified pages because this reviewer's Python server used the default backlog and Chrome saw connection resets for parallel modules. Increasing the fixture backlog to 128 resolved it. This was a test-server defect, not a product finding. Native input paste into a numeric field also failed once; the value was subsequently entered with native digit typing and verified before asserting any product behavior.

## Automated checks rerun without pretest or rebuild

- 17 passed: bootstrap, MCP UI, routing, Skill download.
- 26 passed: Skill download, MCP access enforcement/streaming/revocation, independent Core R2 cases.
- 8 passed after root's repair: four fetch-receiver regressions and four i18n tests.
- Candidate JavaScript syntax checks completed without reported syntax errors.

These checks do not establish physical phone control, firmware behavior or all UI branches.

## Uncovered and handoff

Eight-language manual/automatic selector was covered in R1, not repeated end to end in R2. Owned Skill creation/edit/disable/export/import, identity restore/publication, provider discovery/vault, legacy focus gate, MCP settings editing and device-panel state machine were not newly completed here; carry their prior precise scope forward rather than label them newly passed. Real Safari 27, viewport/keyboard, capture/background, subscription login/refresh, actual HTTPS board identity/pairing/challenge/control, multi-target isolation and final firmware remain separate acceptance work. No real model calls were repeated.

R2 found three actionable issues. Root repaired all three and the targeted native retests above passed. R2 is therefore **not a fresh zero-finding round**. Root should launch R3 against the final web build. The reviewer-created tab and three loopback listeners are closed/stopped at completion; existing user tabs and data are preserved.
