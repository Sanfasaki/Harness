# Harness 外观个性化 · 交接文档（HANDOFF）

> **给接手者的信**：你没有本项目的对话上下文也能凭本文档接手。
> 目的：DeepSeek Harness（DSH）Web GUI 的外观个性化工作（主题皮肤 + 光标美化），
> 全部代码、修复、部署方式、踩坑与未竟事项都在这里 + 下方指向的文件里。
> 仓库：https://github.com/Sanfasaki/Harness ｜ 本地源码：`/Sanfasaki/dsh-workspace`

**最近更新（2026-09-02）**：默认模型已切 `deepseek-v4-flash-vision-exp` 并**已在本会话实测通过**
（read_image 读图成功，会话与默认配置均为 vision-exp）；本文档为"当前唯一事实来源"，
后续须随每次变更实时同步（见 §8 维护约定）。

---

## 0. 一句话现状

DSH `web` profile 已装 **dsh-skin**（主题皮肤：换肤/预设/自动切换/三段式平滑过渡，含本地修复）与
**dsh-cursor**（图片光标 + 拖尾 + 点击波纹 + 服务器图片上传），已推送到
`github.com/Sanfasaki/Harness`；默认模型已切 `deepseek-v4-flash-vision-exp`（新会话生效）。

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
  **自适应描边**（浅色深影/深色浅辉，MutationObserver 实时）
- 拖尾 + 点击波纹：时间驱动（createdAt+duration+easeOutCubic），16ms 节流、上限 12、过期销毁
- 宿主路由 `/api/dsh-cursor-image`：POST（base64 JSON→存 `$DSH_HOME` 根 `dsh-cursor-images-*.b64`，
  fs 服务无二进制写能力故存 base64 文本）；GET 按**魔数嗅探** MIME（扩展名不可信）

## 3. 模型与会话

- `/root/.dsh/settings.yaml` → `agent-default-model.model = deepseek-v4-flash-vision-exp`
  （**已生效并经会话实测**：本会话经 UI 右下角下拉框切到 vision-exp，`read_image` 读图成功；
  默认配置也已设为 vision-exp，新会话同样生效）。备份：`settings.yaml.bak-vision`。
- 模型目录已内置 vision-exp（`dsh-llm-deepseek` 的 DEFAULT_MODELS，含 `image` 输入能力），
  UI 模型选择器（右下角下拉框）可直接选；价格与 v4-flash 相同（图 ≤384 token）。
- **多模态已解锁**：对话附件通道不再被模型能力限制；图片类任务（看素材/校对/做光标图）可对话完成。
  此前为绕行"不能传图"而做的 dsh-cursor **服务器图片上传仍保留、不冲突**（须保留：插件自身功能）。

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
| `cursor-components/` | 可移植 React 三件套 |
| `vendor/` | dsh-skin（修复后）、dsh-cursor（可部署成品） |

**接手第一步建议**：读 `docs/DEPLOY.md` + `skill/dsh-appearance-personalization-skill.md`，
再 `curl 127.0.0.1:3080/` 确认插件在线，然后按 §6 未竟事项逐个推进。

## 8. 维护约定

- **本文档是事实来源**：任何改动（插件/配置/模型/踩坑/未竟事项）都要同步到这里，随 `git commit` 推送。
- 若后续会话很长导致上下文溢出：新接手者先读本文档 + §7 文献地图，不要依赖旧对话记录。
- 模型/会话现状以本文件 §3 与 `settings.yaml` 为准；不确定时可 `curl 127.0.0.1:3080/` 或用 read_image 自测。
