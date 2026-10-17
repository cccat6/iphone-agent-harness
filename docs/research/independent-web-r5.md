# Independent Web Acceptance R5 — 2026-10-18

Fresh independent native Chrome review of `build/site` after root explicitly confirmed its build had completed and froze the candidate. README, R1–R4 and localization/legacy/MCP architecture were read first. No implementation code, rebuild, commit, deployment, serial/USB/BLE access, real phone, real credentials or external model/MCP service was used. New loopback ports were checked with listener inventory before starting; the user's unrelated WishOS listener at 18872 was preserved.

## Finding

### R5-WEB-01 · P2 · An already displayed model-directory status does not follow a language change

**Minimal reproduction:** In the isolated phone UI fixture, open English Settings → Add/Edit model account, enter a fake account, manual model ID and `http://127.0.0.1:18922/qa-missing`. Click **Get models**, receiving a real HTTP 404. With that editor still open, switch the language selector to Español. Settings, field labels, vision help, vault help and the live storage estimate all become Spanish, while the visible `#models-status` remains:

> Could not complete: The model list could not be loaded. Check the address, access and CORS, or enter a model ID manually. (HTTP 404) You can enter a model ID manually.

Clicking/focusing the manual-model field scrolls this exact English status into view below the Spanish **Obtener modelos** button. Both the native accessibility tree and screenshot show the mismatch after the change has settled. Clicking **Obtener modelos** again changes the same status to fully Spanish: `No se pudo completar: No se pudo cargar la lista de modelos. Revisa la dirección, los permisos y CORS, o introduce un ID manualmente. (HTTP 404) Puedes introducir el ID del modelo manualmente.` Therefore the selected locale and resources work; the previously displayed status is not redrawn.

**Expected / impact:** Existing UI-owned asynchronous status and recovery guidance should follow the newly selected language without requiring another failed network request or loss of form edits. Users switching to a language they understand still receive the substantive current recovery guidance in the previous language.

**Location:** `apps/web/app.js:206`, model discovery catch, constructs a fully rendered interpolation using `t('common.failed', {detail: localizeError(error)}) + ' ' + t('provider.modelsFallback')` and assigns plain `textContent`. The locale subscriber at line 333 relies on the generic text reverse lookup and does not reconstruct this composite status from its error/state. `applyModels` around line 205 also writes an interpolated count status; that adjacent success-status behavior was not newly browser-reproduced in this review, and is not a separate finding.

**Evidence:** Native Chrome AX plus screenshot in this review's transcript; loopback HTTP log `build/independent-web-r5/http.log` records actual repeated `/qa-missing/models` 404 responses. Manual model ID `qa-r5-manual-unsaved` and user name `设置` remained unchanged. Root was informed, acknowledged the finding and requested report/cleanup followed by a fresh R6. No repaired candidate was substituted during R5.

## R4 and earlier repairs independently checked

| Repair | R5 precise result |
| --- | --- |
| Dynamic account guidance | Opened account editor in Español, filled user name `设置`, manual model and fake key, then switched to English without closing it. Vision guidance, vault help and unlock-each-time help became English. User name, endpoint, manual ID and masked unsaved fake key all remained present. Native AX and screenshot passed. |
| Wrong-passphrase explanation | Saved a fake API key encrypted with a disposable passphrase. Reload showed stored-but-locked. Explicit wrong-passphrase Unlock produced foreground, AX-visible English `Unable to unlock. Check the passphrase and account type.` Correct Unlock produced `Credentials unlocked in page memory.` and cleared the passphrase. Browser password-save offer was declined. |
| Imported-session language and role protection | Independent browser fixture imported the actual built store module into disposable memory stores. For every one of eight locales, original title `设置` remained and the generated suffix matched that locale. An imported historical `system` message became `role:user`, `sourceRole:system`, `internal:true`. This is built-module/native-browser evidence, not a new native-file-picker session-import UI pass. |
| Skill user text/version protection | Created own Skill named `设置`, description `查看`, in English. Local card, viewer and edit form retained those strings. Viewer displayed literal `<script>alert(1)</script>` instructions without running script. Slug was readonly. Saving edit changed 1.0.0 → 1.0.1 and preserved the title/body. |
| JSON Skill downloads | Independent browser fixture imported built `downloadSkill`. JSON `content`, `instructions` and `body` each normalized to actual instruction text; forged authored provenance did not survive as authored. |
| Native fetch/MCP | Production `createMCPAccess()` with default native browser fetch completed actual cross-origin HTTP/CORS initialize → initialized → tools/list → one readonly echo tools/call. See below. |
| Storage and composer accessibility | Live English→Spanish storage estimate updated. Fresh English composer exposed Model / Choose a model and account; configured model selector retained original user account name `设置`. |

## Additional coverage

