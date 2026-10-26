# 网易云音乐 × DSH

> **给接手的 AI**：这是一个人自用的 DSH 能力扩展。你在新机器上要做的只有三件事 ——
> 跑 `install.ps1`、填一次 cookie、重启一次 DSH。第 4 节有逐步命令，第 7 节是所有
> 已知失败模式。**不要跳过第 5 节的验证**，这套东西有两类"看起来成功其实没生效"的坑。

三块能力，共用同一份 cookie：

| 给谁的 | 是什么 | 跑在哪 |
|---|---|---|
| **模型** | 18 个 `mcp__netease__*` 工具（搜歌 / 歌单 / 红心 / 听歌记录 / 歌词 / 私人FM…） | `server.py` → `127.0.0.1:3456` |
| **人** | 右下角卡片：今日推荐 / 我的歌单 / 搜歌 | `dsh-netease` 客户端插件 |
| **人** | 右上角：歌词 + 进度条 + 播放/暂停/上一首/下一首 | `bridge.py` → `127.0.0.1:3457` |

---

## 1. 平台边界（先看这个，能省你半天）

| 能力 | Windows | Linux / macOS |
|---|---|---|
| 18 个 MCP 工具 | ✅ | ✅ |
| 卡片（推荐/歌单/搜歌） | ✅ | ✅ |
| 歌词 + 播放控制 | ✅ 走 SMTC | ❌ **不工作**（需要 MPRIS 适配，见 §8） |

「正在播放」读的是 Windows 的 **SMTC（系统媒体会话）**：网易云客户端、Edge/Chrome 里
放的网页版都能被读到。非 Windows 上 `bridge.py` 会把 `/now` 直接回成
`{"playing": false, "reason": "smtc-unsupported"}`，界面自动隐藏那一块，其余功能不受影响。

---

## 2. 前置条件

- Python 3.8+（**只用标准库**，不需要 pip install）
- DSH 已装好，且知道用的是哪个 profile（常见 `web2`）
- 一个网易云账号（推荐黑胶，否则大部分歌放不了，但歌单/歌词照样能读）
- **Windows 10+ 与 PowerShell 5.1** —— 歌词/进度/音量这一段依赖 SMTC 与 Core Audio，只在 Windows 上有
- **网易云桌面客户端**（可选但强烈建议）—— `/open` 靠它注册的 `orpheus://` 协议唤起；
  没装客户端时点歌名会退回网页播放页。网页版播歌同样能被 SMTC 读到
- **Node.js**（只有跑前端冒烟测试 `dsh-netease/test/client-smoke.cjs` 时才需要）

---

## 3. 目录结构

```
music/
├─ install.ps1            ← 一键装（Windows）
├─ start.ps1              ← 前台拉起 server.py（排错用）
├─ server.py              ← MCP 服务（第三方 MIT 项目 + 一处本地修改，见下）
├─ bridge.py              ← 界面数据桥：/now /control /seek /volume /open /playlists /playlist /daily /search /status /health
├─ keepalive.py           ← 守护：每 15 秒探 3456/3457，缺了拉起
├─ sync-plugin.ps1        ← 把 dsh-netease/ 部署进 DSH profile
├─ register-autostart.ps1 / unregister-autostart.ps1
├─ .env.example           ← 复制成 .env 再填 cookie（.env 已被 .gitignore 排除）
├─ call.py                ← 命令行调 MCP 工具，排错用
├─ take_cookies.py        ← 从 Playwright storageState(`auth.json`) 提取 cookie 写 .env（可选）
├─ dsh-netease/           ← 插件本体
│  ├─ package.json        ← dsh.client 声明（platform: web）
│  ├─ lib/client.js       ← 卡片 + 歌词 + 控制（唯一的浏览器代码）
│  ├─ lib/index.js        ← **空的**，宿主侧故意不做事
│  ├─ scripts/
│  │  ├─ smtc.ps1         ← 常驻读 SMTC，写 smtc-state.json
│  │  ├─ smtc-control.ps1 ← 一次性 播放/暂停/上下首/跳转
│  │  └─ volume.ps1       ← 常驻调音量（Core Audio / WASAPI，C# 互操作）
│  └─ test/
│     └─ client-smoke.cjs ← 最小 DOM 桩真实执行 client.js（改前端后必跑）
├─ probe/                 ← 开发期自检脚本（smtc/api/route 探针，非运行依赖）
└─ docs/                  ← 截图
```

