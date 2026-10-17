# 固定版本的上游源码

研究日期：2026-10-18。

- `sources.lock.json`：10 个官方仓库的 commit、归档地址、大小、SHA-256 和下载 UTC。
- `readings.json`：33 个重点阅读位置、行范围、文件 SHA-256 和固定提交的 GitHub 链接。
- `repos/`：本地解压后的源码树，只读研究；没有 Git 历史，归档中的符号链接没有解压，未额外拉取子模块或 LFS 对象。
- `archives/`：原始官方 tar.gz，便于校验和重新展开。
- `fetch_sources.py`：无凭据下载工具，不运行上游代码。已有快照默认复用并验证归档哈希，避免覆盖阅读基线。

获取：

```sh
python3 research/harness-reference/fetch_sources.py
```

需要 Python 3.12 或更新版本，以使用 tarfile 的 data 提取过滤器。首次获取解析官方 Git refs 的 HEAD，下载固定提交；已存在的锁文件和归档会优先复用。若要重新研究新版，先为旧研究保存独立目录，不能静默覆盖旧版本。

Cursor 和 Claude 的官方公开仓库也已保存，但不包含完整 Agent 内核；具体范围见 [调研报告](../../docs/research/harnesses.md)。这里的下载不等于所有组件都按开源许可证发布。

源码和归档被根 `.gitignore` 排除。分发我们自己的项目时保留清单、报告和获取工具，不把这些上游仓库整个混进产品。
