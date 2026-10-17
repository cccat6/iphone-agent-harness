# Harness 公开源码调研

研究日期：2026-10-18。已下载 10 个官方仓库的完整当前源码树归档（不含 Git 历史），固定提交号、归档 SHA-256，并重点阅读 33 个提示词／循环／Skill／持久化／Computer Use 位置。不是逐文件安全审计，也没有运行这些项目或它们的依赖安装脚本。

清单：[sources.lock.json](../../research/harness-reference/sources.lock.json)。阅读证据：[readings.json](../../research/harness-reference/readings.json)。源码在本机 `research/harness-reference/repos/`，忽略不随本项目发布；归档保留在 `archives/`。获取脚本通过 GitHub 公共 refs 解析提交，再下载官方归档，无需接受 Xcode 许可或使用 GitHub 凭据。重复运行复用已固定并校验的归档。

## 1. 公开范围与选择

| 项目 | 本轮实际能读到的内容 | 本地许可文件 | 对我们的用途 |
|---|---|---|---|
| OpenAI Codex | Rust agent core、公开基础提示词、工具调度、上下文循环 | Apache-2.0 | 稳定工具边界、turn/step、压缩和恢复 |
| DeepSeek Harness | Cordis 插件、提示词注册、流式循环、Skill、持久化、CUA 适配 | MIT | 扩展边界和按需披露，重点参考 |
| Claude Code | 官方公开插件、文档、mods 等；没有完整 CLI 内核源码 | all rights reserved／商业条款 | 只分析明确公开部分；不作为可直接复制内核 |
| Claude Agent SDK TypeScript | README、示例、脚本；此仓库没有完整 SDK 内核源码 | all rights reserved／商业条款 | 接口参考，不能声称读到了内部系统提示词 |
| Cursor public | 官方公开入口／反馈仓库，无 Agent 内核 | 无根目录开源许可 | 公开规则和 Agent 文档；无完整系统提示词 |
| OpenCode | 当前 core/session/runner、prompt、插件和协议包 | MIT | 工具生成的指导、持久事件和流式错误边界 |
| pi-mono | 通用 agent loop、coding-agent、消息与会话模块 | MIT | 小内核和适配接口，不直接搬 Node 运行时 |
| LangChain DeepAgents | graph 组装、middleware、Skill、摘要和视频帧处理 | MIT | 能力中间件、上下文预算、多帧内容 |
| Anthropic quickstarts | 官方 Computer Use demo 的循环、动作、截图结果 | MIT | 具体截图—模型—动作循环、顺序和错误传播 |
| UI-TARS Desktop | GUIAgent、动作空间、图像历史、执行适配器 | Apache-2.0 | 视觉动作接口和时序／尺寸元数据 |

以上是读取的许可标记，不是完整第三方依赖许可审计。新项目尚未选择整体许可证；本轮 prompt 和协议为原创设计，没有原样移植整份上游提示词。

## 2. Codex：prompt 不是整个 Harness

阅读入口：

- `codex-rs/protocol/src/prompts/base_instructions/default.md`：公开基础指令，描述角色、工作环境、工具和沟通。
- `codex-rs/core/src/session/turn.rs`：采样、工具继续条件、新用户输入、上下文预算和中途压缩。
- `codex-rs/core/src/tools/parallel.rs`：工具调用保留对应的 step 上下文，处理取消、错误和执行记录。

值得采用：区分一个用户 turn 与内部多个 model/tool step；工具暴露与执行上下文绑定；压缩后继续任务，完整运行记录与模型当前窗口不是同一份数据。

不直接搬：shell／编辑代码工具、终端环境假设、仓库 AGENTS 语义。公开 default.md 也不是所有模型、Codex 桌面版本和服务端部署的完整实际 prompt；不能以这一份文件声称复刻生产系统。

我们的映射：turn 对应一次用户任务，step 对应一次模型判断和计划结果；手机修改工具按目标独占，不能照搬独立代码工具的默认并行策略。

## 3. DeepSeek Harness：组合、流式结算和插件边界

阅读入口：

- `packages/core/system-prompt/src/index.ts`：排序的命名 section、动态 context、tools、variables；严格模板插值；scope 层覆盖；渲染时确定性排序。
- `packages/core/agent-loop/src/agent.ts`：每步组装 prompt，逐块读取流，结算 assistant message／attempt，然后提取工具调用；取消和错误保留记录。
- `packages/core/agent-loop/src/tool-calls.ts`：exclusive 屏障、有界并行池、按模型顺序提交结果；取消后给未执行工具补明确结果。
- `packages/skill/skill/README.md` 与 `packages/skill/tool-skill/src/index.ts`：目录 metadata、按需正文、来源抽象、目录版本变化进入会话。
- `packages/session/session-persistence/README.md`：连续 append-only seq、单 writer、flush 的持久化边界、损坏／新版本拒绝、崩溃恢复补齐工具结果。
- `packages/compaction/compaction/src/index.ts`：压缩服务、压力／窗口溢出触发、保留工具配对边界。
- `packages/computer-use/computer-use/src/index.ts` 与 native CUA provider 文档：CUA 服务负责唯一 provider 槽位，真实输入／截图由 provider 提供；取消不回滚输入。

这不是一份巨大的万能 system prompt。模型看到的是身份＋部署 persona＋当前挂载工具指导＋动态上下文＋Skill 目录和正文。其可取之处是边界，而不是把全部插件和 Node 依赖装进 Safari。

我们的映射（按用户后续简化）：不采用 prompt 注册、ToolRegistry、SkillProvider 或自动插件装配。工具、模型协议和设备驱动固定在代码中；prompt 用普通函数组合，线上 Skill 内容下载到本地后按需加入上下文。保留结果顺序、目标隔离、持久化和恢复思路。