**`server.py` 的一处本地修改**（相对上游 `Vael-KY/netease-music-mcp`）：
监听地址从 `0.0.0.0` 改成 `127.0.0.1` —— 原版无鉴权，同局域网任何人可读写你的账号。
改动只在文件末尾 `__main__` 里的一行；需要对外监听时用 `MCP_BIND` 覆盖。
（上游版本锚点：`server.py` 头部 `VERSION = "3.2.1"`。）

---

## 4. 安装

### Windows（推荐）

```powershell
cd music
powershell -ExecutionPolicy Bypass -File install.ps1 -Profile web2
```

脚本会做：检查环境 → 建 `.env` → 部署插件 → 追加两条 cordis 配置 → 装登录自启 →
拉起三个进程 → 打印验证结果。**幂等**，改完插件再跑一次即可。

装完还有两件只能人工做的：

1. **填 cookie**（见 §5）
2. **重启 DSH** —— MCP 那条配置要在启动时建立连接；客户端 bundle 也需要页面重载。
   （若 profile 的 `package.json` 里有 `"patchReload": "live"`，配置可以热加载，但
   **客户端插件新增时仍建议重启一次**，见 §7 坑 2。）

### 手动（Linux 或想自己控制）

```bash
# 1. 部署插件到 profile（用链接而不是复制，改完不用重装）
P=~/.dsh/profiles/web2
mkdir -p "$P/packages"
ln -sfn "$(pwd)/dsh-netease" "$P/packages/dsh-netease"
ln -sfn "$(pwd)/dsh-netease" "$P/node_modules/dsh-netease"   # 需先确保该目录存在

# 2. 在 $P/package.json 的 dependencies 里加 "dsh-netease": "workspace:*"

# 3. 把 install.ps1 里第 4 步那段 YAML 追加到 $P/cordis.patch.yml

# 4. 起服务（Linux 上先设好自启，如 systemd user unit 或 cron @reboot）
python3 server.py &   # 或让 keepalive.py 管
python3 bridge.py &
```

> Linux 上 `keepalive.py` 照样能用（它只是探端口 + `Popen`），但 `smtc.ps1` 不会被调用。

---

## 5. 凭据

`.env` 里的 `NETEASE_COOKIE` 就是账号凭据，**等同密码**：本仓库是公开的，所以它被
`.gitignore` 排除，**任何时候都不要提交**。

取法：

1. 浏览器登录 <https://music.163.com>
2. `F12` → **Network** → 刷新页面
3. 点任意一个 `music.163.com` 的请求 → **Request Headers** → 复制 `Cookie:` 后整串
4. 粘进 `.env` 的 `NETEASE_COOKIE=`（整串，不加引号；`__csrf` 会顺带被解析出来）

`MUSIC_U` 一般能撑几个月。过期症状：卡片显示「未登录」、工具返回 `301` / `-460`。

---

### 点歌与按钮封面（2026-10-23 / 10-26）

| 动作 | 链路 | 说明 |
|---|---|---|
| **点一首歌** | 卡片 → `bridge /open?song=<id>` → 主机侧 `os.startfile("orpheus://song/<id>/?autoplay=1")` | 直接唤起**桌面客户端**播放；`orpheus://` 未注册时才退回网页。**不在浏览器里跳 `orpheus://`**——那样会被拦或弹一次确认框 |
| **正在播放时右下角变专辑封面** | `/now` 返回 `cover` → 前端给 FAB 加 `has-cover` 类 | 停下或没封面就还原成音符图标。封面来自 `/api/song/detail`，**和时长共用一次请求 + 6 小时缓存** |

