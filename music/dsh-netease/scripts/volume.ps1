# Volume control for the music app through Windows Core Audio (WASAPI).
#
# Why a separate script: SMTC has no volume API, and this box has neither pycaw nor
# comtypes, so the only stdlib-free path is a small C# interop compiled on the fly.
#
# Prefers the *per-app* audio session of the target process (so the slider moves the
# music only); falls back to the default render device's master volume when the app
# has no audio session yet (e.g. nothing has played since it started).
#
# Usage:
#   volume.ps1 -Action get -App cloudmusic
#   volume.ps1 -Action set -Value 40 -App cloudmusic
# Prints ONE compact JSON line:
#   {"ok":true,"app":"cloudmusic","scope":"app","volume":40,"muted":false}
#
# ASCII only: Windows PowerShell 5.1 parses .ps1 as ANSI without a BOM.

param(
    [ValidateSet('get', 'set', 'daemon')][string]$Action = 'get',
    [int]$Value = -1,
    [string]$App = 'cloudmusic',
    # daemon mode: publish the current volume to -StatePath, take commands from -CmdPath
    [string]$StatePath = '',
    [string]$CmdPath = '',
    [int]$ParentPid = 0
)
if ($ParentPid -le 0) {
    # The watchdog below only fires when it has a pid. A spawner that forgets
    # -ParentPid would otherwise create a poller that never exits (that is how a
    # smtc.ps1 survived several bridge restarts). Derive it from our own parent.
    try {
        $me = Get-CimInstance Win32_Process -Filter "ProcessId=$PID" -ErrorAction Stop
        $ParentPid = [int]$me.ParentProcessId
    } catch { }
}


$ErrorActionPreference = 'Stop'

Add-Type -Language CSharp -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;

namespace VolTool
{
    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    public class MMDeviceEnumeratorComObject { }

