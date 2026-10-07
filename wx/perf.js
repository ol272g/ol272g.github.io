"use strict";
/* Погода: график эффективности с фильтрами. Строится по закрытым ставкам (бумажные варианты и реальные, /api/weather/perf).
   Показатели: прибыль, банк, ROI, доля выигравших, просадка, прибыль/ROI/число ставок по дням. Фильтры: варианты, период, сторона, цена входа,
   час решения, регион, город. Подключается функцией perfMount(контейнер, ключ_хранения, настройки_по_умолчанию, заголовок). */
const PF = { data: null, t: 0 };
const PF_VARS = [["A3", "A3 · смесь с рынком", "#ff7a1a"], ["A4", "A4 · без лотерей", "#2ee584"], ["A0", "A0 · модель сама", "#8b95a8"],
  ["T3", "T3 · как симуляция", "#7aa2ff"], ["T0", "T0 · по сделкам, модель", "#c58bff"], ["R", "Реальные", "#f5d142"]];
const PF_METRICS = {
  cum: ["Прибыль накопленная, $", "c", "$"], bank: ["Банк, $", "c", "$"], roi: ["ROI накопленный, %", "c", "%"], win: ["Доля выигравших, %", "c", "%"],
  dd: ["Просадка от пика, $", "c", "$"], dpnl: ["Прибыль по дням, $", "d", "$"], droi: ["ROI по дням, %", "d", "%"], dn: ["Ставок по дням", "d", "n"] };
const PF_DEF = { vars: ["A3", "A4", "A0", "R"], metric: "cum", period: "all", from: "", to: "", by: "day", axis: "settle", side: "", price: "", hour: "", reg: "", city: "", flat: false, ma: 0 };
const PF_PRICES = { "0-10": [0, .10], "10-25": [.10, .25], "25-50": [.25, .50], "50-75": [.50, .75], "75-100": [.75, 1.01] };
const PF_PRESETS = [
  ["С запуска реальных: реальные и A4 по $1", { vars: ["R", "A4"], flat: true, metric: "cum", by: "day", period: "custom", from: "2026-10-21", to: "" }],
  ["Реальные и A4 · всё время, по $1", { vars: ["R", "A4"], flat: true, metric: "cum", by: "day", period: "all", from: "", to: "" }],
  ["Все бумажные", { vars: ["A3", "A4", "A0"], flat: false, metric: "bank", period: "all", from: "", to: "" }],
  ["Дни: прибыль", { metric: "dpnl", by: "day" }],
  ["Просадка", { metric: "dd" }]];

const pfIso = (ts) => new Date(ts * 1000).toISOString().slice(0, 10);
const pfShort = (k) => k.slice(8, 10) + "." + k.slice(5, 7);
function pfLoad(force) {
  if (!force && PF.data && Date.now() - PF.t < 30000) return Promise.resolve(PF.data);
  return api("/api/weather/perf").then((d) => { PF.data = d; PF.t = Date.now(); return d; });
}

