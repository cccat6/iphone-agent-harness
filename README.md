# iPhone Agent Harness

**English** · [简体中文](docs/readme/zh-Hans.md) · [繁體中文](docs/readme/zh-Hant.md) · [日本語](docs/readme/ja.md) · [Русский](docs/readme/ru.md) · [Deutsch](docs/readme/de.md) · [Français](docs/readme/fr.md) · [Español](docs/readme/es.md)

**A browser-based iPhone helper with a roughly US$2 ESP32-C3.**

Give your iPhone a task in plain language: inspect a screen, enter text, adjust a control or follow a short workflow across apps. A small powered ESP32 bridge supplies Bluetooth input while Safari runs the conversation and screen capture.

[Open Harness](https://igent.cc/) · [Browser installer](https://igent.cc/flash) · [Full guide](docs/guide/README.md) · [Skill community](https://igent.cc/skills) · [Architecture](docs/architecture/overview.md)

- **Flash in your browser.** Use the ready-made firmware with desktop Chrome or Edge—no compiler, Arduino setup or app build is needed.

- **Keep the phone wireless.** After setup, the bridge can stay powered on a shelf or in a room corner within Bluetooth/Wi-Fi range; no USB cable to the phone is needed.

- **Use your normal network.** Phone and bridge join the same LAN Wi-Fi. The bridge hotspot is only for initial provisioning. No native app, certificate installation, helper tab or separate LAN relay service is required; grant the normal screen-sharing prompt when you choose to share.

![Illustrated placeholder: browser, ESP32 bridge and phone. A demonstration video/GIF is coming soon.](apps/web/media/demo-placeholder.svg)

Demo video / GIF coming soon.

## How it works

Safari captures the phone screen and sends selected context to your chosen AI. The Harness validates an action plan, sends it directly to the ESP32 over local WebRTC, and the bridge delivers Bluetooth mouse/keyboard input. The next screen observation closes the loop.

![Architecture: browser, chosen AI, local ESP32 and phone](docs/media/architecture.svg)

[Architecture details](docs/architecture/overview.md)

## Choose a board

For an illustrative starter budget, allow roughly **US$2** for a basic ESP32-C3 board. Actual prices vary with vendor, shipping and board design. Use the exact chip profile shown by the installer and a data-capable USB cable.

| Chip | Firmware availability | Notes |
|---|---|---|
| ESP32-C2 | Prebuilt download | 2 MB minimum; 26/40 MHz auto; USB-to-UART; single app, no OTA |
| ESP32-C3 | Prebuilt download | 4 MB flash; browser installer |
| ESP32-C5 | Prebuilt download | 4 MB flash; 80 MHz flash profile; native USB CDC |
| ESP32-C6 | Prebuilt download | 4 MB flash; browser installer |
| ESP32-S3 | Prebuilt download | 4 MB flash; browser installer |
| ESP32 (classic) | Prebuilt download | 4 MB flash; browser installer |

## Set up and try it

The complete guide covers every step. These links take you to the relevant section:

1. **[Enable accessibility](docs/guide/README.md#accessibility).** Enable AssistiveTouch; Full Keyboard Access may be on or off.

2. **[Flash firmware](docs/guide/README.md#flash).** Open the desktop installer, select the chip and install its image.

3. **[Join Wi-Fi](docs/guide/README.md#wifi).** Provision normal 2.4 GHz Wi-Fi once, then return the phone to the same LAN.

4. **[Pair Bluetooth](docs/guide/README.md#bluetooth).** Pair iPhone Agent Bridge in iOS settings.

5. **[Open Harness](docs/guide/README.md#open-harness).** Use Safari on iOS/iPadOS 27+ and keep the phone unlocked for the task.

6. **[Add AI access](docs/guide/README.md#models).** Save an OpenAI/Anthropic-compatible endpoint/key or follow the ChatGPT login interface; fetch and choose a model.

7. **[Connect and test the bridge](docs/guide/README.md#bridge).** Import its connection link, connect, select the ready phone and optionally run the digit test.

8. **[Install the clipboard Shortcut](docs/guide/README.md#clipboard).** Add iPhone Agent Clipboard for long/multilingual text; wait for copy confirmation before paste.

9. **[Install a community skill](docs/guide/README.md#install-skills).** Browse the public catalog and add a skill to this browser.

10. **[Create your own skill](docs/guide/README.md#authoring).** Write/edit guidance on desktop or phone; browser cryptographic identity owns it.

11. **[Publish a skill](docs/guide/README.md#publish).** Explicitly publish a package you want public; back up your creator identity.

## Conversations that keep their place

Questions, reviewable plans and actions share one conversation. The session-list title switches active/archived views; swipe for rename/archive or restore/delete. Reading old messages stays in place while replies arrive; **Latest** returns to recent messages. Export/import includes images. The AI verifies before finishing and returns to Harness by default; change this under **Settings → Task completion**.

Twelve built-in skills cover observation, planning, input, recovery, clock controls and gesture correction. Built-in and downloaded skills are read-only, check for updates on refresh and preserve enable choices. Your own skills are editable; their publishing identity belongs to the browser, not an iOS UID. Optional MCP connects selected tools from CORS-compatible Streamable HTTP servers.

## Your data and your hosting

Sessions, keys, login tokens and screenshots are saved in your browser. Our host does not receive your sessions, screenshots or model keys: it serves the static app and public skill packages; selected messages/images go directly to your chosen model service, and authorized MCP calls go to the server you configure. Publishing sends the skill package you explicitly choose. Export important sessions and separately back up creator identity before clearing data or moving browsers.

Hardware features are experimental: gestures, background capture, Shortcuts and multi-phone reliability need checks on the intended devices. Safari can suspend background work. The bridge has one active WebRTC peer; current ChatGPT subscription login compatibility must be checked in Safari. Stop remains available, and each action plan has safety limits.

## Build, self-host and contribute

Self-host the Web app, configure your own model services and optionally run a public-skill API. Issues and pull requests are welcome. Share reusable skills through the website community.

For local development, use Node.js 22.13 or later.

```sh
npm ci
npm test
npm run build
npm run preview
```

[Arduino guide](firmware/IPhoneAutomationHarness/README.md) · [Self-hosting](docs/architecture/deployment.md) · [Manual releases](docs/architecture/manual-release.md)

[MIT License](LICENSE) · [Third-party notices](THIRD_PARTY_NOTICES.md)

## Acknowledgements

Thanks to [onehumanbeing/esp32-iphone-agent](https://github.com/onehumanbeing/esp32-iphone-agent) for inspiration. This project follows its own browser, screen-capture and Bluetooth-bridge design.
