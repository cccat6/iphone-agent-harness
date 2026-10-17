# Independent Web Acceptance R6 — 2026-10-18

Fresh independent native Chrome acceptance of the frozen built candidate after root confirmed its build complete. Read the acceptance checklist and R1–R5 reports first. No product implementation edits, build, deployment, commit, phone, serial, USB, real credential, personal OAuth or paid API access occurred. The reviewer created only loopback fixtures and this report.

## Result

**No new reproducible product issue was found in the exercised scope. R5-WEB-01 is independently closed for the tested native UI paths and eight-language built-module status contracts.** This is scoped desktop acceptance, not an absolute bug-free or physical-phone claim.

## Native repair verification

| Area | Exact observed result |
| --- | --- |
| Existing model error follows locale | On isolated phone-UI origin 18932, open English Settings/account editor and request actual loopback `/qa-missing/models`. HTTP 404 produces the English full error and manual fallback. Without another request or closing the editor, change to Español: full error and fallback immediately become Spanish with HTTP 404 retained. Native AX verifies the complete sentence. |
| Existing success follows locale | Change endpoint to actual `/qa-models/models`, receive two returned models in Spanish. Change to Japanese with editor still open: count status and returned-model placeholder both become Japanese. Manual ID `qa-r6-manual-unsaved` and masked unsaved fake key remain. Screenshot confirms the Japanese status, model ID and secret field together. |
| Dynamic guidance | Vision help, vault help and unlock guidance follow Spanish/Japanese changes in the same open editor. No model request was required to translate the already displayed success. |
| Fake vault reload/unlock | Save the fake-only API key with disposable passphrase. Reload displays `Encrypted credentials saved; unlock to use`. Wrong explicit passphrase produces English `Unable to unlock. Check the passphrase and account type.` Correct passphrase produces `Credentials unlocked in page memory.` and clears the field. No real key used. |

## Sessions and local content

| Area | Exact native UI coverage |
| --- | --- |
| Session creation/title/pin/mode | Create A, rename to `R6 session A 设置`, choose Plan, pin. Sidebar shows title, Pinned, Plan. Create B. |
| Draft isolation | A draft `R6 draft A 设置` and B draft `R6 draft B 查看` remain distinct when switching in the same page. No unsent-draft reload recovery claim. |
| Search | Unique nonexistent query shows `No matching sessions.` Clearing it restores both sessions. |
| Real export | Export A downloads `/Users/yitao/Downloads/session-fdd4f81e-2c8e-4346-a645-e1d45f93da20.json` (409 bytes). Inspected file is `iah-session` v2, exact original title, Plan, model/account ID, pinned true, archived false, no credentials, empty messages. |
| Exact file import | Through the actual native file picker, select that same newly downloaded file. Separate `R6 session A 设置 (imported)` session opens with Plan and original selected model. Original A remains pinned in sidebar. The system suffix is English; original Chinese user title stays intact. |
| Archive/restore | Archive imported copy: absent from activity list, present in archive. Choose Unarchive: archive becomes empty. Return to sessions: imported copy appears again beside original and B. |
| Delete protection | Click Delete on the imported copy: native confirmation explicitly says deletion cannot be undone. Cancel leaves the copy present. Permanent confirmation was not executed; deletion itself is not newly accepted here. |
| Bundled ownership | All ten bundled Skills expose `Bundled · read-only` and View/Disable/Share/Remove, with no Edit. |
| Own authoring/edit | Create own `设置`, slug `qa-r6-native`, description `查看`. Viewer displays literal `<script>alert(1)</script>` instruction text without execution. Own card/view expose Edit. Edit form retains title/body and readonly slug. Save increments 1.0.0 to 1.0.1. Chinese user title/description remain unchanged in English UI. |

## Built-module fixtures observed through native browser

The independent fixture at `/qa-contracts` imports the actual frozen `/i18n.js`, `/ui/localized-status.js`, error catalog, store, identity, auth and Skill modules. It does not replace production UI; disposable memory stores/fake values are clearly identified. Native AX displayed PASS and full per-language output.

