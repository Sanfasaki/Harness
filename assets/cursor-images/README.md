# 光标素材

| 文件 | 说明 |
|---|---|
| `default-original.png` | 原始光标图（760×1633 RGBA，可直接用作光标图案） |
| `guangbiao-fixed.png` | **APNG 损坏修复示例**（484×943）：裁剪工具导出的动画 PNG（含 acTL/fcTL chunk）被 Chromium 拒绝解码，剥离动画 chunk 后恢复为标准静态 PNG |

## 用法

- DSH：打开 dsh-cursor 面板 → 上传（或把文件放到任意 URL → URL + 加载）
- 其他项目：作为 `CustomCursor` 的 `imageSrc`

## 修复过程备忘

```text
原始损坏文件 chunk 结构：IHDR sRGB gAMA pHYs acTL fcTL iTXt IDAT×5 IEND
修复：移除 acTL/fcTL → 重建 chunk（重算 CRC）→ 静态 PNG 校验通过（PIL/Chromium 均认可）
透明边缘：按 alpha>8 包围盒裁剪（+1px 余量）
```

> 教训：裁剪/导出工具若输出"动画/贴纸"PNG，Chromium 可能拒解 → 导出时选静态 PNG。
