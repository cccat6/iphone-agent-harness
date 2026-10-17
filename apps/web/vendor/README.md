# Browser flasher dependencies

Only the desktop flasher loads these locally hosted modules. The Harness does not load them.

- `esptool-js` 0.7.0: [Espressif source](https://github.com/espressif/esptool-js), Apache-2.0. `bundle.js` copied unchanged from the npm release; source digest is recorded beside it. Includes pako (MIT/Zlib) and atob-lite (MIT).
- `js-md5` 0.8.3: [source](https://github.com/emn178/js-md5), MIT. Upstream source plus one ESM default export. Its non-window fallback is changed to `globalThis` to support ESM workers; Node/CommonJS detection is disabled for the browser-only ESM distribution; the hashing algorithm is unchanged.

Firmware SHA-256 is checked before opening/resetting a port. esptool checks each written image against device MD5; hashes detect transfer errors, not publisher identity. No serial port is requested until the user clicks Install and chooses a port.
