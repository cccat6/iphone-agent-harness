# iPhone Agent Harness

**English** · [简体中文](docs/readme/zh-Hans.md) · [繁體中文](docs/readme/zh-Hant.md) · [日本語](docs/readme/ja.md) · [Русский](docs/readme/ru.md) · [Deutsch](docs/readme/de.md) · [Français](docs/readme/fr.md) · [Español](docs/readme/es.md)

An open-source AI harness for operating an iPhone or iPad across apps, using a browser and an ESP32 Bluetooth controller.

Designed for **Safari on iOS/iPadOS 27 and later**. iPhone and iPad visitors open the Harness by default; desktop visitors get the project home, skill community and ESP32 firmware installer.

Using the app: [English](docs/acceptance/README.md) · [简体中文](docs/acceptance/zh-Hans.md). These guides explain the main screens and everyday actions.

The website is at [igent.cc](https://igent.cc). The Harness page connects directly to the local ESP32 bridge with **WebRTC Direct**; no extra connection tab, connection code or certificate installation is needed. Import bridge information once from the USB setup link or the local settings page, then reconnect from Harness. The integrated RTC/BLE firmware is undergoing hardware validation; see the [connection guide and results](docs/architecture/secure-lan.md).

## Features

- **Sessions:** local conversations and images, search, rename, pin, archive, and file import/export. Discussion, planning and execution share one conversation; asking for a plan does not start it. The first request also gets an automatic title; manual names and imported titles are preserved.
- **Accounts or API:** multiple connections, OpenAI- and Anthropic-compatible API endpoints, model discovery and switching. The ChatGPT subscription adapter and login interface are implemented; real subscription sign-in in Safari still needs verification. Supported models offer a Reasoning Effort selector, with the choice saved separately for each account and model.
- **Context:** automatic model-generated summaries, a default trigger of **750,000 tokens**, and a configurable threshold. Full history remains on the device.
- **Images:** JPEG compression at three quality presets, preserving original dimensions.
- **Skills:** ten built-in skills, your own editable skills, community downloads and publishing. The official community address is built in. You can ask the Harness to help write and revise your own skills.
- **MCP:** add multiple Streamable HTTP servers, choose their tools independently and use authorized tools during execution.

Sessions stay in this browser; selected messages and images are sent to your chosen model service. API keys and login tokens are saved in this browser, separately from sessions and exports. No unlock password is needed; clearing website data removes these credentials.

API endpoints accept a base such as `https://api.example.com/v1` or a complete `/chat/completions` URL; Anthropic-compatible services also accept `/v1/messages`. The editor explains the prefix to use. Load the model list, then select or type the default model in one field. Every discovered model remains available in the conversation model picker.

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
