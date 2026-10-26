# Long-lived SMTC (System Media Transport Controls) reader.
# Emits ONE compact JSON line per tick on stdout AND mirrors the latest tick into a
# state file. Kept as a separate process because spawning powershell.exe per poll
# costs ~0.5s, far too slow for lyric sync.
#
# The state file exists because a windowless parent (pythonw) does not reliably
# deliver the child's stdout; reading a file has no such dependency.
#
# Selection rule: prefer a session that is actually Playing, and among those prefer
# a known music app; otherwise fall back to whatever the system calls "current".
# (DingTalk, Teams etc. also register media sessions, so "current" alone is not enough.)

param(
    [string]$StatePath = '',
    [int]$ParentPid = 0
)
if (-not $StatePath) { $StatePath = Join-Path $PSScriptRoot 'smtc-state.json' }
if ($ParentPid -le 0) {
    # The watchdog below only fires when it has a pid. A spawner that forgets
    # -ParentPid would otherwise create a poller that never exits (that is how a
    # smtc.ps1 survived several bridge restarts). Derive it from our own parent.
    try {
        $me = Get-CimInstance Win32_Process -Filter "ProcessId=$PID" -ErrorAction Stop
        $ParentPid = [int]$me.ParentProcessId
    } catch { }
}


$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName System.Runtime.WindowsRuntime | Out-Null
[void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]

$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
        $_.Name -eq 'AsTask' -and
        $_.GetParameters().Count -eq 1 -and
        $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
    })[0]

function Await($op, $type) {
    $task = $asTask.MakeGenericMethod($type).Invoke($null, @($op))
    [void]$task.Wait(-1)
    $task.Result
}

function Get-Mgr {
    Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
}

$musicHints = @('cloudmusic', 'netease', 'qqmusic', 'spotify', 'foobar', 'aimp', 'musicbee', 'wmplayer', 'msedge', 'chrome', 'firefox', 'brave')

$mgr = $null
while ($null -eq $mgr) {
    try { $mgr = Get-Mgr } catch { Start-Sleep -Milliseconds 500 }
}

    $orphanTick = 0
while ($true) {
    $orphanTick++
    # exit when the parent process is gone (prevents orphaned pollers on bridge restart)
    if (($ParentPid -gt 0) -and (($orphanTick % 10) -eq 0)) {
        if (-not (Get-Process -Id $ParentPid -ErrorAction SilentlyContinue)) { exit }
    }
    $payload = [ordered]@{
        t      = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        ok     = $false
        count  = 0
        app    = ''
        status = ''
        playing = $false
        title  = ''
        artist = ''
        album  = ''
        positionMs = 0
        endMs  = 0
    }
    try {
        $sessions = @($mgr.GetSessions())
        $payload.count = $sessions.Count

        $playing = @()
        foreach ($s in $sessions) {
            if (([string]$s.GetPlaybackInfo().PlaybackStatus) -eq 'Playing') { $playing += $s }
        }

        $pick = $null
        if ($playing.Count -gt 0) {
            foreach ($hint in $musicHints) {
                $pick = $playing | Where-Object { ([string]$_.SourceAppUserModelId).ToLower().Contains($hint) } | Select-Object -First 1
                if ($pick) { break }
            }
            if (-not $pick) { $pick = $playing[0] }
        } else {
            $pick = $mgr.GetCurrentSession()
        }

        if ($pick) {
            $props = Await ($pick.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
            $tl = $pick.GetTimelineProperties()
            $info = $pick.GetPlaybackInfo()
            $payload.ok = $true
            $payload.app = [string]$pick.SourceAppUserModelId
            $payload.status = [string]$info.PlaybackStatus
            $payload.playing = ([string]$info.PlaybackStatus) -eq 'Playing'
            $payload.title = [string]$props.Title
            $payload.artist = [string]$props.Artist
            $payload.album = [string]$props.AlbumTitle
            $payload.positionMs = [int]$tl.Position.TotalMilliseconds
            $payload.endMs = [int]$tl.EndTime.TotalMilliseconds
        }
    }
    catch {
        # the manager can go stale after a session teardown; rebuild it once
        try { $mgr = Get-Mgr } catch { }
        $payload.ok = $false
    }

    $line = ($payload | ConvertTo-Json -Compress)
    # state file: write tmp then replace, so a reader never sees a half line
    # (ASCII only in this file: PS 5.1 reads .ps1 as ANSI without a BOM, and a
    #  multi-byte character can decode into a stray brace and break parsing)
    try {
        $tmp = "$StatePath.tmp"
        [IO.File]::WriteAllText($tmp, $line, [System.Text.UTF8Encoding]::new($false))
        Move-Item -Path $tmp -Destination $StatePath -Force
    }
    catch { }
    [Console]::WriteLine($line)
    [Console]::Out.Flush()
    Start-Sleep -Milliseconds 900
}
