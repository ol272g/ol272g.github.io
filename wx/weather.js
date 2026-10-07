"use strict";
/* Погода: вкладки «Робот», «Ставки», «Симуляция», «Стратегия», «Журнал». Бумажные ставки; реальных денег нет. */
const $ = (s, e = document) => e.querySelector(s);
const $$ = (s, e = document) => [...e.querySelectorAll(s)];
const isNum = (v) => typeof v === "number" && isFinite(v);
const nf = (v, d = 0) => (isNum(v) ? v.toLocaleString("ru-RU", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—");
const usd = (v, d = 2) => (isNum(v) ? (v < 0 ? "−$" : "$") + nf(Math.abs(v), d) : "—");
const money = (v, d = 2) => (isNum(v) ? (v < 0 ? "−" : "+") + "$" + nf(Math.abs(v), d) : "—");
const pc = (v, d = 1) => (isNum(v) ? (v < 0 ? "−" : "+") + nf(Math.abs(v) * 100, d) + "%" : "—");
const pc0 = (v, d = 0) => (isNum(v) ? nf(v * 100, d) + "%" : "—");
const cents = (v, d = 1) => (isNum(v) ? nf(v * 100, d) + "¢" : "—");
const cls = (v) => (!isNum(v) ? "" : v > 0 ? "good" : v < 0 ? "bad" : "");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const tfmt = (ts) => (ts ? new Date(ts * 1000).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const dfmt = (ts) => (ts ? new Date(ts * 1000).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—");
const ago = (s) => (!isNum(s) ? "—" : s < 90 ? Math.round(s) + " с назад" : s < 5400 ? Math.round(s / 60) + " мин назад" : s < 172800 ? nf(s / 3600, 1) + " ч назад" : Math.round(s / 86400) + " дн назад");
const store = { get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* без сохранения */ } } };
async function api(path, opt) { const r = await fetch(path, { cache: "no-store", ...opt }); if (!r.ok) throw new Error(path + " " + r.status); return r.json(); }
const post = (p, b) => api(p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
const APP = $("#app");
let VAR = store.get("wx_var", "A3");                       // выбранный вариант на вкладке «Робот»: A3 — смесь с рынком, A0 — модель сама
const VNAME = { A0: "A0 · модель сама", A3: "A3 · смесь с рынком", A4: "A4 · смесь, без лотерей", T0: "T0 · как симуляция, модель сама", T3: "T3 · как симуляция, смесь" };
const VORDER = ["A3", "A4", "A0", "T3", "T0"];
let TIMERS = [], CHARTS = {};
const every = (fn, ms) => { TIMERS.push(setInterval(() => { if (!document.hidden) fn(); }, ms)); };

/* ---------- тема ---------- */
(function () { let t = store.get("theme", "dark"); try { t = localStorage.getItem("theme") || "dark"; } catch (e) { /* по умолчанию */ }
  const apply = (x) => { document.documentElement.dataset.theme = x; try { localStorage.setItem("theme", x); } catch (e) { /* без сохранения */ } };
  apply(t); $("#theme").onclick = () => apply(document.documentElement.dataset.theme === "light" ? "dark" : "light"); })();

/* ---------- общие кусочки ---------- */
const METHODS = { usd: "Фиксированная сумма, $ (как в проверке)", pct: "Процент банка", diff: "По перевесу (как у NBA и NHL)", user: "Перевес × 1.5·цена^0.585", kelly: "Келли" };
const HOURS = [0, 2, 4, 6, 8, 10];
function chart(id, labels, data, opts = {}) {
  const el = document.getElementById(id);
  if (!el || typeof Chart === "undefined") return;
  if (CHARTS[id]) CHARTS[id].destroy();
  const col = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#ff7a1a";
  CHARTS[id] = new Chart(el, { type: "line", data: { labels, datasets: [{ data, borderColor: col, backgroundColor: col + "22", fill: true, pointRadius: 0, borderWidth: 2, tension: 0.15 }] },
    options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => usd(c.parsed.y, 2) } } },
      scales: { x: { ticks: { maxTicksLimit: 8, color: "#8b95a8" }, grid: { display: false } }, y: { ticks: { color: "#8b95a8", callback: (v) => "$" + nf(v) }, grid: { color: "rgba(148,163,184,.12)" } } }, ...opts } });
}
function chart2(id, times, start, series) {
  const el = document.getElementById(id);
  if (!el || typeof Chart === "undefined") return;
  if (CHARTS[id]) CHARTS[id].destroy();
  const T = [...new Set(times)].sort((a, b) => a - b), labels = ["старт", ...T.map(dfmt)];
  const line = (pts, col) => { let k = 0, bank = start; const data = [start]; for (const t of T) { while (k < pts.length && pts[k][0] <= t) { bank = pts[k][1]; k++; } data.push(bank); } return { data, borderColor: col, fill: false, pointRadius: 0, borderWidth: 2, tension: 0.1 }; };
  const acc = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#ff7a1a";
  CHARTS[id] = new Chart(el, { type: "line", data: { labels, datasets: [{ label: "A3 · смесь с рынком", ...line(series.A3, acc) }, { label: "A4 · без лотерей", ...line(series.A4 || [], "#2ee584") }, { label: "A0 · модель сама", ...line(series.A0, "#8b95a8") }, ...(series.T3 && series.T3.length ? [{ label: "T3 · как симуляция", ...line(series.T3, "#7aa2ff") }] : []), ...(series.T0 && series.T0.length ? [{ label: "T0 · как симуляция, модель", ...line(series.T0, "#c58bff") }] : [])] },
    options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: true, labels: { color: "#8b95a8" } }, tooltip: { callbacks: { label: (c) => c.dataset.label + ": " + usd(c.parsed.y, 2) } } },
      scales: { x: { ticks: { maxTicksLimit: 8, color: "#8b95a8" }, grid: { display: false } }, y: { ticks: { color: "#8b95a8", callback: (v) => "$" + nf(v) }, grid: { color: "rgba(148,163,184,.12)" } } } } });
}
function kpi(l, v, s, c) { return `<div class="card wx-kpi"><div class="l">${l}</div><div class="v ${c || ""}">${v}</div><div class="s">${s || ""}</div></div>`; }
function modal(html) {
  const m = document.createElement("div"); m.className = "wx-modal"; m.innerHTML = `<div>${html}<div class="wx-btns"><button class="wx-btn" data-x>Закрыть</button></div></div>`;
  m.onclick = (e) => { if (e.target === m || e.target.dataset.x !== undefined) m.remove(); }; document.body.appendChild(m);
}

/* ---------- форма настроек (одна на «Робот» и «Симуляция») ---------- */
function formHTML(p, s, kind) {
  const b = s.bank, r = s.rules, m = b.method;
  const num = (id, label, v, step, extra = "") => `<label data-f="${id}">${label}<input class="input" type="number" id="${p}-${id}" value="${v}" step="${step}" ${extra}></label>`;
  return `<div class="wx-fieldset"><b>Банк и размер ставки</b><div class="wx-form">
      ${num("start", "Банк на старте, $", b.start, 100, 'min="10"')}
      <label>Метод ставки<select class="select" id="${p}-method">${Object.entries(METHODS).map(([k, v]) => `<option value="${k}" ${k === m ? "selected" : ""}>${v}</option>`).join("")}</select></label>
      ${num("usd", "Сумма на ставку, $", b.usd, 1, 'min="0"')}
      ${num("flat", "Обычная ставка, % расчётного банка", b.flat, 0.1, 'min="0.1"')}
      ${num("min", "Ставка min, % банка", b.min, 0.1, 'min="0"')}
      ${num("max", "Ставка max, % банка", b.max, 0.1, 'min="0.1"')}
      ${num("lo", "Перевес для min, п.п.", b.lo, 0.5)}
      ${num("hi", "Перевес для max, п.п.", b.hi, 0.5)}
      ${num("kf", "Келли: доля (0.25 = четверть Келли)", b.kf, 0.05, 'min="0.01" max="1"')}
      ${num("trust", "Келли: доверие к модели", b.trust, 0.05, 'min="0.01" max="1"')}
      ${num("step", "Пересчёт расчётного банка при изменении на, %", b.step, 1, 'min="1"')}
      ${num("max_usd", "Потолок ставки, $ (0 — без потолка)", b.max_usd, 5, 'min="0"')}
      ${num("stop_pct", "Автостоп: банк ниже, % от старта (0 — нет)", b.stop_pct, 5, 'min="0" max="95"')}
    </div><div class="wx-note" id="${p}-mnote"></div></div>
    <div class="wx-fieldset"><b>Правила входа</b><div class="wx-form">
      ${num("edge_min", "Минимальный перевес, п.п.", +(r.edge_min * 100).toFixed(2), 0.5, 'min="0"')}
      ${num("edge_max", "Потолок перевеса, п.п. (0 — нет)", +(r.edge_max * 100).toFixed(2), 5, 'min="0" max="100"')}
      ${num("price_min", "Цена токена от, ¢", +(r.price_min * 100).toFixed(1), 1, 'min="0" max="100"')}
      ${num("price_max", "Цена токена до, ¢", +(r.price_max * 100).toFixed(1), 1, 'min="0" max="100"')}
      ${num("latency_min", "Задержка после решения, мин", r.latency_min, 1, 'min="0" max="60"')}
      ${num("window_min", "Окно поиска цены, мин", r.window_min, 1, 'min="1" max="60"')}
      ${num("min_order_usd", "Минимальная покупка, $", r.min_order_usd, 0.5, 'min="0"')}
      ${num("max_event_usd", "Потолок на один рынок, $ (0 — нет)", r.max_event_usd, 10, 'min="0"')}
      ${num("max_open_usd", "Потолок открытых ставок, $ (0 — нет)", r.max_open_usd, 50, 'min="0"')}
      ${kind === "robot" ? `<label class="full">Варианты, которые ведёт робот (у каждого свой банк, обе стратегии торгуют параллельно на одних и тех же данных)<span class="chk" id="${p}-variants"><label><input type="checkbox" value="A0" ${(s.variants || []).includes("A0") ? "checked" : ""}> A0 · модель сама</label><label><input type="checkbox" value="A3" ${(s.variants || []).includes("A3") ? "checked" : ""}> A3 · смесь модели с ценой рынка</label><label><input type="checkbox" value="A4" ${(s.variants || []).includes("A4") ? "checked" : ""}> A4 · смесь, без лотерей (цена от 10¢)</label><label><input type="checkbox" value="T3" ${(s.variants || []).includes("T3") ? "checked" : ""}> T3 · как симуляция (по сделкам), смесь</label><label><input type="checkbox" value="T0" ${(s.variants || []).includes("T0") ? "checked" : ""}> T0 · как симуляция (по сделкам), модель сама</label></span></label>`
        : `<label class="full">Вероятность<span class="chk"><label><input type="checkbox" id="${p}-blend" ${r.blend ? "checked" : ""}> смешивать модель с ценой рынка (A3: так в истории устойчивее, ставок меньше)</label></span></label>`}
      <label class="full">Сторона<span class="chk" id="${p}-sides"><label><input type="checkbox" value="Y" ${r.sides.includes("Y") ? "checked" : ""}> YES (рынок недооценил корзину)</label><label><input type="checkbox" value="N" ${r.sides.includes("N") ? "checked" : ""}> NO (рынок переоценил корзину)</label></span></label>
      <label class="full">Часы решения (местное время станции)<span class="chk" id="${p}-hours">${HOURS.map((h) => `<label><input type="checkbox" value="${h}" ${r.hours.includes(h) ? "checked" : ""}> ${String(h).padStart(2, "0")}:00</label>`).join("")}</span></label>
    </div></div>`;
}
function readForm(p) {
  const v = (id) => parseFloat($(`#${p}-${id}`).value);
  const checks = (id) => $$(`#${p}-${id} input:checked`).map((x) => x.value);
  return { bank: { start: v("start"), method: $(`#${p}-method`).value, usd: v("usd"), flat: v("flat"), min: v("min"), max: v("max"), lo: v("lo"), hi: v("hi"), kf: v("kf"), trust: v("trust"), step: v("step"), max_usd: v("max_usd"), stop_pct: v("stop_pct") },
    variants: $$(`#${p}-variants input:checked`).map((x) => x.value), rules: { blend: !!($(`#${p}-blend`) && $(`#${p}-blend`).checked), edge_min: v("edge_min") / 100, edge_max: v("edge_max") / 100, price_min: v("price_min") / 100, price_max: v("price_max") / 100, latency_min: v("latency_min"), window_min: v("window_min"), min_order_usd: v("min_order_usd"),
      max_event_usd: v("max_event_usd"), max_open_usd: v("max_open_usd"), sides: checks("sides"), hours: checks("hours").map(Number) } };
}
function syncForm(p) {
  const m = $(`#${p}-method`).value;
  const use = { usd: ["usd", "max_usd"], pct: ["flat", "step", "max_usd"], diff: ["min", "max", "lo", "hi", "step", "max_usd"], user: ["min", "max", "lo", "hi", "step", "max_usd"], kelly: ["min", "max", "kf", "trust", "step", "max_usd"] }[m];
  $$(`#${p}-root label[data-f]`).forEach((l) => { const on = ["start", "stop_pct"].includes(l.dataset.f) || use.includes(l.dataset.f); l.classList.toggle("off", !on); l.querySelector("input").disabled = !on; });
  const note = { usd: "Каждая ставка — фиксированная сумма (так проверялась стратегия). Банк на размер ставки не влияет.",
    pct: "Ставка = обычная ставка (%) × расчётный банк. Расчётный банк пересчитывается, когда банк вырос или упал на заданный процент.",
    diff: "Перевес ≤ «для min» → ставка min %, ≥ «для max» → max %, между — пропорционально (как у NBA и NHL).",
    user: "То же, что «по перевесу», но ставка умножается на 1.5·цена^0.585: на дешёвых исходах ставка меньше, на дорогих больше.",
    kelly: "Доля банка = доля Келли × доверие × перевес / (1 − цена), в пределах min–max %. На дешёвых исходах (лотерея) ставка меньше при том же перевесе." }[m];
  $(`#${p}-mnote`).textContent = note + " Любая ставка не больше потолка в $. Покупается столько, сколько реально есть в стакане по подходящей цене.";
}
function wireForm(p, onchange) {
  const root = $(`#${p}-root`);
  const sync = () => syncForm(p);
  root.addEventListener("input", (e) => { if (e.target.id === `${p}-method`) sync(); if (onchange) onchange(); });
  root.addEventListener("change", () => { if (onchange) onchange(); });
  sync();
}
function fillForm(p, s) {
  const set = (id, v) => { const e = $(`#${p}-${id}`); if (e) e.value = v; };
  Object.entries(s.bank).forEach(([k, v]) => set(k, v));
  Object.entries(s.rules).forEach(([k, v]) => { if (["edge_min", "edge_max", "price_min", "price_max"].includes(k)) set(k, +(v * 100).toFixed(2)); else if (!Array.isArray(v)) set(k, v); });
  $$(`#${p}-sides input`).forEach((x) => (x.checked = s.rules.sides.includes(x.value)));
  { const bl = $(`#${p}-blend`); if (bl) bl.checked = !!s.rules.blend; }
  $$(`#${p}-variants input`).forEach((x) => (x.checked = (s.variants || []).includes(x.value)));
  $$(`#${p}-hours input`).forEach((x) => (x.checked = s.rules.hours.includes(+x.value)));
  syncForm(p);
}

