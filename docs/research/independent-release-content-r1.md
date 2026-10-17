# Independent release/content review R1 — 2026-10-18

## Scope and method

Independent source/content review of the eight user READMEs, both complete acceptance checklists, all 20 current architecture documents, three prompt sources, ten built-in Skill bodies/manifests, design schemas/examples, publishing/routing/build configuration and their corresponding runtime implementations. Historical research and native/live reports were treated as dated execution records, not as promises that later source was deployed.

This reviewer changed only this report. No source, prompts, checklists, generated assets, binaries, build, Git index, deployment or remote repository was changed. No browser, phone, serial port, LAN device or live service was accessed. The maintainer owns final source/artifact/CI/deployment gates and made concurrent repairs described below.

## Findings

### RC1 — Publishing instructions named a retired setting (P2)

At discovery, `docs/architecture/web-ui.md:29` said the publish button appeared only after explicitly configuring `skillPublishUrl`. The current UI uses `communityEndpoint()` (`apps/web/app.js:54`), the official-origin `SITE_CONFIG` default (`apps/web/site-config.js`), and requires an owned Skill plus endpoint before exposing signed publishing (`apps/web/app.js:284–288`). The retired setting would not configure the current feature and falsely suggested official-site users must configure it manually.

Maintainer repaired the paragraph during review. Independently re-read: it now documents `communityEndpoint`, official-site `/api`, explicit disable, self-host default, ownership, user confirmation and signed package verification. **Closed by source/content inspection.** No additional publish request was made.

### RC2 — System prompt promised unavailable active-run steering (P2)

At discovery, `prompts/system.md:27` instructed the model to incorporate new steering in an active task at the next safe boundary. The product hides Send while running (`apps/web/app.js:113`) and rejects submissions while running/submitting (`apps/web/app.js:121–122`); the Harness exposes `run` and `stop`, with no active-run message queue (`apps/web/core/harness.js:49–54`). No current delivery path provided that promised steering.

Maintainer changed the prompt to stop the current run and send the correction as the next message, explicitly saying active-run steering is not delivered. Independently re-read the corrected source. **Closed by source/content inspection.** The maintainer owns generated-asset synchronization/final build correspondence.

### RC3 — Reproducibility paragraph overstated persisted metadata (P2)

At discovery, `docs/architecture/skills.md:18` promised persisted independent tool-schema version, Skill hashes and model configuration summary. Actual `run.started` (`apps/web/core/harness.js:89`) records mode, provider ID, model, generated prompt revision and Skill IDs/versions. `snapshotSkills()` clones current enabled packages into run memory (`apps/web/core/skills.js:18`); it does not persist arbitrary authored/community historical content/hash or a full endpoint configuration snapshot.

Maintainer narrowed the paragraph to those actual fields and the in-memory clone, expressly excluding complete historical reconstruction. Independently re-read. **Closed by source/content inspection.**

### RC4 — Skill-load interface passes a version where the tool accepts a path (P3)

`docs/architecture/skills.md:33` still described `load(id,version)` at the final read for this report. Actual fixed tool is `skills_load({id,path?})`; `readSkill(skills,id,path='SKILL.md')` reads a resource from the already pinned run snapshot (`apps/web/core/skills.js:19–24`). Version is not a load argument. Use the actual fixed-tool interface and explain run pinning separately. This is an adjacent documentation-only correction; no new runtime feature is requested. **Reported to maintainer; fresh subsequent review should verify closure.**

## Checks executed independently

- Checked 673 local Markdown link targets across the 30 README/checklist/architecture files against filesystem existence and Git tracked-or-eligible files using `/Library/Developer/CommandLineTools/usr/bin/git ls-files --cached --others --exclude-standard`. **Zero missing or ignored-only targets**, including linked figures and firmware/license directories. This establishes commit eligibility, not final pushed-commit inclusion.
- All eight README language bars have seven alternate-language links. Platform minimum, two product components, ten Skills, local/cloud data boundaries, Codex/MCP limits, HTTPS self-host routing and physical acceptance statements align across translations. The private remote repository is explicitly identified in current architecture/release documentation; MIT licensing is not presented as proof of public GitHub visibility.
- English and Simplified Chinese checklists each have **94 unique, matching inventory IDs**, identical status values at review, and **16 deferred phone groups P01–P16**. Rows distinguish automated, native browser, live Mac and content inspection evidence. The actual isolated-IDB delete/reopen/backup record is separate from permanent product Delete-button execution. Earlier UI omissions, synthetic model/phone workflows, C3 transport without HID and optional subscription/MCP limitations are kept explicit.
- Independently verified the ten Skill manifests' **10 resource SHA-256 hashes and byte sizes**; all **10 fenced JSON examples parse**. Content uses the current fixed tool/action vocabulary, bounded procedures and visible outcome requirements; challenge routing does not advertise a shipped universal solver or fabricated tool.
- Ran `node --test tests/web/runtime-integration.test.mjs tests/web/skill-download.test.mjs`: **28/28 passed**, including stable prefixes, real account/model selection, eight-language prompt instruction, owned authoring, opaque-state isolation, historical-system demotion, namespace safety, failed/oversized downloads and cancellation.
- Attempted the schema validator without changing the environment; the default `python3` lacks `jsonschema`, so this reviewer did **not** independently rerun the maintainer's 29 contract validations. That environment limitation is not a product finding. JSON parsing and manifest integrity checks above did execute successfully.

## Release boundary

This round found four content/interface inconsistencies, with RC1–RC3 independently closed during the round and RC4 sent for correction. It does not close the known final four-profile build/source hashes, final C3 image/TLS check, native Web Serial write, deployed changed-source asset verification, pushed CI or phone acceptance gates. It does not claim fresh live GitHub/site state or a complete eight-language visual sweep. A fresh review after the maintainer's RC4 correction is required before describing content as having no new findings.
