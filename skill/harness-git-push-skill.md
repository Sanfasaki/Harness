---
name: harness-git-push
description: Push local work to the GitHub repository Sanfasaki/Harness from inside the DSH sandbox, where git transport to github.com intermittently hangs. Covers the `git sync` dual-channel command, credential locations, the DSH_DIVERGED self-heal marker, how to sync personalization artifacts (plugins, wallpapers, cursor/theme state) before committing, and the error-to-fix table for push failures.
whenToUse: Use when committing or pushing anything to Sanfasaki/Harness, when a git push/fetch/clone to github.com hangs or fails, or when asked to publish plugin, wallpaper, cursor, or theme changes to the repository.
---

# 推送到 Sanfasaki/Harness

## 一条命令

```bash
git sync "这次改了什么"        # 任何目录、任何会话
```

`git sync` 是全局 git 别名 → `/Sanfasaki/Harness/scripts/git-push.sh`，它做四件事：

1. **链路探针**（15 秒 `git ls-remote`）：沙箱到 github.com 的 git 传输会间歇性**挂死**，
   探针不通就直接跳过标准通道，不白等两分钟。
2. **标准 `git push`**：链路正常时走这条 —— 远端提交就是你本地提交，sha 一致，`git pull` 正常快进。
3. **API 兜底**：`scripts/git-push-api.py` 用 GitHub Git Data API（blobs → tree → commit → ref）
   推送，**内容寻址增量**（远端已有 blob 复用 sha，通常只上传改动的几个文件）。
4. **分叉自愈**：API 通道创建的提交 sha 与本地不同，会让标准 `push` 被 non-fast-forward 拒绝；
   脚本写 `.git/DSH_DIVERGED` 标记，下次推送先 `fetch` 对齐（**只在 tree 逐字节一致时才 reset**），
   网络恢复后自动消除分叉。

常用变体：

```bash
bash scripts/git-push.sh --no-commit "信息"   # 只推已有提交
FORCE_API=1 bash scripts/git-push.sh "信息"   # 强制走 API 通道
GIT_PROBE_TIMEOUT=30 bash scripts/git-push.sh "信息"
```

## 推送前：个性化内容要先"收货"

改插件 / 壁纸 / 光标 / 主题预设 / patch 时，先跑：

```bash
bash /Sanfasaki/Harness/scripts/sync-personalization.sh   # 加 --check 只体检不写入
```

它把三处来源收进仓库，并**校验开发区源码与线上运行版本是否一致**（不一致会点名文件）：

| 来源 | 去向 |
|---|---|
| `/Sanfasaki/dsh-workspace`（编辑源） | `Harness/dsh-workspace/` |
| `$DSH_HOME/profiles/web/packages/*`（线上插件） | `Harness/vendor/` |
| `$DSH_HOME/dsh-*-state.json`（运行态） | `state-snapshots/` + `assets/theme-wallpapers/`（由 `export-skin-snapshot.py` 解码生成） |

**为什么必须做**：历史事故是仓库里的插件副本落后于线上，照 `vendor/` 部署的人缺
`/api/dsh-cursor-state` 路由，光标配置根本存不下来。

## 凭据与配置（已在本机配好，换机器按此复现）

| 项 | 位置 / 值 |
|---|---|
| 令牌（git 用） | `~/.git-credentials`（600），`credential.helper = store --file=…` |
| 令牌（API 兜底用） | `~/.dsh/github-token`（600），也接受环境变量 `GITHUB_TOKEN` |
| 身份 | `user.name=Sanfasaki` / `user.email=sanfasaki@localhost` |
| 大包缓冲 | `http.postBuffer=524288000`（默认 1 MiB，壁纸必炸）、`http.version=HTTP/1.1` |

**令牌永不写进仓库文件、文档或 commit message**；提交前 `grep -rn "ghp_" . --exclude-dir=.git` 自查。

## 报错对照表

| 现象 | 原因 | 处理 |
|---|---|---|
| 探针失败 / `push` 卡到超时 | 沙箱链路抖动（已知现象） | 无需处理，脚本自动走 API；不要手工反复重试 |
| `could not read Username` | 凭据文件缺失或权限不对 | 重建 `~/.git-credentials`（600） |
| `RPC failed; HTTP 411/413` | 单次包过大 | 确认 `http.postBuffer`；仍失败 `FORCE_API=1` |
| `non-fast-forward` | 本地与远端分叉（用过 API 通道） | `git fetch origin main`；比对 `HEAD^{tree}` 与 `FETCH_HEAD^{tree}`，一致则 `git reset --hard FETCH_HEAD && rm -f .git/DSH_DIVERGED` |
| API 通道 `HTTP 401` | 令牌过期/被吊销 | 重新生成 PAT，覆盖两个令牌文件 |
| API 通道 `HTTP 404` 于 `git/ref/...` | 端点写错（应是 **`refs`**，复数） | 已修复，见 `scripts/git-push-api.py` |

## 推送后确认

```bash
git -C /Sanfasaki/Harness rev-parse HEAD          # 本地 sha
git ls-remote origin main                          # 链路正常时可读远端 sha（内容已一致即可，sha 可能分叉）
```

若走了 API 通道且当时 fetch 不通，本地与远端 sha 会不同，但**内容一致**；用 API 比较
`/git/trees/<sha>?recursive=1` 与 `git ls-tree -r HEAD` 可确认零差异。
