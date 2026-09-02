#!/usr/bin/env bash
#
# DSH 外观个性化一键部署：安装 dsh-skin（含本地修复）+ dsh-cursor 到指定 profile。
# 用法: ./install.sh [profile名]    默认 web
# 要求: dsh web profile 已初始化过（$DSH_HOME/profiles/web 存在）、pnpm 可用。
# 幂等：重复执行安全；每个改动文件都有 .dsh-deploy.bak 备份。
set -euo pipefail

PROFILE="${1:-web}"
DSH_HOME_DIR="${DSH_HOME:-$HOME/.dsh}"
PROFILE_DIR="$DSH_HOME_DIR/profiles/$PROFILE"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> 目标 profile: $PROFILE_DIR"

if [ ! -d "$PROFILE_DIR" ]; then
  echo "错误: profile 不存在: $PROFILE_DIR" >&2
  echo "先用 dsh web / dsh --profile $PROFILE 初始化一次" >&2
  exit 1
fi
if ! command -v pnpm >/dev/null 2>&1; then
  echo "错误: 未找到 pnpm，请先安装（npm i -g pnpm）" >&2
  exit 1
fi

# 1) 复制插件包
mkdir -p "$PROFILE_DIR/packages"
for plugin in dsh-skin dsh-cursor; do
  src="$SCRIPT_DIR/vendor/$plugin"
  if [ ! -d "$src" ]; then
    echo "错误: 找不到 vendor/$plugin（仓库结构不完整？）" >&2
    exit 1
  fi
  if [ -e "$PROFILE_DIR/packages/$plugin" ]; then
    cp -R "$PROFILE_DIR/packages/$plugin" "$PROFILE_DIR/packages/$plugin.dsh-deploy.bak"
  fi
  rm -rf "$PROFILE_DIR/packages/$plugin"
  cp -R "$src" "$PROFILE_DIR/packages/$plugin"
  echo "==> 已安装 $plugin"
done

# 2) cordis.patch.yml：幂等追加 insert 行
patch_file="$PROFILE_DIR/cordis.patch.yml"
changed=0
for plugin in dsh-skin dsh-cursor; do
  if [ -f "$patch_file" ] && grep -q "'$plugin'" "$patch_file"; then
    echo "==> cordis.patch.yml 已有 $plugin，跳过"
    continue
  fi
  cp "$patch_file" "$patch_file.dsh-deploy.bak" 2>/dev/null || true
  block=$(printf '\n- insert:\n    - id: %s\n      name: %s\n' "$plugin" "'$plugin'")
  grep -v '^\[\]$' "$patch_file" > "$patch_file.tmp" || true
  mv "$patch_file.tmp" "$patch_file"
  printf '%s\n' "$block" >> "$patch_file"
  changed=1
done
[ "$changed" -eq 1 ] && echo "==> cordis.patch.yml 已更新"

# 3) package.json：幂等加 workspace 依赖
pj="$PROFILE_DIR/package.json"
if command -v node >/dev/null 2>&1; then
  node -e '
    const fs = require("fs");
    const p = process.argv[1];
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    j.dependencies = j.dependencies || {};
    let changed = false;
    for (const dep of ["dsh-skin", "dsh-cursor"]) {
      if (!j.dependencies[dep]) { j.dependencies[dep] = "workspace:*"; changed = true; }
    }
    if (changed) {
      fs.copyFileSync(p, p + ".dsh-deploy.bak");
      fs.writeFileSync(p, JSON.stringify(j, null, 2) + "\n");
      console.log("==> package.json 已加依赖");
    } else {
      console.log("==> package.json 依赖已存在，跳过");
    }
  ' "$pj"
else
  echo "警告: 未找到 node，请手动在 $pj 的 dependencies 加 dsh-skin / dsh-cursor 的 workspace:*" >&2
fi

# 4) pnpm-workspace.yaml：幂等启用 packages/*
ws="$PROFILE_DIR/pnpm-workspace.yaml"
if [ -f "$ws" ] && ! grep -q 'packages/\*' "$ws"; then
  cp "$ws" "$ws.dsh-deploy.bak"
  awk '{ print } /^packages:/ && !done { print "  - packages/*"; done=1 }' "$ws" > "$ws.tmp"
  mv "$ws.tmp" "$ws"
  echo "==> pnpm-workspace.yaml 已启用 packages/*"
fi

# 5) 安装
echo "==> 在 $PROFILE_DIR 执行 pnpm install ..."
(cd "$PROFILE_DIR" && pnpm install)

cat <<EOF

==> 安装完成。最后一步：重启 web profile 生效
    systemctl restart dsh.service        # systemd 托管时
    # 或按你平时启动 dsh web 的方式重启

==> 公网经 nginx 时（可选但强烈建议）：dsh-skin 多预设壁纸的保存请求可达数 MB，
    nginx 默认 1MB 上限会静默拒绝 → 在 nginx 站点配置加：
      client_max_body_size 256m;
    然后 nginx -t && systemctl reload nginx
    详见 docs/DEPLOY.md
EOF
