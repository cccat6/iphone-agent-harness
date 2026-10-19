# Phone use and acceptance

[简体中文](zh-Hans.md) · [Open Harness](https://igent.cc/) · [Project](../../README.md)

Use Safari on an iPhone or iPad. One Harness page connects the ESP32 bridge, shares the screen and runs tasks. The device management page is only needed for initial setup or configuration changes; it does not stay open during control.

## Check these eight steps

1. **Get the bridge information, then connect.** Join the same Wi-Fi as the bridge. Open Devices in Harness, choose **Get bridge information**, then **Return to device connection** when the information is ready. Choose **Connect ESP32 bridge** next. The browser saves the information before connecting and keeps this first step visible as completed on later visits. The setup link from the desktop installer can also import it; a configured board does not need Wi-Fi provisioning again.

2. **Pair the phone.** Pair **iPhone Agent Bridge** in iOS Bluetooth settings and enable AssistiveTouch using the tutorial. Select the connected phone in Harness; once it is ready, you can create a session and use control. The eight-digit connection test is optional: use it if you want to check actual input. Full Keyboard Access can remain on or off. Older firmware may still need the optional legacy test or an update; an unavailable test must not be shown as successful.

3. **Add an account or API and chat.** Under **Settings → Accounts or API**, add a connection, enter an API endpoint and key and load its models, or follow the ChatGPT sign-in interface. Create a session, select a model and a supported reasoning effort, then send a message. The first successful request should generate a title; later automatic results must not overwrite a manual rename. Reopen settings to check that the connection was saved. The keyboard should leave form inputs and back/close actions accessible.

4. **Share the screen and run a task.** Start with Clock or a dedicated test page. Share the screen and ask the AI to perform a tap, scroll or drag. Switch to the target app to observe the action, then return to inspect the screenshot and result. There is one conversation entry: capability questions receive answers, planning requests show a reviewable plan, and explicit action requests can execute. Stop screen sharing during an action to pause; Continue should request sharing again if needed and observe the current screen before proceeding.

5. **Check a precise control, then try long text.** In Clock, ask for a specific harmless time. The AI should try numeric entry when the control supports it; otherwise it should use small corrections, wait for the wheel to settle and verify the exact value before saving. A missed tap or overshoot should lead to a revised approach, not repeated blind actions. Then try long text. Open the [clipboard tutorial](https://igent.cc/shortcuts/clipboard.html), download **iPhone Agent Clipboard** and add it without changing its name. Ask Harness to prepare test text, choose **Copy with Shortcuts**, complete any system prompts and return. The task should wait for copy confirmation, then check the target field and paste. The foreground **Copy and continue** button is also available. With no pending text, running the Shortcut should finish immediately and leave the clipboard unchanged.

6. **Save and recover a session.** Swipe a normal session row to reveal **Rename** and **Archive**. In **Settings → View archived**, swipe an archived row for **Rename**, **Restore** and **Delete**; deletion must ask for confirmation. Pin the test session from its menu. Export it from its menu and use **Settings → Import session from file** to create an imported session. Check its messages and images. Pull down at the top of the list or tap the search icon to find a session. Long conversations load older pages as you scroll up; images load when visible. While reading older messages, new replies must leave your reading position in place. Tap **Latest** to return to the newest messages. Rotate the phone or zoom the page and check that input, back and close controls remain reachable.

7. **Use skills and MCP.** Add a community skill under **Settings → Skills**, or ask Harness to create and edit your own skill. Downloaded community skills remain read-only. If you have an MCP service, add it under **Settings → MCP servers**, select tools and try a read-only operation. Server settings, access tokens and tool choices should remain saved.

8. **Stop, disconnect and reconnect.** Stop a running task and confirm that phone actions cease. Disconnect the bridge: the session should show the ESP32 bridge as disconnected, and the AI may keep chatting but must identify the missing device and not send phone input. Reconnect, select the ready phone and resume. Repeat the optional input test only if desired or required by older firmware.

There is no default whole-task time or step cutoff. Stop always ends the run; losing screen sharing pauses it. Each action plan still has short safety limits, so continued work uses fresh observations and separate plans. This does not guarantee that iOS will keep Safari running indefinitely.

## Everyday settings

Messages and images are saved in this browser. Session exports exclude sign-in credentials and API keys. The site requests data retention on entry; if it was not granted, retry under **Settings → Data on this device**.

Session imports and exports are limited to **64 MiB**, including images; reaching the export limit does not delete the original session. Skill and creator-identity imports have a **10 MiB** limit. Before changing devices, export an encrypted **Creator identity** backup to restore ownership of your published skills.

**Settings → Context and images** offers a compaction threshold, defaulting to **750,000 tokens**, while preserving full local history. Images retain their dimensions without cropping and use JPEG with **Smaller files**, **Balanced** or **High quality** presets.

Change the bridge name at `http://igent.local/settings`, then use its new address. HTTP also supports Wi-Fi setup and Shortcut jobs; normal control uses WebRTC Direct. The project supplies a shared transport certificate configuration, with no certificate installation or per-board certificate upkeep.

Short phone prototype tests have succeeded in the foreground and during background screen sharing, with intermittent failures also recorded. Four firmware profiles compiled from source `d6d8f75211fd14b8aa57d3f5ebf0f32d7fa425fe4f588df263a4eeb62a4b244a`. That candidate has not been flashed or tested on the board because the authorized USB device is currently absent. Actual Shortcut import and the complete phone workflow still need physical acceptance. The [connection record](../architecture/secure-lan.md) keeps those results separate.

[Arduino guide](../../firmware/IPhoneAutomationHarness/README.md) · [Manual releases](../architecture/manual-release.md)

Internal Back/Forward navigation between a conversation, settings and website routes should preserve the current capture and bridge owner. Full reload or actual document exit still requires a fresh screen-sharing authorization.
