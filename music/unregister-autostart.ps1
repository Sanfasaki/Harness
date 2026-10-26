# Remove the logon autostart shortcut created by register-autostart.ps1.
# ASCII only (see register-autostart.ps1).
$ErrorActionPreference = 'Stop'

$startup = [Environment]::GetFolderPath('Startup')
$lnkPath = Join-Path $startup 'dsh-netease-mcp.lnk'

if (Test-Path $lnkPath) {
    Remove-Item $lnkPath -Force
    Write-Host "[ok] removed $lnkPath"
} else {
    Write-Host "[skip] not present: $lnkPath"
}
