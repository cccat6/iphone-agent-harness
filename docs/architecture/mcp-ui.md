# Browser MCP permission UI

The optional MCP section now connects the trusted page-local `createMCPAccess()` object to `createHarness({mcp:access})`. It exposes one lightweight Streamable HTTP server configuration through `ui/mcp-settings.js`, without executable plugins, stdio, or OAuth. Its 19 UI strings have complete English, Simplified Chinese, Traditional Chinese, Japanese, Russian, German, French and Spanish resources in `locales/mcp.js`.

The initial state is disabled. An explicit user connection reads the server's real directory. That action grants no tool access. Each tool must be checked by the user, and the separate enable checkbox must then be enabled. The model receives only the selected, enabled directory through fixed `mcp_list_tools` / `mcp_call` tools. Calls require Task mode; Chat and Plan can inspect the authorized directory only. Server descriptions remain untrusted metadata and cannot grant permissions.

The access token and all tool permissions remain in the manager's page memory. Reloading starts disabled. Editing either endpoint or token immediately disconnects the current entry, aborts its requests and removes its allowlist. A disconnect/revoke button provides the same explicit action. Reconnecting reads the directory again with an empty allowlist. Closing the settings view during a pending connection aborts and disconnects that unfinished request; closing an already configured view does not silently revoke established user choices.

The token input is cleared before network work. Ordinary settings receive only `mcpEndpoint`, with query parameters removed. Query parameters remain usable for the current in-memory connection, including servers using query authentication, but must be re-entered after reloading. URL user information and fragments are rejected. Complete endpoint URLs and tokens are not passed to the model. The runtime separately enforces tool-schema, argument, result, generation, mode, cancellation and budget checks. Revoking access cannot undo an external action already dispatched.

## Verification, 2026-10-18

Three focused tests passed for endpoint credential stripping, URL user-info/fragment rejection, and all eight locale keys/placeholders. App and module syntax checks passed.

`tests/browser/mcp-settings.html` uses the real access manager with an injected mock fetch implementation. No actual MCP server, model or credential is used. Native Chrome UI verified:

- The real mock protocol returns two tools, and neither is authorized on connection.
- Checking `echo` alone does not enable model access.
- Enabling selected tools exposes only `echo` to the model-facing directory.
- Editing the endpoint immediately revokes access and returns the directory to zero tools.
- Stored public settings omit the mock query authentication parameter.
- Switching to French updates UI copy while server tool name `设置` and description `查看` remain unchanged.

Screenshot: `screenshots/mcp-permissions-mock-fr.png`. The fixture tab and loopback-only port 18833 server were closed. This UI pass does not claim interoperability with a live third-party MCP service or successful real-world external actions; those depend on its authentication, protocol support, CORS and explicit user configuration.
