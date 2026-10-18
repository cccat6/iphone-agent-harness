# ESP32 + 快捷指令剪贴板方案

状态：架构候选，未实现板端文本接口、未安装手机快捷指令，未宣称后台链路通过。

## 已确认的能力

Apple 的快捷指令包含“获取 URL 内容”和“拷贝到剪贴板”。前者支持 GET 和 POST（包括 JSON 请求体），后者支持仅本地和过期时间。因此，可由快捷指令从设备取文字并写入系统剪贴板，不要求 Safari 自己在后台调用剪贴板 API。

- [Apple：发起 API 请求](https://support.apple.com/guide/shortcuts/request-your-first-api-apd58d46713f/ios)
- [Apple：拷贝到剪贴板及其选项](https://support.apple.com/guide/shortcuts/about-actions-in-complicated-shortcuts-apd081d9d61f/ios)
- [Apple：用 URL scheme 运行已安装的快捷指令](https://support.apple.com/guide/shortcuts/apd624386f42/ios)
- [Apple：外接键盘与全键盘控制](https://support.apple.com/guide/iphone/control-iphone-with-an-external-keyboard-ipha4375873f/ios)

## 拟采用的顺序

1. Harness 通过已有局域网连接把文本提交给 ESP32。
2. ESP32 暂存有长度及有效期上限的任务，绑定本次请求和对应手机。
3. 启动手机快捷指令。优先验证“为该快捷指令设置专用组合键，由 ESP32 的 HID 键盘触发”。
4. 快捷指令从 ESP32 获取文本，执行拷贝到剪贴板。
5. **复制动作完成之后**，快捷指令才向 ESP32 回传同一请求的完成标识。
6. Harness 收到确认后重新观察屏幕、确认目标 App 和输入框，再发 Cmd+V，最后检查实际文本。

收到 GET 不代表已经复制，收到复制确认不代表已经粘贴。失败、超时、换手机或过期请求均不能触发粘贴旧内容。暂存仅使用有界 RAM，不把剪贴板文字写入 flash 或云端；读取任务与确认接口需要对应手机的凭据，避免多个手机互取文字。

## 先做的真机验证

- Shortcuts 对本设备局域网 HTTP 的 GET/POST 是否成功，首次是否出现本地网络授权。
- 当前 iOS 的全键盘控制命令列表是否能给自制快捷指令指定组合键；Apple 文档只明确保证可自定义命令，未在该文档明确列出这一子功能。
- 外部 HID 组合键是否运行快捷指令，是否切换 App、改变输入焦点或中断屏幕共享。
- 复制后回执能否到达，目标 App 是否弹出粘贴许可，最终内容是否正确。

URL scheme 是已知可用的手动/前台启动方式，但不证明后台 Safari 能无交互启动它。HTTP 数据到达 ESP32 本身也不会唤醒手机上的快捷指令。不会用频繁蓝牙断连重连冒充可靠的命令触发器，也不会把循环等待脚本当成系统保证的常驻后台服务。

如果 HID 热键触发在真机上成立，它可以作为可选的“一次配置，后续由桥触发”路径；不把全键盘控制重新变成普通鼠标操作的强制要求。