> **封面怎么保证对（2026-10-26 定稿）**
>
> 关键洞察：**卡片里"我的歌单"那些封面全是对的**，因为它们来自你自己的歌单——
> `playlist/detail` 返回的每首歌自带 `al.picUrl`。所以播放中的歌也照这个思路找：
>
> **三路来源，越靠前越准**（命中即用，不再往下走）：
>
> 1. **我的歌单索引** —— 11 个歌单，实测 175 首，后台建、缓存 6h；
> 2. **播放记录索引** —— `/api/v1/play/record` 是你**实际播放过**的歌，实测 249 首，
>    带准确 id 和封面。这条专治"官方版不在搜索结果里"：
>    `The Love That Binds Us` 播放记录是 `id=548145364`（《Automemories》），
>    而歌名搜索给的是 `1830347873`（别人的翻奏单曲）；
> 3. **歌名搜索** —— 「歌名精确+歌手对」优先，不可信时按歌手再搜一遍，封面照给；
> 4. 三条都没有 → 不显示封面。
>
> 命中前两路时，会把**正确的 songId 写回缓存**，覆盖掉之前搜索得到的错误映射。
> 另外：只有"猜"的搜索结果（confident=False）现在只缓存 **30 分钟**（原来 6 小时），
> 免得一条错映射被锁半天。
>
> **实测**：库索引的封面与弹窗里显示的封面 **31/31 完全一致**（只是 CDN 分片 `p1`/`p2` 不同）；
> 反例对照：`なんでもないや (movie ver.)` 库里是 `id=426881506`（正确），
> 纯搜索会解析成 `id=1488733669`（**另一张封面**）——这就是之前贴错图的那类情况。
>
> 已知遗留：不在你任何歌单里、又搜不到官方版的曲子（如某些 OST），仍可能贴到翻奏版封面。
>
> 第一版：只按歌名取第一条 → 把别人专辑的封面贴在唱片上
> （`The Love That Binds Us / Evan Call` 搜到的全是翻奏版，官方《Automemories》不在结果里）。
>
> 第二版：加"歌名+歌手都对"的门控，不可信就不给封面 → **大量本来正常的曲子直接没封面**
> （`GLASSY SKY / Donna Burke` 这类），反馈更糟。
>
> 现在的做法：
> - 按歌名搜；**歌名精确 + 歌手对** 优先（150 分），只对歌名次之（100 分），只对歌手最低（30 分）
>   ——**只对歌名永远压过只对歌手**，否则会挑到同歌手但不同名的曲子；
> - 没拿到可信候选时，**再按歌手搜一遍**找同名曲（`晴天` 由此找回 `id=186016`《叶惠美》）；
> - 搜索前**清洗标题**（去掉 `(movie ver.)`、`～…～` 这类后缀）；
> - **封面照给**（即使歌手没对上）：多数情况按歌名匹配到的就是同一张专辑，
>   宁可偶尔贴错，也不要整片空着。`matched` 字段仍在返回值里可诊断。
>
> 已知遗留：官方版压根不在该账号搜索索引里时（如 Evan Call 的 OST），仍可能贴到翻奏版封面。
> 彻底解决要拿客户端正在播放的 songId——客户端本地端口 `127.0.0.1:20017` 对未知路径不响应，暂未走通。
### 音量（2026-10-26 重做）

界面上是**一个小喇叭按钮**，点一下从上方弹出**纵向滑轨**——不占地方，也不会像横条那样压住歌词。

后端是**常驻助手**（`volume.ps1 -Action daemon`）：那段 C# 互操作只编译一次，之后

- 它每约 400ms 把当前音量写进 `volume-state.json`
- 每 100ms 看一次 `volume-cmd.json`，`seq` 变大就执行一次 set
- bridge 侧只是读写这两个小文件，**不再起进程**

实测：

| 操作 | 耗时 |
|---|---|
| 首次读（要编译 C#） | 1 095 ms |
| 之后读 | 26 ms |
| 写（`/volume?value=N`） | 3–18 ms |

**为什么不做成"每次调一次脚本"**：一次性调用每次都要 `Add-Type` 重编译那段 C#，
实测 **713 ms/次**，拖动会一顿一顿的。第一版就是栽在这里（另一个问题是漏了
`CREATE_NO_WINDOW`，导致每拖一下闪一次命令行窗）。

---

### 磁盘缓存（2026-10-26 加）

把「歌名→songId」「歌词」「歌手曲库」缓存到 `cache.json`，重启和限流都不必重来。

**安全约束（写死在代码里，不靠自觉）**：

| 风险 | 防护 |
|---|---|
| 写爆磁盘 | 文件**硬上限 2MB**：先按条数裁（songs 800 / lyrics 300 / artists 40），再按字节裁，最后兜底只写最小结构；单条歌词 >40KB 直接不存 |
| 写风暴 / 递归 | 只在**新增条目**后标脏；两次落盘**至少隔 8 秒**；后台刷新线程只读标志位，最大也是 1 次/8 秒 |
| 写失败死循环 | 连续失败 3 次**熔断 10 分钟**，期间完全不尝试 |
| 半写坏文件 | 原子写（`.tmp` + `os.replace`）；坏文件只隔离一次改名 `.bad`，不会反复覆盖 |
| 过期数据 | 启动载入时按 TTL 丢弃（失败条目 60 秒、正常 6 小时） |

**实测**（压测脚本：3000 首 × 12KB 灌进去）：落盘 ≤2MB、歌词裁到 300 条以内、
200 次连续 `touch` 只写 1 次、坏文件正确隔离、静置 30 秒零写入。