## 4. pi：适合借鉴的小循环

阅读入口：

- `packages/agent/src/agent-loop.ts`：AgentMessage 直到模型调用边界才转换；有 agent/turn/message/tool 事件；支持 steering 和 follow-up；达到 length 终止时不执行可能截断的工具参数。
- `packages/coding-agent/src/core/system-prompt.ts`：按工具贡献、项目上下文、Skill 和运行目录构建可替换 section。
- `packages/coding-agent/src/core/session-manager.ts`：versioned session、parentId、分支与 compaction 记录，工具和自定义事件分开投影。

我们的映射：浏览器内核保持 UI 无关；模型 adapter 处理供应商格式，SessionStore 换成 IndexedDB；采用增量事件和上下文投影。源实现包含 fs/crypto 等 Node 模块，不应直接把 coding-agent 放进 PWA。

## 5. OpenCode：工具、流和结果的顺序

阅读入口：

- `packages/core/src/session/runner/prompt/system.txt` 与 `session/system-prompt.ts`：当前基础 prompt 简洁，工具指导按启用工具生成。
- `session/prompt.ts`：prompt、附件、Skill 的准备流程，以及 steer 类型的输入。
- `session/runner/index.ts`：drain 已记录工作的执行接口。
- `session/runner/step.ts`：provider stream 与工具执行分别记录；先发布 Tool.Called 再执行；输出已经开始后区别处理重试与继续，取消也结算未完成工具。

重要差异：当前代码支持完整工具事件到达后与剩余 provider stream 重叠执行。我们的 V1 选择等待完整 assistant 响应正常结束，减少物理输入在截断／取消后的不确定性；通过批量动作补偿延迟。以后如果优化为提前执行，需要单独验证其契约。

## 6. DeepAgents：中间件与多帧

阅读入口：

- `libs/deepagents/deepagents/graph.py`：agent graph、中间件、状态、checkpoint 和模型 profile 的组装；DeepAgentState 使用 delta message channel 减少 checkpoint 增长。
- `middleware/skills.py`：来源抽象与 metadata→正文的渐进披露。
- `middleware/_video.py`：视频窗口抽帧、文字时间标签与图片交错输出，并限制帧数、像素、字节和解码时间。

注意：文件里仍有 `_LEGACY_BASE_AGENT_PROMPT`，但代码明确标记现行版本不再默认提供 authored base prompt。不能把这个旧常量作为当前唯一系统 prompt。

我们的映射：规范化观察组，把图片时间、来源和字节预算纳入内容格式；避免整个视频或无限多图堆进上下文。Python/LangGraph 执行环境不作为我们的浏览器依赖。

## 7. Computer Use 实现对照

Anthropic demo 的 `computer_use_demo/loop.py` 有明确 environment prompt、调用模型、处理工具结果、裁剪旧图和 prompt cache 策略。其 prompt 也建议可行时合并多个工具调用；它不是强制“一次点击再请求模型”。顺序动作一旦失败，后续依赖动作应有未执行结果。

UI-TARS 的 `packages/ui-tars/sdk/src/constants.ts` 明确动作空间、wait/finished/call_user；`GUIAgent.ts` 每轮获取截图、保留尺寸和 scaleFactor、构造滑动图片历史后调用模型。它的模板带 Thought 格式，我们不照搬为要求详细推理链，只保留简短动作意图和结构化调用。

两者主要面向桌面：右键、浏览器和桌面截图不能直接等同手机单指行为。我们的新增重点是完整按下—轨迹—松开、末段释放速度、方向变换、移动中观察和本地固件计时。

## 8. Claude Code 与 Cursor 的可核查范围

Claude Code 官方仓库的插件开发 Skill 展示了 metadata／正文／references 的渐进加载设计。官方 SDK 仓库给出示例和调用入口，但这些公开仓库不提供完整当前 agent 内核和完整内部 prompt；许可文件也不是 MIT/Apache 的开源许可。

Cursor 官方公开仓库只有入口和反馈资料。公开文档说明 Agent 由 instructions、tools、model 组成，规则和 Skill 按场景加入；这支持“按模型和能力适配”的设计，但不能据此补写它的私有实现或声称系统 prompt 已被读取。

本轮未使用泄露源码、反编译安装包或非官方 system-prompt 集合。

## 9. 对本项目的最终取舍

采用一个小型浏览器 Harness，核心强类型／可测试，执行能力固定，线上 Skill 用本地缓存的内容扩展操作知识。参考的内容是：

1. prompt、动态上下文、工具 schema、Skill 正文分别管理。
2. 流与工具完整结算后再产生下一步，不执行半截响应。
3. append-only 事件＋单 writer＋可重建投影；完整历史留本地。
4. 视觉观察是带时间、方向和目标的证据，而不是一个 base64 字段。
5. 手机物理修改操作以目标为锁；按计划批量、按设备时间执行。
6. 未知结果先核对，取消不伪装成回滚。

不采用：任意 Node 插件热执行、shell 工具、把服务端 session 当本地数据、要求每个动作都问一次模型、默认无限录像、宣称录屏等于无限后台权限。

## 官方文档补充

- [OpenAI Skills operational practices](https://developers.openai.com/cookbook/examples/skills_in_api#operational-best-practices)：目录清晰、按需加载、版本固定，避免把完整技能复制进 system prompt。
- [Anthropic Computer Use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool)：模型工具请求由应用执行，应用返回结果与截图。
- [Cursor Agent](https://cursor.com/docs/agent/overview) 与 [Rules](https://cursor.com/docs/rules)：公开行为和扩展接口，非私有源码。

固定提交下的逐文件链接由 `readings.json` 给出；不要用不断变化的 main 分支链接代替版本证据。
