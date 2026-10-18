# Browser MCP settings

The MCP section connects `createMCPAccess()` to the Harness. It supports up to eight named Streamable HTTP servers. Saved servers appear as collapsed cards with connection state and selected-tool count; expanding a card exposes its endpoint, token, tool selection and actions. New cards open for editing. All UI text supports the eight application languages.

Adding a server reads its tool directory. The user selects tools and enables that server's selected tools. The model sees only the enabled selection through `mcp_list_tools` and `mcp_call`; calls require Task mode. Chat and Plan can inspect the authorized directory only. Identically named tools on different servers remain scoped to their server IDs.

The browser database stores each server's full endpoint, access token, allowed tool names, enabled state and reconnect preference in a separate local-credential record. Ordinary `settings.mcpServers` contains only public ID, name and endpoint without query parameters. Credentials are excluded from session exports and model context. Refresh restores saved connections and intersects allowed tool names with the fresh server catalog. A saved token is indicated by the empty password field's placeholder; the secret is not painted back into the field.

Changing an endpoint revokes its live connection and resets that server's token and tool choices. Changing a token disconnects that live connection until Save and connect is clicked. Explicit Disconnect retains its local credential but disables startup reconnection. Remove deletes both the server entry and its local credential. Settings-view closure cancels a user-started unfinished connection, but does not cancel app-startup restoration or disconnect already established servers. Each server owns its cancellation generation, so one server's edits do not affect another.

The initial selection is empty and disabled; restoration preserves the user's prior choices only after a successful new directory read. Endpoint user information and fragments are rejected. The runtime separately enforces tool schema, arguments, result size, cancellation and budgets.

## Current regression coverage

`tests/web/mcp-persistence.test.mjs`, `mcp-multiple-servers.test.mjs` and `independent-mobile-repair-r1.test.mjs` exercise separate credential persistence, refresh restoration, independent server removal, startup restoration while Settings opens, and edits queued during credential loading. Browser fixtures use synthetic servers and credentials; they do not establish live third-party interoperability.

## Historical verification, before local credential persistence

The following records the earlier single-server UI pass. Its storage and permission lifetime differ from the current behavior described above.


Three focused tests passed for endpoint credential stripping, URL user-info/fragment rejection, and all eight locale keys/placeholders. App and module syntax checks passed.

`tests/browser/mcp-settings.html` uses the real access manager with an injected mock fetch implementation. No actual MCP server, model or credential is used. Native Chrome UI verified:

- The real mock protocol returns two tools, and neither is authorized on connection.
- Checking `echo` alone does not enable model access.
- Enabling selected tools exposes only `echo` to the model-facing directory.
- Editing the endpoint immediately revokes access and returns the directory to zero tools.
- Stored public settings omit the mock query authentication parameter.
- Switching to French updates UI copy while server tool name `设置` and description `查看` remain unchanged.

Screenshot: `screenshots/mcp-permissions-mock-fr.png`. The fixture tab and loopback-only port 18833 server were closed. This UI pass does not claim interoperability with a live third-party MCP service or successful real-world external actions; those depend on its authentication, protocol support, CORS and explicit user configuration.