手动清空：删 `cache.json` 即可（下次启动自动重建）。

---

## 6. 验证（别跳）

```powershell
# 两个服务都活着？
python -c "import urllib.request;print(urllib.request.urlopen('http://127.0.0.1:3456/health',timeout=5).read())"
python -c "import urllib.request;print(urllib.request.urlopen('http://127.0.0.1:3457/health',timeout=5).read())"
# 期望：3456 -> {"status":"ok","tools":18,...}
#       3457 -> {"ok":true,"smtc":true,"loggedIn":true}

# 账号通不通？（这条最关键）
python call.py daily_recommend

# 改了前端（lib/client.js）之后，先跑这个再刷新页面：
node dsh-netease/test/client-smoke.cjs
# 它用最小 DOM 桩真实执行 bundle，断言"歌词面板可见/标题写入/暂停键打对接口"。
# 退出码 0 才算过。已做变异验证：把"bridge() 包装对象没解包"那个真 bug 注回去，
# 它会 3 项失败、退出码 1 —— 所以不是永远绿的摆设。

# 界面：硬刷新 DSH 页面（Ctrl+Shift+R，客户端 bundle 是 immutable 缓存）
#   - 右下角应出现音符按钮，点开三个标签都能出内容
#   - 放一首歌 → 右上角出现歌词 + 进度条 + 三个按钮
```

**验收不看"有没有报错"，看这三条**：`tools: 18`、`loggedIn: true`、界面上真的有内容。
**改过 `lib/client.js` 就必须加第四条**：`client-smoke.cjs` 退出码 0。

> 为什么非要那个测试：这个插件已经翻过一次车——`bridge()` 返回 `{status, body}`，
> `pollNow` 把整个包装传给了渲染函数，结果面板**永远不显示，控制台一个错都没有**。
> `node --check` 只查语法，真机看现象也容易漏，因为"没显示"和"没在播"长得一模一样。

---

## 7. 排错（按症状查）

### 坑 1：MCP 工具不出现，但 DSH 没有任何报错

`dsh-mcp-client` 对**首次连接失败不重试**；连上后断开的自动重连也只有约 10 次预算。
预算用完之后工具会一直缺失，直到重启 DSH。

- 先确认 `3456/health` 通
- 恢复手段：改一下 `cordis.patch.yml` 里 `mcp-netease` 的任意一个值（比如
  `toolCallTimeoutMs`）触发重挂，或直接重启 DSH
- 根治：`keepalive.py` 必须活着（`install.ps1` 已装登录自启）

### 坑 2：卡片在页面上不出现（但代码没错）

DSH 的 `.gitignore` 有

```gitignore
lib/
!vendor/dsh-skin/lib/
!vendor/dsh-cursor/lib/
!dsh-workspace/plugins/dsh-cursor/lib/
```

**`lib/` 会吞掉任何层级的 lib 目录。** 新插件的 `lib/client.js` 如果不加例外，
会静默不入库 —— 另一台设备拉下来只有 `package.json`，插件永远不生效，而
`git status` 干净得看不出问题。本仓库需要在根 `.gitignore` 增加：

```gitignore
!music/dsh-netease/lib/
```

`sync-plugin.ps1` 里带了一条 `git check-ignore` 检查，被忽略时会警告。

另外两个顺序要求：
- **先让 `node_modules` 能解析到包，再改 `cordis.patch.yml`**。反了的话热加载那一刻
  import 失败，而失败条目不会自动重试。
- 宿主侧 JS（`lib/index.js`）改了**必须重启 DSH**（Node 模块缓存），所以本项目的宿主侧
  故意是空的，数据全在 `bridge.py`。

### 坑 3：右上角一直不出现

按顺序查：

1. `http://127.0.0.1:3457/now` 返回什么？
   - `{"playing": false, "reason": "smtc-unsupported"}` → 不是 Windows，正常
   - `{"playing": false, "reason": "nothing-playing"}` → SMTC 里没有媒体会话，换客户端试试
   - 有 `title` 但界面不显示 → 检查浏览器控制台，通常是 CORS 或页面没硬刷新
2. `node probe/smtc-test.mjs` 能打出 JSON 吗？打不出说明 PowerShell 起不来。
3. **`.ps1` 文件必须是纯 ASCII**：PS 5.1 无 BOM 时按 ANSI 读，中文注释里可能解码出
   `}`，直接让脚本语法错误（本项目踩过）。

### 坑 4：歌词对不上 / 没有歌词

