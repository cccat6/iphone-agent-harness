# Independent backup delta review — R12

Date: 2026-10-18. Reviewer: independent subagent. Reviewed working tree based on `baa35`; only this report was written by this reviewer.

## New finding

**[P3] Oversized external import claims the session is already saved locally.** `apps/web/core/backup-files.js:7–14` supplies the same `BACKUP_TOO_LARGE` message for export and session-file import. The import path (`apps/web/app.js:192`) can receive a backup from another browser/device, with no corresponding local session. Nevertheless, the localized error says “This session remains saved in this browser.” All eight locales repeat that claim. The rejection is correct and no data is written; the reassurance is factually false for this case. Use wording valid for both operations, such as “Existing data in this browser is unchanged,” or separate import/export messages.

Independent minimal reproduction, executed successfully from the repository root:

```sh
node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
import {openStore} from './apps/web/core/store.js';
import {BACKUP_ERRORS,readImportFile,SESSION_BACKUP_BYTES} from './apps/web/core/backup-files.js';
import {registerErrorCatalog,setLocale,localizeError} from './apps/web/i18n.js';
const store=await openStore({memory:true});
registerErrorCatalog(BACKUP_ERRORS);setLocale('en');
try {
  await readImportFile({size:SESSION_BACKUP_BYTES+1,text(){throw Error('must not read');}},
    {maxBytes:SESSION_BACKUP_BYTES});
  assert.fail('expected rejection');
} catch(error) {
  assert.equal(error.code,'BACKUP_TOO_LARGE');
  console.log(localizeError(error));
}
assert.deepEqual(await store.listSessions(),[]);
console.log('Confirmed: no session exists in the browser store.');
store.close();
NODE
```

Observed output:

```text
Session backups are limited to 64 MiB. This session remains saved in this browser.
Confirmed: no session exists in the browser store.
```

## Fresh issue-discovery results

- Inspected the actual three `chooseFile` call sites: session import passes `SESSION_BACKUP_BYTES`; Skill and creator-identity imports omit it and retain the helper's 10 MiB default. The check executes before `file.text()` and before the callback that writes storage.
- Executed the actual `download` and `chooseFile` function definitions extracted from `app.js` with small controlled DOM/URL collaborators. A session `Blob` reaches `URL.createObjectURL` unchanged, receives the requested filename and one click, and schedules revocation after 1,000 ms. Ordinary object download still serializes JSON correctly. These checks catch accidental Blob-to-`{}` serialization independently of the module tests.
- Verified serialized `汉😀` uses the actual UTF-8 JSON byte count, including pretty-print formatting, rather than JavaScript string length.
- Independently injected an oversized file into the real `chooseFile` helper: `BACKUP_TOO_LARGE` occurs before reading or invoking the import callback. Repeated with omitted override and a 10 MiB + 1 size: `IMPORT_TOO_LARGE` occurs before the callback.
- Independently injected an oversized `Blob.size` for a small export to exercise the export boundary without allocating another large fixture. `sessionBackupBlob` throws before `download` executes; no additional click occurs. Session/message/settings/Skills snapshots remain identical after both failure paths. Restored native `Blob` immediately afterward.
- Independently round-tripped a small non-ASCII session and verified `mode`, `modelId`, and message content; verified exact eight-locale coverage for both error codes.
- Inspected both updated S07 rows in `docs/acceptance/README.md` and `docs/acceptance/zh-Hans.md`: they consistently describe the shared 64 MiB UTF-8 JSON session bound, retained 10 MiB document bound, rejection before download, existing-data preservation, and account/vault/identity exclusions. No new documentation discrepancy found.

## Finite test run

`node --test tests/web/backup-files.test.mjs`: **3/3 passed**, zero failures; total approximately 46 seconds in this run. The single large functional fixture took approximately 43 seconds. Its three 4 MiB base64 frames produce a backup above the former 10 MiB gate, restore through the same file-reader helper, preserve the tool-call linkage and all image content, and leave the original session present after deleting the imported session. The fixture is meaningful for the reported regression. Exact import boundary acceptance and early oversized rejection also pass.

## Scope and limits

No additional functional defect was discovered in this small delta. This is not a clean-copy result until the new P3 wording issue is addressed. No implementation or test file was edited. No browser-native picker/download, live IndexedDB, phone, serial, credentials, external API, deployment, or stress test was performed. Helper execution used controlled DOM/URL collaborators and a memory store. The full 64 MiB export boundary used injected `Blob.size`; only the existing functional fixture allocated more than 10 MiB. Source inspection establishes the actual app wiring, while prior native-browser evidence is not treated as fresh verification of this delta.
