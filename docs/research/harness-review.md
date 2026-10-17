# Harness 离线可靠性审阅

日期：2026-10-18。范围仅 `apps/web/core/harness.js`、`providers.js`、`store.js`、`tests/web/core.test.mjs`，辅读 capture 的异步边界。没有修改核心源码、启服务、读凭据或真实出网。父任务正在重构 Harness/context，以下是审阅开始时快照的缺陷与验收建议，不是对重构后版本的结论；不要保留旧实现或依赖旧行号。

既有 `node --test tests/web/core.test.mjs`：15/15 通过。额外以 `openStore({memory:true})`、延迟 Promise、`fetchImpl`／`invoke` stub 在内存离线复现 9 个问题。所有 `*.invalid` 请求均由 stub 拦截，没有网络访问。

## 优先修复

| 级别 | 缺陷 | 可复现观察 | 建议的不变量 |
|---|---|---|---|
| P1 | 并发 run 在异步初始化前未占位 | 同步发起两次 run，两个 invoke 都执行 | 同一 Harness 只有一个 generation；run 在第一次 await 前取得独占，旧 finally 不能释放新 generation |
| P1 | 取消／失败留下未配对 tool calls | assistant 声明 c1、c2，c1 capture 等待期间 stop，最后仅有 c1 结果 | 对模型发送的每个调用都恰有一个结果；缺失结果补 cancelled/not-executed，或者恢复时整体剔除未完成组，不能重放已执行动作 |
| P1 | OpenAI 多工具观察图像插入结果组中间 | 序列被转换为 assistant、tool(c1)、user(image)、tool(c2) | 先完整发送该 assistant 的所有 tool 结果，再发送观察图像；或使用模型支持的另一种有效编码 |
| P1 | 停止可能仍返回 completed | assistant 落盘 Promise 等待时 stop，落盘恢复后 run resolve 并发 completed | 取消优先于完成；落盘前后检查本 generation；已保存证据可以保留，但不能发 completed 或继续执行 |
| P1 | 输入工具缺乏运行时参数校验 | `plan:'not-an-object'` 且带额外属性，仍进入 executePlan | 模型输出不可信；工具入口按固定 schema 验证对象、必填字段、类型、未知字段及计划结构，再调用执行器 |
| P2 | 导入丢失工具身份与图像 | export 后 import，assistant.toolCalls、tool.toolCallId、images 均消失 | 导入保留完整结构并验证配对；不把缺 ID 的 tool 行直接发送给模型 |
| P2 | 结束原因被统一当成功 | `finish_reason:'content_filter'`、空文本返回普通成功对象 | 明确处理 stop/tool_calls、拒绝、过滤、暂停、截断与未知结束原因，不能“空白完成” |
| P2 | UI 回调异常可中断执行循环 | 首个 onEvent 抛错，仅 user 落盘就 failed；onDelta 抛错时 body 未取消 | UI 观察者与控制循环隔离，错误报告不得递归抛错；终止读取时取消 response body／底层请求 |
| P2 | 长会话只是先全量读取再截断 | `getMessages()` getAll/clone 所有消息和旧图，然后 slice(-80) | 数据库分页／有界读取；上下文按完整轮次和 token/图像预算构造，而不是固定消息数 |

以上 P1 是合并前应覆盖的执行一致性问题，不表示已经观察到物理手机误操作；本审阅没有硬件执行。

## 可直接转成回归测试的场景

### 1. 并发启动与旧 generation 清理

1. 用单个 Harness，同时调用两次 `run()`，让 invoke 卡在同一个延迟 Promise。
2. 等待一个事件循环，观察 invoke 计数：旧实现为 **2**，应最多为 1，另一个 run 明确拒绝。
3. 再构造“旧 run 完成／新 run 等待”的交错，断言旧 run 的 finally 不清空新控制器，`stop()` 始终停止当前 generation。
4. 同样覆盖初始化读取抛错、预先 aborted 外部 signal、用户连续双击发送。

