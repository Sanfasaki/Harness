# 本机全局约定（Sanfasaki 的 DSH 机器）

> 本文件是 DSH 的 workspace 指令通道（`$DSH_HOME/AGENTS.md`），每个新会话都会自动读到。
> 只放"所有任务都该知道的稳定约定"，细节放仓库文档里。

## 往 GitHub 推仓库内容 —— 只有一条命令

```bash
git sync "这次改了什么"
```

- 仓库：`https://github.com/Sanfasaki/Harness`（本地 `/Sanfasaki/Harness`）
- `git sync` 是全局 git 别名 → `/Sanfasaki/Harness/scripts/git-push.sh`：
  15 秒链路探针 → 标准 `git push` → 链路不通时**自动走 GitHub API 兜底**（内容寻址增量）。
  两条通道内容一致；若 sha 分叉，脚本用 `.git/DSH_DIVERGED` 标记自愈，网络恢复后自动对齐。
- **完整说明见 `/Sanfasaki/Harness/docs/GIT-PUSH.md`**（配置、排错对照表、换机器复现步骤）。
- 凭据：`/root/.git-credentials`（git credential.helper=store）与 `/root/.dsh/github-token`
  （API 兜底用），权限均为 600。**不要把令牌写进仓库文件、文档或 commit message。**
- 沙箱内到 github.com 的 git 传输会间歇性挂死；这是已知现象，`git sync` 已处理，不要手工反复重试。

## 个性化内容的正确改法

改插件 / 壁纸 / 光标 / 主题预设 / patch 时：

```bash
bash /Sanfasaki/Harness/scripts/sync-personalization.sh   # 开发区+线上+运行态 → 仓库（--check 只体检）
git sync "同步个性化内容"
```

- 开发区 `/Sanfasaki/dsh-workspace` 是**编辑源**（不是 git 仓库）；`/Sanfasaki/Harness` 是**仓库镜像**。
- 插件运行副本在 `$DSH_HOME/profiles/web/packages/{dsh-skin,dsh-cursor}`，仓库成品在 `Harness/vendor/`。
- 客户端插件改动后需**硬刷新**；新增/改动 host 侧或插件行需 `systemctl restart dsh.service`。

## 事实来源

`/Sanfasaki/Harness/docs/HANDOFF.md` —— 任何改动都要同步更新它，然后 `git sync`。
部署相关读 `docs/DEPLOY.md`；推送相关读 `docs/GIT-PUSH.md`。
