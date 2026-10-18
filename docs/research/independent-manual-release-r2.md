# Independent manual release review R2

Result: **no new actionable findings in the reviewed delta** after a fresh independent read and the bounded checks below. This is a local configuration and tooling review; it does not establish a successful remote release, deployment, or physical flashing session.

## Scope and review method

Reviewed `.github/workflows/checks.yml`, `tools/firmware_release.py`, `tools/firmware_release_test.py`, the `--output` change in `tools/verify_release_site.mjs`, `apps/web/firmware/build-inputs.json`, and both `docs/architecture/manual-release*.md` documents. Read the underlying firmware builder, Web build copy path, relevant test references, package configuration and deployment configuration to check integration assumptions. The implementation owner owns fixes; this review changed no implementation files.

Checked the manual-only trigger and main-branch restriction, serialized production runs, firmware fingerprint boundaries, all-four-profile verification, archive extraction limits, published-release immutability policy, draft recovery, checksummed packaging, selection before the website build, and ordering of publication, deployment and readback.

## Executed local checks

- `python3 tools/firmware_release_test.py`: **11 tests passed**. This includes complete draft archive recovery despite missing loose assets and a stale checkout binary; mocked publication repairs draft assets without compilation and does not overwrite a published release.
- Repeated the complete 11-test suite in two separate temporary copied roots. In one root, appended a harmless comment to `firmware/IPhoneAutomationHarness/src/Core.h`; in the other, appended a harmless comment to `tools/build_firmware.py`. **Both suites passed, exit 0.** These copied roots contained the relevant tools, source, workflow and license, with no checked-in production firmware binaries. This independently exercises the original R1 pre-compilation regression after its fixture fix.
- Local `build/actionlint/actionlint .github/workflows/checks.yml`: **passed**.
- `python3 tools/firmware_release.py verify`: **passed**, covering the current sealed inputs and four-profile artifacts.
- Executed the unchanged readback verifier with its new `--output` option in an isolated temporary fixture. A local fake `undici` module supplied responses without any network access. The fixture contained an index, manifest and all **16** profile/part binary paths. Exact bytes produced **18 checks, exit 0, passed true**. Changing only the fake ESP32-C6 application response produced **18 checks, exit 1, passed false**. Each case wrote the requested report path and did not write the default checked-in report path.

The copied-root and fake-readback fixtures were temporary and were removed automatically. Synthetic binaries were never copied into the product firmware directory.

## R1 disposition

The two earlier findings are addressed in the reviewed implementation: release tests now construct self-contained synthetic artifacts, and a draft containing the matching archive plus checksum file enters the strict restore path before missing loose assets are repaired during publication. The fresh source/recipe regressions above passed; this conclusion is not based solely on the unchanged-source suite passing.

## Remaining external scope

The documented missing GitHub deployment secret and Cloudflare connector `9109 Unauthorized` remain an external prerequisite reported by the implementation owner; this round did not inspect or provision credentials. A future explicitly requested release must still establish real compilation when inputs change, GitHub asset publication/reuse, Cloudflare deployment, and complete live file readback. Configuration push and verification that no Actions run starts belong to the implementation owner's final receipt.

This review performed no workflow dispatch, release write, Cloudflare/API operation, credential operation, compiler run, serial-port operation or phone test. Commands that display publication messages in the unit suite use mocked GitHub calls and do not publish anything.
