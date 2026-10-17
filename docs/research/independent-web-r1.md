# Independent Web Acceptance R1 — 2026-10-18

Independent review of the latest `build/site` web candidate available at the start of this pass. No implementation code was changed, rebuilt, committed or deployed by this reviewer. All browser interactions used native Chrome accessibility through CUA. The physical phone, serial ports, USB, BLE and real model/third-party MCP services were not contacted.

## Findings

### R1-WEB-01 · P2 · Dialog errors and confirmations render behind the dialog

**Reproduction:** Use the actual settings UI (reviewed through the isolated phone fixture), open Context and images, set trigger=12000, target=8000, reserve=4000, then Save. The target plus reserve equals the trigger and is correctly rejected by implementation, but there is no readable error in the active dialog. A screenshot taken immediately after repeating Save shows a blurred green toast behind the modal near the bottom edge. The toast is absent from the dialog's accessibility tree. The same mechanism also hides the successful credential-unlock toast, making success appear unchanged until settings is reopened.

**Expected:** A visible, accessible validation message associated with the current dialog/form. **Impact:** Users cannot determine why an invalid setting or authoring action did not save, or whether an explicit unlock succeeded.

**Location:** `apps/web/app.js:41-43` routes guard failures to the global toast; the context submit handler at line 166 throws validation errors. `apps/web/index.html:54` places that toast outside the modal dialogs. `.toast` in `apps/web/styles.css` has ordinary z-index=1000, which cannot rise above a dialog's browser top layer/backdrop.

**Evidence:** Native CUA screenshot and AX observations in this review's tool transcript: active fields 12000 / 8000 / 4000; Save click; no AX update; immediate screenshot with blurred toast behind dialog. Root was notified during review and reported a source fix. The candidate under test was deliberately not replaced; this reviewer does not claim to have verified that fix. Fresh R2 must check it.

### R1-WEB-02 · P2 · Catalog URL downloads treat JSON Skill objects as raw instruction text

**Reproduction:** A supported catalog entry `{id:'qa-json', name:'Independent QA JSON', version:'1.0.0', url:'qa-json.skill.json'}` refers to a JSON response `{id:'qa-json',name:'Independent QA JSON',version:'1.0.0',content:'# Actual instructions\nRead the screen.'}`. Call the actual exported `downloadSkill` with that entry and an injected fetch returning this response. The resulting `skill.content` is the entire serialized JSON object, including escaped newlines, instead of the `content` field. A direct independent Node reproduction printed `matches:false`.

**Expected:** The JSON `content`, `instructions` or `body` field is normalized to the instructions, as documented in `docs/architecture/web-ui.md` under Skill flow. Markdown URL downloads should remain raw Markdown. **Impact:** Custom public catalogs using the documented JSON Skill format install metadata and JSON escaping as instructions, instead of the authored Skill body. Local file import has a separate correct normalizer and passed the browser test.

**Location:** `apps/web/core/skills.js`, `downloadSkill`, `!entry.manifestUrl` branch (line 31 in the reviewed candidate). It unconditionally assigns the response text to `content`.

**Evidence command:**

```js
import {downloadSkill} from './apps/web/core/skills.js';
const body={id:'qa-json',name:'Independent QA JSON',version:'1.0.0',content:'# Actual instructions\nRead the screen.'};
const skill=await downloadSkill(
  {id:'qa-json',name:'Independent QA JSON',version:'1.0.0',url:'qa-json.skill.json'},
  'http://127.0.0.1:18841/catalog.json',
  {fetchImpl:async()=>new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}})}
);
console.log({expected:body.content,actual:skill.content,matches:skill.content===body.content});
```

## Browser coverage

