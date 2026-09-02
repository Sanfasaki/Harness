#!/usr/bin/env bash
# 用法: install-plugin.sh <profile> <插件包路径> [额外 pnpm 参数...]
# 把本地插件安装进指定 profile（等价于在该 profile 目录里执行 pnpm add <路径>）。
set -euo pipefail

PROFILE="${1:?用法: $0 <profile> <插件包路径> [pnpm 参数...]}"
PKG_PATH="${2:?缺少插件包路径}"
shift 2

PROFILE_DIR="${DSH_HOME:-$HOME/.dsh}/profiles/$PROFILE"
if [ ! -d "$PROFILE_DIR" ]; then
  echo "error: profile 不存在: $PROFILE_DIR" >&2
  echo "先用 dsh plugin --profile $PROFILE init 创建" >&2
  exit 1
fi

ABS_PATH="$(cd "$(dirname "$PKG_PATH")" && pwd)/$(basename "$PKG_PATH")"

echo "==> 在 $PROFILE_DIR 中安装 $ABS_PATH"
(cd "$PROFILE_DIR" && pnpm add "$ABS_PATH" "$@")

echo "==> 完成。接下来在 $PROFILE_DIR/cordis.patch.yml 里 insert 一行启用它，"
echo "    示例见 /Sanfasaki/dsh-workspace/patches/personal.yml"
