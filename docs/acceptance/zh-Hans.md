# 完整验收清单

[English](README.md) · [发布证据汇总](../research/release-acceptance.md)

本清单覆盖 Web 应用、ESP32 桥接器、全部内容与发布。电脑侧检查由项目维护者完成；用户只需参加下方暂缓的手机真机验收。自动化或模拟项打勾，**不代表手机已验收通过**。

证据日期：2026-10-18。`A`＝已记录的自动化／主机测试通过；`N`＝原生桌面浏览器交互通过；`L`＝Mac 上真实服务／设备请求通过；`D`＝源码／文档／内容核对；`P`＝待手机验收；`F`＝等待最终发布核验。测试文件链接说明覆盖范围，报告链接记录实际执行；旧报告只证明对应日期的候选版本，不能证明后续改动已上线。不要在本清单记录密钥、所有者密码、Wi-Fi 信息、验证数字或私人屏幕。

## 电脑证据与最终发布关口

| ID | 状态 | 检查与确切证据 | 已证实范围／剩余边界 |
|---|---|---|---|
| R01 | A | Web全套 **341/341**，0失败；[验证记录](../research/release-verification.json) | 含Core R1–R7、取屏／RTT、组合状态、稳定设备ID及独立R9回归；[新R10](../research/independent-device-identity-r10.md)无新问题。最终提交／CI见R06。 |
| R02 | A | [生命周期 R6](../research/independent-lifecycle-r6.md)：新增6项取屏、定向82/82 | 使用有限取屏／设备适配器，不是真实Safari录屏。 |
| R03 | A | host67 +实际router12；独立R7九项+坐标回归、R8十一项；canonical6／artifact6 | [R8报告](../research/independent-firmware-r8.md)关闭软件问题，四种实际SDK宏检查也通过。有限主机／编译证据不等于物理BLE送达。 |
| R04 | N / A | 新[Web R6](../research/independent-web-r6.md)及最终[设备/UI R10](../research/independent-device-identity-r10.md)无新问题 | 原生选定流程、八语模块、[实际DOM五类错误×八语](../research/desktop-panel-localization-verification.json)、[真实IDB九项](../research/desktop-storage-verification.json)；不冒充所有页面的真机Safari验收。 |
| R05 | D / F | [四芯片构建报告](../../apps/web/firmware/build-report.json)、[清单](../../apps/web/firmware/manifest.json)、[构建校验器](../../tools/build_firmware.py) | 最终四芯片编译、源码／二进制hash及C3最终镜像核验待发布核验；未宣称S3/C6/原ESP32实机通过。 |
| R06 | F | [CI定义](../../.github/workflows/checks.yml)、[部署报告](../research/deployment-verification.json) | 最终提交、推送后CI、线上资源hash及部署后路由/API检查待发布核验。 |
| R07 | D / F | [发布汇总](../research/release-acceptance.md)、[第三方声明](../../THIRD_PARTY_NOTICES.md)、[许可证](../../LICENSE) | 维护者完成最终报告、敏感信息及产物复核后才能宣告发布完成。 |

## 会话、设置与本地数据

