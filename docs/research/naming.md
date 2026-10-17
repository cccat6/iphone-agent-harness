# 项目命名候选

检查日期：2026-10-18。结论是公开名称检索，不是名称占用保证，也没有创建仓库或替用户正式确定名称。

推荐：**iPhone Web Harness**，仓库名 `iphone-web-harness`。

含义：iPhone 表示主要使用对象，Web 表示 Harness 在浏览器里运行，Harness 表示模型、会话、Skill 和动作执行的完整循环。iPad 兼容性放在项目简介中。

副标题建议：**A browser-based AI harness for iPhone and iPad, with ESP32 input.**

ESP32 的地位是无线 HID 输入桥／硬件执行端。它接收操作并向手机发送输入；会话、取屏和模型交互位于网页，不在 ESP32 上。主名不必包含硬件型号；文档和目录称 `ESP32 Bridge`、`ESP32 firmware` 即可。

## 公开 GitHub 检索

使用 GitHub 仓库名称搜索，并对推荐名检查了无连字符形式。GitHub 搜索可能按多个词匹配，下面区分明显同名和近名。

| 候选 | 查询 | 当前观察 |
|---|---|---|
| iPhone Web Harness | `iphone-web-harness in:name`、`iphonewebharness in:name` | 两次均未返回仓库；未发现明显同名 |
| iOS Web Harness | `ios-web-harness in:name`、`ioswebharness in:name` | 无完全同名；前一查询返回 `grounded-ios-to-web-harness`，用途为 iOS 到网页迁移 |
| iPhone Web Agent | `iphone-web-agent in:name` | 返回近名 `iPhone-Agent-Web`，容易混淆 |
| iOS Web Agent | `ios-web-agent in:name` | 有 `ROOOMTECH-ios-web-agent` 等近名，而且 Web Agent 容易理解成操作网页的 Agent |
| iPhone Harness | `iphone-harness in:name` | 多个完全同名仓库，包含参考项目 |
| iOS Harness | `ios-harness in:name` | 多个完全同名仓库 |
| iPhone Web Control | `iphone-web-control in:name` | 未返回仓库，但名字更像普通遥控界面，不能突出 Harness |

参考的已有仓库：

- [inkbox-ai/iphone-harness](https://github.com/inkbox-ai/iphone-harness)
- [sun409377708/iPhone-Agent-Web](https://github.com/sun409377708/iPhone-Agent-Web)
- [tiezhu0415/grounded-ios-to-web-harness](https://github.com/tiezhu0415/grounded-ios-to-web-harness)
- [bghcore/ios-harness](https://github.com/bghcore/ios-harness)

备用名称：**iOS Web Harness**，仓库 `ios-web-harness`，适合希望主名直接覆盖 iPhone 和 iPad 的选择。第一推荐仍为 iPhone Web Harness。
