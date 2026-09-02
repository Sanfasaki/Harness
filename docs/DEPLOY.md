# DSH 外观个性化 · 部署指南

> 目标：让任何一台已运行 DeepSeek Harness（web profile）的机器，**照本文档即可复刻**
> 本仓库的全部外观个性化：主题皮肤（dsh-skin）+ 光标美化三件套（dsh-cursor）+ 壁纸过渡。
> 全程约 5 分钟。**最快路径：直接跑 `./install.sh`**，然后看第 4、5 节收尾。

---

## 0. 前置要求

| 依赖 | 检查 | 说明 |
|---|---|---|
| DeepSeek Harness（web） | `ls ~/.dsh/profiles/web` 存在 | 没有就先启动一次 `dsh web`（首次自动初始化 profile） |
| pnpm | `pnpm --version` | 没有就 `npm i -g pnpm` |
| node | `node --version` | 安装脚本改 package.json 用 |

`$DSH_HOME` 默认 `~/.dsh`（本文按此写；自定义了 DSH_HOME 的自行替换）。

---

## 1. 快速部署（一键脚本）

```sh
git clone <本仓库地址> && cd Harness
./install.sh web          # profile 名默认 web，可换
```

脚本做的事（全部幂等、带 `.dsh-deploy.bak` 备份）：

1. 复制 `vendor/dsh-skin`（含本地修复的最终版）与 `vendor/dsh-cursor` 到 `~/.dsh/profiles/web/packages/`
2. 在 `cordis.patch.yml` 追加两个插件行
3. `package.json` 加 `dsh-skin` / `dsh-cursor` 的 `workspace:*` 依赖
4. `pnpm-workspace.yaml` 启用 `packages/*`
5. `pnpm install`

## 2. 手动部署（想看清每一步时照做）

```sh
# 复制插件包
mkdir -p ~/.dsh/profiles/web/packages
cp -R vendor/dsh-skin   ~/.dsh/profiles/web/packages/
cp -R vendor/dsh-cursor ~/.dsh/profiles/web/packages/

# cordis.patch.yml 追加（把原来的 [] 行删掉后追加）
cat >> ~/.dsh/profiles/web/cordis.patch.yml <<'EOF'

- insert:
    - id: dsh-skin
      name: 'dsh-skin'

- insert:
    - id: dsh-cursor
      name: 'dsh-cursor'
EOF

# package.json dependencies 加两项
"dsh-skin": "workspace:*",
"dsh-cursor": "workspace:*"

# pnpm-workspace.yaml 的 packages 列表加 packages/*
packages:
  - packages/*
  - .

# 安装
cd ~/.dsh/profiles/web && pnpm install
```

## 3. 重启生效

```sh
systemctl restart dsh.service     # systemd 托管（本机默认）
# 或按你平时启动 dsh web 的方式重启
```

重启后**刷新页面**：右下角出现两个按钮——dsh-skin 调色板（外观皮肤）+ dsh-cursor（光标美化，在其上方）。

## 4. nginx 公网入口（有公网/反代时必做）

dsh-skin 把壁纸以 base64 内嵌进配置，多预设后状态文件可达数 MB；**nginx 默认
`client_max_body_size 1m` 会静默 413 拒掉保存**（表现为"保存了但重启后预设丢失"）。

在你的 nginx 站点配置（如 `/etc/nginx/sites-available/dsh`）的 server 块加：

```nginx
client_max_body_size 256m;
```

然后：

```sh
nginx -t && systemctl reload nginx
```

## 5. 使用与验收清单

| 功能 | 怎么用 | 验收 |
|---|---|---|
| 主题皮肤 | 右下角「外观皮肤」按钮 → 极简浅/深、主色、文字色、图片/GIF/视频换肤（5 槽位） | 设一个壁纸 → 刷新不丢 |
| 主题预设 | 面板「预设」→ 输入名称 → 保存当前；可应用/删除 | 存 2 个预设 → 重启后都在 |
| 自动切换 | 面板底部「自动切换主题」：开关 + 间隔（1min/10min/30min/1h/自定义） | 开 1min 档 → 到点平滑切换（遮罩三段式淡出→无→淡入） |
| 图片光标 | dsh-cursor 面板 → 开关 → 「上传」选透明 PNG（≤8MB） | 光标变为图片；悬停按钮放大；输入框仍是 I-beam |
| 光标拖尾/波纹 | dsh-cursor 面板下半区两个开关 + 颜色/大小/时长/边框 | 移动出光点拖尾、点击出波纹 |

## 6. 常见问题（都踩过，已修）

| 现象 | 原因 | 处理 |
|---|---|---|
| 保存主题预设后重启丢失 | nginx 1MB 上限 413 静默拒绝 / 前端 persist 无防抖乱序 | 第 4 节 + 本仓库代码已内置防抖串行写入 |
| 主题切换"瞬切/无过渡" | 各种过渡方案（View Transitions / cross-fade / 叠加层）在本 UI 各有硬伤 | 本仓库已是最终可用版：遮罩三段式 + WAAPI |
| 上传透明 PNG 光标"消失" | 大透明画布 contain 缩太小 / APNG（动画 PNG）Chromium 拒解 | 代码内置：上传自动裁透明边 + 解码校验；APNG 需服务端剥离动画 chunk（见 skill 文档） |
| 光标移到面板上消失 | 光标层 z-index 低于 dsh-skin 面板 | 已固定 2147483001 |
| 前端整页加载失败 / "loaded without registering" | client bundle 缺 `__ModuleLoader__.load` 外壳 | 本仓库代码已带外壳；自己写插件务必保留 |

## 7. 目录导航

```
Harness/
├── install.sh                      # 一键部署
├── docs/DEPLOY.md                  # 本文档
├── vendor/dsh-skin/                # 主题皮肤插件（含本地修复的最终版）
├── vendor/dsh-cursor/              # 光标美化插件（图片光标+拖尾+波纹）
├── assets/cursor-images/           # 光标素材（原图 + APNG 修复示例）
├── cursor-components/              # 通用 React 组件版三件套（可移植到其他项目）
├── skill/                          # Skill 文档（三件套 + DSH 外观实战经验）
└── dsh-workspace/                  # 开发工作区：文档、插件源码、patch 模板
```

> 提示：`dsh-workspace/third-party/` 下的上游克隆不入库；`vendor/dsh-skin` 即
> 上游 + 本地修复（persist 防抖串行 / 自动切换 / 三段式过渡）的最终可部署版本。