| ID | 状态 | 功能／预期行为 | 证据与边界 |
|---|---|---|---|
| S01 | A / N | 新建、独立标题／模式／账号模型、重命名与置顶 | [core/store](../../tests/web/core.test.mjs)、[原生R4](../research/independent-web-r4.md)。 |
| S02 | N | 搜索及空结果、归档／恢复、切会话／返回 | [Web界面记录](../architecture/web-ui.md)、[R4](../research/independent-web-r4.md)。 |
| S03 | A / N | 删除会话及消息／图片／事件，保留其他会话／设置／Skill；UI明确确认 | [真实隔离IDB删除、重开与备份恢复](../research/desktop-storage-verification.json)、[core](../../tests/web/core.test.mjs)、[R6确认／取消](../research/independent-web-r6.md)。未在用户数据上提交产品永久删除按钮。 |
| S04 | N | 同一页面内A/B草稿隔离；不承诺刷新恢复未发送草稿 | [R4](../research/independent-web-r4.md)。 |
| S05 | A / N | IndexedDB v1→v2、最近80条、向前游标分页无遗漏／重复 | [真实IDB与165条原生记录](../research/harness-ui-verification.md)、[存储夹具](../../tests/browser/storage.html)。 |
| S06 | A / N | 消息、工具记录、图片Blob持久化；普通对话隐藏内部运行记录 | [core](../../tests/web/core.test.mjs)、[运行时集成](../../tests/web/runtime-integration.test.mjs)、[真实IDB](../research/harness-ui-verification.md)。 |
| S07 | A / N | 完整`iah-session` v2导出；独立导入，兼容v1；保留工具／图片／模型／模式 | [原生文件选择器／下载R4](../research/independent-web-r4.md)、[IDB导入导出](../research/harness-ui-verification.md)。会话导出不含账号vault或作者身份备份。 |
| S08 | A / N | 存储估算、如实显示持久化申请结果、刷新保留设置 | [core](../../tests/web/core.test.mjs)、[原生设置](../research/harness-ui-verification.md)、[R4动态语言](../research/independent-web-r4.md)。浏览器仍可清理数据。 |
| S09 | A / D | localStorage保存语言偏好；会话／Blob／设置在IndexedDB；存储失败可见 | [i18n](../../tests/web/i18n.test.mjs)、[路由／存储失败](../../tests/web/compatibility-routing.test.mjs)、[语言源码](../../apps/web/i18n.js)。没有云端会话同步。 |
| S10 | A | 会话／run互斥、防重复发送、持久终止状态、本地历史搜索 | [Harness](../../tests/web/harness.test.mjs)、[运行时集成](../../tests/web/runtime-integration.test.mjs)、[独立core](../research/independent-core-r5.md)。 |

## 模型、账号与凭据

| ID | 状态 | 功能／预期行为 | 证据与边界 |
|---|---|---|---|
| M01 | A / N | 独立账号增改删、协议／地址／默认模型／流式、分组多账号模型选择 | [core](../../tests/web/core.test.mjs)、[原生双账号](../research/harness-ui-verification.md)。 |
| M02 | A / N / L | 实际模型目录：OpenAI、Anthropic分页、DeepSeek官方映射；失败保留手填ID | [URL测试](../../tests/web/provider-urls.test.mjs)、[原生HTTP模拟R4](../research/independent-web-r4.md)、[实请求](../research/harness-live-results.json)、[目录记录](../architecture/auth-and-backends.md)。列出模型不等于有权限或支持视觉。 |
| M03 | A / N | 改地址／账号、关编辑器、取消后忽略旧目录结果；保留HTTP状态 | [动态UI](../../tests/web/i18n-dynamic.test.mjs)、[组合状态](../../tests/web/localized-status.test.mjs)、[原生R6](../research/independent-web-r6.md)。错误／加载／数量／占位随语言重算，不重建未保存表单。 |
| M04 | A / L | OpenAI Chat Completions与Anthropic Messages，流式／非流式、工具与usage | [provider/core](../../tests/web/core.test.mjs)、[真实DeepSeek Skill流程](../research/harness-live-results.json)、[真实模型＋模拟手机](../research/phone-harness-live-verification.json)。Mac不能证明Safari CORS。 |
| M05 | A | 推理URL／查询参数、opaque状态完整范围、账号／模型／端点隔离、UTF-8／工具／响应容量 | [provider边界](../../tests/web/provider-bounds.test.mjs)、[R3](../research/independent-core-r3.md)、[core R4](../research/independent-core-r4.md)、[R5](../research/independent-core-r5.md)。 |
| M06 | A / N | 默认仅内存；可选口令加密vault；刷新主动解锁、清口令、删账号同步删密文 | [core](../../tests/web/core.test.mjs)、[R6假Key刷新及错／正确解锁](../research/independent-web-r6.md)。此UI夹具未保存真实凭据。 |
| M07 | A | 普通设置、会话导出、模型错误、UI事件不含明文Key/token | [core](../../tests/web/core.test.mjs)、[Codex](../../tests/web/codex.test.mjs)、[R5敏感信息边界](../research/independent-core-r5.md)。最终仓库／产物扫描见R07。 |
| M08 | A / N | 保存Codex账号后显式设备码登录；显示真实官方链接／码、轮询／取消；失败不伪造登录 | [Codex](../../tests/web/codex.test.mjs)、[原生UI](../research/harness-ui-verification.md)、[订阅报告](../research/codex-subscription.md)。真实登录／推理待P15。 |
| M09 | A | Codex Responses SSE完成、多账号、刷新轮换、删除后晚刷新不复活、更新加密vault | [Codex套件](../../tests/web/codex.test.mjs)。离线协议适配器不证明真实订阅权益。 |
| M10 | A / D | 注册SIWC授权码PKCE/state/nonce/JWKS及issued client ID | [Codex](../../tests/web/codex.test.mjs)、[订阅边界](../research/codex-subscription.md)。loopback回调需本机／自托管运行时，静态Safari不能监听。 |
| M11 | L / P | 两种真实DeepSeek协议均发送PNG并识别红／蓝 | [视觉记录](../research/vision-provider-verification.json)。仅64×32合成图；真实屏幕／OCR／任务质量及Safari上传待P05/P08。 |

