# Independent release/content review R4 — 2026-10-18

## Result and exact scope

This fresh independent round found **no new reproducible content issue in the reviewed snapshot**. It is a new pass after the finding-bearing R1, R2 and R3 rounds, rather than a restatement that their reported defects have been repaired.

Reviewed all eight user READMEs, all 20 current architecture documents, both complete acceptance checklists, three prompt sources, ten built-in Skill bodies and manifests, four design schemas and six examples. These **63 content files** have aggregate SHA-256 `22163f25b02b8ea11d9373f724c709d5d5714932ab4a4f0b7b7193b9e56a8c02`, calculated over sorted repository-relative paths, each followed by NUL, file bytes and NUL. Git HEAD was `baa35e3b2d99b6fbe1e48971ef31d3ab031c3927`; the snapshot includes the maintainer's current uncommitted documentation updates, so HEAD alone does not identify those bytes.

Compared current instructions and readiness statements with the corresponding UI, Harness, store, Skill, prompt-assembly, device and firmware sources and the final local execution receipts. Dated component/research reports remain execution snapshots with their stated scope; earlier source-only passes do not become claims that later deployment, browser or hardware checks were never performed. The final scan counters, this new review reference and final documentation push/CI receipt remain the maintainer's explicit reconciliation steps.

This reviewer changed only this report. No implementation, other documentation, generated asset, binary, build, Git index, commit, deployment or remote state was changed. No browser, serial port, board, phone, LAN request or live API was accessed.

## Previous findings independently checked

- **RC1:** publishing uses `communityEndpoint`, the official-origin same-origin `/api` default, explicit disable/self-host behavior, current-author ownership and explicit signed publishing. The retired configuration requirement is absent.
- **RC2:** the system prompt describes stopping the current run and sending a correction as the next message. It agrees with the app/Harness submission boundary and does not promise active-run message delivery.
- **RC3:** reproducibility documentation names actual `run.started` metadata and cloned in-memory Skill packages, while explicitly excluding complete historical authored/community content, endpoint configuration and independent tool-schema snapshots.
- **RC4:** `skills_load({id,path?})` agrees with the fixed tool schema and resource reader; version pinning is explained separately.
- **RC5:** product limits are 128 events, 8192 UTF-8 request bytes and a 7168-byte / 57,344-bit replay filter. Fixture 256-event limits and successful legacy-discovery fallback are distinguished. C3/S3/C6 MSYS 8/8 and classic ESP32 8/0 summaries agree with the selected product sources.
- **RC6:** ordinary device settings explicitly include public origin, fingerprint and stable client identity metadata. Memory/default or optional encrypted tokens and fresh page-local HID proof remain separate.

No additional content correction was requested or performed during R4.

## Independent finite checks

- **692 local Markdown targets across 30 README/architecture/checklist files:** all exist and are Git tracked or eligible according to `git ls-files --cached --others --exclude-standard`; none are missing or ignored-only, including directory targets. This establishes local availability and commit eligibility, not final pushed inclusion. The increased count reflects newly linked release receipts.
- **Eight READMEs:** every language bar has seven alternate-language links. Platform minimum, two product parts, ten Skills, local/model/community data boundaries, optional subscription/MCP restrictions, HTTPS self-host routing, licensing and physical acceptance distinctions remain aligned.
- **Both checklists:** **94 unique matching inventory IDs**, identical status values and all **16 unchecked P01–P16 phone groups**. Checked desktop items preserve their automated/native/live/content evidence scope. Permanent product Delete-button execution, physical Safari, full eight-language visual coverage, phone gestures and two-phone performance are not inferred from mocks or isolated storage tests.
- **Ten Skills:** independently verified all **10 resource byte sizes and SHA-256 hashes**, and parsed all **10 fenced JSON examples**. Instructions use current fixed tools/actions, bounded procedures, real runtime identity and visible outcome evidence. Fragments are labelled as such; no universal challenge solver, native multitouch, arbitrary Unicode or invented cancellation tool is advertised.
- **Generated assets:** read-only reconstruction of the three prompts, ten Skills and plan schema exactly matches `core/assets.js`, revision `c53cf0e1f8b11af06e3f09333849a0d62e7f4435e603ad86db49cf38647b6479`. No synchronization or build hook was run.
- **29/29 design-contract checks passed** using the existing isolated schema-validator dependencies, including the locally available pinned-reference hash check.
- **28/28 runtime/Skill-download tests passed**, run directly through Node without the asset-writing pretest hook.
- **Firmware correspondence:** independently ran the read-only strict verifier: **4 profiles / 13 current source files passed**. It confirms the final source provenance represented in the content; it does not execute the binaries on four boards.
- **Deployment receipt correspondence:** all **111 recorded served-file hashes and byte lengths** match the current local build files. Directly corresponding Web source files also match their receipt hashes. This checks the saved receipt against local bytes; it is not a new network fetch or independent live deployment/CI observation.
- **Final native records:** the release summary/checklists agree with the C3 browser/USB and desktop-site receipts: four actual write-hash checks, automatic application boot, USB read after a 34,272 ms chooser wait, matching public identity/fingerprint and masked/cleared secrets. CA profile content was verified and a download requested; Chrome blocked file saving. Current eight-language wording and receipts do not claim a saved file, warning bypass, trust installation or phone HID execution.

## Acceptance boundary

This is a fresh no-new-finding content/release consistency pass for the exact local snapshot above. The final known-secret/link-count reconciliation and final documentation commit/push/CI must still be recorded by the maintainer after this report exists. R4 did not independently rerun the full Web suite, make live GitHub/site/community requests, perform browser/serial operations, install trust, or execute any phone action.

P01–P16 retain their explicit deferred physical-phone scope. A clean source/content review, verified binaries, saved deployment receipts and successful Mac transport do not establish Safari-to-LAN operation, real HID target proof, gestures, background scheduling or two-phone isolation/throughput.
