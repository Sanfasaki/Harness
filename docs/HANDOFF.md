# Harness 外观个性化 · 交接文档（HANDOFF）

> **给接手者的信**：你没有本项目的对话上下文也能凭本文档接手。
> 目的：DeepSeek Harness（DSH）Web GUI 的外观个性化工作（主题皮肤 + 光标美化），
> 全部代码、修复、部署方式、踩坑与未竟事项都在这里 + 下方指向的文件里。
> 仓库：https://github.com/Sanfasaki/Harness ｜ 本地源码：`/Sanfasaki/dsh-workspace`

**最近更新（2026-09-14）**：默认模型已是 `deepseek-flash`（无版本号滚动别名，当前 = V4.1 Flash，
原生支持图片）；旧的 `deepseek-v4-flash-vision-exp` 仅作兼容保留在模型目录里，新会话不再使用它。
推送仓库请用 `git sync "信息"`（双通道，见 `docs/GIT-PUSH.md`）。本文档为"当前唯一事实来源"，
后续须随每次变更实时同步（见 §8 维护约定）。

## 0.1 用户审美档案（做任何外观改动前先读）

> 供接手模型对齐用户品味。素材：主题壁纸三张 + 光标图两版（已用多模态逐一读图确认）。

- **日漫 + 国漫双线**：主角感来自《葬送的芙莉莲》与《紫罗兰永恒花园》，《罗小黑战记2》补充国漫向。
- **主色调**：低饱和 **青绿（芙莉莲森林/治愈）↔ 蓝粉（薇尔莉特海港/怀旧）↔ 暖琥珀暗夜（罗小黑战记2城景/燃）**；
  强调色用**魔杖红宝石红 + 红丝带**（精致高光）。
- **质感**：偏好手绘细腻、氛围叙事、**金属/宝石/珠光**精雕（光标 = 芙莉莲魔杖，非泛用图案）。
- **色彩映射建议**：dsh-skin 浅色主题→芙莉莲透亮青绿；深色主题→罗小黑暖琥珀夜景；点缀统一用
  宝石红（按钮/激活态/光标指针）。光标延续"代表性道具/角色局部"思路（魔杖/行李箱/信件/精灵耳等备选）。
- **image 素材映射**：default=芙莉莲魔杖全身（760×1633）；guangbiao=魔杖上部特写（484×943，APNG 修复版，
  用于`芙莉莲魔杖`预设）；**hei-cursor=罗小黑光标（用户自制 184×193，用于`罗小黑光标`预设）**；
  **violet-cursor=紫罗兰光标（用户自制 1023×1020，用于`紫罗兰光标`预设）**；
  hei-paw-print/violet-letter 为程序生成备选（未采用）。
  壁纸 fulilian=芙莉莲森林、Violet=薇尔莉特海港、lxhzj=罗小黑战记2城景。

---

## 0. 一句话现状

DSH `web` profile 已装 **dsh-skin**（主题皮肤：换肤/预设/自动切换/三段式平滑过渡，含本地修复）与
**dsh-cursor**（图片光标 + 拖尾 + 点击波纹 + 服务器图片上传），已推送到
`github.com/Sanfasaki/Harness`；默认模型为 `deepseek-flash`（新会话生效；已在运行会话是创建时取的旧别名，
两者实际同一模型）。

## 1. 环境事实（命令可直接用）

| 项 | 值 |
|---|---|
| DSH_HOME | `/root/.dsh`（profile：`/root/.dsh/profiles/web`） |
| GUI 服务 | systemd `dsh.service`（`systemctl restart dsh.service` 会短暂断 GUI，会话持久化不丢） |
| 公网入口 | nginx `:8080`（https 自签 + basic auth），站点配置 `/etc/nginx/sites-available/dsh` |
| nginx 请求体上限 | **已改 `client_max_body_size 256m;`**（默认 1m 会静默拒掉 dsh-skin 大保存——大坑） |
| pnpm / node | pnpm v11.24（`npm i -g pnpm` 装的）、node v22 |
| 本地工作区 | `/Sanfasaki/dsh-workspace`（源码+文档） |
| Git 仓库 | `/Sanfasaki/Harness`（= github.com/Sanfasaki/Harness，main） |
| 运行中插件副本 | `/root/.dsh/profiles/web/packages/{dsh-skin,dsh-cursor}`（`workspace:*` 链接） |
| 上游克隆 | `/Sanfasaki/dsh-workspace/third-party/dsh-skin`（不入库；vendor/ 是最终可用版） |

