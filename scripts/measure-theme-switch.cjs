#!/usr/bin/env node
/**
 * measure-theme-switch.cjs —— 用 headless Chrome + CDP 实测"切主题时移动光标"的掉帧，
 * 并对不同假设做 A/B 对照，用来**定位**卡顿来源（而不是靠猜）。
 *
 * 用法：
 *   node scripts/measure-theme-switch.cjs                 # 跑全部对照
 *   node scripts/measure-theme-switch.cjs v0 coloroff     # 只跑指定对照
 *
 * 对照项：
 *   v0       原样
 *   coloroff 关掉皮肤的全局颜色过渡（.dsh-skin-transition * 的 6 条 !important transition）
 *   veil     给遮罩加 will-change:opacity（让它上合成层，透明度动画不占主线程）
 *   both     coloroff + veil
 *
 * 每个对照跑两种情形：移动鼠标 / 鼠标静止 —— 用来区分"过渡本身重"还是"移动与过渡互相拖累"。
 * 输出：切换窗口内的帧间隔 avg/p95/max 与 >33ms、>50ms 的帧数，以及长任务总时长。
 */
"use strict";
const { spawn } = require("child_process");
const path = require("path");

const CHROME = process.env.CHROME_BIN
  || "/root/.cache/puppeteer/chrome/linux-151.0.7922.47/chrome-linux64/chrome";
const PORT = Number(process.env.CDP_PORT || 9340);
const GUI = process.env.GUI_URL || "http://127.0.0.1:3080/";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const VARIANTS = {
  v0: { label: "原样", css: null, veil: false },
  coloroff: { label: "关全局颜色过渡", css: `.dsh-skin-transition,.dsh-skin-transition *,.dsh-skin-transition *::before,.dsh-skin-transition *::after{transition:none !important}`, veil: false },
  veil: { label: "遮罩上合成层", css: null, veil: true },
  both: { label: "关颜色过渡+遮罩上合成层", css: `.dsh-skin-transition,.dsh-skin-transition *,.dsh-skin-transition *::before,.dsh-skin-transition *::after{transition:none !important}`, veil: true },
};

async function launch() {
  const chrome = spawn(CHROME, [
    "--headless=new", `--remote-debugging-port=${PORT}`, "--no-sandbox", "--disable-dev-shm-usage",
    "--window-size=1600,900", `--user-data-dir=/tmp/chrome-measure`, "about:blank",
  ], { stdio: ["ignore", "ignore", "ignore"] });
  let list = null;
  for (let i = 0; i < 100; i++) {
    try {
      list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      if (list.find((t) => t.type === "page")) break;
    } catch (e) { /* 端口未就绪 */ }
    await sleep(250);
  }
  const page = list.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r));
  let id = 0; const pending = new Map();
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  const send = (method, params = {}) => new Promise((res) => {
    const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params }));
  });
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) {
      throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
    }
    return r.result?.result?.value;
  };
  return { chrome, send, evaluate };
}

const INSTRUMENT = `
window.__perf = { gaps: [], long: [], on: false, last: 0 };
(function tick(ts) {
  requestAnimationFrame(tick);
  if (!window.__perf.on) { window.__perf.last = 0; return; }
  if (window.__perf.last) window.__perf.gaps.push([ts, ts - window.__perf.last]);
  window.__perf.last = ts;
})();
try {
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__perf.long.push([e.startTime, e.duration]); })
    .observe({ entryTypes: ["longtask"] });
} catch (e) {}
window.__preset = (i) => {
  const rows = [...document.querySelectorAll('.dsh-skin-preset-row')];
  if (!rows[i]) return 'no-row';
  rows[i].querySelector('button').click();
  return 'clicked';
};
window.__openPanel = () => {
  if (!document.querySelector('.dsh-skin-panel')) document.querySelector('.dsh-skin-fab').click();
  return !!document.querySelector('.dsh-skin-panel');
};
`;

function stats(gaps) {
  if (!gaps.length) return { n: 0 };
  // >1000ms 的间隔不是掉帧，是 rAF 被挂起（无头浏览器节流/首轮预热），单独计数并剔除
  const stalls = gaps.filter((g) => g[1] > 1000).length;
  const ds = gaps.filter((g) => g[1] <= 1000).map((g) => g[1]).sort((a, b) => a - b);
  if (!ds.length) return { n: 0, stalls };
  const sum = ds.reduce((a, b) => a + b, 0);
  const p = (q) => ds[Math.min(ds.length - 1, Math.floor(ds.length * q))];
  return {
    n: ds.length,
    stalls,
    avg: +(sum / ds.length).toFixed(1),
    p50: +p(0.5).toFixed(1),
    p95: +p(0.95).toFixed(1),
    max: +ds[ds.length - 1].toFixed(1),
    over33: ds.filter((d) => d > 33).length,
    over50: ds.filter((d) => d > 50).length,
    over100: ds.filter((d) => d > 100).length,
  };
}
function longStats(entries, from, to) {
  const inside = entries.filter(([t]) => t >= from && t <= to);
  return { count: inside.length, totalMs: +inside.reduce((a, [, d]) => a + d, 0).toFixed(0) };
}

