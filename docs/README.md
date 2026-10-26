# 文档地图（先看这一页）

> 本仓库是个人 DSH 环境合集。文档多了会"不知道哪里在哪里"，所以**这一页是索引**：
> 按"我想干什么"找该读哪篇。**新增文档必须在本页登记。**

---

## 一、这里有哪些条线

| 线 | 是什么 | 状态 |
|---|---|---|
| ① **DSH 版本升级** | 本机 DSH 从 `0.1.5` → `0.2.0-rc.2`，新建 profile `web2`；`settings.yaml` 被导入、`skills` 变 Junction | 已完成（2026-10-10） |
| ② **外观个性化** | `dsh-skin` / `dsh-cursor` 两个客户端插件，及其对 0.2 的适配 | 持续 |
| ③ **两个新能力：computer-use / browser-use** | 让 DSH 能操作本机桌面与浏览器 | 已装上；**使用知识待整理** ⚠️ |
| ④ **企微 ⇄ DSH 远程桥** | 用手机企微远程指挥本机 DSH（含 Unity MCP 接入） | 已可用（2026-10-13） |
| ⑤ **工程设施** | 推送双通道、混用机 git 身份约定 | 已完成 |
| ⑥ **网易云音乐接入** | `music/`：18 个 MCP 工具 + 卡片 + 歌词/播放控制 + **音量/专辑封面**；两个本地服务 `:3456`(MCP) / `:3457`(GUI 桥)，由 `keepalive.py` 守护 | 已可用（2026-10-26） |

> **①③④ 是同一条能力线的接力**：①③ 是 2026-10-10 的"装上 + 适配"；
> ④ 是 10-12/13 的拓展（补齐 computer-use 的元素句柄 → 远程化 → 成本可控 → 可控化）。
> 顺着这个顺序读，每篇文档的存在理由才不显得莫名其妙。

---

## 二、按"我想干什么"找

| 我想…… | 读这篇 |
|---|---|
| **搞清楚文档都在哪** | 就是本页 |
| 把 DSH 部署到一台新机器 | `docs/DEPLOY.md` |
| 看**本机（Windows）**的布局、启动、回退 | `docs/WINDOWS-LOCAL.md` |
| **用 computer-use / browser-use 去操作桌面或网页** | ⚠️ **暂无专章** —— 见 §三缺口 1 |
| 改皮肤 / 光标 / 主题壁纸 | `README.md`（**含升级注意**）、`dsh-workspace/docs/appearance.md`、`skill/dsh-appearance-personalization-skill.md` |
| **写 / 改 DSH 插件或 patch** | `dsh-workspace/docs/architecture.md`（分层 / bundle / **patch 的两个静默坑**）、`dsh-workspace/docs/plugin-development.md` |
| **用企微远程指挥 DSH** | `docs/WECOM-BRIDGE.md` |
| **让 DSH 查/放我的网易云** | `music/README.md`（含平台边界、cookie 取法、**8 个已知坑**、非 Windows 的 MPRIS 适配点） |
| 往仓库推东西 / 换机器配凭据 | `docs/GIT-PUSH.md`（含 **§2.1 混用机身份约定**） |
| 看整体现状与"上次做到哪" | `docs/HANDOFF.md`（**事实来源**） |

---

## 三、已知缺口（待整理）

### 1. computer-use / browser-use 没有专章 ⚠️

安装步骤在 `docs/WINDOWS-LOCAL.md` §3；但**"怎么用才对"目前散落在 `docs/WECOM-BRIDGE.md` 里**（位置不对：那是桥的文档）。涉及：

| 知识点 | 现在写在哪 | 关键结论 |
|---|---|---|
| **元素句柄 / `tools.mode: both`** | `WECOM-BRIDGE.md` §3.2 | 不升 `both`，computer-use 拿不到 `element_token`/`snapshot_id`（只在 `structuredContent` 里，而 MCP 渲染层只取文本）→ **只能退化成坐标点击** |
| **截图能力的真实边界** | `WECOM-BRIDGE.md` §3.6 / §5 | **窗口级抓图对 GPU 自绘窗口返回空白**（Unity/WPS 实测）→ 要用桌面级；或让它在应用内部截图落盘 |
| **真实输入需要前台** | `WECOM-BRIDGE.md` §3.5 | 普通消息投递送不进 Unity 这类应用，要 `foreground`（会**抢前台焦点**） |
| **UI 元素树对 IMGUI 是空的** | `WECOM-BRIDGE.md` §3.5 | 元素级自动化对自绘界面不可用 |

**计划**：抽出 `docs/COMPUTER-USE.md`（装 → 用 → 边界），从桥文档移走并留指针。
**在那之前，先查 `docs/WECOM-BRIDGE.md` 的 §3.2 / §3.5 / §3.6。**

### 2. `docs/HANDOFF.md`（约 37KB）什么都装

它应该只做"事实来源 + 指针"，细节指向各专章。目前与 `WINDOWS-LOCAL.md`、`WECOM-BRIDGE.md` 有重叠。

### 3. `dsh-workspace/docs/` 与 `docs/` 的分工未写明

`docs/` = 部署与使用；`dsh-workspace/docs/` = 机制与开发。**新内容常放错地方**（本页 §三.1 就是这么来的）。

---

## 四、维护规则

1. **事实来源是 `docs/HANDOFF.md`** —— 任何改动都要同步它。
2. **新增文档必须在本页 §二 登记**，否则又会变成"不知道哪里在哪里"。
3. **一条线一个家**：细节写专章，**别塞进别人的文档**。
4. 判断新内容该去哪：先问"**是哪个能力/哪条线的事**"，而不是"**我是从哪个入口改的**"
   （§三.1 的教训：从"桥的 profile 补丁"入口写的 computer-use 知识，被放进了桥文档）。
