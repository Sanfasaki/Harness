# 光标素材

| 文件 | 说明 | 来源/用途 |
|---|---|---|
| `guangbiao-fixed.png` | 芙莉莲魔杖上部特写（484×943，RGBA） | APNG 损坏修复版；`芙莉莲魔杖` 预设使用（服务 URL） |
| `default-original.png` | 芙莉莲魔杖全身（760×1633，RGBA） | 原始素材（完整魔杖） |
| `hei-cursor.png` | 罗小黑光标（184×193，RGBA） | **用户自制素材**；`罗小黑光标` 预设使用（已从服务器镜像，字节级校验一致） |
| `violet-cursor.png` | 紫罗兰光标（1023×1020，RGBA） | **用户自制素材**；`紫罗兰光标` 预设使用（已从服务器镜像，字节级校验一致） |
| `hei-paw-print.png` / `violet-letter.png` | 程序生成的猫爪印 / 信封 | **备选方案**（未被采用；用户改用自制素材） |

## 说明

- 实际生效的光标素材以 **服务器端上传** 为准（`/root/.dsh/dsh-cursor-images-*.b64`）；
  仓库内 `hei-cursor.png` / `violet-cursor.png` 是从运行服务器镜像的**当前真实素材**。
- 预设与主题关联（见 HANDOFF §2）：`芙莉莲魔杖↔fulilian`、`罗小黑光标↔lxhzj`、`紫罗兰光标↔Violet`。
- 用法：上传到 dsh-cursor 面板，或作为任意项目 `CustomCursor` 的 `imageSrc`。

## APNG 修复过程备忘

```text
原始损坏文件 chunk 结构：IHDR sRGB gAMA pHYs acTL fcTL iTXt IDAT×5 IEND
修复：移除 acTL/fcTL → 重建 chunk（重算 CRC）→ 静态 PNG 校验通过（PIL/Chromium 均认可）
透明边缘：按 alpha>8 包围盒裁剪（+1px 余量）
```

> 教训：裁剪/导出工具若输出"动画/贴纸"PNG，Chromium 可能拒解 → 导出时选静态 PNG。
