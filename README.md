# iPhone Agent Harness

**English** · [简体中文](docs/readme/zh-Hans.md) · [繁體中文](docs/readme/zh-Hant.md) · [日本語](docs/readme/ja.md) · [Русский](docs/readme/ru.md) · [Deutsch](docs/readme/de.md) · [Français](docs/readme/fr.md) · [Español](docs/readme/es.md)

An open-source AI harness for operating an iPhone or iPad across apps, using a browser and an ESP32 Bluetooth controller.

Designed for **Safari on iOS/iPadOS 27 and later**. iPhone and iPad visitors open the Harness by default; desktop visitors get the project home, skill community and ESP32 firmware installer.

Using the app: [English](docs/acceptance/README.md) · [简体中文](docs/acceptance/zh-Hans.md). These guides explain the main screens and everyday actions.

The website is at [igent.cc](https://igent.cc). Device control uses a local connection tab: return to Harness and keep that tab open. No certificate installation or cloud forwarding is needed. A Safari 27.0.1 phone test passed five GET/POST requests over about 21 seconds, including requests while both tabs were hidden during screen sharing. This does not establish unlimited background running or complete physical phone-control acceptance. See the [connection results](docs/architecture/lan-connection.md).

## Features

- **Sessions:** local conversations and images, search, rename, pin, archive, and file import/export. Chat, Plan and Task modes support different workflows.
- **Accounts or API:** multiple connections, OpenAI- and Anthropic-compatible API endpoints, model discovery and switching. The ChatGPT subscription adapter and login interface are implemented; real subscription sign-in in Safari still needs verification.
- **Context:** automatic model-generated summaries, a default trigger of **750,000 tokens**, and a configurable threshold. Full history remains on the device.
- **Images:** JPEG compression at three quality presets, preserving original dimensions.
- **Skills:** ten built-in skills, your own editable skills, community downloads and publishing. The official community address is built in. You can ask the Harness to help write and revise your own skills.
- **MCP:** add multiple Streamable HTTP servers, choose their tools independently and use them in Task mode.

Sessions stay in this browser; selected messages and images are sent to your chosen model service. API keys and login tokens stay in page memory by default, with optional encrypted local storage.

## Project and local development

The two product parts are `apps/web/` (website, Harness and skill community) and `firmware/IPhoneAutomationHarness/` (Arduino firmware). The site can also be self-hosted.

Use Node.js 22.13 or later:

```sh
npm ci
npm test
npm run build
npm run preview
```

Desktop previews use localhost. Phone screen sharing requires HTTPS. Deploy `build/site` using the [documented routes](docs/architecture/deployment.md#self-hosted-page-routing). The [Arduino guide](firmware/IPhoneAutomationHarness/README.md) describes supported boards and builds.

**Manual releases:** normal pushes do not run GitHub Actions. On request, the workflow reuses unchanged firmware, builds changed ESP32/C3/S3/C6 versions, publishes the binaries to Releases, and deploys the same files with the website. [Release setup](docs/architecture/manual-release.md).

[Architecture](docs/architecture/system-blueprint.md) · [Actions and screenshots](docs/architecture/actions.md) · [Accounts and MCP](docs/architecture/auth-and-backends.md) · [Skill ownership](docs/architecture/skill-community.md) · [Languages](docs/architecture/localization.md)

[MIT License](LICENSE) · [Third-party notices](THIRD_PARTY_NOTICES.md)
