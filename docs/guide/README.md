# Setup and everyday use

**English** · [简体中文](zh-Hans.md) · [繁體中文](zh-Hant.md) · [日本語](ja.md) · [Русский](ru.md) · [Deutsch](de.md) · [Français](fr.md) · [Español](es.md) · [Project](../../README.md) · [Open Harness](https://igent.cc/) · [Architecture](../architecture/overview.md)

You need an iPhone or iPad with iOS/iPadOS 27+, an ESP32 board, USB power, Wi-Fi and an AI account or API key. Install the firmware using Chrome or Edge on a computer.

The phone and bridge use the same Wi-Fi. After setup, leave the bridge powered within Bluetooth range of your phone.

## Contents

[AssistiveTouch](#accessibility) · [Firmware](#flash) · [Wi-Fi](#wifi) · [Bluetooth](#bluetooth) · [Open Harness](#open-harness) · [Models](#models) · [Connect and test](#bridge) · [Clipboard](#clipboard) · [Community skills](#install-skills) · [Create a skill](#authoring) · [Publish](#publish)

<a id="accessibility"></a>
## 1. Enable AssistiveTouch

On your phone, open **Settings → Accessibility → Touch → AssistiveTouch** and turn it on. This lets the ESP32 use a pointer to tap and drag.

<a id="flash"></a>
## 2. Install the ESP32 firmware in your browser

1. Open the [browser installer](https://igent.cc/flash) in Chrome or Edge on a computer.
2. Choose the chip printed on your board. C2 needs at least **2 MB flash**; the other listed chips need at least **4 MB of standard SPI flash**.
3. Connect the board with a USB data cable. Click **Choose USB device and install**, select your board, and wait for completion.
4. Click **Read device information**, select the same board, and keep its setup Wi-Fi details and phone connection link.

If installation cannot start, hold the board’s BOOT button while reconnecting USB, release it, and try again. For C2, the installer automatically selects the correct 26 or 40 MHz version. After setup, leave the board powered within Bluetooth range of your phone.

<a id="wifi"></a>
## 3. Put the bridge on your normal Wi-Fi

1. On your computer, join the `iPhone-Harness-…` Wi-Fi shown by the installer, using the displayed password.
2. Open `http://192.168.4.1`. Enter your usual Wi-Fi name and password. Use a 2.4 GHz network for compatibility with every supported chip.
3. Once the bridge connects, put the computer back on your usual Wi-Fi. Keep the phone on that same network.

The bridge saves the network and reconnects when powered on. You only do this for a new board or when changing networks. Open `http://igent.local/settings` to change the bridge’s settings later.

<a id="bluetooth"></a>
## 4. Pair the Bluetooth input bridge

On your phone, open **Settings → Bluetooth** and pair **iPhone Agent Bridge**. Keep AssistiveTouch on.

Bluetooth lets the bridge operate your phone. The Harness connects to the bridge separately over Wi-Fi in step 7.

<a id="open-harness"></a>
## 5. Open Web Harness

Open [igent.cc](https://igent.cc/) in Safari on your iPhone or iPad. It opens the Harness directly.

When you ask it to operate the phone, allow screen sharing and keep the phone unlocked. You can then switch to another app. Stopping screen sharing pauses the task; tap **Share screen to continue** in Harness to share again and resume.

<a id="models"></a>
## 6. Configure an API or ChatGPT account

Open **Settings → Accounts or API → Add**. You can save several connections and switch between their models in a conversation.

**With an API key**

1. Choose **OpenAI-compatible** or **Anthropic-compatible**, according to your provider.
2. Enter a name, the API endpoint and the key. For example, `https://api.example.com/v1` is an endpoint; you can also paste a full `/chat/completions` or `/messages` address for the matching API type.
3. Click **Fetch models** and choose a default, or enter a model name yourself. All models in the list remain available in conversations.
4. Save. Choose a model that accepts images and tool calls for phone tasks. Adjust reasoning effort in the model selector if the model offers it.

**With a ChatGPT account**

Choose **ChatGPT subscription** in Harness and select **Continue with ChatGPT**. Open the official authorization page and approve access. The browser will then be unable to open the local return address (`127.0.0.1`); this is expected. Copy the complete URL from the address bar. Return to Harness, paste it into **Return address** and select **Finish sign-in**. Choose a model from the retrieved list and save the account. Credentials stay in this browser, and model requests go directly to OpenAI. Existing Codex connections remain separate when you add a ChatGPT subscription. [OpenAI authorization reference](https://developers.openai.com/siwc/token-sharing-open-source/sign-in).

Your login details and API keys are saved in this browser. Requests go directly to the chosen provider, which needs to support requests from a browser.

### Location

Open **Settings → Location** to enable location access; it is off by default. Enabling it makes the capability available: your position is read once only when the agent explicitly calls `phone_get_location`. The browser asks for permission on first use, and the result is provided to the currently selected model. The position comes from the device running Harness, so the tool also works without an ESP32 connection or screen sharing.

<a id="bridge"></a>
## 7. Connect the bridge and optionally test input

1. Open **Devices** from the conversation list or tap the bridge status in a conversation.
2. For a new connection, click **Get bridge information**. On the bridge page, use its return link to return to Harness. You can also open the phone connection link from the installer.
3. Click **Connect ESP32 bridge**. Select your paired phone if asked. Next time, the saved connection is ready to use.
4. To check typing, click **Start input test** and stay on that page. The bridge types eight digits and Harness checks them automatically. You can skip this test.

One bridge supports two independent Harness connections. When using two phones, select the matching phone on each page and run the optional input test on each to confirm the pairing.

If the phone is not shown as ready, check its Bluetooth connection, wait a moment, then click **Refresh**.

Try “Open Clock and set an alarm for 7:00.” Allow screen sharing when prompted. By default, the agent returns to this conversation after finishing; change that in **Settings → Task completion → Return to Harness**.

<a id="clipboard"></a>
## 8. Set up clipboard copy with Shortcuts

1. On your phone, open the [clipboard guide](https://igent.cc/shortcuts/clipboard.html) and install the Shortcut.
2. Keep its name **iPhone Agent Clipboard**.
3. Connect your bridge in Harness. When text is ready, choose **Copy with Shortcuts** and allow access to the bridge if iOS asks.
4. Return to Harness after copying so it can paste into the intended field.

This works for long text and different languages. You can also use **Copy and continue** while Harness is on screen.

<a id="install-skills"></a>
## 9. Install a community skill

Open **Settings → Skills → Community**, or visit the [skill community](https://igent.cc/skills). Open a skill, read its description and choose **Add to local**. You can enable or disable it in your skill list.

Built-in skills are already installed. Refreshing the page checks for skill updates and keeps your on/off choices. Updates take effect on the next task.

<a id="authoring"></a>
## 10. Create and improve your own skill

On a computer, open [Skills](https://igent.cc/skills) and choose **Create your own skill**. On the phone, use **Settings → Skills → Create**. Fill in a name, a short identifier using lowercase letters, a description and the instructions, then save.

You can also ask Harness to write or improve a skill you created. Explain when to use it, the steps to follow and how to check the result. To adapt a community skill, create your own skill instead of editing the author’s copy.

Before moving browsers, export your skills and save a **Creator identity** backup. Import both in the new browser to keep publishing as the same author.

<a id="publish"></a>
## 11. Share a skill

Open one of your own skills and choose **Publish** on the community page, or **Publish to community** on the phone. Check its contents and confirm. Edit and publish it again to release an update.

Other users can find it in the community and add it to their Harness. For bugs and feature ideas, [open an issue](https://github.com/cccat6/iphone-agent-harness/issues); for code or documentation improvements, [send a pull request](https://github.com/cccat6/iphone-agent-harness/pulls).

## Manage your conversations

Tap the conversation-list title to switch between **Sessions** and **Archived**. Swipe a conversation to rename or archive it; in the archive you can restore or delete it. Scroll up to read older messages and tap **Latest** to return to the newest reply.

Export a conversation from its menu and import it in Settings. The file includes its messages and images. Account details and keys are saved separately in the browser.
