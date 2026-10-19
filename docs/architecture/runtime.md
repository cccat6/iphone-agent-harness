# Browser runtime and local data

Conversations and image Blobs live in IndexedDB. Locale preference uses localStorage. API credentials and login tokens occupy separate browser-local records and are excluded from conversation exports. Clearing site data removes them. These records do not use an unlock password; do not describe browser storage as hardware-protected secret storage.

A Harness owns one active run; persistent session ownership prevents competing tabs. There is no default whole-task step, tool-call or time cutoff. Explicit caller budgets remain supported. Stop ends the run, loss of capture pauses it, repeated unchanged failures or missing prerequisites require honest recovery. This does not guarantee indefinite iOS background operation.

Each action plan still has bounded time, event, byte and held-input limits. Unknown physical or remote mutation outcomes stop dependent operations rather than triggering a replay. User requests, tool calls and terminal results retain their order.

The UI loads indexed history in pages, decoding images when needed. Reading older messages preserves the viewport as new replies arrive; Latest reloads the recent window and restores following. Exports/imports include images up to 64 MiB. Imports stage a new session, leaving existing data intact if validation fails.

Automatic model summaries default to a 750,000-token trigger. Full local history remains; summaries are context projections, not new observations. Three JPEG presets preserve image dimensions. Browser storage may be evicted; export important conversations and request retention in Settings.

[Implementation](harness-runtime-implementation.md) · [Actions](actions.md)
