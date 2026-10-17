"""Download official source snapshots without executing upstream code.

Uses GitHub commit IDs and records archive SHA-256. No model/API credentials.
"""
import concurrent.futures
import datetime
import hashlib
import json
import re
from pathlib import Path
import tarfile
import urllib.request

ROOT = Path(__file__).resolve().parent
REPOS = {
    "codex": "openai/codex",
    "deepseek-harness": "deepseek-ai/deepseek-harness",
    "claude-code": "anthropics/claude-code",
    "claude-agent-sdk-typescript": "anthropics/claude-agent-sdk-typescript",
    "opencode": "anomalyco/opencode",
    "pi-mono": "badlogic/pi-mono",
    "deepagents": "langchain-ai/deepagents",
    "anthropic-quickstarts": "anthropics/anthropic-quickstarts",
    "ui-tars": "bytedance/UI-TARS-desktop",
    "cursor-public": "cursor/cursor",
}

def request(url):
    req = urllib.request.Request(url, headers={"User-Agent": "phone-harness-source-review", "Accept": "application/vnd.github+json"})
    return urllib.request.urlopen(req, timeout=120)

def fetch(item):
    name, repo = item
    lock_path = ROOT / "sources.lock.json"
    if lock_path.exists():
        previous = next((entry for entry in json.loads(lock_path.read_text())["sources"] if entry["name"] == name), None)
        if previous is not None:
            cached_archive = ROOT / "archives" / f"{name}-{previous['commit']}.tar.gz"
            if cached_archive.exists() and (ROOT / previous["local_path"]).is_dir():
                if hashlib.sha256(cached_archive.read_bytes()).hexdigest() != previous["archive_sha256"]:
                    raise ValueError(f"archive checksum mismatch: {name}")
                print(json.dumps({"name": name, "reused_pinned_snapshot": previous["commit"]}), flush=True)
                return previous
    # Git's public ref advertisement avoids REST API rate limits and needs no
    # local Git/Xcode installation or credentials.
    with request(f"https://github.com/{repo}.git/info/refs?service=git-upload-pack") as response:
        refs = response.read()
    sha = re.search(rb"([0-9a-f]{40}) HEAD", refs).group(1).decode()
    branch_match = re.search(rb"symref=HEAD:refs/heads/([^\s\x00]+)", refs)
    url = f"https://codeload.github.com/{repo}/tar.gz/{sha}"
    archive = ROOT / "archives" / f"{name}-{sha}.tar.gz"
    archive.parent.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256()
    with request(url) as response, archive.open("wb") as output:
        while chunk := response.read(1024 * 1024):
            digest.update(chunk)
            output.write(chunk)
    destination = ROOT / "repos" / name
    destination.mkdir(parents=True, exist_ok=False)
    with tarfile.open(archive, "r:gz") as source:
        for member in source:
            parts = Path(member.name).parts
            if len(parts) < 2:
                continue
            # Omit archive wrapper and links; reference reading needs regular files only.
            if not (member.isfile() or member.isdir()):
                continue
            member.name = str(Path(*parts[1:]))
            source.extract(member, destination, filter="data")
    result = {"name": name, "repository": repo, "commit": sha,
              "default_branch": branch_match.group(1).decode() if branch_match else None,
              "source_url": f"https://github.com/{repo}/tree/{sha}",
              "archive_url": url, "archive_sha256": digest.hexdigest(),
              "archive_bytes": archive.stat().st_size,
              "local_path": str(destination.relative_to(ROOT)),
              "downloaded_utc": datetime.datetime.now(datetime.timezone.utc).isoformat()}
    print(json.dumps(result), flush=True)
    return result

if __name__ == "__main__":
    results, errors = [], []
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        futures = {pool.submit(fetch, item): item for item in REPOS.items()}
        for future in concurrent.futures.as_completed(futures):
            try:
                results.append(future.result())
            except Exception as exc:
                error = {"name": futures[future][0], "error": str(exc)}
                errors.append(error)
                print(json.dumps(error), flush=True)
    (ROOT / "sources.lock.json").write_text(json.dumps({"sources": sorted(results, key=lambda x: x["name"]), "errors": errors}, indent=2) + "\n")
    raise SystemExit(bool(errors))
