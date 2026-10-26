# One-shot SMTC transport command (play/pause/next/prev/seek).
# Separate from smtc.ps1 (the continuous reader) because it runs once per click;
# ~0.5s startup is fine for a button press and keeps the reader loop untouched.
#
# Usage: powershell -File smtc-control.ps1 -Action toggle|next|prev|seek -Ms 12345
param(
    [string]$Action = 'toggle',
    [int]$Ms = -1,
    [string]$App = '',
    [string]$Title = ''
)

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

$result = [ordered]@{ ok = $false; action = $Action; status = ''; error = '' }

try {
    $mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
    $sessions = @($mgr.GetSessions())

    # Selection: the caller passes the session it is DISPLAYING (App/Title) and we hit
    # exactly that one. Falling back to "whatever is Playing" or GetCurrentSession() is
    # wrong here: once music is paused, GetCurrentSession() happily returns DingTalk's
    # video preview and we would pause/play the wrong app.
    $noise = @('dingtalk', 'teams', 'zoom', 'slack', 'discord', 'wechat', 'webex')
    $isNoise = {
        param($s)
        $id = ([string]$s.SourceAppUserModelId).ToLower()
        foreach ($n in $noise) { if ($id.Contains($n)) { return $true } }
        return $false
    }
    $musicHints = @('cloudmusic', 'netease', 'qqmusic', 'spotify', 'foobar', 'aimp', 'musicbee', 'wmplayer', 'msedge', 'chrome', 'firefox', 'brave')

    $pick = $null
    if ($App) {
        $pick = $sessions | Where-Object { [string]::Equals([string]$_.SourceAppUserModelId, $App, 'OrdinalIgnoreCase') } | Select-Object -First 1
    }
    if (-not $pick -and $Title) {
        foreach ($s in $sessions) {
            if (& $isNoise $s) { continue }
            try {
                $p = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
                if ([string]$p.Title -eq $Title) { $pick = $s; break }
            }
            catch { }
        }
    }
    if (-not $pick) {
        $playing = @($sessions | Where-Object { ([string]$_.GetPlaybackInfo().PlaybackStatus) -eq 'Playing' -and -not (& $isNoise $_) })
        if ($playing.Count -gt 0) {
            foreach ($hint in $musicHints) {
                $pick = $playing | Where-Object { ([string]$_.SourceAppUserModelId).ToLower().Contains($hint) } | Select-Object -First 1
                if ($pick) { break }
            }
            if (-not $pick) { $pick = $playing[0] }
        }
    }
    if (-not $pick) {
        $cur = $mgr.GetCurrentSession()
        if ($cur -and -not (& $isNoise $cur)) { $pick = $cur }
    }

    if (-not $pick) {
        $result.error = 'no-session'
    }
    else {
        switch ($Action) {
            'toggle' { $ok = Await ($pick.TryTogglePlayPauseAsync()) ([bool]) }
            'next' { $ok = Await ($pick.TrySkipNextAsync()) ([bool]) }
            'prev' { $ok = Await ($pick.TrySkipPreviousAsync()) ([bool]) }
            'stop' { $ok = Await ($pick.TryStopAsync()) ([bool]) }
            'seek' {
                if ($Ms -lt 0) { $result.error = 'missing-ms' }
                else {
                    # TryChangePlaybackPositionAsync takes TimeSpan ticks (100ns units)
                    $ok = Await ($pick.TryChangePlaybackPositionAsync([int64]($Ms * 10000))) ([bool])
                }
            }
            default { $result.error = 'unknown-action' }
        }
        if (-not $result.error) {
            $result.ok = [bool]$ok
            if (-not $result.ok) { $result.error = 'rejected' }
            $result.status = [string]$pick.GetPlaybackInfo().PlaybackStatus
            $result.app = [string]$pick.SourceAppUserModelId
        }
    }
}
catch {
    $result.error = [string]$_.Exception.Message
}

[Console]::WriteLine(($result | ConvertTo-Json -Compress))
