# Device client and control ownership

`core/device-rtc.js` supplies the normal transport; `core/device.js` keeps the logical `/v1` device API. Initial links import address and identity metadata; enrollment saves a separate browser token. A connection checks the actual board/boot before exposing a live adapter.

The firmware binds the selected phone when its BLE link is encrypted and HID reports are subscribed. The UI's `targetBound` state is sufficient for readiness; a digit challenge is optional. Readiness follows the live binding result.

Each run owns a target writer lease. Claims require known released input, renewals use the same run/lease, and cleanup releases only that run. Reboot, target changes, lease expiry or disconnection invalidate stale work. Plan submission checks scope, capabilities, orientation, canonical payload hash and size. Duplicate IDs refer to the existing operation; uncertain delivery is reconciled before continuing.

RTC permits a bounded queue but only one active RPC and peer. Cancellation removes a queued read before dispatch. For a dispatched mutation, the runtime reconciles its delivery state. The runtime checks outcomes with fresh screen frames.

[Transport](secure-lan.md) · [Action contract](actions.md) · [UI flow](device-ui.md)
