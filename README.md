# iPhone Automation Harness

项目基线：2026-10-18。Web 与 Arduino 两个部分；公开 Skill 目录属于 Web。

目标是 iOS/iPadOS 27 起的静态网页 Harness：用户在手机上启动屏幕共享，网页调用用户配置的 AI 后端，并通过局域网 ESP32 的蓝牙 HID 操作手机。会话和截图默认保存在手机；ESP32 首次通过配置热点配网。暂不做 Android、多指触控或原生 App。

当前是可运行的 Web 初版和已编译的 Arduino 框架，尚不是完成真机控制接线的成品。新固件本轮未刷写；未完成的认证与网络控制入口返回503。模型测试与手机后台证据分开记录。

## 两个代码部分

- `apps/web/`：零运行时依赖的静态 ES modules 界面、会话、本地存储、两类模型协议、官方模型目录查询、Skill 本地／线上管理、可选 MCP 诊断。
- `firmware/IPhoneAutomationHarness/`：Arduino C3 sketch、多目标身份与连接句柄、排他写租约、定时 HID 段、回执与释放、mDNS 和只读诊断接口。

## 运行与验证

```sh
npm test
npm run build
python3 -m http.server 8080 --directory build/site
```

桌面可打开 localhost 预览；手机取屏必须使用 HTTPS 托管。`build/site` 是可以独立部署的静态产物，不包含测试密钥、私人会话或上游源码归档。

模型设置支持 OpenAI／Anthropic 风格接口和“获取模型”按钮。DeepSeek 两类接口共用官方 `/models` 目录，Flash API 标识由服务返回并选择，当前为 `deepseek-flash`。不会把 ChatGPT/Codex 登录当成普通 API Key；设备码适用范围仍在验证，实际登录未开放为可用状态。

## 阅读顺序

1. [完整系统图、身份映射、同步和模式](docs/architecture/system-blueprint.md)
2. [整体架构与目录分工](docs/architecture/overview.md)
2. [手机操作、连续取帧与批量执行](docs/architecture/actions.md)
3. [Harness、模型请求、后台运行与本地存储](docs/architecture/runtime.md)
4. [系统提示词、Skill 与验证码扩展](docs/architecture/skills.md)
5. [实施顺序和验收门槛](docs/architecture/validation.md)
6. [开源 Harness 源码调研](docs/research/harnesses.md)
7. [命名候选与公开仓库检索](docs/research/naming.md)
8. [本轮后台与真实API验证](docs/research/background-api.md)
9. [Arduino 已实现内容与缺口](docs/architecture/firmware-implementation.md)
10. [模型目录、OpenAI登录与MCP边界](docs/architecture/auth-and-backends.md)

## 可审阅的设计文件

- `prompts/system.md`：原创的手机操作系统提示词。
- `prompts/context-summary.md`：保留操作证据的上下文压缩指令。
- `specs/action-plan.schema.json`：网页层批量计划格式；包含截图节点，不直接发到 ESP32。
- `specs/device-segment.schema.json`：只含计时 HID 报告的 ESP32 输入段。
- `specs/action-result.schema.json`：计划结果与本地图片引用。
- `specs/skill-manifest.schema.json`：声明式 Skill 包接口。
- `specs/examples/`：多动作、中途截图、惯性滑动、移动中取帧和 Skill 的实例。
- `research/harness-reference/sources.lock.json`：10 个官方仓库的提交号及下载校验值。
- `research/harness-reference/readings.json`：33 个重点阅读位置、文件哈希、固定提交链接。

## 已冻结与待验证

已冻结：静态托管／可自托管、本地会话、用户自定义模型后端、热点配网、设备绑定后通过唯一 mDNS 名称重连、单指 HID 操作、批量动作与截图节点、可独立更新的 Skill。

核心能力固定写在代码里，不提供运行时插件注册或自动装配。线上 Skill 与网站一起托管，用户选择的 Skill 清单、来源、版本和正文缓存在本地；任务匹配时按需加入模型上下文。社区共享只发布用户主动分享的 Skill，不上传私人会话。

已增加手机后台持续取屏、延迟JSON、双协议模拟流和60秒空闲恢复的真机证据，见独立报告；真实DeepSeek接口另记证据，不能从Mac测试推断手机。

待接线／验证：公网 HTTPS 页面直连本地 ESP32 的 Safari 策略、受保护热点配网、客户端授权和一对一配对证明；真实定时段产生的惯性效果；一个 C3 同时操作两部手机。mDNS 不会自动解决 HTTPS、CORS、证书或后台执行限制。

## 设计校验

协议校验脚本依赖 `jsonschema==4.25.1`，可以安装到独立目录后执行：

```sh
python3 -m pip install --target build/spec-validator jsonschema==4.25.1
PYTHONPATH=build/spec-validator python3 tools/validate_design_specs.py
```

它验证示例及关键拒绝路径，不模拟 iOS 或声称已经运行真实手势。

源码快照与压缩包保存在 `research/harness-reference/repos/`、`archives/`，均被忽略，不随我们的项目发布。上游代码只读研究，未执行其安装脚本。下载使用 GitHub 官方归档，未接受本机 Xcode 许可。
