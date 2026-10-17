# Independent device identity and component status review R9 — 2026-10-18

Fresh narrow independent source review of the late stable-device-client-ID change, extended at root's request to DevicePanel, MCP settings and USB setup error rendering. The reviewer changed only the independent regression test and this report. No product implementation edits, build, built-site edits, firmware, browser, serial, phone, live API, deployment or commit actions occurred.

## Result

**One reproducible P2 finding was found, reported, fixed by root and independently rechecked. No other reproducible issue was found in this narrow scope.** This is a finding-bearing review followed by repair verification, not a clean first pass or a claim about physical-phone behavior. A fresh subsequent reviewer remains responsible for the final delta review.

## R9-LOC-01 — P2 — component-owned error details retain the language at failure time

The initial retained-Error change solved coded transport errors but still created component-owned errors from `Error(copy(key))`. Those messages belong to `DEVICE_MESSAGES`, rather than the central i18n reverse catalog, so keeping the original Error did not make their existing detail translatable.

Two independently executed production-handler repros failed before the repair:

1. In English, submit DevicePanel with a malformed fingerprint. Change locale without another action. The Spanish operation-failed wrapper appears around the still-English detail: `Enter the trusted 64-character CA SHA-256 fingerprint and confirm you checked it.`
2. In English, read disposable USB setup information and then a profile with a different fingerprint. Change locale without another USB action. The labels change while the profile-mismatch status remains English.

The same construction covered other DevicePanel form/precondition errors, including invalid address, verification, busy, incomplete nonce, empty vault passphrase and absent vault.

Root repaired the component-owned errors by retaining `deviceMessageKey` and resolving that key from the current component dictionary during rendering. Existing underlying Error objects still pass through `localizeError`. Independent rerun verifies both repros now follow all eight supported languages without another pair/read action, and the invalid fingerprint user input remains unchanged. The report does not claim these fake DOM adapters prove native DOM layout or serial behavior.

## Stable identity review and independent regressions

Reviewed `ensureDeviceClientId`, `saveSettings`, DevicePanel owner-pair/restore paths and production DeviceClient origin, credential and authentication behavior. The settings read and possible write share one readwrite transaction; memory-store operations serialize, and the actual IndexedDB branch uses one transaction across both operations. Native IndexedDB concurrency/reopen execution belongs to root's separate browser evidence.

The seven independent tests in `tests/web/independent-device-identity-r9.test.mjs` exercise:

- Canonical HTTPS host/case/default-port aliases converge; a different port has a different ID. Concurrent settings mutation retains the encrypted vault and public provider metadata, secrets stay filtered, returned settings cannot mutate the stored ID, and invalid origins do not change settings.
- Closing DevicePanel while local ID allocation awaits prevents construction of a network client and leaves the owner-password field cleared.
- Restoring an encrypted legacy credential and explicitly re-enrolling seeds a missing public ID. A preexisting stable ID wins over a different restored legacy ID. These execute the actual panel handlers, WebCrypto vault functions and production DeviceClient with bounded fake HTTP replies. Neither path publishes an execution-enabled device or restores page-local HID proof.
- The two component-owned localization repros above follow all eight languages after repair.
- MCP preserves the original Error code while an existing failure follows all eight languages, with exactly one fake connection attempt and its token field cleared.

No evidence was found that the public ID is used as authentication. Owner credentials, pinned peer identity, bearer credentials, fresh page-local input proof and execution readiness remain separate checks. UI configuration is captured before the ID await; operation validity is checked before owner pairing resumes.

## Executed checks

Node v23.7.0, no npm lifecycle/build scripts:

```text
node --test tests/web/independent-device-identity-r9.test.mjs \
  tests/web/device-client-identity.test.mjs tests/web/device-ui.test.mjs \
  tests/web/device.test.mjs tests/web/mcp-ui.test.mjs \
  tests/web/serial-setup.test.mjs tests/web/i18n.test.mjs
52 passed, 0 failed
```

Earlier in this review, the existing core/MCP-UI/serial-setup targeted set passed 23/23. The independent R9 test initially passed its four identity tests and failed its two newly added component-owned locale regressions; the later MCP regression passed before repair. This preserves the difference between discovery and the final passing rerun.

Source snapshot independently checked after root's repair:

```text
core/store.js          47a5e10fa97b12514ef451653700755fbb69332ea8c4d5f895dbaf62a7a81d6c
ui/device-panel.js     755946c73bb90b0edbb81870f57a1bc2fce6e6ba1714c5a0893aacc9a1aebd61
ui/mcp-settings.js     e0ad782623dbfeaa662cfeeab7f6a45b45d1f45235e1aaf38f56e457be895fda
ui/usb-setup.js        5fce516d49ab2efcef107c5355c95370422f7c9b1a59b3a7d08285c4bac6af6c
core/error-catalog.js  8308c548708be845382d868686d932c8fddf24d9fbb84814bff51ee0d95dbf23
```

Paths above are relative to `apps/web/`. Root's added `flash_*` recovery-message catalog was read and covered by the targeted i18n suite; this round did not independently trigger every flash error or perform a full translation-quality audit.

## Limits

The store identity tests use the memory backend; no real two-window IndexedDB runtime or persistence proof is claimed by this reviewer. Fake DOM tests call actual component event handlers but do not validate trusted events, layout, focus or native browser lifecycle. Fake HTTP responses do not establish real TLS/CORS/pairing, finite firmware persistence, HID, screen sharing, phone navigation or multi-window token refresh behavior. Root owns any separate native browser, build, final firmware and physical-device evidence.