**生效规则**：客户端 bundle 内容改动 → 复制到 profile `packages/<插件>/lib/` → 浏览器**强刷**即可
（rev=内容哈希 + `cache-control:no-cache`）；宿主代码（`lib/index.js`）或**新增插件** → 需重启服务。
`settings.yaml` 有 chokidar 监听，改配置**热载无需重启**。

## 2. 已安装插件与功能

### dsh-skin（`cordis.patch.yml` insert 行 `dsh-skin`）
- 极简浅/深主题、主色、文字色、区域文字色；图片/GIF/视频换肤（5 槽位、独立不透明度）
- 命名预设持久化（`$DSH_HOME/dsh-skin-state.json`，壁纸 base64 内嵌可达数 MB）
- **自动切换主题**（1min/10min/30min/1h/自定义分钟）+ 列表顺序循环（matchLivePreset）
- **三段式平滑过渡**（遮罩 0→1 → 无 → 1→0，WAAPI）
- 本地修复清单（详见 `dsh-workspace/docs/appearance.md` §6-7）

### dsh-cursor（insert 行 `dsh-cursor`）
- 图片光标：上传（服务器存储）/URL/内置默认；悬停放大、离窗隐藏、输入框保留 I-beam、
  **自适应描边 + 描边强度**（浅色深影／深色双白辉光，强度×s，MutationObserver 实时）
- 拖尾 + 点击波纹：时间驱动（createdAt+duration+easeOutCubic），16ms 节流、上限 12、过期销毁
- **命名预设**：整套参数存为命名预设，列表应用/删除；存服务器端（跨会话）
- **关联主题**（默认关）：切到某主题(dsh-skin)→点预设"关联"绑定主题名；dsh-skin 广播当前主题
  （`data-dsh-active-skin` 属性 + `dsh-skin-preset` 事件），dsh-cursor 切主题时自动应用关联光标。
  已预置映射：`芙莉莲魔杖↔fulilian`、`罗小黑光标↔lxhzj`、`紫罗兰光标↔Violet`
- 宿主路由 `/api/dsh-cursor-image`：POST（base64 JSON→存 `$DSH_HOME` 根 `dsh-cursor-images-*.b64`，
  fs 服务无二进制写能力故存 base64 文本）；GET 按**魔数嗅探** MIME（扩展名不可信）
- 宿主路由 `/api/dsh-cursor-state`：配置服务器端持久化（与 dsh-skin 一致；localStorage 不可靠）

## 3. 模型与会话

- `/root/.dsh/settings.yaml` → `agent-default-model.model = deepseek-flash`（2026-09-10 写入，服务 09-14 重启后已加载）。
  现状核对命令：`grep -A3 agent-default-model /root/.dsh/settings.yaml`。备份：`settings.yaml.bak-vision`（内容是更早的 `deepseek-v4-flash`）。
- **已在运行的长会话不会跟着改**：会话的模型在创建时确定，`sessions/` 里也没有持久化模型 id，
  所以本会话仍显示旧的 `deepseek-v4-flash-vision-exp` —— 但这只是标签差异，该别名实测解析为
  `deepseek-flash`，**同一个模型**。想让当前会话换标签，用 UI 的模型下拉框重选即可（不影响能力）。
- **多模态已解锁**：对话附件通道不再被模型能力限制；图片类任务（看素材/校对/做光标图）可对话完成。
  此前为绕行"不能传图"而做的 dsh-cursor **服务器图片上传仍保留、不冲突**（须保留：插件自身功能）。

### 3.1 V4.1 Flash 与"无版本号"命名（2026-09-10 更新，重要）

- **V4.1 Flash 已于 2026-09-10 12:00（北京时间）正式上线**（官方给 API 用户的邮件；官方文档页当时尚未更新）。
  V4.1 **Pro 未发布**；`deepseek-v4-pro` 将于 **9/14 12:00 下线**，此后其请求路由到 V4.1 Flash 并按新价计费。
