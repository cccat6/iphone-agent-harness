# iPhone Agent Harness

[English](../../README.md) · **简体中文** · [繁體中文](zh-Hant.md) · [日本語](ja.md) · [Русский](ru.md) · [Deutsch](de.md) · [Français](fr.md) · [Español](es.md)

通过浏览器和 ESP32 蓝牙控制器，让 AI 跨 App 操作 iPhone 与 iPad 的开源 Harness。

面向 **iOS/iPadOS 27 及以上的 Safari**。iPhone 和 iPad 默认进入 Harness；电脑端提供项目主页、技能社区和 ESP32 在线烧录。

使用说明：[简体中文](../acceptance/zh-Hans.md) · [English](../acceptance/README.md)。介绍主要界面和日常操作。

官网为 [igent.cc](https://igent.cc)。Harness 通过 **WebRTC Direct** 在同一个页面连接局域网内的 ESP32 桥，无需保留额外标签页、输入连接码或安装证书。首次从 USB 设置链接或设备设置页导入连接信息，之后直接在 Harness 连接即可。正式 RTC 与蓝牙组合固件正在进行实机验收，详见[连接说明与记录](../architecture/lan-connection.md)。

## 功能

- **会话：**对话和图片保存在本地，支持搜索、重命名、置顶、归档及文件导入导出；在同一条会话中讨论、规划和执行；请求计划不会直接开始操作。首条请求会自动生成会话名称，手动命名和导入的名称保持不变。
- **账号或 API：**添加多个连接，兼容 OpenAI 和 Anthropic 风格的 API 端点，获取并切换模型。ChatGPT 订阅接入及登录界面已实现，真实 Safari 订阅登录仍待验证。支持的模型提供推理强度选择，按账号和模型分别保存。
- **上下文：**由模型自动总结较早的消息，默认触发阈值为 **750,000 token**，可在设置中调整；完整会话保留在设备上。
- **图片：**保留原始尺寸，使用 JPEG 压缩，提供节省空间、均衡、高清三个档位。
- **技能：**包含十个内置技能，支持创作、编辑、下载和社区发布。官网社区地址已内置，也可以通过对话让 Harness 协助编写或修改自己的技能。
- **MCP：**添加多个 Streamable HTTP 服务器，分别选择工具，在执行过程中调用已授权工具。

会话保存在当前浏览器，选中的消息和图片会发送给你选择的模型服务。API 密钥和登录信息直接保存在当前浏览器，独立于会话及其导出文件，无需解锁密码；清除网站数据也会删除这些凭据。

API 端点可填写 `https://api.example.com/v1` 这样的基础端点，也可填写完整的 `/chat/completions` 地址；Anthropic 风格还支持 `/v1/messages`。编辑界面会提示应填写的前缀。获取模型列表后，在同一个输入框中选择或填写默认模型；获取到的所有模型都可在会话内切换。

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
