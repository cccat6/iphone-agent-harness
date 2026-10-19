# Compatibility and startup fallback

Harness targets Safari on iOS/iPadOS 27+, with required capture, encoding, storage and cryptography APIs in a secure context. iPad desktop-style identification is handled explicitly. Capability preflight is an entry check, not proof that the user has granted capture or that Safari will run indefinitely in the background.

Unsupported mobile Harness entry shows a non-dismissable compatibility message with a route to the public homepage. Escape, background clicks and focus movement do not enable unsupported control. Public homepage, Skills and installer descriptions remain accessible.

A classic startup fallback provides readable public navigation even when a modern module cannot parse or load. It cannot substitute a functional flasher or skill installation UI on unsupported browsers. Missing module files remain true 404 responses.