- **API 现在只接受两个模型名**（官方 400 报错原文）：`deepseek-flash`、`deepseek-v4-pro`；
  `deepseek-v4.1-flash` / `deepseek-v4.1-pro` **不存在**。
- **`deepseek-flash` 是无版本号滚动别名**，当前指向 V4.1 Flash；旧名 `deepseek-v4-flash`、
  `deepseek-v4-flash-vision-exp` 仍可用但**实测均解析为 `deepseek-flash`**（也在跑 V4.1）。
  多模态随之统一：不再需要单独的 `-vision-exp`，`deepseek-flash` 原生支持图片。
- **新计费**（空闲时段，每百万 token）：缓存命中 0.02 元、未命中 1 元、输出 4 元（高峰 ×2），比旧 Flash 更便宜。
- **已做的配置**：`/root/.dsh/profiles/web/cordis.patch.yml` 给 `llm-deepseek` 行加 `models` 目录
  （`config` 整体替换，故列全）：`deepseek-flash`（DeepSeek-V4.1-Flash，声明
  `inputModalities: [text, image]` 保留图片能力）+ 两条旧别名 + `deepseek-v4-pro`；
  已 `dsh --dump-config` 校验模型目录行并重启生效。
- **默认模型与 dump-config 的区别（易误判，实测确认）**：默认模型写在 `settings.yaml` 的
  `agent-default-model` 段（用户层），它**覆盖** composition 基础层；而 `--dump-config` 打印的恰恰是
  基础层（本机显示旧值 `deepseek-v4-flash`），所以**不能拿 dump-config 判断默认模型**。
  判定依据：`grep -A3 agent-default-model /root/.dsh/settings.yaml`，或读
  `dsh-agent-default-model` 的 `installSettingsSection(..., { base: entry })` —— 其中
  `scope.get()`（= 用户层优先的合并值）才是插件实时来源。settings.yaml 热加载，改完无需重启（只影响新会话）。
- **风险提示**：模型名不再钉版本 → 同名不同代；评测/回归须自行记录调用日期，否则结果不可复现。

## 4. 关键踩坑速查（接手必读，防重蹈覆辙）

1. **client bundle 外壳**：client.js 必须以 `window.__ModuleLoader__.load({id, factory})` 注册，
   缺失报 "bundle ... loaded without registering" → **前端整页加载失败**。
2. **光标 z-index**：光标层必须 `2147483001`（> dsh-skin 面板 `2147483000`），否则移到面板上光标消失。
3. **nginx 1MB**：不加 `256m` 时 dsh-skin 大保存被 413 静默拒绝（"预设重启后丢失"的真凶）。
4. **持久化竞态**：前端 persist 必须**防抖+串行写**（并发 POST 后到先写覆盖新数据）。
5. **主题过渡最终方案 = 遮罩三段式 + WAAPI `element.animate()`**。
   已废弃并不可用：View Transitions（整页冻结 + React effect 时序致快照相同）、
   cross-fade+transition（被颜色类 `!important` 特异性压死）、cross-fade+keyframes
   （渐变作参数部分 Chromium 无效）、`z-index:-1` 直接淡化叠加层（本 UI 层叠不可见）。
6. **服务器存图**：fs 服务只给 `writeText` → 二进制走 **base64 文本**；返回 MIME 用魔数嗅探。
7. **APNG 坑**：裁剪工具可能导出动画 PNG（acTL/fcTL chunk）——Chromium 拒解致光标消失、
   Pillow 也不认；**剥离动画 chunk（重算 CRC）即恢复静态 PNG**（修复脚本思路见
   `assets/cursor-images/README.md`）。
8. **透明 PNG 上传**：先 `Image` 解码预检（坏文件明确报错而非静默隐形）；可解码则自动裁透明边
   （alpha>8 包围盒+1px）；全透明给出提示。
9. **循环顺序**：自动切换从"当前生效皮肤"匹配预设前进一格（accent/text/图片全等），
   勿用与显示脱钩的整数索引（会折返/跳变）。
10. **本沙箱网络**：`github.com` git 协议**不通**（clone/push 超时）；HTTP 端点
    （registry.npmjs.org / codeload.github.com / raw.githubusercontent.com / api.github.com）
    通但**偶发不稳**，失败即重试。装 GitHub 插件用 codeload tarball + 本地路径 add；
    推仓库用 **GitHub Git Data API**（blob→tree→commit→ref，先建引导提交）。

