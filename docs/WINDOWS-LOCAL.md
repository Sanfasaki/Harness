# Windows 本机主线：DSH 0.2 + profile `web2`

> 2026-10-10 建立。本文档记录**本机（Windows）**这条线的真实布局：DSH 0.2.0-rc.2 +
> 美化插件（dsh-skin / dsh-cursor）+ 两个新能力（computer-use / browser-use），
> 全部挂在同一个 profile `web2` 上，端口仍是 3080、会话沿用。
> 服务器（Linux）那条线见 `docs/DEPLOY.md`；事实总览见 `docs/HANDOFF.md`。

## 1. 布局

| 项 | 值 |
|---|---|
| DSH 代码 | `C:\AIART\dsh-0.2`（0.2.0-rc.2，独立安装，**不是**全局 npm、也不是 npx 缓存） |
| bin | `C:\AIART\dsh-0.2\node_modules\@deepseek-ai\dsh\lib\bin.js` |
| DSH_HOME | `C:\Users\30391\.dsh`（会话 / 状态 / 凭据 / 壁纸全部沿用） |
| profile | `web2`（`C:\Users\30391\.dsh\profiles\web2`） |
| 客户端插件副本 | `profiles\web2\packages\{dsh-skin,dsh-cursor}`（`workspace:*` 链接） |
| 端口 | 3080（与旧线相同，URL 不变） |
| 启动 | `C:\AIART\start-dsh-web.bat` |
| 回退启动 | `C:\AIART\start-dsh-web-0.1.5.bat`（老 0.1.5 + profile `web`） |
| 隔离试验环境 | `C:\Users\30391\.dsh-cu` + `start-dsh-cu.bat`（端口 3090，profile `cu`） |
| 归并前整份备份 | `C:\Users\30391\.dsh-backup-20261010` |
| 本机速查 | `C:\AIART\dsh-cu-README.md` |

`web2` 的 `cordis.patch.yml` 里有 6 条 `- insert:`：
`computer-use`、`computer-use-cua-driver-native`、`browser-use`、`browser-use-playwright-mcp`、
`dsh-skin`、`dsh-cursor`（后两条是美化），另有一层是 0.2 从 `settings.yaml` 导入的「用户层」。

## 2. 启动命令（三个坑都实测踩过）

```
"C:\Program Files\nodejs\node.exe" --expose-internals ^
  "C:\AIART\dsh-0.2\node_modules\@deepseek-ai\dsh\lib\bin.js" ^
  --profile web2 --port 3080 --no-open
```

1. **`--expose-internals` 必须加**：web profile 的 HMR 插件要求它；改用 `NODE_OPTIONS` 会破坏
   npx/node 的安装目录探测。所以脚本直接 `node bin.js`，不走 `npx dsh`。
2. **不要再补 `web` 子命令**：`--profile web2 web` 会直接报
   `error: too many arguments. Expected 0 arguments but got 1: web.` 退出。
   0.2 的 `--profile <name>` 本身就是"启动该 profile 的应用"；
   `dsh web` / `dsh tui` 只在用内置同名 profile 时成立。`--profile` 是**全局参数**，位置在子命令之前。

3. **`.bat` 必须纯 ASCII**（2026-10-10 实测炸过）：cmd.exe 按 **OEM 代码页**（本机 GBK）读批处理，
   UTF-8 的中文注释会被拆成乱码、甚至**被当成命令执行** —— 报错形如
   `'profile' is not recognized`、`'-web.bat。' is not recognized`。
   中文说明写进 `.md`，`C:\AIART\*.bat` 全部保持 ASCII。
   同理 `.ps1` 里的中文要带 **UTF-8 BOM**（否则 PowerShell 5.1 也按 GBK 解码，中文全乱）。
   另外一个同源坑：`echo` 里不要出现 `|` `&` `<` `>` `(` `)`，cmd 会当操作符 ——
   `echo [*] ... | profile web2 | port 3080` 会被真的执行成命令。

### 一键重启

```bat
C:\AIART\restart-dsh-web.bat            REM 结束占用 3080 的旧进程 -> 等端口释放 -> 起新版
C:\AIART\restart-dsh-web.bat 3083       REM 换端口（可在不动 3080 的前提下试跑）
```

配套 `restart-dsh-web.ps1` 负责"找进程 + 结束 + 等端口真正空闲"（10 秒不够就强制）。
**重启会断掉正在使用的 GUI 页面**（宿主进程被杀），会话历史在磁盘上不会丢；
新 token 每次启动都变，重启后要把新地址复制到浏览器。
不想用脚本就手工两步：关掉旧 DSH 控制台窗口 → 双击 `start-dsh-web.bat`。

其它有用的调用：

```powershell
$env:DSH_HOME = "C:\Users\30391\.dsh"
$bin = "C:\AIART\dsh-0.2\node_modules\@deepseek-ai\dsh\lib\bin.js"
& "C:\Program Files\nodejs\node.exe" $bin --profile web2 --dump-config   # 看合成后的插件树
& "C:\Program Files\nodejs\node.exe" $bin --profile web2 --port 0 "一次性任务"  # 不占端口跑任务
```

## 3. 两个新能力怎么装上的（可复刻）

两套能力都是「能力插件 + 提供方插件」两件套，四个包版本与 DSH 对齐（`0.2.0-rc.2`）：

| 能力 | 能力插件 | 提供方插件 | 上游 | 工具前缀 / 数量 |
|---|---|---|---|---|
| computer-use | `@deepseek-ai/dsh-computer-use` | `@deepseek-ai/dsh-experimental-computer-use-cua-driver-native` | `@trycua/cua-driver@0.28.0` | `cua_driver_native__` / 55 |
| browser-use | `@deepseek-ai/dsh-browser-use` | `@deepseek-ai/dsh-experimental-browser-use-playwright-mcp` | `@playwright/mcp@0.0.80` | `mcp__playwright-mcp__` / 23 |

