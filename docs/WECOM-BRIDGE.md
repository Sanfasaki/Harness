# ACP ⇄ DSH 桥 · 实战备忘

> 场景：用企微指挥本机 DSH 干活 —— 远程长任务、远程开发、远程操作 GUI 应用（含 Unity）。
> 实现与运行态在本地 `C:\AIPLAY`（物理隔离的兴趣探索区）；**本文只收可复用的部分**，
> 具体机器的一次性事实（凭据位置、端口占用、某个本地路径）留在本地，不进来。
>
> 同源的另一篇是"推送时代"的备忘（`WECOM_PUSH_NOTIFIER.md`，在本地工作区、**不在本仓库**）——
> 那篇讲"把进度推到手机"，本篇讲"用手机指挥 DSH 干活"。两篇互补，结论互不覆盖。
>
> **写法约定**：每条都标了是"**实测**"还是"**推断**"。**推断的部分不要当结论用。**

---

## 0. 一句话架构

```
企微 App ──长连接──> 桥(wecom_acp_bridge.py) ──ACP/stdio JSON-RPC──> DSH(node bin.js --profile acp)
                          │                                              │
                          └── 普通消息回推(进度/询问/结果)                └── 工具:computer-use / browser-use / MCP / run_code
```

桥是**企微客户端**，不是 MCP server。它把企微消息转成 ACP 的 `session/prompt`，把 DSH 的
`session/update` 流转成企微消息。**DSH 侧的一切能力都被继承**（含 MCP 挂载）。

---

## 1. ACP 协议：文档里没写的坑（全部实测）

| # | 坑 | 现象 | 正解 |
|---|---|---|---|
| 1 | `session/new` 的 `mcpServers` **必填** | 报 `-32602` | 传 `[]` |
| 2 | **`session/cancel` 是 notification，不是 request** | 带 id 发 → `"Method not found"` | 不带 id 发；不要等响应 |
| 3 | `set_config_option` 的 value 必须**无空格 JSON** | 模型切不过去 | `json.dumps(..., separators=(",",":"))`；且模型必须在会话 roster 里 |
| 4 | 权限请求是 agent→**client** 的 request | 响应体格式错会被反复追问 | `{"outcome":{"outcome":"selected","optionId":...}}` |
| 5 | **模型清单 = provider 内置目录 + 当前会话模型** | 改 `acp` 行后，原本"可选"的模型**消失了**（`deepseek-v4-flash` 就这么没的） | 想保留就把该行 config 写全 |
| 6 | **会话模型跟着会话走** | `session/resume` 把旧会话的付费模型一起带回来 | 启动时强制拉回默认（`_enforce_default_model`） |
| 7 | **StreamReader 默认 64KiB 上限** | 图片以 base64 塞进 `session/update`，单帧超限 → `readline()` 抛 `LimitOverrunError` → **读取循环死掉、桥静默失联** | `create_subprocess_exec(..., limit=64MiB)`；读取循环里不允许异常逃出 |
| 8 | **ACP 工具结果只给 text 渲染** | `dsh-mcp-client` 的 `render()` 只取 `content` 的 text，**`structuredContent` 被整个丢掉** | 开 `tools.mode: both`，用 `run_code` 读绑定的原始 `value`（PTC 保留 `value: result.value`） |

> 第 8 条的实证：`cua-driver` 的 `element_token` / `snapshot_id` **只存在于 structuredContent**，
> 所以 native 模式下"按元素索引点击"不可用，只能退化成坐标点击。

---

## 2. 企微出站通道：**流式是个陷阱**

### 2.1 硬限制：流式消息 10 分钟就死（实测）

```
errcode=846608
errmsg=stream message update expired (>10 minutes), cannot update
```

一次 22 分钟的长任务：**156 帧成功 + 151 帧失败**（≈ 前 10 分钟成功，之后全被拒）。
⇒ **用"整轮不结算、靠同一 stream id 持续刷新"做进度，在长任务上必然失效** —— 而那正是最需要它的场景。

### 2.2 还有第二层问题：中间帧客户端似乎不重绘

