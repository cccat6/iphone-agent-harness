# Setup and everyday use

**English** · [简体中文](zh-Hans.md) · [繁體中文](zh-Hant.md) · [日本語](ja.md) · [Русский](ru.md) · [Deutsch](de.md) · [Français](fr.md) · [Español](es.md) · [Project](../../README.md) · [Open Harness](https://igent.cc/) · [Architecture](../architecture/overview.md)

You need an iPhone or iPad running iOS/iPadOS 27 or later, a supported ESP32 board, USB power, local Wi-Fi and a compatible AI account or API. Use a desktop Chrome or Edge browser for firmware installation. You do not need Arduino, Xcode, a developer account, or a local compiler for the prebuilt installer.

The phone and bridge use the same normal Wi-Fi network. The bridge does not plug into the phone: after setup it can stay powered in a convenient place within Bluetooth range. Use a computer for the one-time Wi-Fi provisioning below so the phone never needs to join the bridge's setup hotspot.

## Contents

[AssistiveTouch](#accessibility) · [Firmware](#flash) · [Wi-Fi](#wifi) · [Bluetooth](#bluetooth) · [Open Harness](#open-harness) · [Models](#models) · [Connect and test](#bridge) · [Clipboard](#clipboard) · [Community skills](#install-skills) · [Create a skill](#authoring) · [Publish](#publish)

<a id="accessibility"></a>
## 1. Enable AssistiveTouch

On the phone, open **Settings → Accessibility → Touch → AssistiveTouch** and turn it on. The bridge uses this system feature to turn Bluetooth pointer input into app interactions. You can leave Full Keyboard Access at your existing setting; it is not required for the bridge's Home action or pointer control.

<a id="flash"></a>
## 2. Install the ESP32 firmware in your browser

1. On a computer, open [Flash firmware](https://igent.cc/flash) in Chrome or Edge.
2. Choose the profile matching the chip printed on your board. The installer lists the currently built variants. ESP32-C2 needs at least **2 MB flash**; all other listed chips need **4 MB**. PSRAM, displays and external sensors are not required.
3. Connect the board to the computer using a USB **data** cable. Select **Choose USB device and install**, then select that board in the browser's serial-port chooser.
4. Wait for installation and verification to finish. If the board does not enter download mode automatically, hold BOOT while connecting or resetting it, then release BOOT and retry.
5. Choose **Read device information** and select the same board. The page shows its setup Wi-Fi name/password and a phone connection link. Keep this information available for the next steps.

USB is for firmware installation, reading setup information and supplying power. During phone operation, a power adapter or another USB power source is enough; there is no phone-to-board cable.

The single **ESP32-C2** installer option automatically selects the 26 or 40 MHz crystal image. Its 2 MB image uses a single application partition without OTA. C2 connects through **USB-to-UART** (often built into the board), not native USB CDC. The **ESP32-C5** image uses 80 MHz flash and native USB CDC.

<a id="wifi"></a>
## 3. Put the bridge on your normal Wi-Fi

For a new board, complete this once:

1. On the **computer**, temporarily join the setup Wi-Fi shown by the installer, named `iPhone-Harness-…`, using its displayed password.
2. Open `http://192.168.4.1` and enter the name and password of your normal local Wi-Fi. A 2.4 GHz network works with all supported variants.
3. Wait for the page to confirm connection, then switch the computer back to that normal Wi-Fi.
4. Keep the phone on the same local network. The phone does **not** need the board's access point or a cellular-data workaround.

The bridge remembers these Wi-Fi details locally. On later power-ups it reconnects to that network. If you already configured the board, skip provisioning. The local manager at `http://igent.local/settings` can be used for the exposed device settings, including its local name.

<a id="bluetooth"></a>
## 4. Pair the Bluetooth input bridge

Open **Settings → Bluetooth** on the phone and pair **iPhone Agent Bridge**. Keep AssistiveTouch enabled. The system Bluetooth connection is separate from the browser-to-bridge network connection: the former delivers input to iOS, while the latter delivers agent commands to the board.

After a firmware change that alters the HID reports, forget the old system Bluetooth record and pair it again. A normal page refresh or model change does not require pairing again.

<a id="open-harness"></a>
## 5. Open Web Harness

Open [igent.cc](https://igent.cc/) in Safari on the phone. Supported iPhone/iPad browsers enter the Harness; computer visitors get the homepage, skill community and firmware installer. No companion iOS app, certificate profile, Safari extension or Developer Mode is needed.

When you start an operation, Safari asks you to share the screen. Allow sharing and leave the phone unlocked while it works. This is the normal iOS screen-sharing prompt. You do not need experimental local-network flags or an additional network-authorization workaround. Ending sharing pauses an active task; **Continue** requests sharing again if needed.

<a id="models"></a>
## 6. Configure an API or ChatGPT account

Open **Settings → Accounts or API → Add**. You can keep several connections and switch their models from the conversation's model selector.

### API endpoint and key

1. Select an **OpenAI-compatible** or **Anthropic-compatible** API.
2. Enter the provider's endpoint, API key and a name for this connection. Use the form's endpoint hint: a service root or `/v1` base works, and a complete supported operation URL is normalized by the adapter.
3. Choose **Fetch models**. Select a default model from the list or type a model ID. All discovered models remain available in the session selector.
4. Save. For phone tasks choose a model that can understand images and call tools. Set a supported reasoning effort from the selector when available.

Keys are saved in this browser. A selected request goes directly to that provider; it is not relayed through the website host. Your provider must allow browser requests from the site you use.

### ChatGPT subscription account

First enable device-code login in your ChatGPT security settings; a managed workspace may require its administrator to enable it. Then select the ChatGPT/Codex account option in Harness, start device-code sign-in, open the official verification page shown in the form, and enter the displayed code. Complete sign-in there, return to Harness and choose the completion button. Load available models and save the connection. The returned credentials are kept locally and refreshed by the account adapter. This is a subscription connection rather than an ordinary OpenAI API key; the official sign-in service must be reachable from your browser. See [OpenAI’s device-code authentication instructions](https://learn.chatgpt.com/docs/auth#preferred-device-code-authentication-beta).

<a id="bridge"></a>
## 7. Connect the bridge and optionally test input

1. Open **Devices** from the session list or a conversation's bridge status.
2. If no connection information is saved, choose **Get bridge information**. Open the local bridge page, then use its return link. This imports the board's address and public WebRTC connection information. The installer's phone connection link can supply the same information.
3. Choose **Connect ESP32 bridge** and select the paired, input-ready phone when necessary. Once information is saved, future use starts with Connect; you do not need provisioning again.
4. If you want to verify native keyboard input, choose **Start input test** once and leave that page focused. The board types eight digits into its test field and the browser confirms the result automatically. The test is optional on current firmware.

**Refresh** only reads state. “Bridge connected,” “phone Bluetooth connected” and “phone input ready” are different states. If input is still initializing, wait briefly and refresh. A known rate-limited test shows a countdown and can retry once; an unknown physical outcome is not blindly resent. Connection errors show their status and reason.

Try a short task such as “Open Clock and set an alarm for 7:00.” Allow screen sharing when asked and switch to the target app. The agent observes, performs actions and verifies the result. It returns to this Harness session by default; turn off **Settings → Task completion → Return to Harness** to leave the target app open.

<a id="clipboard"></a>
## 8. Set up clipboard copy with Shortcuts

1. On the phone, open the [clipboard tutorial](https://igent.cc/shortcuts/clipboard.html) and download the signed Shortcut.
2. Add it in Apple's Shortcuts app as **iPhone Agent Clipboard**, keeping that exact name.
3. Connect the bridge in Harness. When the agent prepares text, choose **Copy with Shortcuts**. If iOS asks the Shortcut to access the local bridge URL, allow it; this is the Shortcut's own permission prompt.
4. After copying, return to Harness. It waits for the copy receipt and checks the intended destination field before pasting.

Text is supplied from the browser to the bridge in chunks and returned through one local HTTP response to the Shortcut. The bridge does not need to buffer the whole text. With no pending clipboard job, running the Shortcut returns no text and leaves the clipboard unchanged. The foreground **Copy and continue** action is also available without the Shortcut.

<a id="install-skills"></a>
## 9. Install a community skill

On the phone, open **Settings → Skills → Community**, or visit the [skill community](https://igent.cc/skills). Read a skill's instructions and choose **Add to local**. Built-in skills are listed alongside community publications and are already available locally. Toggle an installed skill on or off in the local skill list.

Reloading the page updates built-ins and checks for updates to unmodified community installs. Your enable choices and locally changed content are retained. An active task continues with the versions it started with; updates apply to subsequent tasks. Community downloads remain read-only and keep their original author.

<a id="authoring"></a>
## 10. Create and improve your own skill

On a computer, open [Skills](https://igent.cc/skills) and choose **Create your own skill** under **Create and publish**. On the phone use **Settings → Skills → Create**. Give it a name, a lowercase slug, a short description and Markdown instructions, then save the local draft.

You can also ask Harness to create or improve your own skill. Describe the goal, when the procedure applies, the controls to use, what a successful screenshot should show and what to change after a failed attempt. Community downloads and built-in skills stay read-only.

Ownership is a browser-generated signing identity, available on computers as well as iOS. Before moving to another browser or device, export your skill file and the encrypted **Creator identity** backup. Restore the identity and import your own skill file to continue editing under the same author.

<a id="publish"></a>
## 11. Share a skill

On the community page, choose **Publish** for your own draft; on the phone open the skill's sharing panel and choose **Publish to community**. Review it and confirm publication. The public package is signed by your local creator identity. Editing and publishing your own skill again creates its next version; other users receive the update when their installed copies refresh.

Use [Issues](https://github.com/cccat6/iphone-agent-harness/issues) for bugs and feature requests, and [pull requests](https://github.com/cccat6/iphone-agent-harness/pulls) for code, docs and translations. Share custom skills through the website community rather than a code PR.

## Sessions and self-hosting

The session-list title switches between **Sessions** and **Archived**. Swipe a row for Rename/Archive, or Rename/Unarchive/Delete in the archive. Older messages load as you scroll; incoming replies preserve your reading position. Use **Latest** to return to the current output.

Sessions, stored images and credentials stay in the current browser. Export sessions from their menu and import them in Settings; exports exclude credentials. The website host supplies pages and public skills, while selected model/MCP data goes directly to those configured services. You can also [host the web harness yourself](../architecture/deployment.md).
