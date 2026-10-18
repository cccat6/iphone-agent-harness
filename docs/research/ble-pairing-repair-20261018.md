# Bluetooth pairing repair — 2026-10-18

Status: source repaired and host-tested; no serial port opened and no board flashed. The user's C3 is not connected to this Mac. The checked-in public firmware and its release seal are intentionally unchanged until the next firmware release. This is not a claim that the reported phone timeout has been reproduced or resolved on hardware.

## Defects found in the current source

`ServerCallbacks::onConnect` disconnected any phone absent from the application target table unless a successful webpage `/v1/pair` call occurred in the last two minutes. The gate began closed at boot. This made the ordinary sequence “pair in iOS Bluetooth settings, then open the webpage” fail, and made pairing depend on an invisible browser timer. It could also reject an existing phone before NimBLE resolved its identity address. This code path is sufficient to prevent pairing; without a device log it is not proof of the exact cause of the reported timeout.

The production name was `iPhone Agent`, not the older experimental `Phone Chain C3`. A name retained on the phone can reflect its cached pairing entry. The new source consistently advertises **iPhone Agent Bridge**. Scan response is enabled before setting the name: the primary advertising data uses 11 bytes (flags, appearance, HID service UUID), and the complete 19-byte name occupies a separate 21-byte scan response. Neither exceeds the legacy 31-byte limit.

## Changes

- Remove the browser registration timer and target-table rejection from initial BLE connection admission. Keep the two-phone connection limit.
- Continue to require an encrypted bonded link, subscribed HID reports, the authenticated browser's connection test, and a target-specific writer lease before normal input.
- Refresh the peer snapshot when NimBLE resolves an identity after authentication.
- Disconnect a failed, unencrypted authentication attempt so it does not hold a connection slot indefinitely.
- Do not erase all pairings or force a factory reset during the update; preserve NVS. Capacity-driven replacement of an offline phone is described below. The pinned NimBLE stack already handles repeat pairing by deleting only the peer's old bond and retrying SMP.
- Preserve the HID report descriptor and PnP revision. This patch changes admission and naming, not the descriptor; no descriptor-cache reset is justified by this patch alone.

## Verification

`tests/firmware/ble_pairing_test.py` extracts and executes the actual production callbacks and initialization against a host adapter. It covers a new phone before browser registration, second-phone admission, over-capacity rejection, authentication, late identity resolution, failed authentication, disconnect cleanup, and name/advertising packet sizing. The full firmware host suite also passes, including existing input routing and per-phone epoch checks.

A clean C3 compile passed under ignored `build/ble-pairing-repair/`, separate from public downloads (1,411,015 program bytes; 46,656 static RAM bytes; all 16 allowlisted source hashes verified). Radio behavior, reconnection of the user's existing phone, and the connection test require a later authorized flash and phone test.

## Primary sources checked

- [NimBLE-Arduino 2.5.1 server callbacks](https://h2zero.github.io/NimBLE-Arduino/class_nim_b_l_e_server_callbacks.html): authentication and identity resolution are separate callbacks.
- [Pinned 2.5.1 advertising implementation](https://github.com/h2zero/NimBLE-Arduino/blob/2.5.1/src/NimBLEAdvertising.cpp): `setName` chooses scan response when enabled.
- [Pinned 2.5.1 server implementation](https://github.com/h2zero/NimBLE-Arduino/blob/2.5.1/src/NimBLEServer.cpp): `BLE_GAP_EVENT_REPEAT_PAIRING` deletes the peer bond and retries pairing.

The installed, pinned source files were read directly, including encrypted HID report characteristics in `NimBLEHIDDevice.cpp`. No speculative changes to radio power, connection timing, key distribution, or HID descriptors were made.

## Replacing an offline phone

The independent review found a second defect: NimBLE's default full-store policy could evict an online phone, while the application kept both target slots forever. This could leave a newly paired third phone unavailable to the webpage.

The source now overrides the full-store callback. Only a disconnected old bond may be evicted; the peer whose new record is being stored is also protected. If no offline candidate exists, the new storage request fails without disconnecting either active phone. The firmware does not increase the two-phone radio limit.

After the host confirms that a bond is absent, the loop retires its disconnected, non-running application target. It first deletes and verifies the persistent bond mapping, then clears all browser proofs referring to that target, its pending connection test, and its Core client/lease state. Owner credentials remain valid. A replacement phone receives a new random target ID and must complete its own connection test. Failure to delete the durable mapping keeps the old slot occupied for retry. If power is lost after the deletion or a later grant write fails, boot-time grant loading discards references to nonexistent targets; the old proof cannot be inherited by a replacement.

`ble_bond_lifecycle_test.py` executes the production callback, retirement function, proof revocation method and boot mapping loader with host storage fault injection. Eleven scenarios cover active-peer protection, incoming-peer protection, host read/deletion failure, durable-map deletion failure, grant write failure, power loss immediately after durable deletion, preserving another phone's ongoing connection test, deferred cleanup of a still-connected target, non-overflow notifications that must not evict anything, and deferral of flash writes while another phone runs timed input or test typing. Core and Admission tests separately verify that an old browser token remains usable while its old input proof does not authorize the replacement target. None of these tests is a physical multi-phone pairing test.

The fresh independent review of these final changes found no reproducible new defect in online-peer protection, deferred NVS writes, or proof revocation/recovery. It reran the production callback, bond-lifecycle and BLE-router host tests. Hardware pairing remains pending.