async function runCase({ evaluate, send }, { variant, move }) {
  // 1) 归位到 lxhzj（index 2）并等过渡彻底结束
  await evaluate(`window.__openPanel(); window.__preset(2);`);
  await sleep(2600);
  // 2) 开测
  await evaluate(`window.__perf.gaps = []; window.__perf.long = []; window.__perf.on = true;`);
  let mouseTimer = null;
  if (move) {
    let a = 0;
    mouseTimer = setInterval(() => {
      a += 0.35;
      const x = 800 + Math.cos(a) * 420, y = 450 + Math.sin(a * 1.7) * 260;
      send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, buttons: 0 }).catch(() => {});
    }, 8);
  }
  await sleep(900);                                               // 基线窗口
  const switchAt = await evaluate(`(window.__switchAt = performance.now())`);
  await evaluate(`window.__preset(0)`);                            // 切到 fulilian（换壁纸+配色）
  await sleep(2400);                                               // 切换窗口
  const endAt = await evaluate(`performance.now()`);
  await evaluate(`window.__perf.on = false;`);
  if (mouseTimer) clearInterval(mouseTimer);
  // 3) 统计
  const gaps = await evaluate(`JSON.stringify(window.__perf.gaps)`).then(JSON.parse);
  const longs = await evaluate(`JSON.stringify(window.__perf.long)`).then(JSON.parse);
  const base = gaps.filter(([t]) => t < switchAt);
  const during = gaps.filter(([t]) => t >= switchAt && t <= endAt);
  return {
    variant, move,
    baseline: stats(base),
    during: stats(during),
    longBaseline: longStats(longs, switchAt - 900, switchAt),
    longDuring: longStats(longs, switchAt, endAt),
    switchWindowMs: +(endAt - switchAt).toFixed(0),
  };
}

/* ── 模式一：过渡类窗口时长检查（防止"昂贵窗口"再次变长）─────────
   期望：点击切换后，.dsh-skin-transition 只在颜色真正变化前后存在 ≈0.5-0.9s；
   如果又变回"从点击挂到过渡结束"（实测曾达 1.6-2.0s），说明优化被回退了。 */
async function classLifetime({ evaluate, send }) {
  await evaluate(`window.__openPanel();`);
  await evaluate(`window.__preset(2)`); await sleep(3000);          // 预热 + 归位
  await evaluate(`window.__preset(0)`); await sleep(3000);
  const samples = await evaluate(`(async () => {
    const out = [];
    const t0 = performance.now();
    window.__openPanel();
    [...document.querySelectorAll('.dsh-skin-preset-row')][2].querySelector('button').click();
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 100));
      out.push([Math.round(performance.now() - t0), document.documentElement.classList.contains('dsh-skin-transition')]);
    }
    return JSON.stringify(out);
  })()`).then(JSON.parse);
  const on = samples.filter(([, v]) => v).map(([t]) => t);
  const span = on.length ? Math.max(...on) - Math.min(...on) : 0;
  console.log(`过渡类首次出现 t=${on.length ? Math.min(...on) : "-"}ms，最后出现 t=${on.length ? Math.max(...on) : "-"}ms`);
  console.log(`耗时窗口 ≈ ${span}ms  ${span && span <= 1000 ? "✅ 在预算内（≤1000ms）" : "⚠️ 偏长，检查是否回退成'从点击挂到过渡结束'"}`);
  console.log("时间线: " + samples.filter((_, i) => i % 2 === 0).map(([t, v]) => `${t}${v ? "■" : "·"}`).join(" "));
}

/* ── 模式二：渲染截图（改完皮肤/光标后肉眼验收，也用于确认没有渲染回归）── */
async function screenshot({ evaluate, send }, out, presetIndex) {
  await evaluate(`window.__openPanel(); window.__preset(${presetIndex})`);
  await sleep(2600);
  await evaluate(`document.querySelector('.dsh-skin-fab').click()`);   // 收起面板，画面干净
  await evaluate(`(() => { const r = document.querySelector('.dsh-cursor-fab'); if (r) r.style.display = 'none'; })()`);
  await sleep(600);
  const r = await send("Page.captureScreenshot", { format: "png" });
  require("fs").writeFileSync(out, Buffer.from(r.result.data, "base64"));
  console.log(`截图已保存: ${out}（预设 index=${presetIndex}）`);
}

