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
| [docs/DEPLOY.md](./docs/DEPLOY.md) | **部署指南：别人照读即可复刻全套**（一键/手动/验收/FAQ） |
| `install.sh` | 一键部署脚本（幂等、带备份） |
| `vendor/dsh-skin/` | 主题皮肤插件：极简浅/深、主色/文字色、图片/GIF/视频换肤、命名预设、**自动切换 + 三段式平滑过渡**（含本地修复最终版） |
| `vendor/dsh-cursor/` | 光标插件：图片光标（上传/URL、自动裁透明边、自适应描边）+ 鼠标拖尾 + 点击波纹 |
| `assets/cursor-images/` | 光标素材：原图与 APNG 损坏修复示例 |
| `cursor-components/` | 三件套 React 组件（CustomCursor / CursorTrail / ClickRipple），可移植到任意项目 |
| `skill/` | Skill 文档：光标效果三件套 + DSH 外观个性化实战经验（含所有踩坑） |
| `dsh-workspace/` | 开发工作区：DSH 机制文档、插件源码、bundles/patches 模板、脚本 |

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
