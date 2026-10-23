# Browser runtime and local data

Conversations and image Blobs live in IndexedDB. Locale preference uses localStorage. API credentials and login tokens occupy separate browser-local records and are excluded from conversation exports. Clearing site data removes them. Credentials save directly to the browser.

A Harness owns one active run; persistent session ownership prevents competing tabs. Tasks continue until completion, pause or Stop. Explicit caller budgets are supported. Stop ends the run, loss of capture pauses it, repeated unchanged failures or missing prerequisites pause dependent work.

Each action plan still has bounded time, event, byte and held-input limits. Unknown physical or remote mutation outcomes pause dependent operations for reconciliation. User requests, tool calls and terminal results retain their order.

The UI loads indexed history in pages, decoding images when needed. Reading older messages preserves the viewport as new replies arrive; Latest reloads the recent window and restores following. Exports/imports include images up to 64 MiB. Imports stage a new session, leaving existing data intact if validation fails.

Automatic model summaries default to a 750,000-token trigger. Compaction summarizes model context while retaining the full local history. Three JPEG presets preserve image dimensions. Export a conversation from its menu; import a conversation file in Settings. Browser storage retention controls are also in Settings.

Tool definitions keep a fixed order and schema within each interaction mode. Current permissions travel in an appended runtime record and are checked again before execution. MCP tool descriptions load in pages; retained pages can be reused until the authorized catalog changes. Summary requests reuse the conversation prefix and historical message format, with tool execution disabled in the compaction runtime. API usage records include summary requests as well as normal agent turns.

Within a context window, historical image references and tool results stay in order as new observations append. The runtime compacts at the token or 64-frame capacity boundary and keeps recent complete evidence groups alongside the task summary. Local originals remain available in the paginated conversation. Opaque provider replay bytes are tracked separately from visible text estimates. Request logs record actual input, cache usage, transfer bytes and execution stages.

ChatGPT subscriptions continue over a browser-owned Responses WebSocket with `store:false`. After the first request, the browser sends the new suffix and previous response ID. A new connection, edited history, model change or compaction starts from the corresponding full local context. DeepSeek and Claude use their native prefix caches; optional screenshot reuse uploads each image once to the chosen provider with a one-hour expiration and sends its file ID thereafter. Custom compatible endpoints use their documented inference protocol. [Context transport](context-transport.md) describes these provider differences.

[Implementation](harness-runtime-implementation.md) · [Actions](actions.md)
