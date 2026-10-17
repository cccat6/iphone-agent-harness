# Codex / ChatGPT 订阅接入

2026-10-18。本轮增加 `apps/web/core/codex.js` 与独立 mock 测试；没有读取用户机器的 Codex `auth.json`，没有执行真实账号登录或推理。协议代码已经实现；纯 Safari 生产整链尚未验收。

## 官方路线与兼容路线

当前官方支持的 OSS 方案是应用独立注册、取得用户 ChatGPT plan 授权，然后用 OAuth access token 请求 Responses API。动态注册会返回独立 issued client ID；后续刷新须使用这个 issued ID。模型目录不等于模型权限证明。[官方 app-server 接入](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server)

官方 SIWC 首次注册使用动态客户端入口，包含 PKCE、state、nonce、稳定 host ID；回调要求本机 127.0.0.1 监听，成功后验证 ID-token 签名、issuer、audience、expiry、nonce 与 plan scope。这一监听不能由纯静态 Safari 页面直接创建。[官方注册流程](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)

因此模块实现两条明确区分的路径：

| flow | 登录 | 推理 | 当前边界 |
|---|---|---|---|
| `codex` | Codex CLI 公开设备码兼容流程 | `https://chatgpt.com/backend-api/codex/responses` | 按公开源码实现，真实浏览器 CORS 尚未通过 |
| `chatgpt-plan` | 独立 SIWC 注册客户端，authorization-code + PKCE | `https://api.openai.com/v1/responses` | 登录回调需要自托管／本机运行时；代码可校验回调与签名 |

不能把“允许 OSS Harness 使用订阅”混同于“所有旧 Codex 端点都允许任何网页跨域”。也不把已实现的兼容登录留成假的按钮；调用会真实请求端点，失败时返回错误，不产生已登录账号。

## 公开源码依据

本地固定快照：