    [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IMMDeviceEnumerator
    {
        int EnumAudioEndpoints(int dataFlow, int stateMask, out IntPtr devices);
        int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice device);
        int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IMMDevice device);
        int RegisterEndpointNotificationCallback(IntPtr client);
        int UnregisterEndpointNotificationCallback(IntPtr client);
    }

    [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IMMDevice
    {
        int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object iface);
        int OpenPropertyStore(int access, out IntPtr store);
        int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
        int GetState(out int state);
    }

    [ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IAudioSessionManager2
    {
        int GetAudioSessionControl(ref Guid sessionGuid, int flags, out IntPtr sessionControl);
        int GetSimpleAudioVolume(ref Guid sessionGuid, int flags, out ISimpleAudioVolume volume);
        int GetSessionEnumerator(out IAudioSessionEnumerator enumerator);
        int RegisterSessionNotification(IntPtr notification);
        int UnregisterSessionNotification(IntPtr notification);
        int RegisterDuckNotification([MarshalAs(UnmanagedType.LPWStr)] string sessionId, IntPtr duckNotification);
        int UnregisterDuckNotification(IntPtr duckNotification);
    }

    [ComImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IAudioSessionEnumerator
    {
        int GetCount(out int count);
        int GetSession(int index, out IAudioSessionControl session);
    }

    [ComImport, Guid("F4B1A599-7266-4319-A8CA-E70ACB11E8CD"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IAudioSessionControl
    {
        int GetState(out int state);
        int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string name);
        int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string name, ref Guid eventContext);
        int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string path);
        int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string path, ref Guid eventContext);
        int GetGroupingParam(out Guid param);
        int SetGroupingParam(ref Guid param, ref Guid eventContext);
        int RegisterAudioSessionNotification(IntPtr notify);
        int UnregisterAudioSessionNotification(IntPtr notify);
    }

    [ComImport, Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IAudioSessionControl2
    {
        int GetState(out int state);
        int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string name);
        int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string name, ref Guid eventContext);
        int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string path);
        int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string path, ref Guid eventContext);
        int GetGroupingParam(out Guid param);
        int SetGroupingParam(ref Guid param, ref Guid eventContext);
        int RegisterAudioSessionNotification(IntPtr notify);
        int UnregisterAudioSessionNotification(IntPtr notify);
        int GetSessionIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string id);
        int GetSessionInstanceIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string id);
        int GetProcessId(out uint pid);
        int IsSystemSoundsSession();
        int SetDuckingPreference(bool optOut);
    }

    [ComImport, Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface ISimpleAudioVolume
    {
        int SetMasterVolume(float level, ref Guid eventContext);
        int GetMasterVolume(out float level);
        int SetMute(bool mute, ref Guid eventContext);
        int GetMute(out bool mute);
    }

    [ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IAudioEndpointVolume
    {
        int RegisterControlChangeNotify(IntPtr notify);
        int UnregisterControlChangeNotify(IntPtr notify);
        int GetChannelCount(out int count);
        int SetMasterVolumeLevel(float level, ref Guid ctx);
        int SetMasterVolumeLevelScalar(float level, ref Guid ctx);
        int GetMasterVolumeLevel(out float level);
        int GetMasterVolumeLevelScalar(out float level);
        int SetChannelVolumeLevel(uint ch, float level, ref Guid ctx);
        int SetChannelVolumeLevelScalar(uint ch, float level, ref Guid ctx);
        int GetChannelVolumeLevel(uint ch, out float level);
        int GetChannelVolumeLevelScalar(uint ch, out float level);
        int SetMute(bool mute, ref Guid ctx);
        int GetMute(out bool mute);
        int GetVolumeStepInfo(out uint step, out uint stepCount);
        int VolumeStepUp(ref Guid ctx);
        int VolumeStepDown(ref Guid ctx);
        int QueryHardwareSupport(out uint mask);
        int GetVolumeRange(out float min, out float max, out float inc);
    }

    public static class Api
    {
        const int eRender = 0;
        const int eMultimedia = 1;
        const int CLSCTX_ALL = 23;
        static readonly Guid IID_SessionManager2 = new Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F");
        static readonly Guid IID_EndpointVolume = new Guid("5CDF2C82-841E-4546-9722-0CF74078229A");

        static IMMDevice DefaultDevice()
        {
            var e = (IMMDeviceEnumerator)new MMDeviceEnumeratorComObject();
            IMMDevice dev;
            int hr = e.GetDefaultAudioEndpoint(eRender, eMultimedia, out dev);
            if (hr != 0 || dev == null) throw new COMException("no default render device", hr);
            return dev;
        }

        // The app can own SEVERAL audio sessions at once (one per playback instance);
        // older ones linger as Inactive with a stale volume. Picking "the first match"
        // therefore writes to a session that produces no sound - the slider then looks
        // like it works (state file changes) while the audible session never moves.
        // So: collect every live (non-Expired) session, Active ones first.
        // AudioSessionState: 0 = Inactive, 1 = Active, 2 = Expired.
        static List<ISimpleAudioVolume> SessionList(string exe)
        {
            var active = new List<ISimpleAudioVolume>();
            var inactive = new List<ISimpleAudioVolume>();
            var dev = DefaultDevice();
            object o;
            Guid iid = IID_SessionManager2;
            int hr = dev.Activate(ref iid, CLSCTX_ALL, IntPtr.Zero, out o);
            if (hr != 0 || o == null) return active;
            var mgr = (IAudioSessionManager2)o;
            IAudioSessionEnumerator en;
            if (mgr.GetSessionEnumerator(out en) != 0 || en == null) return active;
            int n;
            if (en.GetCount(out n) != 0) return active;
            for (int i = 0; i < n; i++)
            {
                IAudioSessionControl c;
                if (en.GetSession(i, out c) != 0 || c == null) continue;
                var c2 = c as IAudioSessionControl2;
                if (c2 == null) continue;
                int state;
                if (c2.GetState(out state) != 0) continue;
                if (state == 2) continue;                 // Expired: never touch
                uint pid;
                if (c2.GetProcessId(out pid) != 0) continue;
                string name = "";
                try
                {
                    using (var p = Process.GetProcessById((int)pid)) name = p.ProcessName;
                }
                catch { }
                if (!string.Equals(name, exe, StringComparison.OrdinalIgnoreCase)) continue;
                var sv = c as ISimpleAudioVolume;
                if (sv == null) continue;
                if (state == 1) active.Add(sv); else inactive.Add(sv);
            }
            active.AddRange(inactive);
            return active;
        }

        static ISimpleAudioVolume Session(string exe)
        {
            var list = SessionList(exe);
            return list.Count > 0 ? list[0] : null;
        }

        static IAudioEndpointVolume Endpoint()
        {
            var dev = DefaultDevice();
            object o;
            Guid iid = IID_EndpointVolume;
            int hr = dev.Activate(ref iid, CLSCTX_ALL, IntPtr.Zero, out o);
            if (hr != 0 || o == null) throw new COMException("no endpoint volume", hr);
            return (IAudioEndpointVolume)o;
        }

        // returns scope actually used: "app" or "master"
        public static string Get(string exe, out int percent, out bool muted)
        {
            var s = Session(exe);
            if (s != null)
            {
                float v; s.GetMasterVolume(out v);
                bool m; s.GetMute(out m);
                percent = (int)Math.Round(v * 100.0); muted = m;
                return "app";
            }
            var ep = Endpoint();
            float mv; ep.GetMasterVolumeLevelScalar(out mv);
            bool mm; ep.GetMute(out mm);
            percent = (int)Math.Round(mv * 100.0); muted = mm;
            return "master";
        }

        public static string Set(string exe, int percent)
        {
            float lv = Math.Max(0f, Math.Min(1f, percent / 100f));
            Guid ctx = Guid.Empty;
            var list = SessionList(exe);
            if (list.Count > 0)
            {
                foreach (var one in list) one.SetMasterVolume(lv, ref ctx);
                return "app";
            }
            var ep = Endpoint();
            ep.SetMasterVolumeLevelScalar(lv, ref ctx);
            return "master";
        }
    }
}
'@

# ---- daemon mode ---------------------------------------------------
# A one-shot call re-compiles the C# block every time (measured ~440ms), so dragging
# stutters. The daemon compiles once, then publishes the current volume to the state
# file every ~400ms and polls the command file every 100ms.
if ($Action -eq 'daemon') {
    if (-not $StatePath) { $StatePath = Join-Path $PSScriptRoot 'volume-state.json' }
    if (-not $CmdPath) { $CmdPath = Join-Path $PSScriptRoot 'volume-cmd.json' }
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    $target = $App
    $lastSeq = -1
    $tick = 3
    $orphanTick = 0
while ($true) {
    $orphanTick++
    # exit when the parent process is gone (prevents orphaned daemons)
    if (($ParentPid -gt 0) -and (($orphanTick % 50) -eq 0)) {
        if (-not (Get-Process -Id $ParentPid -ErrorAction SilentlyContinue)) { exit }
    }
        try {
            if (Test-Path $CmdPath) {
                $raw = [IO.File]::ReadAllText($CmdPath, [Text.Encoding]::UTF8)
                if ($raw) {
                    $cmd = $raw | ConvertFrom-Json
                    if (($null -ne $cmd.seq) -and ([int]$cmd.seq -gt $lastSeq)) {
                        $lastSeq = [int]$cmd.seq
                        if ($cmd.app) { $target = [string]$cmd.app }
                        if ($null -ne $cmd.set) {
                            try { $null = [VolTool.Api]::Set($target, [int]$cmd.set) } catch { }
                            $tick = 3   # just changed: publish on the next tick
                        }
                    }
                }
            }
        }
        catch { }
        if (($tick % 4) -eq 0) {
            $p = 0; $m = $false
            try {
                $scope = [VolTool.Api]::Get($target, [ref]$p, [ref]$m)
                $out = [ordered]@{
                    t = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
                    ok = $true; app = $target; scope = $scope; volume = $p; muted = $m
                }
                $tmp = "$StatePath.tmp"
                [IO.File]::WriteAllText($tmp, ($out | ConvertTo-Json -Compress), $utf8)
                Move-Item -Path $tmp -Destination $StatePath -Force
            }
            catch { }
        }
        $tick++
        Start-Sleep -Milliseconds 100
    }
}

# ---- one-shot mode (manual use / troubleshooting) -------------------
$res = [ordered]@{ ok = $true; app = $App; scope = 'app'; volume = 0; muted = $false }
try {
    if ($Action -eq 'get') {
        $p = 0; $m = $false
        $scope = [VolTool.Api]::Get($App, [ref]$p, [ref]$m)
        $res.scope = $scope; $res.volume = $p; $res.muted = $m
    }
    else {
        if ($Value -lt 0 -or $Value -gt 100) { throw "Value must be 0..100" }
        $scope = [VolTool.Api]::Set($App, $Value)
        $p = 0; $m = $false
        $null = [VolTool.Api]::Get($App, [ref]$p, [ref]$m)
        $res.scope = $scope; $res.volume = $p; $res.muted = $m
    }
}
catch {
    $res.ok = $false
    $res.error = $_.Exception.Message
}

$res | ConvertTo-Json -Compress
