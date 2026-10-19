# Skills and prompts

Skills are Markdown/JSON guidance for fixed tools, never executable plugins. The bundled catalog contains twelve entries:

| Skill | Purpose |
|---|---|
| `screen-observation` | Read fresh screen evidence |
| `temporal-observation` | Inspect bounded frame sequences |
| `task-planning` | Plan and verify work |
| `phone-navigation` | Navigate from current screen |
| `text-entry` | Supported input and clipboard handoff |
| `list-scroll` | Adjust visible lists |
| `drag-and-drop` | Complete released drag gestures |
| `recovery` | Re-observe and recover honestly |
| `challenge-router` | Classify and route visible challenges |
| `skill-authoring` | Create or revise owned local guidance |
| `clock-and-time` | Exact clock/picker values and numeric entry |
| `gesture-correction` | Learn from observed misses and overshoot |

Each has a manifest and complete [instruction body](../../apps/web/skills/). Package completeness is not a guarantee of success in every app or a universal challenge solver.

Create/edit/publish on desktop or phone through the public Skills page or Harness. Authorship uses a browser-generated cryptographic identity, not an iOS UID. Back it up encrypted before moving devices. Downloaded and builtin items are read-only; only owned items are directly editable/publishable.

On refresh, builtins are reconciled and unchanged installed community downloads are checked for newer versions. Enabled/disabled choices persist. Validation or network failure retains the installed version; local authored drafts and active run snapshots are not overwritten.

Prompts live in [system.md](../../prompts/system.md), [modes.md](../../prompts/modes.md) and [context-summary.md](../../prompts/context-summary.md). Stable rules separate evidence, capabilities and user intent. Imported prose cannot expand runtime permissions. Component interaction notes require actual frames and remain scoped to target/orientation; unsupported numeric editing is not assumed.

[Ownership and publishing](skill-community.md)