用户实测反馈"进度消息没变过"。所以流式通道对长任务有**两重不可靠**。

### 2.3 结论：进度用**普通消息**

| | 流式 | 普通消息（reply markdown） |
|---|---|---|
| 更新上限 | **10 分钟** | 无 |
| 中间帧可见性 | 疑似不重绘 | 每次都是新消息，必定可见 |
| 用途 | — | 进度 / 询问 / 结果 |

**当前设计（事件驱动，不是固定节拍）**：
- 它每做一步（工具开始 / 工具结束+耗时 / 产出一段文本）就发一条
- 静默超过 `HEARTBEAT_SECONDS`(60s) 补一条状态，且**区分"长工具仍在跑"与"没工具在跑(可能在思考)"**
- 到 `SOFT_ASK_SECONDS`(150s) 的"继续/终止"**并入下一条**，不额外刷屏

### 2.4 其他企微行为

| 项 | 值 | 备注 |
|---|---|---|
| 文档下载 SDK 默认总超时 | **10 秒** | 需显式放大（`DOWNLOAD_TIMEOUT_MS`） |
| 出站文件附件 | **没有** uploadMedia | bot 发不了文件；要传文件得另想办法 |
| 一 bot 一连接 | 是 | 第二个 `session/resume` 会 `Internal error` |
| reply 窗口 | 24 小时 | 超时后只能走主动推送 |

---

## 3. DSH profile / patch：语义与**两个静默坑**

### 3.1 语义（源码级，`dsh-app-boot/lib/index.js`）

```
patch 顶层条目的三种合法形式:
  ① id 定位覆盖   { id, config }              → Object.assign(target, overrides)
  ② disabled      { id, disabled: <bool|!!js> }
  ③ insert 列表   { insert: [...] }            → 追加；带 id 则插进那个 group
匹配不到的 id: **只 warn 后跳过**(不报错)
```

### 3.2 坑一：**新增行必须放进 `insert`**

把 `- id: 新行 / name: 插件名 / config: ...` 直接写在顶层 → 被当成"覆盖一个不存在的行"→
**静默忽略**：无报错、日志干净、DSH 正常启动，**只是那些工具根本不存在**。
症状极难查：模型说"没有这些工具"，而你以为自己配好了。

### 3.3 坑二：覆盖已有行**不要写 `name`**

写了 `name` 会变成**名字断言**，不匹配就静默跳过。定位只用 `id`。

### 3.4 做功能开关的正道：`disabled: !!js <表达式>`

```yaml
- insert:
    - id: mcp-unity
      name: '@deepseek-ai/dsh-mcp-client'
      config: { ... }

# 开关必须排在 insert 之后(补丁按顺序应用,先有行才能改它)
- id: mcp-unity
  disabled: !!js process.env.DSH_UNITY_MCP === '0'
```
官方 schema 对行的 `disabled` 明确写着 *"Boolean or !!js expression"*。
桥的 `/unity on|off` 就是：写状态文件 → 设 `os.environ` → 重建 DSH 子进程。

### 3.5 诊断利器：`--dump-config`

```bash
node .../dsh/lib/bin.js --profile acp --dump-config
```
打印**组合后的最终条目表**，并逐行标注 **"被哪个文件打过补丁"**（`# == 来源, patched by ...`）。
排查"我改了为什么没生效"必用。

### 3.6 文件沙箱（实测，含对照）

`DSH_PERMISSION_MODE`（默认 `workspace-write`）决定模式；文件沙箱以 **`cwd` 为工作区根**。

在真实 ACP 会话里（cwd=`C:\杂项`）测四种越界写入：

| 向量 | 结果 |
|---|---|
| `pwsh` 写工作区外 | ❌ 被拦（`Access to the path ... is denied` + `[sandbox: file access denied under workspace-write mode]`） |
| `write` 工具写工作区外 | ❌ 被拦 |
| **python 子进程**写工作区外 | ❌ 被拦（`PermissionError: [Errno 13]`） |
| 写**工作区内**（对照） | ✅ 成功 |
| **读**工作区外 | ⚠️ **不受限** |