| Area | Observed scope |
| --- | --- |
| Desktop platform routing | Visiting `/` actually replaced the URL with `/main`; English home and community exposed no Harness controls. |
| Public navigation | Home → Skills → Flash; native browser Back restored `/skills`; Forward executed before leaving for a fixture route. Community rendered ten bundled entries and truthful no-community-backend notice. |
| Flash page | Manifest and profile control loaded; page explicitly stated no USB port had been opened. It still described the diagnostic scaffold, which root had stated was pending replacement; no final-firmware acceptance inferred. No install/setup-read button was clicked. |
| Local Skill sharing | Own Skill showed Export and truthful no-community-endpoint notice, without public Publish. Export completed as a 269-byte `.skill.json`. No public publication or import-picker completion claimed. |
| Model directory | Actual loopback `/qa-models/models` returned two models. Editing endpoint invalidated them. Actual `/qa-missing/models` 404 preserved manual model; the first requested English explanation was fully English. Saving retained the manual model. The locale-switch defect is the finding above. |
| Identity crypto | Independent built-module browser fixture generated a disposable in-memory P-256 identity, encrypted it, restored the same creator ID and rejected a wrong passphrase using native WebCrypto. This is not a new identity-file-picker UI round trip. |
| Vault crypto | Independent built-module fixture additionally sealed/unsealed fake credentials using native WebCrypto and rejected wrong passphrase. The actual vault UI flow was separately completed above. |
| Eight-language module contracts | Actual built `i18n`, store and metadata modules passed all eight localized import suffixes, unlock/capture-source code messages, and foreign catalog metadata named `设置` with description `查看` even when claiming `source:builtin` and colliding with `phone-navigation`. The fixture output was read through native AX and screenshot. This is not eight full-screen UI walkthroughs. |
| MCP real HTTP boundary | Separate origins 18921→18923. Server validates fake bearer, session and protocol headers. Connect exposes zero authorized tools; selection while disabled still zero; explicit enable exposes echo only; Chat call rejected with `MCP_MODE_NOT_ALLOWED`; Task echo returns expected string; disconnect returns zero; revoked call rejected locally with `MCP_NOT_CONFIGURED`. HTTP log records OPTIONS and exactly one tools/call. No real MCP server or mutation used. |
| Legacy gate | Built index/bootstrap with isolated old-Safari UA/missing-API prelude at 18924. Root displayed only the compatibility gate. Escape + Tab retained gate and homepage-button focus. Clicking homepage changed actual URL to `/main`; links loaded readable `/skills` and `/flash`, without functional Skill/install controls. English was newly checked; eight-language legacy coverage belongs to earlier/source tests. |

## Automated verification and snapshot

Direct `node --test` of i18n, dynamic i18n, Skill downloads, MCP secret boundary and MCP UI: **24 tests passed, 0 failed**. Log: `build/independent-web-r5/targeted-tests.txt`. No npm pretest asset sync or build was run. These are source tests and do not invalidate the native browser finding.

Candidate SHA-256 before/after review, unchanged:

```text
build/site/app.js             1f08295e2c31d645294c8d9b65ec10375e2eac633c9d743d53dca43cfa3edf2c
build/site/i18n.js             1416ecceab48916ea16b89ec78fad7dd7fdefcbedb08791e54eb676c251a6fd4
build/site/core/store.js       1036626339091ae3208df198e01208de80876f4040baf11708fab7db52010af7
build/site/core/providers.js   22e46f9ba426a03b367e4b2fd700d3a1e3bfe53bd56fe598b949932a2134f9be
```

## Limits and cleanup

The phone fixture changes UA only in a clearly isolated test origin before loading the real candidate. It establishes desktop Chrome UI behavior, not real Safari, capture, viewport/keyboard/background reliability or production UA support. The new contracts fixture uses real built modules but disposable memory stores; it does not replace native file-picker acceptance. A first fixture draft had an unescaped closing script literal; the fixture was corrected and rerun, with no product bug inferred.

Session creation/rename/search/archive/pin/export/import through actual UI were not newly completed before this finding. Eight full language screen walkthroughs, built-in open-panel language switching, foreign catalog UI, MCP permissions component UI, live generation/cancellation, actual Codex subscription authorization/refresh, public community publication, hardware provisioning/certificate/HID, multi-phone control and final firmware remain outside this review's accepted scope. Retain exact earlier-round evidence separately. No real credential or user record was read or modified.

The one reviewer-created Chrome tab was closed. Native AX showed the original shopping tab restored, with all original tabs retained. The reviewer server was interrupted and listener inventory confirmed **18921, 18922, 18923 and 18924 closed**. User port 18872 was not touched. Clearly isolated test records and the downloaded test Skill remain as evidence; no origin-wide data clear or unrelated deletion occurred.

R5 is a finding-bearing pass. The targeted R4 guidance/unlock repairs passed, but composite asynchronous model status still needs repair and a fresh R6. This is not clean final acceptance or an absolute bug-free claim.
