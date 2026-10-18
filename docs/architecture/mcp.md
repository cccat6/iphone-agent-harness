# Optional MCP tool bridge

The browser connects to explicitly configured Streamable HTTP servers. This is a fixed bridge, not a plugin loader: the model sees only `mcp_list_tools` and, in Task mode, `mcp_call`. Server tool names are data passed to that bridge. The model cannot configure servers, change credentials, select tools, or grant itself permission.

## Page-local authorization

`createMCPAccess({fetchImpl?, timeoutMs?})` exposes these trusted UI methods:

| Method | Effect |
|---|---|
| `configure({id,name,url,token})` | Validate/store an endpoint in memory; no request; disabled with no grants. |
| `connect(id,{signal})` | Initialize and discover the actual tool catalog; still disabled with no grants. |
| `getSnapshot()` | Return local UI server/catalog/status metadata, never a separate bearer-token field or client object. The editable `url` deliberately retains query authentication in page memory; do not pass snapshots to the model. |
| `setAllowedTools(id,names)` | Replace the selection with names from the discovered catalog. |
| `setEnabled(id,enabled)` | Require a connected server and a nonempty selection before enabling. |
| `disconnect(id)` | Revoke, abort in-flight work, clear the credential and remove the entry. |

Every configuration, selection, or enablement change advances an authorization generation and aborts work using the previous generation. URL and credential edits revoke immediately. Permissions and tokens do not survive a page reload; the ordinary settings record stores at most the endpoint. Closing the settings panel does not revoke the current page's explicit selection.

`listForModel({serverId?,offset?,limit?,signal?})` returns only enabled, selected tools and their bounded schemas, with `total` and `nextOffset`. Tool descriptions and schemas are untrusted remote data. An annotation such as `readOnlyHint` is not evidence sufficient to allow Chat or Plan execution.

`call({serverId,name,arguments},{mode,signal})` validates Task mode, current selection and arguments before its sole dispatch. It yields a microtask and rechecks permission immediately before sending, then verifies the generation again before accepting the result. Local argument validation has a 10,000-visit budget and a depth limit of 32. It checks a structural JSON Schema subset, including types, required/properties, bounded arrays/strings/numbers, enum/const, local references and combinators. It deliberately never executes remote regular expressions. It is not a complete JSON Schema implementation: the server must validate its full input schema, including patterns and other unsupported keywords. No executable packages or schema-provided code are loaded.

## Unknown outcomes and cancellation

A pre-dispatch permission or argument error has not sent a tool call. Once dispatched, any timeout, cancellation, permission change, transport/protocol failure, `isError` response, oversized nontext result or response exceeding the transport limit becomes `MCP_CALL_UNCERTAIN` with `unknown: true`. A tool may already have changed external state even when no successful response is available.

The Harness durably records that unknown result, stops remaining calls in the dependent batch and does not ask the model for a retry. A user must reconcile external state before a fresh attempt. A normal HTTP/MCP return proves only what the remote result says; it does not independently verify the external side effect.

Calls have a default 30-second deadline, clamped to 100–60,000 ms for configured clients. Abort signals reach fetch and stream reads. The bridge never retries `tools/call`. Stream readers are cancelled and released, and timers are cleared on completion or failure.

## Resource and transport limits

- At most 8 configured servers, 500 discovered tools per server and 100 selected tools per server.
- Discovery has at most 20 pages and a 1 MB catalog; each schema is at most 16 KB.
- Tool arguments and model-facing result projections are each at most 64 KB. A completely received, successful result with only text content may be projected to an ordered text prefix rather than classified as unknown: `truncated`, `originalBytes`, `originalBlocks`, `omittedBlocks`, `truncatedBlock` and a notice make incompleteness explicit. Oversized structuredContent is represented by an explicit `structuredContentOmitted` byte count/reason; omitted result or content metadata is marked too. No follow-up tool request is sent automatically. Nontext results that cannot fit remain unknown. Model catalog pages have at most 50 entries and 64 KB.
- HTTP JSON responses are capped at 2 MB. SSE pending event text is capped at 2 MB of UTF-8 (and 2 million characters), and UTF-8 is validated.
- HTTPS is required except explicitly configured loopback development addresses. Credentials in URL userinfo and URL fragments are rejected. Redirects are rejected, browser cookies omitted, and the request referrer suppressed.
- Initialize/initialized, supported protocol versions, session headers, JSON/SSE responses, paginated tools/list and tools/call are implemented. OAuth, stdio subprocesses, server-initiated requests/sampling, legacy dual-endpoint SSE and stream resumption are absent.

Servers still need browser CORS support, accessible addresses and valid TLS. This does not establish that a particular remote server works in Safari. Before exposing remote descriptions/schemas and tool results to the model or durable conversation, the bridge masks its known configured secrets: the bearer token, complete normalized endpoint URL, recognized credential query values (token/API key/auth/secret/password/signature/credential/JWT and common variants), and their URI/component/form/raw query encoding forms. The editable snapshot URL remains unmodified for trusted local UI only. Noncredential values such as `api-version=1` are not collected as secrets. Tool names, local server IDs and schema property/reference identities that contain a known secret are rejected rather than silently renamed, so selection and dispatch use the same protocol identity. Configured server labels are masked in model-facing catalogs. This is known-configuration masking, not arbitrary DLP: it does not identify unrelated secrets, all possible credential parameter names, encodings such as base64, or arbitrary remote sensitive data. Such content remains untrusted.

## Evidence

`tests/web/mcp-access.test.mjs` adds 20 offline mock tests covering disabled defaults, explicit grants, bounded catalog pagination, argument rejection, Chat/Plan restrictions, pre/post-dispatch revocation, credential edits, cancellation/deadlines, bounded successful text projections, explicit structured-data omissions, oversized nontext/transport/error results, credential redaction, bounded remote schema validation, fragmented/idle SSE reader cleanup and real Harness continuation/unknown termination. The dedicated suite passed 20/20; existing core, Harness, device-runtime and runtime-integration regressions also passed. `tests/web/mcp-secret-boundary.test.mjs` adds six offline credential-boundary cases. The first two were observed failing before the fix, proving catalog and tool-result echoes reached the next model turn/history; all six pass after the fix, alongside the 20 MCP-access and 16 core cases (42/42). They also cover ordinary routing queries, encoded full URLs/query credentials, literal regex punctuation and fail-closed tool identities. No real MCP server, phone MCP request or deployment was exercised by these tests.

Protocol references: [Streamable HTTP](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports), [tools and untrusted annotations](https://modelcontextprotocol.io/specification/2025-11-25/server/tools).

## Multiple-server settings

The UI saves independent `{id,name,endpoint}` records in `settings.mcpServers`, migrating the old single `mcpEndpoint` when present. Each server has its own connection, temporary token, tool selection and enabled state. Identically named remote tools remain scoped by server ID. Editing/removing one server cancels its pending connection and revokes its tools without disconnecting the others.