⇒ **写边界是进程级的（连子进程都拦），读没有边界。**
⇒ 沙箱会提供 escalation 通道（`retry with sandbox_permissions + justification`），
远程场景没人能批准，桥**自动拒绝并通知**。

---

## 4. 模型能力与切换（方向不对称）

### 4.1 事实

- 只有 `deepseek-flash`（预设 `ds`）声明 `["text","image"]`；**内部网关的 GLM 与 dspro 都是纯文本**
- 文本模型读图的**确切报错**（兜底检测的锚点）：
  ```
  Error: cannot read "<路径>" as an image: model "glm-5.2"
  does not declare image input; switch to an image-capable model to read images
  ```

### 4.2 策略：**方向不对称**

| 方向 | 花钱 | 风险 | 做法 |
|---|---|---|---|
| glm → **ds** | 开始花用户的钱 | 高 | **上报 + 等同意；超时(180s)自动切**并明确告知 |
| ds → **glm** | 停止花钱 | 极低 | **静默自动切**，不打扰 |

**为什么超时自动切**：这个桥的核心价值就是"人不在电脑前"，纯手动会让任务卡几小时。

### 4.3 两条触发路（主 + 兜底）

- **主**：约定注入 system prompt，它需要在回合末尾写 `[NEED-VISION: 理由]` / `[HANDOFF-BACK: 理由]`
- **兜底**：直接监听工具失败里的 `does not declare image input`（连它想看哪张图都能抽出来）
  ⇒ **即使模型忘了标记也不会卡死**

### 4.4 效率关键：**批量，不要来回切**

**每次切换模型都会作废该模型的提示缓存**，下一次要全量重读上下文（输入 token 全价）。
所以正确节奏是：glm 干完所有不需要看的活 → 把"需要看"的攒成清单 → **一次切进去批量做完** → 切回。

### 4.5 必须防的两个坑

1. **切回 glm 后它看不见 ds 当时看的图** ⇒ ds 交回前必须把**结论**落成文字/文件
2. **卡在付费模型上** ⇒ 需要看门狗（当前 `_enforce_default_model` 只在**桥启动时**拉回一次）

---

## 5. 环境画像：这台机器的网络真相

### 5.1 拓扑

