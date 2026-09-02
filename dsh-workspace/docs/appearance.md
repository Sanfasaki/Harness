# 外观个性化：机制与现成资源

> 调研日期：2026-08-28。基于已安装的 `@deepseek-ai/dsh-client-ui-theme`（v0.1.1-rc.2）源码与公开社区项目整理。

## 1. 内置能力（零成本，先试这个）

设置 → **通用设置 → 外观**（Appearance）里可直接切换 **浅色 / 深色 / 跟随系统**：

- 偏好持久化在 `$DSH_HOME/settings.yaml` 的 `ui-theme.preference`（`light` / `dark` / `system`，默认 `system`）。
- 界面渲染约定：`html { color-scheme }` + `body[data-ds-dark-theme]` 属性，所有颜色走 CSS 变量。

## 2. 主题机制：设计 token（CSS 变量）

UI 全部基于 CSS 变量，分四类（值取自 `design-platform.css` 实际内容）：

| 类别 | 前缀 | 作用 | 示例（真实值） |
|---|---|---|---|
| 静态色阶 | `--dsw-static-*` | 调色板原始色 | `--dsw-static-neutral-bluish-950: #151517`、`--dsw-static-deepseek-500: #4176e6` |
| 语义别名 | `--dsw-alias-*` | 组件语义色，引用静态色阶 | `--dsw-alias-bg-base`、`--dsw-alias-label-primary`、`--dsw-alias-brand-primary`、`--dsw-alias-button-primary-fill`、`--dsw-alias-state-business-primary`、`--dsw-alias-scrollbar-bg-l1`、`--dsw-alias-border-l1..l4`、`--dsw-alias-markdown-*`、`--dsw-alias-tooltip-bg`、`--dsw-alias-toast-bg` |
| 组件专用 | `--dsw-specific-*` | 单个组件 | `--dsw-specific-bubble`、`--dsw-specific-sidebar-fill`、`--dsw-specific-input-major`、`--dsw-specific-menu`、`--dsw-specific-selector`、`--dsw-specific-tip` |
| 字体/效果/代码 | 其他 | 排版、阴影、代码高亮 | `--dsw-font-family`、`--ds-font-family-code`、`--dsw-font-*`（字号阶梯）、`--dsw-shadow-lv1..3`、`--dsw-linear-gradient-think`、`--shiki-token-*`（代码高亮） |

浅/深两套值分别挂在 `body` 与 `body[data-ds-dark-theme]` 上。**改主题 = 覆盖这些变量**；建议只改 `--dsw-alias-*` / `--dsw-specific-*` 语义层，不要动静态色阶。

## 3. 第三方主题怎么注册（官方 API）

主题服务在**浏览器端**：`dsh-client-ui-theme` 的 client 半区 `ctx.provide("theme", ...)` 提供 `ThemeRuntime`。第三方插件（client 插件）`inject: ["theme"]` 后：

```ts
// 注册一个可选主题（设置 → 外观里会出现主题卡片）
ctx.theme.register({
  id: "my-theme",
  colorScheme: "dark",                       // 该主题属于哪个配色方案
  tokens: {
    "--dsw-alias-bg-base":  { light: "#ffffff", dark: "#151517" },
    "--dsw-alias-brand-primary": { light: "#4176e6", dark: "#5686fe" },
    // 每个 token 必须给 light/dark 两个值（即使主题只服务一个模式）
  },
});

// 或在现有主题上叠一层实时覆盖（不改注册表，可随时移除）
const dispose = ctx.theme.overrideTokens("my-package-id", {
  "--dsw-alias-bg-layer-1": { light: "#fafafa", dark: "#2c2c2e" },
});
// dispose() 移除这一层
```

其他 API：`getTheme()`（不可变快照）、`setTheme(id)`（切换，未知 id 抛错）、`exportInspectTokens()`（导出全部 token 目录）。`system` 是偏好不是主题 id，不可注册。

