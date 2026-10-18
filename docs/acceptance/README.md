# Phone use and acceptance

[简体中文](zh-Hans.md) · [Open Harness](https://igent.cc/) · [Project](../../README.md)

Use Safari on an iPhone or iPad. One Harness page connects the ESP32 bridge, shares the screen and runs tasks. The device management page is only needed for initial setup or configuration changes; it does not stay open during control.

## Check these eight steps

1. **Get the bridge information, then connect.** Join the same Wi-Fi as the bridge. Open Devices in Harness, choose **Get bridge information**, then **Return to device connection** when the information is ready. Choose **Connect ESP32 bridge** next. The browser saves the information before connecting and hides this first step on later visits. The setup link from the desktop installer can also import it; a configured board does not need Wi-Fi provisioning again.

2. **Verify phone input.** Pair **iPhone Agent Bridge** in iOS Bluetooth settings and enable AssistiveTouch using the tutorial. Back in Harness, start the connection test, wait for the bridge to type eight digits and confirm. Full Keyboard Access can remain on or off. There is no connection code to type manually.

3. **Add an account or API and chat.** Under **Settings → Accounts or API**, add a connection, enter an API endpoint and key and load its models, or follow the ChatGPT sign-in interface. Create a session, select a model and send a message. Reopen settings to check that the connection was saved. The keyboard should leave form inputs and back/close actions accessible.

4. **Share the screen and run a task.** Start with Clock or a dedicated test page. Share the screen and ask the AI to perform a tap, scroll or drag. Switch to the target app to observe the action, then return to inspect the screenshot and result. Plan mode observes and plans; Task mode executes.

5. **Try long text.** Open the [clipboard tutorial](https://igent.cc/shortcuts/clipboard.html), download **iPhone Agent Clipboard** and add it without changing its name. Ask Harness to prepare test text, choose **Copy with Shortcuts**, complete any system prompts and return. The task should wait for copy confirmation, then check the target field and paste. The foreground **Copy and continue** button is also available. With no pending text, running the Shortcut should finish immediately and leave the clipboard unchanged.

6. **Save and recover a session.** Rename and pin the test session, then archive it and find it under **Settings → View archived**. Export it from its menu and use **Settings → Import session from file** to create an imported session. Check its messages and images. Pull down at the top of the list or tap the search icon to find a session. Long conversations load older pages as you scroll up; images load when visible. Rotate the phone or zoom the page and check that input, back and close controls remain reachable.

7. **Use skills and MCP.** Add a community skill under **Settings → Skills**, or ask Harness to create and edit your own skill. Downloaded community skills remain read-only. If you have an MCP service, add it under **Settings → MCP servers**, select tools and try a read-only operation. Server settings, access tokens and tool choices should remain saved.

8. **Stop, disconnect and reconnect.** Stop a running task and confirm that phone actions cease. Disconnect the bridge: the session should show the ESP32 bridge as disconnected, and the AI may keep chatting but must identify the missing device and not send phone input. Reconnect and repeat the input test before resuming control.

## Everyday settings

Messages and images are saved in this browser. Session exports exclude sign-in credentials and API keys. The site requests data retention on entry; if it was not granted, retry under **Settings → Data on this device**.

Session imports and exports are limited to **64 MiB**, including images; reaching the export limit does not delete the original session. Skill and creator-identity imports have a **10 MiB** limit. Before changing devices, export an encrypted **Creator identity** backup to restore ownership of your published skills.

**Settings → Context and images** offers a compaction threshold, defaulting to **750,000 tokens**, while preserving full local history. Images retain their dimensions without cropping and use JPEG with **Smaller files**, **Balanced** or **High quality** presets.

Change the bridge name at `http://igent.local/settings`, then use its new address. HTTP also supports Wi-Fi setup and Shortcut jobs; normal control uses WebRTC Direct. The project supplies a shared transport certificate configuration, with no certificate installation or per-board certificate upkeep.

Short phone prototype tests have succeeded in the foreground and during background screen sharing, with intermittent failures also recorded. Integrated RTC/BLE firmware, actual Shortcut import and the complete phone workflow are undergoing hardware acceptance. The [connection record](../architecture/secure-lan.md) keeps those results separate.

[Arduino guide](../../firmware/IPhoneAutomationHarness/README.md) · [Manual releases](../architecture/manual-release.md)
