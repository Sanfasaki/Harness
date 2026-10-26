// dsh-netease —— 客户端半区
//
// 三块东西：
//   1. 右下角圆形按钮 → 面板：今日推荐 / 我的歌单 / 搜歌
//   2. 右上角歌词：纯透明无边框，只有顶栏的展开/收缩按钮
//   3. 歌词下方：进度条 + 上一首/播放暂停/下一首
//
// 数据来自本地桥 http://127.0.0.1:3457（bridge.py），不走 DSH 宿主路由——
// 宿主侧 JS 改了要重启 DSH，独立服务改了只要重启它自己。

window.__ModuleLoader__.load({
  id: "dsh-netease",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    var inject = [];

    var BRIDGE = "http://127.0.0.1:3457";

    var CSS = [
      "/* ── 右下角卡片 ── */",
      ".dsh-ne-root{position:fixed;right:20px;bottom:140px;z-index:2147482999;pointer-events:none;",
      "display:flex;flex-direction:column-reverse;align-items:flex-end;",
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,sans-serif;}",
      ".dsh-ne-fab{pointer-events:auto;position:relative;width:44px;height:44px;border-radius:50%;",
      "border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.1));",
      "background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#111);",
      "box-shadow:0 6px 20px rgba(0,0,0,.14);display:flex;align-items:center;justify-content:center;",
      "margin-left:auto;cursor:pointer;transition:transform .15s ease,box-shadow .15s ease;}",
      ".dsh-ne-fab:hover{transform:translateY(-1px);box-shadow:0 8px 24px rgba(0,0,0,.18);}",
      // 正在播放时用专辑封面盖住音符图标；没在播就还原
      ".dsh-ne-fab{overflow:hidden;}",
      ".dsh-ne-fab-cover{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;border-radius:50%;display:none;}",
      ".dsh-ne-fab.has-cover .dsh-ne-fab-cover{display:block;}",
      ".dsh-ne-fab.has-cover>svg{display:none;}",
      ".dsh-ne-panel{pointer-events:auto;width:326px;max-height:62vh;overflow:hidden;margin-bottom:10px;",
      "border-radius:14px;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.1));",
      "background:var(--dsw-alias-bg-layer-1,#fff);",
      "backdrop-filter:blur(22px) saturate(1.3);-webkit-backdrop-filter:blur(22px) saturate(1.3);",
      "color:var(--dsw-alias-label-primary,#111);",
      "box-shadow:0 12px 40px rgba(0,0,0,.32);display:flex;flex-direction:column;}",
      ".dsh-ne-head{display:flex;align-items:center;gap:8px;padding:11px 13px 9px;}",
      ".dsh-ne-title{font-size:13px;font-weight:600;flex:0 0 auto;}",
      ".dsh-ne-pill{font-size:11px;padding:1px 7px;border-radius:999px;",
      "background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.05));color:var(--dsw-alias-label-tertiary,#8a8a8a);",
      "max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
      ".dsh-ne-close{margin-left:auto;border:none;background:none;cursor:pointer;font-size:18px;line-height:1;",
      "color:var(--dsw-alias-label-secondary,#666);padding:0 2px;}",
      ".dsh-ne-tabs{display:flex;gap:4px;padding:0 10px 8px;}",
      ".dsh-ne-tab{flex:1;padding:6px 0;border-radius:9px;border:1px solid transparent;cursor:pointer;",
      "font-size:12px;background:transparent;color:var(--dsw-alias-label-secondary,#666);}",
      ".dsh-ne-tab.on{background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.06));",
      "color:var(--dsw-alias-label-primary,#111);font-weight:600;}",
      ".dsh-ne-body{overflow-y:auto;padding:2px 6px 8px;min-height:120px;}",
      ".dsh-ne-row{display:flex;gap:9px;align-items:center;padding:6px 7px;border-radius:10px;cursor:pointer;}",
      ".dsh-ne-row:hover{background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.05));}",
      ".dsh-ne-cover{width:38px;height:38px;border-radius:7px;object-fit:cover;flex:0 0 auto;",
      "background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.06));}",
      ".dsh-ne-meta{min-width:0;flex:1;}",
      ".dsh-ne-name{font-size:12.5px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
      ".dsh-ne-sub{font-size:11px;color:var(--dsw-alias-label-tertiary,#8a8a8a);white-space:nowrap;",
      "overflow:hidden;text-overflow:ellipsis;margin-top:1px;}",
      ".dsh-ne-badge{font-size:10px;padding:0 5px;border-radius:5px;flex:0 0 auto;",
      "background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.06));color:var(--dsw-alias-label-tertiary,#8a8a8a);}",
      ".dsh-ne-hint{padding:18px 14px;font-size:12px;line-height:1.6;",
      "color:var(--dsw-alias-label-tertiary,#8a8a8a);text-align:center;}",
      ".dsh-ne-hint code{font-size:11px;background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.06));",
      "padding:1px 4px;border-radius:4px;}",
      ".dsh-ne-search{display:flex;gap:6px;padding:2px 10px 8px;}",
      ".dsh-ne-input{flex:1;min-width:0;padding:7px 9px;border-radius:9px;font-size:12px;",
      "border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.12));",
      "background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#111);outline:none;}",
      ".dsh-ne-foot{padding:7px 13px 9px;font-size:10.5px;border-top:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.05));",
      "color:var(--dsw-alias-label-tertiary,#9a9a9a);}",
      ".dsh-ne-back{display:flex;align-items:center;gap:7px;padding:2px 10px 8px;}",
      ".dsh-ne-backbtn{border:none;background:none;cursor:pointer;font-size:12px;padding:3px 6px;",
      "border-radius:7px;color:var(--dsw-alias-label-secondary,#666);}",
      ".dsh-ne-backbtn:hover{background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.06));}",
      ".dsh-ne-crumb{font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",

      "/* ── 右上角歌词 + 控制：纯透明无边框 ── */",
      ".dsh-ne-live{position:fixed;top:92px;right:20px;width:250px;z-index:2147482998;",
      "display:none;flex-direction:column;gap:6px;pointer-events:none;",
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,sans-serif;",
      "color:var(--dsw-alias-label-primary,#fff);",
      "text-shadow:0 1px 3px rgba(0,0,0,.55),0 0 12px rgba(0,0,0,.35);}",
      ".dsh-ne-live.on{display:flex;}",
      ".dsh-ne-lv-head{display:flex;align-items:center;gap:6px;pointer-events:auto;cursor:pointer;",
      "opacity:.92;}",
      ".dsh-ne-lv-head:hover{opacity:1;}",
      ".dsh-ne-lv-title{font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;}",
      ".dsh-ne-lv-artist{font-size:10.5px;opacity:.75;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;",
      "min-width:0;flex:1;}",
      ".dsh-ne-lv-toggle{border:none;background:none;cursor:pointer;padding:0 2px;color:inherit;",
      "font-size:11px;line-height:1;opacity:.8;flex:0 0 auto;text-shadow:inherit;}",
      ".dsh-ne-lv-toggle:hover{opacity:1;}",
      ".dsh-ne-lv-body{display:flex;flex-direction:column;gap:11px;pointer-events:none;",
      "text-align:center;max-height:calc(100vh - 240px);overflow:hidden;transition:opacity .18s ease;}",
      ".dsh-ne-lv-body.hide{display:none;}",
      ".dsh-ne-lv-line{font-size:12px;line-height:1.4;opacity:.5;white-space:normal;word-break:break-word;",
      "transition:opacity .18s ease,font-size .18s ease;}",
      ".dsh-ne-lv-line.on{opacity:1;font-weight:600;font-size:12.5px;}",
      ".dsh-ne-lv-tr{font-size:10.5px;font-weight:400;opacity:.72;margin-top:2px;line-height:1.3;}",
      ".dsh-ne-lv-bar{display:flex;align-items:center;gap:7px;pointer-events:auto;margin-top:2px;}",
      ".dsh-ne-lv-track{position:relative;flex:1;height:3px;border-radius:2px;cursor:pointer;",
      "background:rgba(255,255,255,.28);box-shadow:0 0 6px rgba(0,0,0,.35);}",
      ".dsh-ne-lv-fill{position:absolute;left:0;top:0;bottom:0;border-radius:2px;width:0;",
      "background:currentColor;opacity:.95;}",
      ".dsh-ne-lv-time{font-size:9.5px;opacity:.72;font-variant-numeric:tabular-nums;flex:0 0 auto;}",
      ".dsh-ne-lv-ctl{display:flex;align-items:center;justify-content:center;gap:14px;pointer-events:auto;}",
      ".dsh-ne-vol{position:relative;display:flex;align-items:center;}",
      ".dsh-ne-vol-pop{display:none;position:absolute;bottom:24px;left:50%;transform:translateX(-50%);flex-direction:column;align-items:center;gap:3px;padding:7px 4px 5px;border-radius:10px;background:rgba(30,30,34,.86);backdrop-filter:blur(12px);box-shadow:0 10px 26px rgba(0,0,0,.4);pointer-events:auto;z-index:6;}",
      ".dsh-ne-vol-pop.on{display:flex;}",
      ".dsh-ne-vol-range{-webkit-appearance:slider-vertical;appearance:slider-vertical;writing-mode:vertical-lr;direction:rtl;width:16px;height:82px;background:transparent;outline:none;cursor:pointer;margin:0;accent-color:#e9e9ec;}",
      ".dsh-ne-vol-pct{font-size:8.5px;opacity:.9;color:#fff;font-variant-numeric:tabular-nums;}",
      ".dsh-ne-lv-btn{border:none;background:none;cursor:pointer;padding:2px;color:inherit;",
      "display:flex;align-items:center;justify-content:center;opacity:.88;text-shadow:inherit;}",
      ".dsh-ne-lv-btn:hover{opacity:1;}",
      ".dsh-ne-lv-btn:disabled{opacity:.35;cursor:default;}",
    ].join("");

    function el(tag, cls, text) {
      var node = document.createElement(tag);
      if (cls) node.className = cls;
      if (text != null) node.textContent = text;
      return node;
    }

    function fmt(ms) {
      if (!ms || ms < 0) return "0:00";
      var total = Math.floor(ms / 1000);
      var m = Math.floor(total / 60);
      var s = total % 60;
      return m + ":" + (s < 10 ? "0" : "") + s;
    }

    var ICON = {
      prev: '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M7 6h2v12H7zM19 6v12L9 12z"/></svg>',
      next: '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M15 6h2v12h-2zM5 6v12l10-6z"/></svg>',
      play: '<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
      pause: '<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>',
      vol: '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M3 10v4h4l5 4V6L7 10H3zm13.5 2a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z"/></svg>',
    };

    function apply(ctx) {
      var styleEl = null;
      // 卡片
      var root = null, panel = null, bodyEl = null, pillEl = null;
      var tabEls = {}, searchWrap = null, inputEl = null, backWrap = null, crumbEl = null;
      var current = "daily";
      var playlistId = null;
      var reqSeq = 0;
      var open = false;

      // 歌词 + 控制
      var live = null, lvTitle = null, lvArtist = null, lvBody = null, lvToggle = null;
      var lvTrack = null, lvFill = null, lvTime = null, lvPlayBtn = null;
      var volPop = null, lvVol = null, lvVolPct = null;
      var fabCover = null;
      var collapsed = false;
      var lastNow = null;
      var lastLyricKey = "";
      var pollTimer = null, tickTimer = null;

      // ── 数据 ──
      function bridge(path) {
        return fetch(BRIDGE + path, { cache: "no-store" }).then(function (r) {
          return r.json().then(function (j) { return { status: r.status, body: j }; });
        });
      }

      function mount() {
        styleEl = document.createElement("style");
        styleEl.setAttribute("data-dsh-netease", "1");
        styleEl.textContent = CSS;
        document.head.appendChild(styleEl);

        root = el("div", "dsh-ne-root");

        var fab = el("button", "dsh-ne-fab");
        fab.type = "button";
        fab.title = "网易云音乐";
        fab.setAttribute("aria-label", "网易云音乐");
        fab.innerHTML =
          '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
          'stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M9 18V5l10-2v13"/><circle cx="6.5" cy="18" r="3"/><circle cx="16.5" cy="16" r="3"/></svg>';
        // 正在播放时用专辑封面盖住图标（见 setFabCover）
        fabCover = el("img", "dsh-ne-fab-cover");
        fabCover.alt = "";
        fabCover.referrerPolicy = "no-referrer";
        fab.appendChild(fabCover);
        fab.addEventListener("click", function () {
          open = !open;
          panel.style.display = open ? "flex" : "none";
          if (open) {
            refreshStatus();
            load(current);
          }
        });

        panel = el("div", "dsh-ne-panel");
        panel.style.display = "none";

        var head = el("div", "dsh-ne-head");
        head.appendChild(el("div", "dsh-ne-title", "网易云"));
        pillEl = el("div", "dsh-ne-pill", "…");
        head.appendChild(pillEl);
        var close = el("button", "dsh-ne-close", "×");
        close.type = "button";
        close.title = "收起";
        close.addEventListener("click", function () {
          open = false;
          panel.style.display = "none";
        });
        head.appendChild(close);

        var tabs = el("div", "dsh-ne-tabs");
        [["daily", "今日推荐"], ["playlists", "我的歌单"], ["search", "搜歌"]].forEach(function (pair) {
          var key = pair[0];
          var tab = el("button", "dsh-ne-tab" + (key === current ? " on" : ""), pair[1]);
          tab.type = "button";
          tab.addEventListener("click", function () {
            current = key;
            playlistId = null;
            Object.keys(tabEls).forEach(function (k) {
              tabEls[k].className = "dsh-ne-tab" + (k === current ? " on" : "");
            });
            searchWrap.style.display = current === "search" ? "flex" : "none";
            backWrap.style.display = "none";
            load(current);
            if (current === "search" && inputEl) inputEl.focus();
          });
          tabEls[key] = tab;
          tabs.appendChild(tab);
        });

        searchWrap = el("div", "dsh-ne-search");
        searchWrap.style.display = "none";
        inputEl = el("input", "dsh-ne-input");
        inputEl.setAttribute("placeholder", "歌名 / 歌手，回车搜索");
        inputEl.addEventListener("keydown", function (e) {
          if (e.key === "Enter") doSearch();
          e.stopPropagation();
        });
        searchWrap.appendChild(inputEl);

        backWrap = el("div", "dsh-ne-back");
        backWrap.style.display = "none";
        var backBtn = el("button", "dsh-ne-backbtn", "‹ 歌单");
        backBtn.type = "button";
        backBtn.addEventListener("click", function () {
          playlistId = null;
          backWrap.style.display = "none";
          load("playlists");
        });
        crumbEl = el("div", "dsh-ne-crumb", "");
        backWrap.appendChild(backBtn);
        backWrap.appendChild(crumbEl);

        bodyEl = el("div", "dsh-ne-body");
        var foot = el("div", "dsh-ne-foot", "点歌名会在网易云客户端里播放");

        panel.appendChild(head);
        panel.appendChild(tabs);
        panel.appendChild(searchWrap);
        panel.appendChild(backWrap);
        panel.appendChild(bodyEl);
        panel.appendChild(foot);

        root.appendChild(fab);
        root.appendChild(panel);
        document.body.appendChild(root);
      }

      function hint(html) {
        bodyEl.innerHTML = "";
        var box = el("div", "dsh-ne-hint");
        box.innerHTML = html;
        bodyEl.appendChild(box);
      }

      function refreshStatus() {
        bridge("/status").then(function (out) {
          var s = out.body || {};
          if (s.loggedIn) pillEl.textContent = s.nickname || "已登录";
          else if (s.reason === "no-cookie") pillEl.textContent = "未配置 cookie";
          else pillEl.textContent = "未登录";
        }).catch(function () {
          pillEl.textContent = "桥未启动";
        });
      }

      function songRow(s) {
        var row = el("div", "dsh-ne-row");
        var img = el("img", "dsh-ne-cover");
        img.referrerPolicy = "no-referrer";
        img.alt = "";
        if (s.cover) img.src = s.cover;
        row.appendChild(img);
        var meta = el("div", "dsh-ne-meta");
        meta.appendChild(el("div", "dsh-ne-name", s.name || "(未知)"));
        meta.appendChild(el("div", "dsh-ne-sub", s.artists || ""));
        row.appendChild(meta);
        row.addEventListener("click", function () {
          if (!s.id) return;
          // 交给 bridge 在主机侧唤起：它优先用 orpheus:// 打开桌面客户端，
          // 协议不可用再退回网页。浏览器直接跳 orpheus:// 会被拦或被问一次。
          bridge("/open?song=" + encodeURIComponent(s.id)).then(function (out) {
            if (out.body && out.body.ok === false) {
              window.open("https://music.163.com/#/song?id=" + s.id, "_blank", "noopener");
            }
          }).catch(function () {
            window.open("https://music.163.com/#/song?id=" + s.id, "_blank", "noopener");
          });
        });
        return row;
      }

      function renderSongs(songs) {
        bodyEl.innerHTML = "";
        if (!songs || !songs.length) {
          hint("这里没有内容。");
          return;
        }
        songs.forEach(function (s) { bodyEl.appendChild(songRow(s)); });
      }

      function renderPlaylists(list) {
        bodyEl.innerHTML = "";
        if (!list || !list.length) {
          hint("没有歌单。");
          return;
        }
        list.forEach(function (p) {
          var row = el("div", "dsh-ne-row");
          var img = el("img", "dsh-ne-cover");
          img.referrerPolicy = "no-referrer";
          img.alt = "";
          if (p.cover) img.src = p.cover;
          row.appendChild(img);
          var meta = el("div", "dsh-ne-meta");
          meta.appendChild(el("div", "dsh-ne-name", p.name || "(未命名)"));
          meta.appendChild(el("div", "dsh-ne-sub", (p.count || 0) + " 首"));
          row.appendChild(meta);
          if (!p.mine) row.appendChild(el("div", "dsh-ne-badge", "收藏"));
          row.addEventListener("click", function () { openPlaylist(p); });
          bodyEl.appendChild(row);
        });
      }

      function openPlaylist(p) {
        playlistId = p.id;
        crumbEl.textContent = p.name || "";
        backWrap.style.display = "flex";
        hint("加载中…");
        bridge("/playlist?id=" + encodeURIComponent(p.id)).then(function (out) {
          if (out.status !== 200) {
            hint("歌单拉取失败（" + out.status + "）。");
            return;
          }
          renderSongs(out.body.songs || []);
        }).catch(function () {
          hint("桥未启动。<br>在 netease/ 下运行 <code>python bridge.py</code>");
        });
      }

      function load(tab) {
        if (tab === "search") {
          if (!inputEl.value.trim()) hint("输入歌名或歌手，回车搜索。");
          return;
        }
        if (tab === "playlists" && playlistId) return;
        var seq = ++reqSeq;
        hint("加载中…");
        bridge("/" + tab).then(function (out) {
          if (seq !== reqSeq) return;
          if (out.status === 401) {
            hint("还没配置 cookie。<br>把网易云网页版的 Cookie 填进<br><code>netease/.env</code> 的 NETEASE_COOKIE");
            return;
          }
          if (out.status !== 200) {
            hint("拉取失败（" + out.status + "）。");
            return;
          }
          if (tab === "playlists") renderPlaylists(out.body.playlists || []);
          else renderSongs(out.body.songs || []);
        }).catch(function () {
          if (seq !== reqSeq) return;
          hint("连不上本地桥。<br>在 netease/ 下运行 <code>python bridge.py</code>");
        });
      }

      function doSearch() {
        var q = inputEl.value.trim();
        if (!q) return;
        var seq = ++reqSeq;
        hint("搜索中…");
        bridge("/search?q=" + encodeURIComponent(q) + "&limit=15").then(function (out) {
          if (seq !== reqSeq) return;
          if (out.status !== 200) { hint("搜索失败（" + out.status + "）。"); return; }
          renderSongs(out.body.songs || []);
        }).catch(function () { hint("搜索请求失败。"); });
      }

      // ── 右上角：歌词 + 控制 ──
      function buildLive() {
        live = el("div", "dsh-ne-live");

        var head = el("div", "dsh-ne-lv-head");
        var note = el("span", "", "♪");
        note.style.fontSize = "10px";
        note.style.opacity = "0.8";
        lvTitle = el("div", "dsh-ne-lv-title", "");
        lvArtist = el("div", "dsh-ne-lv-artist", "");
        lvToggle = el("button", "dsh-ne-lv-toggle", "收起");
        lvToggle.type = "button";
        lvToggle.title = "展开 / 收缩歌词";
        lvToggle.addEventListener("click", function (e) {
          e.stopPropagation();
          collapsed = !collapsed;
          lvBody.className = "dsh-ne-lv-body" + (collapsed ? " hide" : "");
          lvToggle.textContent = collapsed ? "展开" : "收起";
        });
        head.appendChild(note);
        head.appendChild(lvTitle);
        head.appendChild(lvArtist);
        head.appendChild(lvToggle);

        lvBody = el("div", "dsh-ne-lv-body");

        var bar = el("div", "dsh-ne-lv-bar");
        lvTrack = el("div", "dsh-ne-lv-track");
        lvFill = el("div", "dsh-ne-lv-fill");
        lvTrack.appendChild(lvFill);
        lvTime = el("div", "dsh-ne-lv-time", "0:00");
        lvTrack.addEventListener("click", function (e) {
          if (!lastNow || !lastNow.endMs) return;
          var rect = lvTrack.getBoundingClientRect();
          var ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
          bridge("/seek?ms=" + Math.round(ratio * lastNow.endMs)).then(pollNow).catch(function () {});
        });
        bar.appendChild(lvTrack);
        bar.appendChild(lvTime);

        var ctl = el("div", "dsh-ne-lv-ctl");
        var prev = el("button", "dsh-ne-lv-btn", "");
        prev.type = "button";
        prev.innerHTML = ICON.prev;
        prev.title = "上一首";
        prev.addEventListener("click", function () { send("prev"); });
        lvPlayBtn = el("button", "dsh-ne-lv-btn", "");
        lvPlayBtn.type = "button";
        lvPlayBtn.innerHTML = ICON.play;
        lvPlayBtn.title = "播放 / 暂停";
        lvPlayBtn.addEventListener("click", function () { send("toggle"); });
        var next = el("button", "dsh-ne-lv-btn", "");
        next.type = "button";
        next.innerHTML = ICON.next;
        next.title = "下一首";
        next.addEventListener("click", function () { send("next"); });
        ctl.appendChild(prev);
        ctl.appendChild(lvPlayBtn);
        ctl.appendChild(next);

        // 音量：一个小喇叭按钮，点一下从上方弹出纵向滑轨。
        // 数据走 bridge 的常驻音量助手（见 bridge.py 的 Volume 类），不再每次起进程。
        var volWrap = el("div", "dsh-ne-vol");
        var volBtn = el("button", "dsh-ne-lv-btn dsh-ne-vol-btn", "");
        volBtn.type = "button";
        volBtn.innerHTML = ICON.vol;
        volBtn.title = "音量";
        volPop = el("div", "dsh-ne-vol-pop");
        lvVol = el("input", "dsh-ne-vol-range");
        lvVol.type = "range";
        lvVol.min = "0";
        lvVol.max = "100";
        lvVol.step = "1";
        lvVol.value = "50";
        lvVol.addEventListener("input", onVolInput);
        lvVolPct = el("div", "dsh-ne-vol-pct", "");
        volPop.appendChild(lvVol);
        volPop.appendChild(lvVolPct);
        volWrap.appendChild(volPop);
        volWrap.appendChild(volBtn);
        volBtn.addEventListener("click", function (e) {
          if (e && e.stopPropagation) e.stopPropagation();
          var on = volPop.className.indexOf("on") >= 0;
          volPop.className = "dsh-ne-vol-pop" + (on ? "" : " on");
          if (!on) loadVolume();
        });
        volPop.addEventListener("click", function (e) {
          if (e && e.stopPropagation) e.stopPropagation();
        });
        ctl.appendChild(volWrap);

        live.appendChild(head);
        live.appendChild(lvBody);
        live.appendChild(bar);
        live.appendChild(ctl);
        document.body.appendChild(live);
      }

      // ── 音量（常驻助手在 bridge 侧，这里只读写两个小文件对应的端点）──
      function loadVolume() {
        if (!lvVol) return;
        bridge("/volume").then(function (out) {
          var b = out && out.body;
          if (!b || b.ok === false) return;
          if (typeof b.volume === "number") {
            lvVol.value = String(b.volume);
            if (lvVolPct) lvVolPct.textContent = b.volume + "%";
          }
        }).catch(function () {});
      }

      var volTimer = null;
      function onVolInput() {
        var v = parseInt(lvVol.value, 10);
        if (isNaN(v)) return;
        if (lvVolPct) lvVolPct.textContent = v + "%";
        if (volTimer) clearTimeout(volTimer);
        // 常驻助手那边写入只要几毫秒，80ms 足够合批又跟手
        volTimer = setTimeout(function () {
          volTimer = null;
          bridge("/volume?value=" + v).catch(function () {});
        }, 80);
      }

      function send(action) {
        if (lvPlayBtn) lvPlayBtn.disabled = true;
        bridge("/control?action=" + action).then(function () {
          setTimeout(pollNow, 350);
        }).catch(function () {}).then(function () {
          if (lvPlayBtn) lvPlayBtn.disabled = false;
        });
      }

      // 播放中把音符图标换成专辑封面；停下或没封面就还原
      function setFabCover(data) {
        if (!fabCover || !fabCover.parentNode) return;
        var url = (data && data.playing && data.cover) ? data.cover : "";
        var fab = fabCover.parentNode;
        if (url) {
          if (fabCover.getAttribute("src") !== url) fabCover.src = url;
          fab.className = "dsh-ne-fab has-cover";
          fab.title = (data.title || "正在播放") + (data.artist ? " - " + data.artist : "");
        } else {
          fab.className = "dsh-ne-fab";
          fab.title = "网易云音乐";
        }
      }

      function renderNow(data) {
        lastNow = data;
        setFabCover(data);
        if (!live) return;
        if (!data || !data.title) {
          live.className = "dsh-ne-live";
          lastLyricKey = "";
          return;
        }
        live.className = "dsh-ne-live on";
        lvTitle.textContent = data.title;
        lvArtist.textContent = data.artist || data.album || "";
        lvPlayBtn.innerHTML = data.playing ? ICON.pause : ICON.play;

        var lines = data.lines || [];
        var pos = (data.positionMs || 0) + (data.playing ? Date.now() - (data.at || Date.now()) : 0);
        if (data.endMs && pos > data.endMs) pos = data.endMs;

        var idx = -1;
        for (var i = 0; i < lines.length; i++) {
          if (lines[i].t <= pos) idx = i; else break;
        }
        var from, to;
        if (collapsed) {
          from = to = Math.max(0, idx);
        } else {
          from = Math.max(0, idx - 1);
          to = Math.min(lines.length - 1, idx + 2);
          if (idx < 0) { from = 0; to = Math.min(3, lines.length - 1); }
        }
        var key = (data.songId || "x") + "|" + from + "|" + to + "|" + idx + "|" + (data.songId ? 1 : 0);
        if (key !== lastLyricKey) {
          lastLyricKey = key;
          lvBody.innerHTML = "";
          if (!lines.length) {
            lvBody.appendChild(el("div", "dsh-ne-lv-line", data.songId ? "（这首歌没有歌词）" : "（没匹配到网易云歌曲）"));
          } else {
            for (var k = from; k <= to; k++) {
              var line = lines[k];
              if (!line) continue;
              var node = el("div", "dsh-ne-lv-line" + (k === idx ? " on" : ""), line.text);
              if (line.tr) node.appendChild(el("div", "dsh-ne-lv-tr", line.tr));
              lvBody.appendChild(node);
            }
          }
        }
        updateBar();
      }

      function updateBar() {
        if (!lastNow || !lastNow.endMs || !lvFill) return;
        var pos = (lastNow.positionMs || 0) + (lastNow.playing ? Date.now() - (lastNow.at || Date.now()) : 0);
        if (pos > lastNow.endMs) pos = lastNow.endMs;
        if (pos < 0) pos = 0;
        lvFill.style.width = ((pos / lastNow.endMs) * 100).toFixed(2) + "%";
        lvTime.textContent = fmt(pos) + " / " + fmt(lastNow.endMs);
      }

      function pollNow() {
        bridge("/now").then(function (out) { renderNow(out.body); }).catch(function () {
          if (live) live.className = "dsh-ne-live";
          setFabCover(null);
        });
      }

      try {
        mount();
        buildLive();
        pollNow();
        pollTimer = setInterval(pollNow, 1000);
        tickTimer = setInterval(updateBar, 250);
        ctx.effect(function () {
          return function () {
            if (pollTimer) clearInterval(pollTimer);
            if (tickTimer) clearInterval(tickTimer);
            pollTimer = tickTimer = null;
            if (root && root.parentNode) root.parentNode.removeChild(root);
            if (live && live.parentNode) live.parentNode.removeChild(live);
            if (styleEl && styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
          };
        });
      } catch (e) {
        console.error("dsh-netease init failed", e);
      }
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
