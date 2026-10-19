# Accounts, models and external services

Add connections under Settings → Accounts or API. OpenAI Chat Completions and Anthropic Messages compatible endpoints are supported, plus a separate ChatGPT/Codex subscription adapter. API-key access and subscription authorization are distinct; never send a subscription token to an arbitrary API endpoint.

Enter a provider base URL or supported full inference URL. Query routing values are retained. Fetch models from the actual provider directory; failures preserve a manual model ID. A directory entry does not prove entitlement, vision, tool support or price. All discovered models remain available in the account's picker; the default only sets the initial selection. Reasoning effort is offered for supported models and saved per account/model.

Credentials persist in separate browser-local records without an unlock password, not in session exports. Removing website data removes them. The subscription interface handles explicit authorization, cancellation and rotating refresh state; real Safari sign-in/inference/refresh compatibility must be checked with the service rather than inferred from offline tests. Registered loopback callback flows require a separate local/self-hosted runtime, not a static Safari listener.

Streaming and nonstreaming parsers enforce format and capacity limits before exposing executable tool calls. Opaque reasoning is scoped to the exact account, protocol, model and inference endpoint. Incomplete responses do not authorize partial tool input.

[Optional MCP](mcp.md) connects browser-accessible Streamable HTTP servers through fixed tools and explicit user grants. Provider and MCP servers must support browser CORS and reachable HTTPS. Server availability is not guaranteed by the static app.
