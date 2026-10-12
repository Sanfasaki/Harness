# 企微 ⇄ DSH 远程桥 · 复现与整体说明

> **这是什么**：用手机上的企业微信，远程指挥本机电脑上的 DSH 干活 ——
> 对话、派长任务、看实时进度、中途终止、必要时切换到能看图的模型、以及操作本机的应用（含 Unity）。
>
> **属于哪条线**：本机 **DSH 0.2** 带来的 **computer-use / browser-use** 能力线的**第二棒（远程化）**。
> 第一棒（升级到 0.2、挂上这两个能力、美化插件适配）见 `docs/WINDOWS-LOCAL.md` 与 `docs/HANDOFF.md`。
>
> **本文给谁看**：要**部署 / 复现 / 排障**这个桥的人。
> **不含推导史** —— 每一次转变的原因、试错过程、失败记录在本地知识库（见 §7）。

---

## 1. 它能干什么（整体说明）

| 能力 | 在企微里怎么用 | 依赖 |
|---|---|---|
| 带记忆的对话 | 直接发消息 | DSH 会话（`session/resume` 续接） |
| 派长任务 | 发一句话描述任务 | DSH + profile 里挂的工具 |
| **实时看进度** | 自动推：每做一个动作发一条（工具名 + 参数摘要 + 耗时 / 报错） | 事件驱动进度，见 §3.3 |
| 中途询问 | 跑到 150 秒自动问"继续还是终止"，**不回复就继续跑** | `/extend`、`/stop` |
| 优雅终止 | `/stop` | `session/cancel`（**是通知，不是请求**），只停当前轮，**上下文保留** |
| **免费↔付费模型切换** | `/model` 看列表；需要看图时它会主动上报，**180 秒没回复就自动切**到能读图的付费模型；看完自动切回免费 | 两条触发路，见 §3.4 |
| **操作本机 Unity** | 直接说"在原点建个 Cube 并加 Rigidbody" | 可选挂载 48 个 `mcp__unity__*` 工具，见 §3.5 |
| 开关 Unity 工具 | `/unity` / `/unity on` / `/unity off` | 省 token：不用 Unity 时关掉 |
| 收文件／图片 | 直接发给 bot（**图片需先切到能读图的模型**） | 见 §6 已知限制 |

**它是什么**：一个**企微客户端**，把企微消息转成 DSH 的 ACP 调用，把 DSH 的更新流转成企微消息。
**它不是什么**：不是 MCP server；它让 DSH 暴露能力，但不替 DSH 做决策。

---

## 2. 前置条件（先逐项核对）

| 项 | 要求 | 怎么验 |
|---|---|---|
| DSH | **0.2.x**（本机用 `0.2.0-rc.2`，独立安装，非全局 npm） | `node <bin.js> --version` |
| profile | 一个专用 profile（本机用 **`acp`**），不要与 GUI 那个共用 | `ls $DSH_HOME/profiles` |
| Python | 3.10+（本机 `C:\Python312`） | `python --version` |
| Node | 有即可（跑 DSH 本体） | `node --version` |
| 企微 | **智能机器人 + 长连接模式**（不是回调 URL 模式），拿到 BotID / secret | 见 `WECOM_PUSH_NOTIFIER.md` §2 |
| **网络** | **本机必须直连**，不能用 `HTTP_PROXY`/`NO_PROXY` 环境变量 | 见 §5 第 1 条 —— 这条不稳会**空转数分钟** |

---

## 3. 复现步骤

### 3.1 落文件

| 文件 | 作用 |
|---|---|
| `acp_client.py` | ACP 协议层。**关键**：`create_subprocess_exec(..., limit=64MiB)` —— 默认 64KiB 单行上限会被图片帧撑爆 |
| `wecom_acp_bridge.py` | 桥主体：进度、询问、模型切换、Unity 开关、权限处理 |
| `runs/.wecom_bot`、`runs/.wecom_userid` | 企微凭据与你的 userid（见 `WECOM_PUSH_NOTIFIER.md`） |

