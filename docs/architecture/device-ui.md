# Device onboarding UI

`apps/web/ui/device-panel.js` separates three states: the Harness-to-bridge network connection, the phone's Bluetooth/input verification, and screen sharing. Its copy is localized in `apps/web/locales/device.js`.

## Normal flow

The user imports bridge information once from the desktop USB setup link or by opening `http://igent.local/settings` and choosing **Return to Harness**. That link navigates back in the same tab and supplies the board identity and `rtc:{ip,port,fingerprint}`. The URL fragment is consumed and removed on entry. Saved details are reused; a board already on the LAN does not need Wi-Fi provisioning again.

**Connect ESP32 bridge** establishes WebRTC Direct from the existing Harness page. The UI checks the actual board response before publishing the client. It does not open or retain a helper tab. Local HTTP remains available for provisioning, device management and Shortcuts.

Connection codes are absent from the UI, USB display and new links. Shared transport certificate configuration is supplied by the project; the user does not install a CA or manage a certificate for each board. The shared fingerprint does not replace board identity, browser token enrollment or target binding.

Before the website has queried the bridge, it describes the bridge as disconnected without inventing a phone Bluetooth status. Once connected, it shows the returned target list. The optional **Connection test** starts an eight-digit HID input test; it is not called “connect this phone.” AssistiveTouch belongs to the phone tutorial. Full Keyboard Access is neither required nor prohibited.

## Target readiness and optional input test

The readonly test field is focused synchronously before the start request. It collects trusted foreground digit key events only, including digits arriving before the request response. Synthetic events, pasted digits, modifiers and repeats do not establish proof. The collector expires after 30 seconds and stops when the panel or target changes. Successful confirmation is tied to the current board, boot, browser and target.

The session list and conversation header show the bridge state. New-session creation requires a current connected, usable, bound target (`targetBound`); a successful input test is not mandatory on current firmware. The optional test records additional page-local evidence only. Older firmware that lacks target binding (404) keeps its legacy-test/update guidance; this fallback is not a fabricated pass. Existing conversations remain available offline; model context identifies an absent bridge and phone input fails with a specific unavailable reason. A lost connection clears readiness and optional input proof instead of leaving a stale connected badge.

The Task owns its writer lease. The optional control check claims and releases a temporary lease; it does not grant permanent control. Closing or losing the RTC connection cancels that connection's work and invalidates its browser-side readiness. Unknown command delivery is reconciled by receipt ID, never automatically replayed.

## Device information and clipboard

The desktop installer reads board information after the user chooses the serial device. It shows setup Wi-Fi details, the local management address and a phone return link. Runtime RTC details include the actual LAN IP, UDP port and shared fingerprint. No user-facing connection code is shown.

The device manager changes the hostname while the bridge is idle. A changed address can be imported with **Return to Harness**. It does not need to remain open afterward.

The [clipboard tutorial](https://igent.cc/shortcuts/clipboard.html) installs **iPhone Agent Clipboard**. The Harness button passes the prepared job address to Shortcuts; direct execution without input uses the default bridge address. Copy completion, rather than download alone, permits the task to continue. The direct browser-copy button remains available when the user returns to the foreground.

## Verification scope

Browser tests exercise transport configuration, fragmented RPC, request ordering, cancellation, stored metadata, input proof and offline state. Firmware protocol tests exercise packet loss, ordering and replay boundaries. The phone's short WebRTC prototype results are recorded [separately](../research/rtc-direct-c3-iphone-20261019.json); the integrated RTC/BLE firmware and actual Shortcut use remain physical acceptance items.
