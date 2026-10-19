# Development checks

Install Node.js 22.13 or later, then run:

```sh
npm ci
npm test
npm run build
```

Firmware checks and pinned build dependencies are documented in the [Arduino guide](../../firmware/IPhoneAutomationHarness/README.md). The [manual release workflow](manual-release.md) runs the repository checks, verifies firmware provenance and compares deployed files with the selected build.

For a phone workflow, use the [setup guide](../guide/README.md). Check a complete task from screen sharing through phone input to the visible result. Also check Stop, sharing pause/resume, reconnect and clipboard text. Record the board, firmware, iOS and browser versions with a reproducible issue.
