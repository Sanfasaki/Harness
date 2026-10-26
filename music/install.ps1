# One-command install for the NetEase Cloud Music integration (Windows).
#
#   powershell -ExecutionPolicy Bypass -File install.ps1 [-Profile web2] [-DshHome <path>]
#
# It is idempotent: safe to run again after editing the plugin.
#
# Steps:
#   1. sanity check python / DSH_HOME / profile
#   2. create .env from .env.example if missing  (cookie is NOT in the repo)
#   3. deploy the plugin into <profile>/packages + node_modules junction
#   4. append the two cordis entries to the profile's cordis.patch.yml (once)
#   5. register the logon autostart (keepalive) and start the services now
#
# ASCII only: Windows PowerShell 5.1 parses .ps1 as ANSI without a BOM.
param(
    [string]$Profile = 'web2',
    [string]$DshHome = ''
)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

Write-Host ''
Write-Host '=== 1/5  sanity check ===' -ForegroundColor Cyan

$python = (Get-Command python -ErrorAction SilentlyContinue).Source
if (-not $python) { throw "python not found on PATH -- install Python 3.8+ first" }
Write-Host "  python : $python"

if (-not $DshHome) {
    $DshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE '.dsh' }
}
if (-not (Test-Path $DshHome)) { throw "DSH_HOME not found: $DshHome  (pass -DshHome)" }
Write-Host "  DSH_HOME: $DshHome"

$profilesDir = Join-Path $DshHome 'profiles'
$profileDir = Join-Path $profilesDir $Profile
if (-not (Test-Path $profileDir)) {
    $available = (Get-ChildItem $profilesDir -Directory -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name) -join ', '
    throw "profile '$Profile' not found under $profilesDir. Available: $available  (pass -Profile <name>)"
}
Write-Host "  profile : $Profile"

$patchFile = Join-Path $profileDir 'cordis.patch.yml'
if (-not (Test-Path $patchFile)) { throw "cordis.patch.yml not found in $profileDir" }

foreach ($f in @('server.py', 'bridge.py', 'keepalive.py')) {
    if (-not (Test-Path (Join-Path $root $f))) { throw "missing $f next to install.ps1" }
}

Write-Host ''
Write-Host '=== 2/5  credentials ===' -ForegroundColor Cyan
$envFile = Join-Path $root '.env'
if (-not (Test-Path $envFile)) {
    Copy-Item (Join-Path $root '.env.example') $envFile
    Write-Host '  created .env from .env.example' -ForegroundColor Yellow
} else {
    Write-Host '  .env already exists (left untouched)'
}
$envText = [IO.File]::ReadAllText($envFile, [Text.Encoding]::UTF8)
$hasCookie = $envText -match '(?m)^NETEASE_COOKIE=\S'
if ($hasCookie) {
    Write-Host '  NETEASE_COOKIE: set'
} else {
    Write-Host '  NETEASE_COOKIE: EMPTY -- card/lyrics will not work until you fill it in' -ForegroundColor Yellow
    Write-Host '  how : log in at https://music.163.com -> F12 -> Network -> refresh ->' -ForegroundColor Yellow
    Write-Host '        click any music.163.com request -> copy the whole Cookie header' -ForegroundColor Yellow
    Write-Host "        -> paste into $envFile" -ForegroundColor Yellow
}

Write-Host ''
Write-Host '=== 3/5  deploy plugin ===' -ForegroundColor Cyan
& (Join-Path $root 'sync-plugin.ps1') -Profile $Profile -DshHome $DshHome

Write-Host ''
Write-Host '=== 4/5  patch cordis.patch.yml ===' -ForegroundColor Cyan
$patchText = [IO.File]::ReadAllText($patchFile, [Text.Encoding]::UTF8)
if ($patchText -match 'mcp-netease') {
    Write-Host '  already patched (mcp-netease present), skipped'
} else {
    $block = @'

# -----------------------------------------------------------
# NetEase Cloud Music - account tools (local MCP service -> DSH tools)
#   server.py / bridge.py are supervised by keepalive.py (starts at login)
#   ports 3456 / 3457; credentials live in music/.env and are never committed
#   tool names: mcp__netease__search_song / daily_recommend / ...
# -----------------------------------------------------------
- insert:
    - id: mcp-netease
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: netease
        transport: streamable-http
        url: http://127.0.0.1:3456/
        toolCallTimeoutMs: 29000

# Card + lyrics + transport controls (client side only; data comes from bridge.py)
- insert:
    - id: dsh-netease
      name: 'dsh-netease'
'@
    # A brand-new profile may ship an empty patch file, comments only, or the flow
    # form `[]`. Appending "- insert:" to `[]` would make invalid YAML, so replace
    # the flow form instead of appending to it.
    $trimmed = $patchText.Trim()
    if ($trimmed -eq '[]' -or $trimmed -eq '---' -or $trimmed -eq '--- []') {
        $body = $block.TrimStart("`r", "`n")
        [IO.File]::WriteAllText($patchFile, $body + "`r`n", [Text.UTF8Encoding]::new($false))
        Write-Host "  patch file was empty list -> wrote entries (replaced '[]')"
    } else {
        [IO.File]::AppendAllText($patchFile, $block, [Text.UTF8Encoding]::new($false))
        Write-Host "  appended 2 entries to $patchFile"
    }
}

Write-Host ''
Write-Host '=== 5/5  autostart + start services ===' -ForegroundColor Cyan
& (Join-Path $root 'register-autostart.ps1')

$pythonw = Join-Path (Split-Path $python) 'pythonw.exe'
if (-not (Test-Path $pythonw)) { $pythonw = $python }
foreach ($svc in @('server.py', 'bridge.py', 'keepalive.py')) {
    Start-Process -FilePath $pythonw -ArgumentList ('"' + (Join-Path $root $svc) + '"') -WorkingDirectory $root -WindowStyle Hidden
    Write-Host "  started $svc"
}
Start-Sleep -Seconds 4

Write-Host ''
Write-Host '=== verify ===' -ForegroundColor Cyan
foreach ($pair in @(@(3456, '/health'), @(3457, '/health'))) {
    $port = $pair[0]
    try {
        $r = Invoke-WebRequest -UseBasicParsing ("http://127.0.0.1:$port" + $pair[1]) -TimeoutSec 8
        Write-Host ("  {0} -> {1}" -f $port, $r.Content)
    } catch {
        Write-Host ("  {0} -> NOT LISTENING ({1})" -f $port, $_.Exception.Message) -ForegroundColor Red
    }
}

Write-Host ''
Write-Host 'DONE. Remaining manual steps:' -ForegroundColor Green
if (-not $hasCookie) { Write-Host '  1. fill NETEASE_COOKIE in .env' -ForegroundColor Yellow }
Write-Host '  2. restart DSH so the MCP entry connects (or reload if patchReload: live)'
Write-Host '  3. hard-refresh the DSH page (client bundle is immutable-cached)'
