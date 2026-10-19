# Browser compatibility and startup

Harness runs in Safari on iOS/iPadOS 27 or later. Startup checks screen capture, encoding, storage and cryptography APIs in an HTTPS context. iPad desktop-style identification is supported.

Unsupported mobile devices show a compatibility message with a link to the homepage. The homepage, skill community and installer information remain available.

A classic startup script provides public navigation when loading the main JavaScript module fails. Missing scripts and assets return 404 so loading failures remain visible.
