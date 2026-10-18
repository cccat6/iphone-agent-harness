# Third-party notices

The root MIT license applies to original iPhone Agent Harness source. Upstream dependencies retain their own licenses and notices.

| Component | Pinned version | Source and retained notices |
|---|---|---|
| esptool-js | 0.7.0 | `apps/web/vendor/esptool-js/`; upstream license and bundled dependency notices |
| js-md5 | 0.8.3 | `apps/web/vendor/js-md5/LICENSE` |
| NimBLE-Arduino | 2.5.1 | [Upstream](https://github.com/h2zero/NimBLE-Arduino); firmware download directory retains its LICENSE and NOTICE |
| ArduinoJson | 7.4.3 | [Upstream](https://github.com/bblanchon/ArduinoJson); firmware download directory retains its LICENSE |
| Arduino ESP32 and its bundled ESP-IDF components | 3.3.11 / bundled SDK | [Versioned source](https://github.com/espressif/arduino-esp32/tree/3.3.11); see the installed Boards Manager package and upstream component licenses, including core and SDK libraries |

Firmware is built using the pinned upstream toolchain rather than checked-in vendor source snapshots. `tools/build_firmware.py`, the sketch sources, `build_opt.h`, resource limits and the generated build report document how to rebuild and relink the images. Local Wi-Fi configuration and per-device private keys are not part of the distributed binary build.

Architecture research references are listed in `docs/research/harnesses.md`; this project does not redistribute Claude Code or Cursor internal source. Vendor code is not relicensed by the root project license.

The four interface icons `new-session.svg`, `settings.svg`, `search.svg`, and `skills.svg` come from [Lucide](https://github.com/lucide-icons/lucide), under the ISC license retained at `apps/web/icons/LUCIDE-LICENSE`.
