#!/usr/bin/env node
/**
 * dsh-cursor 客户端冒烟测试 —— 用最小 DOM 桩**真实执行** lib/client.js。
 *
 * 为什么必须存在：客户端 bundle 只能靠浏览器硬刷新验证，而 `node --check` 只查语法。
 * 这个插件已经因此翻过两次车，两次都完美躲过语法检查：
 *   ① onOver 单独写 transform，把 translate3d(位置) 抹掉 → 光标卡在屏幕左上角；
 *   ② 辅助函数插到了工厂作用域（而 state / cursorEl 在 apply() 内）→ 运行时 ReferenceError
 *      → 同一个症状（transform 停在 cssText 初始值 = 原点），还会触发 init 兜底。
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
class Style {
  constructor() { this._cssText = ""; this.transform = ""; }
  // 忠实还原：cssText 里声明的 transform 是"初始值"，只有显式赋值才会被覆盖
  set cssText(v) {
    this._cssText = v;
    const m = /transform:([^;]*)/.exec(v);
    this.transform = m ? m[1].trim() : "";
  }
  get cssText() { return this._cssText; }
}
class El {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.style = new Style();
    this.children = [];
    this.parentNode = null;
    this.attrs = {};
    this.className = "";
    this.textContent = "";
    this.innerHTML = "";
    this.listeners = {};
    this._classes = new Set();
    this.classList = {
      add: (c) => this._classes.add(c),
      remove: (c) => this._classes.delete(c),
      contains: (c) => this._classes.has(c),
    };
  }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  removeAttribute(k) { delete this.attrs[k]; }
  hasAttribute(k) { return k in this.attrs; }
  appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
  removeChild(c) { this.children = this.children.filter((x) => x !== c); if (c) c.parentNode = null; return c; }
  addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }
  removeEventListener(t, f) { if (this.listeners[t]) this.listeners[t] = this.listeners[t].filter((x) => x !== f); }
  dispatch(t, ev) { (this.listeners[t] || []).slice().forEach((f) => f(ev)); }
  closest() { return this.__clickable ? this : null; }
  querySelector() { return null; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 0, height: 0 }; }
  focus() {}
  getContext() { return { drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(4) }) }; }
}
const documentElement = new El("html");
documentElement.attrs["data-dsh-active-skin"] = "";
const body = new El("body");
const head = new El("head");
const documentStub = {
  documentElement, body, head,
  listeners: {},
  createElement: (t) => new El(t),
  createTextNode: (t) => ({ textContent: t }),
  addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); },
  removeEventListener() {},
  querySelector: () => null,
  dispatch(t, ev) { (this.listeners[t] || []).slice().forEach((f) => f(ev)); },
};
const storeMap = new Map();
const localStorageStub = {
  get length() { return storeMap.size; },
  key: (i) => Array.from(storeMap.keys())[i] ?? null,
  getItem: (k) => (storeMap.has(k) ? storeMap.get(k) : null),
  setItem: (k, v) => storeMap.set(k, String(v)),
  removeItem: (k) => storeMap.delete(k),
};
let now = 0;
let rafQueue = [];
const consoleErrors = [];
const sandbox = {
  console: {
    log: () => {}, warn: () => {}, info: () => {}, debug: () => {},
    error: (...a) => consoleErrors.push(a.map(String).join(" ")),
  },
  document: documentStub,
  localStorage: localStorageStub,
  performance: { now: () => now },
  requestAnimationFrame: (fn) => { rafQueue.push(fn); return rafQueue.length; },
  cancelAnimationFrame: () => {},
  setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms || 0, 5)),
  clearTimeout,
  setInterval: () => 0,
  clearInterval: () => {},
  Image: class {
    constructor() { this.onload = null; this.onerror = null; }
    set src(v) { this._src = v; }
    get src() { return this._src; }
    decode() { return Promise.resolve(); }
  },
  FileReader: class {
    readAsDataURL() { this.result = "data:image/png;base64,AAAA"; if (this.onload) this.onload(); }
  },
  MutationObserver: class { constructor(cb) { this.cb = cb; } observe() {} disconnect() {} },
  CustomEvent: class { constructor(type, opts) { this.type = type; Object.assign(this, opts); } },
  fetch: () => Promise.resolve({ ok: true, status: 200, json: async () => ({}), blob: async () => ({}) }),
  encodeURIComponent, decodeURIComponent, parseInt, parseFloat, isNaN, isFinite,
  Promise, Math, JSON, Date, Object, Array, String, Number, Boolean, Error, RegExp, Set, Map,
  Uint8ClampedArray, Float64Array, Symbol, TypeError,
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.window.addEventListener = () => {};
sandbox.window.removeEventListener = () => {};
sandbox.window.dispatchEvent = () => {};

let registration = null;
sandbox.__ModuleLoader__ = { load: (reg) => { registration = reg; } };

/* ── 执行 bundle ─────────────────────────────────────────── */
const src = fs.readFileSync(target, "utf8");
const ctxObj = vm.createContext(sandbox);

