# Device connection flow: independent review R2

Date: 2026-10-19

Scope: a fresh review of the final information-first device connection flow, the bridge information page, return navigation state, and connection failure cleanup. This review did not use a serial port or browser, send phone input, flash firmware, or deploy.

## Result

No new blocking defect was found in the reviewed changes. The two R1 findings are closed: unavailable-card CSS now matches only `data-unavailable="true"`, and missing browser location/hash is treated as no import while malformed actual import fragments remain visible for correction.

## Reviewed behavior

- Fresh browser state shows information acquisition first. The Connect button remains disabled until valid RTC metadata with a concrete LAN IP is available; phone input and sharing cannot start early. Direct invocation of the disabled connection handler also fails before a network request.
- A valid returned setup fragment is validated and its public address, RTC configuration, and board identifier are saved before the first explicit connection attempt. Failed identity reads, timeouts, and panel reopening retain the saved information. An unsuccessful connection cannot save a newly issued board credential or publish input readiness.
- Invalid imported metadata does not enable Connect. A failed settings write does not fall through to connecting. Existing malformed fragments are not silently removed by the parser.
- The bridge's `import=1` page reads only public `/v1/identity`, does not enroll a management client, does not require local storage, hides management controls, shows a retry after request failure, and constructs a same-origin HTTPS Harness return link carrying public bridge metadata. Eight language variants and safe return URL selection execute successfully.
- Leaving for bridge information records tab-local return intent and suspends the old connection. On a full return load, application boot opens the device panel; on a persisted page restoration, `pageshow` reopens it using the return marker. The marker is consumed once and expires. Returning does not silently initiate another RTC connection.
- A replacement connection detaches the previous transport before closing it. Old-client status reads are guarded by client identity and connection epoch. Failed setup closes the new transport, invalidates input proof, keeps retry available, and leaves the original localized failure visible rather than replacing it with a cleanup error.
- There is one bridge Connect action. The phone section performs input verification after connection. Connection progress reports network, encrypted handshake, control channel, identity/status reads, and local saving, with elapsed time and a bounded connection timeout.

## Executed checks

The following suite completed with **31 passed, 0 failed**:

```sh
node --test tests/web/connection-guidance.test.mjs tests/web/connection-flow-independent-r1.test.mjs tests/web/device-onboarding-flow.test.mjs tests/web/device-rtc-recovery.test.mjs tests/web/rtc-import-identity-independent.test.mjs tests/web/device-lan-setup.test.mjs tests/web/device-rtc-setup.test.mjs tests/web/device-rtc.test.mjs
```

`sh tests/firmware/run_html_render.sh` also completed successfully. It renders the actual firmware HTML strings and executes their scripts, including eight localized information pages, public identity-only import, blocked storage, retry, return-link selection, and hidden management controls.

The application tests use simulated DOM, transports, and storage. They establish sequencing and state transitions, not real Safari navigation, LAN hostname availability, Bluetooth operation, or final iPhone acceptance. In particular, this review makes no claim that the separately observed Mac multicast-DNS environment issue has been repaired; live address and RTC checks belong to the main agent's independent device/network verification.
