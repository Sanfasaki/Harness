#!/usr/bin/env node
/**
 * dsh-netease 客户端冒烟测试 —— 用最小 DOM 桩**真实执行** lib/client.js。
 *
 * 为什么要有：客户端 bundle 只能靠浏览器硬刷新验证，`node --check` 只查语法。
 * 这个插件已经因此翻过一次车：`bridge()` 返回的是 `{status, body}` 包装对象，
 * 而 `pollNow` 把整个包装传给了渲染函数 → `data.title` 永远 undefined →
 * 面板永远隐藏，**控制台一个报错都没有**。语法检查、真机看现象都容易漏。
 *
 * 用法：node test/client-smoke.cjs [client.js 路径]
 * 退出码 0 = 通过；1 = 有断言失败（打印具体失败项）。
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const target = process.argv[2] || path.join(__dirname, "..", "lib", "client.js");

/* ── 最小 DOM 桩 ─────────────────────────────────────────── */
class Node {
  constructor(tag) {
    this.tagName = String(tag || "").toUpperCase();
    this.className = "";
    this.children = [];
    this.parentNode = null;
    this.style = {};
    this._text = "";
    this._handlers = {};
    this._attrs = {};
  }
  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  removeChild(child) {
    const i = this.children.indexOf(child);
    if (i >= 0) this.children.splice(i, 1);
    child.parentNode = null;
    return child;
  }
  addEventListener(type, fn) {
    (this._handlers[type] = this._handlers[type] || []).push(fn);
  }
  removeEventListener(type, fn) {
    const list = this._handlers[type] || [];
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  }
  setAttribute(k, v) { this._attrs[k] = String(v); }
  getAttribute(k) { return this._attrs[k]; }
  getBoundingClientRect() { return { x: 0, y: 0, left: 0, top: 0, width: 200, height: 10 }; }
  set textContent(v) { this._text = String(v); }
  get textContent() {
    if (this.children.length) return this._text + this.children.map((c) => c.textContent).join("");
    return this._text;
  }
  set innerHTML(v) {
    this._html = String(v);
    if (v === "") this.children.length = 0; // 代码里用 innerHTML="" 清空
  }
  get innerHTML() { return this._html || ""; }
  querySelectorAll() { return []; }
}

const created = [];
function make(tag) {
  const n = new Node(tag);
  created.push(n);
  return n;
}

const body = new Node("body");
const head = new Node("head");

const document = {
  createElement: make,
  head,
  body,
  documentElement: new Node("html"),
  querySelector: () => null,
  querySelectorAll: () => [],
};

function fire(node, type, ev) {
  const list = (node && node._handlers && node._handlers[type]) || [];
  for (const fn of list) fn(Object.assign({ stopPropagation() {}, preventDefault() {} }, ev || {}));
}

/* ── fetch 桩：按 URL 返回预设，并记录调用 ───────────────── */
let routes = {};
const calls = [];
function fetchStub(url) {
  const u = String(url);
  calls.push(u);
  const key = Object.keys(routes).find((k) => u.indexOf(k) >= 0);
  const payload = key ? routes[key] : { error: "no route" };
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(payload),
  });
}

/* ── 计时器桩：记录但不自动跑，保证测试可重复 ─────────────── */
const timers = [];
const setIntervalStub = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
const clearIntervalStub = () => {};

/* ── 装载 bundle ─────────────────────────────────────────── */
const registered = {};
const sandbox = {
  window: {
    __ModuleLoader__: {
      load: (mod) => { registered[mod.id] = mod; },
    },
    open: () => {},
  },
  document,
  fetch: fetchStub,
  setInterval: setIntervalStub,
  clearInterval: clearIntervalStub,
  setTimeout: (fn) => fn(),
  console,
  Promise,
  Date,
  Math,
  JSON,
  encodeURIComponent,
  decodeURIComponent,
};
sandbox.window.document = document;
sandbox.globalThis = sandbox;

const code = fs.readFileSync(target, "utf8");
vm.runInNewContext(code, sandbox, { filename: target });

