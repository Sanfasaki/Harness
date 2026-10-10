# push-via-api.ps1 - push the current HEAD to GitHub through the Git Data API.
#
# Use when git-over-HTTPS to github.com is dead on this host (TLS handshake
# fails: "schannel: server closed abruptly" / "unexpected eof while reading")
# while api.github.com is reachable and `gh` is authenticated.
# Windows counterpart of the API fallback inside scripts/git-push.sh.
#
# Requirements / assumptions
#   * gh CLI installed and logged in with the `repo` scope
#   * the remote branch tip is exactly the parent of local HEAD (one commit)
#
# Correctness guards (never trust a re-encode):
#   * blobs are uploaded with CRLF->LF normalisation, then the blob SHA GitHub
#     returns is asserted against the SHA of the blob in the local commit, so a
#     wrong re-encode fails loudly instead of producing a different tree.
#   * the commit is rebuilt with the local commit's exact tree/parent/identity/
#     dates/raw message bytes, so the resulting SHA normally equals the local
#     one and no fetch is ever needed to realign.
#   * if the SHAs still differ, local refs are left untouched and the repo's
#     standard .git/DSH_DIVERGED marker is written (same convention as
#     scripts/git-push.sh).
#
# Usage
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\push-via-api.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\push-via-api.ps1 `
#       -RepoPath C:\path\to\Harness -Branch main

param(
  # Default: the repository this script lives in. Deliberately NOT the current
  # directory - running from an unrelated repo (C:\AIART is one too) would
  # silently target the wrong repository.
  [string]$RepoPath = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$Branch   = ''
)

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)

function GitOut([string[]]$gitArgs) {
  $out = & git @gitArgs 2>&1
  if ($LASTEXITCODE -ne 0) { throw "git $($gitArgs -join ' ') failed: $out" }
  return ($out | Out-String).Trim()
}

# byte-exact stdout capture (a PowerShell pipeline would re-encode the text)
function GitRaw([string[]]$gitArgs) {
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName               = 'git'
  $psi.Arguments              = (($gitArgs | ForEach-Object { if ($_ -match '[\s"]') { '"' + $_ + '"' } else { $_ } }) -join ' ')
  $psi.RedirectStandardOutput = $true
  $psi.UseShellExecute        = $false
  $psi.CreateNoWindow         = $true
  $p  = [System.Diagnostics.Process]::Start($psi)
  $ms = New-Object System.IO.MemoryStream
  $p.StandardOutput.BaseStream.CopyTo($ms)
  $p.WaitForExit()
  if ($p.ExitCode -ne 0) { throw "git $($gitArgs -join ' ') failed with exit $($p.ExitCode)" }
  return $ms.ToArray()
}

function PostJson($apiPath, $obj, $depth) {
  $f = Join-Path $env:TEMP ("pushviaapi-" + [guid]::NewGuid().ToString('N') + ".json")
  [System.IO.File]::WriteAllText($f, ($obj | ConvertTo-Json -Depth $depth -Compress), $utf8)
  try {
    $out = & gh api --method POST $apiPath --input $f 2>&1
    if ($LASTEXITCODE -ne 0) { throw "gh api POST $apiPath failed: $out" }
    return ($out | Out-String)
  } finally { Remove-Item $f -Force -ErrorAction SilentlyContinue }
}

# ---- resolve repo / remote / branch ----------------------------------------
$top = GitOut @('-C', $RepoPath, 'rev-parse', '--show-toplevel')
$url = GitOut @('-C', $top, 'remote', 'get-url', 'origin')
if ($url -notmatch 'github\.com[:/]+([^/]+)/(.+?)(\.git)?$') { throw "cannot parse GitHub owner/repo out of remote url: $url" }
$owner = $Matches[1]
$name  = $Matches[2]
if (-not $Branch) { $Branch = GitOut @('-C', $top, 'rev-parse', '--abbrev-ref', 'HEAD') }
if ($Branch -eq 'HEAD') { throw 'detached HEAD; pass -Branch explicitly' }
Write-Host "repo         : $top  ($owner/$name, branch $Branch)"

$localSha   = GitOut @('-C', $top, 'rev-parse', 'HEAD')
$parent     = GitOut @('-C', $top, 'rev-parse', 'HEAD^')
$treeSha    = GitOut @('-C', $top, 'rev-parse', 'HEAD^{tree}')
$parentTree = GitOut @('-C', $top, 'rev-parse', "$parent^{tree}")

# exact commit message bytes as git stored them
$rawCommit = GitRaw @('-C', $top, 'cat-file', 'commit', 'HEAD')
$sep = -1
for ($i = 0; $i -lt $rawCommit.Length - 1; $i++) { if ($rawCommit[$i] -eq 10 -and $rawCommit[$i+1] -eq 10) { $sep = $i; break } }
if ($sep -lt 0) { throw 'could not locate the commit message separator' }
$msgBytes = New-Object byte[] ($rawCommit.Length - $sep - 2)
[Array]::Copy($rawCommit, $sep + 2, $msgBytes, 0, $msgBytes.Length)
$message = $utf8.GetString($msgBytes)

$authorName     = GitOut @('-C', $top, 'log', '-1', '--format=%an')
$authorEmail    = GitOut @('-C', $top, 'log', '-1', '--format=%ae')
$authorDate     = GitOut @('-C', $top, 'log', '-1', '--format=%aI')
$committerName  = GitOut @('-C', $top, 'log', '-1', '--format=%cn')
$committerEmail = GitOut @('-C', $top, 'log', '-1', '--format=%ce')
$committerDate  = GitOut @('-C', $top, 'log', '-1', '--format=%cI')

Write-Host "local HEAD   : $localSha"
Write-Host "parent       : $parent"
Write-Host "local tree   : $treeSha"
Write-Host "message bytes: $($msgBytes.Length)"

$remoteSha = (& gh api "repos/$owner/$name/git/ref/heads/$Branch" --jq '.object.sha' 2>&1 | Out-String).Trim()
Write-Host "remote tip   : $remoteSha"
if ($remoteSha -eq $localSha) { Write-Host 'already up to date; nothing to push'; exit 0 }
if ($remoteSha -ne $parent) {
  throw "remote $Branch is not the parent of local HEAD ($remoteSha vs $parent). This script pushes exactly one commit; push the intermediate commits first."
}

$paths = @(& git -C $top diff --name-only $parent $localSha) | Where-Object { $_ }
Write-Host "changed files: $($paths.Count)"
foreach ($p in $paths) { Write-Host "   $p" }

# ---- upload blobs (SHA-asserted) ------------------------------------------
$entries = @()
foreach ($p in $paths) {
  $blobSha = GitOut @('-C', $top, 'rev-parse', "HEAD:$p")
  $mode    = ((GitOut @('-C', $top, 'ls-tree', 'HEAD', '--', $p)) -split '\s+')[0]
  $abs     = Join-Path $top ($p -replace '/', '\')
  $text    = $utf8.GetString([System.IO.File]::ReadAllBytes($abs))
  $lfBytes = $utf8.GetBytes($text.Replace("`r`n", "`n"))   # match git's index (core.autocrlf)
  $apiSha  = (PostJson "repos/$owner/$name/git/blobs" @{ content = [Convert]::ToBase64String($lfBytes); encoding = 'base64' } 4 | ConvertFrom-Json).sha
  if ($apiSha -ne $blobSha) { throw "blob SHA mismatch for $p : local=$blobSha api=$apiSha" }
  Write-Host "   blob ok $($blobSha.Substring(0,8)) (mode $mode) $p"
  $entries += @{ path = $p; mode = $mode; type = 'blob'; sha = $blobSha }
}