## 上下文、图片、提示词与运行

| ID | 状态 | 功能／预期行为 | 证据与边界 |
|---|---|---|---|
| H01 | A / N | Chat本地工具不访问设备／取屏；Plan可观察不修改；Task需已证明目标 | [设备运行时](../../tests/web/device-runtime.test.mjs)、[Harness](../../tests/web/harness.test.mjs)、[原生模式R4](../research/independent-web-r4.md)。 |
| H02 | A | 固定工具：观察、有界计划、Skill列举／读取／创作／更新、会话搜索、提问、任务汇报 | [Harness](../../tests/web/harness.test.mjs)、[集成](../../tests/web/runtime-integration.test.mjs)、[system prompt](../../prompts/system.md)。远端正文不能注册工具。 |
| H03 | A | 预算、工具循环、进行中／受阻／完成；完成必须引用本run观察帧 | [Harness](../../tests/web/harness.test.mjs)、[集成](../../tests/web/runtime-integration.test.mjs)、[真实模型模拟流程](../research/phone-harness-live-verification.json)。 |
| H04 | A / N | 压缩开关／阈值／目标／预留／图数／策略；预算和不合法时拒绝 | [上下文](../../tests/web/context.test.mjs)、[原生设置](../research/harness-ui-verification.md)。token为启发式估算。 |
| H05 | A | 模型或显式摘录摘要、原子checkpoint、保留目标／最近尾部及完整工具组；失败／取消不破坏历史 | [上下文](../../tests/web/context.test.mjs)、[独立R1](../research/independent-core-r1.md)、[R5](../research/independent-core-r5.md)。不冒充读过省略内容。 |
| H06 | A | 稳定系统／Skill前缀、版本／hash、后端cache usage | [上下文](../../tests/web/context.test.mjs)、[集成](../../tests/web/runtime-integration.test.mjs)、[组装](../../apps/web/core/prompt.js)。不保证缓存命中。 |
| H07 | A / N | 图片最长边／JPEG质量，原尺寸／缩放／方向及请求／bitmap／编码时间 | [取屏生命周期](../../tests/web/capture-lifecycle.test.mjs)、[core](../../tests/web/core.test.mjs)、[原生设置](../research/harness-ui-verification.md)。图片压缩与上下文压缩分开。 |
| H08 | A | 停止／源结束废弃晚到bitmap／编码／FileReader；关闭资源并取消Plan/Task监听 | [生命周期R6](../research/independent-lifecycle-r6.md)、[取屏测试](../../tests/web/capture-lifecycle.test.mjs)。真实iOS选择／结束源待P05/P11。 |
| H09 | A | 模型／工具／输入段中取消；工具结果只结算一次，停止依赖动作，先释放本run再清理 | [Harness](../../tests/web/harness.test.mjs)、[设备运行时](../../tests/web/device-runtime.test.mjs)、[R5](../research/independent-core-r5.md)、[R6](../research/independent-lifecycle-r6.md)。未知外部结果不自动重试。 |
| H10 | D / A | 三份完整提示词：能力／证据规则、模式、摘要规则 | [system](../../prompts/system.md)、[modes](../../prompts/modes.md)、[summary](../../prompts/context-summary.md)、[集成](../../tests/web/runtime-integration.test.mjs)。文字完整不等于GUI任务可靠性保证。 |

## Skills与社区全部内容

10项均含manifest及完整`SKILL.md`。[运行时集成](../../tests/web/runtime-integration.test.mjs)、[下载测试](../../tests/web/skill-download.test.mjs)、[core](../../tests/web/core.test.mjs)覆盖包与接入；[原生UI](../research/harness-ui-verification.md)、[R4](../research/independent-web-r4.md)覆盖目录／来源。以下`D/A`表示内容与包集成，**不是每项均已在手机独立成功**。