- Clash 类 TUN + **fake-ip**（`198.18.0.0/15`）；应用 `com.vortex.helper`，端口 7890/7891/7892/**7897**
- **`HTTP_PROXY`/`NO_PROXY` 环境变量是坏的**：httpx 报 `InvalidURL: Invalid port ':1]'`
  （`NO_PROXY` 里那个 `[::1]` 搞的）
- ⚠️ **别用代理环境变量，直连即可**（TUN 透明代理）——
  一次 `pip install pypdfium2 --proxy http://127.0.0.1:7897` 空转 5 分钟、满核、最后失败；
  清掉变量后同样的安装 **1.43 秒**完成

### 5.2 通 / 不通（直连实测）

| ✅ 通 | ❌ 不通 |
|---|---|
| github.com / api.github.com / raw.githubusercontent.com / codeload | **`*.myqcloud.com`**（腾讯 COS） |
| pypi.org / registry.npmjs.org / **packages.unity.com** | gameres.com |
| baidu / qyapi.weixin / openws.work.weixin / wwcdn.weixin | |
| wikipedia / zh.wikipedia | |

**COS 不通的机制**：不是"IP 被墙"。三个 COS 域名 DNS 都解析到 `198.18.x.x`（fake-ip），
同段的 `wwcdn.weixin.qq.com` **TLS 正常**、COS **TLS 超时** ⇒ **是代理的分流规则/节点问题**，
理论上改一条规则（`*.myqcloud.com` 走可用节点）就能修好。
**这件事直接决定"企微收到的图片/文件能不能下下来"**。

---

## 6. 诊断工具箱

| 工具 | 用途 |
|---|---|
| `_session_dump.js` | 读 DSH 会话日志（多帧 zstd，按 magic 分帧）。支持 `--name` / `--text` / `--tail N`。**"模型实际收到了什么"的唯一真相源** |
| `dsh --profile X --dump-config` | 看组合后的条目表 + 每行被谁打过补丁 |
| `_test_model_policy.py` | 模型切换策略回归（18 项） |
| `_test_bridge_flow.py` | 桥全链路回归（进度/询问/终止/上下文保留） |
| `_test_sandbox_boundary.py` | 文件沙箱边界实测 |
| `_probe_updates.py` | 打印 ACP 的真实事件流（设计进度策略前必跑） |
| 桌面级 vs 窗口级截图 | **GPU 自绘窗口（Unity/WPS 等）窗口级抓图返回空白** → 必须用桌面级捕获 |

---

## 7. 反向教训（踩过的，别再来一次）

| 教训 | 具体事故 |
|---|---|
| **单实例多窗口应用不能整体杀进程** | Win11 记事本是单进程多标签，我按 pid 杀 → **关掉了用户的文档标签** |
| **Windows 允许同端口重复绑定** | 起 `http.server` 撞上用户已有的本地应用，"绑定成功"但请求都走到对方 → **起本地服务必须先验证返回内容是不是自己的** |
| **测试会覆盖生产状态文件** | 测试新建 ACP 会话 → 覆盖桥正在续接的会话文件 → 桥接回了测试会话。**测试必须备份/还原** |
| **`job_kill` 只杀包装层** | 不杀子进程；杀桥要直接杀 python 进程 |
| **长任务运行时不能重启桥** | 会杀掉正在跑的 DSH 轮次 |
| **别随手过滤日志** | 我用 `Where-Object` 滤掉 `[dsh]` 行 → 把真正的 patch 警告一起滤掉了，白查一轮 |
| **异步 stderr 排空会骗人** | 两轮测试的 stderr 交错输出，我据此误判"开关没生效"（其实生效了） |
| **让模型"列出你的工具"不可靠** | 明明有 48 个，问"以 mcp__unity__ 开头的有哪些"它答"无"。**改用行为探针**（让它真去调一次） |

---

## 8. 文件清单与启动方式

```
C:\AIPLAY\agent\
├── acp_client.py              ACP 客户端（协议层，含 64MiB 单行上限）
├── wecom_acp_bridge.py        桥主体（进度/询问/模型策略/Unity 开关/权限处理）
├── _session_dump.js           会话日志解读（观测工具）
├── _probe_updates.py          ACP 事件流探针
├── _test_bridge_flow.py       桥回归测试
├── _test_model_policy.py      模型切换策略测试
├── _test_sandbox_boundary.py  沙箱边界实测
└── WECOM_PUSH_NOTIFIER.md     "推送"时代备忘（姊妹篇）

C:\Users\30391\.dsh\profiles\acp\cordis.patch.yml    acp profile 的补丁层
```

**启动**：
```powershell
cd C:\AIPLAY\agent
& "C:\Python312\python.exe" wecom_acp_bridge.py --cwd "C:\杂项"
```
**停**：杀 **python 进程**（不是 job）。

---

## 9. Unity MCP：把"操作 Unity"变成文本 API（主通道实例）

> 这一段是"**MCP 为主通道**"最完整的实践样本，也是"远程驱动 GUI 应用"这个母题的答案。
> 结论先行：**computer-use 必要且不可避免，但不是主要通道；MCP 才是主体。**

### 9.1 三件套分工（与用户商定的侧重）

| 通道 | 角色 | 能力 |
|---|---|---|
| **MCP（主）** | 结构化编辑 | 48 个工具：场景/物件/组件/预制体/脚本/资源/材质/动画/UI/VFX/测试/打包/Profiler |
| **截图通路** | 看图 | `execute_code` 调 `ScreenCapture.CaptureScreenshot` → 落盘 → `read_image` |
| **computer-use（必要但非主要）** | 节点图编辑、拖拽、第三方窗口、试玩 | 像素级操作 |

### 9.2 隔离：**安装即隔离**（结构保证，不靠策略）

Unity 侧的插件是**主动连出去**的（编辑器监听端口，服务端扫描发现）。
⇒ **没装插件的编辑器永远不会连上，服务端根本看不到它**。

实测验证方式（也是交接时的验收手段）：
```
读 mcpforunity://instances →
{"instance_count": 1, "instances": [{"path": ".../ProjectX/Assets", "port": 6400, ...}]}
```
**只列出装了插件的那个项目，禁区项目不在列表里** —— 这是可复现的硬证据。
再加两层纵深：`--default-instance` 钉死目标 + 客户端路径白名单（防前缀攻击/软链接/`..`）。

### 9.3 接线要点

```yaml
- insert:                        # ⚠️ 新增行必须进 insert(见 §3.2)
    - id: mcp-unity
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: unity
        transport: stdio
        command: 'C:\Users\<你>\.local\bin\uvx.exe'
        args: ['--from', 'mcpforunityserver==<版本>', 'mcp-for-unity', '--transport', 'stdio']
        cwd: '<Unity 项目目录>'
        env: { DISABLE_TELEMETRY: '1', HTTP_PROXY: '', HTTPS_PROXY: '', NO_PROXY: '' }
        toolCallTimeoutMs: 120000
```
- **版本必须两边对齐**：C# 包 `#vX.Y.Z` ↔ PyPI `mcpforunityserver==X.Y.Z`（缓存目录名是 commit 哈希，别用它判断版本）
- `env` 里清空代理变量：本机代理变量是坏的（见 §5），不清会让 `uv` 卡死

### 9.4 首次启动必须手工一次（然后自愈）

stdio 模式下桥**不会自启**；`ResumeStdioAfterReload` 只在"域重载后恢复"时起作用。
所以要在 Unity 的插件窗口里点一次 **Start**（`connection-toggle`，可能在折叠线下方要滚动）。
启动成功后写 `ResumeStdioAfterReload`，**之后连重启 Unity 都会自动恢复**。

### 9.5 抓图/看图的真实边界（实测）

| 事实 | 后果 |
|---|---|
| **窗口级抓图对 GPU 自绘窗口返回空白**（Unity/WPS 都试过） | 要看它，必须用**桌面级捕获**，且窗口得在前台被渲染 |
| **UIA 对 IMGUI 是假的**（菜单能列出但 `Expand` 报 `0x80040200`） | 元素级自动化基本不可用 → 只能像素操作 |
| **真实输入才行**：PostMessage 送不进 Unity，`delivery_mode: foreground` + SendInput 才行 | 会抢前台焦点；而 `bring_to_front` 有时被 Windows 前台锁拒绝 |
| **MCP 返回的图像 content 会被 `dsh-mcp-client` 丢掉**（只保留 text，见 §1 第 8 条） | 图像必须走 **"落盘 → `read_image`"**，不能指望 MCP 的 image content |

**⇒ 所以"看图"最便宜的路不是 computer-use，而是**：
`execute_code`（任意 C#，可 `ScreenCapture.CaptureScreenshot`）→ 落盘 → `read_image`。
这样不需要抢前台、不需要桌面级捕获。**computer-use 留给真正需要"动手"的场合。**

### 9.6 反例警戒：别把"窄失败"推成"能力限制"

我曾因为"窗口级抓图空白 + UIA 菜单展开失败 + 一次前台激活被拒"，就下了
"Unity 界面无法远程驱动"的结论 —— **被用户当场推翻**。真相是：
**桌面级捕获能完整读到窗口内容**、**SendInput 能开关窗口**。失败的只是三个很窄的路径。
⇒ 见 §7 与 `root-cause-attribution`：**少样本失败 ≠ 能力不存在**。

---

## 附：未做 / 未验证

- **第二层看门狗**：卡在付费模型上时自动拉回（目前只有启动时拉回一次）
- **流式 + 独立消息共存**：未验证（已弃用流式，不再需要）
- **github 作为文件传输通道**：方案已想清（`inbox/`/`outbox/` + Contents API 兜底），未落地；
  三项待定 —— 私有仓库 / PAT 凭据 / 轮询方式
- **COS 分流规则**：改代理规则可能解锁"企微收文件"，属改用户环境，未动
