#!/usr/bin/env python3
"""export-skin-snapshot.py —— 从 dsh-skin 运行态导出可入库的快照。

运行态 $DSH_HOME/dsh-skin-state.json 约 2.6 MB（壁纸以 base64 内嵌），不适合入库。
本脚本把它拆成两件轻量产物：
  * assets/theme-wallpapers/<预设名>.<ext>   —— 解码后的壁纸原图
  * dsh-workspace/state-snapshots/dsh-skin-presets.json —— 去掉图片数据、只留配色与透明度的摘要

用法：python3 scripts/export-skin-snapshot.py [--root DIR] [--state FILE]
"""
import argparse
import base64
import json
import re
import sys
from pathlib import Path

MIME_EXT = {"image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp"}
DATA_URL = re.compile(r"^data:(?P<mime>[^;,]+);base64,(?P<data>.+)$", re.S)


def decode_data_url(value, name, outdir):
    """把 data URL 写成文件，返回相对仓库根的路径；非图片数据返回 None。"""
    if not isinstance(value, str) or not value.startswith("data:"):
        return None
    m = DATA_URL.match(value)
    if not m:
        return None
    ext = MIME_EXT.get(m.group("mime").lower())
    if not ext:
        return None
    path = outdir / f"{name}.{ext}"
    path.write_bytes(base64.b64decode(m.group("data")))
    return path


def find_wallpaper(images):
    """images.wallpaper 可能是 data URL 字符串，也可能是 {'url': dataURL, 'type': 'image', 'opacity': n}。"""
    if not isinstance(images, dict):
        return None, None
    wp = images.get("wallpaper")
    if isinstance(wp, str):
        return wp, None
    if isinstance(wp, dict):
        for key in ("url", "image", "src", "data"):
            if isinstance(wp.get(key), str):
                return wp[key], wp.get("opacity")
    return None, None


def describe_images(images, name, outdir, export=True):
    """导出主壁纸，其余图片只记录是否存在（避免快照体积失控）。"""
    raw, opacity = find_wallpaper(images)
    exported = decode_data_url(raw, name, outdir) if export else None
    others = {}
    if isinstance(images, dict):
        for key, value in images.items():
            if key == "wallpaper" or value is None:
                continue
            if isinstance(value, dict):
                others[key] = {"type": value.get("type"), "opacity": value.get("opacity")}
            else:
                others[key] = {"type": type(value).__name__}
    return {
        "wallpaper": str(exported.relative_to(outdir.parent.parent)) if exported else None,
        "wallpaperOpacity": opacity,
        "otherImages": others,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=str(Path(__file__).resolve().parent.parent))
    ap.add_argument("--state", default=str(Path.home() / ".dsh" / "dsh-skin-state.json"))
    args = ap.parse_args()

    root = Path(args.root).resolve()
    state_file = Path(args.state)
    if not state_file.is_file():
        sys.exit(f"找不到运行态文件 {state_file}（DSH_HOME 是否不同？用 --state 指定）")

    cfg = json.loads(json.loads(state_file.read_text())["config"])
    wallpapers = root / "assets" / "theme-wallpapers"
    snapshots = root / "dsh-workspace" / "state-snapshots"
    wallpapers.mkdir(parents=True, exist_ok=True)
    snapshots.mkdir(parents=True, exist_ok=True)

    presets = []
    for preset in cfg.get("presets", []):
        name = preset.get("name", "unnamed")
        skin = preset.get("skin", {})
        entry = {
            "name": name,
            "accent": skin.get("accent"),
            "text": skin.get("text"),
            "region": skin.get("region"),
        }
        entry.update(describe_images(skin.get("images", {}), name, wallpapers))
        presets.append(entry)

    summary = {
        "note": "dsh-skin 主题预设摘要（自动生成：scripts/export-skin-snapshot.py；"
                "壁纸见 assets/theme-wallpapers/，完整运行态见 $DSH_HOME/dsh-skin-state.json）",
        "live": {
            "enabled": cfg.get("enabled"),
            "accent": cfg.get("accent"),
            "text": cfg.get("text"),
            "region": cfg.get("region"),
            "autoSwitch": cfg.get("autoSwitch"),
        },
        "liveWallpaper": describe_images(cfg.get("images", {}), "live", wallpapers, export=False),
        "presets": presets,
    }
    out = snapshots / "dsh-skin-presets.json"
    out.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n")

    print(f"导出壁纸 {len(presets) + 1} 张 -> {wallpapers.relative_to(root)}/")
    for p in presets:
        print(f"  · {p['name']}: {p['wallpaper']} (accent {p['accent']}, 壁纸透明度 {p['wallpaperOpacity']})")
    print(f"写入摘要 -> {out.relative_to(root)}")


if __name__ == "__main__":
    main()
