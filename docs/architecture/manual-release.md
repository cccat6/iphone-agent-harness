# Manual releases and firmware reuse

[简体中文](manual-release.zh-Hans.md)

The [Manual release workflow](https://github.com/cccat6/iphone-agent-harness/actions/workflows/checks.yml) runs through **Run workflow** on `main`. The workflow uses only the manual `workflow_dispatch` trigger. Each run uses its selected commit, and production runs are serialized.

## Release sequence

1. Install the locked dependencies and run Web, protocol, firmware and build-tool checks.
2. Calculate a firmware input fingerprint from the Arduino source, compiler recipe, pinned dependencies and board profiles.
3. Reuse matching published or checked-in firmware. When those inputs change, compile all seven profiles: C2 at 26 MHz and 40 MHz, C3, C5, C6, S3 and classic ESP32. C2 uses a 2 MB layout; the others use 4 MB.
4. Verify source provenance, dependencies, flash offsets, partition bounds, sizes and SHA-256 hashes.
5. Build the website with the selected firmware and flashing manifest.
6. Publish `firmware-<full-input-SHA256>`. A release contains 28 binary parts, manifest, build report, build-input record, a complete archive and `SHA256SUMS`. Draft uploads can resume; matching published releases are reused.
7. Apply the community database schema and deploy the Worker and website to `igent.cc`.
8. Read back deployed files and compare their hashes with the build. Save the verification reports as Actions artifacts.

Web-only changes rebuild the website and reuse the existing firmware. A retry after a deployment failure also reuses an already published matching firmware release.

## Deployment credential

Set `CLOUDFLARE_API_TOKEN` in [repository Actions secrets](https://github.com/cccat6/iphone-agent-harness/settings/secrets/actions). Use the configured account and `igent.cc` zone, with Workers Scripts edit, Workers Routes edit, Zone read and D1 edit permissions. Account, Worker, domain and database settings are in [wrangler.jsonc](../../wrangler.jsonc).

## Maintainer commands

```sh
python3 tools/firmware_release.py plan --offline
python3 tools/firmware_release.py verify
python3 tools/firmware_release_test.py
npm run build
npx wrangler deploy --dry-run
```

`plan` can look up releases with `GH_TOKEN` and `GITHUB_REPOSITORY`; `--offline` uses local artifacts. After compiling all declared profiles, `seal` verifies the artifacts and records their build inputs.

[Website deployment](deployment.md) · [Arduino guide](../../firmware/IPhoneAutomationHarness/README.md)