# ---- tree ------------------------------------------------------------------
$newTree = (PostJson "repos/$owner/$name/git/trees" @{ base_tree = $parentTree; tree = $entries } 6 | ConvertFrom-Json).sha
Write-Host "new tree     : $newTree"
if ($newTree -ne $treeSha) { throw "tree mismatch: local=$treeSha api=$newTree" }
Write-Host 'tree matches the local commit: OK'

# ---- commit ----------------------------------------------------------------
$newCommit = (PostJson "repos/$owner/$name/git/commits" @{
  message   = $message
  tree      = $newTree
  parents   = @($parent)
  author    = @{ name = $authorName;    email = $authorEmail;    date = $authorDate }
  committer = @{ name = $committerName; email = $committerEmail; date = $committerDate }
} 6 | ConvertFrom-Json).sha
Write-Host "new commit   : $newCommit"
Write-Host "local commit : $localSha"

# ---- move the branch -------------------------------------------------------
$refBody = Join-Path $env:TEMP ("pushviaapi-ref-" + [guid]::NewGuid().ToString('N') + ".json")
[System.IO.File]::WriteAllText($refBody, (@{ sha = $newCommit; force = $false } | ConvertTo-Json -Compress), $utf8)
try {
  # -X PATCH: gh api needs the method override for PATCH
  $moved = & gh api --method PATCH "repos/$owner/$name/git/refs/heads/$Branch" --input $refBody --jq '.object.sha' 2>&1
  if ($LASTEXITCODE -ne 0) { throw "ref update failed: $moved" }
  Write-Host "branch $Branch -> $($moved | Out-String)"
} finally { Remove-Item $refBody -Force -ErrorAction SilentlyContinue }

if ($newCommit -eq $localSha) {
  & git -C $top update-ref "refs/remotes/origin/$Branch" $newCommit
  Write-Host "OK: remote commit SHA == local SHA; local and remote are in sync (no fetch needed)"
} else {
  [System.IO.File]::WriteAllText((Join-Path $top '.git\DSH_DIVERGED'),
    "local  $localSha`nremote $newCommit`nreason: pushed via Git Data API (git-over-https blocked on this host); trees identical`n",
    $utf8)
  Write-Host "WARN: SHAs differ (trees identical). Local refs left alone; wrote .git/DSH_DIVERGED"
}
Write-Host "worktree status: '$((& git -C $top status --porcelain) -join ',')'"