- For all eight locales (`en`, `zh-Hans`, `zh-Hant`, `ja`, `ru`, `de`, `fr`, `es`), bound HTTP404+fallback, loading and fetched-count text recompute to that locale. A user input `设置` remains unchanged. Native app flows above additionally prove the application wires error/success to that mechanism.
- Localized import suffixes retain original title `设置`; historical imported system role becomes user with sourceRole and internal flags. Foreign catalog metadata remains original even when claiming builtin provenance and colliding with a built-in ID.
- Native WebCrypto P-256 identity encrypted roundtrip returns same creator ID and rejects wrong passphrase. Fake vault encrypted roundtrip rejects wrong passphrase.
- JSON Skill content/instructions/body normalization returns literal instructions and does not preserve forged authored provenance.

These are module contracts in an actual browser, not eight complete screen walkthroughs or native identity-file picker acceptance.

## HTTP MCP, navigation and compatibility

| Area | Observed result |
| --- | --- |
| Two-origin HTTP MCP | Production `createMCPAccess()` with native fetch, page 18931 to mock 18933. Actual CORS preflight and initialize→initialized→tools/list passed. Fake bearer/session/protocol headers validated server-side. Initially zero authorized; selected while disabled zero; explicitly enabled echo only; Chat blocked with MCP_MODE_NOT_ALLOWED; exactly one Task readonly echo returns expected string; disconnect clears grants and revoked call fails locally MCP_NOT_CONFIGURED. HTTP log retained. No external server/mutation. |
| Public desktop routing | Actual desktop UA `/` replaces URL with `/main`. Home→Skills→Flash changes real routes. Pages expose no session composer, device controls or Harness launch. Skills shows ten entries and truthful no-backend notice. |
| Desktop flash display | Firmware profile loads ESP32-C3/scaffold metadata and explicitly `Ready. No USB port has been opened.` No install or setup-read action clicked. Root separately owns pending final manifest/firmware replacement; this is page behavior only. |
| Mandatory compatibility gate | Old-Safari/missing-API isolated fixture 18934 shows only unavailable-Harness gate. Escape then Tab retains the gate and homepage-button focus. Click changes actual URL to `/main`. Simplified `/skills` is readable without local Skill action controls; `/flash` explains current Web Serial browser requirement and exposes no install control. |

## Frozen snapshot

SHA-256 before and after native review unchanged:

```text
build/site/app.js                  c895296cdfc21142fb1d22bdab682bfd8144fbe5d11443c30947cafc27b96a45
build/site/i18n.js                 1416ecceab48916ea16b89ec78fad7dd7fdefcbedb08791e54eb676c251a6fd4
build/site/ui/localized-status.js  7e6f48091db023c3e51726943e1c5352799629d2eb00f7791f6d20160f87931f
build/site/core/store.js           1036626339091ae3208df198e01208de80876f4040baf11708fab7db52010af7
```

No source test suite rerun in this round; root owns its reported 331/331 result. Evidence files: `build/independent-web-r6/server.py`, `contracts.html`, `http.log`; native CUA AX/screenshot transcript; exact downloaded session JSON above.

## Limits and cleanup

Phone UI and legacy fixtures change UA/missing API only in explicitly isolated loopback origins before loading actual candidate assets. This is desktop Chrome evidence, not Safari/iOS capture/keyboard/background/storage reliability. Real generation/vision/Codex login, real community publication, real third-party MCP browser compatibility, screenshots/attachments/pagination, runtime cancellation, provisioning/TLS/pairing/HID/multi-phone and final Web Serial/firmware acceptance remain separate prior reports or deferred gates. Permanent native session deletion and full all-screen eight-language walkthroughs were not completed.

All proposed ports were checked unused before server startup; user wildcard port 18872 was untouched. Only reviewer tab was opened and later closed; native AX confirms original shopping tab restored with all original tabs retained. Reviewer server stopped; listener inventory confirms 18931, 18932, 18933, 18934 closed. Disposable records and downloaded session export remain as evidence. No origin-wide clearing or unrelated file/process deletion occurred. A local git-status attempt returned an Xcode-license environment error; this is not a product issue and no license/settings action was taken.

**Browser free; build/site unlocked for root's next build/deployment.**
