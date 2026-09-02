# 插件开发要点

## 最小骨架

一个插件就是一个 npm 包，入口导出 `name`、`inject`、`apply`：

```ts
import { Context } from "@deepseek-ai/cordis";

export const name = "my-plugin";
export const inject = ["logger"];

export function apply(ctx: Context, config: MyConfig) {
  ctx.effect(() => {
    ctx.logger.info(`loaded: ${JSON.stringify(config)}`);
  });
}
```

- `name`：插件标识，也是 patch 里常用的 `id`，保持唯一
- `inject`：需要注入的服务名列表（如 `commands`、`compaction`、`session`）
- `apply(ctx, config)`：用 `ctx.effect(...)` 注册生命周期效应（fiber 激活时执行、禁用/热更时自动清理），或 `ctx.on(<具体事件>)` 监听 DSH/agent 事件（如 `agent/request`、`system-prompt/assemble`）；**本 cordis 分支没有 `"ready"` 事件**，别用 `ctx.on("ready", ...)`

package.json 关键字段：

```json
{
  "name": "@sanfasaki/my-plugin",
  "type": "module",
  "main": "lib/index.js",
  "exports": { ".": { "default": "./lib/index.js" } },
  "peerDependencies": { "@deepseek-ai/cordis": "^4.0.1" }
}
```

> 插件之间互相依赖时，把对方也放进 `peerDependencies`（参考 `@deepseek-ai/dsh-command-compact`：它 peer 依赖 `@deepseek-ai/dsh-commands`、`@deepseek-ai/dsh-compaction` 等）。

## 配置（Config）

Cordis 4 的配置校验走 Standard Schema v1（`@standard-schema/spec`），`Config` 导出可选。不需要校验时可以不导出，直接在 `apply` 里用默认值。可参考两个真实例子：

- `@deepseek-ai/dsh-command-compact`：无 `Config`，只导出 `apply / inject / name`
- `@deepseek-ai/dsh-session-title`：有复杂配置

## 构建与安装

1. 构建：`pnpm install && pnpm build`（输出到 `lib/`，包内 `files` 只发 `lib`）
2. 装进 profile：`dsh plugin --profile web add <插件路径>`（等价于在 profile 目录里 `pnpm add <路径>`）
3. 在 profile 的 `cordis.patch.yml` 里 insert 一行启用：

   ```yaml
   - insert:
       - id: my-plugin
         name: '@sanfasaki/my-plugin'
         config: { ... }
   ```

4. 重启 profile 生效。验证组合结果：`dsh web --dump-config`（grep 你的插件 id）

## 热更与预览

- profile 内置 HMR（`@deepseek-ai/cordis-plugin-hmr`，watch profile 目录），改 `cordis.patch.yml` 后通常热更生效。
- 快速试配置用 `--patch` 覆盖层：`dsh web --patch <file>`。注意这是启动参数，改文件后需要重启进程。

## 常用服务（inject 候选）

| 服务名 | 提供包 | 说明 |
|---|---|---|
| `commands` | `@deepseek-ai/dsh-commands` | 注册 `/斜杠命令`（参考 `dsh-command-compact`） |
| `compaction` | `@deepseek-ai/dsh-compaction` | 会话压缩 |
| `session` | `@deepseek-ai/dsh-session` | 会话模型 |
| `logger` | 内置 | 日志：`ctx.logger.info/warn` |

## 常见坑

- **config 整体替换**：patch 里覆盖某行时写全量 config，别指望字段级合并。
- **依赖解析顺序**：bundle 先从 DSH 安装目录解析，再找 profile 的 `node_modules`；自己包里的 `@deepseek-ai/cordis` 版本要与运行时对齐（`^4.0.1`）。
- **改 `cordis.yml` 无效**：那是生成文件，改动会被覆盖；要改 `cordis.patch.yml`。
- **`--dump-config` 与 `--patch` 冲突**：`--dump-default-config` 不接受 `--patch`。
