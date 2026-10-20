# 手动发布与固件复用

[English](manual-release.md)

在 [Manual release](https://github.com/cccat6/iphone-agent-harness/actions/workflows/checks.yml) 中选择 `main`，点击 **Run workflow** 运行。工作流仅使用手动 `workflow_dispatch` 触发器。每次使用启动时选定的提交，生产发布串行执行。

## 发布流程

1. 安装锁定依赖，运行网页、协议、固件和构建工具检查。
2. 根据 Arduino 源码、编译脚本、固定依赖和开发板配置计算固件输入指纹。
3. 复用匹配的已发布固件或仓库内固件。输入变化时，编译全部七个版本：C2 的 26 MHz 和 40 MHz 版本，以及 C3、C5、C6、S3 和经典 ESP32。C2 使用 2 MB 分区，其他版本使用 4 MB 分区。
4. 校验源码来源、依赖、烧录地址、分区范围、大小及 SHA-256。
5. 构建网站，包含所选固件和烧录清单。
6. 发布 `firmware-<完整输入SHA256>`。每个 Release 包含 28 个二进制分区文件、烧录清单、编译报告、输入记录、完整归档和 `SHA256SUMS`。草稿上传可续传，已发布且匹配的版本直接复用。发布文件校验通过后，将该版本设为 GitHub Latest。
7. 更新社区数据库结构，先使用 `wrangler.relay.production.jsonc` 部署区域转发 Worker，再将网站 Worker 部署到 `igent.cc`。网站通过 `OPENAI_RELAY` 服务绑定调用转发 Worker，转发 Worker 不开放公共路由，也不绑定存储。
8. 读取线上文件，与构建文件逐一比较哈希，将校验报告保存为 Actions 产物。

只修改网页时，重新构建网站并复用现有固件。网站部署失败后再次运行，也会复用已经发布且匹配的固件。

## 部署凭据

在 [GitHub Actions Secrets](https://github.com/cccat6/iphone-agent-harness/settings/secrets/actions) 设置 `CLOUDFLARE_API_TOKEN`。令牌使用当前账号和 `igent.cc` 区域，具有 Workers Scripts 编辑、Workers Routes 编辑、Zone 读取及 D1 编辑权限。网站、服务绑定、数据库和公共公钥缓存配置见 [wrangler.jsonc](../../wrangler.jsonc)；区域转发配置见 [wrangler.relay.production.jsonc](../../wrangler.relay.production.jsonc)，默认执行区域为 `aws:us-east-1`。

## 维护命令

```sh
python3 tools/firmware_release.py plan --offline
python3 tools/firmware_release.py verify
python3 tools/firmware_release_test.py
npm run build
npx wrangler deploy --config wrangler.relay.production.jsonc --dry-run
npx wrangler deploy --dry-run
```

`plan` 可使用 `GH_TOKEN` 和 `GITHUB_REPOSITORY` 查询 Release；`--offline` 使用本地产物。完成全部声明版本的编译后，运行 `seal` 校验并记录构建输入。

固件版本统一读取 `src/FirmwareVersion.h`。每次构建将源码 SHA-256 的前 16 位写入固件作为构建编号，清单和编译报告记录相同的版本与编号。

编译先写入临时目录，所有选定版本通过校验后，再整体替换固件。编译或校验失败时保留上一套产物。单独编译某个型号时使用独立目录，例如 `python3 tools/build_firmware.py --profiles esp32c3 --output build/c3-firmware`；网站目录始终接收完整版本集合。

[网站部署](deployment.md) · [Arduino 说明](../../firmware/IPhoneAutomationHarness/README.md)
