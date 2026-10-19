# Phone guide

[简体中文](zh-Hans.md) · [Open Harness](https://igent.cc/) · [Project](../../README.md)

Use Safari on iOS/iPadOS 27 or later. Start with a harmless test task and keep the phone unlocked. The team or installer handles firmware preparation; you do not need to build software or read diagnostic logs.

## Five steps

1. **Prepare the bridge.** Use the desktop firmware installer with a supported ESP32 board and USB data cable. Read device information and keep its phone link. For a new board, join its setup Wi-Fi, save the normal 2.4 GHz network and return the phone to that same network.
2. **Connect the phone.** Open the provided link, or choose **Get bridge information** in Harness and return after saving it. Choose **Connect ESP32 bridge**. Pair **iPhone Agent Bridge** in iOS Bluetooth, enable AssistiveTouch and select the ready phone. The digit test is optional on current firmware. No manual connection code, certificate installation or permanent helper tab is needed.
3. **Choose an AI.** Under **Settings → Accounts or API**, enter an endpoint/key and fetch models, or follow the ChatGPT sign-in interface. Choose or type the default model. Create a conversation and select a model and supported reasoning effort. Real Safari subscription compatibility depends on the service and is not guaranteed by the login interface.
4. **Share and request a short task.** Start screen sharing and try a test alarm or text entry. A question gets an answer; a plan request shows a plan for review; an explicit action request can execute. Watch actual phone input. Stop ends the run. Lost sharing pauses it; Continue requests sharing and new observation before proceeding.
5. **Review completion.** The AI verifies the result before ending. It returns to Harness by default; disable **Settings → Task completion → Return to Harness** to stay in the target app. Confirm important results yourself.

## Quick checks while using the phone

- **Sessions:** change the list-title selector to **Archived**, then back to conversations. Swipe normal rows for Rename/Archive and archived rows for Rename/Restore/Delete. Deletion needs confirmation. Search by pulling down or using Search. A manual rename must survive automatic titles.
- **Reading and backup:** scroll to older messages while a response arrives; your place should remain. Use **Latest** to return to recent messages. Export from the session menu and import from Settings; check images and messages. Files are limited to 64 MiB. Site data can be cleared or evicted, so back up important sessions.
- **Precise input:** on a harmless Clock control, request a specific time. Supported number editing should be tried before repeated wheel movement. Otherwise use smaller corrections and let the control settle; verify exact values before saving. A submitted-input receipt is not visible success.
- **Long text:** install **iPhone Agent Clipboard** from the [clipboard tutorial](https://igent.cc/shortcuts/clipboard.html), keeping its name. Use **Copy with Shortcuts** or foreground **Copy and continue**. The task waits for copy confirmation and checks the target field before paste. With no pending job, the Shortcut should leave the clipboard unchanged.
- **Skills:** create/edit a harmless own skill on phone or desktop, export an encrypted creator-identity backup and deliberately restore it if needed. This browser identity, not an iOS UID, owns publications. Builtins/downloads stay read-only, update on refresh and retain enable choices; failed updates preserve the installed copy. Publish only content you want public.
- **Optional MCP:** use an accessible CORS-compatible Streamable HTTP server, explicitly select tools and try a read-only action. Revoke access and confirm it is rejected. An interrupted modifying call can have an unknown external result; reconcile before repeating.
- **Recovery:** stop a short task, stop sharing, then reconnect the bridge. Confirm no further unwanted input and no stuck pointer/key. Select the ready target again. Internal Back/Forward should preserve the page's connection and sharing; full reload needs fresh screen-sharing authorization.

Conversations, images and credentials are local to this browser; exports exclude credentials. Selected content still goes to the chosen AI/MCP services. Important skills also need a separate creator-identity backup before changing browsers. Context compaction defaults to 750,000 tokens and retains full local history; JPEG presets retain image dimensions.

No default whole-task time/step cutoff is imposed; individual plans still have short safety limits. Safari may suspend background work. Hardware gestures, background capture, Shortcuts and multi-phone behavior remain experimental and require device-specific checks. The bridge has one active WebRTC peer; latest multi-client import/enrollment changes are prepared but still require flashing and physical validation.

[Arduino guide](../../firmware/IPhoneAutomationHarness/README.md) · [Connection](../architecture/lan-connection.md) · [Self-hosting](../architecture/deployment.md)

Skill and creator-identity file imports support files up to 10 MiB.
