# Independent LAN rendering and Wi-Fi setup review R3

Date: 2026-10-18. Scope: production HTML rendering, the two local pages and locale handoff, candidate Wi-Fi/AP lifecycle and AP authorization. This is a fresh round after actual C3 readback exposed ArduinoJson destination replacement. It does not inherit the earlier R2 clean result as evidence.

Outcome: no new blocking production defect reproduced in the scoped host checks. One non-blocking response-code discrepancy remains below. Two obsolete browser-test fixtures were repaired; no firmware or application implementation was edited. This result does not establish flashed binary identity, actual served C3 HTML, physical association/rollback, AP radio continuity, or iPhone browser behavior. Those checks remain with the main task.

## Findings

1. **Non-blocking contract discrepancy:** `SecureService.h` `/finish` includes `!configComplete_` in the 403 owner-proof guard. A first-ever, correctly authenticated finish request while candidate Wi-Fi is joining therefore receives 403, not the claimed 409-until-joined response. Already-configured joining/failed attempts reach `finishSetup()` and receive 409. Both paths retain the AP; the production page only calls finish after a connected/configured status, so no normal-page completion failure was reproduced. This is a source-confirmed HTTP response distinction, not a physical request result.
2. **Fixed test-fixture regression:** initially, all three `independent-lan-window-r2.test.mjs` tests failed with `ReferenceError: navigator is not defined` after helper localization was added. R1 had the same missing browser globals. Added only `navigator.languages`, `navigator.language` and `document.documentElement` to the R1/R2 synthetic browser environments. The combined R1/R2/device-LAN setup suite subsequently passed all 15 tests. No production behavior was changed or disabled to make these pass.

## Evidence

- Ran `tests/firmware/run_html_render.sh` against the installed production-pinned ArduinoJson **7.4.3**. It reproduced replacement of an existing destination string by the real serializer, then exercised the production render functions: complete HTML prefix/suffix, script-boundary escaping and JSON round trip. Both emitted scripts parsed, eight locale DOM cases passed per page, and the actual AP script passed join-before-finish, join failure, timeout and finish-refusal scenarios. Emitted helper: 6,078 bytes; setup: 5,479 bytes.
- Added `tests/firmware/independent_render_setup_r3.cpp`: separately reproduced the actual serializer replacement, emitted both production-rendered pages, exercised 80 combinations of link/address/SSID/fresh-event prerequisites and timeout boundaries, plus stale event, mismatched SSID, retry, failed persistence, epoch wrap, 30-second recovery, and finish deadline/reset gates. All passed using the installed Command Line Tools compiler, strict warnings, and the actual pinned ArduinoJson include directory.
- Added `tests/firmware/independent_render_setup_r3.mjs`: executed JavaScript extracted from those emitted pages, not a manually concatenated replacement renderer. Verified locale aliases (`zh-TW`, `zh_HK`, `zh-CN`, `de-AT`, `fr-CA`), unsupported-language fallback, all eight explicitly selected helper locales, and a failed AP attempt followed by a successful retry. The retry included a thrown transport failure, HTTP 503 with superficially successful JSON, connected-but-unconfigured and configured-but-connecting responses. Finish occurred exactly once after the fifth eligible status poll, and the returned fragment decoded to the expected device, URL and synthetic owner. All passed without real network requests.
- Ran `node --test tests/web/device-lan-setup.test.mjs tests/web/independent-lan-window-r1.test.mjs tests/web/independent-lan-window-r2.test.mjs`: **15 passed, zero failed** after fixture repair.

## Integration inspection

- `HtmlJson.h` serializes into a separate destination and only then appends to the HTML prefix; both production pages use it. `<` is escaped in the embedded JSON value, preventing an injected closing script boundary.
- AP page/configure/status/finish handlers gate on the connection's local interface being the active setup AP. Configure and finish additionally require the exact setup origin and owner proof. The page uses the embedded owner; no real credentials were read during this review.
- Accepted configuration stages candidate fields rather than immediately saving them. The service starts a new attempt, snapshots GOT_IP epoch, disconnects/reconnects, and only commits after connected status, a usable address, matching candidate SSID and a changed epoch. The main event callback increments the GOT_IP counter. This source wiring was inspected; the host state tests do not emulate the ESP32 event queue or radio.
- Commit requires both a complete Preferences write and matching readback. Timeout or failed persistence follows previous-network restoration. Finish is gated on successful candidate commit and current connection/address; a new accepted configuration resets an earlier finish timer.
- A failed saved-network boot or subsequent disconnection opens setup after 30 seconds through the recovery gate. HTTP startup waits for AP closure and station connection. mDNS advertises port 80 and `transport=http`.
- Helper locale comes from the main transport's allowlisted locale fragment; nonce, source-window, origin and request allowlist checks remain present. The actual browser transport/helper tests still cover cancellation, response bounds, helper instance, request concurrency and visibility handshake after the fixture update.

## Reproduce the additional checks

Compile `tests/firmware/independent_render_setup_r3.cpp` with C++17, `-Wall -Wextra -Werror -pedantic`, and `-I "$HOME/Documents/Arduino/libraries/ArduinoJson/src"`. On this Mac use `/Library/Developer/CommandLineTools/usr/bin/clang++` with the CLT MacOSX SDK and libc++ include path, as in the existing host-test runner. Run the resulting binary with a temporary directory as its single argument, then run `node tests/firmware/independent_render_setup_r3.mjs <that-directory>`. Generated temporary HTML contains synthetic test values only.

## Reviewed production snapshot SHA-256

These identify the source read in this review, not the final flash/build artifact; the main task owns final source/build matching.

| File under `firmware/IPhoneAutomationHarness/` | SHA-256 |
| --- | --- |
| `src/HtmlJson.h` | `6882cd27144fe46335e8215f65b08c3545e7f4c1907d8b68fc97a6072a38360d` |
| `src/WifiSetupPage.h` | `32d589629419789fee3d904b7ee6300aba5fd5f97773c4d58f47907a450f23a0` |
| `src/LanBridgePage.h` | `4ddee0300abaea2f9ce7fbdc3aaa96b3085f52f385cd56eeeb5e07f573c13821` |
| `src/SetupState.h` | `8aebf5460eab8a18f125fd807d90e2fb7016f1127ec7afb3f96bc23196ffb682` |
| `src/SecureService.h` | `761ba96586cacc35bd4129bb154f983ee22a9c8bee9451653c81d2ff8bedae69` |
| `main.cpp` | `f96865217ded8b73bfae0a9bbf0d3b79efa02c21c2bf20fd1cc8d3c864d7cb39` |

No serial, phone, Wi-Fi configuration, deploy, GitHub Actions, or physical-device operation was performed in this review.
