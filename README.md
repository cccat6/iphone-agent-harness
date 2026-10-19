# iPhone Agent Harness

**English** · [简体中文](docs/readme/zh-Hans.md) · [繁體中文](docs/readme/zh-Hant.md) · [日本語](docs/readme/ja.md) · [Русский](docs/readme/ru.md) · [Deutsch](docs/readme/de.md) · [Français](docs/readme/fr.md) · [Español](docs/readme/es.md)

An open-source browser harness that lets AI operate an iPhone or iPad across apps through an ESP32 Bluetooth bridge.

[igent.cc](https://igent.cc) · [GitHub](https://github.com/cccat6/iphone-agent-harness)

![Illustrated placeholder: browser, ESP32 bridge and phone. A demonstration video/GIF is coming soon.](apps/web/media/demo-placeholder.svg)

Illustrated placeholder: browser, ESP32 bridge and phone. A demonstration video/GIF is coming soon.

## Start in five steps

You need Safari on iOS/iPadOS 27 or later, an ESP32/C3/S3/C6 board with at least 4 MB flash, a data-capable USB cable, local 2.4 GHz Wi-Fi and an AI account or compatible API. Desktop Chrome or Edge is needed for browser flashing.

1. **Install the bridge.** Open the desktop firmware installer, choose your board and flash it. Read its device information and keep the phone connection link. For a new board, join the setup Wi-Fi and follow its page to save your normal Wi-Fi; return the phone to that network.

2. **Connect your phone.** Open the supplied link or use Get bridge information in Harness. Save the information, return and choose Connect ESP32 bridge. In iOS Bluetooth settings pair iPhone Agent Bridge, enable AssistiveTouch and select the ready phone. The eight-digit input test is optional on current firmware; Full Keyboard Access may be on or off. No connection code, certificate installation or extra connection tab is needed.

3. **Choose an AI.** Under Settings → Accounts or API, add an API endpoint/key and load models, or follow ChatGPT sign-in. Select or type the default model; all discovered models remain selectable. Create a conversation and choose a model and supported reasoning effort.

4. **Share and ask.** Start screen sharing and give a short task, such as setting a test alarm. Capability questions receive an answer; asking for a plan shows a reviewable plan; explicit action requests may execute. Keep the phone unlocked and watch the first tasks. Stop ends the run; loss of sharing pauses it and Continue requests sharing again.

5. **Review the result.** The AI verifies the result before ending. By default it then returns to Harness; turn this off under Settings → Task completion to stay in the target app. Confirm the visible outcome yourself before using consequential tasks.

## Everyday use

- Use the session-list title selector to switch between conversations and archives. Swipe a normal row for Rename/Archive, or an archived row for Rename/Restore/Delete. Deletion asks for confirmation. Search by pulling down the list or using the search button.

- Older messages load as you scroll up. New replies preserve your reading position; Latest returns to recent messages. Export a conversation from its menu and import under Settings. Export/import includes images, with a 64 MiB file limit.

- For long or multilingual text, install iPhone Agent Clipboard from the clipboard tutorial. Use Copy with Shortcuts, or Copy and continue in the foreground. Execution waits for copy confirmation, then checks the target field before pasting.

- Twelve built-in skills cover observation, planning, navigation, text, scrolling, drag/drop, recovery, challenges, authoring, clock controls and gesture correction. Precise controls use direct numeric editing when available, otherwise small observed corrections and settling waits.

- Create, edit and publish your own skills on desktop or phone. Ownership uses a browser-generated cryptographic identity, not an iOS device ID. Export its encrypted backup before changing browsers. Built-in and downloaded community skills stay read-only and check for updates on refresh; enabled/disabled choices remain. Failed updates retain the installed version.

- Optional MCP supports multiple browser-accessible Streamable HTTP servers. Select and authorize their tools explicitly; servers must support browser CORS. It does not launch stdio programs or provide full remote OAuth hosting.

## Data and limits

Conversations, images, API keys and login tokens are stored in this browser; credentials are separate from conversation exports and do not require an unlock password. Selected messages/images go to your model provider. Clearing site data removes local data, so export important sessions. Public skill publishing sends only the package you deliberately choose.

Use experimental hardware features with supervision. Integrated phone gestures, background capture, Shortcut behavior and multi-phone operation need testing on your own devices; compilation and desktop checks do not prove these outcomes. Safari may pause background work. Tasks have no default whole-task time/step cutoff, but each action plan retains safety limits. Real Safari ChatGPT subscription sign-in and refresh remain compatibility boundaries. The current bridge supports one active WebRTC peer; multiple saved browser clients do not imply simultaneous control. The latest multi-client enrollment/import repair is prepared in source, not yet physically flashed and validated.

## Develop and self-host

Use Node.js 22.13 or later. The two product parts are apps/web and firmware/IPhoneAutomationHarness. The website is static with an optional signed public-skill API. Phone screen sharing needs HTTPS.

```sh
npm ci
npm test
npm run build
npm run preview
```

Releases are manual: normal pushes do not run GitHub Actions. See the release guide for firmware reuse, release assets and deployment.

[Phone guide](docs/acceptance/README.md) · [Arduino guide](firmware/IPhoneAutomationHarness/README.md) · [Architecture](docs/architecture/overview.md) · [Self-hosting](docs/architecture/deployment.md) · [Manual releases](docs/architecture/manual-release.md) · [Clipboard tutorial](https://igent.cc/shortcuts/clipboard.html)

[MIT License](LICENSE) · [Third-party notices](THIRD_PARTY_NOTICES.md)
