# Deploy the plugin source (./dsh-netease, next to this script) into a DSH profile.
#
#   powershell -File sync-plugin.ps1 [-Profile web2] [-DshHome C:\Users\me\.dsh]
#
# What it does:
#   1. mirror dsh-netease/ into <DSH_HOME>/profiles/<profile>/packages/dsh-netease
#   2. make <DSH_HOME>/profiles/<profile>/node_modules/dsh-netease a junction to it
#      (what pnpm would create for a workspace package -- done by hand so no install)
#   3. warn if the .gitignore in the repo would swallow lib/ (the classic "plugin
#      arrives without code" bug)
#
# ASCII only on purpose: Windows PowerShell 5.1 reads .ps1 as ANSI unless it has a
# BOM, so non-ASCII literals here would be mangled. Paths come from $PSScriptRoot.
param(
    [string]$Profile = 'web2',
    [string]$DshHome = ''
)
$ErrorActionPreference = 'Stop'

if (-not $DshHome) {
    $DshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE '.dsh' }
}
if (-not (Test-Path $DshHome)) { throw "DSH_HOME not found: $DshHome" }

$profileDir = Join-Path $DshHome (Join-Path 'profiles' $Profile)
if (-not (Test-Path $profileDir)) { throw "profile not found: $profileDir" }

$src  = Join-Path $PSScriptRoot 'dsh-netease'
$dst  = Join-Path $profileDir 'packages\dsh-netease'
$link = Join-Path $profileDir 'node_modules\dsh-netease'

if (-not (Test-Path $src)) { throw "source not found: $src" }
New-Item -ItemType Directory -Force -Path (Split-Path $dst) | Out-Null

robocopy $src $dst /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy failed with code $LASTEXITCODE" }
Write-Host "[sync] $src -> $dst"

if (-not (Test-Path $dst)) { throw "destination missing after sync: $dst" }

if (-not (Test-Path $link)) {
    # A brand-new profile may have no node_modules yet; New-Item -ItemType Junction
    # does not create parent directories, so this used to fail on a bare profile.
    New-Item -ItemType Directory -Force -Path (Split-Path $link) | Out-Null
    New-Item -ItemType Junction -Path $link -Target $dst | Out-Null
    Write-Host "[link] $link -> $dst"
} else {
    Write-Host "[link] already present"
}

Get-ChildItem $dst -Recurse -File | ForEach-Object {
    Write-Host ("[file] {0}  {1} bytes" -f $_.FullName.Substring($dst.Length + 1), $_.Length)
}

# Guard: if the repo ignores lib/, the plugin would be committed without its code.
Push-Location $PSScriptRoot
try {
    if (Test-Path (Join-Path $PSScriptRoot '..\.git')) {
        $ignored = (& git check-ignore -v 'dsh-netease/lib/client.js' 2>$null)
        if ($ignored) {
            Write-Host ''
            Write-Host "[WARN] git ignores dsh-netease/lib/client.js -- the plugin would land"
            Write-Host "       in the repo WITHOUT code (only package.json)."
            Write-Host "       rule: $ignored"
            Write-Host "       fix : add '!netease/dsh-netease/lib/' to the root .gitignore"
        }
    }
} catch { }
Pop-Location

Write-Host "[ok] dsh-netease deployed to $profileDir"
