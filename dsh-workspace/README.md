# dsh-workspace

DeepSeek Harness（DSH）的个性化与插件开发工作区。

DSH 的启动器 `dsh` 以 **profile** 为单位启动应用：profile 由若干**组合包（bundle）**的 patch 层按顺序叠加而成，其上再叠加你自己的覆盖配置（`cordis.patch.yml`）。插件则是普通的 npm 包（Cordis 插件），通过 profile 的 pnpm 安装进去。本目录集中存放与自己 DSH 定制相关的一切：插件、组合包、patch 覆盖层、自定义 profile、脚本与文档。

## 环境速览

| 项目 | 位置 |
|---|---|
| DSH 安装目录 | `/opt/dsh`（可执行文件 `/opt/dsh/bin/dsh`） |
| `$DSH_HOME`（profiles、会话、设置） | `/root/.dsh` |
| 现有 profile | `web`、`headless`（`$DSH_HOME/profiles/`） |
| 本工作区 | `/Sanfasaki/dsh-workspace` |

## 目录结构

| 目录 | 用途 |
|---|---|
| `plugins/` | 自己开发的插件包（每个插件一个独立 npm 包） |
| `bundles/` | 可复用的组合包：一组插件 + 一份 `cordis.patch.yml`，可挂进 profile 的 `dsh.profile.bundles` |
| `patches/` | 个性化覆盖层（patch 文件，可配合 `--patch` 预览） |
| `profiles/` | 自定义 profile 的说明与模板 |
| `scripts/` | 辅助脚本（安装插件、查看组合配置） |
| `docs/` | 机制说明与开发笔记（含外观个性化调研 `docs/appearance.md`） |

## 三种用法

### 1. 快速个性化现有 profile（改 patch，最快）

复制 `patches/personal.yml` 改成你想要的样子，带 `--patch` 启动预览：

```sh
dsh web --patch /Sanfasaki/dsh-workspace/patches/personal.yml
```

先看效果，满意后再把内容合并进 `$DSH_HOME/profiles/web/cordis.patch.yml`（web 的 profile 目录即 `$DSH_HOME/profiles/web`）。

### 2. 开发插件

以 `plugins/dsh-hello-plugin` 为模板复制一个新包，改完源码后构建并安装：

```sh
# 在插件目录里
pnpm install && pnpm build

# 装进 web profile（等价于在 profile 目录里执行 pnpm add <路径>）
bash /Sanfasaki/dsh-workspace/scripts/install-plugin.sh web \
  /Sanfasaki/dsh-workspace/plugins/dsh-hello-plugin
```

然后在 profile 的 `cordis.patch.yml` 里 `insert` 一行启用（示例见 `patches/personal.yml`）。

### 3. 组合 bundle 或建自定义 profile

见 `docs/plugin-development.md` 与 `profiles/README.md`。

## 快速参考

- patch 层叠加顺序：空根 → `dsh.profile.bundles` 各 bundle 的 patch → profile 的 `cordis.patch.yml` → `$DSH_HOME/cordis.patch.yml` → `--patch` 覆盖层。对同一行（按 `id` 定位）**后写覆盖先写**，且是**整个 `config` 整体替换、不做字段级合并**。
- 查看组合后的配置树（不启动进程）：`dsh web --dump-config`；只看 bundle 层：`dsh web --dump-default-config`。
- 插件入口形状：`export { name, inject, apply }`，类型从 `@deepseek-ai/cordis` 导入，`peerDependencies` 声明 `@deepseek-ai/cordis@^4.0.1`。
- 插件装进 profile：`dsh plugin --profile <name> add <包名或路径>`（剩余参数原样转发给该 profile 目录下的 pnpm）。
- 详细机制见 `docs/architecture.md`；开发要点见 `docs/plugin-development.md`。
