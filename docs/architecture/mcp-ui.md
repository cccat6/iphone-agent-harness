# MCP settings

Under Settings → MCP servers, add a named Streamable HTTP endpoint and any required token, connect to load its actual catalog, select tools and explicitly enable them. Multiple server configurations are independent. Saved browser-local settings retain connection configuration and selections; changing URL or credentials revokes the old active authorization.

The model receives only selected catalog data and fixed bridge tools. It cannot configure servers or grant itself access. Calls require execution authorization; discussion/planning does not silently call remote tools. Disconnect or revocation cancels in-flight work, whose remote effects may remain unknown.

Servers need reachable HTTPS and browser CORS. Static Safari cannot run stdio processes or provide a full remote OAuth host. Empty/unavailable catalogs and failed authentication must be shown honestly. [Protocol and limits](mcp.md).
