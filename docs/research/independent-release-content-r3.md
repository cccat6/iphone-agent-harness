# Independent release/content review R3 — 2026-10-18

## Scope and method

Fresh independent source/content acceptance following R1 and R2. Re-read all eight user READMEs, all 20 current architecture documents, both complete acceptance checklists, the three prompt sources and ten built-in Skill bodies/manifests. Compared the relevant claims with the current UI, store, Harness, Skill loading, firmware resource selection and capability-advertisement sources. Dated research/execution reports remain historical evidence; their earlier candidate results are not promoted to final deployment or phone acceptance.

This reviewer changed only this report. No implementation, documentation source outside this report, generated asset, binary, build, Git index, commit, deployment or remote repository was changed by this reviewer. No browser, serial port, board, phone, LAN request or live API was accessed. The maintainer made the small content repair below concurrently. The active component UI/identity review and release-final execution remain separate work.

## Prior findings independently closed

- **RC1:** `docs/architecture/web-ui.md:29` correctly describes `communityEndpoint`, the official-origin same-origin `/api` default, explicit disable/self-host behavior, current-author ownership and explicit signed publishing. The retired `skillPublishUrl` requirement is gone.
- **RC2:** `prompts/system.md:27` correctly says the user stops the active run and sends a correction as the next message; it does not promise an active-run steering queue. The app/Harness submission and stop boundaries agree. Read-only reconstruction confirmed generated prompt/Skill/schema parity, rather than invoking synchronization or a build.
- **RC3:** `docs/architecture/skills.md:18` lists the actual `run.started` metadata and in-memory cloned Skill packages, and explicitly excludes arbitrary authored/community historical content hashes, complete endpoint configuration and independent tool-schema versions. The reproducibility boundary matches the current Harness and Skill sources.
- **RC4:** `docs/architecture/skills.md:33` uses `skills_load({id,path?})`, with run version pinning explained separately. The fixed tool schema and resource reader agree.
- **RC5:** `docs/architecture/device-client.md:113` distinguishes product `maxEvents:128` from the 256-event mock fixture and permits the 98,304-byte legacy fallback only after a successful capability report lacks the field. `firmware-implementation.md:73` now calls the product filter **7168 bytes / 57,344 bits**. Its resource overview and the firmware README state **C3/S3/C6 MSYS 8/8, classic ESP32 8/0**. These match `main.cpp:15–17,29`, `ResourceLimits.h:27–36`, `src/Wire.h:10` and `src/SecureService.h:64`.

## New finding and closure

### RC6 — Public stable client ID omitted from an earlier settings summary (P3)

At discovery, `docs/architecture/device-ui.md:7` still said ordinary settings contained only the public device origin/fingerprint. The newly added stable-public-client-identity section and `store.ensureDeviceClientId()` correctly persist `deviceClientIds` as public metadata in the settings store. The earlier exclusive wording had drifted from that implementation and its adjacent documentation.

Reported this narrow documentation inconsistency to the maintainer. Independently re-read the repair: line 7 now says ordinary device settings contain public origin, fingerprint and stable client identity metadata. **Closed by source/content inspection.** The same paragraph still correctly distinguishes memory/default or optional encrypted tokens and fresh page-local HID proof from the non-sensitive public ID. No new permission, credential or firmware behavior was requested.

## Independent finite checks

- **673 local Markdown link targets across 30 files:** all exist and are Git tracked or eligible according to `git ls-files --cached --others --exclude-standard`; none are ignored-only, including directory targets. This establishes local availability/commit eligibility, not final pushed-commit inclusion.
- **Eight README language bars:** seven alternate-language links each. Platform minimum, ten Skills, two product components, local/model/community data boundaries, optional subscription/MCP limits, HTTPS self-host routing and physical acceptance remain aligned.
- **Both checklists:** each contains **94 unique matching inventory IDs**, with identical status values, and complete deferred **P01–P16** groups. Automated, native/mock, live Mac and deferred physical evidence remain distinguished. Known final counts, source/artifact/CI/deployment fields and phone gates remain the maintainer's pending reconciliation, not newly discovered defects.
- **Ten Skills:** all **10 resource byte sizes and SHA-256 hashes** match their manifests; all **10 fenced JSON examples** parse. Their procedures use current fixed action/tool vocabulary, bounded attempts, real runtime identity and visible outcome requirements. No universal shipped challenge solver, native multitouch, arbitrary Unicode or fabricated execution tool is promised.
- **Generated assets:** read-only reconstruction of three prompts, ten Skills and the plan schema exactly matches `core/assets.js`, with revision `c53cf0e1f8b11af06e3f09333849a0d62e7f4435e603ad86db49cf38647b6479`. No synchronization/build hook was run.
- **29/29 design-contract validations passed** with the existing isolated schema-validator dependencies.
- **28/28 targeted Web tests passed:** `runtime-integration.test.mjs` and `skill-download.test.mjs`, directly through Node's test runner without the asset-writing pretest hook.

## Result and limits

All R1/R2 findings are independently closed. This fresh round found one adjacent settings-summary inconsistency, independently verified its repair, and found **no unresolved concrete content defect in the reviewed scope**.

This is source/content acceptance. It does not independently establish final four-profile source/binary correspondence, flashed C3 image or TLS results, native Web Serial writing, deployed changed-source assets, pushed CI, a complete eight-language visual sweep, real Safari/LAN operation or phone HID/gesture/two-target acceptance. Those maintain their separate execution records and gates. Dated historical reports were preserved unchanged.