步骤：

```powershell
# ① 装包（会进 profile 的 node_modules，但【不会】自动挂载！）
node $bin plugin --profile web2 add @deepseek-ai/dsh-computer-use@0.2.0-rc.2
node $bin plugin --profile web2 add @deepseek-ai/dsh-experimental-computer-use-cua-driver-native@0.2.0-rc.2
node $bin plugin --profile web2 add @deepseek-ai/dsh-browser-use@0.2.0-rc.2
node $bin plugin --profile web2 add @deepseek-ai/dsh-experimental-browser-use-playwright-mcp@0.2.0-rc.2

# ② 手写 cordis.patch.yml 的 - insert: 条目（见 §1），否则插件不会被挂载
# ③ 原生模块编译（npm 11.19 默认拦截 install 脚本）
npm.cmd --prefix "C:\Users\30391\.dsh\profiles\web2" install-scripts approve node-pty koffi protobufjs dsh-subprocess-local @google/genai
npm.cmd --prefix "C:\Users\30391\.dsh\profiles\web2" rebuild

# ④ 验收：合成配置树里能看到这 6 个 id
node $bin --profile web2 --dump-config | Select-String 'computer-use|browser-use|dsh-skin|dsh-cursor'
```

> ⚠️ `dsh plugin --profile X add <pkg>` 只把包装成**普通依赖**（日志警告 `declares no dsh.bundle`），
> **不会**生成 profile 层。只装不写 patch = 工具永远不会出现。

browser-use 的提供方配置（本机只有 Edge，没有 Chrome，所以显式指 Edge）：

```yaml
- insert: browser-use-playwright-mcp
  config:
    mode: launch
    headless: false
    executablePath: 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
```

## 4. 0.2 与 0.1.5 的行为差异（迁移时会撞到）

- **`settings.yaml` 被导入**：0.2 首次启动读 `$DSH_HOME/settings.yaml`，把它改名成
  `settings.yaml.imported`，内容物化进 profile `cordis.patch.yml` 的「用户层」。
  这是新版设计，**不是丢文件**；要还原就从事先的整份备份里拷回来。
- **`$DSH_HOME/skills` 变 Junction**：指向 `C:\Users\30391\.claude\skills`。已逐文件比对内容一致。
- **DOM class 名变了**：美化插件里所有写死的选择器都得重标，否则"插件在线但看不到效果"。
  本次重标了三处（新旧 class 并列，两个版本都能跑）：
  `output`（输出列）、`bubble`（气泡）、`VIDEO_TARGET.bubble`（视频气泡目标）；
  `wallpaper` / `sidebar` / `chat` / `input` 未变。
- **客户端 bundle 是不可变缓存**（`cache-control: public, max-age=31536000, immutable`，URL 带内容 rev）：
  改了插件要**硬刷新**才看得到。

## 5. 验收清单（本次实际跑过的）

| 检查 | 命令 / 方法 | 期望 |
|---|---|---|
| 插件挂上了 | `--profile web2 --dump-config` | 6 个 id 都在（`dump-config` 约 1300 行） |
| 美化在线 | 打开 3080 → 看右下角两个按钮、壁纸、光标 | body 背景图生效、sidebar/chat/input 三个区域命中 |
| computer-use | 会话里调 `cua_driver_native__get_accessibility_tree` | 返回真实桌面窗口/进程列表 |
| browser-use | 会话里调 `mcp__playwright-mcp__browser_navigate` + `browser_snapshot` | 能打开页面并读回标题 |
| 会话没丢 | 打开 3080 看历史会话列表 | 36 个历史会话都在 |

> 客户端清单**看不到** computer-use / browser-use —— 它们是 host 侧插件，不产出 client bundle；
> 别拿 `/plugins/??...` 清单判断它们挂没挂上。

## 6. 回退

```powershell
# A) 只回退版本（最常用）：双击 start-dsh-web-0.1.5.bat 即可，什么都不用改
# B) 退掉这次归并：
Remove-Item "C:\Users\30391\.dsh\profiles\web2" -Recurse -Force      # 老 profile web 一直没动
Remove-Item "C:\AIART\dsh-0.2" -Recurse -Force
Remove-Item "C:\AIART\start-dsh-web.bat","C:\AIART\start-dsh-cu.bat" -Force
Copy-Item "C:\Users\30391\.dsh-backup-20261010\settings.yaml" "C:\Users\30391\.dsh\settings.yaml" -Force
# C) 整份 HOME 回滚：从 C:\Users\30391\.dsh-backup-20261010 恢复
```

## 7. 与服务器线的差异（部署别人时最常问）

| 差异点 | Linux 服务器 | Windows 本机 |
|---|---|---|
| 服务 | systemd `dsh.service` / nginx :8080 | 双击 bat，仅 `127.0.0.1:3080`（token 在启动窗口） |
| 版本 | 0.1.5-rc.1 | 0.2.0-rc.2 |
| profile | `web` | `web2` |
| 启动 | `dsh web` | `--profile web2 --port 3080 --no-open`（**不补 `web`**） |
| 原生模块 | 直接编译 | 需 `npm install-scripts approve` + `npm rebuild` |
| 浏览器 | 无（不需要） | 只有 Edge → browser-use 显式指 `msedge.exe` |

参考：上游文档 `computer-use.zh.md` / `browser-use.zh.md` / `web-server.zh.md`（本次调研时下载到
`C:\AIART\_downloads\`）。