### 3.2 profile 补丁（`$DSH_HOME/profiles/acp/cordis.patch.yml`）

**改 patch 前必读**：顶层条目只有三种合法形式 —— **① `id` 定位覆盖 ② `disabled` ③ `insert` 列表**。
**新增一行必须放进 `- insert:`**；直接写 `id` + `name` 会被当成"覆盖一个不存在的行"而**静默忽略**
（不报错、日志干净、只是那些工具根本不存在）。覆盖已有行时**不要写 `name`**。

需要的内容（顺序有讲究：先 insert 出新行，后面的覆盖才能定位到它）：

```yaml
# ① 工具呈现模式：MCP 工具的 structuredContent 默认会被丢，只剩文本。
#    开 both 后可用 run_code 读绑定的原始值（computer-use 的元素句柄等只能这样拿到）。
- id: tools
  config: { mode: both }

# ② 新增节点：UI 操作两个能力
- insert:
    - { id: computer-use, name: '@deepseek-ai/dsh-computer-use' }
    - { id: computer-use-cua-driver-native, name: '@deepseek-ai/dsh-experimental-computer-use-cua-driver-native' }
    - { id: browser-use, name: '@deepseek-ai/dsh-browser-use' }
    - { id: browser-use-playwright-mcp, name: '@deepseek-ai/dsh-experimental-browser-use-playwright-mcp' }

# ③ ACP 会话用哪个模型（**`agent-default-model` 对 ACP 无效，必须覆盖 `acp` 这一行**）
- id: acp
  config: { provider: <provider>, model: <免费模型> }

# ④ Unity MCP（可选；不做 Unity 就别加，48 个工具会占 context）
- insert:
    - id: mcp-unity
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: unity
        transport: stdio
        command: '<uvx 绝对路径>'
        args: ['--from', 'mcpforunityserver==<版本>', 'mcp-for-unity', '--transport', 'stdio']
        cwd: '<Unity 项目目录>'
        env: { DISABLE_TELEMETRY: '1', HTTP_PROXY: '', HTTPS_PROXY: '', NO_PROXY: '' }
        toolCallTimeoutMs: 120000
# 开关行（必须排在 insert 之后）
- id: mcp-unity
  disabled: !!js process.env.DSH_UNITY_MCP === '0'

# ⑤ 把"什么时候该切模型"的约定注入 system prompt（见 §3.4）
- id: system-prompt
  config:
    personaPrefix: |
      ……（内容见 §3.4）
```

**验配置**：`node <bin.js> --profile acp --dump-config`
它打印**组合后的最终条目表**，并逐行标注**被哪个文件打过补丁**。

### 3.3 进度为什么用普通消息（不是流式）

**企微对一条流式消息有硬限制：创建后 10 分钟内可更新，超时报 `errcode=846608` 直接拒收。**
长任务必然踩到（实测一次 22 分钟任务：前 10 分钟 156 帧成功，之后 151 帧全被拒）。
⇒ **进度一律用普通消息**（每次都是一个新消息，必定可见），并且：

- **变化就发**：工具开始、工具结束（带耗时）、产出一段文本
- **静默超时才补心跳**（默认 60 秒），且区分"长工具仍在跑"与"没有工具在跑（可能在思考）"
- 到 150 秒的询问**并入下一条**，不额外刷屏

### 3.4 模型切换：两个方向的安全要求不同

**核心事实**：默认的免费模型**不能读图**（`read_image` 会报
`does not declare image input`）；只有具备视觉的付费模型能看屏幕与截图。

| 方向 | 做法 |
|---|---|
| 免费 → **付费**（开始花钱） | **上报 + 等你同意；180 秒没回复就自动切**，并明确告诉你已切到付费 |
| 付费 → **免费**（停止花钱） | **自动切回，不打扰你** |

**两条触发路**（主 + 兜底，所以不依赖模型自觉）：
1. **主**：在 system prompt 里注入约定，让它需要看图时在回复最后一行写 `[NEED-VISION: …]`、
   判断剩余工作不需要看图时写 `[HANDOFF-BACK: …]`
