# Independent Web Acceptance R4 — 2026-10-18

Fresh independent native Chrome review of the existing `build/site` candidate after root confirmed the R3 repair build had completed. README, R1–R3 and the UI/localization/MCP/device architecture documents were read first. The reviewer made no product source changes, rebuilds, commits, deployments, serial/USB/BLE calls, phone operations or real account/service requests. Browser testing used one disposable loopback origin and fake account data. The candidate stayed unchanged throughout this review.

## Finding

### R4-WEB-01 · P2 · Dynamic locale handling still leaves account guidance, unlock failure and imported-session suffix in another language

Three reproducible UI-owned localization omissions remain:

1. **Open an account editor in Spanish, then switch to English without closing it.** The ordinary labels, buttons, storage estimate and subsequent model HTTP error switch to English, while `provider.visionHelp` remains `Observar la pantalla requiere un modelo compatible con imágenes. Aparecer en la lista no confirma que admita imágenes o herramientas.` The passphrase help remains `El cifrado requiere credenciales y una contraseña. Desbloquea al volver a abrir la página.` Editing the manual model field afterwards does not refresh these strings. Native AX and screenshot both show the English form with this Spanish guidance. Reopening the editor produces English guidance, so the selected locale and translations themselves are valid.
2. **In an English account editor with a disposable encrypted fake credential, enter the deliberately wrong test passphrase and click Unlock saved credentials.** The foreground accessible toast says `无法解锁，请检查口令与账号类型。` The English success path works: the correct test passphrase produces `Credentials unlocked in page memory.` and clears the field. This is an untranslated failure explanation, not a broken decryption claim.
3. **Export an English test session and reimport that exact file through the native picker.** The new session is correctly separate and the success toast is English, but its generated title is `Independent R4 session A（导入）`. The exported user title was exactly `Independent R4 session A`; the Chinese suffix is added by the product, not supplied by the user.

**Expected and impact:** UI-owned guidance, failure explanations and automatically generated labels should use the selected language. User account names, model IDs, Skill text and original session titles must remain unchanged. These omissions obscure account setup/recovery and leave English sessions with a system-generated Chinese suffix.

**Locations:** `apps/web/app.js`, `showProviderEditor()` around line 192 directly inserts `t('provider.visionHelp')`, `t('provider.vaultHelp')` and vault-state help; `localizeView()` around lines 296–315 records rendered text as a source and depends on `translateText()` reverse lookup. Text initially emitted in Spanish is not recovered as the original translation key. The unlock handler and error catalog do not localize the quoted failure. `apps/web/core/store.js:51`, `importSession()`, hardcodes both the `（导入）` suffix and Chinese fallback title.

**Evidence:** Native CUA AX/screenshot transcript in this round, plus exact downloaded test-session JSON (416 bytes) with the unchanged original title. Server log `build/independent-web-r4/http.log` records actual `/qa-models/models` HTTP 200 and `/qa-missing/models` HTTP 404. All finding details were sent to root before report completion. Root instructed the reviewer to stop broadening the same localization finding group and finish the report/cleanup; the planned repair and fresh R5 remain separate from this candidate's acceptance.

## R3 repairs independently verified

| Repair | Native browser result |
| --- | --- |
| Storage locale refresh | Open Settings in English, select Español without closing it: estimate immediately becomes `Usado 0.2 MB · límite estimado 10240.2 MB · Almacenamiento estándar`. Passed. |
| Composer model accessibility | Fresh English composer exposes `Model` with `Choose a model and account`; Spanish exposes `Modelo` with `Elegir modelo y cuenta`. Passed. |
| Model directory HTTP failure | Real loopback HTTP 404 produces a fully Spanish explanation and fallback, then a fully English explanation with `(HTTP 404)` after switching and requesting again. No Chinese remains in this particular error. Passed. |
| Manual recovery | `qa-r4-manual` remains after 404 and can be edited to `qa-r4-manual-after-404` and saved. No fake directory is generated. Passed. |

## Additional completed coverage

