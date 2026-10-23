# Context transport and caching

A conversation grows by appending user messages, completed model outputs, tool results and images. Stable system instructions and tool definitions stay at the front. Skill updates append as versioned instructions; compaction moves the current versions back into the prefix. Summaries preserve task evidence and exclude instructions from their content.

| Interface | Conversation upload | Screenshot transfer | Cache mechanism |
| --- | --- | --- | --- |
| ChatGPT subscription | New items and `previous_response_id` on the same Responses WebSocket, with `store:false` | New images in native tool outputs | Stable session routing and connection-local continuation |
| DeepSeek OpenAI / Anthropic | Full current text context | Expiring file ID after the first upload, or inline JPEG when reuse is disabled | Provider-managed prefix cache |
| Claude Messages | Full current text context | Expiring file ID after the first upload, or inline JPEG when reuse is disabled | Native `cache_control` for the fixed prefix and growing conversation |
| Other compatible APIs | Their configured Chat Completions or Messages protocol | Inline JPEG | Provider-specific capabilities |

The browser retains the authoritative conversation and original images. Screenshot reuse stores a provider-scoped file reference next to its local image. Files expire after one hour. The browser resolves one image at a time; ordinary requests contain file IDs. Credentials and file references are excluded from session exports.

The Responses socket belongs to the account, endpoint, model and session. Before sending a suffix, the client checks the complete prior message prefix and completed output. Edits, compaction or changed instructions start a full request. A lost connection starts a new chain; an unavailable previous response retries from local context. Stop closes an active generation. Model outputs pass the usual complete-response validation before tools execute.

Local history is read in metadata pages. Inline image hydration and socket event queues have byte bounds; a model context compacts at its capacity boundary rather than removing one old image each turn. Compression changes the context deliberately; the original local conversation remains intact.

Usage records separate cached input from new input and transfer volume. Cache percentages can change with new images, model switches, compaction and provider cache availability. Cached tokens reduce inference work and billing; only a stateful continuation or reusable media reference also removes that content from the network request.

Sources: [OpenAI WebSocket mode](https://developers.openai.com/api/docs/guides/websocket-mode), [DeepSeek Responses compatibility](https://api-docs.deepseek.com/guides/responses_api/), [DeepSeek image files](https://api-docs.deepseek.com/guides/files_api/), [Claude prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching), [Claude image files](https://platform.claude.com/docs/en/build-with-claude/files).
