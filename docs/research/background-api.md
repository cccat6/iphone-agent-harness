# Safari 后台模型传输验证

日期：2026-10-18。独立研究探针位于 `research/background-api/`。本探针不发送 HID，不改旧手机实验，不上传屏幕或模型回复内容；不记录密钥。用户后来明确授权的一次性手机配置分发单独说明，测试后已移除。

## 结果边界

| 范围 | 当前状态 |
|---|---|
| Mac Node.js 协议验证 | 46 项通过：UTF-8 任意分片、SSE 记录边界、结束标记、NDJSON、延迟 JSON、故意中断 |
| 临时公网传输 | Mac Node 经 Quick Tunnel 三类响应均 HTTP 200；约两秒分片实际到达，见 `public-preflight.json`；不构成正式 SSE 支持保证 |
| Mac Safari 页面 | 尚未作为本轮实测结果记录 |
| iPhone 12 / iOS 27.0.1 后台 | 本轮基础套件通过，真实 hidden 回调与服务器事件对应，详见下文 |
| 真实 LLM API | 用户提供 DeepSeek Key；Mac 与 iPhone 实际后台双协议普通／流式四请求均 HTTP 200 |

此前独立实验已验证后台取屏和一次 10 秒 HTTPS 等待；那不等于本轮长响应、流式、五轮测试已通过。

## 本轮 iPhone 基础实测（2026-10-18）

用户在手机 Safari 开启屏幕共享，点击基础测试后切到其他 App、保持解锁，随后回到页面停止。设备沿用已确认的 iPhone 12 / iOS 27.0.1。run 为 `9f6f297a-4bd9-47d8-8f8b-0aff213281fc`。脱敏统计保存在 `research/background-api/phone-basic-results.json`。

**这次不是返回前台后才统一完成。** 页面 hidden 共 199.794 秒，套件耗时 154.806 秒，在 hidden 状态结束，距用户返回前台仍约 46.9 秒。后三个请求均从 hidden 状态发起，服务端请求与数据块日志对应。

| 请求 | 实际耗时 | 后台完成 | 实际网络读取 |
|---|---:|---|---|
| 普通 JSON：服务端等待 30 秒 | 30.445 秒 | 是 | 完整 JSON 解析通过 |
| OpenAI 格式 SSE：每 5 秒一段 | 30.662 秒 | 是 | 8 次 read，均 hidden；约 0.419/5.469/10.467/15.810/20.434/25.436/30.657 秒到达 |
| Anthropic 格式 SSE：每 5 秒一段 | 30.668 秒 | 是 | 8 次 read，均 hidden；约 0.835/5.753/11.127/16.867/20.701/25.728/30.665 秒到达 |
| SSE 建连后空闲 60 秒 | 63.023 秒 | 是 | 5 次 read；开流约 0.767 秒，后续数据约 61.056 秒才到达，继续在 hidden 读取并结束 |

合计 21 次 `reader.read()` 完成回调均在 hidden；65 次 hidden 取帧成功、66 次媒体事件；相邻帧完成间隔中位数 3066ms，范围 3045–3075ms。结束标记与 JSON 均解析成功，无 request-failed。

这建立了在该手机、当前系统与网络、屏幕共享开启且解锁时，后台 JavaScript 可连续推进普通等待、两个协议格式流式读取、约 60 秒流中空闲以及下一请求。**它不证明无限后台、锁屏、内存压力或所有真实模型接口都可靠。** 两种协议为本次模拟后端，不能写成已经调用 OpenAI 或 Anthropic。Quick Tunnel 的官方 SSE 限制仍成立；这里只记录这一次真实逐块交付观察。

## 实施内容

- `server.py`：仅监听 `127.0.0.1:18728`，随机 token 路径；严格静态文件白名单；不提供目录浏览、凭据读取或通用代理。
- `index.html` / `probe.js`：用户主动 `getDisplayMedia`，不强加分辨率，三秒 `ImageCapture.grabFrame()` 尝试与 MediaRecorder 分块；帧立刻关闭，媒体 Blob 丢弃，不上传、不持久保存。
- 探针以 `performance.now()` 记录单调时间，以 `Date.now()` 辅助服务器关联；记录 visibility、媒体事件、实际网络 `reader.read()` 回调、帧完成、HTTP 状态、字节和记录计数。
- `protocol.mjs`：增量 TextDecoder，处理跨 UTF-8 字符和跨 SSE 分隔符分片；完整 EOF 仍要求 `[DONE]`、Anthropic `message_stop` 或对应结束标记，故意断流不能显示为成功。
- `verify.mjs`：本机启动隔离端口 `18729`，验证后结束自己的进程。`verification.json` 标注运行环境。
- `services.py`：启动、停止本探针服务器与临时 Tunnel；PID、完整参数、匹配标识写入忽略文件，停止前检查进程身份。

