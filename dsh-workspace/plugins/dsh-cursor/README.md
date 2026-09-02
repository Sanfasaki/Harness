# dsh-cursor

DSH 光标美化插件（纯客户端）v2：**图片光标**。

## 功能

- 全局隐藏系统光标（`cursor: none !important`），替换为自定义图片光标
- 图片元素直接跟随鼠标（`clientX/clientY` + `translate(-50%,-50%)` 居中）
- **悬停可点击元素自动放大**（链接/按钮/`[role=button]` 等，默认 1.5 倍，0.1s 过渡）
- 鼠标离开窗口自动隐藏、进入恢复
- 可配置：图案（**本地文件上传** → 自动裁剪透明边缘 + base64 存 localStorage，≤512KB；或 URL；或内置默认）、
  **深色描边开关**（浅色光标在浅色界面下的可见性辅助）、大小（24~96px）、放大倍数（1~2）
- **鼠标拖尾**（v3，参考用户项目 CursorTrail）：可独立开关（不开图片光标也可只开拖尾），
  发光圆点按时间驱动——`mousemove` 每 16ms 节流记录一点（上限 12），rAF 每帧按
  `progress = (now - createdAt) / duration` 计算，`easeOutCubic (1-(1-p)^3)` 收缩淡出，
  过期即销毁；可配置颜色、光点大小（8~28px）、时长（300~1500ms）
- **鼠标点击波纹**（v4，参考用户项目 ClickRipple）：点击页面任意位置以点击点为圆心扩散
  圆环（`maxSize × easeOutCubic` 先快后慢扩散 + `0.8×(1-progress)` 淡出），支持连点叠加
  （上限 12，过期销毁）；可配置颜色、最大尺寸（40~300px）、时长（300~2000ms）、边框粗细（1~6px）
- 设置存 `localStorage`（`dsh-cursor-state`），刷新/重开自动恢复
- 右下角 FAB（dsh-skin 按钮上方）开关面板；开启时按钮带绿点
- 触屏设备自动禁用（`@media (hover: none)` 恢复原生光标）

## 关键实现要点（踩坑记录）

1. **必须 `pointer-events: none`**：光标元素不拦截任何点击。
2. **光标元素 z-index 用 2147483001**：必须高于 dsh-skin 面板（2147483000），否则鼠标移到面板/FAB 上时光标消失。
3. **client bundle 必须走 `window.__ModuleLoader__.load({ id, factory })` 外壳**（client-modules 协议）：缺了会报 "bundle ... loaded without registering" 导致前端整页加载失败。
4. `cursor: none` 用 `!important`；输入框/文本域保留 I-beam。
5. 图片 URL 加载失败时回退提示，不破坏已生效光标；初始化失败 try/catch 回退原生光标。

## 安装

```sh
mkdir -p ~/.dsh/profiles/web/packages/dsh-cursor
cp -R lib package.json ~/.dsh/profiles/web/packages/dsh-cursor/
```

`~/.dsh/profiles/web/cordis.patch.yml` 追加：

```yaml
- insert:
    - id: dsh-cursor
      name: 'dsh-cursor'
```

`~/.dsh/profiles/web/package.json` dependencies 加 `"dsh-cursor": "workspace:*"`，然后：

```sh
cd ~/.dsh/profiles/web && pnpm install
systemctl restart dsh.service
```

## 使用

点击右下角光标按钮 → 打开 → 选图案 URL（留空用内置默认圆点）→ 调大小/放大倍数。

## 卸载

删除 `cordis.patch.yml` 里的 dsh-cursor 行、`packages/dsh-cursor` 目录、package.json 依赖声明，重启即可。
