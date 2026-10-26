#!/usr/bin/env python3
"""netmusic-bridge —— DSH 网易云卡片的本地数据桥（127.0.0.1:3457）

为什么单独一个进程，不塞进 DSH 插件宿主侧：
  插件的宿主侧 JS 改了必须重启 DSH（Node 模块缓存），而界面/数据要反复调。
  放成独立进程后，改这里只要重启本服务，改前端只要刷新页面。

职责（全部只读 + 播放控制，不碰账号写操作）：
  /now        正在播放（SMTC）+ 歌词（网易云 LRC，含翻译）
  /control    播放/暂停/上一首/下一首（走 SMTC Transport Controls）
  /seek       跳转进度
  /playlists  我的歌单
  /playlist   某个歌单的歌曲
  /daily      每日推荐
  /search     搜歌
  /status     登录态 + 昵称头像
  /health

凭据：同目录 .env 的 NETEASE_COOKIE / NETEASE_CSRF（与 MCP 服务共用一份）。
"""
import http.server
import atexit
import json
import os
import re
import subprocess
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

PORT = int(os.environ.get("BRIDGE_PORT", "3457"))
BIND = os.environ.get("BRIDGE_BIND", "127.0.0.1")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/124.0.0.0 Safari/537.36")
HERE = os.path.dirname(os.path.abspath(__file__))
SMTC_SCRIPT = os.path.join(HERE, "dsh-netease", "scripts", "smtc.ps1")
CONTROL_SCRIPT = os.path.join(HERE, "dsh-netease", "scripts", "smtc-control.ps1")
PS_EXE = r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe"

# 「正在播放」依赖 Windows 的 SMTC（系统媒体会话）。Linux/macOS 上这部分不可用：
# 卡片（推荐/歌单/搜歌）照常工作，只有歌词和控制条不出现。
# 要在 Linux 上补，见 README「非 Windows 怎么办」——本质是把 Smtc 换成 playerctl。
IS_WINDOWS = os.name == "nt"

# 钉钉/会议类也会注册媒体会话
NOISE_APP = ("dingtalk", "teams", "zoom", "slack", "discord", "wechat", "webex")


# ────────────────────────────── 配置 ──────────────────────────────
def load_env():
    path = os.path.join(HERE, ".env")
    values = {}
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, val = line.partition("=")
                val = val.strip()
                if len(val) >= 2 and val[0] == val[-1] and val[0] in "\"'":
                    val = val[1:-1]
                values[key.strip()] = val
    except OSError:
        pass
    return values


ENV = load_env()
COOKIE_RAW = (ENV.get("NETEASE_COOKIE") or "").strip()
CSRF = (ENV.get("NETEASE_CSRF") or "").strip()


def cookie_header():
    if not COOKIE_RAW:
        return ""
    jar = {}
    for part in COOKIE_RAW.split(";"):
        i = part.find("=")
        if i > 0:
            jar[part[:i].strip()] = part[i + 1:].strip()
    if CSRF and "__csrf" not in jar:
        jar["__csrf"] = CSRF
    return "; ".join(f"{k}={v}" for k, v in jar.items())


# ────────────────────────────── 网易云 ──────────────────────────────
# 网易云对短时间内的密集请求会返回 code=405（限流）。**按端点**冷静 5 分钟：
# 实测 /api/search/get 被限时，/api/search/get/web 和 /api/cloudsearch/pc 仍然可用，
# 一个全局冷静会把仅有的可用通道也一起封掉。
_cooldown = {}


def upstream(path, timeout=12):
    key = path.split("?")[0]
    until = _cooldown.get(key, 0.0)
    if time.time() < until:
        return {"code": 405, "cooldown": int(until - time.time())}
    url = "https://music.163.com" + path
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Referer": "https://music.163.com/",
        **({"Cookie": cookie_header()} if COOKIE_RAW else {}),
    })
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = json.loads(resp.read().decode("utf-8", "replace"))
            if isinstance(body, dict) and body.get("code") == 405:
                _cooldown[key] = time.time() + 300
                log("[netease] 405 限流，该端点冷静 300 秒:", key)
            return body
    except urllib.error.HTTPError as e:
        try:
            return json.loads(e.read().decode("utf-8", "replace"))
        except Exception:
            return {"code": e.code, "error": f"HTTP {e.code}"}
    except Exception as e:
        return {"code": -1, "error": str(e)}


def https(url):
    return "https://" + url[7:] if isinstance(url, str) and url.startswith("http://") else (url or "")


def song(s, extra=None):
    artists = (s.get("ar") or s.get("artists") or [])
    album = s.get("al") or s.get("album") or {}
    out = {
        "id": s.get("id"),
        "name": s.get("name"),
        "artists": ", ".join(a.get("name", "") for a in artists if a),
        "album": album.get("name") or "",
        "cover": https(album.get("picUrl") or ""),
        "durationMs": s.get("dt") or s.get("duration") or 0,
    }
    if extra:
        out.update(extra)
    return out


_uid = {"value": None, "at": 0}


def current_uid():
    if _uid["value"] and time.time() - _uid["at"] < 3600:
        return _uid["value"]
    body = upstream("/api/w/nuser/account/get")
    uid = (body.get("account") or {}).get("id")
    if uid:
        _uid["value"] = uid
        _uid["at"] = time.time()
    return uid


# ────────────────────────────── SMTC ──────────────────────────────
LOG_PATH = os.path.join(HERE, "bridge.log")
STATE_PATH = os.path.join(HERE, "smtc-state.json")


def _kill_children():
    """Reap our own long-lived children on exit.

    Windows does not kill children when the parent dies, and smtc.ps1 / volume.ps1
    are long-running. Without this, every bridge restart leaves a PowerShell that
    polls SMTC forever (we leaked 31 of them before noticing). The scripts also
    watch -ParentPid and exit by themselves; this is the belt-and-braces half.
    """
    for obj in (globals().get("SMTC"), globals().get("VOL")):
        proc = getattr(obj, "proc", None) if obj else None
        try:
            if proc and proc.poll() is None:
                proc.terminate()
        except Exception:  # noqa: BLE001
            pass


atexit.register(_kill_children)


