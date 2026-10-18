# Device connection flow acceptance — 2026-10-19

## Problems fixed

- A fresh browser must get and save the bridge's public connection information before it can connect. Input verification and screen sharing remain unavailable until their prerequisites are met. Saved information hides the acquisition step and survives failed connections and reloads.
- The bridge's information page now reads only `/v1/identity`. It does not create a management client, request browser storage, open another settings page, or start connecting automatically. It offers one return action, **Return to device connection**.
- Returning through that link or browser Back restores the device panel. Returning does not implicitly send a phone input or start an RTC connection.
- One bridge Connect action reports the actual network, encrypted handshake, control channel, identity/status and saving stages, with elapsed time and a bounded timeout. Failures retain their specific cause and allow retry.
- First-use instructions are a tutorial rather than a mandatory Wi-Fi setup step for an already configured bridge. All eight languages are covered.
- Repeated earlier tests had filled the physical bridge's eight browser slots. A direct request confirmed HTTP 409 `client_capacity`; this was previously misreported as another task controlling the phone. New enrollment can reclaim an idle, unbound slot while preserving bound and active clients. Exact-slot persistence completes before the live registry is replaced. Full protected registries still return a capacity error.
- Conflict messages now distinguish capacity, bridge availability, phone availability and control ownership. Obsolete USB certificate and owner-code recovery instructions were removed from the active identity/authentication errors.
- Failed connections offer a collapsed, localized **Error details** section containing the validated error code, HTTP status and a whitelisted firmware reason. Raw response bodies, arbitrary upstream messages and credentials are excluded. Details clear when retry begins.
- The bridge's information page automatically retries its read-only identity request once for network, timeout or HTTP 5xx failures. HTTP 4xx and invalid data do not trigger that retry. Information and management pages both display localized status/reason details. A `null` HTTP error body preserves its original HTTP status instead of being treated as a network failure.

## Executed verification

| Check | Result |
| --- | --- |
| Full web suite | 641 passed, zero failed |
| Rendered firmware HTML | Passed, including all eight locales, public-only import, storage unavailable, retry and return-link validation |
| Firmware host suite | Passed; includes 15 admission scenarios and independent review of the production persistence/protection wiring |
| Independent reviews | Initial review loop, enrollment follow-up and a fresh final review after error handling; no remaining blocker |
| Fresh Chrome fixture | Information step shown; Connect, input test and sharing blocked |
| Actual bridge information page by LAN IP | Public information loaded; one return action shown |
| Actual browser Back | Device panel restored directly |
| Pasted real bridge information | Saved before Connect became available; acquisition step hidden |
| Failed RTC enrollment followed by reload | Saved bridge information retained; no reacquisition required |
| Same browser after final C3 update | Previously returned `client_capacity`; then connected successfully through real RTC without clearing NVS or changing browser data |
| Connected bridge without a Bluetooth phone | Bridge connected; phone list and input test remain unavailable, accurately separated from bridge status |
| Reload after successful connection | Previously saved information and credentials reused; real RTC reconnect succeeded |

The browser fixture uses the real web UI and real C3 transport, with an isolated local database and an iPhone user-agent override. It establishes desktop browser behavior, not iPhone acceptance. No HID challenge, pointer, keyboard or Home command was sent during these checks.

## Network boundary

The Mac still failed multicast discovery of `igent.local` during this run. Direct-IP HTTP reads worked, and a unicast DNS request to the bridge returned the correct name/address. These results do not identify whether multicast reception is blocked on the Mac, access point or bridge. They do not establish that hostname discovery is repaired. The current bridge information page is also reachable at its numerical LAN address; saved RTC information then uses that address directly.

## Final physical firmware

Only `/dev/cu.usbmodem1101` was flashed, with the application partition at `0x10000`. The flash tool verified the written hash. NVS and the existing Bluetooth bond were preserved. After boot, the bridge rejoined the saved Wi-Fi and exposed HTTP and RTC without configuration input.

- Source SHA-256: `4fe6d6f4aa4f5b2c5bccb5e312bc52cf52144811aba85f206db5c151360e1ceb`.
- C3 application SHA-256: `445c8929a94d1905d95787648e8948ad0bd1fa363969ad938aeba2c0502e09c4`.
- Board: `iah-b0e4b4e05380`; boot: `boot-6e5dbe25f47a29d9`.
- Actual UI result: **网页已连接 ESP32 桥**; bridge connection enabled phone-state refresh, while no phone was present for an input test.
- Bluetooth diagnostic: advertised name **iPhone Agent Bridge**, one preserved bond, zero connected phones, zero HID diagnostic events during the check.

All four published chip profiles were rebuilt from the same source and sealed against the current build inputs. The manifest retains `physicalValidation:false`, because this run did not exercise phone HID or the full phone workflow.

The final 14,841-byte information page was retrieved from the physical board with HTTP 200 and opened in Chrome. Clicking **Get bridge information** from the Harness and then browser Back restored the device panel. The final firmware accepted the previously saved browser connection over real RTC. The desktop connection was explicitly disconnected after verification to leave the bridge free for phone acceptance.

The connection monitor now distinguishes its own eight-second status deadline from caller cancellation. This closes the misleading cancelled-request message observed when the board was deliberately restarted for flashing; the final independent review verified both deadline and external cancellation cases.

## Deployment

The final site was deployed directly to `https://igent.cc`, Worker deployment `601e802852764e6d8bc1bc75cb8517ef`. Online verification matched all **148 of 148** expected files against the local build, including all four final firmware applications. Results are in [the site verification record](connection-flow-release-site-20261019.json).

GitHub Actions was not dispatched. The existing workflow remains `workflow_dispatch` only. The four firmware profiles are also packaged for a content-addressed GitHub Release; the website and Release use the same verified binary files.