| ID | 状态 | 内置内容 | 真机应观察的结果 |
|---|---|---|---|
| K01 | D / A | [screen-observation 屏幕观察](../../apps/web/skills/screen-observation/SKILL.md) | 新鲜帧、正确描述，不编造坐标。 |
| K02 | D / A | [temporal-observation 连续观察](../../apps/web/skills/temporal-observation/SKILL.md) | 实际顺序／时刻，稀疏时报告证据不足。 |
| K03 | D / A | [task-planning 任务规划](../../apps/web/skills/task-planning/SKILL.md) | 有界步骤／条件与基于证据完成。 |
| K04 | D / A | [phone-navigation 手机导航](../../apps/web/skills/phone-navigation/SKILL.md) | 新帧确认Home／导航结果。 |
| K05 | D / A | [text-entry 文字输入](../../apps/web/skills/text-entry/SKILL.md) | 支持字符实际出现，不支持时明确说明。 |
| K06 | D / A | [list-scroll 列表滚动](../../apps/web/skills/list-scroll/SKILL.md) | 方向／目标正确，有松开后滚动证据。 |
| K07 | D / A | [drag-and-drop 拖放](../../apps/web/skills/drag-and-drop/SKILL.md) | 按下／路径／终点保持／松开得到可见放置结果。 |
| K08 | D / A | [recovery 恢复](../../apps/web/skills/recovery/SKILL.md) | 停止、重新观察、预算内改计划，不盲重试。 |
| K09 | D / A | [challenge-router 验证挑战路由](../../apps/web/skills/challenge-router/SKILL.md) | 有界分类／路由、刷新后废弃坐标；不保证全类型可解。 |
| K10 | D / A | [skill-authoring Skill创作](../../apps/web/skills/skill-authoring/SKILL.md) | 用户语言的自有本地Skill，不增加可执行能力。 |
| K11 | A / N | 渐进目录／正文／资源、开关持久化、run内版本固定、来源命名空间 | [集成](../../tests/web/runtime-integration.test.mjs)、[原生](../research/harness-ui-verification.md)。内置／下载项只读。 |
| K12 | A / N | 本地文件／URL／目录导入、大小／路径／hash校验、失败留旧版本、安全文字显示 | [下载](../../tests/web/skill-download.test.mjs)、[core](../../tests/web/core.test.mjs)、[界面记录](../architecture/web-ui.md)。跨域需CORS。 |
| K13 | A / N | 自有创作／编辑／导出、归属、原子创建／CAS、patch版本；下载项不可原地升级为作者项 | [社区](../../tests/web/community.test.mjs)、[原生文字保留](../research/harness-ui-verification.md)。R4未完成的创建尝试不新增通过项。 |
| K14 | A / N | P-256作者身份、加密备份／恢复、公私钥匹配 | [社区](../../tests/web/community.test.mjs)、[真实备份／原生选择器R4](../research/independent-web-r4.md)。Safari CryptoKey持久化待P12。 |
| K15 | A / L | 显式发布、签名／audience／期限／nonce／hash／CAS、不可变revision、验签只读下载 | [社区](../../tests/web/community.test.mjs)、[真实线上发布／下载／清理](../research/deployment-verification.json)。模型不能发布。 |
| K16 | A / D | 可选后端、未配置如实显示、同源`/api`、本地使用不依赖社区 | [社区](../../tests/web/community.test.mjs)、[架构](../architecture/skill-community.md)。API只保存主动公开包，无会话／密钥／屏幕。 |
| K17 | D | 运营边界 | [社区架构](../architecture/skill-community.md)：仍需运营方治理／限流／配额；无举报／删除／密钥迁移服务。 |

## 可选MCP

