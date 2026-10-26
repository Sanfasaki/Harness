#!/usr/bin/env python3
"""Take Playwright's storageState dump and write the music.163.com cookies into .env.

storageState dumps the whole browser context, so the same cookie name can appear
several times with different paths. NetEase's own client only ever sends one, and a
duplicated header can break it, so we keep exactly one per name (path "/" wins,
then the longest-lived one).

Never prints cookie values: only names, counts and lengths.
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ENV_PATH = os.path.join(HERE, ".env")
AUTH_PATH = os.path.join(HERE, "auth.json")

with open(AUTH_PATH, encoding="utf-8") as f:
    state = json.load(f)

all_cookies = state.get("cookies", [])
candidates = [c for c in all_cookies if "music.163.com" in (c.get("domain") or "")]

# 同名去重：path "/" 优先，其次 expires 更长，再其次后出现的
best = {}
for c in candidates:
    name = c["name"]
    prev = best.get(name)
    if prev is None:
        best[name] = c
        continue
    score_new = (c.get("path") == "/", c.get("expires") or 0)
    score_old = (prev.get("path") == "/", prev.get("expires") or 0)
    if score_new > score_old:
        best[name] = c

cookies = list(best.values())
names = [c["name"] for c in cookies]
if "MUSIC_U" not in names:
    raise SystemExit("MUSIC_U missing — not logged in?")
if "__csrf" not in names:
    raise SystemExit("__csrf missing — write operations would 403")

# 网易云自己的前端只会发这一批；把明显过期的过滤掉
jar = "; ".join(f'{c["name"]}={c["value"]}' for c in cookies)
csrf = best["__csrf"]["value"]

with open(ENV_PATH, encoding="utf-8") as f:
    lines = f.read().splitlines()

out = []
for line in lines:
    if line.startswith("NETEASE_COOKIE="):
        out.append("NETEASE_COOKIE=" + jar)
    elif line.startswith("NETEASE_CSRF="):
        out.append("NETEASE_CSRF=" + csrf)
    else:
        out.append(line)

with open(ENV_PATH, "w", encoding="utf-8") as f:
    f.write("\n".join(out) + "\n")

os.remove(AUTH_PATH)

dupes = sorted({n for n in (c["name"] for c in candidates) if sum(1 for c in candidates if c["name"] == n) > 1})
print(f"raw candidates: {len(candidates)}  -> deduped: {len(cookies)}")
if dupes:
    print("deduped names:", ", ".join(dupes))
print(f"cookie string length: {len(jar)}")
print(f"MUSIC_U len={len(best['MUSIC_U']['value'])}, __csrf len={len(csrf)}")
print("names:", ", ".join(sorted(names)))
print("auth.json deleted")
