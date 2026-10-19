# Browser runtime and local data

Conversations and image Blobs live in IndexedDB. Locale preference uses localStorage. API credentials and login tokens occupy separate browser-local records and are excluded from conversation exports. Clearing site data removes them. Credentials save directly to the browser.

A Harness owns one active run; persistent session ownership prevents competing tabs. Tasks continue until completion, pause or Stop. Explicit caller budgets are supported. Stop ends the run, loss of capture pauses it, repeated unchanged failures or missing prerequisites pause dependent work.

Each action plan still has bounded time, event, byte and held-input limits. Unknown physical or remote mutation outcomes pause dependent operations for reconciliation. User requests, tool calls and terminal results retain their order.

The UI loads indexed history in pages, decoding images when needed. Reading older messages preserves the viewport as new replies arrive; Latest reloads the recent window and restores following. Exports/imports include images up to 64 MiB. Imports stage a new session, leaving existing data intact if validation fails.

Automatic model summaries default to a 750,000-token trigger. Compaction summarizes model context while retaining the full local history. Three JPEG presets preserve image dimensions. Settings provides session import/export and browser storage retention controls.

[Implementation](harness-runtime-implementation.md) · [Actions](actions.md)
