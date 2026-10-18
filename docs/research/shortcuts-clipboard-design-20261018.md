# ESP32 + 快捷指令剪贴板方案

更新于 2026-10-19：已实现有界 RAM 信箱、Web 暂存与回执轮询、前台运行按钮、复制确认接入，以及 Apple CLI 签名的通用快捷指令和八语言教程。手机尚未导入或验收；HID 热键后台启动仍为候选，未宣称通过。

下载入口：`/shortcuts/clipboard.html`；文件名与导入名称为 `iPhone Agent Clipboard`。可检查的动作源在 `tools/shortcuts/iphone-agent-clipboard.plist`，生成器为 `tools/build_clipboard_shortcut.py`。签名只包含通用动作，不包含用户文字、设备 token 或账号凭据。

2026-10-19 的 Mac 仅 HTTP 烟测已导入一次性测试快捷指令，但运行器一直等待，fixture 没收到它的请求，未计为通过。测试进程、临时快捷指令和 fixture 已清理，未执行剪贴板动作。正式的复制与回执流程仍需 iPhone 验收。

同日用户报告已允许授权后，重新导入同一份已签名 HTTP-only 测试快捷指令并重试：Shortcuts CLI 返回 0，本地 HTTP fixture 确实收到一次 GET，输出 JSON 与测试标识完全一致。本轮没有 curl 请求混入，未执行剪贴板动作；临时快捷指令和 fixture 再次清理。该结果只证明 Mac 原生 Shortcuts 可访问局域网 HTTP，不代表 iPhone 复制、ACK 或后台触发已经验收。记录在 ignored `build/clipboard-shortcut/http-smoke-retry-verification.json`。

## 已确认的能力

Apple 的快捷指令包含“获取 URL 内容”和“拷贝到剪贴板”。前者支持 GET 和 POST（包括 JSON 请求体），后者支持仅本地和过期时间。因此，可由快捷指令从设备取文字并写入系统剪贴板，不要求 Safari 自己在后台调用剪贴板 API。

- [Apple：发起 API 请求](https://support.apple.com/guide/shortcuts/request-your-first-api-apd58d46713f/ios)
- [Apple：拷贝到剪贴板及其选项](https://support.apple.com/guide/shortcuts/about-actions-in-complicated-shortcuts-apd081d9d61f/ios)
- [Apple：用 URL scheme 运行已安装的快捷指令](https://support.apple.com/guide/shortcuts/apd624386f42/ios)
- [Apple：外接键盘与全键盘控制](https://support.apple.com/guide/iphone/control-iphone-with-an-external-keyboard-ipha4375873f/ios)

## 已实现的手动启动顺序

1. Harness 通过已有局域网连接把文本提交给 ESP32。
2. ESP32 暂存有长度及有效期上限的任务，绑定本次请求和对应手机。
3. 用户在 Harness 点“用快捷指令复制”，通过前台 URL scheme 启动已安装的快捷指令。它的输入只有短期 job URL 和身份，不带正文或全局认证 token。无输入启动时，从 `http://igent.local/v1/clipboard/pending` 获取当前任务，板端要求来源与暂存该任务的 RTC 手机一致。
4. 快捷指令从 ESP32 获取文本，执行拷贝到剪贴板。
5. **复制动作完成之后**，快捷指令才向 ESP32 回传同一请求的完成标识。
6. Harness 收到确认后重新观察屏幕、确认目标 App 和输入框，再发 Cmd+V，最后检查实际文本。

收到 GET 不代表已经复制，收到复制确认不代表已经粘贴。失败、超时、换手机或过期请求均不能触发粘贴旧内容。暂存仅使用有界 RAM，不把剪贴板文字写入 flash 或云端；读取任务与确认接口需要对应手机的凭据，避免多个手机互取文字。

当前采用流式传输：全文保留在浏览器，ESP32 每次只缓存一个最多 1024 字节、UTF-8 字符完整的块。快捷指令通过单个 HTTP GET 读取完整 JSON；浏览器按板端已写出偏移上传下一块，完成复制后才发送 ACK。取消专用 8 KB 和 20,000 字符上限，仍受会话、浏览器、快捷指令和目标 App 的实际资源约束。默认空闲有效期两分钟、上限五分钟，有效传输进展刷新空闲期限，轮询本身不续期。ACK 匹配短期 token、request/session/target；取消、过期或替换后旧 ACK 失效。Web 重试使用新板端 job ID，避免迟到的旧取消请求取消新任务。原有前台“直接复制”保留。

## 先做的真机验证

- Shortcuts 对本设备局域网 HTTP 的 GET/POST 是否成功，首次是否出现本地网络授权。
- 当前 iOS 的全键盘控制命令列表是否能给自制快捷指令指定组合键；Apple 文档只明确保证可自定义命令，未在该文档明确列出这一子功能。
- 外部 HID 组合键是否运行快捷指令，是否切换 App、改变输入焦点或中断屏幕共享。
- 复制后回执能否到达，目标 App 是否弹出粘贴许可，最终内容是否正确。

URL scheme 是已知可用的手动/前台启动方式，但不证明后台 Safari 能无交互启动它。HTTP 数据到达 ESP32 本身也不会唤醒手机上的快捷指令。不会用频繁蓝牙断连重连冒充可靠的命令触发器，也不会把循环等待脚本当成系统保证的常驻后台服务。

如果 HID 热键触发在真机上成立，它可以作为可选的“一次配置，后续由桥触发”路径；不把全键盘控制重新变成普通鼠标操作的强制要求。
