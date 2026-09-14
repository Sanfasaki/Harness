# Harness 仓库约定

> 本文件只在本仓库目录树内生效；全局约定见 `~/.dsh/AGENTS.md`，工作区约定见 `/Sanfasaki/AGENTS.md`。

## 这个仓库是什么

`Sanfasaki/Harness` —— DSH 个性化（dsh-skin 主题 + dsh-cursor 光标）的可复刻成品仓库：
`vendor/` 是可直接部署的插件，`install.sh` 一键部署，`docs/` 是给人读的文档，`assets/` 是素材，
`dsh-workspace/` 是开发工作区的镜像（编辑源在 `/Sanfasaki/dsh-workspace`）。

## 硬约定

1. **`docs/HANDOFF.md` 是事实来源**：任何改动都要同步更新它（环境、踩坑、未竟事项、模型现状），
   再 `git sync`。接手者只读文档，不应依赖旧对话记录。
2. **`docs/DEPLOY.md` 必须能让外人照读部署成功**：改了部署步骤/依赖/坑，就要改它。
3. **不要手写自动生成的快照**：`dsh-workspace/state-snapshots/*` 与 `assets/theme-wallpapers/*`
   由 `scripts/export-skin-snapshot.py` 生成；改动运行态后跑
   `bash scripts/sync-personalization.sh` 重生成（幂等，二次运行应无 diff）。
4. **插件副本别手工拷**：`vendor/` 与 `dsh-workspace/` 由 `scripts/sync-personalization.sh` 同步，
   它会校验开发区源码与线上运行版本是否一致（不一致会点名文件）。历史事故：仓库副本落后于线上，
   导致照 `vendor/` 部署的人缺少 `/api/dsh-cursor-state` 路由、光标配置无法持久化。
5. **令牌与密钥永不入库**：凭据在 `~/.git-credentials` / `~/.dsh/github-token`（600）。
   提交前可用 `grep -rn "ghp_" . --exclude-dir=.git` 自查。
6. **推送用 `git sync "信息"`**（双通道，链路不通自动走 API 兜底）；细节见 `docs/GIT-PUSH.md`。

## 改 DSH 插件时的验证要点

- 客户端代码改动：浏览器**硬刷新**才生效（bundle 内容 hash 变了 URL 不变）。
- host 侧路由 / 插件行改动：`systemctl restart dsh.service`（长命令偶发返回 "interrupted but recorded"，
  用 `systemctl is-active` + 新 PID 验证，不要盲目重试）。
- 客户端 bundle 必须以 `window.__ModuleLoader__.load({ id, factory })` 包裹，否则前端报
  "bundle loaded without registering"。
