# Source layout and responsibilities

[Architecture](overview.md) · [Setup guide](../guide/README.md)

| Component | Location | Responsibility |
|---|---|---|
| Browser | `apps/web/` | Conversation, model loop, capture, local storage and skills |
| Firmware | `firmware/IPhoneAutomationHarness/` | Wi-Fi setup, WebRTC, Bluetooth input and clipboard transfer |
| Prompts | `prompts/` | System instructions, intent handling and context summaries |
| Built-in skills | `apps/web/skills/` | Versioned operation procedures |
| Public skill API | `apps/web/api/` | Signed public packages and revisions |
| Build and release tools | `tools/` | Website builds, firmware compilation and release reuse |
| Tests | `tests/` | Runtime, protocol, UI and build checks |

The browser maintains conversation history and sends selected context to the chosen model. The ESP32 executes input batches for the selected phone. Board identity, boot, browser client, target and writer lease identify each active control operation.

Questions, plans and execution share one conversation. Screen-sharing loss pauses work; Stop ends the run. After verifying the result, the agent returns to Harness by default. The user can change that preference in task-completion settings.

The bridge stores up to eight browser clients and two BLE bonds, with two independent WebRTC control connections and one active writer per phone.
