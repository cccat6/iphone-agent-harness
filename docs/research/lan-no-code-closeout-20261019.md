# LAN connection recovery and connection-code removal

Date: 2026-10-19 (Asia/Shanghai)

The local connection page previously depended only on `window.opener`, removed its routing nonce from the URL, and offered a Return button that merely invoked `focus()`. Those implementation defects match the reported dead end; the exact Safari event sequence was not captured.

The parent now initiates and retries a bounded handshake. The helper can recover a missing opener from a message with the expected origin and nonce, retains its routing fragment and pins the parent window. The normal page tells users to switch to their original Harness tab using Safari's tab list and leave the local tab open. The ineffective focus button is removed. Reload invalidates the old connection rather than replaying requests.

Connection codes are removed from the browser, USB setup, firmware enrollment and device settings. Enrollment accepts only a client ID. Legacy password fields are ignored, old enable flags cannot re-enable the feature, and old links no longer import or expose owner secrets. Device settings only manage the local name; `igent.local` remains the default. Browser tokens and phone input verification remain intact.

## Delivered evidence

- Full Web suite: 529/529 passed. Follow-up legacy-password assertions passed. Independent source and simulated-window review: no new findings, 36/36 relevant tests plus actual ArduinoJson rendering and eight-language helper/setup/settings tests passed.
- All four board targets compiled: ESP32, C3, S3, C6. All 18 source fingerprints and release files verified. Source digest: `db8b9b0b54e247ebb3eea13712fe85df2fcb8e002fabc3a3f37b9fdfa1ff3732`.
- Only `/dev/cu.usbmodem1101` was flashed, preserving NVS. Esptool verified all four written segments. C3 application: 1,430,544 bytes; SHA-256 `db7cb27559ede41510bd6d8406c626f5f158612d1b8fe8e2f6b82fbbec912d4b`.
- Actual board: `iah-b0e4b4e05380`, boot `boot-8d29c35c92b7c036`, `igent.local`, original Wi-Fi retained. System-resolved HTTP identity succeeded. Eleven live HTTP checks passed: code-free enrollment, legacy-password tolerance, ignored enable flag, settings without secret fields, production client listing and current helper HTML. No phone input was sent; connected phones at this read: 0.
- Cloudflare deployment: `f97ed567c5a24a509e45995e1a1c7584`. All 129 production assets match the local build, including the four firmware downloads. GitHub Actions were not dispatched.
- Secret scan: 599 files, no known-secret matches. Documentation scan: 118 documents, 819 local links, no broken targets.

## Remaining phone check

The updated physical C3 HTTP behavior is verified. Safari's actual window handshake and phone selection after switching tabs still require the user's retry; automated host tests are not that evidence. An attempted desktop in-app browser inspection timed out before rendering, so it contributes no UI acceptance evidence.

[Independent review](lan-no-code-independent-r1.md) · [Real C3 HTTP checks](lan-no-code-live-20261019.json) · [Published assets](lan-no-code-deploy-20261019.json)
