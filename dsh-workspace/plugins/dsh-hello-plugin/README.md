# @sanfasaki/dsh-hello-plugin

DSH 示例插件：加载时打一条问候日志。也是新插件的模板：复制本目录，改 `package.json` 里的包名与 `src/index.ts` 里的 `name` / 逻辑即可。

## 使用

```sh
pnpm install
pnpm build
bash ../../scripts/install-plugin.sh web .
```

然后在 `$DSH_HOME/profiles/web/cordis.patch.yml` 里启用：

```yaml
- insert:
    - id: hello-plugin
      name: '@sanfasaki/dsh-hello-plugin'
      config:
        greeting: '你好，世界'
```

重启 web profile 后，日志里会出现 `[hello-plugin] 你好，世界`。

> 只想预览不落地？`dsh web --patch ../../patches/personal.yml`（该文件里已含本插件的 insert 示例）。