const failures = [];
function check(name, cond, detail) {
  if (cond) { console.log(`  ✅ ${name}`); }
  else { console.log(`  ❌ ${name}${detail ? "  → " + detail : ""}`); failures.push(name); }
}
// 把"派发事件"包起来：插件若抛异常（例如作用域错位导致 ReferenceError），
// 要变成一条可读的失败断言，而不是让测试进程直接崩掉
function step(name, fn) {
  try { fn(); check(name, true); }
  catch (e) { check(name, false, `${e.name}: ${e.message}`); }
}
const tick = (n = 1) => { for (let i = 0; i < n; i++) { const q = rafQueue; rafQueue = []; q.forEach((fn) => fn(now)); } };

console.log(`目标: ${target}`);
console.log(`1) 加载 bundle 并注册模块`);
try {
  vm.runInContext(src, ctxObj, { filename: target });
} catch (e) {
  console.log(`  ❌ 执行抛异常: ${e.message}`); process.exit(1);
}
check("bundle 经 __ModuleLoader__.load 注册", !!registration, "（缺外壳会导致前端整页加载失败）");
check("模块 id 正确", registration && registration.id === "dsh-cursor", registration && registration.id);

const exportsObj = registration.factory(() => { throw new Error("unexpected require"); });
check("导出 apply", typeof exportsObj.apply === "function");

console.log(`2) 应用插件（init）`);
try {
  exportsObj.apply({ effect: (fn) => { void fn; return () => {}; } });
} catch (e) {
  console.log(`  ❌ apply() 抛异常: ${e.message}`); process.exit(1);
}
const cursorEl = body.children.find((el) => el.className === "dsh-cursor-el");
check("光标元素已挂到 body", !!cursorEl, "body 子元素: " + body.children.map((c) => c.className).join(","));
check("init 未走兜底路径（无 console.error）", consoleErrors.length === 0, consoleErrors.join(" | "));
check("光标层带 data-dsh-cursor-layer 标记（皮肤过渡要跳过它）",
  cursorEl && cursorEl.getAttribute("data-dsh-cursor-layer") === "");

console.log(`3) 鼠标移动 → 光标必须真的跟着走`);
step("派发 mousemove 不抛异常", () => documentStub.dispatch("mousemove", { clientX: 300, clientY: 200 }));
check("transform 含 translate3d(300px,200px,0)",
  cursorEl && cursorEl.style.transform.includes("translate3d(300px,200px,0)"),
  cursorEl && cursorEl.style.transform);
documentStub.dispatch("mousemove", { clientX: 11, clientY: 22 });
check("第二次移动也生效（11,22）",
  cursorEl && cursorEl.style.transform.includes("translate3d(11px,22px,0)"),
  cursorEl && cursorEl.style.transform);

console.log(`4) 悬停缩放不得抹掉位置（回归点 ①）`);
step("派发 mouseover 不抛异常", () => documentStub.dispatch("mouseover", { target: new El("div") }));
check("非可点击元素：位置保留",
  cursorEl && cursorEl.style.transform.includes("translate3d(11px,22px,0)"),
  cursorEl && cursorEl.style.transform);
const link = new El("a"); link.__clickable = true;
documentStub.dispatch("mouseover", { target: link });
check("可点击元素：位置保留且带上放大倍率",
  cursorEl && cursorEl.style.transform.includes("translate3d(11px,22px,0)") && /scale\(1\.7\)/.test(cursorEl.style.transform),
  cursorEl && cursorEl.style.transform);
documentStub.dispatch("mousemove", { clientX: 40, clientY: 50 });
check("悬停状态下的移动仍更新位置",
  cursorEl && cursorEl.style.transform.includes("translate3d(40px,50px,0)"),
  cursorEl && cursorEl.style.transform);

console.log(`5) 拖尾点必须落在鼠标处（回归点 ②：曾经先在原点闪一帧）`);
for (let i = 0; i < 4; i++) {
  now += 20;
  step(`拖尾第 ${i + 1} 次移动不抛异常`, () => documentStub.dispatch("mousemove", { clientX: 100 + i * 10, clientY: 120 + i * 10 }));
}
tick(2);
const dots = body.children.filter((el) => el.className === "dsh-cursor-dot");
check("拖尾点已创建", dots.length > 0, `数量 ${dots.length}`);
check("拖尾点不在原点（创建即带真实坐标）",
  dots.length > 0 && dots.every((d) => !d.style.transform.includes("translate3d(0px,0px,0)")),
  dots.map((d) => d.style.transform).join(" | ").slice(0, 160));
check("拖尾点用 transform 定位（不再写 left/top）",
  dots.length > 0 && dots.every((d) => !d.style.left && !d.style.top),
  dots.map((d) => `left=${d.style.left} top=${d.style.top}`).join(" | "));

console.log(`6) 运行时不得出现未捕获错误`);
check("全程无 console.error", consoleErrors.length === 0, consoleErrors.join(" | "));

console.log("");
if (failures.length) {
  console.log(`结果: ❌ ${failures.length} 项失败 —— ${failures.join("; ")}`);
  process.exit(1);
}
console.log("结果: ✅ 全部通过");
process.exit(0);
