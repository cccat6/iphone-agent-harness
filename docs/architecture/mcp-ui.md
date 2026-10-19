# MCP settings

Under **Settings → MCP servers**, add a name, Streamable HTTP endpoint and any required access token. Connect to load its tools, select the tools to use and enable the connection.

Up to eight server configurations can be saved independently. Endpoints, tokens, tool selections and enabled state are stored in the browser and restored on refresh. Disconnect disables reconnection; Remove deletes the saved server.

Changing an endpoint, token or tool selection updates the active permissions and cancels calls using the old configuration. The agent receives only enabled tools. If a modifying call is interrupted after dispatch, the conversation records its outcome as unknown and pauses dependent actions.

Servers need reachable HTTPS and browser CORS support. Connection errors appear beside the affected server. [Protocol reference](mcp.md).
