# iPhone Agent Harness

**English** · [简体中文](docs/readme/zh-Hans.md) · [繁體中文](docs/readme/zh-Hant.md) · [日本語](docs/readme/ja.md) · [Русский](docs/readme/ru.md) · [Deutsch](docs/readme/de.md) · [Français](docs/readme/fr.md) · [Español](docs/readme/es.md)

An open-source AI harness for operating an iPhone or iPad across apps, using a browser interface and an ESP32 Bluetooth HID bridge.

The target platform is **Safari on iOS/iPadOS 27 and later**. On iPhone and iPad, the site opens the Harness by default. Desktop visitors get the project home, Skill community and ESP32 setup/firmware pages. No native app or Android version is planned.

## Current state

The Web application, authenticated LAN firmware transport and device onboarding UI are implemented. The official site and signed Skill community are deployed at [igent.cc](https://igent.cc). Product-firmware physical acceptance is still in progress: compilation, host tests and browser simulations do not establish correct phone input or Safari-to-LAN connectivity.

Separate iPhone 12/iOS 27.0.1 experiments confirmed cross-app screen capture, background delayed/streaming requests, and four short real DeepSeek calls using both compatible protocols. Earlier experimental firmware demonstrated keyboard, Home, pointer and swipe input. These observations do not verify the new product firmware or promise unlimited background execution. See the [experiment report](docs/research/background-api.md) and [firmware boundaries](docs/architecture/firmware-implementation.md).

## What is included

- **Local sessions:** IndexedDB conversations, attachments, import/export, chat/plan/task modes and cancellation. Selected context and images are sent to the AI backend you configure; this project does not run a cloud session database.
- **Models and accounts:** configurable OpenAI/Anthropic-compatible endpoints, model discovery and multiple account profiles. Codex subscription device-code/refresh and Responses adapters are implemented. Actual Safari subscription sign-in and legacy endpoint CORS remain unverified; failures are shown instead of creating a fake connected account.
- **Context controls:** configurable compaction thresholds, target and response reserve budgets, image limits, model summaries or explicit extractive summaries. Estimates are heuristic. Stable request prefixes and reported provider cache usage help inspect caching; a cache hit is not guaranteed.
- **Screen images:** configurable maximum side and JPEG quality, with original dimensions, scale and timing metadata. Image compression and conversation compaction are separate controls.
- **Ten built-in Skills:** screen observation, temporal observation, task planning, phone navigation, text entry, list scrolling, drag-and-drop, recovery, challenge routing and Skill authoring. The tool set is fixed; Skills do not install executable plugins.
- **Owned Skills:** a local P-256 creator identity, encrypted identity backup/restore, editable self-authored Skills, and read-only community downloads. Publishing requires an explicit user action. The optional signed community API stores only deliberately published Skill packages and is deployed on the official site.

Credentials are held in memory by default. Users can opt into encrypted local storage and unlock it with a passphrase; credentials are not embedded in the static build. Read the [subscription notes](docs/research/codex-subscription.md) before treating compatibility code as a production sign-in guarantee.

## Two product parts

```text
apps/web/                         Static UI, Harness, local data, Skills
  community/                      Local authorship and signed community client
  api/                            Optional Worker/D1 Skill publishing backend
firmware/IPhoneAutomationHarness/  Arduino ESP32 bridge framework
prompts/ · specs/ · tests/ · docs/ Shared engineering material
```

The community belongs to the Web part. You can host the static site yourself; no community backend is needed for local use. Bridge onboarding is one-time Wi-Fi provisioning followed by per-device binding and mDNS reconnection. mDNS does not solve HTTPS, browser permissions or authentication by itself.

## Run locally

Use Node.js 22.13 or later; the community tests use Node's built-in SQLite.

```sh
npm ci
npm test
npm run build
npm run preview
```

Open localhost on desktop for preview. Phone screen sharing requires **HTTPS**. Deploy `build/site` to Cloudflare or another HTTPS host with the [documented page routing](docs/architecture/deployment.md#self-hosted-page-routing). Build output excludes local credentials, private sessions and downloaded reference repositories. Follow the [Arduino instructions](firmware/IPhoneAutomationHarness/README.md) for toolchain details; physical control still requires device acceptance.

## Architecture and validation

- [System, identities and synchronization](docs/architecture/system-blueprint.md)
- [Batch gestures and screenshot barriers](docs/architecture/actions.md)
- [Runtime implementation and context caching](docs/architecture/harness-runtime-implementation.md)
- [Context, storage and background runtime](docs/architecture/runtime.md)
- [Models, subscription access and MCP](docs/architecture/auth-and-backends.md)
- [Skill ownership and community API](docs/architecture/skill-community.md)
- [Eight-language behavior](docs/architecture/localization.md)
- [Official-site deployment and verification](docs/architecture/deployment.md)
- [Open-source Harness research](docs/research/harnesses.md)

Still to validate: public HTTPS site → local ESP32 connectivity on Safari, secure provisioning and target proof, real timed gestures and inertia, and one C3 controlling two phones without cross-target input. Tests and compiled code do not replace physical acceptance.

Acceptance checklist: [English](docs/acceptance/README.md) · [简体中文](docs/acceptance/zh-Hans.md). It inventories every feature and content item, records the desktop evidence and separates the deferred phone steps. Desktop preparation and final release checks belong to the project team.

Real Mac checks have now passed CA/DNS-verified HTTPS and production-client owner pairing against the C3. They sent no phone input; final-image verification and Safari/phone acceptance remain separate. See the [live C3 client record](docs/research/device-client-live-verification.json).

Manual releases: ordinary pushes never run Actions. A requested run reuses unchanged firmware, builds changed ESP32/C3/S3/C6 firmware, publishes binaries to Releases and deploys the same files with the website. [Release workflow and credential setup](docs/architecture/manual-release.md).

[MIT License](LICENSE) · [Third-party notices](THIRD_PARTY_NOTICES.md)