2. **兜底**：直接监听工具失败里那句 `does not declare image input`

**效率提醒**：每次切换模型都会作废该模型的提示缓存、下一次要全量重读上下文。
所以策略上鼓励"**先把不需要看的活干完，攒成一批再切过去一次做完**"，而不是遇到一步就切。

### 3.5 操作 Unity（可选挂载）

**隔离原理（结构性，不靠规则）**：Unity 侧插件是**主动连出去**的（编辑器监听端口，服务端扫描发现）。
**只把插件装进你的个人项目，其它项目根本没装 → 服务端永远看不到它们。**
验收方法就是问服务端它看到了哪些实例：

```
读 mcpforunity://instances →
{"instance_count": 1, "instances": [{"path": ".../<你的项目>/Assets", "port": 6400, ...}]}
```

**接线要点**：
- Unity 包与 PyPI 服务端**版本要对齐**（C# 包 `#vX.Y.Z` ↔ `mcpforunityserver==X.Y.Z`）
- 装法：Unity 包管理器 → Add from git URL → `<仓库>.git?path=/MCPForUnity#<tag>`
- **首次要在 Unity 的插件窗口里点一次 Start**（`connection-toggle`，可能在折叠线下方需要滚动）；
  之后它靠 `ResumeStdioAfterReload` 自恢复，重启 Unity 也不用再点

**操作边界**（实测）：

| 事实 | 后果 |
|---|---|
| MCP 的 48 个工具全是结构化操作（建物件/改组件/跑测试/打包…），**但没有截图工具** | 要"看"得走 §3.6 |
| **UI 元素树对 IMGUI 应用是空的**；窗口级抓图对 GPU 自绘窗口返回空白 | 想自动化 GUI，元素级路走不通 |
| 真实键盘鼠标要 `delivery_mode: foreground`（会抢前台焦点），PostMessage 送不进 Unity | 远程点界面很别扭、且可能被系统拒绝 |

### 3.6 让 DSH"看"到画面

因为 MCP 不产图、GUI 抓图受限，**最便宜的路是让它在编辑器里截图落盘，再让能读图的模型看图**：

```
execute_code("ScreenCapture.CaptureScreenshot(\"<路径>.png\")")   ← 任意 C#，Unity 侧
  → read_image("<路径>.png")                                      ← 需要能读图的模型（见 §3.4）
```

好处：不需要抢前台、不需要桌面级抓图。**鼠标键盘操作留给真正必须手动的场合（节点图、拖拽、试玩）。**

### 3.7 启动与停止

```powershell
cd <桥所在目录>
& "<python>" wecom_acp_bridge.py --cwd "<工作目录>"
```
**停止**：杀 **python 进程**（用 job/作业管理只杀包装层，不管用）。
**⚠️ 长任务运行时不要重启桥** —— 会杀掉正在跑的那一轮。

---

## 4. 验收清单

| 检查 | 命令 / 方法 | 期望 |
|---|---|---|
| 配置生效 | `--profile acp --dump-config` | 该有的行都在，且能看到"被哪个文件打过补丁" |
| 桥起来了 | 看桥日志 | `ACP 握手成功` + `企微长连接已建立` + `桥就绪` |
| 续接老会话 | 桥日志 | `已续接会话 sessionId=…` |
| 对话可用 | 企微发"回一个字：好" | 收到回复，末尾带**当前模型 + 是否花钱**的标注 |
| 进度可见 | 企微发一个 1 分钟以上的任务 | 收到多条**普通消息**，内容随动作变化 |
| 终止可用 | 任务中发 `/stop` | 回执 + 结果消息，**上下文不丢**（接着聊还记得） |
| 模型切换 | 发 `/model` | 列出预设并标出当前 |
| Unity 工具（如装了） | 会话里读 `mcpforunity://instances` | 返回实例列表，且**只有你自己的项目** |

---

## 5. 故障对照表（症状 → 处置）