/* ---------- заголовок: состояние робота ---------- */
let WST = null;
async function refreshBadge() {
  try {
    WST = await api("/api/weather/status");
    const b = $("#bot-badge"), on = WST.alive && WST.settings.enabled;
    b.className = "wx-pill " + (on ? "on" : WST.alive ? "paused" : "off");
    $("span", b).textContent = on ? "Робот: ставит (бумага)" : WST.alive ? "Робот: ставки выкл." : "Робот остановлен";
    b.title = WST.alive ? `пульс ${ago(WST.age)}` : "нет пульса — робот не запущен или завис";
  } catch (e) { /* без изменений */ }
}

/* ======================================================================= РОБОТ */
async function pageRobot() {
  const S0 = (await api("/api/weather/status")).settings;
  APP.innerHTML = `
    <div class="page-head"><div><h1>Робот погоды</h1><div class="sub">Бумажные ставки на рынки «Самая низкая температура за день» на Polymarket. Реальных денег нет. Ставки по правилам вкладки «Стратегия».</div></div></div>
    <div id="r-cmp"></div>
    <div class="toolbar"><span class="muted">Показать подробно:</span><div class="seg" id="r-var"><button data-v="A3">A3 · смесь</button><button data-v="A4">A4 · без лотерей</button><button data-v="A0">A0 · модель сама</button><button data-v="T3">T3 · как симуляция</button><button data-v="T0">T0 · как симуляция, модель</button></div></div>
    <div id="r-top"></div>
    <div id="r-chart"></div>
    <div class="wx-grid2" style="margin-top:16px"><div id="r-win"></div><div id="r-up"></div></div>
    <div class="section-title">Открытые ставки (вариант выше)</div><div id="r-pos"></div>
    <div class="section-title">Закрытые ставки (вариант выше)</div><div id="r-closed"></div>
    <div class="section-title">Если продать всё прямо сейчас</div><div id="r-liq"></div>
    <div class="section-title">Что делала цена после покупки</div><div id="r-drift"></div>
    <div class="section-title">Готовность к реальным деньгам</div><div id="r-gate"></div>
    <div class="section-title">Калибровка модели на живых ставках</div><div id="r-cal"></div>
    <div class="section-title">Настройки робота</div>
    <div class="card"><div class="card-b" id="rb-root">${formHTML("rb", S0, "robot")}
      <div class="wx-btns"><button class="wx-btn pri" id="rb-save">Сохранить настройки</button><button class="wx-btn" id="rb-reset">Вернуть проверенные</button><span class="wx-note" id="rb-msg"></span></div>
      <div class="wx-note">Настройки действуют сразу, на новые покупки (уже купленное не меняется). «Проверенные» — те, на которых стратегия проверялась: перевес ≥ 5 п.п., окно 60 мин, $10 на ставку.</div></div></div>`;
  wireForm("rb");
  $("#rb-save").onclick = async () => {
    const msg = $("#rb-msg"); msg.textContent = "…";
    try { const r = await post("/api/weather/settings", readForm("rb")); fillForm("rb", r.settings); msg.textContent = "Сохранено " + new Date().toLocaleTimeString("ru-RU"); loadTop(); } catch (e) { msg.textContent = "Не сохранилось: " + e.message; }
  };
  $("#rb-reset").onclick = async () => { const m = await api("/api/weather/meta"); fillForm("rb", m.defaults); $("#rb-msg").textContent = "Проверенные значения подставлены — нажмите «Сохранить»."; };

  async function loadTop() {
    const [st, eq] = await Promise.all([api("/api/weather/status"), api("/api/weather/equity")]);
    WST = st; const s = st.settings, b = st.bot || {}, V = (st.variants || {})[VAR] || {}, cl = V.closed || { n: 0, p: 0, c: 0, w: 0 }, op = V.open || { n: 0, c: 0 };
    const bv = ((b.variants || {})[VAR]) || { bank: s.bank.start };
    const roi = cl.c ? cl.p / cl.c : null;
    const cm = (v) => { const x = (st.variants || {})[v] || {}, c = x.closed || { n: 0, p: 0, c: 0, w: 0 }, o = x.open || { n: 0, c: 0 }, bb = ((b.variants || {})[v]) || {}; return `<tr><td class="l"><b>${VNAME[v]}</b> ${(s.variants || []).includes(v) ? "" : '<span class="muted">(выключен)</span>'}</td><td>${nf(c.n + o.n)}</td><td>${nf(c.n)}</td><td class="${cls(c.p)}">${money(c.p)}</td><td class="${cls(c.p)}">${c.c ? pc(c.p / c.c) : "—"}</td><td>${c.n ? pc0(c.w / c.n) : "—"}</td><td>${usd(o.c, 0)}</td><td>${usd(bb.bank ?? s.bank.start, 2)}</td></tr>`; };
    $("#r-cmp").innerHTML = `<div class="card" style="margin-bottom:12px"><div class="card-h"><h3>Две стратегии параллельно на бумаге</h3></div><div class="card-b tbl-wrap"><table class="tbl"><thead><tr><th class="l">Вариант</th><th>Ставок всего</th><th>Закрыто</th><th>Итог закрытых</th><th>ROI</th><th>Выиграло</th><th>Открыто на</th><th>Банк</th></tr></thead><tbody>${VORDER.map(cm).join("")}</tbody></table>
      <div class="wx-note">A0 ставит по вероятности модели как есть, A3 — по вероятности, смешанной с ценой рынка (так в истории устойчивее и меньше лотерейных ставок), A4 — то же, что A3, но только на ставки с ценой от 10¢ (без «лотерей», где модель ничего не добавляет). Все три торгуют на одних и тех же данных и ценах, банки раздельные, расчёт в тех же правилах; через пару недель по закрытым ставкам будет видно, какая лучше. Ставки до разделения (A4 включён с 14:00 МСК 05.10) (05.10 до 12:53) относятся к A0. <b>T0 и T3 («как симуляция»)</b> покупают не стоячие заявки, а только когда в окне решения на рынке прошла чужая сделка по подходящей цене — так, как считала историческая симуляция; A0/A3/A4 остаются для сравнения.</div></div></div>`;
    $$("#r-var button").forEach((x) => { x.classList.toggle("active", x.dataset.v === VAR); x.onclick = () => { VAR = x.dataset.v; store.set("wx_var", VAR); loadTop(); loadPos(); loadClosed(); loadGate(); loadCal(); loadLiq(); }; });
    $("#r-top").innerHTML = `<div class="wx-hero">
      <div class="card wx-sw"><button class="wx-big ${s.enabled ? "on" : ""}" id="sw" title="Включить / выключить бумажные ставки" aria-label="Включить или выключить бумажные ставки"></button>
        <div class="txt"><b>Бумажные ставки: ${s.enabled ? "ВКЛЮЧЕНЫ" : "выключены"}</b><span>${s.enabled ? "Робот ставит в окнах решений по правилам стратегии." : "Новых ставок нет. Оценки модели и снимки стаканов продолжаются, открытые ставки закроются по итогу рынка."}</span></div></div>
      <div class="card"><div class="card-b" style="font-size:13px;line-height:1.8">
        <div><b>Процесс робота:</b> ${st.alive ? `<span class="good">работает</span>, пульс ${ago(st.age)}` : `<span class="bad">не отвечает</span> ${st.age ? "(пульс " + ago(st.age) + ")" : ""}`}</div>
        <div><b>Модель:</b> ${b.model ? `${nf(b.model.n)} строк, ${b.model.stations} станций, данные до ${esc(b.model.through)}; обучена ${tfmt(b.model.trained_at)}${b.retraining ? " — переобучается…" : ""}` : "ещё нет"}</div>
        <div><b>Открытых рынков в работе:</b> ${b.events ?? "—"} · <b>оценок модели:</b> ${nf(st.evals)}</div>
        ${b.api ? (() => { const a = b.api, n = a.n || {}, er = a.err || {}, e4 = a.e429 || {}, lo = a.last_ok || {}, tot = (k) => nf(n[k] || 0), bad = Object.values(er).reduce((x, y) => x + y, 0), lim = Object.values(e4).reduce((x, y) => x + y, 0);
          const age = (k) => (lo[k] ? ago(Date.now() / 1000 - lo[k]) : "ещё не было");
          return `<div title="счётчики за сутки по UTC; бесплатный лимит Open-Meteo — 10 000 вызовов в сутки"><b>Запросы за сутки:</b> прогнозы Open-Meteo ${tot("om")} (последний успешный ${age("om")}), METAR-архив ${tot("iem")} (${age("iem")}), METAR-NOAA ${tot("noaa")} (${age("noaa")}), рынки Polymarket ${tot("gamma")}, стаканы ${tot("clob")} (${age("clob")}) · ошибок ${nf(bad)}${lim ? ` <span class="bad">(лимитов 429: ${nf(lim)})</span>` : ""}</div>`; })() : ""}
        ${b.last_error ? `<div class="bad"><b>Последняя ошибка:</b> ${esc(b.last_error)}</div>` : ""}</div></div></div>
      <div class="wx-kpis">
        ${kpi("Виртуальный банк · " + VAR, usd(bv.bank ?? s.bank.start, 2), `старт ${usd(s.bank.start, 0)}`, cls((bv.bank ?? s.bank.start) - s.bank.start))}
        ${kpi("Итог закрытых", money(cl.p), `${nf(cl.n)} ставок`, cls(cl.p))}
        ${kpi("ROI", pc(roi), "итог / вложено, после комиссии", cls(roi))}
        ${kpi("Доля выигравших", cl.n ? pc0(cl.w / cl.n) : "—", "по закрытым ставкам")}
        ${kpi("Сейчас открыто", usd(op.c, 2), `${nf(op.n)} ставок`)}
      </div>`;
    $("#sw").onclick = async (e) => { e.target.disabled = true; try { await post("/api/weather/toggle", { enabled: !s.enabled }); } finally { loadTop(); refreshBadge(); } };
    const pts = eq.series ? [...eq.series.A0, ...eq.series.A3, ...(eq.series.A4 || []), ...(eq.series.T3 || []), ...(eq.series.T0 || [])].sort((a, b) => a[0] - b[0]) : eq.points;
    $("#r-chart").innerHTML = pts.length ? `<div class="card"><div class="card-h"><h3>Кривая банка по закрытым ставкам: A3 и A0</h3></div><div class="card-b"><div class="chart-box"><canvas id="ch-eq"></canvas></div></div></div>`
      : `<div class="card"><div class="wx-empty">Закрытых ставок пока нет. Ставка закрывается после конца местных суток, когда Polymarket объявит итог. Первые итоги — завтра.</div></div>`;
    if (pts.length) chart2("ch-eq", pts.map((x) => x[0]), eq.start, eq.series);
  }
  async function loadWin() {
    const sg = await api("/api/weather/signals");
    const up = (WST && WST.upcoming) || [];
    const em = (WST && WST.settings.rules.edge_min) || 0.05;
    $("#r-win").innerHTML = `<div class="card"><div class="card-h"><h3>Окна решений сейчас</h3></div><div class="card-b">${sg.windows.length ? sg.windows.map((w) => {
      const edges = w.bins.map((b) => Math.max(isNum(b.ask) ? b.p - b.ask : -1, isNum(b.bid) ? b.bid - b.p : -1)), best = Math.max(...edges), hasBet = w.bets.length > 0;
      return `<details style="margin-bottom:10px" ${hasBet || best > em ? "open" : ""}><summary style="cursor:pointer"><b>${esc(w.city)}</b> · ${esc(w.date)} · решение ${String(w.h).padStart(2, "0")}:00 · минимум ${esc(w.M)}° · окно до ${tfmt(w.until)} · ${hasBet ? `<span class="good">куплено ${w.bets.length}</span>` : best > em ? `<span class="good">есть перевес ${pc(best, 0)}</span>` : `<span class="muted">перевеса нет</span>`}</summary>
        <table class="wx-bins"><thead><tr><th>Корзина</th><th>Модель</th><th>Продают</th><th>Покупают</th><th>Перевес YES</th><th>Перевес NO</th></tr></thead><tbody>
        ${w.bins.map((b) => { const ey = isNum(b.ask) ? b.p - b.ask : null, en = isNum(b.bid) ? b.bid - b.p : null; const has = w.bets.some((x) => x.label.replace(/[^\d≤≥–-]/g, "").startsWith(String(b.lab).replace(/[^\d≤≥–-]/g, "")));
          return `<tr class="${has ? "bet" : ""}"><td>${esc(b.lab)}</td><td>${pc0(b.p)}</td><td>${cents(b.ask, 0)}</td><td>${cents(b.bid, 0)}</td><td class="${isNum(ey) && ey > em ? "good" : ""}">${isNum(ey) ? pc(ey, 0) : "—"}</td><td class="${isNum(en) && en > em ? "good" : ""}">${isNum(en) ? pc(en, 0) : "—"}</td></tr>`; }).join("")}
        </tbody></table></details>`; }).join("") : `<div class="wx-empty" style="padding:14px">Сейчас нет окон решений. Они открываются через ${nf((WST && WST.settings.rules.latency_min) || 10)} мин после 00:00, 02:00, … 10:00 местного времени станции.</div>`}
      <div class="wx-note">Зелёная строка — по этой корзине робот уже купил. Перевес: вероятность модели против цены, по которой можно купить сейчас (YES — у продавцов, NO — у покупателей). Зелёным выделен перевес выше порога ${pc0(em)}.</div></div></div>`;
    $("#r-up").innerHTML = `<div class="card"><div class="card-h"><h3>Ближайшие окна</h3></div><div class="card-b">${up.length ? `<table class="tbl"><thead><tr><th class="l">Когда (ваше время)</th><th class="l">Город</th><th>Дата рынка</th><th>Час</th></tr></thead><tbody>${up.map((u) => `<tr><td class="l">${tfmt(u.t)}</td><td class="l">${esc(u.city)}</td><td>${esc(u.date)}</td><td>${String(u.h).padStart(2, "0")}:00</td></tr>`).join("")}</tbody></table>` : `<div class="wx-empty">Нет запланированных окон.</div>`}</div></div>`;
  }
  async function loadClosed() {
    const d = await api("/api/weather/bets?state=closed&limit=1000&variant=" + VAR), B = (d.bets || []).sort((a, b) => (b.settled_t || 0) - (a.settled_t || 0));
    if (!B.length) { $("#r-closed").innerHTML = `<div class="card"><div class="wx-empty">Закрытых ставок у этого варианта пока нет — рынок закрывается через ~3 часа после конца местных суток.</div></div>`; return; }
    let cost = 0, pnl = 0, w = 0;
    const rows = B.map((b) => { const tot = b.cost + b.fee; cost += tot; pnl += b.pnl || 0; w += b.won ? 1 : 0;
      return `<tr class="click" data-id="${b.id}"><td class="l">${b.settled_t ? tfmt(b.settled_t) : "—"}</td><td class="l">${tfmt(b.t_first)}</td><td class="l">${esc(b.city)} · ${esc(b.date.slice(5))}${b.url ? ` <a class="wx-ext" href="${esc(b.url)}" target="_blank" rel="noopener noreferrer" title="Открыть событие на Polymarket" onclick="event.stopPropagation()">↗</a>` : ""}</td><td>${String(b.h).padStart(2, "0")}:00</td><td>${esc(b.label)}</td><td><span class="wx-tag ${b.side === "Y" ? "y" : "n"}">${b.side === "Y" ? "YES" : "NO"}</span></td><td>${pc0(b.model_p)}</td><td>${cents(b.avg)}</td><td>${usd(b.cost)}</td><td><b class="${b.won ? "good" : "bad"}">${b.won ? "выиграла" : "проиграла"}</b></td><td class="${cls(b.pnl)}">${money(b.pnl)}</td><td class="${cls(b.pnl)}">${tot ? pc(b.pnl / tot) : "—"}</td></tr>`; }).join("");
    $("#r-closed").innerHTML = `<div class="card"><div class="card-b tbl-wrap"><table class="tbl"><thead><tr><th class="l">Закрыта</th><th class="l">Куплено</th><th class="l">Рынок</th><th>Час</th><th>Корзина</th><th>Сторона</th><th>Модель</th><th>Вход</th><th>Вложено</th><th>Итог</th><th>Результат</th><th>ROI</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="wx-note"><b>Итого по закрытым:</b> ${nf(B.length)} ставок, выиграло ${nf(w)} (${pc0(w / B.length)}), вложено ${usd(cost)} (с комиссией), результат <b class="${cls(pnl)}">${money(pnl)}</b>${cost ? `, ROI <b class="${cls(pnl)}">${pc(pnl / cost)}</b>` : ""}. Результат уже с комиссией. Ставки одного рынка не независимы: несколько корзин одного события выигрывают или проигрывают вместе — судить о стратегии по малому числу событий нельзя. Нажмите на строку — подробности.</div></div></div>`;
    $$("#r-closed tr.click").forEach((tr) => (tr.onclick = () => betModal(+tr.dataset.id)));
  }
  async function loadPos() {
    const [bets, pos] = await Promise.all([api("/api/weather/bets?state=open&limit=300&variant=" + VAR), api("/api/weather/positions")]);
    const P = pos.positions || {}; let tot = 0, totx = 0, cost = 0, n = 0, nu = 0, cu = 0;
    const rows = bets.bets.map((b) => { const p = P[b.id]; if (p) { tot += p.pnl; totx += isNum(p.pnl_exit) ? p.pnl_exit : p.pnl; cost += b.cost; n++; } else { nu++; cu += b.cost; }
      return `<tr class="click" data-id="${b.id}"><td class="l">${tfmt(b.t_first)}</td><td class="l">${esc(b.city)} · ${esc(b.date.slice(5))}${b.url ? ` <a class="wx-ext" href="${esc(b.url)}" target="_blank" rel="noopener noreferrer" title="Открыть событие на Polymarket" onclick="event.stopPropagation()">↗</a>` : ""}</td><td>${String(b.h).padStart(2, "0")}:00</td><td>${esc(b.label)}</td><td><span class="wx-tag ${b.side === "Y" ? "y" : "n"}">${b.side === "Y" ? "YES" : "NO"}</span></td><td>${pc0(b.model_p)}${b.edge_first > 0.5 ? ' <span class="bad" title="перевес больше 50 п.п.: чаще лотерея, чем реальное преимущество">⚠</span>' : ""}</td><td>${cents(b.avg)}</td><td>${usd(b.cost)}</td>
        <td title="${p && isNum(p.exit) ? "если продать сразу по лучшей цене покупателей: " + cents(p.exit) + " → " + money(p.pnl_exit) : ""}">${p ? cents(p.mark) : "—"}</td><td class="${cls(p && p.pnl)}">${p ? money(p.pnl) : "—"}</td><td class="${cls(1)}">${money(b.shares - b.cost - b.fee)}</td><td class="bad">${money(-b.cost - b.fee)}</td></tr>`; }).join("");
    $("#r-pos").innerHTML = bets.bets.length ? `<div class="card"><div class="card-b tbl-wrap"><table class="tbl"><thead><tr><th class="l">Куплено</th><th class="l">Рынок</th><th>Час</th><th>Корзина</th><th>Сторона</th><th>Модель</th><th>Вход</th><th>Вложено</th><th title="середина между покупателями и продавцами (для NO — зеркально); по лучшей цене покупателей см. подсказку в ячейке">Сейчас (середина)</th><th>Прибыль сейчас</th><th>Если выиграет</th><th>Если проиграет</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="wx-note">${n ? `<b>Это оценка, а не результат.</b> Цена есть у ${nf(n)} из ${nf(bets.bets.length)} ставок (вложено ${usd(cost)}). По середине стакана: <b class="${cls(tot)}">${money(tot)}</b>; по цене, за которую реально можно продать сейчас: <b class="${cls(totx)}">${money(totx)}</b> — на тонких рынках верьте второй цифре. ` : ""}${nu ? `У ещё <b>${nf(nu)}</b> ставок (вложено ${usd(cu)}) цены нет: стакан пустой или рынок уже закрыт к торгам, в суммы выше они <b>не входят</b>. Если все они сгорят, это −${usd(cu)}; выигрыш там возможен, но маловероятен (большая «прибыль» по дешёвым ставкам — это один шанс из сотни). ` : ""}Ставки держатся до итога рынка. Нажмите на строку — подробности.</div></div></div>` : `<div class="card"><div class="wx-empty">Открытых ставок нет.</div></div>`;
    $$("#r-pos tr.click").forEach((tr) => (tr.onclick = () => betModal(+tr.dataset.id)));
  }
  async function loadGate() {
    const g = await api("/api/weather/gate?variant=" + VAR), s = g.stats || {};
    const fmt = (c) => (c.fmt === "pct" ? pc(c.v) : c.fmt === "d" ? nf(c.v, 1) + " дн." : nf(c.v));
    const need = (c) => (c.fmt === "pct" ? pc0(c.need) : c.fmt === "d" ? c.need + " дн." : nf(c.need));
    $("#r-gate").innerHTML = `<div class="card"><div class="card-b"><div class="wx-gate">${(g.criteria || []).map((c) => { const k = isNum(c.v) ? Math.max(0, Math.min(1, c.fmt === "pct" ? (c.need > 0 ? c.v / c.need : (c.v > 0 ? 1 : 0)) : c.v / c.need)) : 0;
      return `<div class="row ${c.ok ? "ok" : ""}"><span>${c.ok ? "✓" : "○"} ${esc(c.k)}</span><span class="mono"><b>${isNum(c.v) ? fmt(c) : "—"}</b> из ${need(c)}</span><div class="bar"><i style="width:${(k * 100).toFixed(0)}%"></i></div></div>`; }).join("")}</div>
      <div class="wx-note">${g.ready ? "<b class=good>Все критерии выполнены.</b> " : ""}Это условия, при которых имеет смысл обсуждать реальные деньги; решение принимаете вы. ДИ — 95% доверительный интервал ROI (по рынкам). Выполненные ставки: ${nf(s.n_all)}, закрытых ${nf(s.n_closed)}. ${isNum(s.ci) ? "" : "Интервал появится после 20 закрытых рынков."}</div></div></div>`;
  }
  async function loadCal() {
    const c = await api("/api/weather/calibration?variant=" + VAR);
    $("#r-cal").innerHTML = `<div class="card"><div class="card-b">${c.n ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th class="l">Вероятность модели</th><th>Закрытых ставок</th><th>Модель обещала</th><th>Реально выиграло</th><th>Разница</th><th>Итог</th></tr></thead><tbody>
      ${c.groups.map((g) => `<tr><td class="l">${esc(g.k)}</td><td>${nf(g.n)}</td><td>${pc0(g.p)}</td><td>${pc0(g.win)}</td><td class="${cls(g.win - g.p)}">${pc(g.win - g.p, 0)}</td><td class="${cls(g.pnl)}">${money(g.pnl)}</td></tr>`).join("")}</tbody></table></div>
      ${c.strong ? `<div class="wx-warn" style="margin-top:12px"><b>Сильный перевес (больше 50 п.п.):</b> ${nf(c.strong.n)} ставок, модель обещала ${pc0(c.strong.p)}, реально выиграло ${pc0(c.strong.win)}, итог ${money(c.strong.pnl)}. В истории такие ставки — почти лотерея: часто это рынок знает больше модели.</div>` : ""}`
      : `<div class="wx-empty" style="padding:14px">Таблица заполнится по закрытым ставкам. Сюда смотрим, не завышает ли модель вероятности: если «обещала» заметно выше «реально выиграло», доверять модели нельзя.</div>`}
      <div class="wx-note">Пока закрытых ставок меньше 30 в каждой строке, выводы делать рано: разброс огромный.</div></div></div>`;
  }
  async function loadLiq() {
    const d = await api("/api/weather/liquidation"), V = d.variants || {};
    const row = (v) => { const x = V[v] || {}; if (!x.n) return `<tr><td class="l"><b>${esc(v)}</b></td><td colspan="7" class="muted">нет открытых ставок</td></tr>`;
      const sold = x.proceeds - x.basis_sold, total = x.proceeds - x.cost;
      return `<tr><td class="l"><b>${esc(VNAME[v] || v)}</b></td><td>${nf(x.n)}</td><td>${usd(x.cost, 0)}</td><td>${usd(x.proceeds, 2)}</td><td class="${cls(sold)}">${money(sold, 2)}</td><td>${x.n_stuck ? `${nf(x.n_stuck)} · ${usd(x.stuck_cost, 0)}` : "—"}</td><td class="${cls(total)}"><b>${money(total, 2)}</b></td><td class="${cls(total + (x.stuck_ref || 0))}">${x.n_stuck ? money(total + (x.stuck_ref || 0), 2) : "—"}</td></tr>`; };
    const mine = (d.bets || []).filter((b) => b.v === VAR).sort((a, b) => a.pnl_sold - b.pnl_sold);
    $("#r-liq").innerHTML = `<div class="card"><div class="card-b tbl-wrap"><table class="tbl"><thead><tr><th class="l">Вариант</th><th>Ставок</th><th>Вложено (с комиссией)</th><th title="сколько вернулось бы за всё, что есть кому продать, после комиссии продажи">Выручка</th><th title="выручка минус стоимость той части, что удалось продать">Результат на проданной части</th><th title="часть акций, которую сейчас некому купить: ставок · сколько в неё вложено">Некому продать</th><th title="если то, что некому продать, пропадёт (оценка снизу)">Итог, если остаток = 0</th><th title="остаток оценён по другой стороне стакана: для YES — лучшая цена продавцов, для NO — 1 минус лучший покупатель YES; это ориентир, а не цена сделки">Итог, остаток по ориентиру</th></tr></thead><tbody>${["A3", "A4", "A0", "T3", "T0"].map(row).join("")}</tbody></table>
      <div class="wx-note"><b>Что это.</b> Мы «продаём» каждую открытую ставку по настоящему стакану Polymarket: не по лучшей цене, а проходим глубже, пока не продадим все акции или не кончатся покупатели, и вычитаем комиссию продажи (5%·p·(1−p)). Акции, у которых нет покупателей (так бывает у лотерей и у рынков, где ответ уже ясен), в выручку не входят. «Итог, если остаток = 0» — самая осторожная оценка: что осталось без покупателей, пропадёт; сюда попадают и ставки, которые на самом деле уже выиграли (рынок решён, но покупателей на нашу сторону нет). «Остаток по ориентиру» оценивает такие акции по другой стороне стакана — это ближе к правде, но уже не цена сделки. В жизни ставки держатся до итога рынка, а этот расчёт показывает, сколько денег мы реально могли бы забрать прямо сейчас. Цены на таких рынках быстро меняются.</div>
      <details style="margin-top:10px"><summary style="cursor:pointer" class="muted">Подробно по ставкам варианта выше (от худших)</summary><table class="tbl" style="margin-top:8px"><thead><tr><th class="l">Рынок</th><th>Корзина</th><th>Сторона</th><th>Вложено</th><th>Продано акций</th><th>Выручка</th><th>Результат</th><th>Не продано акций</th></tr></thead><tbody>
      ${mine.map((b) => `<tr><td class="l">${esc(b.city)} · ${esc(String(b.date).slice(5))}</td><td>${esc(b.label)}</td><td><span class="wx-tag ${b.side === "Y" ? "y" : "n"}">${b.side === "Y" ? "YES" : "NO"}</span></td><td>${usd(b.cost)}</td><td>${nf(b.sold, 1)}</td><td>${usd(b.proceeds)}</td><td class="${cls(b.pnl_sold)}">${b.sold > 0 ? money(b.pnl_sold) : "—"}</td><td>${b.stuck > 0.05 ? `<span class="bad">${nf(b.stuck, 1)}</span>` : "—"}</td></tr>`).join("")}</tbody></table></details></div></div>`;
  }
  async function loadDrift() {
    const d = await api("/api/weather/drift");
    const cell = (x, k) => (x && x[k] && x[k].n ? x[k] : null);
    const row = (v, H) => {
      const L = (d.live[v] || {})["h" + H], Hs = (d.hist[v] || {})["h" + H];
      const lm = L && L.mid, le = L && L.exit;
      return `<tr><td class="l"><b>${esc(v)}</b> · через ${H}–${H + 1} ч</td>
        <td>${L ? nf(L.n) : "0"}</td><td class="${cls(lm && lm.mean_c)}">${lm && lm.n ? (lm.mean_c >= 0 ? "+" : "−") + nf(Math.abs(lm.mean_c) * 100, 1) + "¢" : "—"}</td><td>${lm && lm.n ? pc0(lm.against) : "—"}</td><td class="${cls(lm && lm.roi)}">${lm && lm.n ? pc(lm.roi, 0) : "—"}</td><td class="${cls(le && le.roi)}">${le && le.n ? pc(le.roi, 0) : "—"}</td>
        <td>${Hs ? nf(Hs.n) : "—"}</td><td class="${cls(Hs && Hs.mean_c)}">${Hs ? (Hs.mean_c >= 0 ? "+" : "−") + nf(Math.abs(Hs.mean_c) * 100, 1) + "¢" : "—"}</td><td>${Hs ? pc0(Hs.against) : "—"}</td><td class="${cls(Hs && Hs.roi)}">${Hs ? pc(Hs.roi, 0) : "—"}</td></tr>`;
    };
    $("#r-drift").innerHTML = `<div class="card"><div class="card-b tbl-wrap"><table class="tbl"><thead><tr><th class="l" rowspan="2">Вариант</th><th colspan="5">Живые бумажные ставки (снимки стаканов)</th><th colspan="4">История: симуляция (лента сделок)</th></tr>
      <tr><th>Ставок с данными</th><th title="Средняя разница между ценой нашей стороны через 1 и 3 часа и ценой входа">Сдвиг цены</th><th>Против нас</th><th title="Прибыль/убыток от сдвига цены к вложенному, если бы ставку закрыли по середине">К вложенному (середина)</th><th title="То же, если закрыть по цене выхода (с учётом спреда)">К вложенному (выход)</th><th>Ставок</th><th>Сдвиг цены</th><th>Против нас</th><th>К вложенному</th></tr></thead>
      <tbody>${["A3", "A4", "A0", "T3", "T0"].flatMap((v) => [row(v, 1), row(v, 3)]).join("")}</tbody></table></div>
      <div class="wx-note">«Сдвиг» — на сколько цена нашей стороны через 1 и 3 часа после покупки отличается от цены, по которой мы купили. Плюс — цена пошла в нашу пользу, минус — против. В истории цены обычно шли в нашу пользу (рынок «догонял» модель). Если у живых ставок сдвиг устойчиво отрицательный, значит живая покупка хуже исторической: нас перехватывают или мы берём устаревшие уровни. По живым ставкам середина считается только при узком спреде (до 20¢), на тонких стаканах данных мало; пока ставок меньше 30 — это не вывод, а наблюдение. Путь цены каждой ставки — в её карточке (клик по строке).</div></div>`;
  }
  const all = () => Promise.all([loadTop(), loadWin(), loadPos(), loadClosed(), loadGate(), loadCal(), loadDrift(), loadLiq()]).catch((e) => console.error(e));
  await all(); every(loadTop, 20000); every(loadWin, 20000); every(loadPos, 20000); every(loadClosed, 60000); every(loadGate, 120000); every(loadCal, 120000); every(loadDrift, 180000); every(loadLiq, 60000);
}

async function betModal(id) {
  try {
    const d = await api("/api/weather/bet/" + id), b = d.bet, probs = d.eval ? JSON.parse(d.eval.probs) : null;
    modal(`<h3 style="margin:0 0 6px">${esc(b.city)} · ${esc(b.date)} · «${esc(b.label)}» · ${b.side === "Y" ? "YES" : "NO"} · вариант ${esc(b.variant || "A0")}</h3>
      <div class="wx-note">Решение в ${String(b.h).padStart(2, "0")}:00 по местному времени станции ${esc(b.icao)}. Вероятность модели, что наша сторона выиграет: <b>${pc0(b.model_p)}</b>; перевес при первой покупке ${pc(b.edge_first)}.
      Цель ставки ${usd(b.stake_target)}, куплено ${usd(b.cost)} (${nf(b.shares, 2)} акций, средняя цена ${cents(b.cost / b.shares)}), комиссия ${usd(b.fee)}.
      ${b.status === "закрыта" ? `Итог рынка: корзина ${b.outcome === 1 ? "сыграла" : "не сыграла"} → ставка <b class="${b.won ? "good" : "bad"}">${b.won ? "выиграла" : "проиграла"}</b>, результат ${money(b.pnl)}.` : "Ставка открыта до итога рынка."}</div>
      <table class="tbl"><thead><tr><th class="l">Время</th><th>Цена</th><th>Акций</th><th>$</th><th>Лучшая цена в стакане</th><th class="l">Стакан (топ-5 уровней)</th></tr></thead><tbody>
      ${d.fills.map((f) => { let bk = ""; try { bk = JSON.parse(f.book).map((x) => `${(x[0] * 100).toFixed(0)}¢×${nf(x[1], 0)}`).join(" · "); } catch (e) { /* пусто */ } return `<tr><td class="l">${tfmt(f.ts)}</td><td>${cents(f.price)}</td><td>${nf(f.shares, 2)}</td><td>${usd(f.cost)}</td><td>${cents(f.best_px)}</td><td class="l" style="font-size:11px">${esc(bk)}</td></tr>`; }).join("")}</tbody></table>
      ${d.path && d.path.length > 1 ? `<h3 style="margin:14px 0 4px">Цена нашей стороны после покупки</h3><div class="chart-box"><canvas id="ch-path"></canvas></div><div class="wx-note">Раз в 15 минут: «выход» — по какой цене можно было бы продать (лучший покупатель; для NO — 1 минус лучший продавец YES), «середина» — только когда спред не шире 20¢. Пунктир — наша цена входа ${cents(b.cost / b.shares)}.</div>` : ""}
      ${probs ? `<div class="wx-note">Прогноз модели по всем корзинам рынка в момент решения (текущий минимум ${esc(d.eval.M)}°): ${probs.map((p) => nf(p * 100, 0) + "%").join(" · ")}</div>` : ""}`);
    if (d.path && d.path.length > 1) drawPath(d.path, b.cost / b.shares);
  } catch (e) { modal("Не удалось загрузить: " + esc(e.message)); }
}
function drawPath(path, ent) {
  const el = document.getElementById("ch-path");
  if (!el || typeof Chart === "undefined") return;
  if (CHARTS["ch-path"]) CHARTS["ch-path"].destroy();
  const labels = path.map((p) => tfmt(p[0]));
  CHARTS["ch-path"] = new Chart(el, { type: "line", data: { labels, datasets: [
    { label: "выход (продать)", data: path.map((p) => p[1]), borderColor: "#ff5b6e", pointRadius: 0, borderWidth: 2, spanGaps: true, tension: 0 },
    { label: "середина", data: path.map((p) => p[2]), borderColor: "#2ee584", pointRadius: 2, borderWidth: 1, spanGaps: true, tension: 0 },
    { label: "вход", data: path.map(() => ent), borderColor: "#8b95a8", borderDash: [6, 4], pointRadius: 0, borderWidth: 1 }] },
    options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: true, labels: { color: "#8b95a8" } }, tooltip: { callbacks: { label: (c) => c.dataset.label + ": " + cents(c.parsed.y, 1) } } },
      scales: { x: { ticks: { maxTicksLimit: 6, color: "#8b95a8" }, grid: { display: false } }, y: { min: 0, max: 1, ticks: { color: "#8b95a8", callback: (v) => nf(v * 100) + "¢" }, grid: { color: "rgba(148,163,184,.12)" } } } } });
}

/* ======================================================================= СТАВКИ */
async function pageBets() {
  let state = store.get("wx_bets_state", "all"), bvar = store.get("wx_bets_var", "");
  APP.innerHTML = `<div class="page-head"><div><h1>Ставки робота</h1><div class="sub">Все бумажные ставки: что и когда куплено, по каким ценам, чем закончилось.</div></div></div>
    <div class="toolbar"><div class="seg" id="bs-seg"><button data-s="all">Все</button><button data-s="open">Открытые</button><button data-s="closed">Закрытые</button></div>
      <div class="seg" id="bs-var"><button data-v="">Все варианты</button><button data-v="A3">A3</button><button data-v="A4">A4</button><button data-v="A0">A0</button><button data-v="T3">T3</button><button data-v="T0">T0</button></div><span class="muted" id="bs-info"></span></div>
    <div class="card"><div class="card-b tbl-wrap" id="bs-tbl"><div class="loading">Загрузка…</div></div></div>`;
  async function load() {
    $$("#bs-seg button").forEach((b) => b.classList.toggle("active", b.dataset.s === state));
    $$("#bs-var button").forEach((b) => b.classList.toggle("active", b.dataset.v === bvar));
    const [d, pos] = await Promise.all([api(`/api/weather/bets?state=${state}&limit=2000${bvar ? "&variant=" + bvar : ""}`), api("/api/weather/positions").catch(() => ({ positions: {} }))]);
    const P = pos.positions || {};
    const closed = d.bets.filter((b) => b.status === "закрыта"), spent = closed.reduce((a, b) => a + b.cost, 0), pnl = closed.reduce((a, b) => a + b.pnl, 0);
    $("#bs-info").innerHTML = `Показано ${nf(d.bets.length)} из ${nf(d.total)}. Закрытых: ${nf(closed.length)}, итог <b class="${cls(pnl)}">${money(pnl)}</b>, ROI <b class="${cls(pnl)}">${spent ? pc(pnl / spent) : "—"}</b>`;
    $("#bs-tbl").innerHTML = d.bets.length ? `<table class="tbl"><thead><tr><th class="l">Куплено</th><th>Вариант</th><th class="l">Город</th><th>Дата</th><th>Час</th><th>Корзина</th><th>Сторона</th><th>Модель</th><th>Вход</th><th>Вложено</th><th>Акций</th><th>Статус</th><th>Итог</th><th>ROI</th></tr></thead><tbody>
      ${d.bets.map((b) => { const p = P[b.id]; return `<tr class="click" data-id="${b.id}"><td class="l">${tfmt(b.t_first)}</td><td>${esc(b.variant || "A0")}</td><td class="l">${esc(b.city)}</td><td>${esc(b.date)}</td><td>${String(b.h).padStart(2, "0")}:00</td><td>${esc(b.label)}</td><td><span class="wx-tag ${b.side === "Y" ? "y" : "n"}">${b.side === "Y" ? "YES" : "NO"}</span></td><td>${pc0(b.model_p)}${b.edge_first > 0.5 ? ' <span class="bad" title="перевес больше 50 п.п.: чаще лотерея, чем реальное преимущество">⚠</span>' : ""}</td><td>${cents(b.avg)}</td><td>${usd(b.cost)}</td><td>${nf(b.shares, 1)}</td>
        <td>${b.status === "закрыта" ? (b.won ? '<span class="good">выиграла</span>' : '<span class="bad">проиграла</span>') : "открыта"}</td>
        <td class="${cls(b.status === "закрыта" ? b.pnl : p && p.pnl)}">${b.status === "закрыта" ? money(b.pnl) : p ? money(p.pnl) + " (сейчас)" : "—"}</td><td class="${cls(b.pnl)}">${b.status === "закрыта" ? pc(b.pnl / b.cost) : "—"}</td></tr>`; }).join("")}</tbody></table>` : `<div class="wx-empty">Ставок пока нет — ждём окон решений. Робот ставит, только когда перевес по живому стакану больше порога.</div>`;
    $$("#bs-tbl tr.click").forEach((tr) => (tr.onclick = () => betModal(+tr.dataset.id)));
  }
  $$("#bs-seg button").forEach((b) => (b.onclick = () => { state = b.dataset.s; store.set("wx_bets_state", state); load(); }));
  $$("#bs-var button").forEach((b) => (b.onclick = () => { bvar = b.dataset.v; store.set("wx_bets_var", bvar); load(); }));
  await load(); every(load, 30000);
}

/* ======================================================================= СИМУЛЯЦИЯ */
const PRESETS = {
  tested: { name: "Как в проверке ($10, окно 60 мин)", bank: { method: "usd", usd: 10, max_usd: 0 }, rules: { window_min: 60, latency_min: 10, edge_min: 0.05 } },
  real: { name: "Реалистично (окно 5 мин)", bank: { method: "usd", usd: 10, max_usd: 0 }, rules: { window_min: 5, latency_min: 10, edge_min: 0.05 } },
  pct: { name: "1% банка, потолок $50", bank: { method: "pct", flat: 1, start: 1000, max_usd: 50 }, rules: { window_min: 60 } },
  kelly: { name: "Келли ¼, потолок $50", bank: { method: "kelly", start: 1000, kf: 0.25, trust: 0.5, min: 0.5, max: 2, max_usd: 50 }, rules: { window_min: 60 } },
  old: { name: "Без смеси с рынком (модель сама)", bank: { method: "usd", usd: 10, max_usd: 0 }, rules: { blend: false, window_min: 60 } },
  nolot: { name: "Без лотерей (цена от 10¢)", bank: { method: "usd", usd: 10, max_usd: 0 }, rules: { price_min: 0.10, window_min: 60 } },
  yes: { name: "Только YES", bank: { method: "usd", usd: 10, max_usd: 0 }, rules: { sides: ["Y"], window_min: 60 } },
  cheap: { name: "Дешёвые исходы (до 30¢)", bank: { method: "usd", usd: 10, max_usd: 0 }, rules: { price_max: 0.3, window_min: 60 } },
};
async function pageSim() {
  const meta = await api("/api/weather/meta");
  let S = store.get("wx_sim", null) || { settings: { bank: meta.defaults.bank, rules: meta.defaults.rules }, months: meta.sim.months, cities: [] };
  S.settings = { bank: { ...meta.defaults.bank, ...S.settings.bank }, rules: { ...meta.defaults.rules, ...S.settings.rules } };
  if (!S.months || !S.months.length) S.months = meta.sim.months;
  APP.innerHTML = `<div class="page-head"><div><h1>Симуляция прошлых ставок</h1><div class="sub">Те же правила и формулы, что у робота, на истории ${esc(meta.sim.first)} … ${esc(meta.sim.last)}: ${nf(meta.sim.n_cands)} кандидатов, ${nf(meta.sim.n_prints)} реальных сделок Polymarket. Вероятности модели посчитаны честно: каждый месяц модель обучена только на данных до его начала.</div></div></div>
    <div class="wx-warn"><b>Как читать.</b> Исполнение берётся по реальной ленте сделок: покупаем то, что в окне после решения реально продавали по подходящей цене, в том объёме, который был. Живые стаканы за прошлое не хранятся, поэтому результат — оценка; настоящую проверку делает бумажный робот на вкладке «Робот». Большие ставки в жизни исполняются хуже.</div>
    <div class="wx-chips" id="sm-presets"><span class="muted">Быстрые настройки:</span>${Object.entries(PRESETS).map(([k, p]) => `<button class="chip" data-p="${k}">${esc(p.name)}</button>`).join("")}</div>
    <div class="card" style="margin-top:12px"><div class="card-b" id="sm-root">${formHTML("sm", S.settings)}
      <div class="wx-fieldset"><b>Период и города</b><div style="margin-top:10px" class="wx-mon" id="sm-months">${meta.sim.months.map((m) => `<button class="chip ${S.months.includes(m) ? "active" : ""}" data-m="${m}">${m}</button>`).join("")}</div>
        <details style="margin-top:10px"><summary class="muted" style="cursor:pointer">Города: <span id="sm-cn"></span></summary><div class="wx-form chk" style="margin-top:8px" id="sm-cities">${meta.sim.cities.map((c) => `<label><input type="checkbox" value="${esc(c)}" ${!S.cities.length || S.cities.includes(c) ? "checked" : ""}> ${esc(c)}</label>`).join("")}</div>
        <div class="wx-btns"><button class="wx-btn" id="sm-call">Все</button><button class="wx-btn" id="sm-cnone">Никого</button></div></details></div>
      <div class="wx-btns"><button class="wx-btn pri" id="sm-run">Посчитать</button><button class="wx-btn" id="sm-apply" title="Записать эти настройки роботу (действуют на новые покупки)">Применить к роботу</button><span class="wx-note" id="sm-msg"></span></div></div></div>
    <div id="sm-res" style="margin-top:16px"></div>`;
  wireForm("sm", () => { clearTimeout(window._smT); window._smT = setTimeout(run, 500); });
  const cities = () => { const c = $$("#sm-cities input"); const sel = c.filter((x) => x.checked).map((x) => x.value); $("#sm-cn").textContent = sel.length === c.length ? "все" : sel.length + " из " + c.length; return sel.length === c.length ? [] : sel; };
  const months = () => $$("#sm-months .chip.active").map((x) => x.dataset.m);
  $$("#sm-months .chip").forEach((c) => (c.onclick = () => { c.classList.toggle("active"); run(); }));
  $("#sm-cities").addEventListener("change", () => { cities(); run(); });
  $("#sm-call").onclick = () => { $$("#sm-cities input").forEach((x) => (x.checked = true)); cities(); run(); };
  $("#sm-cnone").onclick = () => { $$("#sm-cities input").forEach((x) => (x.checked = false)); cities(); run(); };
  $$("#sm-presets .chip").forEach((c) => (c.onclick = () => { const p = PRESETS[c.dataset.p]; const base = JSON.parse(JSON.stringify(meta.defaults)); fillForm("sm", { bank: { ...base.bank, ...p.bank }, rules: { ...base.rules, ...p.rules } }); run(); }));
  $("#sm-run").onclick = () => run();
  $("#sm-apply").onclick = async () => { const f = readForm("sm"); if (!confirm("Записать эти настройки роботу? Они сразу действуют на новые бумажные покупки.")) return;
    try { await post("/api/weather/settings", f); $("#sm-msg").textContent = "Роботу записано " + new Date().toLocaleTimeString("ru-RU"); } catch (e) { $("#sm-msg").textContent = "Не записалось: " + e.message; } };
  let seq = 0;
  async function run() {
    const my = ++seq, f = readForm("sm"), body = { ...f, months: months(), cities: cities(), rows: 300 };
    store.set("wx_sim", { settings: f, months: body.months, cities: body.cities });
    $("#sm-res").style.opacity = 0.5; $("#sm-msg").textContent = "считаю…";
    try { const r = await post("/api/weather/sim", body); if (my !== seq) return; renderSim(r); $("#sm-msg").textContent = `посчитано за ${r.secs} с`; } catch (e) { $("#sm-msg").textContent = "Ошибка: " + e.message; }
    $("#sm-res").style.opacity = 1;
  }
  cities(); run();
}
function simTable(title, rows, keyFmt) {
  if (!rows || !rows.length) return "";
  return `<div class="card"><div class="card-h"><h3>${title}</h3></div><div class="card-b tbl-wrap"><table class="tbl"><thead><tr><th class="l"></th><th>Ставок</th><th>Вложено</th><th>Итог</th><th>ROI</th><th>Выиграло</th></tr></thead><tbody>
    ${rows.map((x) => `<tr><td class="l">${keyFmt ? keyFmt(x.k) : esc(x.k)}</td><td>${nf(x.n)}</td><td>${usd(x.cost, 0)}</td><td class="${cls(x.pnl)}">${money(x.pnl, 0)}</td><td class="${cls(x.roi)}">${pc(x.roi)}</td><td>${pc0(x.win)}</td></tr>`).join("")}</tbody></table></div></div>`;
}
function drawCurve(dr) {
  const el = document.getElementById("ch-dcurve");
  if (!el || typeof Chart === "undefined" || !dr || !dr.curve) return;
  if (CHARTS["ch-dcurve"]) CHARTS["ch-dcurve"].destroy();
  const C = dr.curve, ds = (k, label, col, w) => ({ label, data: C.map((x) => (x[k] ? x[k].mean_c * 100 : null)), borderColor: col, pointRadius: 3, borderWidth: w, spanGaps: true, tension: 0.15 });
  CHARTS["ch-dcurve"] = new Chart(el, { type: "line", data: { labels: C.map((x) => (x.min < 60 ? x.min + " мин" : nf(x.min / 60, x.min % 60 ? 1 : 0) + " ч")), datasets: [ds("all", "все ставки", "#8b95a8", 3), ds("won", "выигравшие", "#2ee584", 2), ds("lost", "проигравшие", "#ff5b6e", 2)] },
    options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: true, labels: { color: "#8b95a8" } }, tooltip: { callbacks: { label: (c) => c.dataset.label + ": " + (c.parsed.y >= 0 ? "+" : "−") + nf(Math.abs(c.parsed.y), 1) + "¢" } } },
      scales: { x: { ticks: { color: "#8b95a8" }, grid: { display: false } }, y: { ticks: { color: "#8b95a8", callback: (v) => (v > 0 ? "+" : "") + nf(v) + "¢" }, grid: { color: "rgba(148,163,184,.12)" } } } } });
}
async function simPathModal(b) {
  try {
    const d = await api(`/api/weather/sim/path?tok=${encodeURIComponent(b.tok)}&t=${b.t}&side=${b.side}&avg=${b.avg}`);
    modal(`<h3 style="margin:0 0 6px">${esc(b.city)} · ${esc(b.date)} · «${esc(b.label)}» · ${b.side === "Y" ? "YES" : "NO"} (симуляция)</h3>
      <div class="wx-note">Вход ${tfmt(b.t)} по ${cents(b.avg)}, модель ${pc0(b.pm)}, вложено ${usd(b.cost)} → ${b.won ? '<b class="good">выиграла</b>' : '<b class="bad">проиграла</b>'}, ${money(b.pnl)}. Точки — реальные сделки по корзине в ценах нашей стороны (размер точки — объём), линия — средняя цена за 15 минут, пунктир — наш вход.</div>
      <div class="chart-box"><canvas id="ch-spath"></canvas></div>`);
    const el = document.getElementById("ch-spath");
    if (!el || typeof Chart === "undefined") return;
    if (CHARTS["ch-spath"]) CHARTS["ch-spath"].destroy();
    const mx = Math.max(1, ...d.trades.map((x) => x[2]));
    CHARTS["ch-spath"] = new Chart(el, { type: "scatter", data: { datasets: [
      { label: "сделки", data: d.trades.map((x) => ({ x: x[0], y: x[1] })), backgroundColor: "#8b95a888", pointRadius: d.trades.map((x) => 2 + 5 * Math.sqrt(x[2] / mx)) },
      { type: "line", label: "средняя за 15 мин", data: d.bins.map((x) => ({ x: x[0], y: x[1] })), borderColor: "#ff7a1a", pointRadius: 0, borderWidth: 2, tension: 0.1 },
      { type: "line", label: "вход", data: [{ x: d.trades.length ? Math.min(-60, d.trades[0][0]) : -60, y: b.avg }, { x: d.trades.length ? d.trades[d.trades.length - 1][0] : 600, y: b.avg }], borderColor: "#2ee584", borderDash: [6, 4], pointRadius: 0, borderWidth: 1 }] },
      options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: true, labels: { color: "#8b95a8" } }, tooltip: { callbacks: { label: (c) => `${nf(c.parsed.x, 0)} мин: ${cents(c.parsed.y, 1)}` } } },
        scales: { x: { type: "linear", title: { display: true, text: "минуты от входа", color: "#8b95a8" }, ticks: { color: "#8b95a8" }, grid: { color: "rgba(148,163,184,.08)" } }, y: { min: 0, max: 1, ticks: { color: "#8b95a8", callback: (v) => nf(v * 100) + "¢" }, grid: { color: "rgba(148,163,184,.12)" } } } } });
  } catch (e) { modal("Не удалось загрузить: " + esc(e.message)); }
}
function driftCard(dr) {
  if (!dr || !dr.h1) return "";
  const line = (k, x) => `<tr><td class="l">${k}</td><td>${nf(x.n)}</td><td class="${cls(x.mean_c)}">${(x.mean_c >= 0 ? "+" : "−") + nf(Math.abs(x.mean_c) * 100, 1)}¢</td><td>${pc0(x.against)}</td><td class="${cls(x.roi)}">${pc(x.roi, 0)}</td></tr>`;
  return `<div class="card" style="margin-top:16px"><div class="card-h"><h3>Что делала цена после покупки (по ленте сделок)</h3></div><div class="card-b tbl-wrap"><table class="tbl"><thead><tr><th class="l"></th><th>Ставок со сделками в том часу</th><th>Сдвиг цены нашей стороны</th><th>Против нас</th><th>К вложенному</th></tr></thead><tbody>
    ${line("через 1–2 часа после покупки", dr.h1)}${dr.h3 ? line("через 3–4 часа после покупки", dr.h3) : ""}
    ${(dr.h1.by_price || []).map((x) => line("&nbsp;&nbsp;1–2 ч, вход " + esc(x.k), x)).join("")}</tbody></table>
    ${dr.curve ? `<h3 style="margin:16px 0 4px">Как цена менялась после входа</h3><div class="chart-box"><canvas id="ch-dcurve"></canvas></div><div class="wx-note">По оси X — время после первой покупки, по оси Y — средняя цена сделок в этот момент минус наша цена входа, в центах (плюс — в нашу пользу). Красная линия — проигравшие ставки, зелёная — выигравшие, серая — все. Итог ставки известен только потом, поэтому эти две линии показывают не прогноз, а то, <b>когда рынок «узнаёт» ответ</b>: если выигравшие уходят вверх сразу, а проигравшие вниз, то информация доходит до рынка быстро.</div>` : ""}
    <div class="wx-note">Средняя цена сделок на рынке в указанный час против нашей цены входа (для NO — зеркально). Плюс — цена потом шла в нашу пользу. Столбец «К вложенному» — выигрыш/проигрыш от этого сдвига в долях вложенных денег (это не итог ставки, а оценка по цене через час). Такие же цифры по живым ставкам — на вкладке «Робот».</div></div></div>`;
}
function renderSim(r) {
  const el = $("#sm-res");
  if (!r.n) { el.innerHTML = `<div class="card"><div class="wx-empty">При таких настройках ставок нет. Ослабьте фильтры: меньше перевес, шире окно или диапазон цены.</div></div>`; return; }
  const ci = r.ci ? `95% ДИ ${pc(r.ci[0], 0)} … ${pc(r.ci[1], 0)}` : "";
  el.innerHTML = `<div class="wx-kpis">
      ${kpi("Ставок", nf(r.n), `${nf(r.events)} рынков-событий`)}
      ${kpi("Вложено всего", usd(r.spent, 0), `в среднем ${usd(r.avg_cost, 2)} на ставку`)}
      ${kpi("Итог", money(r.pnl, 0), `банк ${usd(r.bank_start, 0)} → ${usd(r.bank_end, 0)}`, cls(r.pnl))}
      ${kpi("ROI", pc(r.roi), ci, cls(r.roi))}
      ${kpi("Макс. просадка", money(r.max_dd, 0), isNum(r.max_dd_pct) ? pc(r.max_dd_pct) + " от пика банка" : "", "bad")}
      ${kpi("Без лучших 10 ставок", pc(r.drop10), `без лучших 50: ${pc(r.drop50)}`, cls(r.drop10))}
      ${kpi("Выигрыш ставок", pc0(r.win_rate), `средняя цена входа ${cents(r.avg_price)}`)}
      ${kpi("Доля прибыли от топ-10", isNum(r.top_share) ? pc0(r.top_share) : "—", "чем выше, тем больше «лотерея»")}
    </div>
    <div class="card"><div class="card-h"><h3>Банк во времени</h3></div><div class="card-b"><div class="chart-box lg"><canvas id="ch-sim"></canvas></div><div class="wx-note">Расчётный банк пересчитывается по правилу «шаг %». Кривая — по закрытию ставок (через 3 часа после конца местных суток). Большие суммы в жизни исполнятся хуже: ликвидность на этих рынках тонкая.</div></div></div>
    <div class="wx-grid2" style="margin-top:16px">${simTable("По месяцам", r.by_month)}${simTable("По стороне", r.by_side, (k) => (k === "Y" ? "YES" : "NO"))}</div>
    <div class="wx-grid2" style="margin-top:16px">${simTable("По часу решения", r.by_h, (k) => String(k).padStart(2, "0") + ":00")}${simTable("По цене входа", r.by_price)}</div>
    <div class="wx-grid2" style="margin-top:16px">${simTable("По перевесу (п.п.)", r.by_edge)}${simTable("По городам (лучшие по прибыли)", r.by_city)}</div>
    ${driftCard(r.drift)}
    <div class="section-title">Ставки (последние ${nf(r.bets.length)} из ${nf(r.n)}) — клик по строке покажет путь цены</div>
    <div class="card"><div class="card-b tbl-wrap"><table class="tbl"><thead><tr><th class="l">Время</th><th class="l">Город</th><th>Дата</th><th>Час</th><th>Корзина</th><th>Сторона</th><th>Модель</th><th>Цена</th><th>Вложено</th><th>Исход</th><th>Итог</th><th>Банк-основа</th></tr></thead><tbody>
    ${[...r.bets].reverse().map((b, i) => `<tr class="click" data-i="${i}"><td class="l">${tfmt(b.t)}</td><td class="l">${esc(b.city)}</td><td>${esc(b.date)}</td><td>${String(b.h).padStart(2, "0")}:00</td><td>${esc(b.label)}</td><td><span class="wx-tag ${b.side === "Y" ? "y" : "n"}">${b.side === "Y" ? "YES" : "NO"}</span></td><td>${pc0(b.pm)}</td><td>${cents(b.avg)}</td><td>${usd(b.cost)}</td><td>${b.won ? '<span class="good">выиграла</span>' : '<span class="bad">проиграла</span>'}</td><td class="${cls(b.pnl)}">${money(b.pnl)}</td><td>${usd(b.ref, 0)}</td></tr>`).join("")}</tbody></table></div></div>`;
  chart("ch-sim", r.curve.map((x) => dfmt(x[0])), r.curve.map((x) => x[1]));
  drawCurve(r.drift);
  const rb = [...r.bets].reverse();
  $$("#sm-res tr.click").forEach((tr) => (tr.onclick = () => simPathModal(rb[+tr.dataset.i])));
}

/* ======================================================================= СТРАТЕГИЯ */
async function pageRules() {
  const [meta, g] = await Promise.all([api("/api/weather/meta"), null]);
  const base = JSON.parse(JSON.stringify(meta.defaults));
  const tested = { bank: { ...base.bank, method: "usd", usd: 10, max_usd: 0 }, rules: { ...base.rules, window_min: 60, blend: false, edge_max: 0 } };      // прежняя версия A0 (модель сама)
  const tested3 = { bank: tested.bank, rules: { ...base.rules, window_min: 60 } };                                                                         // текущая A3
  const w5 = { bank: tested.bank, rules: { ...tested.rules, window_min: 5 } };
  const w5new = { bank: tested.bank, rules: { ...tested3.rules, window_min: 5 } };
  const [A, B, A3, B3] = await Promise.all([post("/api/weather/sim", { ...tested, rows: 0 }), post("/api/weather/sim", { ...w5, rows: 0 }), post("/api/weather/sim", { ...tested3, rows: 0 }), post("/api/weather/sim", { ...w5new, rows: 0 })]);
  const R = meta.settings.rules, Bk = meta.settings.bank;
  APP.innerHTML = `<div class="wx-rules"><div class="page-head"><div><h1>Правила стратегии</h1><div class="sub">Бумажная торговля на рынках Polymarket «Самая низкая температура за день». Версия правил от 05.10.2026. Реальных денег нет.</div></div></div>

  <div class="card"><div class="card-b"><h3 style="margin-top:0">Суть в одном абзаце</h3>
    <p>Рынок спрашивает: «Какой будет самая низкая температура в аэропорту города за календарный день?» — и делит ответы на корзины (по 1°C или 2°F). Ночью, когда день ещё не закончился, мы уже знаем часть наблюдений и свежие прогнозы. Наша модель считает вероятность каждой корзины. Если цена в живом стакане заметно отличается от этой вероятности (≥ ${nf(R.edge_min * 100, 0)} п.п.), робот покупает YES недооценённой корзины или NO переоценённой и держит ставку до итога рынка. Рынки на самую низкую температуру тонкие, цены в них часто устаревшие — на этом и строится преимущество. На рынках «самая высокая температура» преимущества нет, там не торгуем.</p></div></div>

  <h2>Как работает, по шагам</h2>
  <div class="card"><div class="card-b">
   <div class="step"><div class="n">1</div><div><b>Какие рынки.</b> Все открытые рынки «Lowest temperature in … on …» по станциям, которые есть в модели (около 50 городов). Итог определяет минимум температуры по METAR аэропорта за местные сутки (совпадает с победившей корзиной в ~98.5–99% случаев). Если станции нет в модели, рынок пропускается.</div></div>
   <div class="step"><div class="n">2</div><div><b>Когда решаем.</b> В ${R.hours.map((h) => String(h).padStart(2, "0") + ":00").join(", ")} по местному времени станции в день рынка. На решение влияют только наблюдения до этого часа — будущее модель не видит.</div></div>
   <div class="step"><div class="n">3</div><div><b>Что знает модель.</b> Текущий минимум суток, температура, точка росы, ветер, облачность и их динамика (METAR); прогнозы четырёх моделей Open-Meteo (ECMWF, ICON, GFS, GEM), выпущенные накануне, — особенно прогноз на вечер (он решает, не станет ли вечером ещё холоднее); систематическая ошибка прогноза на этой станции за последние дни; время до рассвета, сезон, широта. Прогноз используется только если его запуск к моменту решения уже опубликован (иначе была бы утечка из будущего).</div></div>
   <div class="step"><div class="n">4</div><div><b>Как считается вероятность.</b> Градиентный бустинг предсказывает, на сколько градусов ниже текущего минимума опустится температура до конца суток; из этого получаются вероятности корзин рынка. Модель обучена на ~318 тысячах наблюдений 2024–2026 годов и раз в неделю переобучается на всех данных, включая собственные итоги робота.</div></div>
   <div class="step"><div class="n">5</div><div><b>Окно покупки.</b> Через ${R.latency_min} минут после часа решения (время на получение METAR) начинается окно в ${R.window_min} минут. Вероятности модели строятся по METAR, вышедшим к этому моменту (а не только до часа решения), и <b>перед каждой покупкой, если оценке больше 3 минут, пересчитываются по свежему METAR</b>; если METAR старше 4 часов, не ставим. Каждую минуту робот смотрит <b>живой стакан</b>. Покупка YES — у продавцов, покупка NO — у покупателей (цена NO = 1 − цена покупателя YES).</div></div>
   <div class="step"><div class="n">6</div><div><b>Условие входа (A3).</b> Вероятность модели смешивается с ценой самого уровня стакана: <code>p = σ(a + b·logit(модель) + c·logit(цена))</code>, коэффициенты подобраны логистической регрессией на предыдущих месяцах (≈ пополам модель и рынок; рынок знает то, чего не знает модель, а сильное расхождение чаще ошибка модели). Покупаем уровень, если эта вероятность нашей стороны выше цены больше чем на ${nf(R.edge_min * 100, 0)} п.п. (и не больше ${nf(R.edge_max * 100, 0)} п.п.: слишком большое расхождение — чаще лотерея или рынок знает больше модели) и цена токена в диапазоне ${nf(R.price_min * 100, 0)}–${nf(R.price_max * 100, 0)}¢. Берём только тот объём, который реально стоит на этих уровнях; один и тот же уровень повторно не берём. Минимальная покупка $${nf(R.min_order_usd, 0)}. Комиссия Polymarket на погоду (taker): 5%·p·(1−p) на акцию (≈ 1.2¢ при цене 50¢) — вычитается из результата.</div></div>
   <div class="step"><div class="n">7</div><div><b>Размер ставки.</b> По умолчанию — фиксированные $${nf(Bk.usd, 0)} на корзину и сторону (так проверялась стратегия). Для сравнения доступны формулы NBA/NHL: процент банка, «по перевесу» (min…max % банка между порогами перевеса), «перевес × 1.5·цена^0.585», Келли (доля × доверие × перевес / (1 − цена)); везде есть потолок в долларах и пересчёт расчётного банка при его изменении на ±шаг %. Настройки меняются на вкладках «Робот» и «Симуляция».</div></div>
   <div class="step"><div class="n">8</div><div><b>Закрытие.</b> Ставки держатся до итога рынка. Через 3 часа после конца местных суток робот спрашивает итог у Polymarket и записывает результат: YES выигрывает, если корзина сыграла; NO — если не сыграла. Досрочных выходов нет.</div></div>
   <div class="step"><div class="n">9</div><div><b>Журнал.</b> Робот записывает каждую оценку модели, покупку (с уровнями стакана), закрытие, предупреждения и ошибки; вкладка «Журнал».</div></div>
  </div></div>

  <h2>Три варианта параллельно</h2>
  <div class="card"><div class="card-b"><p>Робот ведёт <b>три стратегии одновременно</b> на одних и тех же оценках и ценах, у каждой свой виртуальный банк и свой учёт:</p>
    <ul><li><b>A0 · модель сама</b> — покупаем, если вероятность модели выше цены больше чем на порог (так проверялась первая версия; потолок перевеса 70 п.п.).</li>
    <li><b>A3 · смесь с рынком</b> — вероятность модели смешивается с ценой уровня стакана, покупаем по смешанной вероятности. В истории ROI тот же, но ставок меньше, результат устойчивее и почти нет лотерейных ставок.</li></ul>
    <ul><li><b>A4 · смесь без лотерей</b> — как A3, но только ставки с ценой от 10¢. Причина — проверка честности ниже: в самых дешёвых исходах модель ничего не добавляет, а вклад в ROI видно от 10¢. В истории: ROI +30%, ДИ [+25, +35]%, 24 ставки в день, без 50 лучших ставок +21,8% (лучший показатель из трёх).</li></ul>
    <p class="wx-note">Сравнение вариантов по закрытым ставкам — на вкладке «Робот». Любой из вариантов можно выключить в настройках робота.</p></div></div>
  <h2>Что показала проверка на истории</h2>
  <div class="card"><div class="card-b">
    <p>Апрель–сентябрь 2026, ${nf(A.events)} рынков-событий, ${nf(A.n)} ставок по $10 с реальной ленты сделок Polymarket, окно ${A.settings.rules.window_min} мин:</p>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th class="l">Вариант исполнения</th><th>Ставок</th><th>Итог</th><th>ROI</th><th>95% ДИ</th><th>Без лучших 50</th></tr></thead><tbody>
      <tr><td class="l">Прежняя версия (модель сама), окно 60 мин, с апреля</td><td>${nf(A.n)}</td><td class="${cls(A.pnl)}">${money(A.pnl, 0)}</td><td class="${cls(A.roi)}">${pc(A.roi)}</td><td>${A.ci ? pc(A.ci[0], 0) + " … " + pc(A.ci[1], 0) : "—"}</td><td>${pc(A.drop50)}</td></tr>
      <tr><td class="l"><b>Текущая версия A3 (смесь модели с рынком)</b>, окно 60 мин, с мая</td><td>${nf(A3.n)}</td><td class="${cls(A3.pnl)}">${money(A3.pnl, 0)}</td><td class="${cls(A3.roi)}">${pc(A3.roi)}</td><td>${A3.ci ? pc(A3.ci[0], 0) + " … " + pc(A3.ci[1], 0) : "—"}</td><td>${pc(A3.drop50)}</td></tr>
      <tr><td class="l"><b>Текущая версия A3</b>, окно 5 мин, с мая</td><td>${nf(B3.n)}</td><td class="${cls(B3.pnl)}">${money(B3.pnl, 0)}</td><td class="${cls(B3.roi)}">${pc(B3.roi)}</td><td>${B3.ci ? pc(B3.ci[0], 0) + " … " + pc(B3.ci[1], 0) : "—"}</td><td>${pc(B3.drop50)}</td></tr>
      <tr><td class="l">Прежняя версия, окно 5 мин, с апреля</td><td>${nf(B.n)}</td><td class="${cls(B.pnl)}">${money(B.pnl, 0)}</td><td class="${cls(B.roi)}">${pc(B.roi)}</td><td>${B.ci ? pc(B.ci[0], 0) + " … " + pc(B.ci[1], 0) : "—"}</td><td>${pc(B.drop50)}</td></tr></tbody></table></div>
    <p class="wx-note">Все шесть месяцев положительные; прибыль идёт и от YES, и от NO, но YES заметно сильнее. Подробности — на вкладке «Симуляция».</p>
    <h3>Что мы проверяли, чтобы не обмануть себя</h3>
    <ul>
      <li><b>Честное обучение:</b> каждый месяц модель обучена только на данных до его начала; цены модель не видит.</li>
      <li><b>Реальное исполнение:</b> по ленте сделок, а не по «последним ценам» (они устаревшие и дают мнимую прибыль); комиссия учтена; проверены задержка до 60 мин и проскальзывание 3¢.</li>
      <li><b>Утечка из будущего — найдена и исправлена (05.10.2026).</b> Прогноз суточной давности на вечерние часы после полуночи UTC выходит раньше, чем мы принимаем решение, только у станций Америки и только для решений 00:00 и 02:00. Признаки пересобраны так, что недоступные к моменту решения часы прогноза не используются; ROI после исправления не упал (+39% против +36%). Восточная Азия, где такой утечки быть не может, даёт +36%.</li>
      <li><b>Урок первого дня (05.10.2026, Париж).</b> Первая версия робота оценивала по METAR только до часа решения, а рынок в окне уже знал свежее наблюдение: две парижские ставки пошли против уже известного факта (рынок: 0,2¢ за «11°C», модель: 76%). Теперь оценка строится по свежему METAR и пересчитывается перед покупкой (см. шаг 5). История этого варианта проверяется отдельно, результат будет дописан сюда.</li>
      <li><b>Совпадение с живыми стаканами:</b> цены сделок на ленте совпадают с лучшими ценами стакана в пределах 1¢ в 60–79% случаев.</li>
      <li><b>Кошельки:</b> прибыль не из копирования «умных» кошельков: на тех же сделках ROI у них +34%, у остальных +31%.</li>
    </ul>
    <h3>Чего мы не знаем (честно)</h3>
    <ul>
      <li>Правила и порог подбирались на тех же месяцах, где считался результат. Настоящий экзамен — вперёд, на бумаге.</li>
      <li>Живые стаканы за прошлое не сохранились. NO-сторона зависит от наличия покупателей в стакане, а там они есть не всегда.</li>
      <li>Прибыль сильно зависит от дешёвых «лотерейных» исходов (топ-50 ставок дают заметную долю); без них ROI около +${nf((A.drop50 || 0) * 100, 0)}%.</li>
      <li>Объём ограничен тонкой ликвидностью: в окне 5 минут исполняется лишь около ${nf(100 * B.n / A.n, 0)}% ставок.</li>
      <li>Зимних данных по этим рынкам нет; рынок может стать эффективнее (активность на нём падает).</li>
    </ul></div></div>

  <h2>Насколько честна эта проверка</h2>
  <div id="honesty"><div class="card"><div class="wx-empty">Загрузка…</div></div></div>

  <h2>Чего робот не делает</h2>
  <div class="card"><div class="card-b"><ul>
    <li>Не торгует реальными деньгами: у него нет ключа кошелька и нет доступа к вашим счетам.</li>
    <li>Не торгует рынками «самая высокая температура» (там нет преимущества) и не ставит заявки-«лимитки» — только покупка по стакану.</li>
    <li>Не меняет правила сам. Меняете вы на вкладках «Робот» или «Симуляция»; каждое изменение записывается в журнал.</li>
  </ul></div></div>

  <h2>Критерии перехода к реальным деньгам</h2>
  <div class="card"><div class="card-b"><p>Реальные деньги обсуждаем, только когда бумажная торговля выполнит все условия (прогресс — на вкладке «Робот»):</p>
    <ul><li>работает не менее 21 дня и закрыто не менее 400 ставок;</li><li>ROI на бумаге после комиссии не ниже +10%, а нижняя граница 95% доверительного интервала выше нуля;</li><li>в среднем покупается не менее половины цели ставки (ликвидности хватает).</li></ul>
    <p class="wx-note">Правила заморожены 05.10.2026. Любое изменение логики (не настроек) — только отдельным датированным дополнением, чтобы проверка осталась честной.</p></div></div></div>`;
  loadHonesty();
}

async function loadHonesty() {
  const el = $("#honesty");
  if (!el) return;
  let H = {};
  try { H = await api("/api/weather/honesty"); } catch (e) { /* пусто */ }
  if (!H.nested) { el.innerHTML = `<div class="card"><div class="wx-empty">Результаты проверок появятся после запуска tools/exp_honest.py.</div></div>`; return; }
  const N = H.nested, P = H.placebo || {}, D = (H.decomposition || {}).A3 || {}, S = H.stress || [];
  const dt = Object.entries(D);
  const ge10 = dt.filter(([k]) => k !== "до 3¢" && k !== "3–10¢"), c10 = ge10.reduce((a, [, v]) => a + (v.real_roi ? v.pnl / v.real_roi : 0), 0), p10 = ge10.reduce((a, [, v]) => a + v.pnl, 0);
  const lot = dt.filter(([k]) => k === "до 3¢" || k === "3–10¢").reduce((a, [, v]) => a + v.pnl, 0);
  el.innerHTML = `<div class="card"><div class="card-b">
    <p>Оговорка «правила подбирались на тех же месяцах» — главный риск, поэтому мы сделали три проверки, которые от моих решений не зависят (данные те же: май–сентябрь 2026; результаты <b>${N.n_configs} вариантов правил</b> считались все, без отбора).</p>
    <h3>1. Правила выбираем только по прошлым месяцам</h3>
    <p>Для каждого из месяцев июль, август, сентябрь из ${N.n_configs} вариантов правил (порог перевеса, смесь с рынком, потолок, минимальная цена) выбирался лучший <b>только по предыдущим месяцам</b>, потом применялся к этому месяцу.</p>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th class="l">Месяц</th><th class="l">Выбрано по прошлым месяцам</th><th>ROI на прошлых</th><th>ROI на этом месяце</th><th>Ставок</th></tr></thead><tbody>
      ${N.nested.rows.map((r) => `<tr><td class="l">${esc(r.month)}</td><td class="l">${esc(r.config)}</td><td>${pc(r.prior_roi, 0)}</td><td class="${cls(r.oos_roi)}"><b>${pc(r.oos_roi, 0)}</b></td><td>${nf(r.n)}</td></tr>`).join("")}</tbody></table></div>
    <p class="wx-note">Итог процедуры выбора: <b>${pc(N.nested.roi)}</b> (${nf(N.nested.n)} ставок). Для сравнения за те же месяцы: всегда A3 ${pc(N.fixed_A3.roi)}, всегда A0 ${pc(N.fixed_A0.roi)}, медиана всех вариантов ${pc(N.median_config)}, лучший «задним числом» ${pc(N.oracle.roi)} (недостижимая верхняя граница), худший ${pc(N.worst)}. То есть выбор правил по прошлому <b>не раздувает</b> результат, и ни один вариант правил не уходит в минус.</p>
    <h3>2. Контрольный опыт: что будет без информации от модели</h3>
    <p>Мы перемешали вероятности модели между кандидатами (внутри месяца и часа) и пересчитали ставки той же симуляцией, ${P.A3 ? P.A3.runs : 25} раз. Если бы прибыль шла только от самой схемы покупок и от цен, ROI остался бы таким же.</p>
    <p><b>Результат:</b> настоящий ROI A3 ${pc(P.A3?.real)} против ${pc(P.A3?.placebo_mean)} без информации (95-й процентиль ${pc(P.A3?.placebo_p95)}, максимум ${pc(P.A3?.placebo_max)}). Значит, <b>примерно половина</b> прежнего плюса — не заслуга модели: часть цен на дешёвые исходы на этом рынке занижена, и такие ставки выгодны при любых вероятностях.</p>
    <h3>3. Откуда прибыль: разложение по цене входа (вариант A3)</h3>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th class="l">Цена входа</th><th>Ставок</th><th>Итог</th><th>Настоящий ROI</th><th>ROI без информации</th><th>Вклад модели</th></tr></thead><tbody>
      ${dt.map(([k, v]) => `<tr><td class="l">${esc(k)}</td><td>${nf(v.n)}</td><td class="${cls(v.pnl)}">${money(v.pnl, 0)}</td><td class="${cls(v.real_roi)}">${pc(v.real_roi, 0)}</td><td>${isNum(v.placebo_roi) ? pc(v.placebo_roi, 0) : "—"}</td><td class="${cls(v.real_roi - v.placebo_roi)}"><b>${isNum(v.placebo_roi) ? pc(v.real_roi - v.placebo_roi, 0) : "—"}</b></td></tr>`).join("")}</tbody></table></div>
    <p class="wx-note"><b>Как читать.</b> В самых дешёвых исходах (до 3¢) модель <b>ничего не добавляет</b>: случайные вероятности дают даже больше, потому что прибыль там держится на нескольких редких выигрышах и на занижении таких цен рынком. Настоящий вклад модели виден от 10¢: например, при цене 30–70¢ ROI ${pc(D["30–70¢"]?.real_roi, 0)} против ${pc(D["30–70¢"]?.placebo_roi, 0)} без информации. Ставки от 10¢ вместе дали ${money(p10, 0)} при ROI около ${pc(c10 ? p10 / c10 : null, 0)}, а ставки до 10¢ — ${money(lot, 0)}: эта часть держится на нескольких везениях, и надёжной её считать нельзя. В «Симуляции» есть пресет «Без лотерей (цена от 10¢)».</p>
    <h3>4. Стресс исполнения (A3)</h3>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th class="l">Задержка до покупки</th><th>Проскальзывание</th><th>Ставок</th><th>ROI</th><th>95% ДИ</th></tr></thead><tbody>
      ${S.map((x) => `<tr><td class="l">${x.latency} мин</td><td>${x.slip}¢</td><td>${nf(x.n)}</td><td class="${cls(x.roi)}">${pc(x.roi)}</td><td>${x.ci ? pc(x.ci[0], 0) + " … " + pc(x.ci[1], 0) : "—"}</td></tr>`).join("")}</tbody></table></div>
    <p class="wx-note">При задержке до часа и проскальзывании 2¢ ROI остаётся около +30%.</p>
    <div class="wx-warn"><b>Итог честно.</b> Заголовочные +36% завышают вклад модели: около половины — структура рынка (дешёвые исходы), вклад самой модели оценивается порядка +20–25 п.п. ROI на ставках от 10¢ (около +30% против примерно +5% без информации). Выбор правил по прошлому и стресс исполнения не раздувают результат. Что осталось неизвестным: период только 5–6 месяцев одного режима рынка, живых стаканов за прошлое нет. Окончательный ответ даёт бумажный тест вперёд.</div>
  </div></div>`;
}

/* ======================================================================= ЖУРНАЛ */
async function pageJournal() {
  let lv = store.get("wx_j_lv", "");
  const LV = { "": "Все", buy: "Покупки", settle: "Итоги", info: "Оценки и служебное", "warn,error": "Предупреждения и ошибки" };
  APP.innerHTML = `<div class="page-head"><div><h1>Журнал робота</h1><div class="sub">Каждая оценка модели, покупка, закрытие, предупреждение и изменение настроек. Обновляется само.</div></div></div>
    <div class="toolbar"><div class="seg" id="jn-seg">${Object.entries(LV).map(([k, v]) => `<button data-l="${k}">${v}</button>`).join("")}</div><span class="muted" id="jn-info"></span></div>
    <div class="card"><div class="card-b tbl-wrap" id="jn-tbl"></div></div>`;
  async function load() {
    $$("#jn-seg button").forEach((b) => b.classList.toggle("active", b.dataset.l === lv));
    const d = await api("/api/weather/journal?limit=400" + (lv ? "&level=" + lv : ""));
    $("#jn-info").textContent = `записей на экране: ${d.rows.length}`;
    $("#jn-tbl").innerHTML = d.rows.length ? `<table class="tbl wx-journal"><thead><tr><th class="l">Время</th><th class="l">Тип</th><th class="l">Запись</th></tr></thead><tbody>
      ${d.rows.map((r) => `<tr><td class="l" style="white-space:nowrap">${new Date(r.ts * 1000).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })}</td><td class="l wx-lv-${esc(r.level)}">${esc(r.kind)}</td><td class="txt wx-lv-${esc(r.level)}">${esc(r.text)}</td></tr>`).join("")}</tbody></table>` : `<div class="wx-empty">Записей нет.</div>`;
  }
  $$("#jn-seg button").forEach((b) => (b.onclick = () => { lv = b.dataset.l; store.set("wx_j_lv", lv); load(); }));
  await load(); every(load, 15000);
}

/* ======================================================================= маршрутизация */
const ROUTES = { robot: pageRobot, bets: pageBets, sim: pageSim, rules: pageRules, journal: pageJournal };
async function route() {
  TIMERS.forEach(clearInterval); TIMERS = []; Object.values(CHARTS).forEach((c) => c.destroy()); CHARTS = {};
  const r = (location.hash.replace(/^#\/?/, "") || "robot").split("?")[0], page = ROUTES[r] || pageRobot;
  $$("#tabs a").forEach((a) => a.classList.toggle("active", a.dataset.tab === (ROUTES[r] ? r : "robot")));
  APP.innerHTML = `<div class="loading">Загрузка…</div>`;
  try { await page(); } catch (e) { APP.innerHTML = `<div class="card"><div class="wx-empty">Не удалось загрузить: ${esc(e.message)}</div></div>`; console.error(e); }
  window.scrollTo(0, 0);
}
addEventListener("hashchange", route);
refreshBadge(); setInterval(() => { if (!document.hidden) refreshBadge(); }, 20000);
route();
