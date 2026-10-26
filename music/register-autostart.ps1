# Register the two local services to start at logon:
#   1. server.py   (MCP, 127.0.0.1:3456)  -- the agent's tool bridge
#   2. bridge.py   (GUI, 127.0.0.1:3457)  -- the card + lyrics data
# Per-user Startup folder shortcuts (not services, not scheduled tasks):
# easy to inspect, easy to remove -- delete the .lnk files.
#
# ASCII only: Windows PowerShell 5.1 parses .ps1 as ANSI without a BOM.
$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
$python = (Get-Command python -ErrorAction SilentlyContinue).Source
if (-not $python) { throw "python not found on PATH" }
$pythonw = Join-Path (Split-Path $python) 'pythonw.exe'
if (-not (Test-Path $pythonw)) { throw "pythonw.exe not found next to $python" }

$startup = [Environment]::GetFolderPath('Startup')
$shell = New-Object -ComObject WScript.Shell

function New-ServiceShortcut($fileName, $scriptName, $description) {
    $script = Join-Path $root $scriptName
    if (-not (Test-Path $script)) { throw "$scriptName not found: $script" }
    $lnkPath = Join-Path $startup $fileName
    $lnk = $shell.CreateShortcut($lnkPath)
    $lnk.TargetPath = $pythonw
    $lnk.Arguments = '"' + $script + '"'
    $lnk.WorkingDirectory = $root
    $lnk.Description = $description
    $lnk.Save()
    Write-Host "[ok] $lnkPath"
}

New-ServiceShortcut 'dsh-netease-keepalive.lnk' 'keepalive.py' 'dsh-netease keepalive (supervises 3456 + 3457)'

# The two older per-service shortcuts are retired: keepalive starts both services.
# Otherwise a DSH restart takes the services down with its process tree while the
# shortcuts only run once at login (that was a real outage).
$startup = [Environment]::GetFolderPath('Startup')
foreach ($stale in @('dsh-netease-mcp.lnk', 'dsh-netease-bridge.lnk')) {
    $p = Join-Path $startup $stale
    if (Test-Path $p) { Remove-Item $p -Force; Write-Host "[rm] $p" }
}

Write-Host ''
Write-Host "remove: delete the .lnk file, or run unregister-autostart.ps1"