不要依赖 UI 禁用按钮作为并发互斥；程序调用、异步刷新与多个入口仍可能触发。

### 2. 多工具取消与恢复配对

stub 第一次回复：

```js
{ text: '', toolCalls: [
  {id:'c1', name:'phone_observe', arguments:{}},
  {id:'c2', name:'phone_observe', arguments:{}}
] }
```

让 c1 的 `capture.grab()` 等待，调用 `stop()` 后再释放等待。旧实现最终保存 assistant `[c1,c2]`，但 tool 行只有 c1。然后发送新用户消息并检查下一次 invoke 的 messages，不能包含孤儿 c2。

还应覆盖：工具 1 成功但工具 2 抛错、结果落盘失败、达到步骤预算、重复 call ID、未知工具名、恢复时发现重复／缺失结果。取消不应触发自动重试真实输入；已知成功、未执行、结果不确定必须有不同状态。

### 3. 两协议消息结构验证

构造同一 assistant 两个 call，其中 c1 是带图观察，c2 是普通查询；用 `callModel({fetchImpl})` 捕获序列化 payload。旧 OpenAI 结果为：

```text
assistant(tool_calls: c1,c2)
tool(c1)
user(observation image)
tool(c2)
```

应断言未完成结果组之间无 user／assistant 插入，工具 ID 集合和结果一一对应。Anthropic 也应验证 tool_use 与后续 tool_result 的结构，而不是只检查“出现了 image 字段”。现有图像测试的输入本身只有孤立 tool 行，没有 preceding assistant tool call，因此不能证明真实对话配对有效。

多帧图像应保留 frame ID、时间与图像绑定；不能把单独 user 图像的来源依赖模糊文字猜测。

### 4. 取消落盘竞态

包装 store.addMessage：当 role 是 assistant 时暂停，等 invoke 返回并进入此暂停点后 stop，再恢复落盘。旧实现 run **resolve**，status 为 `awaiting_model → completed`。

期望为 cancelled；不会再下发动作或下一次模型调用。允许将已得到的回复作为“停止前已收到”保存，但 UI 与状态机不能宣布任务完成。对工具结果落盘、capture 返回、executePlan 回执返回也测试相同竞态。

### 5. 工具输入验证

给 task 模式提供 spy executePlan，stub 调用：

```js
{ id:'c', name:'phone_execute_plan',
  arguments:{plan:'not-an-object', extra:'forbidden'} }
```

旧实现 executePlan 计数为 **1**，应为 0，返回结构化验证错误。进一步覆盖 `null`、数组、嵌套 plan 超限、非整数坐标、NaN/Infinity（经内部调用）、空 ID、重复 ID、query/id 类型错误。JSON Schema 发送给模型接口不能代替本地验证。执行器仍需独立验证 target、writer 和动作边界。

### 6. 导入导出完整性

一个 user 轮次包含 assistant.toolCalls、tool.toolCallId、图像、操作 receipt、取消结果，export 后 import，再导出并比较语义结构（允许新 session/message IDs 与时间）。旧实现只保留 role/text，会得到没有身份的 tool 行。

若旧版格式缺信息，应明确导入为只读归档或剥离整个工具组，不能构造貌似可继续但协议无效的历史。导入的 system 角色也应明确可信边界，不应自动升级为新的 Harness 系统规则。

### 7. 结束原因与伪成功

离线 response：

```js
{choices:[{message:{content:''}, finish_reason:'content_filter'}]}
```

旧 callModel 正常 resolve，Harness 随后 completed。应测试过滤、拒绝、未知 finish、Anthropic pause_turn/max_tokens、缺少正常结束标记、终止标记后继续发事件、空文本无工具等情况。

“模型本轮已回复”和“用户目标已达成”应是两个状态；没有执行器时的说明性回复不能变成任务目标完成证明。工具回执 `submitted`、`uncertain`、`verified` 也不应被统一视为成功。

### 8. 回调抛错与读取资源

