"use strict";
/* =====================================================================
   ux.js — плавная прокрутка, бегунок вкладок и «умные» таблицы (оба вида спорта).
   Таблицы: у каждого столбца фильтр (числа — диапазон с гистограммой, мало разных значений — галочки,
   текст — поиск), общий поиск, счётчик, чипы активных фильтров, выгрузка в CSV, сортировка.
   Таблицы из table() (app.js) фильтруются по всем данным (и тем, что за «Показать ещё»),
   остальные таблицы .tbl — по строкам на странице.
   ===================================================================== */
const ST = (() => {
  const RM = matchMedia("(prefers-reduced-motion: reduce)");
  const e$ = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ICON = {
    filter: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18l-7 8.5V20l-4-2v-4.5z" fill="currentColor"/></svg>',
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2.2" fill="none"/><path d="m20 20-3.5-3.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
    csv: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19h14" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    reset: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };

  /* ---------- значения ячеек ---------- */
  const EMPTY = new Set(["", "—", "-", "–", "…"]);
  const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
  const strip = (h) => clean(String(h ?? "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'"));
  // одно число в ячейке (+$12, −3.2%, 1 234, 56¢, +4.1 п.п.) → число; две цифры (счёт, дата со временем) или много букв → null
  function num(s) {
    if (EMPTY.has(s)) return null;
    const t = s.replace(/[−–]/g, "-").replace(/\s*±\s*\d+(?:[.,]\d+)?/g, "").replace(/(\d)[\s  ](?=\d{3}(\D|$))/g, "$1");
    const m = t.match(/[-+]?\$?-?\d+(?:[.,]\d+)?/g);
    if (!m || m.length !== 1) return null;
    if (t.replace(m[0], "").replace(/[^A-Za-zА-Яа-яЁё]/g, "").length > 6) return null;
    const v = parseFloat(m[0].replace(/[$+]/g, "").replace(",", "."));
    return Number.isFinite(v) ? v : null;
  }
  // тип столбца: числа / мало разных значений / текст
  function kind(vals) {
    const ne = vals.filter((v) => !EMPTY.has(v));
    if (!ne.length) return { t: "set", vals: [] };
    const n = ne.map(num).filter((v) => v !== null);
    const uniq = new Map();
    for (const v of ne) uniq.set(v, (uniq.get(v) || 0) + 1);
    if (n.length >= 0.8 * ne.length && uniq.size > 6) return { t: "num", nums: n };
    if (uniq.size <= 40) return { t: "set", vals: [...uniq].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ru")) };
    if (n.length >= 0.8 * ne.length) return { t: "num", nums: n };
    return { t: "txt" };
  }

  /* ---------- состояние фильтров: по адресу страницы и набору столбцов ---------- */
  const STATE = new Map();
  const keyOf = (labels, id) => location.pathname + location.hash.split("?")[0] + "|" + (id || "") + "|" + labels.join("¦");
  const state = (key) => { if (!STATE.has(key)) STATE.set(key, { f: {}, q: "" }); return STATE.get(key); };
  const active = (st) => !!st.q || Object.keys(st.f).length > 0;

  function matchRow(st, labels, cells) {
    if (st.q) {
      const q = st.q.toLowerCase();
      if (!cells.some((c) => c.toLowerCase().includes(q))) return false;
    }
    for (const [lab, f] of Object.entries(st.f)) {
      const i = labels.indexOf(lab);
      if (i < 0) continue;
      const c = cells[i] ?? "";
      if (f.t === "num") {
        const v = num(c);
        if (v === null) return false;
        if (f.min !== null && f.min !== undefined && v < f.min) return false;
        if (f.max !== null && f.max !== undefined && v > f.max) return false;
      } else if (f.t === "set") {
        if (f.ex.includes(c)) return false;
      } else if (f.t === "txt") {
        const lc = c.toLowerCase();
        const terms = f.q.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
        const neg = terms.filter((x) => x.startsWith("!")).map((x) => x.slice(1)).filter(Boolean);
        const pos = terms.filter((x) => !x.startsWith("!"));
        if (neg.some((x) => lc.includes(x))) return false;
        if (pos.length && !pos.some((x) => lc.includes(x))) return false;
      }
    }
    return true;
  }

  const fmtN = (v) => (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString("ru-RU") : +v.toFixed(2) + "");
  function chipText(lab, f, ctx) {
    if (f.t === "num") {
      const a = f.min !== null && f.min !== undefined, b = f.max !== null && f.max !== undefined;
      const lo = f.min > 0 && f.min < 0.001 ? "> 0" : "≥ " + fmtN(f.min), hi = f.max < 0 && f.max > -0.001 ? "< 0" : "≤ " + fmtN(f.max);
      return `${lab}: ${a && b ? fmtN(f.min) + " … " + fmtN(f.max) : a ? lo : hi}`;
    }
    if (f.t === "txt") return `${lab}: «${f.q}»`;
    const all = ctx ? (kind(ctx.column(ctx.labels.indexOf(lab))).vals || []).map((x) => x[0]) : [];
    const inc = all.filter((v) => !f.ex.includes(v));
    const list = (a) => a.slice(0, 2).map((x) => x || "пусто").join(", ") + (a.length > 2 ? ` +${a.length - 2}` : "");
    return inc.length && inc.length <= f.ex.length ? `${lab}: ${list(inc)}` : `${lab}: кроме ${list(f.ex)}`;
  }

  /* ---------- панель над таблицей ---------- */
  function bar(ctx) {
    let b = ctx.barHost();
    const st = state(ctx.key);
    if (!b) return;
    const shown = ctx.count();
    const chips = Object.entries(st.f).map(([lab, f]) => `<button class="st-chip" data-lab="${e$(lab)}" title="Убрать фильтр"><span>${e$(chipText(lab, f, ctx))}</span><i>×</i></button>`).join("");
    if (!b.firstChild) {
      b.innerHTML = `<label class="st-search">${ICON.search}<input type="text" placeholder="Поиск по таблице" aria-label="Поиск по таблице"></label>
        <span class="st-count"></span><div class="st-chips"></div>
        <div class="st-end"><button class="st-act st-reset" hidden>${ICON.reset}Сбросить</button><button class="st-act st-csv" title="Скачать строки, что сейчас видны (с учётом фильтров), для Excel">${ICON.csv}CSV</button></div>`;
      const inp = b.querySelector("input");
      let t = 0;
      inp.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { state(b._ctx.key).q = inp.value.trim(); b._ctx.change(); }, 160); });
      inp.addEventListener("keydown", (e) => { if (e.key === "Escape") { inp.value = ""; state(b._ctx.key).q = ""; b._ctx.change(); } });
      b.querySelector(".st-reset").onclick = () => { const s = state(b._ctx.key); s.f = {}; s.q = ""; inp.value = ""; closePop(); b._ctx.change(); };
      b.querySelector(".st-csv").onclick = () => csv(b._ctx);
      b.addEventListener("click", (e) => { const c = e.target.closest(".st-chip"); if (c) { delete state(b._ctx.key).f[c.dataset.lab]; closePop(); b._ctx.change(); } });
    }
    b._ctx = ctx;
    const inp = b.querySelector("input");
    if (document.activeElement !== inp && inp.value !== st.q) inp.value = st.q;
    b.querySelector(".st-count").innerHTML = active(st) ? `<b>${shown.toLocaleString("ru-RU")}</b> из ${ctx.total.toLocaleString("ru-RU")}` : `${ctx.total.toLocaleString("ru-RU")} строк`;
    b.querySelector(".st-chips").innerHTML = chips;
    b.querySelector(".st-reset").hidden = !active(st);
  }

  function csv(ctx) {
    const rows = [ctx.labels].concat(ctx.visibleRows());
    const q = (s) => (/[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    const txt = "﻿" + rows.map((r) => r.map((c) => q(String(c ?? ""))).join(";")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([txt], { type: "text/csv;charset=utf-8" }));
    a.download = (document.title.replace(/\s+/g, "_") || "table") + "_" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  /* ---------- кнопки фильтра в заголовках ---------- */
  function heads(ctx, ths) {
    const st = state(ctx.key);
    ths.forEach((th, i) => {
      const lab = ctx.labels[i];
      if (!lab) return;
      let btn = th.querySelector(".st-fbtn");
      if (!btn) {
        btn = document.createElement("button");
        btn.type = "button"; btn.className = "st-fbtn"; btn.innerHTML = ICON.filter;
        btn.setAttribute("aria-label", "Фильтр: " + lab);
        th.append(btn);
        btn.addEventListener("click", (e) => { e.stopPropagation(); e.preventDefault(); openPop(btn._ctx, lab, btn); });
      }
      btn._ctx = ctx;
      btn.classList.toggle("on", !!st.f[lab]);
      btn.title = st.f[lab] ? chipText(lab, st.f[lab], ctx) : "Фильтр и сортировка";
    });
  }

  /* ---------- окно фильтра ---------- */
  let POP = null;
  function closePop() { if (POP) { POP.el.remove(); POP = null; } }
  document.addEventListener("pointerdown", (e) => { if (POP && !POP.el.contains(e.target) && !e.target.closest(".st-fbtn")) closePop(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && POP) { e.stopPropagation(); closePop(); } }, true);
  window.addEventListener("resize", closePop);
  window.addEventListener("hashchange", closePop);

  function openPop(ctx, lab, anchor) {
    if (POP && POP.lab === lab && POP.anchor === anchor) { closePop(); return; }
    closePop();
    const i = ctx.labels.indexOf(lab);
    const k = kind(ctx.column(i));
    const st = state(ctx.key);
    const el = document.createElement("div");
    el.className = "st-pop"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Фильтр столбца " + lab);
    el.dataset.ssPrevent = "";
    POP = { el, lab, anchor };
    const cur = st.f[lab];
    const set = (f) => { if (f) st.f[lab] = f; else delete st.f[lab]; POP && (POP.ctx = ctx); ctx.change(); refreshHist(); };
    const sortRow = ctx.sort ? `<div class="st-sec"><div class="st-lbl">Сортировка</div><div class="st-row">
        <button class="st-btn" data-sd="1">${k.t === "num" ? "По возрастанию ↑" : "А → Я"}</button><button class="st-btn" data-sd="-1">${k.t === "num" ? "По убыванию ↓" : "Я → А"}</button></div></div>` : "";
    let body = "";
    if (k.t === "num") {
      const mn = Math.min(...k.nums), mx = Math.max(...k.nums);
      body = `<div class="st-sec"><div class="st-lbl">Диапазон · от ${fmtN(mn)} до ${fmtN(mx)}</div><div class="st-hist"></div>
        <div class="st-row"><input type="number" step="any" placeholder="от" data-r="min" value="${cur?.min ?? ""}"><input type="number" step="any" placeholder="до" data-r="max" value="${cur?.max ?? ""}"></div>
        <div class="st-quick"><button data-qk="pos">больше 0</button><button data-qk="neg">меньше 0</button><button data-qk="top">верхние 25%</button><button data-qk="bot">нижние 25%</button></div></div>`;
    } else if (k.t === "set") {
      body = `${k.vals.length > 8 ? `<div class="st-sec"><input type="text" placeholder="Найти значение" data-find></div>` : ""}
        <div class="st-sec" style="padding-bottom:8px"><div class="st-row"><button class="st-btn" data-all="1">Выбрать все</button><button class="st-btn" data-all="0">Снять все</button></div></div>
        <div class="st-list">${k.vals.map(([v, n]) => `<label><input type="checkbox" value="${e$(v)}" ${cur?.ex?.includes(v) ? "" : "checked"}><span title="${e$(v)}">${e$(v || "пусто")}</span><em>${n}</em></label>`).join("")}</div>`;
    } else {
      body = `<div class="st-sec"><input type="text" placeholder="Содержит…" data-txt value="${e$(cur?.q || "")}">
        <div class="st-lbl" style="margin:8px 0 0">Несколько через запятую — любое из; <b>!</b> в начале — исключить.</div></div>`;
    }
    el.innerHTML = `<h4>${e$(lab)}<small>${{ num: "числа", set: "значения", txt: "текст" }[k.t]}</small></h4>${sortRow}${body}
      <div class="st-foot"><button class="st-btn" data-clear>Сбросить</button><button class="st-btn pri" data-done>Готово</button></div>`;
    document.body.append(el);
    place(el, anchor);

    el.querySelectorAll("[data-sd]").forEach((b) => (b.onclick = () => { ctx.sort(i, +b.dataset.sd); closePop(); }));
    el.querySelector("[data-clear]").onclick = () => { set(null); closePop(); };
    el.querySelector("[data-done]").onclick = closePop;

    function refreshHist() {
      const h = el.querySelector(".st-hist");
      if (!h || k.t !== "num") return;
      const mn = Math.min(...k.nums), mx = Math.max(...k.nums), B = 24, w = (mx - mn) / B || 1;
      const cnt = new Array(B).fill(0);
      k.nums.forEach((v) => cnt[Math.min(B - 1, Math.floor((v - mn) / w))]++);
      const top = Math.max(...cnt), f = st.f[lab];
      h.innerHTML = cnt.map((c, j) => { const a = mn + j * w, b = a + w;
        const off = f && ((f.min != null && b < f.min) || (f.max != null && a > f.max));
        return `<i class="${off ? "off" : ""}" style="height:${Math.max(4, 100 * c / top)}%" title="${fmtN(a)} … ${fmtN(b)}: ${c}"></i>`; }).join("");
    }
    if (k.t === "num") {
      refreshHist();
      const rd = () => { const g = (r) => { const v = el.querySelector(`[data-r=${r}]`).value; return v === "" ? null : parseFloat(v); };
        const a = g("min"), b = g("max"); set(a === null && b === null ? null : { t: "num", min: a, max: b }); };
      let t = 0;
      el.querySelectorAll("[data-r]").forEach((x) => x.addEventListener("input", () => { clearTimeout(t); t = setTimeout(rd, 200); }));
      const qs = k.nums.slice().sort((a, b) => a - b), qa = (p) => qs[Math.min(qs.length - 1, Math.floor(p * qs.length))];
      el.querySelectorAll("[data-qk]").forEach((b) => (b.onclick = () => {
        const [a, c] = { pos: [1e-9, null], neg: [null, -1e-9], top: [qa(0.75), null], bot: [null, qa(0.25)] }[b.dataset.qk];
        el.querySelector("[data-r=min]").value = a === null ? "" : a === 1e-9 ? "0.0001" : +a.toFixed(4);
        el.querySelector("[data-r=max]").value = c === null ? "" : c === -1e-9 ? "-0.0001" : +c.toFixed(4);
        rd();
      }));
      setTimeout(() => el.querySelector("[data-r=min]").focus(), 30);
    } else if (k.t === "set") {
      const boxes = [...el.querySelectorAll(".st-list input")];
      const rd = () => { const ex = boxes.filter((b) => !b.checked).map((b) => b.value); set(ex.length ? { t: "set", ex } : null); };
      boxes.forEach((b) => (b.onchange = rd));
      el.querySelectorAll("[data-all]").forEach((b) => (b.onclick = () => {
        const vis = boxes.filter((x) => x.closest("label").style.display !== "none");
        vis.forEach((x) => (x.checked = b.dataset.all === "1")); rd(); }));
      const fnd = el.querySelector("[data-find]");
      if (fnd) { fnd.oninput = () => { const q = fnd.value.toLowerCase(); boxes.forEach((b) => (b.closest("label").style.display = b.value.toLowerCase().includes(q) ? "" : "none")); }; setTimeout(() => fnd.focus(), 30); }
    } else {
      const tx = el.querySelector("[data-txt]");
      let t = 0;
      tx.oninput = () => { clearTimeout(t); t = setTimeout(() => set(tx.value.trim() ? { t: "txt", q: tx.value.trim() } : null), 180); };
      tx.onkeydown = (e) => { if (e.key === "Enter") closePop(); };
      setTimeout(() => tx.focus(), 30);
    }
  }
  function place(el, anchor) {                   // под кнопкой; не влезает — над ней; нигде — где больше места, список ужимается
    const r = anchor.getBoundingClientRect(), w = el.offsetWidth;
    el.style.maxHeight = "";
    const h = el.scrollHeight, below = Math.max(220, innerHeight - r.bottom - 20), above = Math.max(0, r.top - 20);
    const x = Math.min(innerWidth - w - 12, Math.max(12, r.right - w + 8));
    let y;
    if (h <= below) y = r.bottom + 8;
    else if (h <= above) y = r.top - h - 8;
    else if (below >= above) { y = r.bottom + 8; el.style.maxHeight = below + "px"; }
    else { el.style.maxHeight = above + "px"; y = r.top - 8 - above; }
    el.style.left = x + "px"; el.style.top = Math.max(12, y) + "px";
  }
  window.addEventListener("scroll", () => { if (POP && POP.anchor.isConnected) place(POP.el, POP.anchor); else closePop(); }, { passive: true });

  /* ---------- место для панели: перед обёрткой таблицы (и перед «на весь экран», если он есть) ---------- */
  function barFor(wrap) {
    let a = wrap;
    if (a.previousElementSibling?.classList.contains("fs-bar")) a = a.previousElementSibling;
    let b = a.previousElementSibling?.classList.contains("st-bar") ? a.previousElementSibling : null;
    if (!b) { b = document.createElement("div"); b.className = "st-bar"; a.before(b); }
    return b;
  }
  const headLabel = (th) => clean(th.childNodes.length ? [...th.childNodes].filter((n) => !(n.classList && n.classList.contains("st-fbtn"))).map((n) => n.textContent).join("") : th.textContent).replace(/[▲▼↑↓]/g, "").trim();

  /* ---------- 1) таблицы из table(): фильтр по данным ---------- */
  // app.js зовёт ST.data(...) внутри render(): отдаёт отфильтрованные строки и потом ST.decorate(...)
  function forData({ id, cols, rows, text, sort, rerender }) {
    const labels = cols.map((c) => strip(c.label).replace(/[▲▼]/g, "").trim());
    const key = keyOf(labels, /^t[a-z0-9]{6}$/.test(id) ? "" : id);
    const st = state(key);
    const filtered = active(st) ? rows.filter((x) => matchRow(st, labels, text(x))) : rows;
    const ctx = {
      key, labels, total: rows.length, count: () => filtered.length,
      column: (i) => rows.map((x) => text(x)[i] ?? ""),
      visibleRows: () => filtered.map(text),
      change: rerender, sort,
      barHost: null,
    };
    return { rows: filtered, ctx };
  }
  function decorate(el, ctx, minRows = 6) {
    const ths = [...el.querySelectorAll("thead tr:last-child th")];
    if (ctx.total >= 4) heads(ctx, ths);
    ths.forEach((th) => { th.setAttribute("aria-sort", th.classList.contains("sorted") ? (th.textContent.includes("▲") ? "ascending" : "descending") : "none"); });
    if (ctx.total >= minRows || active(state(ctx.key))) { ctx.barHost = () => barFor(el); bar(ctx); }
    if (POP && POP.anchor && !POP.anchor.isConnected) {       // перерисовали — окно цепляем к новой кнопке
      const nb = [...el.querySelectorAll(".st-fbtn")].find((b) => b.getAttribute("aria-label") === "Фильтр: " + POP.lab);
      if (nb) { POP.anchor = nb; } else closePop();
    }
  }

  /* ---------- 2) остальные таблицы .tbl — по строкам на странице ---------- */
  function enhanceDom(tbl) {
    if (tbl._st || tbl.closest("[data-st-off]") || tbl.dataset.stOwn) return;
    const hr = tbl.querySelector("thead tr:last-child");
    if (!hr || tbl.querySelectorAll("thead tr").length > 1) return;
    const ths = [...hr.children];
    if (ths.some((th) => th.colSpan > 1)) return;
    const body = tbl.tBodies[0];
    if (!body) return;
    const all = [...body.rows];
    const data = all.filter((r) => r.cells.length === ths.length);
    if (data.length < 4) return;
    tbl._st = true;
    const grouped = data.length !== all.length;
    const labels = ths.map(headLabel);
    if (labels.some((l, i) => labels.indexOf(l) !== i)) labels.forEach((l, i, a) => { if (a.indexOf(l) !== i) a[i] = l + " " + (i + 1); });
    const n = [...document.querySelectorAll("#app table.tbl")].filter((t) => t._stKeyBase === labels.join("¦")).length;
    tbl._stKeyBase = labels.join("¦");
    const key = keyOf(labels, "dom" + n);
    const txt = (r) => (r._t ||= [...r.cells].map((c) => clean(c.textContent)));
    data.forEach((r, i) => (r._i = i));
    const wrap = tbl.closest(".tbl-wrap") || tbl;
    let sortS = null;
    const ctx = {
      key, labels, total: data.length,
      count: () => data.filter((r) => !r.classList.contains("st-hide")).length,
      column: (i) => data.map((r) => txt(r)[i] ?? ""),
      visibleRows: () => data.filter((r) => !r.classList.contains("st-hide")).map(txt),
      sort: grouped ? null : (i, dir) => { sortS = { i, dir }; doSort(); },
      change: () => apply(),
      barHost: data.length >= 12 ? () => barFor(wrap) : () => (active(state(key)) ? barFor(wrap) : null),
    };
    function doSort() {
      const { i, dir } = sortS;
      const k = kind(ctx.column(i)).t === "num";
      const val = (r) => { const s = txt(r)[i] ?? ""; return k ? num(s) : EMPTY.has(s) ? null : s; };
      const rs = data.slice().sort((a, b) => {
        const va = val(a), vb = val(b);
        if (va === null && vb === null) return a._i - b._i;
        if (va === null) return 1; if (vb === null) return -1;
        return (k ? va - vb : va.localeCompare(vb, "ru", { numeric: true })) * dir || a._i - b._i;
      });
      rs.forEach((r) => body.append(r));
      ths.forEach((th, j) => {
        th.setAttribute("aria-sort", j === i ? (dir > 0 ? "ascending" : "descending") : "none");
        th.querySelector(".st-arrow")?.remove();
        if (j === i) th.querySelector(".st-fbtn")?.insertAdjacentHTML("beforebegin", `<span class="st-arrow">${dir > 0 ? " ▲" : " ▼"}</span>`);
      });
    }
    if (!grouped) ths.forEach((th, i) => {
      th.style.cursor = "pointer";
      th.addEventListener("click", (e) => {
        if (e.target.closest(".st-fbtn")) return;
        const numCol = kind(ctx.column(i)).t === "num";
        const dir = sortS && sortS.i === i ? -sortS.dir : numCol ? -1 : 1;
        ctx.sort(i, dir);
      });
    });
    function apply() {
      const st = state(key);
      const on = active(st);
      data.forEach((r) => r.classList.toggle("st-hide", on && !matchRow(st, labels, txt(r))));
      if (grouped) {                                           // строка-заголовок группы видна, если видна хоть одна строка под ней
        let head = null, any = false;
        const fin = () => { if (head) head.classList.toggle("st-hide", on && !any); };
        all.forEach((r) => { if (r.cells.length !== ths.length) { fin(); head = r; any = false; } else if (!r.classList.contains("st-hide")) any = true; });
        fin();
      }
      let em = body.querySelector("tr.st-empty");
      if (on && !ctx.count()) { if (!em) body.insertAdjacentHTML("beforeend", `<tr class="st-empty"><td colspan="${ths.length}">Под фильтры ничего не подходит</td></tr>`); }
      else em?.remove();
      heads(ctx, ths);
      bar(ctx);
      if (!ctx.barHost() && wrap.previousElementSibling?.classList.contains("st-bar")) wrap.previousElementSibling.remove();
      window.fsCheck?.();
    }
    apply();
  }
  let scanT = 0;
  const scan = () => { clearTimeout(scanT); scanT = setTimeout(() => document.querySelectorAll("table.tbl").forEach(enhanceDom), 40); };
  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
  scan();

  return { data: forData, decorate, strip, num, closePop, isOpen: () => !!POP };
})();
window.ST = ST;

/* ---------------- плавная прокрутка (перенесена с сайта KinOlega) ----------------
   Колесо мыши сдвигает цель, страница догоняет её с инерцией. Прокрутка настоящая (window.scrollTo) —
   липкая шапка и заголовки работают как раньше. На сенсорных экранах и при «уменьшить движение» — обычная. */
const SS = (() => {
  const RM = matchMedia("(prefers-reduced-motion: reduce)");
  const fine = matchMedia("(pointer: fine)");
  const api = { active: false, to, toEl };
  let target = 0, current = 0, raf = 0, last = 0, anim = null;
  const maxY = () => Math.max(0, document.documentElement.scrollHeight - innerHeight);
  const locked = () => document.body.style.overflow === "hidden" || document.body.classList.contains("fs-open") || !!document.querySelector(".modal");
  function stop() { cancelAnimationFrame(raf); raf = 0; last = 0; anim = null; }
  function enable() {
    api.active = fine.matches && !RM.matches;
    document.documentElement.classList.toggle("ss-on", api.active);
    stop(); target = current = scrollY;
  }
  function frame(now) {
    const dt = Math.min(64, now - (last || now));
    last = now;
    if (anim) {
      const k = Math.min(1, Math.max(0, (now - anim.t0) / anim.dur));
      current = anim.from + (anim.to - anim.from) * (k === 1 ? 1 : 1 - Math.pow(2, -10 * k));   // easeOutExpo
      if (k === 1) { anim = null; target = current; }
    } else {
      current += (target - current) * (1 - Math.exp(-dt / 110));   // инерция: чем больше делитель, тем «тяжелее»
      if (Math.abs(target - current) < 0.5) current = target;
    }
    window.scrollTo(0, current);
    if (current === target && !anim) { raf = 0; last = 0; return; }
    raf = requestAnimationFrame(frame);
  }
  const run = () => { if (!raf) raf = requestAnimationFrame(frame); };
  function innerScroller(el, dy) {               // под курсором блок со своей прокруткой, и ему есть куда крутить
    for (; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
      const oy = getComputedStyle(el).overflowY;
      if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight + 1
        && (dy > 0 ? el.scrollTop + el.clientHeight < el.scrollHeight - 1 : el.scrollTop > 0)) return true;
    }
    return false;
  }
  window.addEventListener("wheel", (e) => {
    if (!api.active || e.defaultPrevented || e.ctrlKey || locked()) return;
    let dy = e.deltaY, dx = e.deltaX;
    if (e.deltaMode === 1) { dy *= 40; dx *= 40; } else if (e.deltaMode === 2) { dy *= innerHeight; dx *= innerWidth; }
    if (e.shiftKey || Math.abs(dx) > Math.abs(dy)) return;
    if (e.target.closest?.("[data-ss-prevent]") || innerScroller(e.target, dy)) return;
    e.preventDefault();
    if (!raf) target = current = scrollY;
    if (anim) { anim = null; target = current; }
    target = Math.max(0, Math.min(maxY(), target + dy));
    run();
  }, { passive: false });
  window.addEventListener("scroll", () => {
    if (!raf) target = current = scrollY;
    else if (Math.abs(scrollY - current) > 2) { stop(); target = current = scrollY; }
  }, { passive: true });
  window.addEventListener("resize", () => { target = Math.min(target, maxY()); }, { passive: true });
  function to(y, { duration = 1.2 } = {}) {
    y = Math.max(0, Math.min(maxY(), y));
    if (!api.active) { window.scrollTo({ top: y, behavior: RM.matches ? "instant" : "smooth" }); return; }
    stop(); current = scrollY;
    anim = { from: current, to: y, t0: performance.now(), dur: duration * 1000 };
    target = y; run();
  }
  function toEl(el, opts) {
    const pad = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
    to(el.getBoundingClientRect().top + scrollY - pad, opts);
  }
  fine.addEventListener?.("change", enable);
  RM.addEventListener?.("change", enable);
  enable();
  return api;
})();

/* ---------------- бегунок под активной вкладкой ---------------- */
(() => {
  const nav = document.querySelector(".tabs");
  if (!nav) return;
  const ink = document.createElement("span");
  ink.className = "tab-ink"; nav.prepend(ink);
  let first = true;
  const move = () => {
    const a = nav.querySelector("a.active");
    if (!a) { ink.style.width = "0"; return; }
    if (first) ink.style.transition = "none";
    ink.style.width = a.offsetWidth + "px";
    ink.style.transform = `translateX(${a.offsetLeft}px)`;
    if (first) { ink.offsetWidth; ink.style.transition = ""; first = false; }
  };
  new MutationObserver(move).observe(nav, { subtree: true, attributes: true, attributeFilter: ["class"] });
  addEventListener("resize", move);
  document.fonts?.ready.then(move);
  move();
  // появление страницы — только при переходе, а не при каждом обновлении данных
  const app = document.getElementById("app");
  let path = location.hash.split("?")[0];
  addEventListener("hashchange", () => { const p = location.hash.split("?")[0]; if (p === path) return; path = p; app.classList.remove("ux-enter"); void app.offsetWidth; app.classList.add("ux-enter"); setTimeout(() => app.classList.remove("ux-enter"), 700); });
})();