## 测试矩阵

1. 基础套件：30 秒普通回复、约 30 秒 OpenAI SSE、约 30 秒 Anthropic SSE、SSE 开始后空闲 60 秒。
2. 等待套件：10 / 30 / 60 / 120 秒无响应头普通回复。
3. 五轮套件：每轮等待 10 秒后读取流，OpenAI / Anthropic 格式交替，上一轮完整结束后发下一轮。
4. 边缘套件：UTF-8 和事件任意碎片、NDJSON、30 秒流中空闲、故意缺失结束标记的断流。
5. 真实接口：两类协议，普通与流式，各自运行；只有用户填写本次专用配置后执行。

每个请求单独记录开始、headers、每次 read、结束；不能只凭“最后回到网页显示完成”判定后台成功。接受条件是 hidden 状态下实际发生读取和后续请求，服务器时间和 run/test ID 一致。后台没有新回调、返回前台才集中交付，应记为延后处理，不能记成实时后台。

录屏持续回调、取帧事件和网络读分别计数。网络等待与三秒取帧计时无必然绑定，不用假定系统提供固定执行窗口。首次暂不锁屏，锁屏停止、系统中断和热／低电量应另建验收场景。

## 临时 HTTPS 与 SSE 限制

使用 Cloudflare Quick Tunnel 仅作为开发探针入口。官方明确指出 **Quick Tunnels 不支持 Server-Sent Events**。即便某次试验收到流式分片，也只能记录当次观察，不能把该入口作为可靠 SSE 环境。SSE 失败可能属于 Tunnel；120 秒等待也可能受反向代理超时影响，不能直接归因为 Safari。

参考：[Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)。

正式 SSE 结论应使用支持 SSE 的命名 Tunnel、其他已验证 HTTPS 服务，或浏览器直接请求用户提供的真实 LLM API。公网预检先以 Mac 客户端记录各块实际到达时间，再交给手机执行；直接 API 的 CORS 与 Safari 后台是两个独立检查项。

## 凭据与真实请求

`credentials.local.json` 是忽略的本地空配置，权限 600：

```json
{"enabled": false, "protocol": "openai", "endpoint": "", "model": "", "key": "", "stream": true}
```

`endpoint` 是完整 `/chat/completions` 或 `/messages` HTTPS URL，不是基础域名。此文件不由公网服务器提供。用户也可在手机页面手动填写测试 Key，值只保存在当前页面内存中；页面直接请求所选 endpoint，不经过探针服务器。

真实接口发送固定的文本传输测试句，不发送屏幕。OpenAI 使用 Bearer，Anthropic 使用 x-api-key、anthropic-version 以及直连浏览器标记；服务端是否允许 CORS 应以实际结果为准。状态／错误元数据不会包含 Key、endpoint、请求或回复正文。

## 用户操作

拿到父任务给出的临时 URL 后：

1. 在 iPhone Safari 打开，先点“开始屏幕共享”，同意系统提示。
2. 点“后台基础测试”，立即切到时钟等其他 App，保持解锁约三分钟。
3. 返回网页，先看“测试结束”或错误状态，再点停止。
4. 元数据可本地导出；父任务从服务端核对 hidden 时间与分块日志。屏幕内容不发送。

模拟套件不调用收费模型；真实 API 按钮会使用用户主动填写的测试 Key 发起小额请求。用户此前暂缓的旧五轮测试没有被自动执行；本轮新的五轮按钮仍须用户主动点击。

## DeepSeek 真实 API：Mac 协议检查

父任务使用用户授权的本地 Key 查询 `GET https://api.deepseek.com/models`，实际返回 `deepseek-flash`、`deepseek-v4-pro`。官方更新说明确认 `deepseek-flash` 对应 V4.1 Flash。根据用户授权选择 Flash，并配置双协议测试。