`bridge.py` 用「歌名 + 歌手」在网易云搜索里找 songId，翻唱、live、同名版本会错配。
匹配结果按 `歌名|歌手` 缓存 6 小时；强制重匹配就重启 `bridge.py`。

### 坑 5：按播放/暂停，结果动的是别的应用

SMTC 里很多程序都注册会话（钉钉、Teams…）。暂停音乐后 `GetCurrentSession()` 会退到
钉钉的视频预览。所以 `/control` 会把当前显示的 `app` + `title` 传给
`smtc-control.ps1` 精确匹配 —— 改这段代码时别把这两个参数丢了。

### 坑 6：进度条不动 / 跳来跳去

Edge/Chrome 只在开始和 seek 时上报一次 `Position`，之后一直冻结（一首 3:51 的歌能一直是
`20ms`）。`bridge.py` 的 `Smtc._estimate` 按墙钟推算，**用"上报值本身变了"判断 seek**。
别改成"拿上报值和估算值比大小"，那会把冻结值误判成持续 seek。

### 坑 7：桌面客户端播放时，进度条不填、不显示时间、点不了

**症状**：换成官方桌面客户端（`cloudmusic.exe`）后，歌词正常、进度却一直是 0%，时间不显示，
点进度条也没反应。浏览器里反而是好的。

**真因**：客户端通过 SMTC 上报的 `endMs` **恒为 0**（浏览器才有值）。而前端
`client.js` 是 `if (!lastNow.endMs) return;` —— 没有总时长就直接不画。

**修法**：`bridge.py` 的 `/now` 在 `endMs` 缺失时用歌曲详情接口补
（`duration_for()`，按 songId 缓存 6 小时）。

**一个接口坑**：`/api/song/detail?ids=[…]` 返回的时长字段叫 **`duration`**，
只有 `/api/v3/song/detail?c=[{…}]` 才叫 **`dt`** —— 代码里两个都取，别只认一个。

**顺带一个结论**：客户端音质比网页版好，SMTC 照样能被读到，所以**不需要为了这套界面去用网页版**。
`positionMs` 换成客户端后依然冻结在 0，但估算器照旧管用，那部分不用改。

### 坑 8：突然所有歌词/封面都空了，接口返回 `code=405`

**症状**：`/now` 能出歌名，但 `lines: []`、没有 `cover`；`matched: false`。

**真因**：短时间密集请求触发了网易云的限流（`code=405`）。这类调试很容易撞上——
每改一次匹配逻辑就会打好几次搜索接口。

**处理**：
- `upstream()` 现在命中 405 会自动**冷静 5 分钟**（否则 `/now` 每秒轮询会把限流一直续着）；
- 失败结果只缓存 **60 秒**（正常结果缓存 6 小时），所以限流一解除会自己恢复，不会锁半天；
- 期间界面保持音符图标 + 无歌词，不报错。

**读日志注意**：`Get-Content bridge.log` 在 PS 5.1 下默认按 ANSI 解码，
中文会显示成乱码；要看清楚用 `Get-Content bridge.log -Encoding utf8`。

---

## 8. 非 Windows 怎么办（歌词部分）

把 `Smtc` 类换成一个走 MPRIS 的实现，其余代码不用动。大致：

```bash
playerctl metadata --format '{{title}}|{{artist}}|{{status}}|{{position}}|{{mpris:length}}'
playerctl play-pause | next | previous
playerctl position <seconds>
```

要点：
- `position` 单位是**微秒**，`mpris:length` 也是；换成本项目的毫秒。
- 每次查询拿到的 position 是实时值，比 SMTC 可靠，可以不用估算器。
- 控制命令要锁定 `--player=<name>`，同 Windows 那个"别打到别人身上"的道理。

---

## 9. 卸载

```powershell
powershell -File unregister-autostart.ps1
# 然后从 profile 里删两处：
#   cordis.patch.yml 里带 netease 的两段
#   packages\dsh-netease 与 node_modules\dsh-netease
# 最后删掉本目录
```

---

## 10. 来源与许可

- `server.py` 来自 [Vael-KY/netease-music-mcp](https://github.com/Vael-KY/netease-music-mcp)（MIT），
  本地仅改监听地址。
- 其余（`bridge.py` / `keepalive.py` / `dsh-netease` / 脚本）为自写。
- 用的是网易 Web 端**非官方接口**，个人自用可以，**不要拿它批量下载或分发** ——
  上游原版 `Binaryify/NeteaseCloudMusicApi` 就是因为这个被下架的。
