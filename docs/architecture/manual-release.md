# Manual releases and firmware reuse

[简体中文](manual-release.zh-Hans.md)

The [Manual release workflow](https://github.com/cccat6/iphone-agent-harness/actions/workflows/checks.yml) runs through **Run workflow** on `main`. The workflow uses only the manual `workflow_dispatch` trigger. Each run uses its selected commit, and production runs are serialized.

## Release sequence

1. Install the locked dependencies and run Web, protocol, firmware and build-tool checks.
2. Calculate a firmware input fingerprint from the Arduino source, compiler recipe, pinned dependencies and board profiles.
3. Reuse matching published or checked-in firmware. When those inputs change, compile all seven profiles: C2 at 26 MHz and 40 MHz, C3, C5, C6, S3 and classic ESP32. C2 uses a 2 MB layout; the others use 4 MB.
4. Verify source provenance, dependencies, flash offsets, partition bounds, sizes and SHA-256 hashes.
5. Build the website with the selected firmware and flashing manifest.
6. Publish `firmware-<full-input-SHA256>`. A release contains 28 binary parts, manifest, build report, build-input record, a complete archive and `SHA256SUMS`. Draft uploads can resume; matching published releases are reused. Published files are verified before that release becomes GitHub Latest.
7. Apply the community schema, deploy the regional relay with `wrangler.relay.production.jsonc`, then deploy the website Worker to `igent.cc`. The website calls the relay through `OPENAI_RELAY`; the relay has no public route or storage binding.
8. Read back deployed files and compare their hashes with the build. Save the verification reports as Actions artifacts.

Web-only changes rebuild the website and reuse the existing firmware. A retry after a deployment failure also reuses an already published matching firmware release.

## Deployment credential

Set `CLOUDFLARE_API_TOKEN` in [repository Actions secrets](https://github.com/cccat6/iphone-agent-harness/settings/secrets/actions). Use the configured account and `igent.cc` zone, with Workers Scripts edit, Workers Routes edit, Zone read and D1 edit permissions. Website, service binding, database and public-key cache settings are in [wrangler.jsonc](../../wrangler.jsonc). [wrangler.relay.production.jsonc](../../wrangler.relay.production.jsonc) configures the relay, which defaults to execution in `aws:us-east-1`.

## Maintainer commands

```sh
python3 tools/firmware_release.py plan --offline
python3 tools/firmware_release.py verify
python3 tools/firmware_release_test.py
npm run build
npx wrangler deploy --config wrangler.relay.production.jsonc --dry-run
npx wrangler deploy --dry-run
```

`plan` can look up releases with `GH_TOKEN` and `GITHUB_REPOSITORY`; `--offline` uses local artifacts. After compiling all declared profiles, `seal` verifies the artifacts and records their build inputs.

Firmware version comes from `src/FirmwareVersion.h`. Each build embeds the first 16 characters of the source SHA-256 as its build ID; the manifest and build report carry the same values.

Compilation writes into a staging directory and replaces the firmware set after every selected profile passes validation. The previous set stays available if compilation or validation fails. For a single-board build, use an isolated destination, for example `python3 tools/build_firmware.py --profiles esp32c3 --output build/c3-firmware`. The website directory always receives the full profile set.

[Website deployment](deployment.md) · [Arduino guide](../../firmware/IPhoneAutomationHarness/README.md)
