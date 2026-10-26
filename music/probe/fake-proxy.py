#!/usr/bin/env python3
"""Temporary visual harness: serve a canned /now on :3457 and proxy everything else
to a real bridge running on :3458. Lets us check the lyrics/controls layout without
actually playing music. Not part of the product.
"""
import json
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

REAL = "http://127.0.0.1:3458"
T0 = time.time()

LINES = [
    {"t": 0, "text": "作词 : 野田洋次郎"},
    {"t": 3000, "text": "作曲 : STRlighT"},
    {"t": 6000, "text": "透明な雨が降る街で", "tr": "在落着透明雨水的街角"},
    {"t": 11000, "text": "君の声だけが聞こえてる", "tr": "只听得见你的声音"},
    {"t": 16000, "text": "このまま時が止まればいいのに", "tr": "要是时间就这样停住就好了"},
    {"t": 21000, "text": "夜が明けるまで", "tr": "直到天亮"},
]


def now_payload():
    pos = 11000 + int((time.time() - T0) * 1000) % 12000
    return {
        "playing": True, "status": "Playing", "app": "MSEdge", "title": "天気の子",
        "artist": "STRlighT", "album": "", "positionMs": pos, "endMs": 231639,
        "at": int(time.time() * 1000), "songId": 1973129951, "lines": LINES,
    }


class H(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _send(self, status, body):
        data = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        if self.path.startswith("/now"):
            return self._send(200, now_payload())
        try:
            with urllib.request.urlopen(REAL + self.path, timeout=30) as r:
                self._send(r.status, json.loads(r.read().decode()))
        except Exception as e:  # noqa: BLE001
            self._send(502, {"error": str(e)})

    def log_message(self, *a):
        pass


ThreadingHTTPServer(("127.0.0.1", 3457), H).serve_forever()
