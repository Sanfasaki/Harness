#!/usr/bin/env python3
"""keepalive —— 保证两个本地服务活着。

为什么需要：`server.py` / `bridge.py` 是由 DSH 的进程树启动的，DSH 重启会把它们
一起带走；而 Startup 里的快捷方式只在登录时跑一次。结果就是"重启 DSH 之后工具没了"，
而且 dsh-mcp-client 对首次连接失败不重试、断线重连也有次数上限，掉了就回不来。

这个守护进程自己独立存活（登录时由 Startup 启动），每 15 秒探一次端口，
哪个没起来就拉起来。可以随便重启 DSH，服务会自己补回来。
"""
import os
import socket
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
LOG = os.path.join(HERE, "keepalive.log")

# 跟随当前解释器所在的解释器目录，不写死 C:\Python312——别的机器不一定是那个路径。
PYTHONW = os.path.join(os.path.dirname(sys.executable), "pythonw.exe")
if not os.path.exists(PYTHONW):
    PYTHONW = sys.executable

SERVICES = [
    ("server.py", 3456),
    ("bridge.py", 3457),
]


def log(msg):
    line = time.strftime("%Y-%m-%d %H:%M:%S ") + msg
    try:
        with open(LOG, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except OSError:
        pass


def alive(port):
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=1.5):
            return True
    except OSError:
        return False


def start(script):
    subprocess.Popen(
        [PYTHONW, os.path.join(HERE, script)],
        cwd=HERE,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )


if __name__ == "__main__":
    log("[keepalive] started")
    while True:
        try:
            for script, port in SERVICES:
                if not alive(port):
                    log(f"[keepalive] {port} down -> starting {script}")
                    start(script)
                    time.sleep(3)
        except Exception as e:  # noqa: BLE001
            log(f"[keepalive] error: {e}")
        time.sleep(15)
