#!/usr/bin/env bash
# git-push.sh —— 在 DSH 沙箱里可靠地推送本仓库到 GitHub。
#
# 背景：沙箱内 git 传输（HTTPS/SSH）会间歇性超时或 EOF，
#       因此这里走"双通道"：优先标准 git push，失败自动回退到 GitHub Git Data API。
#
# 用法：
#   bash scripts/git-push.sh "提交信息"          # 自动 add/commit 后推送
#   bash scripts/git-push.sh -C /path/to/repo "提交信息"
#   bash scripts/git-push.sh --no-commit "信息"  # 只推已有提交，不新建
#   FORCE_API=1 bash scripts/git-push.sh "信息"  # 强制走 API 通道（自检用）
#
# 全局 git 别名（已配置）：在任何仓库内 `git sync "信息"` 等价于此脚本。
#
# 依赖：git、python3、令牌文件（见 docs/GIT-PUSH.md）
set -euo pipefail

REPO=""
NO_COMMIT=0
BRANCH="${BRANCH:-main}"

while [ $# -gt 0 ]; do
  case "$1" in
    -C) REPO="$2"; shift 2 ;;
    --no-commit) NO_COMMIT=1; shift ;;
    -b|--branch) BRANCH="$2"; shift 2 ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) MSG="$1"; shift ;;
  esac
done

if [ -z "$REPO" ]; then
  if git rev-parse --show-toplevel >/dev/null 2>&1; then
    REPO="$(git rev-parse --show-toplevel)"
  else
    REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  fi
fi
cd "$REPO"

TOKEN_FILE="${DSH_GITHUB_TOKEN_FILE:-$HOME/.dsh/github-token}"
API_FALLBACK="$REPO/scripts/git-push-api.py"
[ -f "$API_FALLBACK" ] || API_FALLBACK="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/git-push-api.py"

echo "仓库: $REPO   分支: $BRANCH"

# ---- 1. 身份与凭据自检（缺了就自动补上，保证新会话开箱可用）----
git config --global user.name  >/dev/null 2>&1 || git config --global user.name  "Sanfasaki"
git config --global user.email >/dev/null 2>&1 || git config --global user.email "sanfasaki@localhost"
git config --global http.postBuffer 524288000 2>/dev/null || true
if [ -z "$(git config --global --get credential.helper || true)" ] && [ -f "$HOME/.git-credentials" ]; then
  git config --global credential.helper "store --file=$HOME/.git-credentials"
fi

# ---- 2. 提交（默认把当前所有改动打包成一个提交）----
if [ "$NO_COMMIT" -eq 0 ]; then
  if ! git diff --quiet || ! git diff --cached --quiet || [ -n "$(git ls-files -o --exclude-standard)" ]; then
    git add -A
    git commit -q -m "${MSG:-同步 $(date +%F\ %H:%M)}"
    echo "已提交: $(git rev-parse --short HEAD)  ${MSG:-同步 $(date +%F\ %H:%M)}"
  else
    echo "工作区干净，无新提交"
  fi
fi
HEAD_SHA="$(git rev-parse HEAD)"

# ---- 3. 通道 A：标准 git push ----
if [ "${FORCE_API:-0}" != "1" ]; then
  ERR="$(mktemp)"
  if timeout "${GIT_PUSH_TIMEOUT:-120}" git push -q origin "$BRANCH" 2>"$ERR"; then
    rm -f "$ERR"
    echo "✅ git push 成功 -> $(git rev-parse --short HEAD)（标准通道）"
    exit 0
  fi
  echo "⚠️  标准通道失败，回退 API 通道。git 报错："
  sed 's/^/     /' "$ERR" | head -6
  rm -f "$ERR"
fi

# ---- 4. 通道 B：GitHub Git Data API（内容寻址，只上传变化的 blob）----
if [ ! -x "$API_FALLBACK" ]; then chmod +x "$API_FALLBACK" 2>/dev/null || true; fi
echo "→ 使用 API 通道推送 $HEAD_SHA"
python3 "$API_FALLBACK" "$BRANCH" --token-file "$TOKEN_FILE"
