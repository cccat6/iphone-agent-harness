# Manual releases and firmware reuse

[简体中文](manual-release.zh-Hans.md)

GitHub Actions runs **only when the owner requests it**. Ordinary pushes, pull requests, tags and Release publication do not start it. The workflow is [Manual release](https://github.com/cccat6/iphone-agent-harness/actions/workflows/checks.yml), implemented in [checks.yml](../../.github/workflows/checks.yml). Choose `main` and use **Run workflow** only when a release is wanted; an assistant must wait for an explicit request before dispatching it. The selected commit is fixed for the whole run. A push during a run does not silently change its tested/deployed source. Production runs are serialized.

## What one requested run does

1. Check that the deployment credential exists, install the locked Node dependencies, and run Web, contract, firmware host and release-tool tests.
2. Compute a firmware input fingerprint from all allowlisted Arduino source files, the compiler recipe, pinned dependencies, Arduino CLI version and all four board profiles. Web, README and private local configuration edits do not change it.
3. Reuse a complete, matching published firmware Release if available. Otherwise reuse the verified checked-in binaries if their sealed build inputs match. Only if neither exists, install the pinned toolchain and compile **ESP32, ESP32-C3, ESP32-S3 and ESP32-C6**, each for 4 MB flash. Source or build-configuration changes invalidate reuse. A missing/expired Actions cache does not cause recompilation because no Actions cache is used for binary reuse.
4. Verify source records, dependencies, profiles, USB settings, partition layout, offsets, sizes and SHA-256 hashes. The full four-profile set is mandatory. A corrupt/incomplete published Release fails explicitly instead of triggering a wasteful silent rebuild.
5. Build the website **after** selecting the firmware. The selected binaries live at `apps/web/firmware/<profile>/*.bin`, so the clean Web build includes exactly those files and their manifest for online flashing.
6. Create or reuse `firmware-<full-input-SHA256>` in GitHub Releases. A new Release is staged as a draft until its files are uploaded. Published firmware Releases are never overwritten by this workflow; incomplete drafts can be retried. If the draft already has its complete archive and checksum file, the workflow verifies and reuses it to repair missing loose assets without recompilation. Each Release has **16 individual `.bin` files**, the flashing manifest, build report, build-input record, a complete `.tar.gz` package and `SHA256SUMS`. The archive includes licenses. This is a workflow immutability policy, not protection against a repository owner manually editing assets.
7. Apply the idempotent community schema bootstrap, then deploy Worker `igent-web` and the clean static website to `igent.cc`, including all selected firmware files. The database command uses `CREATE ... IF NOT EXISTS`; it does not wipe community records. Future non-additive database changes need their own migration design.
8. Read back every deployed file and compare it with the exact clean build. The check includes all 16 firmware binaries. Save fresh deployment and firmware evidence as Actions artifacts; old checked-in reports are not uploaded as a substitute for a new check.

A Web-only release still builds and deploys the current website, but does **not** recompile unchanged firmware or create a duplicate firmware Release. If a deployment fails after Release publication, the next explicitly requested run reuses that firmware Release. The run never opens a serial port, flashes a physical board or verifies phone behavior.

## Deployment credential

The repository secret **`CLOUDFLARE_API_TOKEN`** is required. The existing account ID, Worker name, custom domain and D1 binding are already in [wrangler.jsonc](../../wrangler.jsonc); these are not secrets. Use a dedicated token scoped to the configured account and the `igent.cc` zone, with Workers Scripts edit, Workers Routes edit, Zone read and D1 edit permissions needed by the commands. Do not grant access to unrelated accounts/zones, put the token in Git or paste it into a conversation. Enter it directly in [repository Actions secrets](https://github.com/cccat6/iphone-agent-harness/settings/secrets/actions).

At this change's local verification, the repository had no deployment secret, and the connected Cloudflare service returned `9109 Unauthorized` for token-management endpoints. The workflow fails early with a clear message until that one credential is provisioned. No manual workflow, GitHub Release or Cloudflare deployment was executed as part of preparing this change. Those remote effects require the owner's later request. [Local verification](../research/manual-release-verification.json) records exact checks and remaining scope.

## Maintainer tools

```sh
python3 tools/firmware_release.py plan --offline
python3 tools/firmware_release.py verify
python3 tools/firmware_release_test.py
npm run build
npx wrangler deploy --dry-run
```

`plan` also supports authenticated Release lookup using `GH_TOKEN` and `GITHUB_REPOSITORY`; `--offline` never contacts GitHub. `seal` records the current build inputs **only after** the existing source/profile/dependency/artifact checks pass. Use it after a successful real four-profile compilation, not to relabel old binaries after a source/recipe change. The initial checked-in input record seals the already compiled four-profile artifacts; the installed Arduino CLI was independently checked as 1.5.1. No new compilation was needed for this workflow-only change.

Official references: [GitHub manual workflows](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow), [Cloudflare GitHub Actions deployment](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/).