| Area | Exact observed scope |
| --- | --- |
| Model directory | Actual same-origin HTTP mock returns `qa-r4-alpha` and `qa-r4-beta`; UI reports two returned models. Changing endpoint invalidates the previous results. Failing 404 is truthful and preserves the manual model. Saving afterwards retains the manual ID alone. |
| Fake credential encryption | Explicitly encrypted a fake API key with a disposable passphrase; reload shows `Encrypted credentials saved; unlock to use`. Correct explicit unlock succeeds and clears passphrase; reopening Settings shows credentials ready. Chrome password-manager save prompt declined. Wrong-passphrase language is the finding above. |
| Sessions | Create A and B, rename A, pin A, set Plan, verify Plan description and saved mode. Distinct unsent A/B drafts stay isolated when switching. Search for a nonexistent title produces `No matching sessions.` Clearing search restores list. |
| Session export/import | Real download inspected: `iah-session` v2, original title/mode/model and pinned state, no credentials, no messages for this empty session. Exact downloaded file selected through native picker; separate imported session opens with Plan and the saved model. Generated suffix is the finding above. No draft refresh-persistence claim. |
| Creator identity | Fresh disposable P-256 identity displayed. Encrypted backup downloaded as a 735-byte JSON. Exact newly downloaded file selected through native picker; explicit restore confirmation accepted for the same isolated identity; accessible success message and identical creator ID `7e219ee2d294d8f80da2ab02a623db71282dd6d359da58feca469d98faaf5053` observed. |
| Local Skills | Ten bundled entries display read-only provenance and no Edit controls. Authoring form opens. A create attempt reached name/slug/description only; CUA then timed out before body entry/submission. On recovery the body was empty and the form was cancelled, so no new Skill-creation or text-safety pass is claimed. |
| Locale menu | All eight choices exposed. English and Spanish live settings/editor/composer paths exercised. This is not a full all-screen/eight-language visual acceptance. |

No automated tests were rerun in this round; root's separate core acceptance owns the source test result. This report's additional evidence is actual native browser interaction against the built candidate, including real HTTP directory responses and native file pickers.

## Snapshot, limits and cleanup

Reviewed candidate SHA-256:

```text
build/site/app.js             3fc5b751489f0adb49ecf8849f9df93d3bc1031f4ae454b7ee951188811615eb
build/site/core/providers.js  22e46f9ba426a03b367e4b2fd700d3a1e3bfe53bd56fe598b949932a2134f9be
build/site/core/store.js      f8f6ddf72c587261075125906705877aca857ea965e31c5b98b547bb3cd33a57
```

The loopback-only fixture was prepared at ports 18871/18872/18873, adapting the existing R2 fixture under `build/independent-web-r4/`. Only 18872's clearly isolated iPhone/Safari-27 UI simulation was used for the browser flows; actual candidate modules ran. This is desktop Chrome UI evidence, not real Safari, capture capability or physical phone acceptance. Fixture-only UA injection was not added to production.

Public desktop routes, the legacy compatibility gate, MCP HTTP authorization/revocation, owned Skill edit/export/import, real community publication and eight full language walkthroughs were not newly completed in R4; retain R1–R3's exact scopes instead of marking them newly passed. Session archive/restore/delete, Task execution/cancellation, pagination and attachment/capture were not newly exercised here. Actual Codex subscription authorization/refresh, live provider CORS/generation, real third-party MCP interoperability, public HTTPS-to-board TLS/provisioning/pairing/challenge/HID, multi-phone isolation, USB flashing and final firmware remain unaccepted physical or user-authorized steps. No real personal authorization or broader access was granted.

CUA's Chrome extension entry initially timed out after opening the one reviewer tab, so native Chrome AX was used. A later multi-action native call timed out during the incomplete Skill form; a subsequent native state confirmed its precise partial state. These automation failures were not called product bugs. After recovery the form was cancelled, the one reviewer-created tab/group was closed, and the original unrelated shopping tab was visibly restored with all original tabs retained. Reviewer server PID 51835 was stopped; 18871 and 18873 are closed. Cleanup discovered a pre-existing unrelated WishOS Hub process (PID 41752, started 00:40, wildcard listener `*:18872`) still listening after the reviewer's specific-loopback server stopped. The reviewer preserved that user's process. Logs confirm the candidate and model-fixture requests during testing were served by the reviewer's Python server. The test data used only this app's `iah` namespace/database; no origin-wide data clear was performed. A future pass should preflight all chosen ports with listener inventory, not assume adjacent ports are free. Disposable test records and two downloaded exports remain as evidence; unrelated browser data and files were preserved.

R4 is a finding-bearing independent pass. R3's three targeted repairs passed, but the dynamic localization group needs repair and a fresh R5; this is not clean final acceptance.