(async () => {
  const argv = process.argv.slice(2);
  const mode = (argv.find((a) => a.startsWith("--")) || "").replace(/^--/, "");
  const args = argv.filter((a) => !a.startsWith("--") && !/^\d+$/.test(a) && !a.startsWith("/"));
  if (mode === "class-lifetime" || mode === "screenshot") {
    const { chrome, send, evaluate } = await launch();
    await send("Page.enable"); await send("Runtime.enable");
    await send("Page.navigate", { url: GUI });
    await sleep(8000);
    await evaluate(INSTRUMENT);
    if (mode === "class-lifetime") await classLifetime({ evaluate, send });
    else await screenshot({ evaluate, send }, process.env.SHOT_OUT || "/tmp/theme-shot.png", Number(argv.find((a) => /^\d+$/.test(a)) || 0));
    chrome.kill("SIGKILL");
    process.exit(0);
  }
  const wanted = argv.filter((a) => VARIANTS[a]);
  const list = (wanted.length ? wanted : Object.keys(VARIANTS));
  const { chrome, send, evaluate } = await launch();
  await send("Page.enable"); await send("Runtime.enable");
  await send("Page.navigate", { url: GUI });
  await sleep(8000);
  await evaluate(INSTRUMENT);

  // 预热：先做 2 次完整切换，把首轮开销（大壁纸解码/JIT/栅格缓存）摊掉，
  // 否则"第一个被测的对照"必然最差 —— 那只是顺序伪影，不是真实差异
  console.log("预热中（2 次完整切换）…");
  await evaluate(`window.__openPanel();`);
  for (let i = 0; i < 2; i++) {
    await evaluate(`window.__preset(${i % 2 === 0 ? 0 : 2})`);
    await sleep(2800);
  }
  await evaluate(`window.__preset(2)`);
  await sleep(2800);

  const repeats = Number(process.env.REPEATS || 2);
  const moveOnly = process.env.MOVE_ONLY === "1";
  const results = [];
  for (let round = 0; round < repeats; round++) {
  for (const key of list) {
    const v = VARIANTS[key];
    // 应用对照注入（每个对照前先清掉上一次的注入）
    await evaluate(`document.querySelectorAll('style[data-perf-override]').forEach(s => s.remove());`);
    if (v.css) {
      await evaluate(`(() => { const s = document.createElement('style'); s.setAttribute('data-perf-override','1');
        s.textContent = ${JSON.stringify(v.css)}; document.head.appendChild(s); return true; })()`);
    }
    if (v.veil) {
      await evaluate(`(() => {
        if (window.__veilObs) window.__veilObs.disconnect();
        const promote = (el) => { if (el && el.style && el.style.zIndex === '-1') { el.style.willChange = 'opacity'; el.style.transform = 'translateZ(0)'; } };
        window.__veilObs = new MutationObserver((ms) => ms.forEach(m => m.addedNodes.forEach(promote)));
        window.__veilObs.observe(document.body, { childList: true });
        [...document.body.children].forEach(promote);
        return true; })()`);
    }
    const cases = process.env.MOVE_ONLY === "1" ? [true] : [true, false];
    for (const move of cases) {
      const r = await runCase({ evaluate, send }, { variant: key, move });
      results.push(r);
      const d = r.during, b = r.baseline;
      console.log(`\n[对照 ${key} · ${v.label}] ${move ? "移动鼠标" : "鼠标静止"}`);
      console.log(`  基线   帧间隔 avg ${b.avg}ms p95 ${b.p95}ms max ${b.max}ms | 长帧>33ms ${b.over33} | 长任务 ${r.longBaseline.count} 个/${r.longBaseline.totalMs}ms`);
      console.log(`  切换中 帧间隔 avg ${d.avg}ms p95 ${d.p95}ms max ${d.max}ms | 长帧>33ms ${d.over33} >50ms ${d.over50} >100ms ${d.over100} | 长任务 ${r.longDuring.count} 个/${r.longDuring.totalMs}ms`);
      console.log(`  （切换窗口 ${r.switchWindowMs}ms，帧数 ${d.n}${d.stalls ? `，剔除挂起 ${d.stalls}` : ""}）`);
    }
  }
  }
  console.log("\n=== 汇总：切换窗口内 长帧>33ms / 长任务阻塞 ms（多轮取中位数）===");
  const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
  for (const key of list) {
    const cases = process.env.MOVE_ONLY === "1" ? [true] : [true, false];
    for (const move of cases) {
      const rs = results.filter((r) => r.variant === key && r.move === move);
      if (!rs.length) continue;
      console.log(`  ${key.padEnd(9)} ${move ? "移动" : "静止"}  >33ms 中位 ${String(median(rs.map((r) => r.during.over33))).padStart(3)}`
        + `  max帧 中位 ${String(median(rs.map((r) => r.during.max))).padStart(6)}ms`
        + `  长任务阻塞 中位 ${String(median(rs.map((r) => r.longDuring.totalMs))).padStart(5)}ms`
        + `  基线>33ms ${median(rs.map((r) => r.baseline.over33))}`);
    }
  }
  chrome.kill("SIGKILL");
  process.exit(0);
})().catch((e) => { console.error("测量失败:", e.message); process.exit(1); });