| Area | Result and precise scope |
| --- | --- |
| Desktop root | `/` visibly replaced by `/main`; desktop home exposes community/setup, no Harness control entry. |
| Public navigation | Home → Skills → Flash; native browser Back returned to Skills and Forward to Flash. URLs and visible page content matched. |
| Eight languages | Native selector switched English, Simplified Chinese, Traditional Chinese, Japanese, Russian, German, French and Spanish; localized selector title/help observed for all eight. Full English homepage and French/Spanish community content observed. User Skill title/body remained unchanged. This is not a claim of a full visual audit of every screen in every language. |
| Bundled community | Ten bundled entries rendered; no service configured state truthful for local/self-hosted origin. Advanced endpoint field is separate. No public service upload was attempted. |
| Owned Skill creation | Created clearly marked `Independent QA R1 测试`, slug `independent-qa-r1`, description and Markdown. Local owner namespace displayed; created-by-you/editable status and Edit button appeared. |
| Owned Skill edit | Renamed to `Independent QA R1 edited`; version changed 1.0.0 → 1.0.1; slug remained readonly. |
| Skill text safety | `<script>alert('x')</script>` displayed literally in the Skill viewer; no script dialog ran. |
| Enable/persistence | Disabled own Skill; refreshed; title, version, ownership and disabled state all remained. |
| Export/import | Export completed as a 350-byte `.skill.json`. Imported that exact test file through the native file picker. List count 11 → 12; authored original remained editable/disabled, imported copy displayed community/imported readonly with no Edit button. |
| Sharing | No endpoint configured: own Skill showed Export only and explicit no-community notice; no Publish button. Bundled entries had no Edit controls. Real signing/publication not exercised by browser. |
| Flash preparation | Manifest loaded; C3/S3/C6/ESP32 options present, S3 selection updated details. Page explicitly said no USB port open. Install and read-setup buttons were never clicked. Candidate firmware still showed diagnostic scaffold; root had explicitly said final firmware would be replaced later. This pass does not accept that final replacement. |
| Settings/model failure | In an isolated phone fixture, saved a fake provider and fake key only. Unreachable `example.invalid` model discovery showed failure and preserved manual ID, with no fake candidates. |
| Settings/model success | Local mock model directory returned exactly qa-model-alpha and qa-model-beta. UI showed 2 models, selection updated default, Save persisted them; bottom model selector grouped by account and allowed beta selection. No generation was sent. |
| Encrypted fake credential | Explicitly encrypted a fake credential with a test passphrase; reload showed stored-but-locked status. Explicit unlock restored ready status when settings was reopened. No real key or account used. Feedback visibility affected by R1-WEB-01. |
| Storage | Estimate and best-effort status visibly displayed. Persistent-storage permission request was not issued. Invalid context budget rejection checked; feedback affected by R1-WEB-01. |
| Session UI fixture | Created two local sessions; renamed A; unsent draft A/B stayed isolated when switching. Harness → homepage → Harness preserved current session and unsent draft. Search/archive/delete/export were not independently completed in this pass. |
| MCP isolated fixture | Default off and zero tools; real access-manager mock initialize/list returned 2 tools with none enabled. Selecting echo alone still exposed zero; enabling exposed echo only. Editing endpoint revoked and directory returned to zero. Saved endpoint omitted query auth. No real server or external tool effect. |
| Legacy isolated fixture | Root showed only nondismissable compatibility alert; Esc and Tab kept focus on homepage action. Clicking homepage actually changed URL to `/main`; community and flash links then visibly loaded readable fallback pages. No functional install/Skill controls falsely appeared. |

## Automated verification independently rerun

- 53 tests passed: bootstrap, community/identity/signatures/CAS, compatibility/route fallback, i18n, MCP UI and public routing.
- 44 tests passed: MCP access/mode enforcement/revocation/uncertainty, Harness integration, model/profile selection, Skill ownership and namespace protection, streaming limits, provider reasoning, cancellation and manifest/hash preflight.
- Tests were run directly with `node --test`, without `npm test` pretest asset sync or rebuilding the candidate.
- Passing tests do not cover the two findings above. The JSON download reproduction is additional to the existing suite.

## Isolation and unverified boundaries

- Desktop candidate served unchanged on loopback port 18841.
- Phone UI was evaluated only through a temporary loopback server on 18843 injecting a fixture-only iPhone Safari 27 UA before the actual candidate scripts. This is a simulated UI acceptance environment, not physical Safari evidence and not a production UA bypass. It did not mock successful hardware or capture state.
- Existing MCP and legacy fixtures served separately on 18842 / 18832; successful model catalog fixture used 18844. These fixture modules are separate from production assets.
- Real Safari 27 authorization, keyboard/viewport, capture/background behavior, Codex account login/refresh, live service CORS, community public publication, actual USB flashing/setup read, certificates, HID challenge, device control and multi-target behavior remain unverified here.
- Existing repository tests and documentation were read before exploration. Initial browser text entry and native file-picker timing problems were treated as automation limitations; no product failure was inferred from those failed attempts.
- The test Chrome tab and all five reviewer-created loopback servers were closed/stopped after the pass. Clearly marked local test records remain only at their isolated origins; no real browser data was removed.

## Disposition

Two actionable findings were sent to root. This pass is complete as an independent R1 review, not a clean final acceptance. Root must fix/resolve findings and use a fresh independent reviewer for R2. Any item listed as unverified must remain separate from passed checks in the final per-feature checklist.