## 5. 调试方法

- 查客户端清单/rev：`curl -s 127.0.0.1:3080/ | grep -o '"id":"dsh-cursor"[^}]*}'`
- 语法：`node --check <file>`
- 图片处理：python3 + Pillow（已装）
- 上传文件位置：`ls -lt /root/.dsh/dsh-cursor-images-*.b64`
- 进程：`ps aux | grep "dsh --profile web"`
- 服务日志：`journalctl -u dsh.service -n 50`

## 6. 未竟事项 / 候选方向

- [x] 用 vision-exp 实测多模态——**已完成**（本会话 read_image 读图成功，模型切换/默认均生效）
- [ ] dsh-skin 的 persist 修复值得提**上游 PR**（wei-806206088/dsh-skin）
- [ ] dsh-cursor 扩展：更多效果/预设/与 dsh-skin 面板合并的选项（待用户需求）
- [ ] 模型切换后图片类任务可对话完成，`docs/DEPLOY.md` 与仓库流程可据此再简化（可选）

## 7. 文档地图

| 文件 | 内容 |
|---|---|
| `docs/DEPLOY.md` | **新机器部署指南**（一键/手动/nginx/验收/FAQ） |
| `README.md` | 仓库总览与功能速览 |
| `skill/dsh-appearance-personalization-skill.md` | DSH 外观实战 Skill（机制+全部踩坑） |
| `skill/cursor-effects-skill.md` | 光标三件套通用 Skill |
| `dsh-workspace/docs/` | architecture（DSH 机制）/ plugin-development / appearance（完整过程与修复记录） |
| `assets/cursor-images/README.md` | APNG 修复案例与脚本思路 |
| `assets/theme-wallpapers/` | 三套主题壁纸（fulilian/Violet/lxhzj） |
| `dsh-workspace/state-snapshots/` | 可恢复快照：光标预设+关联、主题预设摘要 |
| `docs/nginx-dsh.conf` | nginx 站点配置参考（含 256m 请求体上限修复） |
| `docs/GIT-PUSH.md` | **推送仓库内容指南**（双通道 push、全局 git 配置、换机复现、排错表） |
| `cursor-components/` | 可移植 React 三件套 |
| `vendor/` | dsh-skin（修复后）、dsh-cursor（可部署成品） |

**接手第一步建议**：读 `docs/DEPLOY.md` + `skill/dsh-appearance-personalization-skill.md`，
再 `curl 127.0.0.1:3080/` 确认插件在线，然后按 §6 未竟事项逐个推进。

## 8. 维护约定

- **本文档是事实来源**：任何改动（插件/配置/模型/踩坑/未竟事项）都要同步到这里，随 `git commit` 推送。
- 若后续会话很长导致上下文溢出：新接手者先读本文档 + §7 文献地图，不要依赖旧对话记录。
- 模型/会话现状以本文件 §3 与 `settings.yaml` 为准；不确定时可 `curl 127.0.0.1:3080/` 或用 read_image 自测。

### 8.1 推送与同步命令（两条命令覆盖全部日常维护）

```bash
# ① 把"个性化"三处来源收进仓库（开发区 / 线上插件 / 运行态）
bash scripts/sync-personalization.sh          # 加 --check 只体检不写入
# ② 提交并推送（自动双通道，git 不通时回退 GitHub API）
git sync "本次改了什么"
```

- `sync-personalization.sh` 解决的是**副本陈旧**这个历史顽疾（曾两次导致仓库里的插件代码落后于线上：
  别人照 `vendor/` 部署会缺 `/api/dsh-cursor-state` 路由，光标配置根本存不下来）。
  它同时校验开发区源码与线上是否一致，不一致会点名文件并要求"先把开发区改动同步到线上再入库"。
- 壁纸与状态快照由 `scripts/export-skin-snapshot.py` 自动生成（壁纸从运行态的 base64 解码，摘要去掉图片数据），
  不要手写这两个文件；重跑后应与 `git status` 一致（幂等）。
- `docs/GIT-PUSH.md` 记录了双通道推送的全部配置与排错表（换机器按 §3 复现）。

