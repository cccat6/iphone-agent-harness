# iPhone Agent Harness

[English](../../README.md) · **简体中文** · [繁體中文](zh-Hant.md) · [日本語](ja.md) · [Русский](ru.md) · [Deutsch](de.md) · [Français](fr.md) · [Español](es.md)

通过浏览器界面和 ESP32 蓝牙键鼠桥，让 AI 跨 App 操作 iPhone 与 iPad 的开源 Harness。

项目以 **iOS/iPadOS 27 及以上的 Safari** 为目标。手机和平板默认进入 Harness；桌面访问显示项目主页、Skill 社区和 ESP32 设置／固件页面。暂不开发原生 App 或 Android 版本。

## 当前进度

Web 应用、带认证的局域网固件通信和设备接入界面已经实现。[igent.cc](https://igent.cc) 网站与签名 Skill 社区已部署。产品固件的真机验收仍在进行：编译、主机测试和浏览器模拟不能证明手机操作正确或 Safari 已能直连局域网设备。

独立的 iPhone 12／iOS 27.0.1 实验已验证跨 App 取屏、后台延迟与流式请求，以及两种协议的四次真实 DeepSeek 短请求；早期实验固件也验证过键盘、Home、指针和滑动。它们不能替代新产品固件验收，也不代表无限后台保活。详见[实验记录](../research/background-api.md)和[固件边界](../architecture/firmware-implementation.md)。

## 已包含的能力

- **本地会话：**IndexedDB 会话、附件、导入导出，以及对话／计划／任务模式和取消。选中的上下文与图像仍会发送给用户配置的模型；本项目不提供云端会话数据库。
- **模型与账号：**OpenAI／Anthropic 风格接口、真实模型目录和多账号配置。Codex 订阅设备码、刷新和 Responses 适配已实现；Safari 真实登录及旧 Codex 端点的 CORS 尚未验收，失败会明确显示。
- **上下文管理：**可设置压缩阈值、压缩目标、回复预留、图像数量，选择模型摘要或摘录摘要。token 数为估算；缓存统计来自后端，不能保证命中缓存。
- **图片压缩：**可设置最长边和 JPEG 质量，保留原始尺寸、缩放与时间信息。图片压缩与会话上下文压缩分别控制。
- **10 个内置 Skill：**屏幕观察、连续观察、任务规划、手机导航、文字输入、列表滚动、拖放、恢复、验证挑战路由和 Skill 创作。底层工具固定，不动态安装可执行插件。
- **创作与社区：**本地 P-256 作者身份、加密身份备份与跨设备恢复；只允许修改自己的 authored Skill，下载项只读。发布需要用户明确点击；可选社区 API 只保存主动公开的 Skill，已在官网部署。

凭据默认只在内存；用户可选择加密保存到本地并输入口令解锁，不会写进静态构建。订阅接入的实现与限制见[专项说明](../research/codex-subscription.md)。

## 两个代码部分

`apps/web/` 包含静态网页、Harness、本地数据和 Skill；`community/` 与可选 `api/` 都属于 Web。`firmware/IPhoneAutomationHarness/` 是 Arduino ESP32 框架。`prompts/`、`specs/`、`tests/`、`docs/` 是共享工程资料。

网站可自行托管，单机使用不依赖社区服务器。桥接器的产品流程是首次热点配网，然后绑定目标、通过唯一 mDNS 名称重连；mDNS 本身不会解决 HTTPS、权限或认证。

## 本地运行

需要 Node.js 22.13 或以上；社区测试使用内置 SQLite。

```sh
npm ci
npm test
npm run build
npm run preview
```

桌面用 localhost 预览，手机取屏需要 **HTTPS**。可把 `build/site` 部署到 Cloudflare 或配置了[页面路由](../architecture/deployment.md#self-hosted-page-routing)的自有 HTTPS 服务；产物不包含测试密钥、私人会话或下载的参考仓库。烧录工具链见[Arduino 说明](../../firmware/IPhoneAutomationHarness/README.md)。

[系统图](../architecture/system-blueprint.md) · [批量手势与取屏同步](../architecture/actions.md) · [运行时](../architecture/runtime.md) · [代码实现与上下文缓存](../architecture/harness-runtime-implementation.md) · [模型与认证](../architecture/auth-and-backends.md) · [社区归属](../architecture/skill-community.md) · [多语言](../architecture/localization.md)

接下来仍需验收 Safari 公网网页直连本地 ESP32、安全配网与目标证明、真实惯性滑动，以及一块 C3 同时服务两台手机的隔离。编译和自动测试不能替代这些真机结果。

完整验收清单：[简体中文](../acceptance/zh-Hans.md) · [English](../acceptance/README.md)。逐项覆盖全部功能与内容，列出电脑证据和暂缓的手机步骤；电脑准备及最终发布核验由项目团队完成。

Mac已通过真实C3的CA／DNS校验HTTPS和产品客户端所有者配对，未发送手机输入；最终镜像核验与Safari／手机验收仍需分别完成。见[实机客户端记录](../research/device-client-live-verification.json)。

手动发布：普通推送不触发 Actions。明确要求后才运行，复用未变化固件，编译变更的 ESP32／C3／S3／C6 固件，将二进制发布到 Release，并随网站部署同一批文件。[发布流程与凭据配置](../architecture/manual-release.zh-Hans.md)。

[MIT License](../../LICENSE) · [Third-party notices](../../THIRD_PARTY_NOTICES.md)