| ID | 状态 | 功能／预期行为 | 证据与边界 |
|---|---|---|---|
| C01 | A / N | HTTPS Streamable HTTP、实际目录、逐项选择、显式启用、默认关闭 | [MCP-access](../../tests/web/mcp-access.test.mjs)、[原生R2](../research/independent-web-r2.md)、[UI](../architecture/mcp-ui.md)。 |
| C02 | A | 固定`mcp_list_tools`／`mcp_call`，仅允许项、仅Task调用、有界参数校验 | [access](../../tests/web/mcp-access.test.mjs)、[R5](../research/independent-core-r5.md)。服务器仍需验证完整schema。 |
| C03 | A / N | 改地址／凭据、取消选中、关闭／断开立即撤权；晚响应不恢复授权 | [access](../../tests/web/mcp-access.test.mjs)、[原生R2](../research/independent-web-r2.md)、[R5](../research/independent-core-r5.md)。授权仅当前页面。 |
| C04 | A | 目录分页／JSON／SSE／UTF-8／读取清理有界；模型／历史／导出屏蔽已配置凭据 | [access](../../tests/web/mcp-access.test.mjs)、[敏感信息边界](../../tests/web/mcp-secret-boundary.test.mjs)、[R5](../research/independent-core-r5.md)。不是任意DLP。 |
| C05 | A | 发出后出错／取消／撤权持久记未知；停止依赖，不自动重试；成功文本裁剪明确标记 | [access](../../tests/web/mcp-access.test.mjs)、[R5](../research/independent-core-r5.md)。外部实际状态须核对。 |
| C06 | L / P | Mac产品桥接真实公共文档服务器，目录／调用／撤权通过 | [真实MCP报告](../research/mcp-live-verification.json)：Node通过，浏览器预检HTTP403；整体浏览器互通**未通过**，P14应使用真正支持CORS的服务器。 |
| C07 | D | 实现边界完整 | [MCP合同](../architecture/mcp.md)：无stdio、完整远端OAuth托管、sampling／服务器主动请求、旧双端点SSE或恢复。 |

## 设备、固件与动作协议

