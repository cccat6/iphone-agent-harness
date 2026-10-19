# Accounts, models and external services

Add a connection under **Settings → Accounts or API**. Supported interfaces are OpenAI Chat Completions, Anthropic Messages and ChatGPT/Codex subscription login. Each connection keeps its own endpoint, credentials, model selection and reasoning effort.

Enter the provider base URL or a supported full inference URL. **Fetch models** reads the provider's model directory; every returned model is available in the picker. You can also enter a model ID manually. The default model sets the initial selection for that connection.

API keys and login tokens are saved in separate browser-local records. Session exports contain conversation content and images; credentials stay in the current browser. Subscription login uses its own authorization and refresh flow, with tokens scoped to the subscription endpoint.

Both streaming and nonstreaming responses are supported. Tool arguments are executed after the complete response passes validation. Provider reasoning state is associated with its account, protocol, model and inference endpoint.

Model and [MCP](mcp.md) endpoints need reachable HTTPS and browser CORS support. Configure MCP servers separately under **Settings → MCP servers**.
