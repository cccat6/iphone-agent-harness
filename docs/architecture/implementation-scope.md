# 本轮并行实施边界（2026-10-18）

产品名：iPhone Agent Harness。仓库为 CCCAT6/iphone-agent-harness，private。产品仅两部分：Web（含公开 Skill）和 Arduino 固件；docs/specs/tests 是共享工程资料，不是第三个产品服务。

## 固定边界

- Web 是无运行时插件系统的静态 ES module 应用，优先适配手机 Safari。固定工具、两类模型协议、按需 Skill；会话留 IndexedDB。
- 模式为 chat / plan / task；goal 是 task 的停止条件与预算，不另造独立执行内核。chat 不执行手机操作；plan 可观察但不下发修改；task 执行经过验证的有界计划。
- 先提供可运行的本地持久化界面与明确的能力状态；未接通的硬件、登录、模型接口不能显示“已连接”或伪造回复。
- ESP32 单板多 target、每 target 一个 writer、定时 HID 段；身份验证、初始绑定与时钟估计明确。截图永远由手机网页取，不由 ESP32 生成。
- 公开 Skill 的浏览／本地加载归入 Web。静态发布支持目录、文件导入和共享链接；直接上传的写入必须有显式配置的发布端，未配置时提供导出，不伪装上传成功。
- MCP 仅评估／实现浏览器可访问的 Streamable HTTP；不支持在 Safari 启动 stdio 程序。外部 MCP 是用户显式连接的数据服务，不是内核插件注册框架。
- OpenAI 设备码登录先核查官方适用范围、公开源码和 CORS；未经验证不得复用 Codex client ID 宣称第三方浏览器登录可用。
- 固件真机测试仅允许用户指定的 `/dev/cu.usbmodem1101`；其他串口不访问。用户已授权刷写开发板。后台 API 测试不发送 HID；模型请求复用用户提供的本地测试凭据。测试结果区分源代码、编译、模拟和实机。

## 文件所有权

1. 主 agent：docs/architecture 总体图、身份／同步协议、模式、auth/MCP 决策；apps/web/core/；根 README/package/test 集成、Git/GitHub。
2. Web agent：apps/web/index.html、app.js、styles.css、manifest.webmanifest、静态 icons、UI 检查；不修改 core/。
3. Arduino agent：firmware/IPhoneAutomationHarness/、tests/firmware/、docs/architecture/firmware-implementation.md；不触碰旧实验 firmware。
4. 后台测试 agent：research/background-api/、docs/research/background-api.md；不修改 Web/core 或旧研究数据。

## Web 与 core 的固定接口

UI import `./core/store.js`，使用 `await openStore()`；store 提供 `listSessions({archived?,search?})`、`createSession({title?,mode?,modelId?})`、`getSession(id)`、`updateSession(id,patch)`、`deleteSession(id)`、`addMessage(sessionId,{role,text,...})`、`getMessages(sessionId)`、`getSettings()`、`saveSettings(patch)`、`ensureDeviceClientId(boardOrigin,{preferredId?})`、`exportSession(id)`、`importSession(value)`、`listSkills()`、`saveSkill(skill)`、`deleteSkill(id)`。均 async。

Session: `{id,title,mode:'chat'|'plan'|'task',modelId,pinned,archived,createdAt,updatedAt}`；Message: `{id,sessionId,role:'user'|'assistant'|'system'|'tool',text,createdAt}`。UI 自行管理视图与 loading 状态。

UI import `./core/harness.js`，使用 `createHarness({store,onEvent})`；`await harness.run({sessionId,text,mode,modelId,signal})`、`harness.stop()`。UI 不重复插入 run 内的用户消息；事件至少 `{type:'status',status}`、`{type:'message',message}`、`{type:'delta',text}`、`{type:'error',message}`。真实后端未配置时给明确错误，不生成伪模型文本。

UI 设置 provider 为 `{id,name,protocol:'openai'|'anthropic'|'codex',baseUrl,model,stream:true}`。凭据只用 `setCredential(providerId,secret)` / `hasCredential(providerId)`（core/credentials.js，默认内存），不调用持久设置保存原文 key。Codex profile 保存后显示显式设备码登录入口，显示官方实际签发的状态；真实浏览器登录边界见 auth-and-backends.md，不做假的授权页面。

UI 设备页提供证书指纹核对、所有者配对与 HID 目标证明，严禁仅填入地址就显示硬件已连接。核心 capture 与设备执行可以单独启用，未验证路径保持不可用。整个 UI 有真实可用的 session CRUD、模式、设置、导入导出与 Skill 本地管理。
