# 手动发布与固件复用

[English](manual-release.md)

GitHub Actions **仅在你要求时运行**。普通推送、PR、标签和 Release 发布都不会触发。入口为 [Manual release](https://github.com/cccat6/iphone-agent-harness/actions/workflows/checks.yml)，配置见 [checks.yml](../../.github/workflows/checks.yml)。需要发布时选 `main`，点击 **Run workflow**；助手必须收到明确要求后才可触发。一次运行固定使用启动时选定的提交，中途推送不会悄悄替换已经测试的源码。生产发布串行执行。

## 一次手动运行会做什么

1. 检查部署凭据，安装锁定的 Node 依赖，运行 Web、协议、固件主机和发布工具检查。
2. 对 Arduino 的全部白名单源码、编译脚本、固定依赖、Arduino CLI 版本和四种开发板配置计算指纹。只改网页、README 或本地私有配置，不改变这个指纹。
3. 优先从对应 GitHub Release 复用完整固件；没有时，使用仓库中输入指纹匹配、校验通过的现有固件。两者都没有才安装工具链并编译 **ESP32、ESP32-C3、ESP32-S3、ESP32-C6** 四种 4 MB 版本。源码或编译配置变化会使复用失效。固件复用不依赖 Actions 缓存，所以缓存过期不会迫使它重新编译。
4. 检查源码记录、依赖版本、全部四种配置、USB 设置、分区、地址、大小及 SHA-256。已发布 Release 损坏或不完整时明确失败，不悄悄重新编译。
5. **先选定固件，再构建网站**。固件放在 `apps/web/firmware/<profile>/*.bin`，网站构建会把同一批二进制及刷写清单带上，供在线烧录。
6. 创建或复用 `firmware-<完整输入SHA256>` Release。新 Release 先以草稿上传，全部完成后才发布；本流程不覆盖已发布 Release，失败的未完成草稿可以重试；草稿中只要已有完整归档和校验表，校验通过后即可恢复缺失的单独资产，无需重新编译。每批包含 **16 个可单独下载的 `.bin` 文件**、刷写清单、编译报告、输入记录、完整 `.tar.gz` 包和 `SHA256SUMS`；归档包含许可证。这里的“不覆盖”是流程约束，不能阻止仓库所有者手工修改资产。
7. 执行社区数据库的幂等建表操作，再将 Worker `igent-web`、静态网页和所有选定固件一起部署到 `igent.cc`。当前数据库命令只有 `CREATE ... IF NOT EXISTS`，不会清空社区记录；未来非新增型结构改动需要另外设计迁移。
8. 逐文件读取线上内容，与本次干净构建比较哈希，包含全部 16 个烧录二进制。把新生成的部署与固件证据保存为 Actions 产物，不拿旧报告冒充本轮结果。

只改网页时仍会构建、部署最新网页，但**不会重编译未变化的固件，也不会重复创建固件 Release**。如果 Release 发布后网站部署失败，下次经你要求重试时会复用该 Release。流程不会打开串口、刷写实体开发板，也不代替手机真机验收。

## 还需配置一次的部署凭据

仓库需要 Secret：**`CLOUDFLARE_API_TOKEN`**。账号 ID、Worker、域名及 D1 绑定已放在 [wrangler.jsonc](../../wrangler.jsonc)，这些不是密钥。请用专用 Token，只授权当前账号和 `igent.cc` 区域，包含这些命令所需的 Workers Scripts 编辑、Workers Routes 编辑、Zone 读取、D1 编辑权限；不要授权无关账号／域名。直接填入 [GitHub Actions Secrets](https://github.com/cccat6/iphone-agent-harness/settings/secrets/actions)，不要提交到 Git 或粘贴进聊天。

本次本地检查时，仓库尚无部署 Secret；已连接的 Cloudflare 服务在访问 Token 管理接口时返回 `9109 Unauthorized`。在配置这一项之前，工作流会提前明确报错。本次只准备流程，没有触发 Actions、创建远端 Release 或部署 Cloudflare；这些操作等你之后明确要求再执行。[本地验证记录](../research/manual-release-verification.json)列出了确切范围。

## 维护命令

```sh
python3 tools/firmware_release.py plan --offline
python3 tools/firmware_release.py verify
python3 tools/firmware_release_test.py
npm run build
npx wrangler deploy --dry-run
```

`plan` 可通过 `GH_TOKEN` 和 `GITHUB_REPOSITORY` 查询 Release；`--offline` 不访问 GitHub。`seal` 只在现有源码、配置、依赖和二进制检查通过后记录输入：应在真实完成四平台编译后使用，不能用它把旧二进制重新标为新源码。初始输入记录对应此前实际编译的四种固件，并已检查当时安装的 Arduino CLI 为 1.5.1；本次工作流改动无需重新编译。

官方参考：[GitHub 手动运行](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)、[Cloudflare Actions 部署](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)。
