# 往仓库推送内容（Git 通道与配置）

> 面向"任何一次新对话 / 任何一台新机器"：读完这一页即可正常 push。
> 本文是可执行配置的单一说明；工具本体是 `scripts/git-push.sh` 与 `scripts/git-push-api.py`。

> **新对话通常不需要读这一页**：本机已部署 workspace 指令（`$DSH_HOME/AGENTS.md` 等三层，
> 见仓库 `agents/`）与 `harness-git-push` 技能，新会话会自动知道"推送用 `git sync`"。
> 本文是给需要排查细节的人读的。

## 0. 一句话用法

```bash
git sync "你的提交信息"        # 任何目录下都行（自动 add/commit/push，失败自动换通道）
```

> 改的是"个性化"相关内容（插件、壁纸、光标、主题预设）时，**先**跑
> `bash /Sanfasaki/Harness/scripts/sync-personalization.sh` 把开发区/线上/运行态收进仓库，
> 再 `git sync`。加 `--check` 只体检不写入。这一步能避免仓库副本落后于线上运行版本。

等价写法（不依赖全局别名）：

```bash
bash /Sanfasaki/Harness/scripts/git-push.sh "你的提交信息"
bash /Sanfasaki/Harness/scripts/git-push.sh -C /Sanfasaki/Harness "提交信息"   # 指定仓库
bash /Sanfasaki/Harness/scripts/git-push.sh --no-commit "信息"                # 只推已有提交，不新建
```

## 1. 为什么要双通道

沙箱内到 `github.com` 的**网络是间歇性的**：同一分钟内 `git ls-remote` 可能成功、
而 `git clone` / `git push` 超时或 `EOF`。这不是配置错误，重试往往就好了，
但"重试"不能写进自动化流程。因此本仓库采用两条通道：

| 通道 | 实现 | 何时使用 |
| --- | --- | --- |
| A 标准 git | `git push origin main` | 默认。历史、sha、`git pull` 全部正常 |
| B GitHub API | Git Data API（blobs → tree → commit → ref） | A 失败时自动回退；也可 `FORCE_API=1` 强制 |

`scripts/git-push.sh` 先走 A，失败打印 git 原始报错后自动走 B。
两条通道的**内容完全一致**（B 用 git 对象 sha 做内容寻址），区别只在 commit sha 与父提交：

- A 通道：远端提交是你本地提交本身，本地/远端 sha 相同，`git pull` 正常快进。
- B 通道：远端提交由 API 创建，父提交取远端当前头。因此 sha 会分叉，
  脚本推送后会尝试 `git fetch` + `reset --hard` 把本地对齐回远端（仅在 tree 完全一致时才 reset）。

### 1.1 实测过的三种链路状态与脚本行为

| 链路状态 | 脚本行为 | 实测耗时 |
| --- | --- | --- |
| 正常 | 15s 探针通过 → 标准 `git push` 成功 | 数秒 |
| 抖动/挂死（`git push` 会卡到超时） | 15s 探针失败 → 直接走 API，不白等 | 约 20s + 上传 |
| 长时间不通 | 走 API；**跳过**注定失败的 fetch（`DSH_LINK_DOWN=1`） | 约 20s + 上传 |

### 1.2 分叉自愈（重要）

走过 B 通道后本地 sha 与远端不同，**标准 `git push` 会被 non-fast-forward 永久拒绝**。
脚本用 `.git/DSH_DIVERGED` 标记记住这件事，下次推送时会：

1. 先 `git fetch` 尝试对齐；
2. 只有 tree 与远端**逐字节一致**才 `reset --hard`，然后删掉标记、恢复正常通道；
3. 若仍无法 fetch，则继续走 API（不阻塞你的工作）；
4. 网络恢复后第一次 `git sync` 就会自动完成对齐，无需人工干预。

如果确实需要手动处理：

```bash
git fetch origin main
git rev-parse HEAD^{tree} FETCH_HEAD^{tree}   # 两个 sha 相同 = 内容一致，可安全对齐
git reset --hard FETCH_HEAD && rm -f .git/DSH_DIVERGED
```


## 2. 已经做好的全局配置（一次配置，所有对话/仓库通用）

| 配置 | 值 | 原因 |
| --- | --- | --- |
| `user.name` / `user.email` | `Sanfasaki` / `sanfasaki@localhost` | 沙箱里默认没有身份，缺了 `git commit` 直接失败 |
| `credential.helper` | `store --file=/root/.git-credentials`（权限 600） | 免交互认证；令牌不写进仓库、不写进 `.git/config` |
| `http.postBuffer` | `524288000`（500 MiB） | 默认 1 MiB，推壁纸/素材这类大文件会 411/413 |
| `http.version` | `HTTP/1.1` | 规避 HTTP/2 在大包推送时常见的 `EOF`/`RPC failed` |
| `alias.sync` | `!bash /Sanfasaki/Harness/scripts/git-push.sh` | 一条命令完成提交流程 |
| `init.defaultBranch` / `pull.rebase` | `main` / `false` | 新仓库默认分支名与合并策略一致 |

令牌另存一份在 `/root/.dsh/github-token`（600），供 API 通道脚本读取
（脚本也接受环境变量 `GITHUB_TOKEN`，优先级最高）。

## 3. 换机器 / 新环境怎么复现

```bash
git config --global user.name  "Sanfasaki"
git config --global user.email "sanfasaki@localhost"
git config --global http.postBuffer 524288000
git config --global http.version HTTP/1.1
umask 077
printf 'https://x-access-token:%s@github.com\n' "<你的PAT>" > ~/.git-credentials
chmod 600 ~/.git-credentials
git config --global credential.helper "store --file=$HOME/.git-credentials"
printf '%s' "<你的PAT>" > ~/.dsh/github-token && chmod 600 ~/.dsh/github-token
git config --global alias.sync '!bash /Sanfasaki/Harness/scripts/git-push.sh'
```

PAT 需要 `repo`（或 fine-grained 的 Contents: Read and write）权限。
`install.sh` 不会写这些配置（涉及密钥），需按上面手动执行一次。

## 4. 排错对照表

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `fatal: could not read Username` | 凭据文件缺失/权限不对 | 重做第 3 节的凭据两步 |
| `RPC failed; HTTP 411/413` | 单次推送包过大 | 确认 `http.postBuffer` 已设；仍失败走 `FORCE_API=1` |
| `RPC failed; curl 92 ... EOF` / `timed out` | 沙箱链路抖动 | 直接重跑 `git sync`；或 `FORCE_API=1` |
| 推送被拒 `non-fast-forward` | 本地与远端分叉（常见于用过 B 通道后） | `git fetch origin main` 后比对 tree：`git rev-parse HEAD^{tree} FETCH_HEAD^{tree}`，一致就 `git reset --hard FETCH_HEAD` |
| `src refspec main does not match any` | 还没有提交 | 先 `git add -A && git commit -m ...` |
| API 通道报 `HTTP 401` | 令牌过期/被吊销 | 重新生成 PAT，覆盖 `~/.git-credentials` 与 `~/.dsh/github-token` |

## 5. 安全注意

- 令牌是长期凭据，只存在 `~/.git-credentials` 与 `~/.dsh/github-token`（都是 600），
  **不要**写进仓库文件、`.git/config`、文档或 commit message。
- 提交前可用 `grep -rl "ghp_" .git/ .` 自查是否意外落盘。
- 令牌一旦出现在对话记录、截图或第三方系统里，应立刻到 GitHub 吊销重发。
