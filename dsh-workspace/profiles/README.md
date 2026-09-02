# 自定义 profile

DSH 的 profile 位于 `$DSH_HOME/profiles/<name>`。`web` 与 `headless` 首次使用时从随附模板自动初始化；其他任何 profile 都必须通过 `dsh plugin` 创建。

## 创建方式

```sh
# dsh plugin 会把剩余参数原样转发给该 profile 目录下的 pnpm
dsh plugin --profile myapp init   # 在 profile 目录生成 package.json（pnpm init）
dsh plugin --profile myapp add <插件包名或路径>
```

或者手动搭：复制 `$DSH_HOME/profiles/web` 的结构，改 `package.json` 里的 `dsh.profile.bundles`（例如换成 `@deepseek-ai/dsh-base` + 你自己的 bundle）。

## 启动

```sh
dsh --profile myapp <应用参数>
# 应用参数从第一个启动器不认识的 token 开始
```

## 版本管理建议

profile 的**定义**（`package.json` + `cordis.patch.yml`）适合放进本目录做版本管理，需要时再同步到 `$DSH_HOME/profiles/`；运行期生成的文件（`cordis.yml`、`node_modules`）不入库（见根目录 `.gitignore`）。

本目录可放：

- `templates/`：自己的 profile 模板（package.json + cordis.patch.yml 骨架）
- `notes.md`：每个 profile 的用途、装了什么插件、踩过的坑

> 注：`dsh --profile myapp init` 依赖 pnpm；如果环境里 pnpm 不可用，先装好 pnpm 再执行。
