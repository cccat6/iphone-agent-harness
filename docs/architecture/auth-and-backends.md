# 模型发现、认证与 MCP 接入

## 固定的两类模型协议

普通 API 后端内置 OpenAI Chat Completions 风格和 Anthropic Messages 风格，另有独立的 Codex／ChatGPT 订阅 Responses 适配。后端地址、模型和 Key 可配置，代码不会按模型名动态安装插件。DeepSeek 两类接口都用用户同一 Key，但请求头和消息格式不同。

`apps/web/core/providers.js` 的 `discoverModels()` 是产品能力，设置页“获取模型”直接调用它，而不是开发者手动查询后写死列表。

| 场景 | 默认目录 | 鉴权 |
|---|---|---|
| OpenAI 原生 | `/v1/models` | Bearer |
| OpenAI 兼容网关 | 配置 base 下的 `/models` | Bearer |
| Anthropic 原生／兼容 | base 下的 `/v1/models`，已有v1不重复追加 | x-api-key＋anthropic-version |
| DeepSeek 两种推理协议 | 官方 `https://api.deepseek.com/models` | Bearer |

推理地址通过 URL.pathname 构造，基础地址与完整推理端点都保留合法的 api-version、route 等查询参数；不会把路径后缀拼入查询值。opaque 状态的端点范围包含实际 search，修改同一路径的路由参数也不会复用旧状态。模型目录构造保持原有行为。

同样的协议不保证同样的目录支持。有后端没实现、没授权或被浏览器 CORS 阻止时，显示真实失败，并保留手动模型输入。目录 API 识别 model ID，不独自证明视觉、工具能力或价格。Anthropic 目录支持分页；数量和页数有上限。

本轮用产品函数、用户提供的本地 Key 分别从两种配置发起实际发现，均返回 `deepseek-flash`、`deepseek-v4-pro`。根据官方说明，Flash 当前调用标识为 `deepseek-flash`。浏览器后台真实双协议实验另见研究报告。

兼容协议的 opaque reasoning／签名按协议、账号、模型和完整规范化推理端点匹配，不能跨同源不同 tenant 路径重放；旧存档缺少完整 endpoint 的状态不再复用。流式与非流式都限制每次工具参数 64,000 UTF-8 字节、每回复最多 8 次工具、工具名称与 ID 各 128 个字符。增量追加与工具参数 JSON.parse 前先校验；thinking／redacted thinking 初始块和增量合用 1 MB 容量预算，最多 256 块。超限中止读取，不把残缺调用交给 Harness 执行。新增容量／格式错误分别有稳定 `PROVIDER_RESPONSE_LIMIT`／`PROVIDER_RESPONSE_INVALID` code。

## OpenAI API 与 ChatGPT/Codex 订阅

订阅接入不再是一概不可用的占位。当前官方 OSS 集成允许应用获得用户 ChatGPT plan OAuth 授权，以 access token 调用 Responses；它与用户自行填写的 Platform API Key 是两种凭据来源。模型目录只提供选择，不证明某个模型的授权与额度。[官方 OSS app-server 指南](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server)

`core/codex.js` 已实现设备码兼容路径、轮询、兑换、刷新轮换、多账号登记、模型目录与 Responses SSE 转换；`providers.js` 会将 codex 协议路由到该适配器。设备码默认采用公开 Codex CLI 源码的 public client ID；没有读取用户本机 auth.json，也不把 OAuth token 发送到任意自定义 API 地址。

另实现 SIWC 的注册客户端 authorization-code 流程：PKCE、state、nonce、issued client ID、RS256/JWKS 身份验证与 plan scope。官方要求的 127.0.0.1 回调需要本机或自托管运行时，纯 Safari 静态页不能自行建立该监听器。新注册后的刷新使用 issued ID，而不是保留动态注册入口为长期客户端。[官方注册流程](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)

账号按独立本地登记 ID 管理，不能按 email 合并；每个账号保留自己的 client ID 与 rotating refresh token。用户可切换模型与账号。刷新事件只发账号 ID，不把秘密放进 UI 事件；解锁状态下由 UI 更新加密存档。模块默认在内存，按用户选择可通过 sealCredentials 加密本地保存。官方建议受保护运行时存储并不建议 browser storage；本项目的显式加密本地选择应如实说明，不能称为官方推荐。[官方账号与刷新](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions)

当前 22 项离线 Codex 模块测试通过，但**尚未完成真实 Safari 登录、真实订阅推理与刷新验收**。公开无凭据预检显示 token 与新 Responses API 部分入口允许 CORS；设备码申请的网络诊断失败，以及旧 Codex 推理入口缺少允许来源，仍是实际接通关口。不能把预检或许可等同于手机浏览器成功，也不能由失败预检推断永久禁止。UI 必须显示真实错误，不创建假的已连接账号。

详见[订阅实现、完整 exports 与诊断记录](../research/codex-subscription.md)。

## MCP

`core/mcp.js` 提供可选的 Streamable HTTP 客户端和页面内授权管理器 `createMCPAccess()`。设置中先连接真实目录，再由用户逐项选择工具并显式启用；连接成功本身不授予调用权限。地址或凭据改变、断开连接都会清除授权并取消在途请求。凭据与授权只在当前页面内存中，普通设置最多保存端点地址。

Harness 仅增加两个固定工具 `mcp_list_tools` 与 `mcp_call`，不按服务器目录动态注册工具。列表只包含用户已启用的服务器与工具；调用在发送前和返回后再次核对授权代数。Chat／Plan 可以查看获准目录，只有 Task 可以调用外部工具，服务器的 `readOnlyHint` 等声明不改变这个规则。

发送后的超时、取消、授权撤销、协议错误、远端工具错误、非文本结果超限或传输超过 2 MB 均按结果未知处理，持久记录 `MCP_CALL_UNCERTAIN`，停止本轮后续依赖操作，不自动重试。用户应先核对外部服务的实际结果。发送前未授权或参数不符则是普通拒绝。已完整接收的成功纯文本结果超过 64 KB 时，会按顺序截断并显式报告原始字节数、遗漏内容块及 structuredContent 遗漏情况，保持调用已返回的事实，不误记为执行未知，也不自动追加调用。详情见[MCP 授权与调用生命周期](mcp.md)。

Safari 不能启动本地 stdio 子进程。服务器必须允许网页来源和必要头部，且使用手机可访问的地址。高级 OAuth、sampling、服务器主动请求、旧版 SSE 双端点和断点续传不在本轮轻量客户端的实现范围；不会把不支持的交互伪装成功。自动测试验证授权、撤销、模式限制、超时、容量和真实 Harness 调用链。Mac Node 已通过真实公开远端工具调用，原生 Chrome 已通过独立双源 CORS 服务的目录／授权／调用／撤销流程。该公开远端服务从 igent.cc 预检返回 403，不能作为已通过的 Safari 示例；手机 MCP 仍待验收。详见[真实远端记录](../research/mcp-live-verification.json)及[浏览器独立复查](../research/independent-web-r2.md)。

参考：[MCP Streamable HTTP](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)、[工具与不可信注解](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)。
