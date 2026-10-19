# Browser flasher dependencies

The desktop flasher loads these locally hosted modules when opening the installer.

- `esptool-js` 0.7.0: [Espressif source](https://github.com/espressif/esptool-js), Apache-2.0. `bundle.js` copied unchanged from the npm release; source digest is recorded beside it. Includes pako (MIT/Zlib) and atob-lite (MIT).
- `js-md5` 0.8.3: [source](https://github.com/emn178/js-md5), MIT. Upstream source plus one ESM default export. Its non-window fallback is changed to `globalThis` to support ESM workers; Node/CommonJS detection is disabled for the browser-only ESM distribution; the hashing algorithm is unchanged.

The installer checks each download’s SHA-256 and uses esptool’s MD5 check after writing. Clicking Install opens the browser’s serial-port picker.