> 客户端插件是**浏览器端**代码（`dsh.client`），需要打包进 web 前端，不是普通后端插件；先读社区项目再动手。

## 4. 现成第三方主题（社区）

| 项目 | 特点 | 安装 | 备注 |
|---|---|---|---|
| [dsh-theme-tuner](https://github.com/shawnlone/dsh-theme-tuner) | 挂在「外观」下方：强调色/背景/前景/对比度/渐变度，浅深分别保存，实时生效 | `dsh plugin --profile web add github:shawnlone/dsh-theme-tuner` | **结构最规范**：`dsh.bundle.patch` + `dsh.client` 双面插件，`lib/index.js`（host）+ `lib/client.js`（浏览器），最值得抄作业 |
| [dsh-theme-plugin](https://github.com/BeiZi6/dsh-theme-plugin) | Theme Studio：5 个预设（Nord/Solarized/Graphite…）+ 完整自定义（强调色、背景、前景、字体、半透明侧栏、对比度） | `dsh plugin --profile web add github:BeiZi6/dsh-theme-plugin` | 用官方 `theme.overrideTokens`；host 侧走 `webServer.tapIndex` 注入 |
| [dsh-skin](https://github.com/wei-806206088/dsh-skin) | 最全面：极简主题 + 主色 + 文字色 + **图片/GIF/视频换肤**（5 槽位、独立不透明度）+ 命名预设持久化 | clone 后跑 `install.ps1` / `install.sh` | 目标版本 `0.1.0-rc.6`；换肤选择器对 DOM 类名**版本敏感**，升级 dsh 后可能要调 `SLOT_SELECTORS` |
| [dsh-client-ui-theme-xp](https://github.com/SamizuHM/dsh-client-ui-theme-xp) | Windows XP Luna 桌面化：壁纸、桌面图标、浮动窗口、任务栏 | `npx @deepseek-ai/dsh plugin --profile web add dsh-client-ui-theme-xp`（npm 已发布） | 纯浏览器端插件，玩票性质 |
| [dsh-client-ui-aqua](https://www.npmjs.com/package/dsh-client-ui-aqua) 等 | npm 上散落的第三方主题 | `dsh plugin --profile web add <包名>` | 质量参差，装前看 README |

## 5. 起步建议（三条路线）

1. **先装现成的**（最快见效）：`dsh-theme-tuner` 或 `dsh-theme-plugin`，一条命令装进 web profile，重启生效。
2. **自己写最小主题插件**（学机制）：仿 `dsh-theme-tuner` 的结构，写一个 `dsh.client` 插件 `inject: ["theme"]` 调 `theme.register(...)`，注册一个专属主题卡片。产出放进 `dsh-workspace/plugins/`。
3. **纯配置层实验**（不写代码）：研究 token 后写一张覆盖 CSS 变量的补丁（如通过 `webServer.tapIndex` 注入 `--dsw-alias-*` 覆盖），快速验证配色想法。

> 安装前提醒：`dsh plugin --profile web add ...` 需要可用的 `dsh` / `pnpm`；当前沙箱里 CLI 受限，请在正常 shell 里执行。

## 6. 已知问题与本地修复记录

**dsh-skin 预设丢失（保存第二个预设后重开只剩第一个）——已修复（2026-08-28）**

- 现象：保存第二个预设后重启 harness，只剩第一个预设。
- 根因：`packages/dsh-skin/lib/client.js` 的 `persist()` 是**即发即忘的 POST**：每次配置变化都触发一次完整写入，无防抖、无写入顺序。配置内嵌 base64 图片（本例约 800KB），多个 POST 并发在途时**先发的旧配置可能最后落盘**，把含新预设的配置覆盖掉。另有次生路径：页面加载完成（`loaded=true`）前的编辑不会写盘，加载完成后内存状态被文件里的旧配置替换。
- 修复：`persist()` 改为**250ms 防抖 + 串行写入**（同一时刻只有一个 POST 在途，永远写最新配置，保证提交顺序即落盘顺序）。补丁已同时应用到运行副本 `/root/.dsh/profiles/web/packages/dsh-skin/lib/client.js` 与工作区克隆 `third-party/dsh-skin/packages/dsh-skin/lib/client.js`，备份为 `client.js.bak-persistfix`；服务器已自动重建 bundle（rev 变化已验证）。
- 注意：`install.sh` 重跑会覆盖 `packages/dsh-skin`，覆盖后需重新应用此补丁（可直接从工作区克隆复制）。
- 建议向 [wei-806206088/dsh-skin](https://github.com/wei-806206088/dsh-skin) 提 PR 上游化此修复。

**真正根因补充（2026-08-28）：nginx 请求体上限 1MB**

- 后续排查发现预设丢失还有更硬的阻塞：本机 DSH 经 nginx 公网入口（`/etc/nginx/sites-available/dsh`，端口 8080）访问，nginx **默认 `client_max_body_size 1m`**。dsh-skin 把壁纸以 base64 存进配置，多个预设后状态文件可达 ~1.9MB，保存 POST 超过 1MB 被 nginx 直接 413 拒绝，而 dsh-skin 对非 200 响应只打 `console.error`，表现为"保存成功但重启后消失"（`/var/log/nginx/error.log` 可见 `client intended to send too large body`，access.log 里有 97 条 413）。
- 修复：在 dsh 站点配置里加 `client_max_body_size 256m;`（与应用内 `MAX_STATE_BYTES` 一致）后 `nginx -t && systemctl reload nginx`；已用 1.5MB 请求体验证（返回 401 而非 413）。注意该上限与 dsh-skin 的 `MAX_STATE_BYTES`（256MB）对齐即可，勿设过小。

## 7. 本地新增功能：自动切换主题（2026-08-28）

在调色板弹窗最下方新增「自动切换主题」：

- 开关 + 间隔选择（1min / 10min / 30min / 1h / 自定义分钟数 0.1~1440，支持小数）。
- 到点自动按预设列表顺序循环应用下一个预设（`applyPreset` 语义：accent/text/region/images，不含浅/深模式）。
- 开关与间隔随 `cfg.autoSwitch` 持久化，重启后恢复；自动应用的主题不落盘（预设才是持久化来源），避免每个周期写一次 ~2.7MB 状态文件。
- 边界：预设 <2 时开关置灰；删除预设会自动安全重定位；定时器为浏览器端 `setInterval`，页面关闭即停（重开后从列表第一个重新开始循环）；后台标签页对 1min 档有节流，更长间隔无感。
- 改动集中在 `lib/client.js`（`defaultCfg`/`normalizeCfg` 加 `autoSwitch` 字段、Control 组件加定时器 effect 与 UI section），备份 `client.js.bak-autoswitch`。

**平滑过渡（2026-08-28 追加）**

- 主题切换（手动应用预设 / 自动切换 tick / 浅深模式切换）不再瞬变：全局加 `.dsh-skin-transition` 类做 0.9s 颜色渐变动画（background/color/border/fill/stroke/box-shadow，`cubic-bezier(.4,0,.2,1)` 慢起慢收，`!important` 临时接管，~1.15s 后移除）。
- 壁纸（挂在 `html body` 上，background-image 不可过渡）用**双图层交叉淡化**：切换时把旧壁纸用 `!important` 钉在 body 上，同时插入 `#dsh-skin-wp-cross` 固定层（新壁纸 opacity 0→1，0.9s），结束后移除覆盖层与钉扎样式，body 底下的新壁纸无缝接管。视频壁纸同理走现有 `manageVideos` 逻辑。
- **踩坑记录**：过渡层最初用 `z-index:0`，会渲染在应用 UI 之上（应用根节点未建立更高层叠上下文），表现为"UI 先消失→闪过背景图→恢复"；必须用 `z-index:-1`（画在 body 背景之上、内容之下，透过半透明表面可见交叉淡化）。
- **踩坑记录 2**：背景图解码是异步的，大图（如 900KB+ base64 壁纸）若在淡入动画/清理之后才解码完，淡入的是空白层，清理瞬间新壁纸突然出现 → 看起来"瞬间切"。修复：用 `new Image()` 预加载 + `onload` 门控，等新壁纸真正解码完成后再启动 opacity 淡入（800ms 兜底防卡死），清理逻辑防重入。
- **踩坑记录 3（交叉淡化方案重构）**：`!important` 钉扎旧壁纸的方案在实测中不可靠（body 壁纸仍是瞬间切换），重构为**延迟切换**：淡入期间构建 CSS 时把 body 壁纸替换为旧壁纸（`deferWpRef`），新壁纸放 `z-index:-1` 覆盖层淡入；淡入完成后在不透明覆盖层底下 `refreshSkin()` 切到新壁纸再移除覆盖层。淡入启动用**双重 rAF** 保证 transition 可靠触发。
- **踩坑记录 4（循环顺序）**：整数索引循环与当前生效皮肤脱钩，开启自动切换的第一个 tick 和手动应用后会出现"跳变/折返"观感。修复：`matchLivePreset()` 每次 tick 从当前 live 皮肤在列表中的位置前进一格（accent/text/图片槽位全等匹配；无匹配则从第一个开始），保证严格按列表顺序循环、到底回卷；面板预设列表新增「当前」高亮标记便于观察。
- **方案重写（2026-08-28）：改用 View Transitions API**——钉扎/延迟切换/覆盖层等多套 hack 均不可靠，最终采用浏览器原生整页快照交叉淡化：`document.startViewTransition()` 一次调用让壁纸 + 全部颜色 + 整个 UI 一起平滑过渡；回调内 `applyFn()` 后双重 rAF 等 React 提交绘制，保证新快照正确；`::view-transition-old/new(root){animation-duration:2s}` 控制时长；新壁纸先 `new Image()` 预解码避免新快照空白；不支持的环境回退到颜色渐变类。参考：[ColorUI - View Transitions for Color UIs](https://colorui.io/blog/view-transitions-for-color-uis)、[CSS cross-fade()](https://css-tricks.com/almanac/functions/c/cross-fade/)。
- **View Transitions 实测废弃（2026-08-28）**：两个硬伤——(1) 主题 CSS 在 React `useEffect` 里写入，快照捕获时 DOM 还是旧主题，新旧快照相同 → 无过渡；(2) 过渡期间整页冻结不可交互，2s 即锁死 2s。
- **最终方案：CSS cross-fade() + @property（2026-08-28）**：叠加层方案（`z-index:-1` 覆盖层）在本 UI 上实测不可见（层叠上下文问题），最终改为**在 body 自己的背景上做原生交叉淡化**：`@property --dsh-wp-cross`（`<percentage>`，0%→100%，2s transition）驱动 `background-image: cross-fade(url(旧), url(新), var(--dsh-wp-cross))`——同一元素上双图原生混合，不依赖任何叠加层/z-index/钉扎；新壁纸预解码后启动，`CSS.supports` 探测不支持 cross-fade 的环境回退为瞬切+颜色渐变。Chromium 89+/Edge 111+ 支持。
- **三段式过渡（2026-08-28，采纳用户设计）**：单纯双图混合（cross-fade 中点 50/50）在亮度差异大的图之间仍显跳变。改为 **A 渐渐消失（0.75s，cross-fade 向透明渐变）→ 无（0.4s，此刻应用新主题，颜色变化被掩盖）→ B 渐渐出现（0.75s，透明渐变向 B）**；透明图用 `linear-gradient(rgba(0,0,0,0),rgba(0,0,0,0))` 充当 cross-fade 第二参数；阶段切换用定时器驱动（`finished` 防重入，快速连续切换安全）。
- **踩坑记录 5（transition 被级联压死）**：`transition: --dsh-wp-cross` 会被颜色过渡类 `.dsh-skin-transition *` 覆盖——两个 `!important` 相遇按特异性裁决，类选择器 (0,1,0) > `html body` (0,0,2)，cross-fade 百分比变量瞬间跳变（表现为：淡出消失、淡入实为表面透明度变化）。修复：改用 **keyframes 动画**驱动 `--dsh-wp-cross`（动画机制与 transition 属性完全独立，天然免疫级联覆盖），`animation: dsh-skin-wp-fade .75s linear forwards`。数学对齐需求规格：可见壁纸强度 = 主题设定透明度 x × 阶段系数 f（f 线性 1→0 / 0→1），x 全程不被修改。
- **踩坑记录 6（cross-fade 渐变参数无效）**：keyframes 方案实测仍无淡出——`cross-fade(url(A), linear-gradient(透明,透明), var(--p))` 的"渐变作第二参数"形式在部分 Chromium 版本不被接受，整条 background-image 声明无效（CSS.supports 只探测简单形式，返回 true 造成假阳性），动画规则静默失效。
- **最终方案：遮罩三段式 + Web Animations API（2026-08-28）**：彻底放弃 cross-fade。状态机：常规 →(遮罩 0→1, 0.3s linear)→ 无（遮罩不透明 0.12s，此刻 `applyFn()` 切换主题——新壁纸被遮住保持不可见）→(遮罩 1→0, 0.3s)→ 常规。遮罩 = `z-index:-1` 不透明底色层（盖住壁纸、不影响 UI、不拦截交互），颜色取计算后的 `--dsw-alias-bg-base` 去 alpha。opacity 动画用 `element.animate()`（WAAPI）驱动——JS 直接控制，完全不经过 CSS transition 级联，任何现代浏览器都有效；新壁纸预解码后启动，`finished` 防重入。总时长 ~0.72s，颜色过渡类 0.5s（可在 `T_OUT/T_VOID/T_IN` 三处微调）。
## 8. dsh-cursor：光标美化插件（2026-09-02，v2 重写）

独立纯客户端插件 `plugins/dsh-cursor`（已装入 web profile）：

- **v2 实现（图片光标，参考用户项目 CustomCursor 组件）**：全局 `cursor: none !important` + `position:fixed` 图片元素直接跟随鼠标（clientX/Y + translate(-50%,-50%) 居中），悬停可点击元素放大（scale，0.1s 过渡），离开窗口隐藏；触屏设备 `@media (hover:none)` 禁用。
- 可配置：图案 URL（默认内置 SVG 圆点）、大小 24~96px、放大倍数 1~2；设置存 `localStorage`。
- **v3 追加鼠标拖尾**（参考用户项目 CursorTrail，2026-09-02）：时间驱动——`mousemove` 16ms 节流记录（上限 12），rAF 按存活时长算 progress，`easeOutCubic` 收缩淡出、过期销毁；与图片光标相互独立可分别开关；可配置颜色/光点大小/时长。
- **v1 拖尾反思（教训）**：淡出按数组下标而非时间 → 速度不同形态漂移、鼠标停住残影冻结；无 createdAt/时长过滤；mousemove 不节流；无缓出函数。
- **v4 追加点击波纹**（参考用户项目 ClickRipple）：document 级 click 监听，点击点生成波纹（圆环 border，`size=maxSize×easeOutCubic` 扩散、`opacity=0.8×(1-p)` 淡出），连点叠加上限 12；可配置颜色/最大尺寸/时长/边框粗细。性能改进：滑块/取色拖动只做轻量同步（`applyLight`），不重建面板、不打断拖拽。
- **踩坑**：(1) client bundle 必须用 `window.__ModuleLoader__.load({id, factory})` 外壳（client-modules 协议），缺失导致整页加载失败（用户发现并修复）；(2) 光标元素 z-index 需 2147483001（高于 dsh-skin 面板 2147483000），否则移到面板上光标消失；(3) `pointer-events:none`、`cursor:none!important`、输入框保留 I-beam。
- v1（canvas 光环+粒子拖尾）因效果差被废弃。
