# 状态快照（可恢复的个性化配置）

| 文件 | 内容 | 恢复方式 |
|---|---|---|
| `dsh-cursor-state.json` | 光标插件完整状态：当前生效参数 + 三组命名预设（`芙莉莲魔杖` / `罗小黑光标` / `紫罗兰光标`）+ 主题关联映射 + `linkOn` 开关 | 复制到 `$DSH_HOME/dsh-cursor-state.json`，刷新页面即可（服务器端持久化） |
| `dsh-skin-presets.json` | 主题预设摘要：name / accent / text / region / 壁纸引用 / 不透明度（**壁纸文件**在 `assets/theme-wallpapers/`） | 参考用；完整运行态是 `$DSH_HOME/dsh-skin-state.json`（含 base64 壁纸，未入库） |

## 主题预设一览（当前）

| 预设 | 主色 | 文字色 | 壁纸 | 壁纸不透明度 |
|---|---|---|---|---|
| `fulilian`（芙莉莲） | `#2dd2c7` 青绿 | `#073130` | `theme-wallpapers/fulilian.jpg` | 0.73 |
| `Violet`（紫罗兰） | `#853fd9` 紫 | `#341060` | `theme-wallpapers/Violet.jpg` | 0.6 |
| `lxhzj`（罗小黑战记2） | `#bf551d` 暖琥珀 | `#412307` | `theme-wallpapers/lxhzj.jpg` | 0.6 |

## 恢复脚本

```sh
# 恢复光标状态（含预设与关联）
cp dsh-workspace/state-snapshots/dsh-cursor-state.json "$DSH_HOME/dsh-cursor-state.json"
# 主题若需完整恢复：用 dsh-skin 面板重新做预设（壁纸用 assets/theme-wallpapers/ 里的图上传）
```

> 注意：光标预设里的 `imageUrl` 指向服务器端上传文件（`/api/dsh-cursor-image/dsh-cursor-images-*.b64`）。
> 换机器恢复时需先把 `assets/cursor-images/` 里的图重新上传（面板「上传」），再把预设里的 URL 换成新地址。