来源：[DeepSeek V4.1 更新](https://api-docs.deepseek.com/zh-cn/news/news260910/)、[Anthropic 兼容接口](https://api-docs.deepseek.com/zh-cn/guides/anthropic_api)。发现记录见 `provider-discovery.json`。

`verify-real.mjs` 直接从 Mac Node 请求 DeepSeek，每个协议普通与流式各一次；只发送固定文本测试句，最多 160 token，不上传图像。结果在 `real-api-results.json`。

| 协议／响应 | 完整 endpoint | 状态 | 耗时 | 流首块／实际读取 |
|---|---|---:|---:|---|
| OpenAI 普通 | `https://api.deepseek.com/chat/completions` | 200 | 912ms | 完整 JSON |
| OpenAI SSE | 同上 | 200 | 655ms | 133ms／22 次 read、63 条记录 |
| Anthropic 普通 | `https://api.deepseek.com/anthropic/v1/messages` | 200 | 688ms | 完整 JSON |
| Anthropic SSE | 同上 | 200 | 807ms | 175ms／19 次 read、72 条记录 |

两个 endpoint 的 OPTIONS 均 200，允许本次页面 origin、POST，以及各自必要的请求头。**这只是 Mac 真实接口与 CORS 头检查，尚非手机浏览器成功证明。** 流式结束标记均识别成功；未记录请求／回复正文与密钥。

手机页面升级为版本 2。用户刷新后先开屏幕共享，展开真实 API 只填 Key，点击“后台双协议四轮（DeepSeek）”，立即切到其他 App 并保持解锁约 30 秒。页面检测 hidden 后再等五秒，自动依次发出双协议普通／流式请求。endpoint 与模型是已验证的公开常量；Key 仅在页面内存，由手机直接发给 DeepSeek，不经探针服务器。

用户随后明确授权由本机替测试手机配置 Key，不再要求手机手填。本轮版本 3 采用一次性 bootstrap：仍位于长随机 token 路径，同源 Origin 严格检查、Cache-Control no-store、有效期最多十分钟、成功读取后禁用；只有用户主动点按钮时才从 600 权限本地配置读取，Key 不写静态文件、URL、日志或 Git。该临时授权仅限本次测试，结束后关闭并移除入口，不作为产品凭据分发架构。主界面首个按钮会在同一用户手势中开启共享，成功后等待 hidden 五秒，再自动发四个小额请求。

## iPhone 真实 DeepSeek 后台四轮（2026-10-18）

用户点击版本 3 主界面按钮，由同一用户手势开启屏幕共享，切到其他 App 后自动发出四个请求。手机直接连接 DeepSeek，模型为 `deepseek-flash`（V4.1 Flash），不通过本机或 Tunnel 代理真实模型流。run `2ebbd939-0bf6-42dd-a912-f9d73490f413`，脱敏结果见 `phone-real-results.json`。

| 请求 | HTTP | 完整耗时 | 首次读取 | 读取／协议记录 | headers／完成时页面 |
|---|---:|---:|---:|---:|---|
| OpenAI 风格普通 JSON | 200 | 1131ms | — | JSON 解析通过 | hidden／hidden |
| OpenAI 风格 SSE | 200 | 1068ms | 120ms | 27 次 read／91 条记录 | hidden／hidden |
| Anthropic 风格普通 JSON | 200 | 859ms | — | JSON 解析通过 | hidden／hidden |
| Anthropic 风格 SSE | 200 | 919ms | 101ms | 12 次 read／68 条记录 | hidden／hidden |

两条流均在 `RecordDecoder.finish()` 确认协议结束标记后才记录成功。页面连续 hidden 31.899 秒，区间为客户端单调时间 13099–44998ms；四个请求开始时间均位于该区间。前三条有直接 start 记录，最后一条 start 元数据未收到，可由 `complete.at - elapsed = 21165ms` 推算。四条 headers、四条 complete，以及收到的全部流读取记录均直接显示 hidden。取帧与媒体回调也在后台继续。

元数据上传使用并发 keepalive，产生了少量记录丢失与到达乱序：流内完成计数为 39 次 read，服务器只收到了 35 条 read 元数据；最后一次 request-start 与 real-suite-end 缺失。因此分析按客户端 `at` 排序，不把服务器接收顺序当执行顺序，也不宣称四条 start 都被服务器直接观察。已有四次完整成功记录足以确认这轮真实请求成功，无需要求用户重复操作。后续探针应批量、顺序发送元数据，或上传结束时的完整本地快照。

**确认范围**：本手机上，解锁且持续屏幕共享时，网页可在后台直接完成真实 DeepSeek 的两种协议、普通及流式文本请求。这里是 DeepSeek 的兼容接口，不能写成实际测试了 OpenAI 公司 API 或 Anthropic 公司 API。真实回复均短于 1.2 秒，长等待／60 秒空闲证据来自前面的模拟套件，不能组合成“真实模型已长时间运行”。锁屏、低电量、系统压力、多小时会话仍未验证。

## 本轮结束与清理

真实测试结束后已删除 bootstrap 启用文件、从 server 源码移除该临时入口、将本地凭据配置设为 `enabled:false`，不再向手机自动分发 Key。原始用户凭据文件保留在忽略路径且权限 600，不打印、不提交。手机页面运行结束后局部 Key 变量可被回收；无法远程证明 Safari 已擦除网络调试缓存，用户关闭临时标签页可结束该页面。

`services.py stop` 只停止本探针的匹配进程。独立检查确认服务器、Tunnel 均退出，`127.0.0.1:18728` 不再监听，见 `cleanup.json`。临时 URL 已失效。
