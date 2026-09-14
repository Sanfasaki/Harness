#!/usr/bin/env python3
"""git-push-api.py —— 用 GitHub Git Data API 推送本地提交（git 传输不可用时的兜底通道）。

特点：
  * 内容寻址增量上传：远端已有的 blob 直接复用 sha，不重复上传（壁纸这类大文件只传一次）。
  * 保持远端线性历史：新提交的 parent 取远端当前分支头，因此本地/远端 sha 会分叉，
    推送后会尝试 fetch + reset 把本地对齐回远端，保证两边最终一致。
  * --dry-run：完整构建 tree/commit 但不动 ref，用于自检通道是否可用。

用法：
    python3 scripts/git-push-api.py [branch] [--repo DIR] [--token-file F] [--dry-run] [-m MESSAGE]
"""
import argparse
import base64
import json
import re
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

API = "https://api.github.com"


def git(*args, cwd=None, binary=False):
    r = subprocess.run(("git",) + args, cwd=cwd, capture_output=True)
    if r.returncode != 0:
        sys.exit(f"git {' '.join(args)} 失败: {r.stderr.decode(errors='replace').strip()}")
    return r.stdout if binary else r.stdout.decode(errors="replace")


def http(method, url, token, payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(
        url,
        method=method,
        data=data,
        headers={
            "Authorization": f"token {token}",
            "Accept": "application/vnd.github+json",
            "Content-Type": "application/json",
            "User-Agent": "dsh-git-push-api",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            body = resp.read().decode() or "{}"
            return json.loads(body)
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")[:400]
        sys.exit(f"GitHub API {method} {url} -> HTTP {e.code}\n{detail}")


def parse_slug(remote_url):
    m = re.search(r"github\.com[:/]+([^/]+)/([^/]+?)(?:\.git)?/?$", remote_url.strip())
    if not m:
        sys.exit(f"无法从 origin 解析 owner/repo: {remote_url!r}")
    return m.group(1), m.group(2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("branch", nargs="?", default="main")
    ap.add_argument("--repo", default=".")
    ap.add_argument("--token-file", default=str(Path.home() / ".dsh" / "github-token"))
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("-m", "--message", default=None)
    args = ap.parse_args()

    repo = str(Path(args.repo).resolve())
    token = None
    import os

    if os.environ.get("GITHUB_TOKEN"):
        token = os.environ["GITHUB_TOKEN"].strip()
    elif Path(args.token_file).is_file():
        token = Path(args.token_file).read_text().strip()
    if not token:
        sys.exit(f"缺少令牌：请设置 GITHUB_TOKEN 或写入 {args.token_file}（见 docs/GIT-PUSH.md）")

    owner, name = parse_slug(git("remote", "get-url", "origin", cwd=repo))
    head = git("rev-parse", "HEAD", cwd=repo).strip()
    message = args.message or git("log", "-1", "--pretty=%B", cwd=repo).strip()
    print(f"仓库 {owner}/{name}  本地 HEAD {head[:10]}  分支 {args.branch}")

    # 本地待推送内容（mode / type / sha / path）
    raw = git("ls-tree", "-r", "-z", "HEAD", cwd=repo, binary=True)
    entries = []
    for item in raw.decode(errors="replace").split("\0"):
        if not item:
            continue
        meta, path = item.split("\t", 1)
        mode, otype, sha = meta.split()
        entries.append({"mode": mode, "type": otype, "sha": sha, "path": path})
    print(f"本地文件 {len(entries)} 个")

    # 远端当前头 + 已有 blob 映射
    # 注意：更新引用必须用 /git/refs/（复数）；/git/ref/ 只支持 GET，PATCH 会 404。
    ref = f"{API}/repos/{owner}/{name}/git/refs/heads/{args.branch}"
    try:
        parent = http("GET", ref, token)["object"]["sha"]
    except SystemExit:
        parent, base_tree, remote_map = None, None, {}
        print("远端分支不存在，将创建首个提交")
    else:
        commit = http("GET", f"{API}/repos/{owner}/{name}/git/commits/{parent}", token)
        base_tree = commit["tree"]["sha"]
        tree = http("GET", f"{API}/repos/{owner}/{name}/git/trees/{base_tree}?recursive=1", token)
        remote_map = {n["path"]: n["sha"] for n in tree.get("tree", []) if n["type"] == "blob"}
        print(f"远端 {args.branch} = {parent[:10]}，其中 {len(remote_map)} 个 blob 可复用")

    reuse = upload = 0
    tree_items = []
    for ent in entries:
        if remote_map.get(ent["path"]) == ent["sha"]:
            reuse += 1
            tree_items.append({"path": ent["path"], "mode": ent["mode"], "type": ent["type"], "sha": ent["sha"]})
            continue
        content = git("cat-file", "blob", ent["sha"], cwd=repo, binary=True)
        try:
            blob = {"content": content.decode("utf-8"), "encoding": "utf-8"}
        except UnicodeDecodeError:
            blob = {"content": base64.b64encode(content).decode(), "encoding": "base64"}
        sha = http("POST", f"{API}/repos/{owner}/{name}/git/blobs", token, blob)["sha"]
        upload += 1
        tree_items.append({"path": ent["path"], "mode": ent["mode"], "type": ent["type"], "sha": sha})

    # 远端有、本地没有的文件 -> 删除
    local_paths = {e["path"] for e in entries}
    deleted = [p for p in remote_map if p not in local_paths]
    for p in deleted:
        tree_items.append({"path": p, "mode": "100644", "type": "blob", "sha": None})
    print(f"blob 复用 {reuse} / 新上传 {upload} / 删除 {len(deleted)}")

    payload = {"tree": tree_items}
    if base_tree:
        payload["base_tree"] = base_tree
    new_tree = http("POST", f"{API}/repos/{owner}/{name}/git/trees", token, payload)["sha"]
    parents = [parent] if parent else []
    new_commit = http(
        "POST",
        f"{API}/repos/{owner}/{name}/git/commits",
        token,
        {"message": message, "tree": new_tree, "parents": parents},
    )["sha"]

    if args.dry_run:
        print(f"[dry-run] 将推送提交 {new_commit[:10]}（未改动远端 ref）")
        return

    if parent:
        http("PATCH", ref, token, {"sha": new_commit, "force": True})
    else:
        http("POST", f"{API}/repos/{owner}/{name}/git/refs", token,
             {"ref": f"refs/heads/{args.branch}", "sha": new_commit})
    print(f"✅ API 通道推送成功 -> {new_commit[:10]}")

    # 把本地对齐到远端 sha（内容一致才会 reset，避免误伤）
    # 分叉标记 .git/DSH_DIVERGED 让下一次推送知道"该先对齐再走标准通道"，实现自愈：
    # 否则本地 sha 与远端不同，标准 git push 会被 non-fast-forward 永久拒绝。
    marker = Path(repo) / ".git" / "DSH_DIVERGED"
    if os.environ.get("DSH_LINK_DOWN") == "1":
        # 调用方已判定 git 链路不通，别再做注定失败的 fetch（每次白等 45 秒）
        marker.write_text(new_commit + "\n")
        print("⚠️ 链路已知不通，跳过 fetch；本地 sha 与远端分叉，网络恢复后会自动对齐")
        return
    fetch = subprocess.run(("timeout", "45", "git", "fetch", "-q", "origin", args.branch), cwd=repo, capture_output=True)
    if fetch.returncode == 0:
        fetched = git("rev-parse", "FETCH_HEAD", cwd=repo).strip()
        git("update-ref", f"refs/remotes/origin/{args.branch}", fetched, cwd=repo)
        if git("rev-parse", "HEAD^{tree}", cwd=repo).strip() == git("rev-parse", f"{fetched}^{{tree}}", cwd=repo).strip():
            git("reset", "--hard", "-q", fetched, cwd=repo)
            marker.unlink(missing_ok=True)
            print(f"本地已对齐到远端 sha {fetched[:10]}（分叉已消除）")
        else:
            marker.write_text(new_commit + "\n")
            print("⚠️ 远端 tree 与本地不同，未自动 reset（请人工检查）")
    else:
        marker.write_text(new_commit + "\n")
        print("⚠️ 无法 fetch（网络受限），本地 sha 与远端分叉；内容已一致，"
              "下次网络恢复时脚本会自动 fetch 对齐")


if __name__ == "__main__":
    main()
