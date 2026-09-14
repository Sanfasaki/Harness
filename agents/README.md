# agents/ —— 让"其他对话"自动读到约定

这里的三个文件是 DSH **workspace 指令通道**（AGENTS.md）的源文件。部署到对应位置后，
任何**新开会话**都会在第一步自动收到其内容（不进对话记录噪音、无需人工提醒），
这是"把推送方式/仓库约定传给其他对话"的官方机制。

| 本仓库文件 | 部署到 | 生效范围 |
|---|---|---|
| `AGENTS.global.md` | `$DSH_HOME/AGENTS.md` | **所有**会话（任何 cwd） |
| `AGENTS.workspace.md` | `<工作区>/AGENTS.md`（本机 `/Sanfasaki/AGENTS.md`） | 该目录树下的会话 |
| `AGENTS.repo.md` | `<仓库>/AGENTS.md`（本机 `/Sanfasaki/Harness/AGENTS.md`） | 本仓库目录树下的会话 |

技能文件 `../skill/harness-git-push-skill.md` 部署到 `$DSH_HOME/skills/harness-git-push/SKILL.md`，
它会把 `harness-git-push` 列进会话的技能目录，模型可自行加载完整推送流程。

## 部署

```sh
install -D -m644 agents/AGENTS.global.md    "$DSH_HOME/AGENTS.md"
install -D -m644 agents/AGENTS.workspace.md /Sanfasaki/AGENTS.md
install -D -m644 agents/AGENTS.repo.md      /Sanfasaki/Harness/AGENTS.md
install -D -m644 skill/harness-git-push-skill.md "$DSH_HOME/skills/harness-git-push/SKILL.md"
```

`install.sh` 不会覆盖已存在的 AGENTS.md（避免盖掉别人的约定），需要时手工执行上面的命令。

## 两个实测结论（2026-09-14）

1. **写入即生效，无需重启**：文件创建后，当前已运行的会话立刻就收到了注入
   （插件在文件系统工具调用成功后重新发现并推送上下文）。
2. **不要用 `dsh --dump-config` 判断这条通道是否开启**：dump 里 `agent-instructions` 写着
   `disabled: true`，但运行时实际是启用的（同理 dump 里 disabled 的 `tool-todo` / `tool-web`
   在会话中也都存在）。dump 只反映 composition 层，对 `disabled` 与 settings 用户层都不可信。

## 文件规模

指令文件会占用每个会话的上下文预算（`agent-instructions` 的 `maxBytes` 默认 65536）。
这里三个文件合计约 5.6 KB，属轻量；**新增内容请克制**，细节一律放 `docs/` 里用指针引用。