- onEvent 在 user message、status、assistant message、tool message 各位置抛错，任务控制逻辑不应被 UI 崩溃接管。
- onDelta 第一次收到文本时抛错。用自定义 ReadableStream 的 cancel spy，旧实现取消次数 **0**，只是 releaseLock；若循环选择终止，必须取消未结束 response，不能留下供应商继续生成。
- 观察者异常需要独立错误通道；不要在 catch 里再次调用同一个会抛错的回调而覆盖原错误。

### 9. 长会话与有界上下文

源代码检查可确定 getMessages 先读取完整数据；本轮没有做真实性能 benchmark。建议测：

- 数万条历史消息，早期含图但近期仅文本；上下文构造不读取旧图 Blob/Data URL，读取量随预算有界。
- 最后 80 条落在工具组中间；上下文保持完整工具组，不截成孤儿或删除本应保留的用户任务。
- 单条超长用户／工具／Skill 文本；消息数低也不能突破 token 或图像预算。
- 新回复与压缩 checkpoint 的提交顺序；失败后恢复不能漏目标、重复输入或让已取消任务自行继续。
- session_search 使用索引／受控扫描，并限制查询和返回长度；空查询不应意外复制大量历史。

## 本轮建议的最小测试集合

合并前至少包括：并发双启动；存储 await 期间取消；多 call 中途取消后下一轮合法；两协议多 call 带图完整配对；恶意工具参数执行器零调用；导入后工具结构保真；过滤／缺结束标记拒绝完成；UI 回调异常隔离；有界上下文只读需要的数据。

测试使用固定 fixture 与可控 deferred Promise，无需真实模型、凭据或手机即可可靠复现。真实 Safari／IndexedDB 的事务与内存存储行为仍需独立检查，不能只凭 RAM store 测试宣称浏览器持久化一致性。

## 重构后的复审与修复记录

本节描述当前实现；上文保留为初审快照，不能把旧缺陷当作当前仍未修复的结论。

- 原9项执行一致性问题已转成回归检查并修复：同步占位与持久租约、取消优先、完整工具配对、图像组编码、全计划预检、图像与工具导入保真、结束状态校验、观察者隔离及分页上下文。
- 新增复审发现创作技能的并发覆盖：已改为 IndexedDB 单事务唯一创建与 digest CAS，竞争时只有一方成功，另一方明确冲突。
- 通用下载目录曾能复用内置 ID：现按来源 URL 命名空间存储；旧冲突项保留为停用的社区记录，恢复内置包。相同版本被改写的内置正文也会恢复，用户停用状态保留。
- 导入文件中的 `system` 行曾可能进入供应商高优先级指令：导入时降为带来源说明的历史用户数据，上下文投影再次兜底。模型只收到代码生成的系统前缀。
- 模型发现现遵守调用方取消；UI 另以编辑器实例和 generation 拒绝过期目录结果。重复提交的 UI 锁在第一次 await 前占位，旧请求不能清理新任务。
- 语言切换不得翻译用户标题、账号名、模型 ID、正文或技能内容；UI 明确隔离用户内容，只翻译产品文案和内置技能的展示元数据。
- OpenAI 兼容、Anthropic、Codex 的多轮 opaque 协议状态按账号／模型／来源隔离；不渲染为聊天、不加入搜索工具结果或摘要内容。DeepSeek 两接口默认思考模式的真实 Skill 多轮流程另有独立记录。
- 下载、非流式 JSON、流式事件和协议状态设容量边界，在读入时拒绝超限内容。异常和取消释放流读取器，不让迟到结果触发操作。
- 构建先清空专用 `build/site` 再复制允许的产物，避免旧 `.local` 文件或已排除目录残留。已对待提交源码和预编译 bin 扫描已知本地测试秘密，没有发现匹配；没有打印秘密值。

上述结论来自源码、可控异步复现和自动回归检查。真浏览器界面检查另记在 `harness-ui-verification.md`；真实 Safari 订阅登录、公共社区部署及产品固件手机控制仍是独立验收项。
