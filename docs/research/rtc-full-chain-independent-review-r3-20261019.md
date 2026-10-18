# WebRTC Direct full-chain independent review — round 3

Date: 2026-10-19 (Asia/Shanghai).

Result: **no new actionable defect found in the reviewed source and host-test scope.** This is a fresh review after rounds 1 and 2. It is not a claim that the production firmware or Shortcut has passed iPhone acceptance.

## Scope and evidence

The reviewer read the current production RTC transport, RPC/SCTP framing, firmware request dispatch and disconnect cleanup, device enrollment and persisted connection metadata, clipboard wire encoding and HTTP pickup, generated Shortcut actions, browser copy acknowledgement, and task continuation. Production implementation was not edited. No serial port, firmware flashing, deployment, browser UI, phone input or GitHub Action was used.

Executed independently:

- `node --test tests/web/device-rtc*.test.mjs tests/web/device-clipboard.test.mjs tests/web/rtc-clipboard-capacity-independent.test.mjs tests/web/rtc-import-identity-independent.test.mjs tests/web/independent-bridge-clipboard-r1.test.mjs`: **29 passed, zero failed**. Log: `build/rtc-r3-web.log`.
- `RTC_SANITIZE=1 sh tests/firmware/rtc/run.sh`: **passed with AddressSanitizer and UndefinedBehaviorSanitizer**. Covers loss, reorder, duplicate suppression, CRC, verification tag, cookie, heartbeat, close, monotonic RPC numbering and response/next-request ordering. Log: `build/rtc-r3-protocol.log`.
- `sh tests/firmware/run.sh`: **passed**. Includes Core and admission, replay storage, Wi-Fi setup state, actual BLE routing and callback definitions, bond lifecycle, clipboard mailbox, strict JSON, and clipboard wire handling. Log: `build/rtc-r3-host.log`.

## Checks relevant to the complete chain

1. **Disconnect and input ownership.** Browser close rejects outstanding/queued requests without replay, publishes connection loss, and invalidates the current input proof. Firmware tracks authenticated RTC clients, cancels their leases, releases their input, invalidates an active RTC connection test and clears their clipboard job when the transport closes. Core cancellation checks the lease owner. This review checks the implementation and host cases; the timing of physical BLE release remains board/phone acceptance.
2. **Long text contract.** The real DeviceClient-to-RTC framing regression accepts exactly 8192 UTF-8 bytes of quotations, newlines and mixed Chinese text, reconstructs the original text, and stays within 12288-byte RPC and 512-byte frame bounds. Firmware rejects malformed/noncanonical Base64, embedded NUL, invalid UTF-8 and decoded overflow.
3. **Round 2 JSON fix.** The previously unresolved C0-control concern is repaired in the current buffered HTTP writer. The executed regression serializes an 8192-byte control-character payload into more than 48 KB of valid JSON through at most 512-byte output chunks, parses it back exactly, and checks sink failure. Named escapes, quotation marks, literal backslashes and multibyte text are also covered. The round 2 report's pending-repair note is therefore superseded by this result.
4. **Onboarding and saved addresses.** The Web path uses a single RTC connection with empty ICE servers and no helper tab or HTTP signaling. An imported board identity is checked before enrollment and survives a failed retry. Successful imports persist the actual RTC metadata. Stale saved IP recovery preserves the board credential and verifies the same board. `.local` ICE resolution is a browser/device capability to verify physically; one-time local settings/setup import supplies the current IP without asking the user to type it.
5. **Clipboard copy and paste sequencing.** HTTP pickup marks a job delivered, not copied. The Shortcut checks the supplied job identities, copies the returned text, then sends the corresponding acknowledgement. The Web controller checks request, session, target, client, board and boot identities before creating a copied receipt. A stale session or device prevents continuation. The app saves the receipt and resumes task execution; the paste gate rejects keyboard paste while that session's copy remains unconfirmed. Returning to and verifying the intended field is part of subsequent agent execution, not something established by the HTTP acknowledgement.

## Remaining physical acceptance

Root is handling production firmware compilation/flashing and real desktop-browser communication. This review does not replace those checks. Actual iPhone Shortcut import, local HTTP permission, native clipboard contents, BLE keyboard/pointer effects, and production RTC/BLE coexistence must be tested on the phone. The previously verified echo-only prototype remains distinct evidence. The current Shortcut flow is a foreground launch affordance; this review does not certify an automatic background Shortcut hotkey or unlimited Safari background lifetime.
