# /Sanfasaki 工作区约定

> 本目录下的会话会自动读到本文件（DSH workspace 指令通道）。
> 全局约定见 `~/.dsh/AGENTS.md`；仓库细则见 `Harness/AGENTS.md`。

## 两个目录的分工（容易搞混）

| 目录 | 角色 | 是不是 git 仓库 |
|---|---|---|
| `/Sanfasaki/dsh-workspace` | **编辑源**：插件源码、机制文档、patch 模板、脚本 | 否（不要在这里 `git init`） |
| `/Sanfasaki/Harness` | **仓库镜像**：对外发布的成品 + 部署文档 | 是（`origin` = github.com/Sanfasaki/Harness） |

改东西的路径：在 `dsh-workspace` 里编辑 → 跑 `bash /Sanfasaki/Harness/scripts/sync-personalization.sh`
把它收进 `Harness/dsh-workspace/` → 到 `Harness` 里 `git sync "信息"`。

## 推送

一条命令，任何目录都行：`git sync "这次改了什么"`（细节见 `Harness/docs/GIT-PUSH.md`）。

## 本机跑着什么

- DSH web 实例：`systemctl status dsh.service`（127.0.0.1:3080；公网经 nginx `139.9.130.104:8080`，basic auth）
- 两个自研插件：**dsh-skin**（主题皮肤：预设/自动切换/三段式过渡）、**dsh-cursor**（图片光标+拖尾+点击波纹，
  配置与图片都存在 `$DSH_HOME`）
- 插件运行副本：`$DSH_HOME/profiles/web/packages/`；改动客户端代码需**硬刷新**，改 host 侧或插件行需**重启服务**
