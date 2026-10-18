# Device connection flow: independent review R3

Date: 2026-10-19

## Result

No new blocking issue was found in the final reviewed information-first onboarding, saved-information gate, return navigation state, or connection progress behavior.

This is a fresh source and regression review after the R2 review and the manual-paste persistence changes. It did not use a browser or serial port, control a phone, flash firmware, or deploy the website.

## Reviewed behavior

- Fresh state exposes information acquisition first. Bridge connection, phone input verification, and screen sharing cannot start before their prerequisites. The bridge has one Connect action; the phone section has an input verification action rather than a second bridge connection action.
- Saved information contains a valid RTC configuration with a concrete LAN IP. Importing a pasted setup link keeps Connect disabled while its information is being stored. A failed write keeps the controls blocked; retrying the same link after storage recovers succeeds without a network connection starting automatically.
- Address edits invalidate the pending import. A late save cannot enable the cleared or changed address. Successive valid pasted links serialize their writes; the later link stays blocked until its own persistence completes, and the last selected bridge is the saved bridge. The address field is disabled while a connection action is working.
- Existing imported metadata survives a failed connection and reopening the panel. Connection failure closes the unsuccessful transport, retains the original localized error, and leaves retry available without publishing phone input readiness.
- Leaving for bridge information records tab-local return intent. Normal boot and persisted-page restoration consume that intent and reopen the device panel. Returning does not implicitly start another RTC connection. The bridge's information page reads public identity only and returns public metadata to the configured HTTPS Harness origin while retaining the selected language and allowed return path.
- Connection progress distinguishes network connection, encrypted handshake, control channel readiness, identity/status reads, and saving. Elapsed time remains visible during the operation, and the transport connection attempt has a bounded timeout.

The review considered out-of-order storage completion as an adapter-level robustness concern. Ordinary same-store IndexedDB and memory-store transactions preserve initiation order; no actual production write-reversal defect was established. The final explicit save queue also protects delayed adapters, and its latest-selection behavior is covered by an independent regression.

## Independent regressions added

`tests/web/connection-flow-independent-r3.test.mjs` adds:

1. Failed manual-import storage keeps connection blocked and allows retry of the same link.
2. Clearing the address during an outstanding save keeps connection, input verification, and screen sharing blocked after the old save completes.
3. Successive valid imports serialize persistence and enable only the latest successfully saved information.

## Executed checks

The following completed with **36 passed, 0 failed**:

```sh
node --test tests/web/connection-guidance.test.mjs tests/web/connection-flow-independent-r1.test.mjs tests/web/connection-flow-independent-r3.test.mjs tests/web/device-onboarding-flow.test.mjs tests/web/device-rtc-recovery.test.mjs tests/web/rtc-import-identity-independent.test.mjs tests/web/device-lan-setup.test.mjs tests/web/device-rtc-setup.test.mjs tests/web/device-rtc.test.mjs
```

`sh tests/firmware/run_html_render.sh` also passed. It compiles the actual ArduinoJson HTML renderer and executes the rendered scripts, including all eight information-page locales, public identity-only import, blocked browser storage, retry, safe return URLs, and hidden management controls.

## Verification boundary

These simulations establish UI state, operation ordering, persistence, transport gating, and rendered firmware page behavior. They do not establish real iPhone navigation, Safari local-network permission, Bluetooth input, or multicast hostname reachability.

The separately observed Mac `.local` multicast discovery failure remains a network verification boundary. Direct-IP identity reads and the main agent's actual browser Back result do not prove multicast discovery has been repaired. This report makes no such claim.

## Final enrollment and error recovery follow-up

After the main agent observed an actual `client_capacity` response from the board, the firmware author added bounded recycling of idle, unbound browser registrations. An independent source review found no blocking issue in the completed change:

- Empty slots are used first; recycling considers only unbound registrations that are not protected by the active RTC ledger, clipboard ownership, or a current/running target lease. Bound browser identities are preserved.
- Enrollment is blocked during an active input challenge. Existing browsers refresh their own slot and retain their bound phone.
- A replacement is persisted to the exact selected NVS slot and read back before the live admission registry changes. A refused write leaves the live registry unchanged; the persistence wrapper attempts restoration of the previous durable record when read-back fails.
- A fully bound or protected registry returns capacity rather than evicting an active identity. This is an intentional limit, not an unconditionally expandable registry.

The webpage now distinguishes enrollment capacity, bridge busy, phone busy, lease conflict, expired lease, unavailable target, identity change, unknown result, and a generic state conflict. All eight languages have distinct capacity, bridge-busy, phone-busy, and generic-conflict messages. Identity recovery requests fresh bridge information; browser authorization recovery requests reconnection. These active messages no longer instruct users to inspect a USB certificate fingerprint or supply owner credentials.

The follow-up executed **73 web tests, all passed**, recorded in `build/connection-flow-independent-r3-web.log`. The full firmware host suite also passed independently, including **15 admission scenarios**, recorded in `build/client-recycling-independent-r3-host.log`. Admission cases cover exact-slot replacement and restart reconstruction, bound/protected preservation, full-registry refusal, active challenges, failed persistence, and existing bound-browser renewal.

This follow-up reviews source and host behavior. Actual C3 flashing, real Safari/Chrome reconnection, and iPhone input acceptance remain the main agent's separate physical/browser verification; no such action was performed by this reviewer.
