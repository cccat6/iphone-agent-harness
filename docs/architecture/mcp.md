# MCP tool bridge

The browser connects to configured Streamable HTTP servers. The runtime exposes `mcp_list_tools` and `mcp_call`; server tool names and arguments pass through these fixed tools. Users manage connections and permissions in [MCP settings](mcp-ui.md).

## Connection lifecycle

`createMCPAccess({fetchImpl?, timeoutMs?})` provides:

| Method | Effect |
|---|---|
| `configure({id,name,url,token})` | Register an endpoint |
| `connect(id,{signal})` | Initialize and discover its tool catalog |
| `getSnapshot()` | Read UI connection and catalog state |
| `setAllowedTools(id,names)` | Select tools from the catalog |
| `setEnabled(id,enabled)` | Enable a connected server with selected tools |
| `disconnect(id)` | Abort calls and remove the active entry |

The UI persists configuration in separate local credential records. On startup it reconnects enabled servers and matches saved selections against the current catalog. Disconnect keeps the saved record with reconnection disabled; Remove deletes it.

`listForModel({serverId?,offset?,limit?,signal?})` pages through enabled tools. `call({serverId,name,arguments},{mode,signal})` checks execution mode, current selection and arguments before dispatch. Changes to configuration or selection advance an authorization generation and cancel calls from the previous generation.

## Calls and results

Argument validation covers types, required properties, arrays, strings, numbers, enum/const, local references and combinators. It uses a depth limit of 32 and a 10,000-visit budget. The server validates the complete input schema.

Calls have a default 30-second deadline, configurable between 100 and 60,000 ms. Calls are dispatched once. Interruptions after dispatch produce `MCP_CALL_UNCERTAIN`; dependent actions pause while the result is reconciled.

Successful text results can be shortened for model context, with truncation metadata recording omitted bytes and blocks. Credentials configured for the server are masked in model-facing descriptions and results. Credential records are excluded from session exports.

## Limits

| Item | Limit |
|---|---|
| Configured servers | 8 |
| Discovered tools per server | 500 |
| Selected tools per server | 100 |
| Discovery | 20 pages / 1 MB |
| Individual schema | 16 KB |
| Tool arguments / model-facing result | 64 KB each |
| Model catalog page | 50 entries / 64 KB |
| HTTP JSON / pending SSE event | 2 MB |

Endpoints use HTTPS and browser CORS; explicitly configured loopback development endpoints may use HTTP. Requests omit browser cookies and referrers and reject redirects.

The client supports initialization, session headers, JSON/SSE responses, paginated `tools/list` and `tools/call`. The transport is Streamable HTTP. Stdio, server-initiated sampling, OAuth discovery and stream resumption are outside this interface.
