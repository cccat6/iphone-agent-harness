# Independent manual release review R1

Reviewed the manual-only workflow and firmware planner, packaging, recovery, tests, input seal, deployment verification delta, and linked release documentation. This round is finding-bearing; fixes belong to the implementation owner and require a fresh review.

## P1 — Source-only firmware changes fail unit checks before reaching compilation

Locations: `.github/workflows/checks.yml:48` and the original `tools/firmware_release_test.py:24-39,43-51,84-109,164-174`.

The workflow runs release tests before planning or compiling. The original fixture copies current firmware sources and the checked-in sealed binaries without creating a self-contained provenance record. Therefore a legitimate source or recipe change with unchanged checked-in artifacts makes tests expecting a valid package or repository reuse fail before the workflow can perform its intended fresh compilation.

Independent finite reproduction: copy only the relevant tools, complete firmware source/artifact fixtures, license and workflow into a temporary root; append a harmless comment to `src/Core.h`; run the release tests in that isolated root. Result: exit 1, two failures and three errors. The failures include `Firmware binary source is stale: src/Core.h; rebuild before publishing` and a repository-reuse assertion receiving `compile: true`. No repository source or binaries were changed by the reproduction.

The implementation owner was notified and is replacing the fixture with synthetic, self-contained artifacts. This R1 report records the original finding and does not certify the later fix.

## P2 — A complete draft is ignored during recovery

Location: `tools/firmware_release.py:165-174`.

A changed-firmware release can compile successfully, create its draft, upload all files, and then fail while changing the draft to published. On retry, the planner ignores every draft even when its full matching package is available. If checked-in binaries remain stale, it recompiles all four profiles despite unchanged inputs and an already uploaded valid package.

Independent finite reproduction used a complete package and its 21 asset metadata entries with `draft: true`, then invalidated the temporary checkout binary. With GitHub commands mocked, planning selected `origin: compile`, `compile: true` and made zero download attempts. A complete draft could instead be downloaded and verified using the same fail-closed path before reuse; a genuinely incomplete draft still needs a defined recovery path.

## Other bounded checks

The original current-tree release suite passed all 10 tests, the firmware seal verified, and local actionlint accepted the workflow. Those checks did not cover the source-only regression above. The only Actions trigger is workflow_dispatch and the production job is restricted to main. No Actions dispatch, GitHub release mutation, Cloudflare API/deployment, credential operation, serial port or phone operation was performed. This review does not claim live publishing or hardware acceptance.
