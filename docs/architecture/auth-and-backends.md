# Accounts, models and external services

Add a connection under **Settings → Accounts or API**. Supported interfaces are OpenAI Chat Completions, Anthropic Messages and ChatGPT/Codex subscription login. Each connection keeps its own endpoint, credentials, model selection and reasoning effort.

Enter the provider base URL or a supported full inference URL. **Fetch models** reads the provider's model directory; every returned model is available in the picker. For ordinary APIs you can also enter a model ID manually. A subscription account can be saved before its model directory is available. The default model sets the initial selection for that connection.

API keys and login tokens are saved in separate browser-local records. Session exports contain conversation content and images; credentials stay in the current browser. Subscription login uses its own authorization and refresh flow, with tokens scoped to the subscription endpoint.

Both streaming and nonstreaming responses are supported. Tool arguments are executed after the complete response passes validation. Provider reasoning state is associated with its account, protocol, model and inference endpoint.

Ordinary API and [MCP](mcp.md) endpoints need reachable HTTPS and browser CORS support. ChatGPT model discovery and Responses use the configured stateless relay because of browser CORS. The default `subscriptionRelayUrl` prefix is `https://igent.cc/api/openai`; a self-hosted prefix can be set per account. Only selected model inputs/images, outputs and the short-lived access token pass through the relay. The application does not persist this traffic or log bodies or credentials. Sign-in and refresh remain direct to OpenAI; refresh and ID tokens are never sent to the relay. Configure MCP servers separately under **Settings → MCP servers**.


ChatGPT subscription generation uses the relay's encrypted WebSocket channel for incremental continuation with `store:false`; model discovery remains HTTP. The relay forwards frames without storing conversation state. DeepSeek and Claude can reuse screenshots through provider file IDs with a one-hour expiration. This option appears in the API connection editor. Original images, references and session history remain in the browser.
