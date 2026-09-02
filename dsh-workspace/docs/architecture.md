# DSH 机制速览

> 基于 DSH 自带 README 与安装目录内源码观察整理；一切以实际行为为准。

## 分层模型

配置树从**空根**开始，按顺序叠加：

1. `dsh.profile.bundles` 中各组合包（bundle）的 patch，按列出顺序
2. profile 自身的 `cordis.patch.yml`
3. home 级 `$DSH_HOME/cordis.patch.yml`
4. `--patch` 指定的覆盖层（可重复，如 `--patch a.yml --patch b.yml`）

对同一个行（row，按 `id` 定位），**最后一次写入获胜**；写入是**整体替换**该行的整个 `config`，不做字段级合并。因此"因 mode 而异的行"不会出现在共享 bundle 里，而是属于各自的 mode bundle。

行顺序不承载加载语义——激活由服务可用性驱动；文件里的分组只是为了可读性。

## Profile 目录结构

一个 profile（如 `$DSH_HOME/profiles/web`）包含：

| 文件 | 说明 |
|---|---|
| `package.json` | `dsh.profile.bundles` 列出组合包 |
| `cordis.patch.yml` | 用户自己的 patch 层（顶层是一个 YAML 数组） |
| `cordis.yml` | 组合后的结果——**不要手工编辑**，启动时重新生成 |
| `pnpm-workspace.yaml` | 插件安装的工作区声明 |

`web` 与 `headless` profile 首次使用时从随附模板自动初始化；其他任何 profile 都必须通过 `dsh plugin --profile <name> <pnpm 参数>` 创建。

## Bundle（组合包）

bundle 就是一个 npm 包，在 `package.json` 里声明自己的 patch：

```json
{
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
}
```

`dsh.profile.bundles` 中的名字先尝试从 DSH 安装目录解析内置组合包（`@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-web-app`、`@deepseek-ai/dsh-headless`），再尝试从 profile 自己的 `node_modules` 解析——pnpm 会把树外插件安装到该目录，所以本地 bundle 先 `pnpm add <路径>` 进 profile，再写进 `bundles` 即可。

## Patch 条目

`cordis.patch.yml` 是顶层 YAML 数组，支持三类条目：

- **insert**：插入新行

  ```yaml
  - insert:
      - id: my-plugin
        name: '@sanfasaki/dsh-hello-plugin'
        config:
          greeting: '嗨！'
  ```

- **按 id 覆盖 config**（整体替换）：

  ```yaml
  - id: session-title
    config:
      maxTitleBytes: 200
  ```

- **禁用某行**：`disabled: true`，支持 `!!js` 表达式按环境计算（如 `disabled: !!js (() => process.env.NODE_ENV === 'production')()`）。

## 插件

插件是 Cordis 插件：`export { name, inject, apply }`。`apply(ctx, config)` 里用 `ctx.effect` / `ctx.on` 注册生命周期行为，`ctx.logger` 打日志；需要的服务在 `inject` 数组里声明（如 `commands`、`compaction`、`session`）。

用 `dsh plugin --profile <name> <pnpm 参数>` 管理 profile 的插件依赖——该命令把剩余参数原样转发给 profile 目录里的 pnpm：

```sh
dsh plugin --profile web add <package>     # 安装
dsh plugin --profile web remove <package>  # 移除
dsh plugin --profile web why <package>     # 谁依赖了它
```

## Agent preset（个性化 Agent）

`/opt/dsh/lib/node_modules/@deepseek-ai/dsh/config/agent-presets/` 下有 `code`、`cordis`、`minimal`、`standard` 等预设。每个 preset 包含：

- `preset.yml`：名称、描述、顺序（供 UI 选择）
- `agent.cordis.yml`：persona（`@deepseek-ai/dsh-persona` 的 `text`，支持 `{{model}}`、`{{cwd}}` 占位）、指令、工具装配

想定制 Agent 人格，从这里入手最直接：preset 的 `persona` 行会覆盖部署默认值。

## 调试

| 命令 | 作用 |
|---|---|
| `dsh web --dump-config` | 打印组合后的完整树（含用户层与 `--patch`）后退出 |
| `dsh web --dump-default-config` | 只打印 bundle 层（无用户层） |
| `dsh web --help` | web 应用的参数（`--port` 等），不是启动器的 |

启动器的 flag 必须写在最前面；第一个启动器不认识的 token 标志着应用参数开始。