- [openai/codex `ce0323f`](https://github.com/openai/codex/tree/ce0323f2f2d3b25e82806cd555237da3db4e1897)：`codex-rs/login/src/device_code_auth.rs` 的申请、轮询、兑换与回调；`codex-rs/login/src/server.rs` 的 token endpoint；`codex-rs/codex-api/src/endpoint/models.rs` 的模型目录及 client_version。
- [badlogic/pi-mono `8efd314`](https://github.com/badlogic/pi-mono/tree/8efd314fa3d3232ce197d8d7a6a5660530b9d83e)：`packages/ai/src/auth/oauth/openai-codex.ts` 的公开客户端与刷新、`packages/ai/src/api/openai-codex-responses.ts` 的订阅 endpoint、account header 与 Responses 事件。

公开客户端 ID 为 `app_EMoamEEZ73f0CkXaXp7hrann`，这是源码中的 public client 标识，不是用户密钥。兼容路径申请 `/api/accounts/deviceauth/usercode`，轮询 `/api/accounts/deviceauth/token`，去 `/codex/device` 验证，最终 `/oauth/token` 兑换，redirect 为 `/deviceauth/callback`。该标识不冒充我们自己的 SIWC 注册 ID，也不代表新应用独立注册完成。

## 模块 exports 与 UI 约定

```js
import {
  startCodexLogin, completeCodexLogin,
  registerCodexAccount, getCodexAccount, hasCodexAccount,
  listCodexAccounts, setActiveCodexAccount,
  removeCodexAccount, clearCodexAccounts, setCodexTokenObserver,
  discoverCodexModels, callCodexModel
} from './core/codex.js';
```

### 设备码

```js
const pending = await startCodexLogin({signal});
// pending: {method:'device-code', flow:'codex', clientId,
// device_auth_id, user_code, interval, verification_url,
// verificationUrl, expiresAt}
// UI 显示 user_code，打开 verificationUrl；不要记录整个 pending。
const account = await completeCodexLogin(pending, {
  accountId: crypto.randomUUID(), // 我们的本地登记 ID，不是 ChatGPT account ID
  label: '个人账号', signal
});
```

`interval` 单位秒，设备码最长十五分钟。403/404 或明确 pending 继续轮询；slow_down 增加间隔；用户取消及时停止。失败不保存账号。`clientId` 可配置，但新的 SIWC 动态登记必须走下面的 authorization-code，不能把 `dynamic_agent_client` 当长期 ID。

### SIWC registered client

```js
const pending = await startCodexLogin({
  method:'authorization-code',
  hostId:'urn:uuid:稳定的本机标识',
  agentName:'iPhone Agent Harness',
  redirectUri:'http://127.0.0.1:1455/auth/callback',
  // returning account: clientId:'已签发的 oaiapp_…'
});
// pending.authorizationUrl 交由登录浏览器打开。
const account = await completeCodexLogin(pending, {
  accountId:'本地登记ID', callbackUrl:'监听器实际收到的完整URL', signal
});
```

新注册必须返回 issued client ID；旧注册不允许替换 client ID。代码进行 RS256/JWKS 签名与身份字段验证，必须获得 `chatgpt.tokens.use.direct` 才登记为可推理账号。token exchange、刷新都使用 SIWC `/api/accounts/oauth/token` 与 API resource。代码不在 Safari 伪造 loopback listener。回调 URL 和 pending 含短期认证信息，不可写日志或公开分享。

当前未实现完整的用户会话撤销 UI、HTTP 回调监听程序与自动 ID-token hint 返回登录；`removeCodexAccount` 仅清理本地内存及刷新，不表示服务端已 revoke。

### 多账号与加密保存

`registerCodexAccount(localId,tokens,options?)` 接收标准 `access_token`、`refresh_token`、`id_token`、`expires_in`，或者导出的 `expiresAt`；兼容 `access/refresh/expires`。每个 local ID 保留独立 client ID、ChatGPT account ID、scope 和旋转 token；相同 email 不能作为登记唯一键。

`getCodexAccount(id)` 返回元数据，以及：

```js
await account.accessToken({signal});  // 自动近到期刷新；同账号单次刷新
const privateRecord = account.exportTokens();
// privateRecord 只能直接交给已有 sealCredentials，不得打印或保存明文。
```

`exportTokens()` 包含恢复所需的当前 rotating refresh token、clientId、accountId、flow、expiry、scope；解锁后可再次 register。列表只返回无 token 元数据。旧对象在账号移除／替换后不能导出新账号凭据。取消某个等待者不会破坏其他等待者共享的刷新；移除账号会阻止迟到刷新把账号复活。

官方建议受保护运行时存储，明确不建议 browser storage。用户在本项目明确选择浏览器本地保存；由 UI 使用 `sealCredentials` 加密、显式解锁，模块默认只保存在内存。这个产品选择不应写成“官方推荐将订阅 token 存到 IndexedDB”。加密后仍应防止同源脚本被篡改和已解锁状态的读取。[官方账号与刷新说明](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions)

### 模型与 Responses

```js
const models = await discoverCodexModels({accountId:localId, signal});
// [{id,name,description,catalogOnly:true}]
const reply = await callCodexModel({
  provider:{accountId:localId, model:selectedModel, timeoutMs:180000},
  messages, tools, signal, onDelta,
  sessionId:localSessionId
});
// {text,toolCalls:[{id,name,arguments}],finish:'stop'|'tool_calls',
//  usage:原始Responses usage|null,responseId}
```

默认 Codex 模型目录来自 `/backend-api/codex/models?client_version=0.1.0`，版本可由调用者配置；不会冒充官方 CLI User-Agent。SIWC 目录来自 `/v1/models`。没有硬编码假模型列表，目录失败明确错误；成功目录仍不是可用额度证明。

输入转换为 Responses message、function_call、function_call_output、input_image；所有工具结果先组成完整组，再跟观察图像。系统提示放 instructions；请求强制 `store:false`、SSE；账号 header 与 Bearer 来自所选 local account，切换 UI 默认账号不改变已发请求的目标。

只有 `response.completed`（或兼容 `response.done`）且 status=completed 才返回可执行工具。failed、incomplete、cancelled、缺终止事件、无效参数 JSON、重复 call ID、拒绝和空回复都不成功。Usage 保留原始计量；隐藏推理不输出到 UI。onDelta 异常不接管控制循环，终止读取时取消 body；模型重试不自动重放。

## 无凭据 CORS 诊断

2026-10-18 从 Mac 对公开 endpoint 发 OPTIONS，仅设置假设 GitHub Pages origin `https://cccat6.github.io`，没有发送 token、设备码申请、实际登录或推理：

| endpoint | 结果 | 解释 |
|---|---|---|
| auth `/api/accounts/deviceauth/usercode` | 530，无 ACAO | 当前网络诊断失败；来源原因未定，不足以断言服务策略 |
| auth `/oauth/token` | 200，ACAO `*`，允许 content-type | 本次预检通过，不证明完整浏览器登录 |
| chatgpt `/backend-api/codex/responses` | 400，无 ACAO | 旧 Codex 推理路径的网页跨域尚未通过 |
| API `/v1/responses` | 200，ACAO `*`，允许本次所需头 | SIWC 推理入口预检通过，不证明账号授权或手机后台 |

这些不是 Safari 实测，也不是模型权限验证。已有 DeepSeek 手机后台成功不能自动覆盖这些域名及认证流程。正式验收仍需真实用户主动授权、模型目录、一次推理、刷新和多账号切换，并分别检查前后台。

## 离线测试

`node --test tests/web/codex.test.mjs`：22/22 通过，全部 fake fetch 与测试 token；包括设备码申请／pending／兑换、取消、双账号、旋转恢复、并发刷新、账号移除、Responses UTF-8/SSE、工具组图像、失效／截断、错误不回显 token，以及现场生成 RSA 测试签名验证 SIWC state／PKCE／nonce／audience 与 scope。

测试只说明实现对这些协议 fixture 的行为；没有假称真实登录、订阅推理、Safari 直连或生产验收完成。

## 轮换后的加密持久化通知

`setCodexTokenObserver(listener)` 注册多个监听者，返回 unsubscribe。成功刷新并替换内存 token 后，事件仅为 `{id,event:'refreshed'}`，不携带秘密。UI 用 id 取当前 account.exportTokens，再用本次已解锁凭据重加密 vault。监听者异常／Promise 拒绝隔离，不能使已成功刷新失败；异步持久化由 UI 跟踪完成和报错，不假称此通知自动保证落盘。测试覆盖多监听者、退订、无秘密元数据和抛错／拒绝隔离。
