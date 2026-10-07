/* Копия сайта для просмотра на GitHub Pages: запросы /api/... берутся из готовых файлов /data/..., управление отключено.
   Файлы собирает pages_build.py на сервере раз в 10 минут. Правило имён то же, что fname() в pages_build.py. */
(function () {
  "use strict";
  var realFetch = window.fetch.bind(window);
  var VER = { t: 0, built: "" };
  var verP = realFetch("/data/version.json?_=" + Date.now(), { cache: "no-store" })
    .then(function (r) { return r.json(); })
    .then(function (j) { VER = j; return j; })
    .catch(function () { return VER; });

  function fname(u) {
    return "/data/" + u.replace(/^\/+/, "").replace("?", "@").replace(/[^A-Za-z0-9._@=&,\/-]/g, "_") + ".json";
  }
  function json(obj, status) {
    return new Response(JSON.stringify(obj), { status: status, headers: { "Content-Type": "application/json" } });
  }

  window.fetch = async function (input, init) {
    var url = typeof input === "string" ? input : (input && input.url) || String(input);
    var u;
    try { u = new URL(url, location.href); } catch (e) { return realFetch(input, init); }
    if (u.origin !== location.origin || u.pathname.indexOf("/api/") !== 0) return realFetch(input, init);
    var method = String((init && init.method) || (input && input.method) || "GET").toUpperCase();
    if (method !== "GET") return json({ error: "Копия сайта только для просмотра: управление отключено" }, 403);
    await verP;
    var r = await realFetch(fname(u.pathname + u.search) + "?v=" + VER.t);
    if (!r.ok) return json({ error: "Этой страницы нет в копии" }, 404);
    return r;
  };

  // ------------------------------------------------ установка как приложение: service worker
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () { navigator.serviceWorker.register("/sw.js").catch(function () { /* без офлайна */ }); });
  }

  // ------------------------------------------------ плашка: время данных и кнопка «Обновить»
  function two(n) { return (n < 10 ? "0" : "") + n; }
  function build() {
    var box = document.createElement("div");
    box.id = "static-copy";
    box.style.cssText = "position:fixed;right:12px;bottom:12px;z-index:99999;display:flex;gap:8px;align-items:center;" +
      "background:rgba(20,24,34,.92);color:#e6e9f0;border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:7px 10px;" +
      "font:500 12px/1.2 system-ui,-apple-system,Segoe UI,sans-serif;box-shadow:0 4px 18px rgba(0,0,0,.35);max-width:calc(100vw - 24px)";
    var lab = document.createElement("span");
    var btn = document.createElement("button");
    btn.textContent = "⟳ Обновить";
    btn.style.cssText = "cursor:pointer;border:1px solid rgba(255,255,255,.25);background:#ff7a1a;color:#111;border-radius:7px;" +
      "padding:5px 9px;font:600 12px system-ui,sans-serif";
    box.title = "Копия сайта для просмотра. Открытые реальные ставки скрыты, управление отключено. Данные обновляются на сервере раз в 10 минут.";
    box.appendChild(lab);
    box.appendChild(btn);
    document.body.appendChild(box);

    function show(msg) { lab.textContent = msg; }
    function base() { return VER.built ? "данные от " + VER.built.slice(5, 16).replace("-", ".").replace(" ", " в ") : "копия сайта"; }
    verP.then(function () { show(base()); });

    var busy = false;
    function check(manual) {
      if (busy) return Promise.resolve();
      busy = true;
      if (manual) { btn.disabled = true; show("проверяю…"); }
      return realFetch("/data/version.json?_=" + Date.now(), { cache: "no-store" })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (j.t !== VER.t) {
            var typing = document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
            if (manual || !typing) { show("загружаю новые данные…"); location.reload(); return; }
            show("есть новые данные — нажмите «Обновить»");
          } else if (manual) {
            show("уже самые свежие · " + base());
            setTimeout(function () { show(base()); }, 4000);
          }
        })
        .catch(function () { if (manual) show("не удалось проверить"); })
        .then(function () { busy = false; btn.disabled = false; });
    }
    btn.addEventListener("click", function () { check(true); });
    setInterval(function () { if (!document.hidden) check(false); }, 10 * 60 * 1000);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) check(false); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build);
  else build();
})();
