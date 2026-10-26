# Launch the NetEase Cloud Music MCP server (reads .env next to server.py).
# Keep this file ASCII-only: Windows PowerShell may parse it as ANSI.
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here
Write-Host "[netease] starting from $here"
python .\server.py
