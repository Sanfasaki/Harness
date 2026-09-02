#!/usr/bin/env bash
# 用法: dump-config.sh [profile] [--default]
# 打印指定 profile（默认 web）组合后的配置树，不启动进程。
#   --default  只看 bundle 层（无用户层与 --patch）
set -euo pipefail

PROFILE="web"
DEFAULT=""
for arg in "$@"; do
  case "$arg" in
    --default) DEFAULT="--dump-default-config" ;;
    -*) echo "未知参数: $arg（支持 [profile名] 和 --default）" >&2; exit 1 ;;
    *) PROFILE="$arg" ;;
  esac
done

if [ -n "$DEFAULT" ]; then
  exec dsh --profile "$PROFILE" "$DEFAULT"
else
  exec dsh --profile "$PROFILE" --dump-config
fi
