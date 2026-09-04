// dsh-cursor 客户端半区 v4：图片光标 + 拖尾 + 点击波纹（三件套）。
// 光标：cursor:none + fixed 图片元素跟随、悬停放大（参考 CustomCursor）。
// 拖尾/波纹：时间驱动（createdAt + duration + easeOutCubic），rAF 每帧推进，
//   过期销毁（参考 CursorTrail / ClickRipple）。
// 性能：滑块/取色拖动只做轻量视觉同步（applyLight），不重建面板不打断拖拽。
// 纯浏览器端，设置存 localStorage；初始化失败回退原生光标；卸载完整清理。

// client bundle 必须经 __ModuleLoader__.load 注册自身模块（client-modules 协议）：
// id 与插件名一致（"dsh-cursor"），factory 返回 CJS exports；缺这层外壳会报
// "bundle ... loaded without registering" 并导致前端整页加载失败。
window.__ModuleLoader__.load({
  id: "dsh-cursor",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    // 仅依赖核心 ctx（ctx.effect），无需额外 client 服务注入。
    var inject = [];

    var STORE_KEY = "dsh-cursor-state";
    var DEFAULT_IMAGE = "data:image/svg+xml," + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="7" fill="#4176e6"/><circle cx="16" cy="16" r="11" fill="none" stroke="#4176e6" stroke-opacity="0.35" stroke-width="2.5"/></svg>'
    );
    var DEFAULT_STATE = {
      enabled: false, imageUrl: "", size: 64, scale: 1.5, stroke: false,
      trailOn: false, trailColor: "#4176e6", trailSize: 16, trailDuration: 800,
      rippleOn: false, rippleColor: "#4176e6", rippleMaxSize: 120,
      rippleDuration: 1000, rippleBorderWidth: 2
    };
    var MAX_TRAIL = 12;
    var MAX_RIPPLE = 12;
    var TRAIL_THROTTLE = 16; // ms

    function loadState() {
      try {
        var raw = localStorage.getItem(STORE_KEY);
        if (raw) {
          var p = JSON.parse(raw);
          return Object.assign({}, DEFAULT_STATE, p);
        }
      } catch (e) {}
      return Object.assign({}, DEFAULT_STATE);
    }
    function saveState(s) {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (e) {}
    }

    var CURSOR_CSS =
      "*{cursor:none!important}input,textarea,select,[contenteditable]{cursor:text!important}" +
      "@media (hover:none){.dsh-cursor-el,.dsh-cursor-dot,.dsh-cursor-ripple{display:none!important}*{cursor:auto!important}}";

    var UI_CSS = "\n.dsh-cursor-root{position:fixed;right:20px;bottom:84px;z-index:2147483000;pointer-events:none;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,sans-serif;}\n.dsh-cursor-fab{pointer-events:auto;position:relative;width:44px;height:44px;border-radius:50%;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,0.1));background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#111);box-shadow:0 6px 20px rgba(0,0,0,0.14);display:flex;align-items:center;justify-content:center;margin-left:auto;transition:transform .15s ease,box-shadow .15s ease;}\n.dsh-cursor-fab:hover{transform:translateY(-1px);box-shadow:0 8px 24px rgba(0,0,0,0.18);}\n.dsh-cursor-fab-on::after{content:'';position:absolute;top:2px;right:2px;width:9px;height:9px;border-radius:50%;background:var(--dsw-alias-state-success-primary,#34c55e);border:2px solid var(--dsw-alias-bg-layer-1,#fff);}\n.dsh-cursor-panel{pointer-events:auto;width:300px;max-height:70vh;overflow-y:auto;margin-top:10px;margin-left:auto;border-radius:14px;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,0.1));background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#111);box-shadow:0 12px 40px rgba(0,0,0,0.2);padding:12px 14px;display:flex;flex-direction:column;gap:12px;}\n.dsh-cursor-head{display:flex;align-items:center;justify-content:space-between;}\n.dsh-cursor-title{font-size:13px;font-weight:600;}\n.dsh-cursor-close{border:none;background:none;cursor:pointer;font-size:20px;line-height:1;color:var(--dsw-alias-label-secondary,#666);padding:0;}\n.dsh-cursor-label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--dsw-alias-label-tertiary,#999);margin-bottom:6px;}\n.dsh-cursor-sep{height:1px;background:var(--dsw-alias-border-l1,rgba(0,0,0,0.05));margin:2px 0;}\n.dsh-cursor-row{display:flex;gap:6px;align-items:center;flex-wrap:wrap;}\n.dsh-cursor-chip{flex:1;min-width:0;padding:7px 8px;border-radius:9px;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,0.1));background:transparent;color:inherit;font-size:12px;cursor:pointer;}\n.dsh-cursor-chip-on{background:var(--dsw-alias-brand-primary,#111);color:var(--dsw-alias-label-primary-inverted,#fff);border-color:transparent;}\n.dsh-cursor-text{flex:1;min-width:0;height:30px;padding:0 8px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,0.1));background:var(--dsw-alias-bg-base,#f7f7f5);color:inherit;font-size:12px;box-sizing:border-box;}\n.dsh-cursor-range{flex:1;min-width:90px;height:30px;margin:0;accent-color:var(--dsw-alias-brand-primary,#111);cursor:pointer;}\n.dsh-cursor-num{width:56px;height:28px;padding:0 4px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,0.1));background:var(--dsw-alias-bg-base,#f7f7f5);color:inherit;font-size:12px;text-align:center;box-sizing:border-box;}\n.dsh-cursor-color{width:40px;height:30px;padding:0;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,0.1));border-radius:8px;background:none;cursor:pointer;}\n.dsh-cursor-err{padding:6px 8px;border-radius:8px;font-size:11px;line-height:16px;color:var(--dsw-alias-state-error-primary,#d33);background:rgba(236,19,19,0.06);}\n";

    function apply(ctx) {
      var state = loadState();
      var styleEl = null;    // cursor:none 注入
      var uiStyle = null;
      var cursorEl = null;   // 光标图片元素（z-index 2147483001，高于 dsh-skin 面板 2147483000）
      var root = null;
      var fab = null;
      var panel = null;
      var themeObserver = null;
      var open = false;
      var errMsg = null;

      // 自适应描边：浅色主题用深色阴影，深色主题（body[data-ds-dark-theme]）用浅色阴影
      function strokeFilter() {
        if (!state.stroke) return "";
        var dark = typeof document !== "undefined" && document.body && document.body.hasAttribute("data-ds-dark-theme");
        return dark
          ? "drop-shadow(0 0 2px rgba(255,255,255,0.65))"
          : "drop-shadow(0 0 2px rgba(0,0,0,0.55))";
      }
      function applyStroke() {
        if (state.enabled) cursorEl.style.filter = strokeFilter();
      }

      // 拖尾 / 波纹：时间驱动
      var trailPoints = [];  // {x, y, t, el}
      var ripples = [];      // {x, y, t, el}
      var lastTrailAdd = 0;
      var raf = 0;
      var animRunning = false;

      function ensureDom() {
        cursorEl = document.createElement("div");
        cursorEl.className = "dsh-cursor-el";
        cursorEl.style.cssText = "position:fixed;left:0;top:0;pointer-events:none;z-index:2147483001;background-size:contain;background-repeat:no-repeat;background-position:center;transform:translate(-50%,-50%);transition:transform .1s ease;display:none;";
        document.body.appendChild(cursorEl);
        uiStyle = document.createElement("style");
        uiStyle.setAttribute("data-plugin", "dsh-cursor");
        uiStyle.setAttribute("data-plugin-css", "dsh-cursor/ui");
        uiStyle.textContent = UI_CSS;
        document.head.appendChild(uiStyle);
        root = document.createElement("div");
        root.className = "dsh-cursor-root";
        fab = document.createElement("button");
        fab.className = "dsh-cursor-fab";
        fab.title = "光标美化";
        fab.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4l7 7"/><path d="M9 4l-5 5"/><circle cx="18" cy="18" r="4"/></svg>';
        fab.addEventListener("click", function () { open = !open; renderPanel(); });
        root.appendChild(fab);
        panel = document.createElement("div");
        panel.className = "dsh-cursor-panel";
        panel.style.display = "none";
        root.appendChild(panel);
        document.body.appendChild(root);
        // 监听深浅主题切换（body[data-ds-dark-theme]），实时更新描边方向
        if (typeof MutationObserver !== "undefined") {
          themeObserver = new MutationObserver(function () {
            applyStroke();
          });
          themeObserver.observe(document.body, { attributes: true, attributeFilter: ["data-ds-dark-theme"] });
        }
      }

      function hideNative() {
        if (styleEl) return;
        styleEl = document.createElement("style");
        styleEl.setAttribute("data-plugin", "dsh-cursor");
        styleEl.setAttribute("data-plugin-css", "dsh-cursor/cursor-none");
        styleEl.textContent = CURSOR_CSS;
        document.head.appendChild(styleEl);
      }
      function showNative() {
        if (styleEl && styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
        styleEl = null;
      }

      function imageUrl() { return state.imageUrl || DEFAULT_IMAGE; }

      function makeTrailDot() {
        var el = document.createElement("div");
        el.className = "dsh-cursor-dot";
        el.style.cssText = "position:fixed;left:0;top:0;pointer-events:none;z-index:2147482999;border-radius:50%;background:" + state.trailColor + ";box-shadow:0 0 10px " + state.trailColor + ";";
        document.body.appendChild(el);
        return el;
      }
      function makeRippleEl() {
        var el = document.createElement("div");
        el.className = "dsh-cursor-ripple";
        el.style.cssText = "position:fixed;left:0;top:0;pointer-events:none;z-index:2147482998;border-radius:50%;border:" + state.rippleBorderWidth + "px solid " + state.rippleColor + ";";
        document.body.appendChild(el);
        return el;
      }

      function clearTrail() {
        for (var i = 0; i < trailPoints.length; i++) {
          var el = trailPoints[i].el;
          if (el && el.parentNode) el.parentNode.removeChild(el);
        }
        trailPoints = [];
      }
      function clearRipples() {
        for (var i = 0; i < ripples.length; i++) {
          var el = ripples[i].el;
          if (el && el.parentNode) el.parentNode.removeChild(el);
        }
        ripples = [];
      }

      // rAF：每帧按时间推进拖尾/波纹的演化，过期销毁
      function trailTick(now) {
        var keep = [];
        for (var i = 0; i < trailPoints.length; i++) {
          var p = trailPoints[i];
          var progress = Math.min((now - p.t) / state.trailDuration, 1);
          if (progress >= 1) {
            if (p.el && p.el.parentNode) p.el.parentNode.removeChild(p.el);
            continue;
          }
          keep.push(p);
          var easeOut = 1 - Math.pow(1 - progress, 3);
          var s = state.trailSize * (1 - easeOut);
          if (s < 0.5) s = 0.5;
          var o = 1 - easeOut;
          p.el.style.width = s + "px";
          p.el.style.height = s + "px";
          p.el.style.left = (p.x - s / 2) + "px";
          p.el.style.top = (p.y - s / 2) + "px";
          p.el.style.opacity = String(o);
        }
        trailPoints = keep;
      }
      function rippleTick(now) {
        var keep = [];
        for (var i = 0; i < ripples.length; i++) {
          var p = ripples[i];
          var progress = Math.min((now - p.t) / state.rippleDuration, 1);
          if (progress >= 1) {
            if (p.el && p.el.parentNode) p.el.parentNode.removeChild(p.el);
            continue;
          }
          keep.push(p);
          var easeOut = 1 - Math.pow(1 - progress, 3);
          var s = state.rippleMaxSize * easeOut;
          if (s < 1) s = 1;
          var o = 0.8 * (1 - progress);
          p.el.style.width = s + "px";
          p.el.style.height = s + "px";
          p.el.style.left = (p.x - s / 2) + "px";
          p.el.style.top = (p.y - s / 2) + "px";
          p.el.style.opacity = String(o);
        }
        ripples = keep;
      }
      function loop() {
        raf = requestAnimationFrame(loop);
        var now = performance.now();
        if (state.trailOn) trailTick(now);
        if (state.rippleOn) rippleTick(now);
      }
      function startAnim() {
        if (animRunning) return;
        animRunning = true;
        raf = requestAnimationFrame(loop);
      }
      function stopAnim() {
        animRunning = false;
        cancelAnimationFrame(raf);
      }

      function needAnim() { return state.trailOn || state.rippleOn; }

      function refreshColors() {
        for (var i = 0; i < trailPoints.length; i++) {
          trailPoints[i].el.style.background = state.trailColor;
          trailPoints[i].el.style.boxShadow = "0 0 10px " + state.trailColor;
        }
        for (var j = 0; j < ripples.length; j++) {
          ripples[j].el.style.borderColor = state.rippleColor;
        }
      }

      // 轻量同步：滑块/取色拖动时调用，不重建面板、不打断拖拽
      function applyLight() {
        if (state.enabled) {
          cursorEl.style.width = state.size + "px";
          cursorEl.style.height = state.size + "px";
          applyStroke();
        }
        if (needAnim() && !animRunning) startAnim();
        if (!needAnim() && animRunning) stopAnim();
        refreshColors();
      }

      function applyState() {
        if (state.enabled) {
          hideNative();
          cursorEl.style.display = "block";
          cursorEl.style.width = state.size + "px";
          cursorEl.style.height = state.size + "px";
          cursorEl.style.backgroundImage = "url('" + imageUrl() + "')";
          cursorEl.style.transform = "translate(-50%, -50%)";
          applyStroke();
        } else {
          cursorEl.style.display = "none";
          showNative();
        }
        if (!state.trailOn) clearTrail();
        if (!state.rippleOn) clearRipples();
        applyLight();
        saveState(state);
        syncFab();
        renderPanel();
      }

      function syncFab() {
        fab.className = "dsh-cursor-fab" + ((state.enabled || state.trailOn || state.rippleOn) ? " dsh-cursor-fab-on" : "");
      }

      function onMove(e) {
        var now = performance.now();
        if (state.enabled) {
          cursorEl.style.left = e.clientX + "px";
          cursorEl.style.top = e.clientY + "px";
        }
        if (state.trailOn) {
          if (now - lastTrailAdd < TRAIL_THROTTLE) return;
          lastTrailAdd = now;
          trailPoints.push({ x: e.clientX, y: e.clientY, t: now, el: makeTrailDot() });
          if (trailPoints.length > MAX_TRAIL) {
            var old = trailPoints.shift();
            if (old.el && old.el.parentNode) old.el.parentNode.removeChild(old.el);
          }
        }
      }
      function onEnter() {
        if (state.enabled) cursorEl.style.display = "block";
      }
      function onLeave() {
        if (state.enabled) cursorEl.style.display = "none";
      }
      function onOver(e) {
        if (!state.enabled) return;
        var target = e.target;
        var clickable = target && target.closest
          ? target.closest('a, button, [role="button"], input[type="submit"], input[type="button"], input[type="reset"], [onclick]')
          : null;
        cursorEl.style.transform = clickable
          ? "translate(-50%, -50%) scale(" + state.scale + ")"
          : "translate(-50%, -50%)";
      }
      function onDocClick(e) {
        if (!state.rippleOn) return;
        ripples.push({ x: e.clientX, y: e.clientY, t: performance.now(), el: makeRippleEl() });
        if (ripples.length > MAX_RIPPLE) {
          var old = ripples.shift();
          if (old.el && old.el.parentNode) old.el.parentNode.removeChild(old.el);
        }
      }

      function setImage(url) {
        var img = new Image();
        img.onload = function () {
          state.imageUrl = url;
          errMsg = null;
          applyState();
        };
        img.onerror = function () {
          errMsg = "图片加载失败，请检查 URL（建议透明底 PNG）";
          renderPanel();
        };
        img.src = url;
      }
      // 上传到宿主：POST base64 → { url }（存服务器，不再占 localStorage）
      function uploadToServer(name, base64) {
        return fetch("/api/dsh-cursor-image", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: name, data: base64 })
        }).then(function (r) {
          if (!r.ok) return Promise.reject(new Error("HTTP " + r.status));
          return r.json();
        });
      }
      // 上传本地图片 → 服务器存储 + URL 引用（原图 ≤8MB）
      function onUploadFile(file) {
        if (!file) return;
        if (file.type && file.type.indexOf("image/") !== 0) {
          errMsg = "请选择图片文件（PNG/JPG/WebP/SVG 等）";
          renderPanel();
          return;
        }
        if (file.size > 8 * 1024 * 1024) {
          errMsg = "图片过大（≤8MB）";
          renderPanel();
          return;
        }
        var fr = new FileReader();
        fr.onload = function () {
          var dataUrl = fr.result;
          var rawB64 = dataUrl.indexOf(",") >= 0 ? dataUrl.split(",")[1] : "";
          var probe = new Image();
          probe.onload = function () {
            // 可解码：自动裁剪透明边缘后上传（主体填满光标框）
            autoCropTransparent(dataUrl).then(function (res) {
              if (res.empty) {
                errMsg = "图片内容全透明（裁剪区域可能没有有效内容），请检查原图";
                renderPanel();
                return;
              }
              var croppedB64 = res.url.indexOf(",") >= 0 ? res.url.split(",")[1] : rawB64;
              uploadToServer("cursor.png", croppedB64).then(function (ok) {
                state.imageUrl = ok.url;
                errMsg = null;
                applyState();
              }).catch(function (e) {
                errMsg = "上传失败：" + e.message;
                renderPanel();
              });
            });
          };
          probe.onerror = function () {
            // 无法解码（文件可能损坏）：原始字节仍上传到服务器留存，
            // 之后可在对话中把原图发给 agent 做服务端修复
            uploadToServer(file.name || "cursor.png", rawB64).then(function (ok) {
              state.imageUrl = ok.url;
              errMsg = "该文件浏览器无法解码（可能已损坏）——已上传原始文件。可把原图发到对话中，由 agent 服务端修复后直接替换";
              applyState();
            }).catch(function (e) {
              errMsg = "上传失败：" + e.message;
              renderPanel();
            });
          };
          probe.src = dataUrl;
        };
        fr.onerror = function () {
          errMsg = "文件读取失败";
          renderPanel();
        };
        fr.readAsDataURL(file);
      }
      // 裁剪透明边缘：扫描 alpha>8 的像素包围盒，外扩 1px 后裁剪输出。
      // 解析为 { url, empty }：empty=true 表示全透明（无从裁剪）；
      // 超大图（>1200 万像素）或解码失败时返回原图、empty=false（不阻塞上传）。
      function autoCropTransparent(dataUrl) {
        return new Promise(function (resolve) {
          var img = new Image();
          img.onload = function () {
            try {
              var w = img.naturalWidth, h = img.naturalHeight;
              if (!w || !h || w * h > 12000000) { resolve({ url: dataUrl, empty: false }); return; }
              var cv = document.createElement("canvas");
              cv.width = w;
              cv.height = h;
              var cx = cv.getContext("2d", { willReadFrequently: true });
              cx.drawImage(img, 0, 0);
              var d = cx.getImageData(0, 0, w, h).data;
              var minX = w, minY = h, maxX = -1, maxY = -1;
              for (var y = 0; y < h; y++) {
                var row = y * w;
                for (var x = 0; x < w; x++) {
                  if (d[(row + x) * 4 + 3] > 8) {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                  }
                }
              }
              if (maxX < 0) { resolve({ url: dataUrl, empty: true }); return; } // 全透明
              var cw = maxX - minX + 1, ch = maxY - minY + 1;
              var sx = Math.max(0, minX - 1), sy = Math.max(0, minY - 1);
              cw = Math.min(w - sx, cw + 2);
              ch = Math.min(h - sy, ch + 2);
              var out = document.createElement("canvas");
              out.width = cw;
              out.height = ch;
              out.getContext("2d").drawImage(cv, sx, sy, cw, ch, 0, 0, cw, ch);
              resolve({ url: out.toDataURL("image/png"), empty: false });
            } catch (e) {
              resolve({ url: dataUrl, empty: false }); // 裁剪失败退回原图
            }
          };
          img.onerror = function () { resolve({ url: dataUrl, empty: false }); };
          img.src = dataUrl;
        });
      }

      function row(label) {
        var el = document.createElement("div");
        el.style.cssText = "display:flex;flex-direction:column;gap:6px;";
        var l = document.createElement("div");
        l.className = "dsh-cursor-label";
        l.textContent = label;
        el.appendChild(l);
        return el;
      }
      function toggleRow(key, labelText) {
        var sw = row(labelText);
        var r = document.createElement("div");
        r.className = "dsh-cursor-row";
        ["开", "关"].forEach(function (txt, i) {
          var on = state[key] === (i === 0);
          var b = document.createElement("button");
          b.className = "dsh-cursor-chip" + (on ? " dsh-cursor-chip-on" : "");
          b.textContent = txt;
          b.addEventListener("click", function () { state[key] = i === 0; applyState(); });
          r.appendChild(b);
        });
        sw.appendChild(r);
        return sw;
      }
      function sliderRow(key, labelText, min, max, step) {
        var sc = row(labelText);
        var r = document.createElement("div");
        r.className = "dsh-cursor-row";
        var range = document.createElement("input");
        range.type = "range";
        range.className = "dsh-cursor-range";
        range.min = min;
        range.max = max;
        range.step = step;
        range.value = state[key];
        // input：轻量同步，不重建面板（避免打断拖拽），同时同步数字框显示
        range.addEventListener("input", function () {
          state[key] = Number(range.value);
          num.value = range.value;
          applyLight();
        });
        range.addEventListener("change", function () { saveState(state); });
        var num = document.createElement("input");
        num.type = "number";
        num.className = "dsh-cursor-num";
        num.min = min;
        num.max = max;
        num.step = step;
        num.value = state[key];
        num.addEventListener("change", function () {
          var v = Number(num.value);
          if (!isFinite(v)) v = Number((min + max) / 2);
          if (v < min) v = min;
          if (v > max) v = max;
          state[key] = v;
          applyState();
        });
        r.appendChild(range);
        r.appendChild(num);
        sc.appendChild(r);
        return sc;
      }
      function colorRow(key, labelText) {
        var col = row(labelText);
        var r = document.createElement("div");
        r.className = "dsh-cursor-row";
        var input = document.createElement("input");
        input.type = "color";
        input.className = "dsh-cursor-color";
        input.value = state[key];
        input.addEventListener("input", function () { state[key] = input.value; refreshColors(); });
        input.addEventListener("change", function () { saveState(state); });
        r.appendChild(input);
        col.appendChild(r);
        return col;
      }
      function sep() {
        var d = document.createElement("div");
        d.className = "dsh-cursor-sep";
        return d;
      }

      function renderPanel() {
        panel.innerHTML = "";
        panel.style.display = open ? "" : "none";
        if (!open) return;
        var head = document.createElement("div");
        head.className = "dsh-cursor-head";
        var t = document.createElement("span");
        t.className = "dsh-cursor-title";
        t.textContent = "光标美化";
        var close = document.createElement("button");
        close.className = "dsh-cursor-close";
        close.textContent = "×";
        close.addEventListener("click", function () { open = false; renderPanel(); });
        head.appendChild(t);
        head.appendChild(close);
        panel.appendChild(head);

        // ── 光标 ──
        panel.appendChild(toggleRow("enabled", "图片光标"));
        var im = row("光标图案");
        var r1 = document.createElement("div");
        r1.className = "dsh-cursor-row";
        var isUploaded = state.imageUrl.indexOf("data:") === 0 || state.imageUrl.indexOf("/api/dsh-cursor-image/") === 0;
        // 上传按钮
        var upLabel = document.createElement("label");
        upLabel.className = "dsh-cursor-chip";
        upLabel.style.flex = "0 0 auto";
        upLabel.style.cursor = "pointer";
        upLabel.textContent = "上传";
        var fileInput = document.createElement("input");
        fileInput.type = "file";
        fileInput.accept = "image/*";
        fileInput.style.display = "none";
        fileInput.addEventListener("change", function () {
          onUploadFile(fileInput.files && fileInput.files[0]);
          fileInput.value = "";
        });
        upLabel.appendChild(fileInput);
        r1.appendChild(upLabel);
        var urlInput = document.createElement("input");
        urlInput.type = "text";
        urlInput.className = "dsh-cursor-text";
        urlInput.placeholder = isUploaded ? "已用上传图片 · 可输入 URL 替换" : "图片 URL";
        urlInput.value = isUploaded ? "" : state.imageUrl;
        urlInput.addEventListener("keydown", function (e) { if (e.key === "Enter") setImage(urlInput.value.trim()); });
        var loadBtn = document.createElement("button");
        loadBtn.className = "dsh-cursor-chip";
        loadBtn.style.flex = "0 0 auto";
        loadBtn.textContent = "加载";
        loadBtn.addEventListener("click", function () { setImage(urlInput.value.trim()); });
        var defBtn = document.createElement("button");
        defBtn.className = "dsh-cursor-chip";
        defBtn.style.flex = "0 0 auto";
        defBtn.textContent = "默认";
        defBtn.addEventListener("click", function () { urlInput.value = ""; state.imageUrl = ""; errMsg = null; applyState(); });
        r1.appendChild(urlInput);
        r1.appendChild(loadBtn);
        r1.appendChild(defBtn);
        im.appendChild(r1);
        if (errMsg) {
          var er = document.createElement("div");
          er.className = "dsh-cursor-err";
          er.textContent = errMsg;
          im.appendChild(er);
        }
        panel.appendChild(im);
        panel.appendChild(toggleRow("stroke", "描边（自动适配深浅主题）"));
        panel.appendChild(sliderRow("size", "光标大小", 24, 96, 2));
        panel.appendChild(sliderRow("scale", "悬停放大倍数", 1, 2, 0.1));

        // ── 拖尾 ──
        panel.appendChild(sep());
        panel.appendChild(toggleRow("trailOn", "鼠标拖尾"));
        panel.appendChild(colorRow("trailColor", "拖尾颜色"));
        panel.appendChild(sliderRow("trailSize", "拖尾光点大小", 8, 28, 1));
        panel.appendChild(sliderRow("trailDuration", "拖尾时长(ms)", 300, 1500, 50));

        // ── 点击波纹 ──
        panel.appendChild(sep());
        panel.appendChild(toggleRow("rippleOn", "点击波纹"));
        panel.appendChild(colorRow("rippleColor", "波纹颜色"));
        panel.appendChild(sliderRow("rippleMaxSize", "波纹最大尺寸", 40, 300, 10));
        panel.appendChild(sliderRow("rippleDuration", "波纹时长(ms)", 300, 2000, 50));
        panel.appendChild(sliderRow("rippleBorderWidth", "波纹边框粗细", 1, 6, 1));
      }

      try {
        ensureDom();
        document.addEventListener("mousemove", onMove, { passive: true });
        document.addEventListener("mouseenter", onEnter);
        document.addEventListener("mouseleave", onLeave);
        document.addEventListener("mouseover", onOver, { passive: true });
        document.addEventListener("click", onDocClick, { passive: true });
        applyState();
        ctx.effect(function () {
          return function () {
            stopAnim();
            clearTrail();
            clearRipples();
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseenter", onEnter);
            document.removeEventListener("mouseleave", onLeave);
            document.removeEventListener("mouseover", onOver);
            document.removeEventListener("click", onDocClick);
            if (themeObserver) themeObserver.disconnect();
            showNative();
            if (cursorEl && cursorEl.parentNode) cursorEl.parentNode.removeChild(cursorEl);
            if (root && root.parentNode) root.parentNode.removeChild(root);
            if (uiStyle && uiStyle.parentNode) uiStyle.parentNode.removeChild(uiStyle);
          };
        });
      } catch (e) {
        showNative();
        console.error("dsh-cursor init failed, fallback to native cursor", e);
      }
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});
