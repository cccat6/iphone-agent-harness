# Harness、后台执行与本地数据

## 1. 核心循环

采用小型 TypeScript 内核，借鉴 pi 的事件驱动循环、DeepSeek 对 prompt 与 Skill 内容的分离、Codex 的上下文预算和恢复边界。核心工具和能力固定编译，不采用运行时插件注册、自动扫描或依赖装配。可更新的线上 Skill 是本地缓存的内容，不是可加载的新执行能力。

```text
用户任务／steering
 → 读取会话与目标能力
 → 最新观察或多帧观察组
 → 组装稳定系统指令＋动态上下文＋按需 Skill
 → 模型请求，流式更新 UI／本地日志
 → 完整响应和工具参数校验
 → 执行批量计划
 → 记录回执与截图
 → 评估是否完成／继续／需要用户／失败
```

每个 run 一次只保留一个模型请求；一部手机的输入计划只允许一个 writer。只读工作和不同目标可以独立调度。模型输出流没有完成、JSON 不完整、响应达到 token 上限而被截断时，不能执行其中看起来像动作的片段。

V1 等完整 assistant 响应正常结束后执行动作。后续可评估完整 tool block 提前执行，但必须重做截断、取消与重试语义，不使用正则从自然语言流里抓出点击并执行。

任务状态：`idle → preparing → awaiting_model → validating → executing → observing → awaiting_model`，终态为 `completed / cancelled / failed / needs_user`。页面挂起、失去可靠连接或证据不足进入 `suspended / reconciling`，这不是用户主动暂停；恢复必须核对状态。

## 2. 固定工具与普通模块分工

工具名称、schema 和处理函数在源码中明确列出，使用固定映射或 switch 分派。前端组件、模型协议、设备传输和存储仍按普通模块分文件，以便测试，但不提供通用插件宿主或动态 provider 注册。

```ts
type ToolName =
  | 'phone.observe' | 'phone.execute_plan' | 'phone.get_plan_status'
  | 'phone.cancel' | 'skills.list' | 'skills.load'
  | 'session.search' | 'user.request_input';

interface InstalledSkill {
  id: string;
  sourceUrl: string;
  version: string;
  contentHash: string;
  enabled: boolean;
  updatePolicy: 'manual' | 'auto';
  checkedAt: number;
}
```

这是设计示意，不是本轮实现代码。模型协议按配置选择已内置的实现；新增协议或 HID 能力通过项目代码版本更新，Skill 不能自行注册工具。

线上目录用于浏览和安装，模型只看到本地已启用 Skill 的简短目录；匹配后 `skills.load` 从本地缓存读取正文及所需参考材料，加入发给用户所选模型后端的本次上下文。更新检查与模型调用分开，不因每条消息重新下载所有 Skill。

工具最小集合：`phone.observe`、`phone.execute_plan`、`phone.get_plan_status`、`phone.cancel`、`skills.list`、`skills.load`、`session.search`、`user.request_input`。释放输入是本地执行器兜底能力，不能只靠模型主动调用。

## 3. 用户自定义 AI 后端

- 配置 endpoint、协议、模型、鉴权、图片能力、工具能力、上下文预算、请求超时。
- V1 提供通用 chat-completions 兼容适配器和可配置结构化 JSON 适配器；供应商专用协议另加适配器，不把特定模型绑进核心。
- 支持流式和非流式，二者生成同一份规范化 assistant/tool 事件。
- fetch＋ReadableStream 处理分片，UTF-8、SSE event、多行 data、跨网络块的 JSON、工具参数增量分开解析。流式 POST 不使用只能简单 GET 的 EventSource 来代替。
- `finish`、usage、toolCallId、拒绝／截断／错误等事件保留；不要求供应商提供或暴露隐藏推理链。
- 图片参数按后端能力映射：同一请求多张图片优先；只接受单图时可生成带帧号与时间的拼图，并明确分辨率损失。纯文本模型不能声明视觉操作能力。
- 本地或自建 AI 服务也必须让手机能路由访问，允许网页来源，满足 HTTPS／混合内容规则。随便填写一个 API 地址不保证可调用。
- 浏览器不能绕过提供商的 CORS，也不能安全隐藏前端内置的共享服务密钥。不给用户强制加我们的代理；不支持直连时可让用户选择自己的网关。
- API Key 默认仅保存在本次内存。用户可选择本地保存；若加密保存，使用用户解锁材料派生密钥，不能把解密钥匙和密文一起无保护存储后宣称安全。
- 不在 URL、console、会话导出、崩溃报告里记录密钥或 Wi-Fi 密码；禁用携带会话的默认分析上报。

## 4. 等待与流式不是后台权限

3 秒计时请求在测试中约 4 秒完成，不是浏览器只给 4 秒执行预算。异步模型请求可以跨过很多次录屏／计时事件等待。现有证据包括一次 10 秒服务端等待、11.46 秒总耗时的 HTTPS 返回在 hidden 状态被处理，但没有长时间真实模型多轮验证。

调度同时接收媒体事件、网络 chunk、取图完成、计时器和可见性变化。它们可以推进同一个状态机，不把某个事件当作保活契约。录屏可能由不同系统组件继续，不能据此推断网页所有逻辑持续运行。