| ID | 状态 | 功能／预期行为 | 证据与边界 |
|---|---|---|---|
| B01 | D / A | ESP32/C3/S3/C6≥4MB、固定依赖、白名单干净构建、实际偏移／大小／SHA-256 | [固件说明](../../firmware/IPhoneAutomationHarness/README.md)、[产物测试](../../tools/build_firmware_test.py)、[R6](../research/independent-lifecycle-r6.md)。最终产物待R05；不支持S2/H2。 |
| B02 | A / N | 桌面用户手势打开Web Serial、清单／芯片／hash校验、进度／错误／清理、安装中导航保护 | [core/flasher](../../tests/web/core.test.mjs)、[串口](../../tests/web/serial-setup.test.mjs)、[UI记录](../architecture/web-ui.md)。模拟UI不证明浏览器已真正写入。 |
| B03 | L | 最终授权C3刷写；不整片擦除更新后USB设置／profile／CA指纹保留 | [最终源码client TLS](../research/device-client-live-verification.json)记录源码及镜像hash；保留[早期物理历史](../research/device-physical-verification.json)。原生Web Serial安装另见B02。 |
| B04 | A / N | USB读显式触发、密码遮蔽／显示／清除／销毁；导出profile需CA就绪且指纹一致 | [串口](../../tests/web/serial-setup.test.mjs)、[原生USB夹具](../architecture/device-ui.md)。夹具不接触串口。 |
| B05 | D / A | 单客户端受保护AP或物理USB配网、Wi-Fi/origin/time保存、finish／重开窗口期限 | [固件说明](../../firmware/IPhoneAutomationHarness/README.md)、[R6修复](../research/independent-lifecycle-r6.md)。手机AP／回网待P02。 |
| B06 | D / A | 每板CA／叶证书、时间修正／续期及信任变更提示、NVS读回／提交失败关闭 | [固件R1](../research/independent-firmware-r1.md)、[R6修复调用链](../research/independent-lifecycle-r6.md)。未执行真实掉电／续期实验。 |
| B07 | L / A | C3真实CA及DNS验证HTTPS身份／能力／时钟、错来源／缺token拒绝 | [真实TLS](../research/device-tls-verification.json)、[client live](../research/device-client-live-verification.json)、[设备测试](../../tests/web/device.test.mjs)。Mac缓存IP仍验证DNS；Safari/mDNS/完全信任待手机。 |
| B08 | L / A / N | 先核对指纹再发owner密码、真实配对／校时、不伪造控制；稳定公开clientId避免刷新重配耗尽名额 | [实际client](../research/device-client-live-verification.json)、[身份测试](../../tests/web/device-client-identity.test.mjs)、[新R10](../research/independent-device-identity-r10.md)、[双handle真实IDB](../research/desktop-storage-verification.json)。token仍按用户选择仅内存／加密，真实HID证明不省略。 |
| B09 | A / N | 前台可信8位HID数字、拒绝合成／粘贴／重复／修饰键、到期／切目标／关面板清理 | [设备UI](../../tests/web/device-ui.test.mjs)、[原生模拟面板](../architecture/device-ui.md)。真实数字输入待P04。 |
| B10 | A | 恢复token／地址不等于本页目标证明；核对board/boot/client/target、设置确认与取屏门禁 | [设备](../../tests/web/device.test.mjs)、[运行时](../../tests/web/device-runtime.test.mjs)、[UI合同](../architecture/device-ui.md)。 |
| B11 | A | 每目标writer、同run续租／清理、过期／替换／重启旧lease拒绝；Chat/Plan不抢租约 | [设备](../../tests/web/device.test.mjs)、[运行时](../../tests/web/device-runtime.test.mjs)、[R6主机](../research/independent-lifecycle-r6.md)。实际冲突／过期待P11/P16。 |
| B12 | A | 定向BLE、稳定身份+连接代次、排队／超时隔离、按实际提交坐标释放 | [R6/R7反例](../research/independent-integrated-r7.md)、[新R8](../research/independent-firmware-r8.md)。软件隔离回归通过；真实双手机仍见P16。 |
| B13 | A | 完整计划／能力预检、canonical hash、精确范围／ID、请求字节／事件／按住／期限限制 | [计划](../../tests/web/plan.test.mjs)、[设备](../../tests/web/device.test.mjs)、[独立R2](../research/independent-core-r2.md)、[canonical R6](../research/independent-lifecycle-r6.md)。不盲重发。 |
| B14 | A | tap、带终点保持的drag、移动中立即松开的swipe、完整pointer_sequence、key/Home、有界wait | [计划](../../tests/web/plan.test.mjs)、[schema](../../specs/action-plan.schema.json)、[动作语义](../architecture/actions.md)。单HID指针，不是原生多点；滚轮／Fn／Unicode不通用。 |
| B15 | A | 全屏0–10000、frame／方向／源epoch；旧帧／目标／方向阻止继续 | [计划](../../tests/web/plan.test.mjs)、[取屏](../../tests/web/capture-lifecycle.test.mjs)、[R6](../research/independent-lifecycle-r6.md)。真实旋转映射待P10。 |
| B16 | A | 批次分段、释放后取屏屏障、图片先入库后继续；review交回模型 | [计划](../../tests/web/plan.test.mjs)、[集成](../../tests/web/runtime-integration.test.mjs)、[批次例子](../../specs/examples/batch-with-checkpoint.plan.json)。屏障失败停止依赖。 |
| B17 | A | 移动中有界并行观察；如实回实际帧／时刻／不确定度或时序不足 | [计划](../../tests/web/plan.test.mjs)、[例子](../../specs/examples/observe-during-motion.plan.json)。不保证请求采样频率；惯性待P09。 |
| B18 | A | 接收／提交／观察分层；intent journal、未知回执恢复、重复ID、终止tombstone | [计划](../../tests/web/plan.test.mjs)、[设备](../../tests/web/device.test.mjs)、[core](../../tests/web/core.test.mjs)、[R6](../research/independent-lifecycle-r6.md)。回执不等于可见成功。 |
| B19 | A | 取消、断连、TTL／租约／调度超时／notify失败尝试目标释放；释放失败仍未知 | [计划](../../tests/web/plan.test.mjs)、[运行时](../../tests/web/device-runtime.test.mjs)、[R6](../research/independent-lifecycle-r6.md)。真实防卡键／指针待P11。 |
| B20 | L / A | 如实宣告单TLS槽位和heap；RTT感知有界元数据缓存保留fence | [真实TLS](../research/device-tls-verification.json)、[模拟RTT报告](../research/device-rtt-budget-verification.json)、[测试](../../tests/web/device-rtt.test.mjs)。假时钟1–1.3秒请求不代表真实手势耗时。 |
| B21 | D / P | 唯一.local重连、访客网络隔离诊断、BLE/Wi-Fi共存、一板多目标 | [固件边界](../../firmware/IPhoneAutomationHarness/README.md)。未保证双手机同时吞吐或无限后台。 |

## 网站、八语言、GitHub与开源内容

