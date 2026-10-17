# Independent backup delta review — R13

Date: 2026-10-18. Reviewed working tree based on `baa35e3`. Reviewer changed only this report and the new independent test `tests/web/independent-backup-r13.test.mjs`; no implementation edits. No applicable `AGENTS.md` was found in the workspace ancestors or the reviewed apps/tests/docs trees.

## New reproducible findings

**None found in the reviewed delta.** R12's P3 is resolved: all eight `BACKUP_TOO_LARGE` entries now describe preservation of existing browser data, a statement valid for both a rejected local export and a rejected foreign backup import. They no longer claim the selected external session is already saved locally.

## Independent reasoning and verification

- **Export/import byte symmetry:** `sessionBackupBlob` creates the actual pretty-printed JSON `Blob`, then compares its byte size to `SESSION_BACKUP_BYTES`; session import passes that same constant to `readImportFile`. Both checks reject only `size > limit`. A new native-Blob test compares non-ASCII `汉😀` output against `TextEncoder` bytes, verifies it exceeds string character count, and checks exact serialized content and MIME type. A small independent store round trip retains task mode, model ID, assistant tool-call ID, tool reply linkage, image data, and original session content after deleting the restored copy.
- **Boundaries without another large allocation:** a temporary `Blob` subclass reports exactly 64 MiB for a small JSON payload. Export accepts it and the real import reader accepts the same Blob. Reporting one more byte makes export throw `BACKUP_TOO_LARGE` before a following download collaborator is invoked; the original session export remains deeply equal. Native `Blob` is restored in `finally`. This verifies control flow at the boundary, not actual serialization of a 64 MiB fixture.
- **Actual browser-helper definitions:** the new tests extract and execute the current `chooseFile` and `download` definitions from `app.js` with controlled DOM/URL collaborators. At 64 MiB + 1, the session path never reads text or invokes the callback. The default document path similarly rejects at 10 MiB + 1, while exactly 10 MiB and exactly 64 MiB invoke their callbacks. Since storage writes are inside those callbacks, oversized input cannot reach them. A real session Blob reaches `URL.createObjectURL` by identity, receives the requested filename and one click, and schedules revocation at 1,000 ms. Ordinary object downloads continue to produce JSON.
- **Real application wiring:** inspected all three call sites. Session import supplies `SESSION_BACKUP_BYTES`; Skill and creator-identity imports omit the override and therefore retain `DOCUMENT_IMPORT_BYTES`. The real export action calls `sessionBackupBlob` before `download`, with no storage writes in the rejection path. The application registers `BACKUP_ERRORS` before handlers execute.
- **Localization:** independently checked exact eight-locale coverage and error lookup through `registerErrorCatalog`/`localizeError`. Reviewed all eight corrected second sentences for the neutral existing-data statement. The 10 MiB Skill/identity messages retain their separate meaning.
- **Bilingual S07:** reviewed both `docs/acceptance/README.md` and `docs/acceptance/zh-Hans.md`. Their session limits, UTF-8 JSON scope including images, pre-download export rejection, data preservation, separate document limit, and account/vault/identity exclusions agree. Existing R4 links are historical evidence and were not treated as verification of this snapshot.
- **Existing regression test:** reviewed its three 4 MiB base64 frame fixture and assertions. It exercises the former 10 MiB rejection with preserved tool linkage/images, separate imported session, and original-session retention. The parent already ran the full fixture; R13 did not repeat that allocation.

## Executed checks

```text
node --test tests/web/independent-backup-r13.test.mjs
4 passed, 0 failed; approximately 1.1 seconds

node --test --test-name-pattern='both file bounds|backup limit errors' tests/web/backup-files.test.mjs
2 passed, 0 failed; approximately 1.1 seconds

/Library/Developer/CommandLineTools/usr/bin/git diff --check
passed
```

The R13 independent test file adds four tests to any later full-suite aggregate. Counts above are local targeted runs, not a new full-suite total.

## Scope and limits

Clean result applies to `backup-files.js`, its actual import/export integration in `app.js`, the backup regression tests, the R12 correction, and the two S07 rows. It is not a whole-product review. No native browser picker/download, live IndexedDB, credentials, external API, hardware, phone, serial connection, remote system, deployment, or stress test was exercised. Store checks used the memory backend; DOM/URL behavior used controlled collaborators. R13 introduces no new requirement to rerun the already-passed large fixture.
