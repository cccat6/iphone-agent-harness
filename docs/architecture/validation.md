# Validation and acceptance

Maintainers run the repository checks; users need not rebuild software or inspect logs to try the phone workflow. Start with the [English phone guide](../acceptance/README.md) or [简体中文手机指南](../acceptance/zh-Hans.md).

Keep these evidence levels separate:

- Automated/host tests validate finite protocols, state and error paths.
- Native desktop checks validate the tested browser interactions.
- Firmware compilation and artifact verification establish a reproducible binary, not radio behavior.
- Physical acceptance observes the actual phone screen, release state, timing and recovery.

Important phone checks are fresh cross-app capture, correct selected target, tap/key/drag/swipe outcomes, exact picker values, cancellation without stuck input, lost-sharing pause, reconnect, clipboard confirmation and completion verification. Test additional phones/iPads separately. A HID submission receipt does not prove visible success.

Hardware features remain experimental. Latest multi-client enrollment/import changes are prepared in source but require flashing and physical validation. Background survival, combined BLE/RTC memory, multi-phone isolation and Safari subscription authorization cannot be inferred from desktop or mock tests. Avoid indefinite background or simultaneous-peer claims.

For local checks, use the commands in the [project README](../../README.md), [Arduino guide](../../firmware/IPhoneAutomationHarness/README.md) and [manual release guide](manual-release.md). Do not publish credentials or personal screens in issue reports; provide versions, redacted symptoms and reproduction steps.
