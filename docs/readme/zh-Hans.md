# iPhone Agent Harness

[English](../../README.md) · **简体中文** · [繁體中文](zh-Hant.md) · [日本語](ja.md) · [Русский](ru.md) · [Deutsch](de.md) · [Français](fr.md) · [Español](es.md)

通过浏览器和 ESP32 蓝牙控制器，让 AI 跨 App 操作 iPhone 与 iPad 的开源 Harness。

面向 **iOS/iPadOS 27 及以上的 Safari**。iPhone 和 iPad 默认进入 Harness；电脑端提供项目主页、技能社区和 ESP32 在线烧录。

使用说明：[简体中文](../acceptance/zh-Hans.md) · [English](../acceptance/README.md)。介绍主要界面和日常操作。

官网为 [igent.cc](https://igent.cc)。连接设备后，请切回 Harness，并保持“设备连接”标签页打开；不需要安装证书，操作指令也不经过云端转发。Safari 27.0.1 真机已通过约 21 秒的五轮 GET／POST 测试，包括录屏期间两个标签页都在后台的请求。这不代表可以无限后台运行，也不等于完整手机操作已验收。详见[连接结果](../architecture/lan-connection.md)。

## 功能

- **会话：**对话和图片保存在本地，支持搜索、重命名、置顶、归档及文件导入导出；提供对话、计划、任务三种模式。
- **账号或 API：**添加多个连接，兼容 OpenAI 和 Anthropic 风格的 API 端点，获取并切换模型。ChatGPT 订阅接入及登录界面已实现，真实 Safari 订阅登录仍待验证。
- **上下文：**由模型自动总结较早的消息，默认触发阈值为 **750,000 token**，可在设置中调整；完整会话保留在设备上。
- **图片：**保留原始尺寸，使用 JPEG 压缩，提供节省空间、均衡、高清三个档位。
- **技能：**包含十个内置技能，支持创作、编辑、下载和社区发布。官网社区地址已内置，也可以通过对话让 Harness 协助编写或修改自己的技能。
- **MCP：**添加多个 Streamable HTTP 服务器，分别选择工具，在任务模式中使用。

会话保存在当前浏览器，选中的消息和图片会发送给你选择的模型服务。API 密钥和登录信息默认临时保存在当前页面，也可选择加密保存在设备上。

## 代码与本地运行

项目分为 `apps/web/`（网页、Harness 和技能社区）与 `firmware/IPhoneAutomationHarness/`（Arduino 固件）两部分。网站也支持自行托管。

需要 Node.js 22.13 或以上：

```sh
npm ci
npm test
npm run build
npm run preview
```

电脑端可以使用 localhost 预览，手机屏幕共享需要 HTTPS。部署 `build/site` 时按[页面路由说明](../architecture/deployment.md#self-hosted-page-routing)配置。支持的开发板和编译方式见 [Arduino 说明](../../firmware/IPhoneAutomationHarness/README.md)。

**手动发布：**普通推送不触发 GitHub Actions。明确要求后才运行，复用未变化的固件，编译变更的 ESP32／C3／S3／C6 版本，将二进制发布到 Release，并随网站部署同一批文件。[发布配置](../architecture/manual-release.zh-Hans.md)。

[系统架构](../architecture/system-blueprint.md) · [操作与截图同步](../architecture/actions.md) · [账号与 MCP](../architecture/auth-and-backends.md) · [技能归属](../architecture/skill-community.md) · [多语言](../architecture/localization.md)

[MIT License](../../LICENSE) · [Third-party notices](../../THIRD_PARTY_NOTICES.md)
