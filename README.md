# Harness — DSH 外观个性化合集

DeepSeek Harness（DSH）Web GUI 的外观个性化仓库：**主题皮肤 + 光标美化三件套 +
一键部署 + Skill 沉淀**。

## 快速开始（5 分钟）

```sh
git clone <本仓库> && cd Harness
./install.sh web          # 一键装 dsh-skin + dsh-cursor
systemctl restart dsh.service   # 或按你的方式重启 web profile
```

> 公网经 nginx 的机器记得看 [docs/DEPLOY.md](./docs/DEPLOY.md) 第 4 节（1MB 请求体上限的坑）。

## 内容

| 目录 | 说明 |
|---|---|
| [**docs/README.md**](./docs/README.md) | **📖 文档地图：先看这一页** —— 按"我想干什么"找文档；含各条线的划分、已知缺口、维护规则 |
| [docs/DEPLOY.md](./docs/DEPLOY.md) | **部署指南：别人照读即可复刻全套**（一键/手动/验收/FAQ） |
| [docs/HANDOFF.md](./docs/HANDOFF.md) | **交接文档：让没有上下文的模型/人直接接手本项目**（环境/踩坑/调试/未竟事项） |
| [docs/GIT-PUSH.md](./docs/GIT-PUSH.md) | **推送指南：任何新对话/新机器照读即可 push**（双通道 `git sync`、全局配置、排错表） |
| [agents/](./agents/README.md) | **让其他对话自动读到约定**：三层 AGENTS.md 部署源（推送方式、仓库规矩、环境事实） |
| `profiles/settings.example.yaml` | settings 模板：默认模型 + 模型目录/UI 标签（热加载，无需重启） |
| `install.sh` | 一键部署脚本（幂等、带备份） |
| `scripts/git-push.sh` | 推送工具：先标准 `git push`，失败自动回退 GitHub API（内容寻址增量）。全局别名 `git sync` |
| `scripts/sync-personalization.sh` | 个性化内容同步：开发区/线上插件/运行态 → 仓库，根治"副本陈旧"（`--check` 只体检） |
| `scripts/export-skin-snapshot.py` | 从 dsh-skin 运行态解码壁纸 + 生成主题预设摘要（快照自动生成，勿手写） |
| `vendor/dsh-skin/` | 主题皮肤插件：极简浅/深、主色/文字色、图片/GIF/视频换肤、命名预设、**自动切换 + 三段式平滑过渡**（含本地修复最终版） |
| `vendor/dsh-cursor/` | 光标插件：图片光标（上传/URL、自动裁透明边、自适应描边）+ 鼠标拖尾 + 点击波纹 |
| `assets/cursor-images/` | 光标素材：魔杖特写、用户自制的罗小黑/紫罗兰光标、APNG 修复示例 |
| `assets/theme-wallpapers/` | 三套主题壁纸（fulilian 青绿 / Violet 紫 / lxhzj 暖琥珀） |
| `dsh-workspace/state-snapshots/` | 可恢复的配置快照：光标预设+主题关联、主题预设摘要 |
| `docs/nginx-dsh.conf` | nginx 站点配置参考（含 `client_max_body_size 256m` 关键修复） |
| `cursor-components/` | 三件套 React 组件（CustomCursor / CursorTrail / ClickRipple），可移植到任意项目 |
| `skill/` | Skill 文档：光标效果三件套 + DSH 外观个性化实战经验（含所有踩坑） |
| `dsh-workspace/` | 开发工作区：DSH 机制文档、插件源码、bundles/patches 模板、脚本 |

## ⚠️ 升级注意（**2026-10-10 之前拿过本仓库插件的，请重拉一次**）

DSH **0.2** 改了内部 CSS-module 的 class 名，而**旧版插件里写死的是 0.1.5 的名字**。
后果：**插件显示在线，但壁纸/气泡不生效，而且不报错** —— 属于最难查的那类问题。

| 槽位 | 0.1.5 的 class | 0.2 的 class |
|---|---|---|
| 输出列 | `.EvIC1a_column` | `.Md3f7G_column` |
| 气泡 | `.Sixlwa_bubble` | `.gdEzaW_bubble` |
| 视频气泡目标 | `.Sixlwa_bubble` | `.gdEzaW_bubble` |

**要做什么：重新拉取最新版即可，不用改代码。**
现版把**新旧 class 名并列**写在选择器里（见 `vendor/dsh-skin/lib/client.js` 的 `SLOT_SELECTORS`），
**0.1.5 与 0.2 都通吃**。（`wallpaper` / `sidebar` / `chat` / `input` 四个槽位 0.2 没变，不受影响。）

拉完记得**硬刷新浏览器** —— 客户端 bundle 带内容哈希且是 immutable 缓存，不硬刷看不到变化。

> 若你同时**把 DSH 从 0.1.5 升到 0.2**，还有两件事要一起办（详见 `docs/WINDOWS-LOCAL.md`）：
> 0.2 首次启动会把 `$DSH_HOME/settings.yaml` 导入并改名、把 `$DSH_HOME/skills` 转成 Junction。
> 稳妥做法是**新建一个 profile**（本机用 `web2`）而不是就地改老 profile —— 老 profile 一字不动，随时可回退。

## 功能速览

- **dsh-skin**：5 槽位图片/GIF/视频换肤（各自独立不透明度）、命名预设持久化、
  自动切换（1min~自定义）+ 遮罩三段式过渡（淡出→无→淡入，全程可交互）
- **dsh-cursor**：图片光标（悬停放大、离窗隐藏、输入框保留 I-beam、深浅主题自适应描边）、
  拖尾与波纹均为时间驱动（easeOutCubic），三件互不依赖可任意组合

## 亮点技术（详见 skill/）

- 客户端插件协议 `__ModuleLoader__.load` 外壳（缺了整页加载失败）
- 过渡最终方案：遮罩三段式 + Web Animations API（绕开 View Transitions 冻结 / cross-fade 级联问题）
- 服务器文件上传 + 魔数嗅探 MIME；APNG 损坏修复（剥离 acTL/fcTL）

## 许可与致谢

- `vendor/dsh-skin` 上游为 [wei-806206088/dsh-skin](https://github.com/wei-806206088/dsh-skin)（MIT），本仓库含本地修复与新增功能
- `cursor-components` 整理自个人项目通用组件