| 症状 | 原因 | 处置 |
|---|---|---|
| **`pip` / `uv` 卡住数分钟、占满单核后失败** | 本机 `HTTP_PROXY`/`NO_PROXY` 环境变量存在但**格式是坏的** | **一律直连**；给子进程显式清空这几个变量。详见 `WINDOWS-LOCAL.md` §8.1 |
| 进度消息一直不刷新 | 用了**流式消息**，超过 10 分钟被企微拒收（`846608`） | 改成**普通消息**推送（§3.3） |
| 会话里**根本没有** `mcp__unity__*` 这类工具，且无任何报错 | 新增行**写在了 patch 顶层**而不是 `- insert:` 里 → 被静默忽略 | 挪进 `insert`（§3.2）；用 `--dump-config` 确认 |
| 覆盖已有行的补丁不生效 | 补丁里**带了 `name`** → 变成名字断言，不匹配就跳过 | 去掉 `name`，只用 `id` |
| 让模型读图，报 `does not declare image input` | 当前是**免费模型**，不能读图 | 切到能读图的付费模型（§3.4）；不看图就继续做别的 |
| 图片/文件收不下来，等 10 秒超时 | 企微文件走腾讯 COS；本机到 `*.myqcloud.com` **不通**（代理分流规则问题，不是被墙） | 见 `WINDOWS-LOCAL.md` §8.2；改分流规则或换网络 |
| Unity 装了插件但服务端说 0 个实例 | 插件窗口里**没有点过 Start**（stdio 桥不自启） | 在 Unity 插件窗口点一次 Start（§3.5） |
| 直接 `git push` 到 GitHub 失败 | 网络间歇；或身份/凭据问题 | 见 `docs/GIT-PUSH.md`（含 Windows 通道与混用机身份约定 §2.1） |
| 桥重启后模型变成付费的 | 模型**跟着会话走**，resume 会把旧模型带回来 | 桥启动时会自动拉回默认；也可 `/model` 手动切 |

---

## 6. 已知限制（不是 bug，是边界）

| 限制 | 说明 |
|---|---|
| 企微流式消息 | **创建后 10 分钟内可更新**，超时拒收 → 长任务进度用普通消息 |
| 企微出站文件 | SDK **没有上传接口**，bot 发不了文件附件 |
| 企微文档下载 | SDK **默认总超时 10 秒**，需要显式放大 |
| 一个 bot 一条长连接 | 同一 bot 不能同时跑两个长连接进程 |
| **文件沙箱** | 写：限制在工作目录内（**进程级**，连子进程都拦）；**读：不受限** |
| 沙箱提权 | 会请求批准；远程没人能批，桥**自动拒绝并通知** |
| 模型能力 | 只有具备视觉的那个付费模型能读图；免费的不能 |
| Unity 界面自动化 | UI 元素树对 IMGUI 是空的；窗口级抓图对 GPU 自绘窗口空白；真实输入会抢前台焦点 |
| Unity MCP 工具数量 | 48 个，常驻会占 context → 用 `/unity off` 关掉 |
| 会话同时只允许一个客户端 | 第二个进程去 resume 同一会话会报错 |

---

## 7. 完整记录在哪

| 想要什么 | 去哪 |
|---|---|
| **每一步为什么这么做、试错与失败记录、完整时间线** | **本地知识库**（桥那一篇的完整版，含"这条能力线的来龙去脉"） |
| 本机部署布局、启动方式、回退 | `docs/WINDOWS-LOCAL.md` |
| DSH 机制（分层 / bundle / patch / 插件） | `dsh-workspace/docs/architecture.md` |
| 推送仓库内容（双通道、Windows 通道、混用机身份约定） | `docs/GIT-PUSH.md` |
| 企微长连接本身的接入（凭证、SDK、坑） | `WECOM_PUSH_NOTIFIER.md`（在本地工作区） |
| 外观个性化与它的 0.2 适配 | `README.md`、`dsh-workspace/docs/appearance.md`、`skill/dsh-appearance-personalization-skill.md` |