| ID | 状态 | 功能／预期行为 | 证据与边界 |
|---|---|---|---|
| W01 | A / N / L | 手机`/` Harness，桌面转`/main`；`/main` `/skills` `/flash`；旧链接归一、前进后退不重建run | [路由](../../tests/web/routing.test.mjs)、[原生UI](../research/harness-ui-verification.md)、[线上HTTPS](../research/deployment-verification.json)。 |
| W02 | A / L | 仅指定文档路径回退；缺模块真404；`/api/skills`为JSON | [路由](../../tests/web/routing.test.mjs)、[线上](../research/deployment-verification.json)。最终部署待R06。 |
| W03 | A / N | iOS/iPadOS27+ Safari/PWA及能力预检、iPad桌面UA；低版本门禁不可Esc/Tab/背景关闭 | [兼容](../../tests/web/compatibility.test.mjs)、[兼容路由](../../tests/web/compatibility-routing.test.mjs)、[原生R3](../research/independent-web-r3.md)。桌面UA不等于旧iPhone真机。 |
| W04 | A / N | ES5启动回退，现代模块无法解析／加载仍有公共内容 | [bootstrap](../../tests/web/bootstrap.test.mjs)、[旧版架构](../architecture/legacy-bootstrap.md)、[原生R3](../research/independent-web-r3.md)。 |
| W05 | A / N | 英／简中／繁中／日／俄／德／法／西；系统优先、手动／刷新保留 | [i18n](../../tests/web/i18n.test.mjs)、[动态](../../tests/web/i18n-dynamic.test.mjs)、[新R6](../research/independent-web-r6.md)。原生选定语言流程加八语模块合同，不宣称所有页面八语均做真机视觉检查。 |
| W06 | A / N | 动态错误／帮助／空态随语言更新；用户标题／消息／模型ID／Skill正文保留 | [组合状态](../../tests/web/localized-status.test.mjs)、[R9/R10](../research/independent-device-identity-r10.md)、[真实DOM四十项语言断言](../research/desktop-panel-localization-verification.json)、[原生R6](../research/independent-web-r6.md)。 |
| W07 | D / N | 手机safe-area／视口／输入栏、桌面主页社区烧录、名称／图标／manifest／无远端字体 | [UI截图](../research/harness-ui-verification.md)、[Web UI](../architecture/web-ui.md)。真实键盘／旋转／触控待P01/P10。 |
| W08 | D | 八份互链README、运行构建说明、架构研究链接、硬件及真实边界 | [英文](../../README.md)、[简中](../readme/zh-Hans.md)、[繁中](../readme/zh-Hant.md)、[日](../readme/ja.md)、[俄](../readme/ru.md)、[德](../readme/de.md)、[法](../readme/fr.md)、[西](../readme/es.md)。最终提交／CI见R06。 |
| W09 | D / L | GitHub仓库身份、private、英语description、igent.cc主页已核对 | [仓库](https://github.com/cccat6/iphone-agent-harness)、[多语言约定](../architecture/localization.md)。GitHub description单字段不自动切语；八份README提供其他语言，最终源码同步／CI见R06。 |
| W10 | D | 原创MIT、上游license／notice保留、依赖版本及重建／重链说明 | [LICENSE](../../LICENSE)、[声明](../../THIRD_PARTY_NOTICES.md)、[固件许可证](../../apps/web/firmware/licenses/)、[vendor说明](../../apps/web/vendor/README.md)。 |
| W11 | A / L / F | 静态产物排除本地密钥／参考仓库；仅验收用社区数据已清理 | [线上报告](../research/deployment-verification.json)、[构建器](../../tools/build_web.mjs)、[产物测试](../../tools/build_firmware_test.py)。最终敏感信息扫描／hash见R07/R05。 |

## 暂缓的手机验收——用户只需配合手机

**维护者先关闭R01–R07，提供最终C3镜像与网站，再开始。** 使用无隐私的测试App／文档和短小可逆任务。记录机型／系统／Safari、板端boot／镜像版本、网络类型；只保存结果、公开ID和帧引用，不记录凭据／验证数字。未勾选表示待测，不代表已知失败。团队负责准备板卡、网站、模型、可选MCP夹具及电脑诊断；用户无需构建、查日志、运行脚本或修服务器。

- [ ] **P01 入口与语言。** iOS/iPadOS27+ Safari打开最终HTTPS站，进入会话／对话／设置／设备／Skills；选语言刷新，检查safe-area、软键盘、滚动及返回，语言保留且用户文字不改。
- [ ] **P02 首次设置。** 必要时连接已准备的板卡受保护AP，填写本地Wi-Fi／origin／当前时间，完成后回正常Wi-Fi；安装板卡CA并明确开启完全信任，对照独立指纹。唯一HTTPS域名无需跳过警告即可打开。USB烧录／配置由团队处理。
- [ ] **P03 信任与重启。** 填设备origin／指纹、所有者配对，核对真实状态；仅填地址不能启用控制。刷新重连／板卡重启后只保留适当配置，旧run证明清除，并能重新验证。
- [ ] **P04 确认是这台手机。** 系统蓝牙配对 **iPhone Agent**，开启辅助触控、关闭全键盘控制；先聚焦专用验证框再开始。真实HID输入8位数字并确认这台目标；不以粘贴／手填代替。恢复token／HTTP配对不能跳过本页新证明。
- [ ] **P05 共享与观察。** 主动共享屏幕，切到无隐私的另一App，通过Harness获得新帧；核对实际屏幕／目标／方向、时效和原尺寸／缩放尺寸。仅显示共享状态不算通过；拒绝／停止后应明确且可恢复。
- [ ] **P06 真实模型与本地数据。** 用已准备账号取模型、Chat真实回复，切账号／模型；视觉模型观察截图。建两会话／草稿，改名／置顶／搜索／归档恢复，刷新确认已发消息；导出再导入临时会话，核对图片／历史。可选删除需确认。测试内存凭据刷新失效及可选加密解锁，不向任何人透露口令。
- [ ] **P07 模式与任务循环。** Chat不发手机动作，Plan观察／解释不修改，Task持有本run租约；短多步骤任务有可见终点和一次缺信息提问。核对预算／进度／受阻／完成，最终证据与实际屏幕一致。
- [ ] **P08 基础输入。** 安全App中核对点按位置、Consumer Home、支持的键／修饰键／松开和短文字；每项看手机结果。不支持Unicode／键位时如实说明，不承诺原生多点或Apple Fn。
- [ ] **P09 手势与时序。** 对照同路径终点保持drag与移动中松开的swipe，看释放后的真实位移／惯性；试短拖放和完整down/move/up。移动中观察须回实际帧数／时刻，必要时证据不足；不能用`hid_submitted`代替时序成功。
- [ ] **P10 批次与坐标。** 点按→释放取屏→滑动→取屏；review检查点先交模型再决策。确认图片先于依赖动作。两计划间旋转，旧坐标应被拒绝／重观；检查safe-area附近和跨App返回后的全屏映射。
- [ ] **P11 停止与恢复。** 流式中／短安全手势中取消，停共享，短暂后台；团队指导下断开恢复BLE或Wi-Fi。观察无卡键／指针、无后续依赖输入，未知／释放状态真实，显式重新证明／观察后恢复；重启废弃旧boot／lease。团队测时，短流程通过不代表无限后台。
- [ ] **P12 Skill／身份／备份。** 查看全部10个内置，开关一项后刷新，在P07–P10加载相应指导。创作／改／导出无隐私自有Skill，加密身份备份并明确恢复，确认creator ID；下载／内置保持只读。上下文／图片设置持久；长临时对话压缩保留目标和最近证据，不把摘要当新观察。
- [ ] **P13 社区。** 浏览／下载准备好的签名包并本地使用。若希望公开发布，明确点击发布无隐私自有包，核对revision和只读下载；团队仅清理验收临时数据。会话／密钥不上传。仅本地使用无需发布。
- [ ] **P14 可选MCP。** 用团队准备的可从浏览器CORS访问的HTTPS服务器，连接、选一个只读工具、启用；Task调用一次，Chat/Plan不调用；撤权后拒绝。模拟中断外部变更由团队核对；Node版Cloudflare结果不是Safari通过。
- [ ] **P15 可选Codex订阅。** 仅用户愿意授权时走显式官方登录，取消一次后再登录；真实目录、一次短Responses推理、刷新／重新打开解锁。记录真实CORS／授权错误；无需透露token或本机Codex文件。注册loopback SIWC另属运行时路径。
- [ ] **P16 可选第二手机／iPad。** 各自配对／证明，运行可辨认安全任务；切目标、writer争用、断连重连一台，在团队监测下测handle复用。确认零串控、独立租约／结果、串行TLS可用；有iPad再测桌面UA／方向。一台通过不代表双目标隔离或吞吐通过。

## 完成记录

维护者填写：最终commit／CI链接／线上资源核验／四芯片source及application hash／C3已刷hash／独立R5 UI与R6-F1关闭／最终敏感信息扫描：**待最终发布核验**。

手机记录：P01–P13、可选P14–P16、真实画面／可见结果、失败与重测ID：**等待用户有空配合手机，暂缓执行**。不能从电脑清单推定手机通过。
