#!/usr/bin/env bash
# sync-personalization.sh —— 把"个性化"相关的三处内容同步进仓库，避免副本变陈旧。
#
# 仓库里曾经出现过两类事故，本脚本就是为了根治它们：
#   1) vendor/ 与 dsh-workspace/ 里的插件副本落后于线上运行版本（部署文档照旧版走会踩坑）
#   2) 壁纸、光标状态只存在于 $DSH_HOME，仓库里没有，别人复刻不出效果
#
# 三处来源 → 三处去向：
#   A 开发区 /Sanfasaki/dsh-workspace        → Harness/dsh-workspace/（剔除 third-party 与状态快照）
#   B 线上插件 $DSH_HOME/profiles/web/packages → Harness/vendor/（同时校验开发区副本是否一致）
#   C 运行态 $DSH_HOME/dsh-*-state.json       → Harness/dsh-workspace/state-snapshots/ 与 assets/theme-wallpapers/
#
# 用法：bash scripts/sync-personalization.sh [--check]
#   --check 只报告差异，不写入（适合放进提交前的自检）
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WS_DEV="${WS_DEV:-/Sanfasaki/dsh-workspace}"
DSH="${DSH_HOME:-$HOME/.dsh}"
PKGS="$DSH/profiles/web/packages"
CHECK=0
[ "${1:-}" = "--check" ] && CHECK=1

rsync_flags=(-a --delete --exclude third-party/ --exclude node_modules/ --exclude .git/
             --exclude state-snapshots/ --exclude '*.bak*' --exclude 'client.js.bak-*')
[ "$CHECK" -eq 1 ] && rsync_flags+=(--dry-run --itemize-changes)

echo "=== A. 开发区 -> 仓库副本 ==="
if [ -d "$WS_DEV" ]; then
  rsync "${rsync_flags[@]}" "$WS_DEV/" "$ROOT/dsh-workspace/"
  [ "$CHECK" -eq 1 ] || echo "同步完成：$WS_DEV -> $ROOT/dsh-workspace"
else
  echo "跳过（开发区不存在：$WS_DEV）"
fi

echo "=== B. 线上插件 -> vendor/，并校验开发区副本 ==="
for plug in dsh-skin dsh-cursor; do
  src="$PKGS/$plug"; dst="$ROOT/vendor/$plug"
  if [ ! -d "$src" ]; then echo "跳过 $plug（未安装于 $PKGS）"; continue; fi
  mkdir -p "$dst"
  rsync "${rsync_flags[@]}" --exclude .dsh-deploy.bak --exclude node_modules/ \
        --include 'lib/***' --include 'test/***' --include 'package.json' --exclude '*' "$src/" "$dst/"
  [ "$CHECK" -eq 1 ] || echo "已同步 $plug -> vendor/$plug"
  dev_copy="$WS_DEV/plugins/$plug"
  if [ -d "$dev_copy" ]; then
    if diff -rq "$dev_copy/lib" "$dst/lib" >/dev/null 2>&1; then
      echo "  ✅ 开发区 $plug/lib 与线上一致"
    else
      echo "  ⚠️  开发区 $dev_copy/lib 与线上不一致（开发区是编辑源，请先同步到线上再入库）："
      diff -rq "$dev_copy/lib" "$dst/lib" | sed 's/^/       /'
    fi
  fi
done

echo "=== C. 运行态 -> state-snapshots/ 与 assets/theme-wallpapers/ ==="
snap="$ROOT/dsh-workspace/state-snapshots"; mkdir -p "$snap"
if [ -f "$DSH/dsh-cursor-state.json" ]; then
  if [ "$CHECK" -eq 1 ]; then
    diff -q "$DSH/dsh-cursor-state.json" "$snap/dsh-cursor-state.json" >/dev/null 2>&1 \
      && echo "  ✅ 光标状态快照已是最新" || echo "  ⚠️  光标状态快照需更新"
  else
    cp "$DSH/dsh-cursor-state.json" "$snap/dsh-cursor-state.json"
    echo "  已更新光标状态快照"
  fi
else
  echo "  跳过（$DSH/dsh-cursor-state.json 不存在）"
fi

if [ -f "$DSH/dsh-skin-state.json" ]; then
  if [ "$CHECK" -eq 1 ]; then
    tmp="$(mktemp -d)"; cp -r "$ROOT/assets/theme-wallpapers" "$tmp/" 2>/dev/null || true
    before="$(cat "$snap/dsh-skin-presets.json" 2>/dev/null | md5sum | cut -d' ' -f1)"
    python3 "$ROOT/scripts/export-skin-snapshot.py" --root "$tmp" >/dev/null 2>&1 || true
    after="$(cat "$tmp/dsh-workspace/state-snapshots/dsh-skin-presets.json" 2>/dev/null | md5sum | cut -d' ' -f1)"
    rm -rf "$tmp"
    [ "$before" = "$after" ] && echo "  ✅ 主题快照已是最新" || echo "  ⚠️  主题预设/壁纸有变化，需重新导出"
  else
    python3 "$ROOT/scripts/export-skin-snapshot.py" --root "$ROOT"
  fi
else
  echo "  跳过（$DSH/dsh-skin-state.json 不存在）"
fi

echo "=== 仓库改动概览 ==="
git -C "$ROOT" status --short || true
echo
echo "确认无误后推送：  git -C $ROOT add -A && git sync \"同步个性化内容\""
