#!/usr/bin/env python3
"""Tiny CLI to poke the local NetEase MCP server (debugging aid).

    python call.py list
    python call.py search_song "{\"query\": \"周杰伦\", \"limit\": 3}"
"""
import json
import sys
import urllib.request

URL = "http://127.0.0.1:3456/"


def rpc(method, params=None):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method,
                       "params": params or {}}).encode()
    req = urllib.request.Request(URL, data=body,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode())


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    tool = sys.argv[1]
    if tool == "list":
        names = [t["name"] for t in rpc("tools/list")["result"]["tools"]]
        print("\n".join(names))
        return 0
    args = json.loads(sys.argv[2]) if len(sys.argv) > 2 else {}
    out = rpc("tools/call", {"name": tool, "arguments": args})
    result = out.get("result", {})
    for block in result.get("content", []):
        text = block.get("text", "")
        try:
            print(json.dumps(json.loads(text), ensure_ascii=False, indent=2))
        except ValueError:
            print(text)
    if result.get("isError"):
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
