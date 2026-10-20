# Project components

The project has two product components:

- **Web:** Safari Harness, sessions, model adapters, screen capture, skills, desktop firmware installer, public skill community and stateless ChatGPT subscription relay.
- **Arduino firmware:** Wi-Fi setup, WebRTC connection, Bluetooth input, device settings and clipboard transfer.

The browser owns the agent loop and private history. The ESP32 executes timed input batches. Skills add written procedures to the fixed tool set.

One conversation supports questions, plans and actions. A plan can be reviewed and then executed. Screen-sharing loss pauses execution; the user can resume after sharing again.

[Architecture](overview.md) · [Source layout](system-blueprint.md) · [Development checks](validation.md)
