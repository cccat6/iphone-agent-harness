# WebRTC Direct integration independent review — round 1

Date: 2026-10-19 (Asia/Shanghai).
Scope: working-tree production RTC transport, firmware RPC/SCTP and admission integration, one-time setup import, keyboard proof and execution handoff, and Shortcuts clipboard bridge. No serial port, phone input, deployment, cloud signaling or user account was used by this reviewer.

## Findings and resolution

1. **Imported board identity was lost before connecting.** The device panel displayed the imported `baseUrl` in its form, then reconstructed configuration with `rtc` but omitted the imported `boardId`. A different board at a recycled IP could therefore be enrolled on first use. A new handler-level regression reproduced the wrong connected state. The Web author fixed the configuration handoff and now checks identity before enrollment. The regression passes and verifies that enrollment and credential persistence never occur on the wrong board.
2. **Host verification did not compile under the normal macOS CLT flags.** New strict JSON tests copied range-loop strings with `-Werror`. Changed only those test loop variables to references, then reran the host suite successfully.

No additional blocking production finding was identified in this review after those repairs. This is a scoped source/host review, not a physical-chain completion claim.

## Executed checks

- 26 targeted RTC/setup/clipboard Web cases passed.
- 146 device, plan, clipboard and Harness Web cases passed.
- Five import/onboarding/setup cases passed after the identity repair; the new independent identity case was strengthened to require zero enrollment calls and rerun successfully.
- `tests/firmware/run.sh` passed after the test-only compile repair: Core, admission, clipboard mailbox, setup, BLE routing/bond lifecycle and strict JSON checks.
- `tests/firmware/rtc/run.sh` passed normally and with AddressSanitizer + UndefinedBehaviorSanitizer: ordering, duplicates, receive gaps, retransmission, ACKs, TSN wraparound, heartbeat/shutdown, monotonic RPC sequencing, bounded assembly and last-response/next-request races.

## Contracts inspected

- The production webpage uses a local RTC candidate and an empty ICE-server list. Connection does not create a helper window or call a cloud signaling service.
- Setup links preserve public RTC parameters. Newly imported parameters override cached addressing; imported board identity is checked before pairing.
- Device enrollment alone does not authorize input. Target connection/encryption/subscription, native input challenge, writer lease, segment admission, receipt matching and subsequent observation remain required.
- Browser request cancellation or a lost transport rejects queued work. Firmware disconnection cancels leases belonging to RTC clients and invalidates an in-flight input challenge; mutations are not automatically replayed on a fresh connection.
- Clipboard staging is authenticated and bounded. Fetching the HTTP job marks it delivered, not copied. The shortcut copies first, then posts a correlated acknowledgement. Only a matching copied response completes the Web clipboard request. A target/session change or cancellation prevents continuation.

## Still requires physical acceptance

- Production firmware memory/stack margin during simultaneous BLE HID, RTC and HTTP shortcut use.
- iPhone native trusted-key challenge; real pointer, tap, drag, wheel and Home behavior.
- iPhone screen-capture background lifetime and radio stability using the production RPC protocol (the earlier echo prototype is separate evidence).
- Import/run of the signed Apple Shortcut, iOS local-network permission, actual clipboard contents and final paste in the target field.
- These tests do not establish the behavior of automatically launching a shortcut using a keyboard shortcut while another app is foreground.