优先使用流式作进度与错误观察；它也可能减少网络空闲超时，但不能阻止 iOS 暂停或回收网页。模型端完成、socket 仍连接、JS 读到 chunk、计划已下发，是四个不同时间点。

请求分别有总时限、首响应时限和读取空闲时限。建议起点为总时限 180 秒、首响应 90 秒、读取空闲 60 秒，允许用户按后端修改；这是产品默认建议，未作为 Safari 性能结论。重试要区分请求未开始、已产生输出和已执行工具。不要把读取停顿解释成模型没执行。

PWA Service Worker 用于资源缓存和版本管理，不承担常驻 LLM／取屏进程；Web Worker 可减轻主线程负载，不保证脱离页面无限执行。Wake Lock 在页面隐藏时会释放，不能替代后台权限。不使用静音音频等伪保活技巧。

最低可支持场景是：用户主动启动共享，手机亮屏，在其他 App 中运行一项任务。锁屏、系统中断、内存压力、低电量、网络切换都要测试并明确状态；网页被结束后会话可恢复，但不能静默重获屏幕授权或续播旧动作。

## 5. 本地存储与长会话

以 IndexedDB 为主数据库；大附件未来可切 OPFS，先用 Blob 存储即可。localStorage 只放少量非敏感偏好，不存整段会话 JSON。

| Store | 主要键／索引 | 内容 |
|---|---|---|
| sessions | id，updatedAt | 标题、摘要、状态、版本、最后 seq |
| events | [sessionId, seq] | 用户消息、assistant、工具、计划与回执事件 |
| frames | id，[sessionId, captureOrder] | Blob 引用、尺寸、方向、时间、变换、hash |
| observationGroups | id | 有序 frameId、实际采样时刻、缺失原因 |
| plans | id，[sessionId, seq] | 原始计划、编译段、提交状态、结果 |
| summaries | [sessionId, throughSeq] | 模型上下文摘要及引用范围 |
| devices | boardId／targetId | 绑定、能力、端点和授权引用 |
| skills | [sourceUrl, id, version] | 已安装包、正文和参考文件、hash、启用状态、更新策略；同源多版本保留 |
| credentials | id | 可选加密凭据；不进入普通导出 |

一个事务追加事件并推进 lastSeq，不依赖关闭页面时的最后保存。流式 token 批量保存，完成一个 tool plan 后先提交其完整意图再发设备。UI 只加载近期记录，用游标分页与虚拟列表。模型上下文单独投影，完整历史不因压缩被删掉。

长会话策略：稳定 prompt 前缀；近期工具结果与关键截图保留；旧截图变成本地引用和摘要；按需历史搜索。压缩不能拆开 tool-call/result 对，不能丢掉尚未确认的输入状态、失败原因、用户最新指令、目标映射或未执行步骤。

附件按容量和用户保留策略管理：文字与回执默认保留；完整录屏默认不持久化；临时媒体是有界缓冲。用户固定的图片不被自动淘汰；空间不足时停止新的附件写入，保留错误与可导出的文字，不静默破坏会话。

Safari 默认尽力保留；申请 `persist()` 并检查结果，用 `estimate()` 显示近似容量。主屏幕 Web App 对 ITP 的七天无交互清理有豁免，但不能把浏览器存储当作唯一备份。提供带 manifest、schemaVersion、附件 hash 的导出／导入；导入先校验并写入 staging，成功后再切换，失败不覆盖原库。

Safari 与 PWA 存储容器、不同域名和端口不能假定共享数据。跨标签页争用使用单 writer 协调；支持时用 Web Locks，另有 IndexedDB 原子 lease 兜底。租约与 ESP32 目标写权限都要检查，不能只做一个前端布尔值。

## 6. 可恢复的事件

事件信封包含 `eventId, sessionId, seq, parentId?, runId, type, recordedAt, payload, schemaVersion`。只保留公开的模型文本、工具参数、回执和观察，不存储不可访问的模型内部推理。

计划状态：`prepared → submitted → accepted → running → completed/failed/cancelled/unknown`。工具结果区分 `hid_submitted` 与 `observed_match`。网页崩溃时保留最后有效前缀，冷启动先查询 board bootId 和旧 segment 状态，再重新取图核对。

“unknown”是正式状态：网络失败、设备重启或回执缺失不能自动变成成功，也不能自动重发有副作用的动作。已有输入无法撤销。预算耗尽时按产品规则结束本轮并保存进度，不宣称任务已完成。

## 7. 浏览器数据与网页供应链

本地存储不是与网页代码隔离的保险箱。同一 origin 上运行的脚本能访问它，故静态发布不加载不受控远程脚本；Skill 包默认纯数据，不执行导入的 JS。Markdown 要清理，CSP 和资源来源明确，PWA 版本可回退。自托管 origin 是用户自己的信任边界。

参考：[WebKit 存储政策](https://webkit.org/blog/14403/updates-to-storage-policy/)、[ITP](https://webkit.org/tracking-prevention/)、[Wake Lock](https://www.w3.org/TR/screen-wake-lock/)、[源码阅读位置](../../research/harness-reference/readings.json)。
