# Independent device identity and component status review R10 — 2026-10-18

Fresh independent final review of the stable public device-client identity change and the retained-error localization repair described in `independent-device-identity-r9.md`.

## Result

**No new reproducible bug was found in this narrow source snapshot.** R9's component-owned localization finding is fixed in the inspected code and its independent regression tests pass in this fresh run. This is a clean subsequent narrow review, not a new full-system, firmware or physical-phone acceptance claim.

The reviewer changed only this report. No product implementation, existing expected tests, new test files, build, built site, binary, firmware, commit, deployment, browser, serial, phone or live API was changed or operated.

## Reviewed behavior

- `ensureDeviceClientId` canonicalizes a validated HTTPS origin, reads and conditionally writes the public ID in one settings readwrite transaction, retains unrelated settings, and returns an existing valid ID before considering a different valid preferred ID. Its ID grammar matches the production DeviceClient grammar. Memory operations serialize; the IndexedDB source uses a single settings transaction for the read and write. No native IndexedDB execution is claimed here.
- Explicit DevicePanel owner pairing captures address/fingerprint/password before awaiting local ID allocation, passes that ID to the actual pair request, clears the password field, and checks operation ownership before constructing a client. A restored credential can seed a missing public ID on explicit re-enrollment; an existing ID wins. Stored IDs confer no bearer authentication, pinned identity, HID proof, lease or execution authority. Default token lifetime remains page memory; reload re-enrollment reuses the public ID rather than consuming a new firmware grant for the same canonical origin.
- Component-owned DevicePanel failures retain `deviceMessageKey` and render the current `DEVICE_MESSAGES` value. USB profile mismatch retains its component key. External Device/MCP/USB errors retain the underlying Error object and resolve through `localizeError` at render time. Form values are not rewritten by the locale repaint. Unknown diagnostics retain their text.
- All twelve `flash_*` codes resolve to the six actionable recovery groups across the eight supported locales. The new later catalog entries replace the earlier aliases intentionally; no stale “device has not been flashed” assertion remains for the overridden verification group. No complete translation-quality audit is claimed.

## Executed checks

Node v23.7.0, without npm lifecycle/build scripts:

```text
node --test tests/web/independent-device-identity-r9.test.mjs \
  tests/web/device-client-identity.test.mjs tests/web/device-ui.test.mjs \
  tests/web/device.test.mjs tests/web/mcp-ui.test.mjs \
  tests/web/serial-setup.test.mjs tests/web/i18n.test.mjs
52 passed, 0 failed, 0 skipped
```

The fresh run includes the seven independent R9 regressions and the three stable-ID regressions. It covers ten disposable owner re-enrollments retaining one simulated firmware grant, canonical aliases/concurrent settings updates, restore migration precedence, close during ID allocation, component error repaint across eight languages, MCP retained-code repaint, readonly serial setup protocol, trusted nonce filtering and DeviceClient's separate identity/binding/execution checks.

An additional ephemeral assertion script checked all 12 flash error codes against all 8 locale catalog entries (96 resolutions), verified the original Error code/message were not mutated, and confirmed 16 unknown plain/coded diagnostic renderings retain their original text. It created no test file and changes no suite count.

This reviewer did not rerun the full web suite; root owns the final aggregate count and any native browser evidence.

## Exact inspected snapshot

SHA-256, paths relative to the repository:

```text
apps/web/core/store.js           47a5e10fa97b12514ef451653700755fbb69332ea8c4d5f895dbaf62a7a81d6c
apps/web/ui/device-panel.js      755946c73bb90b0edbb81870f57a1bc2fce6e6ba1714c5a0893aacc9a1aebd61
apps/web/ui/mcp-settings.js      e0ad782623dbfeaa662cfeeab7f6a45b45d1f45235e1aaf38f56e457be895fda
apps/web/ui/usb-setup.js         5fce516d49ab2efcef107c5355c95370422f7c9b1a59b3a7d08285c4bac6af6c
apps/web/core/error-catalog.js   8308c548708be845382d868686d932c8fddf24d9fbb84814bff51ee0d95dbf23
apps/web/i18n.js                 1416ecceab48916ea16b89ec78fad7dd7fdefcbedb08791e54eb676c251a6fd4
apps/web/core/device.js          5e2a32772b192ef9e2387ec6a851e4ff666cd51963e70e4ba0ad3401cd513339
tests/web/independent-device-identity-r9.test.mjs  1c269e5055b3ce3f5e4bae193763e77175ca0ccb0f75bc5bfb3c4974b09fca06
tests/web/device-client-identity.test.mjs         734893ec546efb6d14a607c438c7541f069e30bc68426e3d9d08c5e421fccdc9
```

## Limits

These identity/store tests use memory storage. Small DOM adapters execute the production handlers but do not prove native browser events, focus, layout, navigation or persistence; fake HTTP does not prove TLS/CORS, a real controller's finite grant table, multi-window bearer rotation, HID delivery or phone control. The serial tests use simulated streams and establish their protocol/lifecycle behavior only. Root's separate native IndexedDB two-handle/reopen and actual-DOM locale checks, builds and prior physical evidence remain separate evidence. No claim about those checks is made by this reviewer.
