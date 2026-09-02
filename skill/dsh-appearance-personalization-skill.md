# DSH 外观个性化实战 Skill

> 在 DeepSeek Harness（DSH）Web GUI 上做外观个性化/插件开发的完整经验沉淀。
> 配套一键部署：`install.sh`；详细文档：`docs/DEPLOY.md`、`dsh-workspace/docs/`。

## 一、DSH 机制速览

- **Profile**：`$DSH_HOME/profiles/<name>`（默认 `$DSH_HOME=/root/.dsh`，web profile 含 `package.json` + `cordis.patch.yml`）。
- **配置分层**：空根 → `dsh.profile.bundles` 各 bundle patch → profile `cordis.patch.yml` → `$DSH_HOME/cordis.patch.yml` → `--patch` 覆盖层。对同一行**整体替换 config，不合并**，后写获胜。
- **插件**：npm 包，Cordis 插件。宿主半区 `lib/index.js`；**客户端半区**在 `package.json` 声明 `dsh.client`（`{platform:"web", immediately:true}`），入口 `./client`。
- **客户端 bundle 协议（大坑）**：client.js 必须以
  `window.__ModuleLoader__.load({ id: "<插件名>", factory: (require) => {...} })`
  注册，缺失会报 "bundle ... loaded without registering" 并导致**前端整页加载失败**。
- **主题 token**：UI 全走 CSS 变量——`--dsw-static-*` 静态色阶、`--dsw-alias-*` 语义别名、`--dsw-specific-*` 组件专用、`--dsw-font-*`、`--shiki-*`。改主题 = 覆盖 `--dsw-alias-*` / `--dsw-specific-*`。
- **第三方主题注册**：client 插件 `inject: ["theme"]` 后 `ctx.theme.register({id, colorScheme, tokens})`（tokens 每项必须给 light/dark 两值）或 `ctx.theme.overrideTokens(source, tokens)`。
- 客户端 bundle 内容改动**只需刷新**（rev 内容哈希 + `cache-control: no-cache`）；新增插件/宿主改动**需重启 profile**（本机 `systemctl restart dsh.service`）。

## 二、主题与壁纸

- **壁纸机制**：壁纸全透明挂在 `html body` 上，主题"壁纸不透明度 w"实际由 UI 表面透明度 `1-w` 实现（表面变半透明让壁纸透出）。
- **持久化**：dsh-skin 配置存 `$DSH_HOME/dsh-skin-state.json`（壁纸 base64 内嵌，多预设可达数 MB）。
- **踩坑**：nginx 默认 `client_max_body_size 1m` 会静默拒掉大保存 → 加 `client_max_body_size 256m;` 并 reload；前端 persist 必须防抖 + 串行化，否则并发 POST 后到先写覆盖新预设。

## 三、主题切换过渡（三段式遮罩方案，最终可用）

**不要用**：View Transitions（整页冻结不可交互 + React effect 时序导致快照相同）、
cross-fade + transition（会被颜色过渡类的 `!important` 特异性压死）、
cross-fade + keyframes（渐变作第二参数部分 Chromium 无效）、
z-index:-1 叠加层直接淡化（本 UI 下层叠不可靠）。

**用（实测可行）**：遮罩三段式 + Web Animations API：

```
常规 →(遮罩 0→1, linear)→ 无（遮罩不透明，此刻切主题，新内容被遮住）→(遮罩 1→0)→ 常规
```

- 遮罩 = `position:fixed; z-index:-1` 的不透明底色层（取计算样式 `--dsw-alias-bg-base` 去 alpha），盖住壁纸、不挡 UI。
- 动画用 `element.animate()`（WAAPI）驱动 opacity——JS 直控，不经过 CSS transition 级联，任何浏览器都有效。
- 颜色并行渐变：临时类 `transition: background-color .5s ... !important`，动画结束移除。
- 新壁纸先 `new Image()` 预解码再启动（大 base64 图解码异步，否则淡入空白）。
- 时长参考：淡出 300ms / 无 120ms / 淡入 300ms；`finished` 标记防重入。

## 四、光标美化插件要点（dsh-cursor）

- 图片光标：`cursor:none` + fixed div 直接跟随；**z-index 必须 2147483001**（高于 dsh-skin 面板 2147483000，否则移到面板上光标消失）。
- 拖尾/波纹：时间驱动（createdAt + duration + easeOutCubic），16ms 节流，上限 12，rAF 推进、过期销毁 DOM。
- 上传到服务器（base64 文本存 `$DSH_HOME`，fs 服务无二进制写能力）；**服务端按魔数嗅探 MIME**（扩展名不可信）。
- **透明 PNG 上传**：先解码校验；可解码则自动裁剪透明边缘（alpha>8 包围盒）；全透明/坏文件明确报错。
- **APNG 坑**：裁剪工具可能导出动画 PNG（acTL/fcTL chunk）——Chromium 拒解导致光标消失、Pillow 也不认；剥离动画 chunk 即恢复为静态 PNG。
- 自适应描边：浅色主题深阴影、深色主题（`body[data-ds-dark-theme]`）浅辉光，MutationObserver 监听实时切换。

## 五、其他

- 循环切换主题顺序：从"当前生效皮肤"在列表中匹配（accent/text/图片全等）前进一格，避免整数索引脱钩造成的折返观感。
- 本地开发循环：改 `lib/client.js` → `cp` 到 profile `packages/<plugin>/lib/` → 浏览器强刷验证；宿主改动 → 重启。
