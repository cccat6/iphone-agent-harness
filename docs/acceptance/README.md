# Using iPhone Agent Harness

[简体中文](zh-Hans.md) · [Website](https://igent.cc) · [Project](../../README.md)

Open the website in Safari on an iPhone or iPad to see your sessions. The home button opens the project page; “Open Harness” in that page’s header returns to your sessions. Desktop visitors can browse the project, explore skills and install ESP32 firmware.

Device status sits beside the session heading. **New session** is the only primary action at the bottom. Search is hidden until you pull down at the top of the list or tap the search icon. Cancel clears the filter and hides search. Settings is a directory with separate pages and back navigation; archived sessions and skill management are available there.

## Start a conversation

Open **Settings → Accounts or API → Add account or API**. For ChatGPT, select a ChatGPT account and follow the sign-in instructions. For an API, choose the OpenAI-compatible or Anthropic-compatible interface, enter the service’s **API endpoint** and key, load its model list, then save. You can also enter a model ID manually.

Choose **New session**, select a model at the bottom and send a message. The model picker switches between accounts, APIs and models. **Chat** is for discussion, **Plan** for observation and planning, and **Task** for carrying out actions. Connect your ESP32 bridge and complete its input test before creating a session. Existing sessions remain conversational when disconnected; the model receives the offline state and phone input fails with a specific bridge-unavailable reason. Phone actions also need screen sharing. Real ChatGPT subscription sign-in in Safari is still being verified.

## Sessions and backups

Messages and images are saved automatically in this browser. The session’s top-right menu provides rename, pin, archive, delete and **Export to file**. Use **Settings → Import session from file** to restore a file as a separate session.

On entry, the site asks the browser to retain its data. The browser may decide without showing a prompt. If retention has not been granted, retry under **Settings → Data on this device**. Export sessions when you want a backup; session files do not include sign-in credentials or API keys.

## Context and images

Under **Settings → Context and images**, automatic compaction defaults to **750,000 tokens**. At the threshold, the current model summarizes earlier messages while the full conversation stays on your device. If a model accepts a shorter context, the Harness also attempts compaction when that limit is reached.

Images keep their original dimensions and are saved as JPEG. Choose **Smaller files**, **Balanced** or **High quality** for images saved afterward.

## Skills

Open **Skills** to manage saved skills or add skills from the community. The official website uses its built-in community address; no API setting is required. Added skills stay in this browser and can be enabled, disabled or updated.

Create your own skill manually or ask the Harness to help write and revise it. Your own skills can be edited, exported or published; community downloads stay read-only. Before changing devices, export an encrypted backup under **Creator identity** so you can restore ownership of your skills.

## MCP tools

Under **Settings → MCP servers**, add a server, enter its name, MCP endpoint and optional access token, then choose **Save and connect**. Select the tools you want and enable them. You can add multiple servers and use their tools in Task mode.

The client supports Streamable HTTP. Access tokens stay in the current page’s memory and must be entered again after a reload.

## Phone and ESP32 connection

The default bridge address is **http://igent.local**, and a connection code is off by default. Harness fills the address automatically. Tap **Connect ESP32 bridge** to open its local connection tab, then return to Harness and keep that tab open. An existing live browser connection does not need this step again.

A bridge already on your home Wi-Fi needs no provisioning. Only a new unconfigured board needs the optional first-time Wi-Fi guide. System Bluetooth pairing is separate from the webpage's network connection; once the webpage connects, it can read the phone list and run the input test.

Saved connection details are reused. **Add or change bridge** is optional, for a custom address or a bridge that has explicitly enabled a code. Open **http://igent.local/settings** (or the custom address) to change the local hostname or enable/disable a connection code. Changing the hostname restarts the idle bridge and provides its new address. Multiple bridges can use distinct custom names.

Pair the phone with **iPhone Agent Bridge**, run the eight-digit input test and confirm it, then enable AssistiveTouch and share the screen. Full Keyboard Access need not be disabled.

Commands travel between the phone and ESP32 over the local network; the website server does not forward them. Closing the device connection tab disconnects it. After reconnecting, repeat the phone input test.

A real Safari 27.0.1 phone passed five GET/POST requests, including requests with both tabs hidden during screen sharing, over about 21 seconds. That does not establish unlimited background running, complete phone-control acceptance or compatibility with every network. See the [LAN connection evidence](../architecture/lan-connection.md).

<details>
<summary>File limits and developer references</summary>

Session import and export files have a 64 MiB limit, including images. Skill and creator-identity imports have a 10 MiB limit. Reaching the export limit does not remove the original conversation from the browser.

[Arduino guide](../../firmware/IPhoneAutomationHarness/README.md) · [Manual releases](../architecture/manual-release.md) · [Historical engineering record](../research/acceptance-before-ui-repair.en.md)

</details>

## Long text and the clipboard

The AI can prepare long or multilingual text during a task. Return to Harness and tap **Copy and continue**. Only a successful browser copy resumes the task; the AI must observe the screen, return to the intended app and confirm the input field before issuing Paste and checking the result. A failed copy does not resume. If saving the receipt fails, **Retry continuation** retries saving and continuing without another clipboard write.

Safari requires a foreground clipboard gesture; screen-sharing callbacks do not grant background clipboard permission. The OS or destination app may still require paste permission. Copy success is not proof of text entry. Switching sessions or input targets invalidates pending copy content.
