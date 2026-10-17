# Independent release/content review R2 — 2026-10-18

## Scope and method

Fresh source/content acceptance after R1. Re-read all eight user READMEs, the 20 current architecture documents, both complete checklists, the three prompt sources and ten built-in Skill bodies/manifests. Compared instructions with the current publishing/UI, Harness, Skill, action, firmware-capability and routing/build sources. Historical research and execution reports retain their dated candidate scope; the known release-final build, native Web Serial, deployment/CI and physical-phone gates are not new findings.

This reviewer changed only this report. No build, generated resource, binary, index, commit, deployment or remote repository was changed. No browser, serial port, board, phone, LAN or live API was accessed. Maintainers made the content repairs below concurrently.

## R1 closures independently verified

- **RC1 closed:** `web-ui.md:29` now names `communityEndpoint`, official-origin SITE_CONFIG default, explicit disable/self-host behavior, current-author ownership and explicit signed publishing. This matches `app.js:55,243,285–288`, `site-config.js` and the community client.
- **RC2 closed:** `prompts/system.md:27` says stop the current run and send the correction as the next message; no active-run delivery is promised. The app rejects submission while running/submitting. Read-only reconstruction of all generated inputs confirmed `core/assets.js` exactly matches the three prompt sources, ten Skills and plan schema, with revision `c53cf0e1f8b11af06e3f09333849a0d62e7f4435e603ad86db49cf38647b6479`.
- **RC3 closed:** `skills.md:18` now lists actual `run.started` fields and the cloned in-memory run packages, and explicitly excludes arbitrary authored/community historical hashes, full endpoint configuration and independent tool-schema versions. This matches `core/harness.js:89` and `core/skills.js:18`.
- **RC4 closed:** `skills.md:33` now uses `skills_list → select → skills_load({id,path?})`; version pinning is separate. The actual fixed schema accepts required `id` and optional `path`, and `readSkill()` reads the already selected run snapshot.

## New finding

### RC5 — Product resource descriptions retained older fixture/default values (P3)

At discovery, `device-client.md:113` called `maxEvents:256` the constrained product limit. `main.cpp:15–16,29` selects and asserts 128; `Wire.h:10` bounds advertised wire capacity by that selection, and `SecureService.h:64` advertises it. The 256-event mock fixture is valid but is not the product profile. The paragraph also repeated the older capability-absence fallback shorthand despite the later successful-discovery qualification.

Maintainer corrected the paragraph during review. Independently re-read: it now distinguishes product `128` from fixture `256` and permits the 98,304-byte legacy fallback only after a successful capability report lacks that field. **Those corrections are closed by source/content inspection.**

The same resource-description group includes `firmware-implementation.md:73` calling the current replay filter 64 kbit despite the later exact 7168-byte product note, and unconditional MSYS 8/8 wording in its resource overview and the firmware README despite their later classic-ESP32 8/0 exception. The maintainer assigned those summary-wording repairs to the firmware owner; a fresh following round must verify convergence. No new implementation or hardware feature is requested.

## Independent checks

- **673 local Markdown link targets across 30 files:** all exist and are Git tracked or eligible (`git ls-files --cached --others --exclude-standard`); none are ignored-only. This does not establish inclusion in the final pushed commit.
- **Eight READMEs:** seven alternate-language links each; platform minimum, ten Skills, two product parts, local/model/community data boundaries, optional subscription/MCP limits, HTTPS routing and pending physical acceptance remain aligned.
- **Both checklists:** 94 unique matching inventory IDs, identical status values, and all 16 deferred phone groups P01–P16. Automated/native/mock/live evidence remains distinguished. No final-image, all-eight-language visual sweep, physical-phone or complete release pass is inferred.
- **Ten Skills:** all ten resource byte sizes and SHA-256 hashes verified; all ten fenced JSON examples parsed. Examples remain bounded step/tool fragments, with actual fixed action vocabulary, fresh evidence and stopped/unknown recovery requirements. Challenge routing does not advertise a universal shipped solver.
- **29/29 design-contract validations passed** using the existing isolated validator dependencies. R1's missing-default-Python-dependency limitation is therefore resolved for this review without changing the environment.
- **28/28 targeted Web tests passed:** `runtime-integration.test.mjs` and `skill-download.test.mjs`. No asset synchronization/build hook was invoked.
- Repetition has defined boundaries: READMEs summarize and link contracts; both checklists carry translated matching IDs; self-contained Skill packages repeat their runtime contract for on-demand loading; dated research reports are snapshots. The stale resource summaries above are the concrete duplicate-content drift found in this round.

## Result and limits

All four R1 findings are independently closed. R2 found one additional P3 resource-description consistency group; its device-client correction is independently closed, while the assigned firmware summary corrections require fresh R3 verification. This is source/content acceptance only. Maintainer-owned four-profile build/source correspondence, final C3 image/TLS, native Web Serial writing, final deployment/push/CI and deferred phone acceptance remain separate gates.