def log(*args):
    line = " ".join(str(a) for a in args)
    try:
        with open(LOG_PATH, "a", encoding="utf-8") as f:
            f.write(time.strftime("%Y-%m-%d %H:%M:%S ") + line + "\n")
    except OSError:
        pass


class Smtc:
    """常驻读取器 + 进度估算。

    实测 Edge/Chrome 只会在开始/seek 时上报一次 Position，之后是冻结的，
    所以进度必须按墙钟推；用"上报值本身变了"判断 seek，不能拿它跟估算值比。
    """

    def __init__(self):
        self.lock = threading.Lock()
        self.latest = {"ok": False, "t": 0}
        self.est = None
        self.proc = None
        self._stop = False

    def start(self):
        if not IS_WINDOWS:
            log("[smtc] non-Windows: 播放状态不可用（卡片仍可用，歌词/控制关闭）")
            return
        threading.Thread(target=self._loop, daemon=True).start()
        threading.Thread(target=self._watch_state, daemon=True).start()

    def _apply(self, data):
        if not isinstance(data, dict):
            return
        with self.lock:
            self.latest = data
            try:
                self._estimate(data)
            except Exception as e:  # noqa: BLE001
                log("[smtc] estimate failed:", e)

    def _watch_state(self):
        """读子进程写的状态文件。

        不单靠 stdout：pythonw 启动的子进程拿不到可用的控制台管道，
        管道理应是通的，但实测不可靠，文件没有这个限制。
        """
        last_mtime = 0
        while not self._stop:
            try:
                st = os.stat(STATE_PATH)
                if st.st_mtime != last_mtime:
                    last_mtime = st.st_mtime
                    with open(STATE_PATH, encoding="utf-8") as f:
                        self._apply(json.loads(f.read()))
            except (OSError, ValueError):
                pass
            time.sleep(0.3)

    def _spawn(self):
        try:
            return subprocess.Popen(
                [PS_EXE, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", SMTC_SCRIPT,
                 "-StatePath", STATE_PATH, "-ParentPid", str(os.getpid())],
                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, stdin=subprocess.DEVNULL,
                text=True, encoding="utf-8", errors="replace", bufsize=1,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
        except Exception as e:  # noqa: BLE001
            log("[smtc] spawn failed:", e)
            return None

    def _loop(self):
        # 整个循环包在 try 里：任何异常都不许把线程弄死（死了就再也没有播放状态，
        # 面板会一直显示"没在播"，而且从外面看不出原因）。
        while not self._stop:
            try:
                proc = self._spawn()
                if proc is None:
                    time.sleep(3)
                    continue
                with self.lock:
                    self.proc = proc
                for line in proc.stdout:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        data = json.loads(line)
                    except ValueError:
                        continue
                    if isinstance(data, dict):
                        self._apply(data)
                if self._stop:
                    break
                time.sleep(3)  # 子进程挂了，退避后重启
            except Exception as e:  # noqa: BLE001
                log("[smtc] loop error:", e)
                time.sleep(3)

    def _estimate(self, s):
        now = s.get("t") or int(time.time() * 1000)
        reported = int(s.get("positionMs") or 0)
        end = int(s.get("endMs") or 0)
        key = f"{s.get('title') or ''}|{s.get('artist') or ''}"
        playing = bool(s.get("playing"))
        est = self.est
        if not est or est["key"] != key:
            self.est = {"key": key, "basePos": reported, "baseAt": now,
                        "playing": playing, "lastReported": reported}
            return
        projected = est["basePos"] + (max(0, now - est["baseAt"]) if est["playing"] else 0)
        if reported != est["lastReported"]:
            est["lastReported"] = reported
            if abs(reported - projected) > 1200:
                est["basePos"], est["baseAt"] = reported, now
        elif end and projected > end + 1500:
            est["basePos"], est["baseAt"] = reported, now
        if playing != est["playing"]:
            est["basePos"], est["baseAt"], est["playing"] = projected, now, playing

    def snapshot(self):
        with self.lock:
            latest = dict(self.latest)
            est = dict(self.est) if self.est else None
        if not latest.get("t") or time.time() * 1000 - latest["t"] > 8000:
            return None
        title = (latest.get("title") or "").strip()
        if not title or any(n in (latest.get("app") or "").lower() for n in NOISE_APP):
            return None
        pos = 0
        if est:
            pos = est["basePos"] + (max(0, int(time.time() * 1000) - est["baseAt"]) if est["playing"] else 0)
        end = int(latest.get("endMs") or 0)
        if end and pos > end:
            pos = end
        return {
            "playing": bool(latest.get("playing")),
            "status": latest.get("status") or "",
            "app": latest.get("app") or "",
            "title": title,
            "artist": latest.get("artist") or "",
            "album": latest.get("album") or "",
            "positionMs": int(pos),
            "endMs": end,
        }


VOLUME_STATE = os.path.join(HERE, "volume-state.json")
VOLUME_CMD = os.path.join(HERE, "volume-cmd.json")


class Volume:
    """常驻音量助手。

    一次性调用每次都要 Add-Type 编译那段 C#（实测 ~440ms），拖动会一顿一顿的。
    这里起一个常驻 powershell（只编译一次）：
      - 它每 ~400ms 把当前音量写进 state 文件
      - 每 100ms 看一次 cmd 文件，seq 变大就执行一次 set
    于是 bridge 侧读写都只是两个小文件，不再起进程。
    """

    def __init__(self):
        self.proc = None
        self.seq = 0
        self.lock = threading.Lock()

    def start(self):
        if not IS_WINDOWS:
            return
        with self.lock:
            if self.proc and self.proc.poll() is None:
                return
            try:
                self.proc = subprocess.Popen(
                    [PS_EXE, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", VOLUME_SCRIPT,
                     "-Action", "daemon", "-StatePath", VOLUME_STATE, "-CmdPath", VOLUME_CMD, "-ParentPid", str(os.getpid())],
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, stdin=subprocess.DEVNULL,
                    creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
                )
                log("[volume] daemon started, pid", getattr(self.proc, "pid", "?"))
            except Exception as e:  # noqa: BLE001
                log("[volume] spawn failed:", e)
                self.proc = None

    def set(self, percent, app):
        self.start()
        with self.lock:
            proc = self.proc
            if proc is None or proc.poll() is not None:
                # 谎报成功比报错更糟：滑块会停在新位置而实际音量没动
                return False
            self.seq += 1
            payload = {"seq": self.seq, "app": app, "set": int(percent)}
            try:
                tmp = VOLUME_CMD + ".tmp"
                with open(tmp, "w", encoding="utf-8") as f:
                    json.dump(payload, f)
                os.replace(tmp, VOLUME_CMD)
                return True
            except OSError as e:  # noqa: BLE001
                log("[volume] write cmd failed:", e)
                return False

    def snapshot(self):
        try:
            with open(VOLUME_STATE, encoding="utf-8") as f:
                return json.load(f)
        except (OSError, ValueError):
            return None


SMTC = Smtc()
VOL = Volume()


# ────────────────────────────── 歌词 ──────────────────────────────
_lyric_cache = {}
_song_cache = {}
_artist_cache = {}
_dur_cache = {}

# ── 磁盘缓存（安全第一：有上限、有防抖、有熔断，不会无限增长）──
CACHE_FILE = os.path.join(HERE, "cache.json")
CACHE_TMP = CACHE_FILE + ".tmp"
CACHE_MAX_BYTES = 2 * 1024 * 1024    # 文件硬上限 2MB，超了丢最旧的
CACHE_MAX_SONGS = 800
CACHE_MAX_LYRICS = 300
CACHE_MAX_ARTISTS = 40
CACHE_LYRIC_MAX_BYTES = 40 * 1024    # 单首歌歌词上限
CACHE_SAVE_INTERVAL = 8.0            # 两次落盘最小间隔（防写风暴）
CACHE_FAIL_LIMIT = 3                 # 连续失败 N 次熔断
CACHE_FAIL_COOLDOWN = 600.0


class Store:
    """把解析结果落盘，重启/限流时不必重来。

    安全约束（写进代码，不靠自觉）：
      * 文件大小硬上限 2MB：先按条数裁，再按字节裁，最后兜底只写最小结构；
      * 只在**新增条目**后标脏，两次落盘至少间隔 8 秒 —— 不可能递归触发或风暴写；
      * 读路径永不写盘；写盘在锁外进行，异常只计数不重试；
      * 连续失败 3 次熔断 10 分钟，避免在坏盘上反复撞；
      * 原子写（tmp + os.replace）；坏文件只隔离一次（改名 .bad），绝不反复覆盖。
    """

    def __init__(self, path):
        self.path = path
        self.lock = threading.Lock()
        self.dirty = False
        self.last_save = 0.0
        self.fails = 0
        self.disabled_until = 0.0
        self.writes = 0
        self.skipped = 0

    def load(self):
        try:
            with open(self.path, encoding="utf-8") as f:
                raw = json.load(f)
        except FileNotFoundError:
            return {}
        except Exception as e:  # noqa: BLE001
            try:
                os.replace(self.path, self.path + ".bad")
            except Exception:  # noqa: BLE001
                pass
            log("[cache] 文件损坏，已隔离为 .bad，从空开始:", e)
            return {}
        return raw if isinstance(raw, dict) else {}

    def touch(self):
        """标记有新增，按 8 秒节流落盘。只在新增条目后调用。"""
        now = time.time()
        if now < self.disabled_until:
            return
        with self.lock:
            self.dirty = True
            if now - self.last_save < CACHE_SAVE_INTERVAL:
                self.skipped += 1
                return
            self.dirty = False
            self.last_save = now
            blob = self._build()
            self.writes += 1
        if blob:
            self._write(blob)

    @staticmethod
    def _trim(d, limit):
        if not isinstance(d, dict):
            return {}
        if len(d) <= limit:
            return d
        def ts_of(v):
            # songs 是 (sid, confident, ts)，lyrics 是 (lines, ts) —— 时间戳都在最后
            try:
                return float(v[-1])
            except Exception:  # noqa: BLE001
                return 0.0
        items = sorted(d.items(), key=lambda kv: ts_of(kv[1]))
        return dict(items[-limit:])

    def _build(self):
        songs = self._trim(_song_cache, CACHE_MAX_SONGS)
        artists = self._trim(_artist_cache, CACHE_MAX_ARTISTS)
        lyrics = self._trim(_lyric_cache, CACHE_MAX_LYRICS)
        ok = {}
        for k, v in lyrics.items():
            try:
                if not v or not isinstance(v[0], list) or not v[0]:
                    continue
                if len(json.dumps(v[0], ensure_ascii=False).encode("utf-8")) > CACHE_LYRIC_MAX_BYTES:
                    continue
                ok[k] = v
            except Exception:  # noqa: BLE001
                continue
        # str() everywhere: a dict can otherwise hold both 123 and "123" and emit
        # duplicate keys in the JSON (observed in the wild, broke the loader).
        ok = {str(k): v for k, v in ok.items()}
        data = {"v": 1, "songs": songs, "artists": artists, "lyrics": ok}
        for _ in range(8):           # 最多裁 8 轮，每轮至少丢 1/4
            try:
                blob = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
            except Exception:  # noqa: BLE001
                return ""
            if len(blob.encode("utf-8")) <= CACHE_MAX_BYTES:
                return blob
            items = sorted(data["lyrics"].items(), key=lambda kv: float(kv[1][1] or 0))
            if len(items) > 1:
                data["lyrics"] = dict(items[len(items) // 4 or 1:])
            elif data["artists"]:
                data["artists"] = {}
            elif data["songs"]:
                data["songs"] = {}
            else:
                return ""
        return ""

    def _write(self, blob):
        try:
            with open(CACHE_TMP, "w", encoding="utf-8") as f:
                f.write(blob)
            os.replace(CACHE_TMP, self.path)
            self.fails = 0
        except Exception as e:  # noqa: BLE001
            self.fails += 1
            if self.fails >= CACHE_FAIL_LIMIT:
                self.disabled_until = time.time() + CACHE_FAIL_COOLDOWN
                log("[cache] 连续写失败，暂停 10 分钟:", e)
            else:
                log("[cache] 写盘失败:", e)


STORE = Store(CACHE_FILE)


def _flush_loop():
    """后台兜底：有脏数据且已过节流窗口才落盘。最大 1 次/8 秒，读标志位不写盘。"""
    while True:
        time.sleep(5)
        try:
            if STORE.dirty and (time.time() - STORE.last_save) >= CACHE_SAVE_INTERVAL:
                STORE.touch()
        except Exception as e:  # noqa: BLE001
            log("[cache] flush 线程异常:", e)


def _load_cache():
    """启动时载入，丢弃已过期条目（失败条目会被 TTL 自然筛掉）。"""
    raw = STORE.load()
    now = time.time()
    # lyrics are keyed by song id (int); JSON round-trips keys as str, so without
    # int() here a restarted bridge kept a parallel "12345" entry that never got hit
    # and wrote duplicate keys back to disk.
    for name, dst in (("songs", _song_cache), ("artists", _artist_cache), ("lyrics", _lyric_cache)):
        kept = 0
        for k, v in (raw.get(name) or {}).items():
            try:
                if not isinstance(v, list) or len(v) < 2:
                    continue
                if now - float(v[-1]) >= TTL_OK:
                    continue
                if name == "lyrics":
                    try:
                        k = int(k)
                    except (TypeError, ValueError):
                        continue
                dst[k] = v
                kept += 1
            except Exception:  # noqa: BLE001
                continue
        log("[cache] %s 载入 %d 条" % (name, kept))
TTL_OK = 21600      # 正常结果缓存 6 小时
TTL_FAIL = 60        # 失败(限流/空结果)只缓存 60 秒，别让一次 405 把歌词空半天


def parse_lrc(raw):
    out = []
    for line in str(raw or "").splitlines():
        if not line.startswith("["):
            continue
        # 一行可能带多个时间戳
        stamps, rest = [], line
        while rest.startswith("["):
            close = rest.find("]")
            if close < 0:
                break
            tag = rest[1:close]
            parts = tag.replace(":", ".").split(".")
            if len(parts) >= 2 and parts[0].isdigit() and parts[1].isdigit():
                ms = int(parts[0]) * 60000 + int(parts[1]) * 1000
                if len(parts) >= 3 and parts[2].isdigit():
                    ms += int((parts[2] + "00")[:3])
                stamps.append(ms)
            rest = rest[close + 1:]
        text = rest.strip()
        if text and stamps:
            for t in stamps:
                out.append({"t": t, "text": text})
    out.sort(key=lambda x: x["t"])
    return out


def merge_translation(lines, tr_raw):
    tr = parse_lrc(tr_raw)
    if not tr:
        return lines
    by_time = {x["t"]: x["text"] for x in tr}
    for line in lines:
        if line["t"] in by_time:
            line["tr"] = by_time[line["t"]]
            continue
        best = None
        for c in tr:
            d = abs(c["t"] - line["t"])
            if d <= 400 and (best is None or d < best[0]):
                best = (d, c["text"])
        if best:
            line["tr"] = best[1]
    return lines


# 搜索端点的优先顺序。老 /api/search/get 最容易被限，实测被限时 web 版仍然可用。
SEARCH_PATHS = ("/api/search/get/web", "/api/cloudsearch/pc", "/api/search/get")


def _search(query, limit=10, offset=0):
    """搜歌，多入口自动回退，返回 songs 列表。

    为什么要三个入口：实测 405 会**只限某一个端点**——
    /api/search/get 返回 405 时，/api/search/get/web、/api/cloudsearch/pc 都还是 200。
    只用一个入口，一被限就整片歌词消失（真实事故）。
    """
    q = urllib.parse.quote(query)
    for base in SEARCH_PATHS:
        try:
            body = upstream("%s?s=%s&type=1&limit=%d&offset=%d" % (base, q, limit, offset))
        except Exception:  # noqa: BLE001
            continue
        songs = ((body.get("result") or {}).get("songs") or [])
        if songs:
            return songs
    return []


def _clean_title(t):
    """去掉标题里的版本后缀，再拿去搜。

    SMTC 给的是客户端显示名，常带尾巴：`なんでもないや (movie ver.)`、
    `カラノココロ ～NARUTOオープニングver.～`、`曲名 - Live`。
    带着这些去搜，命中率明显变差（实测带后缀时歌词 0 行）。
    只做保守清洗：括号组、波浪线包裹的副标题。
    """
    s = str(t or "")
    s = re.sub(r"[（(\[【][^)）\]】]*[)）\]】]", " ", s)
    s = re.sub(r"～[^～]*～", " ", s)
    return " ".join(s.split()).strip()


def _norm(s):
    return "".join(ch for ch in str(s or "").lower()
                   if ch not in " -_()（）[]{}.,'\"!?:;、&")


# ── 取歌单全部曲目 ──
# 坑：/api/v6/playlist/detail 对"收藏/共享"类歌单会**硬截断在 20 首**（n=1000 也没用），
# 但同一个响应里的 trackIds 是完整的。所以先拿 trackIds，再按 100 个一批取详情补齐。
# 实例：共享歌单 300 首、回忆00后 108 首、BiBiPiano 103 首，全都只返回 20 首。
def fetch_playlist_tracks(pid):
    body = upstream("/api/v6/playlist/detail?id=%s&n=1000" % pid)
    pl = body.get("playlist") or {}
    tracks = pl.get("tracks") or []
    ids = [t.get("id") for t in (pl.get("trackIds") or []) if t.get("id")]
    if not ids or len(tracks) >= len(ids):
        return tracks
    have = {t.get("id"): t for t in tracks}
    missing = [i for i in ids if i not in have]
    for k in range(0, len(missing), 100):
        chunk = missing[k:k + 100]
        try:
            d = upstream("/api/song/detail?ids=" + urllib.parse.quote(json.dumps(chunk)))
        except Exception:  # noqa: BLE001
            break
        if d.get("code") == 405:
            break
        for s in (d.get("songs") or []):
            if s.get("id"):
                have[s["id"]] = s
        time.sleep(0.2)          # 别把接口打爆
    return [have[i] for i in ids if i in have]


# ── 我的歌单索引（封面/歌曲正确性的最可靠来源）──
# 弹窗里那些封面之所以全对，是因为它们来自**你自己的歌单**：playlist detail
# 返回的每首歌自带 al.picUrl。所以播放中的歌也这样找——先在你的库里按
# 「歌名+歌手」查，命中就用它的 songId 和封面，不依赖搜索排序。
_library = {"map": None, "at": 0.0, "building": False, "cool": 0.0}


# ── 播放记录索引（解决"官方版不在搜索结果里"的主力）──
# 账号的播放记录（/api/v1/play/record）里存的是**你实际播放过的歌**，带准确 id 和封面。
# 实例：The Love That Binds Us -> 548145364（《Automemories》），而歌名搜索给的是
# 1830347873（别人的翻奏单曲）。所以这是比搜索可靠得多的来源。
_history = {"map": None, "at": 0.0, "building": False, "cool": 0.0}


def _history_index():
    """取播放记录索引；没建好就后台建，不阻塞 /now。"""
    now = time.time()
    if _history["map"] is not None and now - _history["at"] < TTL_OK:
        return _history["map"]
    if not _history["building"] and now >= _history["cool"]:
        _history["building"] = True
        threading.Thread(target=_history_build, daemon=True).start()
    return _history["map"] or {}


def _history_build():
    try:
        uid = current_uid()
        if not uid:
            # cookie 过期时 current_uid() 每次都打一次上游；不退避会变成每秒一个线程
            _history["cool"] = time.time() + 300
            return {}
        idx = {}
        for typ in (0, 1):          # 0=全部（按次数）1=本周
            body = upstream("/api/v1/play/record?uid=%s&type=%d&limit=100" % (uid, typ))
            if body.get("code") == 405:
                _history["cool"] = time.time() + 300
                break
            for row in (body.get("allData") or body.get("weekData") or []):
                s = row.get("song") or {}
                sid = s.get("id")
                name = _norm(_clean_title(s.get("name")))
                if not sid or not name:
                    continue
                al = s.get("al") or {}
                rec = {"id": sid, "cover": https(al.get("picUrl") or "")}
                idx.setdefault(name + "|", rec)
                for a in (s.get("ar") or []):
                    na = _norm(a.get("name"))
                    if na:
                        idx.setdefault(name + "|" + na, rec)
            time.sleep(0.2)
        if idx:
            _history["map"] = idx
            _history["at"] = time.time()
            log("[history] 播放记录索引 %d 条" % len(idx))
        return idx
    finally:
        _history["building"] = False


def _library_index():
    """取歌单索引；没建好就在后台建，**不阻塞** /now。"""
    now = time.time()
    if _library["map"] is not None and now - _library["at"] < TTL_OK:
        return _library["map"]
    if not _library["building"] and now >= _library["cool"]:
        _library["building"] = True
        threading.Thread(target=_library_build, daemon=True).start()
    return _library["map"] or {}


def _library_build():
    try:
        uid = current_uid()
        if not uid:
            _library["cool"] = time.time() + 300
            return {}
        if body.get("code") == 405:
            _library["cool"] = time.time() + 300
            return _library["map"] or {}
        idx = {}
        for p in (body.get("playlist") or []):
            pid = p.get("id")
            if not pid:
                continue
            try:
                rows = fetch_playlist_tracks(pid)
            except Exception:  # noqa: BLE001
                continue
            for s in (rows or []):
                al = s.get("al") or s.get("album") or {}
                cov = https(al.get("picUrl") or "")
                sid = s.get("id")
                name = _norm(_clean_title(s.get("name")))
                if not sid or not name:
                    continue
                rec = {"id": sid, "cover": cov}
                idx.setdefault(name + "|", rec)
                for a in (s.get("artists") or s.get("ar") or []):
                    na = _norm(a.get("name"))
                    if na:
                        idx.setdefault(name + "|" + na, rec)
            time.sleep(0.25)
        if idx:
            _library["map"] = idx
            _library["at"] = time.time()
            log("[library] 歌单索引 %d 条" % len(idx))
        return idx
    finally:
        _library["building"] = False


# ── 非阻塞解析 ───────────────────────────────────────────────
# 冷缓存时一次解析要打 3~6 次上游（每次 timeout 12s），而前端每秒轮询且没有去重。
# 实测最坏单个 /now 能阻塞 100 秒以上：浏览器对同一 host 的连接被占满，整个面板
# 卡死且不报错，同时这几路并发又把自己打进 405。所以解析全部挪到后台线程，
# /now 只读缓存（毫秒级），下一轮轮询自然就拿到结果了。
_resolving = {}
_resolving_lock = threading.Lock()


def _resolve_full(title, artist):
    """把一首歌的家底查齐并写进缓存（只由后台线程调用）。"""
    key = (title + "|" + artist).lower()
    ka = _norm(_clean_title(title))
    kb = _norm(artist)
    sid = None
    try:
        lib = _library_index()
        rec = (lib.get(ka + "|" + kb) or lib.get(ka + "|")) if lib else None
        if not rec:
            his = _history_index()
            rec = (his.get(ka + "|" + kb) or his.get(ka + "|")) if his else None
        if rec and rec.get("id"):
            sid = rec["id"]
            _song_cache[key] = (sid, True, time.time())
            STORE.touch()
    except Exception:  # noqa: BLE001
        pass
    if not sid:
        sid, confident = resolve_song(title, artist)
    else:
        confident = True
    if sid:
        lyrics_for(sid)
        detail_for(sid)
    return sid, confident


def _resolve_worker(title, artist, key):
    try:
        _resolve_full(title, artist)
    except Exception as e:  # noqa: BLE001
        log("[resolve] failed:", e)
    finally:
        with _resolving_lock:
            _resolving.pop(key, None)


def _ensure_resolved(title, artist):
    """缓存里没有就起后台线程；同一首歌 30 秒内最多一个在飞。"""
    key = (title + "|" + artist).lower()
    hit = _song_cache.get(key)
    fresh = hit and (time.time() - hit[2] < TTL_OK)
    if fresh:
        sid = hit[0]
        if not sid or _lyric_cache.get(sid):
            return
    with _resolving_lock:
        if time.time() - _resolving.get(key, 0.0) < 30:
            return
        _resolving[key] = time.time()
    threading.Thread(target=_resolve_worker, args=(title, artist, key), daemon=True).start()


def _cached_resolution(title, artist):
    """只查缓存，绝不联网。返回 (songId, 是否可信, 封面)。"""
    key = (title + "|" + artist).lower()
    hit = _song_cache.get(key)
    if not hit or time.time() - hit[2] >= TTL_OK:
        return None, False, ""
    sid, confident = hit[0], bool(hit[1])
    if not sid:
        return None, False, ""
    ka = _norm(_clean_title(title))
    kb = _norm(artist)
    cover = ""
    lib = _library.get("map") or {}
    his = _history.get("map") or {}
    rec = (lib.get(ka + "|" + kb) or lib.get(ka + "|")
           or his.get(ka + "|" + kb) or his.get(ka + "|"))
    if rec:
        cover = rec.get("cover") or ""
    if not cover:
        d = _dur_cache.get(sid)
        if d:
            cover = (d[0] or {}).get("cover") or ""
    return sid, confident, cover


def resolve_song(title, artist):
    """返回 (songId, 是否可信)。

    选取顺序**刻意保持原样**（精确歌名 → 部分匹配 → 第一条），因为歌词质量
    依赖它，改排序会连带把歌词换掉（试过：歌词从几十行掉到 2 行）。

    新增的第二个返回值只用来判断"能不能信它的封面"：
    歌名搜索经常匹配到**别人的翻奏版**——实例 The Love That Binds Us / Evan Call，
    搜 30 条全是别人的翻奏，官方那版（Violet Evergarden: Automemories）根本不在结果里。
    只按歌名取第一条，就会把别人专辑的封面贴在唱片上（真的发生过）。
    所以只有「该曲的 artists 里含本次播放的歌手」才算可信；不可信时不给封面。
    """
    key = f"{title}|{artist}".lower()
    hit = _song_cache.get(key)
    if hit and time.time() - hit[2] < 21600:
        return hit[0], hit[1]
    base = _clean_title(title) or title
    q = f"{base} {artist}".strip()
    songs = _search(q, 10)
    want, want_art = _norm(base), _norm(artist)
    # 排序规则（得分高者胜）：
    #   歌名精确 + 歌手对 150  |  歌名精确 100  |  歌名部分 + 歌手对 90
    #   歌名部分 40           |  只对歌手 30   |  都不对 0
    # 关键：**只对歌名 永远压过 只对歌手**，否则会挑到同歌手但完全不同名的曲子。
    # 150 才算可信（能拿它的封面）；否则歌词照用，但封面不给。
    pick, best = None, -1
    for s in songs:
        name = _norm(s.get("name"))
        arts = _norm(",".join((a.get("name") or "") for a in (s.get("artists") or [])))
        name_ok = bool(want) and name == want
        name_part = bool(want) and bool(name) and (want in name or name in want)
        art_ok = bool(want_art) and bool(arts) and (want_art in arts)
        if name_ok and art_ok:
            score = 150
        elif name_ok:
            score = 100
        elif name_part and art_ok:
            score = 90
        elif name_part:
            score = 40
        elif art_ok:
            score = 30
        else:
            score = 0
        if score > best:
            pick, best = s, score
    # 歌名搜索没拿到「歌名+歌手都对」的，再按歌手搜一次找同名曲。
    # 找到就换成正主（歌词和封面都跟着变正确），找不到就维持原选取（歌词照用，封面不给）。
    if best < 150 and want_art:
        for s in _artist_tracks(artist):
            if _norm(s.get("name")) != want:
                continue
            arts = _norm(",".join((a.get("name") or "") for a in (s.get("artists") or [])))
            if want_art in arts:
                pick, best = s, 150
                break
    sid = (pick or {}).get("id")
    confident = best >= 150
    _song_cache[key] = (sid, confident, time.time())
    if sid and not confident:
        # 只是"猜"的映射（多半是翻奏版），别锁 6 小时；30 分钟后允许更好的来源改写
        _song_cache[key] = (sid, confident, time.time() - TTL_OK + 1800)
    STORE.touch()
    if not sid:
        # 没解析出来多半是临时限流(405)或空结果，短缓存，别锁 6 小时
        _song_cache[key] = (sid, confident, time.time() - TTL_OK + TTL_FAIL)
    return sid, confident

def _artist_tracks(artist):
    """该歌手搜出来的歌（缓存 6 小时）。

    歌名搜索常被翻奏版淹没：搜「晴天 周杰伦」，前 10 条里没有一条是周杰伦本人。
    但按歌手搜就能直接拿到正主（周杰伦/晴天 -> id=186016，专辑《叶惠美》）。
    代价是每个歌手一次请求（分两页共 100 条），按歌手名缓存。
    """
    hit = _artist_cache.get(artist)
    if hit and time.time() - hit[1] < 21600:
        return hit[0]
    out = []
    for off in (0, 50):
        try:
            songs = _search(artist, 50, offset=off)
        except Exception:  # noqa: BLE001
            songs = []
        if not songs:
            break
        # 只留回退匹配要用的字段。完整对象带 album/artists 嵌套，
        # 100 首就能撑到几十 KB，落盘会迅速吃掉预算。
        for s in songs:
            try:
                out.append({
                    "id": s.get("id"),
                    "name": s.get("name"),
                    "artists": [{"name": (a.get("name") or "")} for a in (s.get("artists") or [])],
                })
            except Exception:  # noqa: BLE001
                continue
        if len(out) >= 60:
            break
    _artist_cache[artist] = (out, time.time())
    STORE.touch()
    if not out:
        _artist_cache[artist] = (out, time.time() - TTL_OK + TTL_FAIL)
    return out


def lyrics_for(song_id):
    hit = _lyric_cache.get(song_id)
    if hit and time.time() - hit[1] < 21600:
        return hit[0]
    body = upstream(f"/api/song/lyric?id={song_id}&lv=-1&tv=-1")
    lines = merge_translation(parse_lrc((body.get("lrc") or {}).get("lyric")),
                              (body.get("tlyric") or {}).get("lyric"))
    _lyric_cache[song_id] = (lines, time.time())
    if not lines:
        # 空歌词多半是限流/网络抖动，别按 6 小时锁死（否则整首一直显示"没有歌词"）
        _lyric_cache[song_id] = (lines, time.time() - TTL_OK + TTL_FAIL)
    STORE.touch()
    return lines


def detail_for(song_id):
    """歌曲详情的兜底字段：时长 + 封面。

    SMTC 只给标题/歌手/位置，两样东西它不给：
      - endMs：桌面客户端（cloudmusic.exe）恒为 0（浏览器才有值）。没有总时长，
        前端进度条不填、不显示时间、点击跳转也失效（client.js 里 `if (!lastNow.endMs) return;`）。
      - 封面：两边都没有。卡片右下角那个按钮要拿它当图标。
    两个字段一次请求拿全，按 songId 缓存 6 小时。
    """
    if not song_id:
        return {}
    hit = _dur_cache.get(song_id)
    if hit and time.time() - hit[1] < 21600:
        return hit[0]
    info = {}
    try:
        body = upstream("/api/song/detail?ids=" + urllib.parse.quote(json.dumps([song_id])))
        songs = body.get("songs") or []
        if songs:
            s = songs[0]
            # 老接口用 duration，新接口(/api/v3)用 dt —— 两个都取，别只认一个
            info["ms"] = int(s.get("dt") or s.get("duration") or 0)
            # 封面字段在三个地方飘：al.picUrl / album.picUrl / album.blurPicUrl，
            # 老接口这里 al 常是 null，album 才有；只认 al.picUrl 会一直拿到空。
            album = s.get("al") or s.get("album") or {}
            info["cover"] = https(album.get("picUrl") or album.get("blurPicUrl") or "")
    except Exception:  # noqa: BLE001
        info = {}
    _dur_cache[song_id] = (info, time.time())
    STORE.touch()
    if not info:
        _dur_cache[song_id] = (info, time.time() - TTL_OK + TTL_FAIL)
    return info


def duration_for(song_id):
    return detail_for(song_id).get("ms") or 0


# ────────────────────────────── 音量 / 唤起客户端 ──────────────────────────────
VOLUME_SCRIPT = os.path.join(HERE, "dsh-netease", "scripts", "volume.ps1")

_VOL_PROC = (("cloudmusic", "cloudmusic"), ("qqmusic", "QQMusic"), ("spotify", "Spotify"),
             ("msedge", "msedge"), ("chrome", "chrome"), ("firefox", "firefox"), ("brave", "brave"))


def volume_target(snap):
    """SMTC 的 app 是 AUMID 形态，音量脚本要的是进程名。"""
    app = ((snap or {}).get("app") or "").lower()
    for hint, proc in _VOL_PROC:
        if hint in app:
            return proc
    return "cloudmusic"


def orpheus_registered():
    """orpheus:// 是网易云客户端注册的协议。HKCR 合并了 HKLM/HKCU，查这一处就够。"""
    if not IS_WINDOWS:
        return False
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CLASSES_ROOT, r"orpheus\shell\open\command"):
            return True
    except OSError:
        return False


# ────────────────────────────── HTTP ──────────────────────────────
def control(action, ms=None):
    if not IS_WINDOWS:
        return {"ok": False, "error": "smtc-unsupported"}
    # 只操作"界面上正在显示的那个会话"。不传 App/Title 的话，暂停之后
    # GetCurrentSession() 会退到钉钉之类的应用，按播放/暂停会打到别人身上。
    snap = SMTC.snapshot()
    if not snap:
        return {"ok": False, "error": "no-session"}
    args = [PS_EXE, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", CONTROL_SCRIPT,
            "-Action", action, "-App", snap["app"], "-Title", snap["title"]]
    if ms is not None:
        args += ["-Ms", str(int(ms))]
    try:
        done = subprocess.run(args, capture_output=True, text=True, encoding="utf-8",
                              errors="replace", timeout=15,
                              creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        for line in reversed((done.stdout or "").strip().splitlines()):
            line = line.strip()
            if line.startswith("{"):
                return json.loads(line)
        return {"ok": False, "error": "no-output", "stderr": (done.stderr or "")[:200]}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)}


def handle(path, query):
    if path == "/health":
        return 200, {"ok": True, "smtc": SMTC.snapshot() is not None, "loggedIn": bool(COOKIE_RAW)}

    if path == "/status":
        if not COOKIE_RAW:
            return 200, {"loggedIn": False, "reason": "no-cookie"}
        body = upstream("/api/w/nuser/account/get")
        if body.get("code") != 200:
            return 200, {"loggedIn": False, "reason": "expired" if body.get("code") == 301 else "upstream"}
        prof = body.get("profile") or {}
        return 200, {"loggedIn": True, "nickname": prof.get("nickname") or "",
                     "avatar": https(prof.get("avatarUrl") or ""), "userId": (body.get("account") or {}).get("id")}

    if path == "/now":
        snap = SMTC.snapshot()
        if not snap:
            return 200, {"playing": False, "idle": True,
                         "reason": "smtc-unsupported" if not IS_WINDOWS else "nothing-playing"}
        sid, confident, lib_cover = None, False, ""
        lines = []
        if COOKIE_RAW:
            # 只读缓存；缺东西就让后台线程去查，本次请求立刻返回。
            try:
                _ensure_resolved(snap["title"], snap["artist"])
                sid, confident, lib_cover = _cached_resolution(snap["title"], snap["artist"])
                if sid:
                    hit = _lyric_cache.get(sid)
                    if hit:
                        lines = hit[0]
            except Exception:  # noqa: BLE001
                pass
        # 详情一次拿两样：endMs 缺失时补时长（客户端恒为 0），以及封面（SMTC 不给）。
        # 同样只读缓存：/_dur_cache 由后台 worker 填，没填上就先不补（下一轮就有了）。
        if sid:
            cached = _dur_cache.get(sid)
            info = cached[0] if cached else {}
            if not snap.get("endMs"):
                snap["endMs"] = (info or {}).get("ms") or 0
            # 封面：即使"歌手没对上"也给——实测多数曲子按歌名匹配到的就是同一张
            # 专辑（GLASSY SKY 这类）；宁可偶尔贴错，也不要整片没有封面。
            # `matched` 仍放在返回值里，需要时可用于诊断/后续改进。
            if lib_cover:
                snap["cover"] = lib_cover      # 来自自己的歌单，最准
            elif info.get("cover"):
                snap["cover"] = info["cover"]
        return 200, {**snap, "songId": sid, "matched": confident, "lines": lines,
                    "at": int(time.time() * 1000)}

    if path == "/control":
        action = (query.get("action") or ["toggle"])[0]
        return 200, control(action)

    if path == "/seek":
        ms = (query.get("ms") or ["0"])[0]
        return 200, control("seek", int(float(ms)))

    if path == "/volume":
        if not IS_WINDOWS:
            return 200, {"ok": False, "error": "volume-unsupported"}
        target = volume_target(SMTC.snapshot())
        value = (query.get("value") or [""])[0].strip()
        if value.isdigit():
            # 只写命令文件（微秒级），常驻进程在 <=100ms 内执行
            return 200, {"ok": VOL.set(int(value), target), "queued": int(value), "app": target}
        snap = VOL.snapshot()
        if snap is None:
            VOL.start()
            for _ in range(20):          # 首次要等它把 C# 编译完（~0.8s）
                time.sleep(0.15)
                snap = VOL.snapshot()
                if snap:
                    break
        return 200, snap or {"ok": False, "error": "volume-helper-starting"}

    if path == "/open":
        sid = (query.get("song") or [""])[0].strip()
        if not sid.isdigit():
            return 400, {"ok": False, "error": "bad-song"}
        scheme = "orpheus://song/" + sid + "/?autoplay=1"
        web = "https://music.163.com/#/song?id=" + sid
        registered = orpheus_registered()
        if (query.get("dry") or ["0"])[0] == "1":
            # 干跑：只回报会走哪条路，不真的唤起（自动化验证用）
            return 200, {"ok": True, "dry": True, "registered": registered,
                         "scheme": scheme, "web": web}
        if registered:
            try:
                os.startfile(scheme)  # Windows-only；打开了桌面客户端
                return 200, {"ok": True, "via": "orpheus", "song": sid}
            except Exception:  # noqa: BLE001
                pass
        try:
            import webbrowser
            webbrowser.open(web)
            return 200, {"ok": True, "via": "web", "song": sid}
        except Exception as exc:  # noqa: BLE001
            return 200, {"ok": False, "error": str(exc)}

    if path == "/daily":
        if not COOKIE_RAW:
            return 401, {"error": "no-cookie"}
        body = upstream("/api/v3/discovery/recommend/songs")
        if body.get("code") != 200:
            return 502, {"error": "upstream", "code": body.get("code")}
        return 200, {"songs": [song(s) for s in ((body.get("data") or {}).get("dailySongs") or [])]}

    if path == "/playlists":
        if not COOKIE_RAW:
            return 401, {"error": "no-cookie"}
        uid = current_uid()
        if not uid:
            return 502, {"error": "no-uid"}
        body = upstream(f"/api/user/playlist?uid={uid}&limit=100&offset=0")
        if body.get("code") != 200:
            return 502, {"error": "upstream", "code": body.get("code")}
        out = []
        for p in body.get("playlist") or []:
            out.append({
                "id": p.get("id"),
                "name": p.get("name") or "",
                "count": p.get("trackCount") or 0,
                "cover": https(p.get("coverImgUrl") or ""),
                "creator": ((p.get("creator") or {}).get("nickname")) or "",
                "mine": (p.get("creator") or {}).get("userId") == uid,
            })
        return 200, {"playlists": out}

    if path == "/playlist":
        pid = (query.get("id") or [""])[0]
        if not pid.isdigit():
            return 400, {"error": "bad-id"}
        body = upstream(f"/api/v6/playlist/detail?id={pid}&n=1000")
        if body.get("code") != 200:
            return 502, {"error": "upstream", "code": body.get("code")}
        pl = body.get("playlist") or {}
        # 收藏/共享歌单会被接口截断在 20 首，fetch_playlist_tracks 用 trackIds 补齐
        return 200, {
            "id": pl.get("id"),
            "name": pl.get("name") or "",
            "cover": https(pl.get("coverImgUrl") or ""),
            "count": pl.get("trackCount") or 0,
            "songs": [song(t) for t in fetch_playlist_tracks(pid)],
        }

    if path == "/search":
        q = (query.get("q") or [""])[0].strip()
        if not q:
            return 400, {"error": "missing-q"}
        limit = int((query.get("limit") or ["15"])[0])
        body = upstream("/api/search/get?s=" + urllib.parse.quote(q) + f"&type=1&limit={limit}&offset=0")
        if body.get("code") != 200:
            return 502, {"error": "upstream", "code": body.get("code")}
        raw = ((body.get("result") or {}).get("songs") or [])
        ids = [s.get("id") for s in raw if s.get("id")]
        detail = {}
        if ids:
            d = upstream("/api/song/detail?ids=" + urllib.parse.quote(json.dumps(ids)))
            if d.get("code") == 200:
                detail = {x.get("id"): x for x in (d.get("songs") or [])}
        return 200, {"songs": [song(detail.get(s.get("id"), s)) for s in raw]}

    return 404, {"error": "not found"}


class Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")

    def _send(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        try:
            status, payload = handle(parsed.path, urllib.parse.parse_qs(parsed.query))
        except Exception as e:  # noqa: BLE001
            status, payload = 500, {"error": str(e)}
        self._send(status, payload)

    def log_message(self, *args):
        pass


class Threaded(http.server.ThreadingHTTPServer):
    daemon_threads = True


if __name__ == "__main__":
    _load_cache()
    threading.Thread(target=_flush_loop, daemon=True).start()
    SMTC.start()
    log(f"[bridge] started http://{BIND}:{PORT} cookie={'yes' if COOKIE_RAW else 'NO'}")
    print(f"[bridge] http://{BIND}:{PORT}  cookie={'yes' if COOKIE_RAW else 'NO'}", flush=True)
    Threaded((BIND, PORT), Handler).serve_forever()
