# 模型发现、认证与 MCP 接入

## 固定的两类模型协议

Web 只内置 OpenAI Chat Completions 风格和 Anthropic Messages 风格。后端地址、模型和 Key 可配置，代码不会按模型名动态安装插件。DeepSeek 两类接口都用用户同一 Key，但请求头和消息格式不同。

`apps/web/core/providers.js` 的 `discoverModels()` 是产品能力，设置页“获取模型”直接调用它，而不是开发者手动查询后写死列表。

| 场景 | 默认目录 | 鉴权 |
|---|---|---|
| OpenAI 原生 | `/v1/models` | Bearer |
| OpenAI 兼容网关 | 配置 base 下的 `/models` | Bearer |
| Anthropic 原生／兼容 | base 下的 `/v1/models`，已有v1不重复追加 | x-api-key＋anthropic-version |
| DeepSeek 两种推理协议 | 官方 `https://api.deepseek.com/models` | Bearer |

同样的协议不保证同样的目录支持。有后端没实现、没授权或被浏览器 CORS 阻止时，显示真实失败，并保留手动模型输入。目录 API 识别 model ID，不独自证明视觉、工具能力或价格。Anthropic 目录支持分页；数量和页数有上限。

本轮用产品函数、用户提供的本地 Key 分别从两种配置发起实际发现，均返回 `deepseek-flash`、`deepseek-v4-pro`。根据官方说明，Flash 当前调用标识为 `deepseek-flash`。浏览器后台真实双协议实验另见研究报告。

## OpenAI API 与 ChatGPT/Codex 登录

官方文档区分 Platform API Key 的用量计费和 ChatGPT 登录的 Codex 订阅访问；设备码是 Codex 无头登录的一条路径，当前文档没有建立“复制 CLI 客户端标识后，任意静态网页便可直接使用所有 OpenAI API”的结论。

已阅读固定源码里的 `codex-rs/login/src/device_code_auth.rs`：请求 user code、按间隔轮询、获取 authorization code＋PKCE verifier、兑换 tokens，然后缓存和刷新。我们将这个控制流整理到独立的 `core/auth.js`；它要求明确配置客户端及端点，没有导入本机 Codex 登录凭据。

当前状态：

- 设备码状态与刷新合并锁可测试；刷新令牌轮换、退出和过期错误有模拟测试。
- API Key 默认留内存；用户可主动加密保存，刷新后输入口令解锁。AES-GCM、独立 salt/iv、PBKDF2；解锁口令不存储。
- CLI 缓存在文件／系统凭据库，不能照搬为浏览器无保护的 localStorage token。
- 对 deviceauth 两路径的无凭据 OPTIONS 诊断返回 HTTP530；token 路径 OPTIONS200并有CORS头。530可能属于网络／网关，不能据此宣称永久禁止，也不能称登录通过。
- ChatGPT/Codex 登录 UI 显示待验证，不使用虚假成功状态，不复用用户本机 auth.json，也不把 OAuth token 当普通 API Key 发往任意 endpoint。
- 要完成这条登录路线，仍需验证客户端适用范围、浏览器请求、token audience、Codex 模型协议和真实刷新；完整流程未验收。

官方资料：[Codex Authentication](https://learn.chatgpt.com/docs/auth)。它说明现有 Codex 客户端行为，不是给本项目签发的第三方集成授权。

## MCP

`core/mcp.js` 是固定的可选 Streamable HTTP 客户端。支持 initialize、initialized、JSON/SSE 响应、session与version header、分页工具列表、显式 allowlist 的工具调用。UI 连接诊断不会自动执行目录里的工具。

Safari 不能启动本地 stdio 子进程。服务器必须允许网页来源和必要头部，且使用手机可访问的地址。高级 OAuth、sampling、服务器主动请求、旧版 SSE 双端点和断点续传不在本轮轻量客户端的实现范围；不会把不支持的交互伪装成功。

外部工具的目录是数据，不是浏览器可执行插件。未来将 `mcp_call` 作为一个固定桥接工具加入任务循环时，必须继承模式与用户启用范围；当前尚未自动挂进模型工具表。

参考：[MCP Streamable HTTP](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)。