/* ── 断言 ────────────────────────────────────────────────── */
let failures = 0;
function check(name, cond, detail) {
  if (cond) {
    console.log("  ok   " + name);
  } else {
    failures++;
    console.log("  FAIL " + name + (detail ? "  → " + detail : ""));
  }
}
const flush = () => new Promise((r) => setImmediate(r));
const all = (root, pred) => {
  const out = [];
  const walk = (n) => {
    if (!n || !n.children) return;
    for (const c of n.children) {
      if (pred(c)) out.push(c);
      walk(c);
    }
  };
  walk(root);
  return out;
};
const byClass = (root, cls) => all(root, (n) => String(n.className).split(/\s+/).includes(cls));

(async () => {
  console.log("[1] 注册");
  check("bundle 以 id=dsh-netease 注册", !!registered["dsh-netease"]);
  const mod = registered["dsh-netease"];
  check("factory 返回 CJS exports", !!(mod && mod.factory));
  const exportsObj = mod.factory(() => {});
  check("exports.apply 是函数", typeof exportsObj.apply === "function");
  check("exports.inject 是数组", Array.isArray(exportsObj.inject));

  console.log("[2] 挂载");
  const ctx = { effect: () => {}, inject: (_d, cb) => cb({}) };
  // 第一次 apply 前先摆好 /now 的返回
  routes = {
    "/now": { playing: true, title: "天気の子", artist: "STRlighT", endMs: 231639, at: Date.now(), positionMs: 5000, songId: 1, cover: "https://example.invalid/c.jpg", lines: [{ t: 0, text: "第一行" }, { t: 3000, text: "第二行" }] },
    "/status": { loggedIn: true, nickname: "tester" },
    "/daily": { songs: [{ id: 369, name: "测试曲", artists: "测试人", cover: "" }] },
    "/volume": { ok: true, scope: "app", volume: 66, muted: false },
    "/open": { ok: true, via: "orpheus", song: 369 },
    "/playlists": { playlists: [{ id: 9, name: "我的歌单", count: 3, mine: true }] },
    "/control": { ok: true },
    "/seek": { ok: true },
  };
  exportsObj.apply(ctx);
  await flush();

  check("生成右下角按钮 .dsh-ne-fab", byClass(body, "dsh-ne-fab").length === 1);
  check("生成面板 .dsh-ne-panel", byClass(body, "dsh-ne-panel").length === 1);
  check("生成歌词容器 .dsh-ne-live", byClass(body, "dsh-ne-live").length === 1);

  console.log("[3] 歌词渲染（这里就是曾经翻车的地方）");
  const live = byClass(body, "dsh-ne-live")[0];
  check("面板转为可见（className 含 on）", /(^|\s)on(\s|$)/.test(live.className), "实际: " + JSON.stringify(live.className));
  const lines = byClass(body, "dsh-ne-lv-line");
  check("渲染出歌词行", lines.length > 0, "行数: " + lines.length);
  const titleNode = byClass(body, "dsh-ne-lv-title")[0];
  check("标题被写入", !!titleNode && titleNode.textContent === "天気の子", "实际: " + (titleNode && titleNode.textContent));

  const fabEl = byClass(body, "dsh-ne-fab")[0];
  const fabImg = byClass(body, "dsh-ne-fab-cover")[0];
  check("播放中：按钮换成专辑封面", !!fabEl && /(^|\s)has-cover(\s|$)/.test(fabEl.className), "实际: " + (fabEl && fabEl.className));
  check("封面的 src 用的是 /now 的 cover", !!fabImg && String(fabImg.src).indexOf("c.jpg") >= 0, "实际: " + (fabImg && fabImg.src));

  console.log("[4] 空状态要能收起来");
  routes["/now"] = { playing: false, idle: true };
  timers[0].fn(); // 手动跑一次 poll
  await flush();
  check("没有播放时面板隐藏", !/(^|\s)on(\s|$)/.test(live.className), "实际: " + JSON.stringify(live.className));
  check("没有播放时按钮还原成图标", !/(^|\s)has-cover(\s|$)/.test(fabEl.className), "实际: " + fabEl.className);

  console.log("[5] 交互");
  const fab = byClass(body, "dsh-ne-fab")[0];
  const panel = byClass(body, "dsh-ne-panel")[0];
  fire(fab, "click");
  check("点按钮展开面板", panel.style.display === "flex", "实际: " + panel.style.display);
  fire(fab, "click");
  check("再点收起", panel.style.display === "none", "实际: " + panel.style.display);

  const tabs = byClass(body, "dsh-ne-tab");
  const listTab = tabs.find((t) => t.textContent === "我的歌单");
  check("存在「我的歌单」标签", !!listTab);
  if (listTab) {
    fire(listTab, "click");
    await flush();
    check("切歌单页会请求 /playlists", calls.some((u) => u.indexOf("/playlists") >= 0));
    const rows = byClass(body, "dsh-ne-row");
    check("歌单渲染成行", rows.length > 0, "行数: " + rows.length);
  }

  console.log("[6] 播放控制打的是 /control");
  routes["/now"] = { playing: true, title: "x", artist: "y", endMs: 1000, at: Date.now(), positionMs: 0, songId: 2, lines: [] };
  timers[0].fn();
  await flush();
  const btns = byClass(body, "dsh-ne-lv-btn");
  check("控制区是 3 个传输键 + 1 个音量键", btns.length === 4, "实际: " + btns.length);
  if (btns.length === 3) {
    calls.length = 0;
    fire(btns[1], "click"); // 播放/暂停
    await flush();
    check("暂停键请求 /control?action=toggle", calls.some((u) => u.indexOf("action=toggle") >= 0), calls.join(" | "));
    calls.length = 0;
    fire(btns[2], "click"); // 下一首
    await flush();
    check("下一首请求 /control?action=next", calls.some((u) => u.indexOf("action=next") >= 0), calls.join(" | "));
  }

  console.log("[7] 音量小按钮 + 纵向滑轨");
  const volBtn = byClass(body, "dsh-ne-vol-btn")[0];
  const volPop = byClass(body, "dsh-ne-vol-pop")[0];
  const volRange = byClass(body, "dsh-ne-vol-range")[0];
  check("存在音量按钮", !!volBtn);
  check("存在弹出层（默认收起）", !!volPop && volPop.className.indexOf("on") < 0, "实际: " + (volPop && volPop.className));
  check("弹出层里有滑轨", !!volRange);
  if (volBtn && volPop) {
    fire(volBtn, "click");
    check("点按钮展开滑轨", volPop.className.indexOf("on") >= 0, "实际: " + volPop.className);
    await flush();
    check("展开时回填当前音量", volRange && volRange.value === "66", "实际: " + (volRange && volRange.value));
    if (volRange) {
      calls.length = 0;
      volRange.value = "42";
      fire(volRange, "input");
      await flush();
      check("拖动请求 /volume?value=42", calls.some((u) => u.indexOf("/volume?value=42") >= 0), calls.join(" | "));
    }
    fire(volBtn, "click");
    check("再点收起", volPop.className.indexOf("on") < 0, "实际: " + volPop.className);
  }

  console.log("[8] 点歌唤起客户端");
  const tabDaily = byClass(body, "dsh-ne-tab").find((t) => t.textContent === "今日推荐");
  check("存在「今日推荐」标签", !!tabDaily);
  if (tabDaily) {
    fire(tabDaily, "click");
    await flush();
    const songRows = byClass(body, "dsh-ne-row");
    check("推荐列表渲染成行", songRows.length > 0, "行数: " + songRows.length);
    if (songRows.length) {
      calls.length = 0;
      fire(songRows[0], "click");
      await flush();
      check("点歌走 /open?song=（唤起客户端）", calls.some((u) => u.indexOf("/open?song=369") >= 0), calls.join(" | "));
    }
  }

  console.log("");
  if (failures) {
    console.log("FAILED: " + failures + " 项");
    process.exit(1);
  }
  console.log("PASS: 全部通过");
})();