async function perfMount(el, key, defs, title) {
  if (!el || el._pf) return;
  const S = Object.assign({}, PF_DEF, defs || {}, store.get(key, {}));
  const id = "pf" + Math.random().toString(36).slice(2, 7);
  el._pf = id;
  el.innerHTML = `<div class="card wx-pf"><div class="card-h"><h3>${esc(title || "Эффективность")}</h3><span class="muted" id="${id}-info"></span></div><div class="card-b">
    <div class="pf-row" id="${id}-presets"></div>
    <div class="pf-row" id="${id}-vars"></div>
    <div class="pf-row">
      <label class="pf-l">Показатель <select id="${id}-metric">${Object.entries(PF_METRICS).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join("")}</select></label>
      <div class="seg" id="${id}-period">${[["1", "1 д"], ["3", "3 д"], ["7", "7 д"], ["14", "14 д"], ["all", "Всё"]].map(([k, t]) => `<button data-p="${k}">${t}</button>`).join("")}</div>
      <label class="pf-l">с <input type="date" id="${id}-from"></label><label class="pf-l">по <input type="date" id="${id}-to"></label>
    </div>
    <div class="pf-row">
      <div class="seg" id="${id}-by" title="Одна точка на день или на каждую ставку"><button data-v="day">По дням</button><button data-v="bet">По ставкам</button></div>
      <div class="seg" id="${id}-axis" title="По какой дате относить ставку: когда она закрылась или на какой день событие"><button data-v="settle">Дата закрытия</button><button data-v="event">Дата события</button></div>
      <label class="pf-l pf-chk" title="Каждая ставка как $1: так можно честно сравнивать реальные ($1) и бумажные ($10) ставки"><input type="checkbox" id="${id}-flat"> по $1 на ставку</label>
      <label class="pf-l">Среднее <select id="${id}-ma" title="Скользящее среднее для показателей по дням"><option value="0">нет</option><option value="3">3 дня</option><option value="7">7 дней</option></select></label>
    </div>
    <div class="pf-row pf-filters">
      <label class="pf-l">Сторона <select id="${id}-side"><option value="">все</option><option value="Y">YES</option><option value="N">NO</option></select></label>
      <label class="pf-l">Цена входа <select id="${id}-price"><option value="">любая</option>${Object.keys(PF_PRICES).map((k) => `<option value="${k}">${k.replace("-", "–")}¢</option>`).join("")}</select></label>
      <label class="pf-l">Час решения <select id="${id}-hour"><option value="">все</option>${[0, 2, 4, 6, 8, 10].map((h) => `<option value="${h}">${String(h).padStart(2, "0")}:00</option>`).join("")}</select></label>
      <label class="pf-l">Регион <select id="${id}-reg"><option value="">все</option></select></label>
      <label class="pf-l">Город <select id="${id}-city"><option value="">все</option></select></label>
      <button class="wx-btn" id="${id}-reset">Сбросить фильтры</button><button class="wx-btn" id="${id}-csv" title="Скачать ставки, которые сейчас на графике">CSV</button>
    </div>
    <div class="chart-box pf-box"><canvas id="${id}-cv"></canvas><div class="pf-empty" id="${id}-empty" hidden>Закрытых ставок по этим фильтрам нет</div></div>
    <div class="tbl-wrap pf-stats" id="${id}-stats"></div>
    <div class="wx-note" id="${id}-note"></div></div></div>`;
  const g = (s) => document.getElementById(id + "-" + s);
  let D = null;

  const save = () => { const o = {}; for (const k of Object.keys(PF_DEF)) o[k] = S[k]; store.set(key, o); };
  const fillSel = (sel, list, cur) => { sel.innerHTML = `<option value="">все</option>` + list.map((x) => `<option value="${esc(x)}">${esc(x)}</option>`).join(""); sel.value = cur; if (sel.value !== cur) sel.value = ""; };
  function syncControls() {
    g("metric").value = S.metric; g("from").value = S.from; g("to").value = S.to; g("flat").checked = S.flat; g("ma").value = String(S.ma);
    g("side").value = S.side; g("price").value = S.price; g("hour").value = String(S.hour);
    if (D) { fillSel(g("reg"), [...D.regs].sort(), S.reg); fillSel(g("city"), [...D.cities].sort(), S.city); }
    const daily = PF_METRICS[S.metric][1] === "d";
    $$("#" + id + "-period button").forEach((b) => b.classList.toggle("active", b.dataset.p === S.period));
    $$("#" + id + "-by button").forEach((b) => { b.classList.toggle("active", b.dataset.v === (daily ? "day" : S.by)); b.disabled = daily && b.dataset.v === "bet"; });
    $$("#" + id + "-axis button").forEach((b) => b.classList.toggle("active", b.dataset.v === S.axis));
    g("ma").disabled = !daily;
    const cnt = {}; if (D) for (const r of D.rows) cnt[r[0]] = (cnt[r[0]] || 0) + 1;
    g("vars").innerHTML = PF_VARS.filter(([k]) => cnt[k] || S.vars.includes(k)).map(([k, name, col]) => `<button class="pf-chip ${S.vars.includes(k) ? "on" : ""}" data-k="${k}" style="--c:${col}"><i></i>${esc(name)}<small>${nf(cnt[k] || 0)}</small></button>`).join("");
    g("presets").innerHTML = `<span class="pf-cap">Быстро:</span>` + PF_PRESETS.map(([t], i) => `<button class="pf-pre" data-i="${i}">${esc(t)}</button>`).join("");
    $$("#" + id + "-vars .pf-chip").forEach((b) => (b.onclick = () => { const k = b.dataset.k; S.vars = S.vars.includes(k) ? S.vars.filter((x) => x !== k) : [...S.vars, k]; save(); syncControls(); draw(); }));
    $$("#" + id + "-presets .pf-pre").forEach((b) => (b.onclick = () => { Object.assign(S, PF_PRESETS[+b.dataset.i][1]); save(); syncControls(); draw(); }));
  }

  /* ----- отбор и подготовка ----- */
  function pick() {
    const today = pfIso(Date.now() / 1000);
    let from = S.from, to = S.to;
    if (S.period !== "all" && S.period !== "custom") { const d = new Date(Date.now() - (+S.period - 1) * 86400000); from = d.toISOString().slice(0, 10); to = ""; }
    const sel = new Set(S.vars), pr = S.price ? PF_PRICES[S.price] : null;
    const out = [];
    for (const r of D.rows) {
      if (!sel.has(r[0])) continue;
      if (S.side && r[5] !== S.side) continue;
      if (pr && !(r[6] >= pr[0] && r[6] < pr[1])) continue;
      if (S.hour !== "" && r[7] !== +S.hour) continue;
      if (S.reg && D.regs[r[9]] !== S.reg) continue;
      if (S.city && D.cities[r[8]] !== S.city) continue;
      const dk = S.axis === "settle" ? pfIso(r[1]) : r[2];
      if (from && dk < from) continue;
      if (to && dk > to) continue;
      const c = S.flat ? 1 : r[3], p = S.flat ? r[4] / r[3] : r[4];
      out.push({ v: r[0], t: r[1], dk, c, p, w: r[4] > 0 ? 1 : 0, px: r[6], side: r[5], h: r[7], city: D.cities[r[8]], reg: D.regs[r[9]], ev: r[2], raw: r });
    }
    out.sort((a, b) => a.t - b.t);
    return out;
  }
  const mval = (m, a, base) => {          // a: накопленное {n,c,p,w,peak}; для дневных — {n,c,p}
    switch (m) {
      case "cum": return a.p; case "bank": return base + a.p; case "roi": return a.c ? (100 * a.p) / a.c : null;
      case "win": return a.n ? (100 * a.w) / a.n : null; case "dd": return a.p - a.peak;
      case "dpnl": return a.n ? a.p : 0; case "droi": return a.c ? (100 * a.p) / a.c : null; case "dn": return a.n;
    }
  };
  const fmtV = (m, v) => (v == null ? "—" : PF_METRICS[m][2] === "$" ? (m === "bank" ? usd(v, 2) : money(v, 2)) : PF_METRICS[m][2] === "%" ? (m === "win" ? nf(v, 1) + "%" : (v < 0 ? "−" : "+") + nf(Math.abs(v), 1) + "%") : nf(v));

  let chartObj = null, lastDays = [];
  const crosshair = { id: "pfCross", afterDatasetsDraw(ch) { const a = ch.tooltip && ch.tooltip._active; if (!a || !a.length) return; const x = a[0].element.x, c = ch.ctx, ca = ch.chartArea;
    c.save(); c.beginPath(); c.moveTo(x, ca.top); c.lineTo(x, ca.bottom); c.lineWidth = 1; c.strokeStyle = "rgba(148,163,184,.45)"; c.setLineDash([3, 3]); c.stroke(); c.restore(); } };

  function draw() {
    if (!D) return;
    const m = S.metric, daily = PF_METRICS[m][1] === "d", by = daily ? "day" : S.by;
    const list = pick();
    g("info").textContent = `${nf(list.length)} ставок на графике`;
    const css = getComputedStyle(document.documentElement), muted = css.getPropertyValue("--muted").trim() || "#8b95a8", faint = "rgba(148,163,184,.14)";
    const vars = PF_VARS.filter(([k]) => S.vars.includes(k)).map(([k, name, col]) => ({ k, name, col: k === "A3" ? (css.getPropertyValue("--accent").trim() || col) : col, rows: list.filter((x) => x.v === k) })).filter((x) => x.rows.length);
    g("empty").hidden = vars.length > 0;
    if (!vars.length) { if (chartObj) { chartObj.destroy(); chartObj = null; } g("stats").innerHTML = ""; g("note").textContent = ""; return; }
    const base = D.start;
    let datasets = [], labels = null, scaleX;
    if (by === "day") {
      const keys = list.map((x) => x.dk).sort(); const first = keys[0], last = keys[keys.length - 1], days = [];
      for (let d = new Date(first + "T00:00:00Z"); d.toISOString().slice(0, 10) <= last; d = new Date(d.getTime() + 86400000)) days.push(d.toISOString().slice(0, 10));
      labels = days.map(pfShort); lastDays = days;
      for (const v of vars) {
        const per = {}; for (const r of v.rows) { const o = per[r.dk] || (per[r.dk] = { n: 0, c: 0, p: 0, w: 0 }); o.n++; o.c += r.c; o.p += r.p; o.w += r.w; }
        const cum = { n: 0, c: 0, p: 0, w: 0, peak: 0 }, vals = [];
        for (const d of days) {
          const o = per[d];
          if (daily) { vals.push(mval(m, o || { n: 0, c: 0, p: 0 }, base)); }
          else { if (o) { cum.n += o.n; cum.c += o.c; cum.p += o.p; cum.w += o.w; if (cum.p > cum.peak) cum.peak = cum.p; } vals.push(mval(m, cum, base)); }
        }
        v.vals = vals;
        const multi = vars.length > 1;
        const ds = daily
          ? { type: "bar", label: v.name, data: vals, backgroundColor: (c) => (!multi && m !== "dn" ? ((c.raw ?? 0) < 0 ? "#f43f5e" : "#22c55e") : v.col + "cc"), borderRadius: 3, maxBarThickness: 36 }
          : { type: "line", label: v.name, data: vals, borderColor: v.col, backgroundColor: v.col + "20", fill: !multi ? "origin" : false, pointRadius: days.length <= 14 ? 3 : 0, pointHoverRadius: 5, borderWidth: 2.2, tension: 0.18, spanGaps: true };
        datasets.push(ds);
        if (daily && +S.ma > 0) {
          const w = +S.ma, ma = vals.map((_, i) => { const s = vals.slice(Math.max(0, i - w + 1), i + 1).filter((x) => x != null); return s.length ? s.reduce((a, b) => a + b, 0) / s.length : null; });
          datasets.push({ type: "line", label: v.name + " · среднее " + w + " дн.", data: ma, borderColor: v.col, borderDash: [6, 4], pointRadius: 0, borderWidth: 2, tension: 0.25, fill: false, spanGaps: true });
        }
      }
      scaleX = { type: "category", ticks: { maxTicksLimit: 12, color: muted, autoSkip: true }, grid: { display: false } };
    } else {
      for (const v of vars) {
        const cum = { n: 0, c: 0, p: 0, w: 0, peak: 0 }, pts = [];
        for (const r of v.rows) { cum.n++; cum.c += r.c; cum.p += r.p; cum.w += r.w; if (cum.p > cum.peak) cum.peak = cum.p; pts.push({ x: r.t * 1000, y: mval(m, cum, base) }); }
        datasets.push({ type: "line", label: v.name, data: pts, borderColor: v.col, backgroundColor: v.col + "20", fill: vars.length === 1 ? "origin" : false, pointRadius: 0, pointHoverRadius: 4, borderWidth: 2, stepped: "before", spanGaps: true });
      }
      scaleX = { type: "linear", ticks: { maxTicksLimit: 10, color: muted, callback: (v) => new Date(v).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }) }, grid: { display: false } };
    }
    const unit = PF_METRICS[m][2];
    const opts = { responsive: true, maintainAspectRatio: false, animation: { duration: 250 }, interaction: by === "day" ? { mode: "index", intersect: false } : { mode: "nearest", axis: "x", intersect: false },
      plugins: { legend: { display: false },
        tooltip: { callbacks: { title: (it) => (by === "day" ? new Date(lastDays[it[0].dataIndex] + "T12:00:00").toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "long" }) : new Date(it[0].parsed.x).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })),
          label: (c) => " " + c.dataset.label + ": " + fmtV(m, c.parsed.y) } } },
      scales: { x: scaleX, y: { ticks: { color: muted, callback: (v) => (unit === "$" ? (v < 0 ? "−$" : "$") + nf(Math.abs(v)) : unit === "%" ? nf(v) + "%" : nf(v)) },
        grid: { color: (c) => (c.tick && c.tick.value === 0 ? "rgba(148,163,184,.55)" : faint), lineWidth: (c) => (c.tick && c.tick.value === 0 ? 1.5 : 1) } } } };
    if (chartObj) chartObj.destroy();
    chartObj = new Chart(g("cv"), { type: daily ? "bar" : "line", data: { labels: labels || undefined, datasets }, options: opts, plugins: [crosshair] });
    CHARTS[id] = chartObj;

    /* ----- таблица итогов ----- */
    const rowsT = vars.map((v) => {
      let n = 0, c = 0, p = 0, w = 0, cp = 0, peak = 0, dd = 0, pxs = 0; const day = {};
      for (const r of v.rows) { n++; c += r.c; p += r.p; w += r.w; pxs += r.px; cp += r.p; if (cp > peak) peak = cp; if (cp - peak < dd) dd = cp - peak; day[r.dk] = (day[r.dk] || 0) + r.p; }
      const dv = Object.values(day);
      return `<tr><td class="l"><span class="pf-dot" style="background:${v.col}"></span>${esc(v.name)}</td><td>${nf(n)}</td><td>${usd(c, 0)}</td><td class="${cls(p)}">${money(p)}</td><td class="${cls(p)}">${c ? pc(p / c) : "—"}</td><td>${n ? pc0(w / n) : "—"}</td><td>${n ? cents(pxs / n, 0) : "—"}</td><td class="bad">${money(dd)}</td><td class="good">${dv.length ? money(Math.max(...dv)) : "—"}</td><td class="bad">${dv.length ? money(Math.min(...dv)) : "—"}</td><td>${dv.filter((x) => x > 0).length} / ${dv.length}</td></tr>`;
    }).join("");
    g("stats").innerHTML = `<table class="tbl"><thead><tr><th class="l">Вариант</th><th>Ставок</th><th>Вложено</th><th>Итог</th><th>ROI</th><th>Выигр.</th><th title="средняя цена входа">Вход</th><th title="максимальное падение от пика накопленной прибыли">Просадка</th><th>Лучший день</th><th>Худший день</th><th title="дней в плюсе / всего дней со ставками">Дней +</th></tr></thead><tbody>${rowsT}</tbody></table>`;
    g("note").innerHTML = `Показатели считаются по закрытым ставкам после комиссии. Ставки относятся к дню по ${S.axis === "settle" ? "дате закрытия (UTC)" : "дате события"}. ${S.flat ? "Режим «по $1 на ставку»: каждая ставка считается как $1 — реальные и бумажные ставки сопоставимы. " : "Реальные ставки — по $1, бумажные — по их сумме (обычно $10): для сравнения включите «по $1 на ставку». "}${S.metric === "bank" ? "Банк — это старт бумажного банка плюс накопленный результат выбранных ставок. " : ""}Клик по названию варианта сверху включает или выключает линию.`;
  }

  /* ----- события ----- */
  g("metric").onchange = (e) => { S.metric = e.target.value; save(); syncControls(); draw(); };
  $$("#" + id + "-period button").forEach((b) => (b.onclick = () => { S.period = b.dataset.p; if (S.period !== "all") { S.from = ""; S.to = ""; } save(); syncControls(); draw(); }));
  g("from").onchange = (e) => { S.from = e.target.value; S.period = S.from || S.to ? "custom" : "all"; save(); syncControls(); draw(); };
  g("to").onchange = (e) => { S.to = e.target.value; S.period = S.from || S.to ? "custom" : "all"; save(); syncControls(); draw(); };
  $$("#" + id + "-by button").forEach((b) => (b.onclick = () => { S.by = b.dataset.v; save(); syncControls(); draw(); }));
  $$("#" + id + "-axis button").forEach((b) => (b.onclick = () => { S.axis = b.dataset.v; save(); syncControls(); draw(); }));
  g("flat").onchange = (e) => { S.flat = e.target.checked; save(); draw(); };
  g("ma").onchange = (e) => { S.ma = +e.target.value; save(); draw(); };
  for (const k of ["side", "price", "hour", "reg", "city"]) g(k).onchange = (e) => { S[k] = e.target.value; save(); draw(); };
  g("reset").onclick = () => { Object.assign(S, { period: "all", from: "", to: "", side: "", price: "", hour: "", reg: "", city: "" }); save(); syncControls(); draw(); };
  g("csv").onclick = () => {
    const L = pick(), head = "вариант;закрыта (UTC);событие;сторона;цена входа;час;город;регион;вложено;итог";
    const body = L.map((r) => [r.v, new Date(r.t * 1000).toISOString().replace("T", " ").slice(0, 19), r.ev, r.side, String(r.px).replace(".", ","), r.h, r.city, r.reg, String(r.c).replace(".", ","), String(r.p).replace(".", ",")].join(";")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + head + "\n" + body], { type: "text/csv;charset=utf-8" })); a.download = "weather_" + new Date().toISOString().slice(0, 10) + ".csv"; a.click();
  };
  syncControls();
  try { D = await pfLoad(); } catch (e) { g("note").textContent = "Не удалось загрузить данные: " + e.message; return; }
  syncControls(); draw();
  every(async () => { try { D = await pfLoad(true); syncControls(); draw(); } catch (e) { /* оставляем прежний график */ } }, 60000);
}
