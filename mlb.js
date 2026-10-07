"use strict";

/* ================= утилиты ================= */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const app = $("#app");
const TZ = "Europe/Minsk";                       // все времена на сайте — по Минску
for (const f of ["toLocaleString", "toLocaleDateString", "toLocaleTimeString"]) {
  const orig = Date.prototype[f];
  Date.prototype[f] = function (loc, opt) { return orig.call(this, loc, { timeZone: TZ, ...(opt || {}) }); };
}
{ // сервер иногда отдаёт NaN/Infinity (не валидный JSON) — читаем их как null, иначе окно матча не открывается
  Response.prototype.json = async function () {
    const t = await this.text();
    try { return JSON.parse(t); } catch (e) { return JSON.parse(t.replace(/([:\[,]\s*)-?(?:NaN|Infinity)(?=\s*[,}\]])/g, "$1null")); }
  };
}
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const isNum = (v) => v !== null && v !== undefined && !Number.isNaN(v);
const pct = (p, d = 0) => (isNum(p) ? (100 * p).toFixed(d) + "%" : "—");
const f1 = (v, d = 1) => (isNum(v) ? Number(v).toFixed(d) : "—");
const sgn = (v, d = 1) => (isNum(v) ? (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(d) : "—");
const money = (v, d = 0) => (isNum(v) ? (v > 0 ? "+$" : v < 0 ? "−$" : "$") + Math.abs(v).toLocaleString("ru-RU", { maximumFractionDigits: d, minimumFractionDigits: d }) : "—");
const cls = (v) => (isNum(v) ? (v > 0 ? "good" : v < 0 ? "bad" : "") : "");
const MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
const MONTHS_SHORT = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
/* единый русский формат: дата 04.10.2026, время 04:57, дата и время 04.10.2026 04:57 (по Минску) */
const WD = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
const WD_SHORT = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
const _dtf = new Intl.DateTimeFormat("ru-RU", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" });
const _wdi = { "вс": 0, "пн": 1, "вт": 2, "ср": 3, "чт": 4, "пт": 5, "сб": 6 };
const ruParts = (d) => { const o = {}; for (const p of _dtf.formatToParts(d)) o[p.type] = p.value; o.wd = _wdi[String(o.weekday).replace(".", "").toLowerCase()]; return o; };
const ruDate = (d) => { const p = ruParts(d); return `${p.day}.${p.month}.${p.year}`; };
const ruDateS = (d) => { const p = ruParts(d); return `${p.day}.${p.month}.${p.year.slice(2)}`; };
const ruMonthY = (d) => { const p = ruParts(d); return `${p.month}.${p.year}`; };
const ruTime = (d) => { const p = ruParts(d); return `${p.hour}:${p.minute}`; };
const ruDT = (d) => `${ruDate(d)} ${ruTime(d)}`;
const ruWd = (d, long) => (long ? WD : WD_SHORT)[ruParts(d).wd] || "";
const ruTxt = (s) => String(s ?? "").replace(/(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}:\d{2})(?::\d{2})?)?/g, (m, y, mo, d, hm) => `${d}.${mo}.${y}${hm ? " " + hm : ""}`);   // даты в текстах журнала (ISO → 04.10.2026 14:40)
const dayTitle = (d) => `${WD[new Date(d + "T12:00:00Z").getUTCDay()]}, ${dateShort(d)}`;
const dateShort = (d) => `${String(d).slice(8, 10)}.${String(d).slice(5, 7)}.${String(d).slice(0, 4)}`;
const tsDate = (t) => ruDT(new Date(t * 1000));
const seasonLabel = (s) => (/\/nfl\/?$/.test(location.pathname) ? String(s) : `${s}-${String((s + 1) % 100).padStart(2, "0")}`);
const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
function parseUtc(s) {
  if (!s) return null;
  const d = new Date(/Z$|[+-]\d\d:?\d\d$/.test(s) ? s.replace(/T(\d\d:\d\d)Z$/, "T$1:00Z") : s + "Z");
  return Number.isNaN(d.getTime()) ? null : d;
}
const startTime = (utc) => { const d = parseUtc(utc); return d ? ruTime(d) : ""; };

function pairColors(a, h) {
  let ca = teamColor(a), ch = teamColor(h);
  const dist = (x, y) => { const p = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)); const [r1, g1, b1] = p(x), [r2, g2, b2] = p(y); return Math.hypot(r1 - r2, g1 - g2, b1 - b2); };
  if (dist(ca, ch) < 90) ca = "#64748b";
  return [ca, ch];
}
/* ================= графики ================= */
let charts = [];
function clearCharts() { charts.forEach((c) => c.destroy()); charts = []; }
function chart(canvas, cfg) {
  if (!window.Chart || !canvas) return null;
  Chart.defaults.font.family = "Inter, system-ui, sans-serif";
  Chart.defaults.color = cssVar("--muted");
  Chart.defaults.borderColor = cssVar("--line");
  const c = new Chart(canvas, cfg);
  charts.push(c);
  return c;
}
const tooltipBase = () => ({ backgroundColor: cssVar("--card-2"), titleColor: cssVar("--text"), bodyColor: cssVar("--text"), borderColor: cssVar("--line-2"), borderWidth: 1, padding: 10 });

function table({ cols, rows, foot, onRow, id, sortKey, sortDir = -1, rowClass, page }) {
  const tid = id || "t" + Math.random().toString(36).slice(2, 8);
  const state = { key: sortKey, dir: sortDir };
  let shown = page || Infinity;                  // page — сколько строк показать сразу, дальше «Показать ещё»
  const TXT = new WeakMap();                     // текст ячеек для фильтров (ux.js) — по всем строкам, не только показанным
  const text = (x) => { let t = TXT.get(x); if (!t) { const i = rows.indexOf(x); t = cols.map((c) => (window.ST ? ST.strip(c.fmt ? c.fmt(x, i) : esc(x[c.key] ?? "—")) : "")); TXT.set(x, t); } return t; };
  const render = () => {
    const F = window.ST ? ST.data({ id: tid, cols, rows, text, rerender: () => render(),
      sort: (i, dir) => { if (cols[i].nosort) return; state.key = cols[i].key; state.dir = dir; render(); } }) : null;
    let r = F ? F.rows.slice() : rows.slice();
    if (state.key) {
      const c = cols.find((x) => x.key === state.key);
      const val = c?.sort || ((x) => x[state.key]);
      r.sort((a, b) => {
        const va = val(a), vb = val(b);
        if (!isNum(va) && !isNum(vb)) return 0;
        if (!isNum(va)) return 1;
        if (!isNum(vb)) return -1;
        return typeof va === "string" ? state.dir * va.localeCompare(vb) : state.dir * (va - vb);
      });
    }
    const head = cols.map((c) => `<th class="${c.l ? "l" : ""} ${c.sep ? "sep" : ""} ${state.key === c.key ? "sorted" : ""}" data-k="${c.key}" title="${esc(c.title || "")}">${c.label}${state.key === c.key ? (state.dir > 0 ? " ▲" : " ▼") : ""}</th>`).join("");
    const total = r.length;
    r = r.slice(0, shown);
    const body = r.map((x, i) => `<tr class="${onRow ? "click" : ""} ${rowClass ? rowClass(x) : ""}" data-i="${rows.indexOf(x)}">${cols.map((c) => `<td class="${c.l ? "l" : ""} ${c.sep ? "sep" : ""} ${c.cls ? c.cls(x) : ""}">${c.fmt ? c.fmt(x, i) : esc(x[c.key] ?? "—")}</td>`).join("")}</tr>`).join("");
    const ft = foot ? `<tfoot><tr>${cols.map((c) => `<td class="${c.l ? "l" : ""} ${c.sep ? "sep" : ""}">${foot[c.key] ?? ""}</td>`).join("")}</tr></tfoot>` : "";
    const el = document.getElementById(tid);
    if (!el) return;
    const empty = !r.length && rows.length ? `<tr class="st-empty"><td colspan="${cols.length}">Под фильтры ничего не подходит</td></tr>` : "";
    const more = total > r.length ? `<div class="tbl-more"><button class="chip">Показать ещё (${(total - r.length).toLocaleString("ru-RU")})</button></div>` : "";
    el.innerHTML = `<table class="tbl" data-st-own="1"><thead><tr>${head}</tr></thead><tbody>${body}${empty}</tbody>${ft}</table>${more}`;
    el.querySelector(".tbl-more button")?.addEventListener("click", () => { shown += page || 300; render(); });
    if (F) ST.decorate(el, F.ctx);
    $$("th", el).forEach((th) => th.addEventListener("click", (e) => {
      if (e.target.closest(".st-fbtn")) return;
      const k = th.dataset.k;
      if (!cols.find((c) => c.key === k)?.nosort) {
        state.dir = state.key === k ? -state.dir : -1;
        state.key = k;
        render();
      }
    }));
    if (onRow) $$("tbody tr[data-i]", el).forEach((tr) => tr.addEventListener("click", () => onRow(rows[+tr.dataset.i])));
  };
  return { html: `<div class="tbl-wrap" id="${tid}"></div>`, render };
}

function parseHash() {
  const h = location.hash.replace(/^#\/?/, "") || "games";
  const [path, qs] = h.split("?");
  const parts = path.split("/");
  const q = Object.fromEntries(new URLSearchParams(qs || ""));
  return { view: parts[0], id: parts[1], q };
}
function setQuery(view, q) {
  const s = new URLSearchParams(Object.entries(q).filter(([, v]) => v !== "" && v !== null && v !== undefined && v !== false)).toString();
  history.replaceState(null, "", `#/${view}${s ? "?" + s : ""}`);
}
function miniBar(label, pHome, ca, ch) {
  if (!isNum(pHome)) return "";
  return `<div class="pbar"><span>${label}</span><div class="t"><i style="width:${100 * pHome}%;background:${ch}"></i><i style="left:auto;right:0;width:${100 * (1 - pHome)}%;background:${ca}"></i></div><span class="v" title="шанс хозяев">${pct(pHome)}</span></div>`;
}


/* ================= MLB: свои части (остальное — копия общих кусков app.js) ================= */
document.documentElement.classList.add("sport-mlb");
const APIP = "/api/mlb/";
const SRC_NAMES = { model: "SHARP", glicko: "Глико-2", mix: "SHARP+Глико" };
const PK = { model: "mp", glicko: "gp", mix: "xp" };
let SRC = "model";
try { SRC = localStorage.getItem("src") || "model"; } catch (e) { /* по умолчанию SHARP */ }
if (!SRC_NAMES[SRC]) SRC = "model";
const srcName = () => SRC_NAMES[SRC];
let META = { teams: [], seasons: [] };
const TEAM = {};
const COLORS = {
  ATH: "#2B7A4B", OAK: "#2B7A4B", ATL: "#CE1141", AZ: "#A71930", BAL: "#DF4601", BOS: "#BD3039", CHC: "#2A5BB5", CIN: "#C6011F", CLE: "#E31937", COL: "#6F4AA0",
  CWS: "#8A8D8F", DET: "#FA4616", HOU: "#EB6E1F", KC: "#2E78C7", LAA: "#BA0021", LAD: "#1E6BC4", MIA: "#00A3E0", MIL: "#FFC52F", MIN: "#D31145", NYM: "#FF5910",
  NYY: "#3A5BA9", PHI: "#E81828", PIT: "#FDB827", SD: "#9D7F52", SEA: "#00A5A8", SF: "#FD5A1E", STL: "#C41E3A", TB: "#8FBCE6", TEX: "#2E6DD6", TOR: "#2F74D0", WSH: "#AB0003",
};
const teamColor = (t) => COLORS[t] || "#64748b";
const logoUrl = (t) => (TEAM[t] ? `/img/mlb/logo/${TEAM[t].team_id}` : "");
const logo = (t, size = "") => `<img class="logo ${size}" src="${logoUrl(t)}" alt="${esc(t)}" loading="lazy" onerror="this.style.visibility='hidden'">`;
const teamName = (t) => TEAM[t]?.name || t;
const shortName = (t) => { const n = teamName(t); return /^(Boston|Chicago) (Red|White) Sox$/.test(n) ? n.split(" ").slice(-2).join(" ") : n.split(" ").slice(-1)[0]; };
const MLB_MONTHS = { "03": "март", "04": "апрель", "05": "май", "06": "июнь", "07": "июль", "08": "август", "09": "сентябрь", "10": "октябрь" };

const cache = new Map();
async function api(path, bySrc) {
  if (bySrc) path += (path.includes("?") ? "&" : "?") + "src=" + SRC;
  if (cache.has(path)) return cache.get(path);
  const r = await fetch(APIP + path);
  if (!r.ok) throw new Error((await r.text()) || r.statusText);
  const j = await r.json();
  cache.set(path, j);
  return j;
}
const rnd1 = (v) => (isNum(v) ? v.toFixed(1) : "—");

/* ---------- Матчи ---------- */
function gameCard(g) {
  const mp = g[PK[SRC]], bet = g.bet && g.bet[SRC];
  const played = isNum(g.hp);
  const hw = played && g.hp > g.ap;
  const [ca, ch] = pairColors(g.away, g.home);
  const tags = [];
  if (played) {
    const right = (mp > 0.5) === hw;
    tags.push(`<span class="pill ${right ? "good" : "bad"}">${right ? "✓ модель угадала" : "✗ модель ошиблась"}</span>`);
  }
  if (isNum(g.p24) && Math.abs(mp - g.p24) >= 0.05)
    tags.push(`<span class="pill acc" title="${srcName()} против Polymarket за 24 ч">Δ ${sgn(100 * (mp - g.p24), 0)} п.п.</span>`);
  if (bet) tags.push(`<span class="pill ${cls(bet.pnl) || "neutral"}" title="проверка: заявка ${bet.bid.toFixed(2)}, исполнено ${bet.sh} акц. на $${bet.cost}">Ставка на ${bet.w === 1 ? g.home : g.away}: ${money(bet.pnl, 2)}</span>`);
  return `<a class="card gcard" href="#/game/${g.id}">
    <div class="row">
      <div class="gteam ${played && !hw ? "lost" : ""}">${logo(g.home, "md")}<div><div class="abbr">${g.home}</div><div class="nm">${esc(shortName(g.home))}</div></div></div>
      <div class="gscore">
        <div class="s">${played ? `<span class="${hw ? "w" : "l"}">${g.hp}</span><span class="faint"> : </span><span class="${hw ? "l" : "w"}">${g.ap}</span>` : startTime(g.t)}</div>
        <div class="e">ожидали ${rnd1(g.rh)}:${rnd1(g.ra)}</div>
      </div>
      <div class="gteam r ${played && hw ? "lost" : ""}">${logo(g.away, "md")}<div><div class="abbr">${g.away}</div><div class="nm">${esc(shortName(g.away))}</div></div></div>
    </div>
    <div class="pbars">
      ${miniBar(srcName(), mp, ca, ch)}
      ${miniBar("Рынок за 24 ч", g.p24, ca, ch)}
      ${miniBar("Рынок, закрытие", g.pc, ca, ch)}
    </div>
    ${tags.length ? `<div class="gmeta"><div class="tag-row">${tags.join("")}</div></div>` : ""}
  </a>`;
}

async function viewGames(q) {
  const D = await api("games");
  const season = +(q.season || META.seasons[0]);
  const games = D.games.filter((g) => g.date.startsWith(String(season)));
  const months = [...new Set(games.map((g) => g.date.slice(0, 7)))];
  const month = q.m && months.includes(q.m) ? q.m : months[months.length - 1];
  const S = (D.summary[season] || {})[SRC] || {};
  const mpOf = (g) => g[PK[SRC]];
  const kpi = (l, v, s) => `<div class="card kpi"><div class="l">${l}</div><div class="v num">${v}</div>${s ? `<div class="s">${s}</div>` : ""}</div>`;
  const cmpLL = (key, name) => (isNum(S[key + "_ll"]) ? kpi(name, f1(S[key + "_ll"], 3), `${srcName()} на тех же матчах: <b class="${S[key + "_ll_model"] <= S[key + "_ll"] ? "good" : "bad"}">${f1(S[key + "_ll_model"], 3)}</b>`) : "");

  app.innerHTML = `
  <div class="page-head">
    <div><h1>Матчи ${season}</h1><div class="sub">Прогноз источника «${srcName()}» за сутки до матча (проектные составы) против цены Polymarket. Источник переключается вверху справа. Сезоны 2025–26 — экзамен: модель обучена только на 2017–2024.</div></div>
    <div class="chips" id="seasons">${META.seasons.map((s) => `<button class="chip ${s === season ? "active" : ""}" data-s="${s}">${s}</button>`).join("")}</div>
  </div>
  <div class="card" style="margin-bottom:16px">
    <div class="card-h"><h3>Как модель отработала сезон</h3><span class="muted">log loss — ошибка вероятностей, меньше — лучше</span></div>
    <div class="card-b grid g2" style="align-items:center">
      <div class="kpis" style="margin:0">
        ${kpi("Угадано победителей", pct(S.model_acc, 1), `${S.games || 0} матчей`)}
        ${kpi("Ошибка: " + srcName(), f1(S.model_ll, 3), "log loss")}
        ${cmpLL("pm_24h", "Polymarket за 24 ч")}
        ${cmpLL("pm_12h", "Polymarket за 12 ч")}
        ${cmpLL("pm_start", "Polymarket, закрытие")}
      </div>
      <div><div class="chart-box sm"><canvas id="calib"></canvas></div><div class="hint">Калибровка: если модель говорит «60%», хозяева должны выигрывать ~60% таких матчей. Точки на диагонали — честные вероятности.</div></div>
    </div>
  </div>
  <div class="toolbar">
    <select class="select" id="team"><option value="">Все команды</option>${META.teams.filter((t) => t.team !== "OAK").sort((a, b) => a.name.localeCompare(b.name)).map((t) => `<option value="${t.team}" ${q.team === t.team ? "selected" : ""}>${esc(t.name)}</option>`).join("")}</select>
    <label class="toggle"><input type="checkbox" id="f-div" ${q.div ? "checked" : ""}> расхождение ≥ 5 п.п.</label>
    <label class="toggle"><input type="checkbox" id="f-miss" ${q.miss ? "checked" : ""}> модель ошиблась</label>
    <label class="toggle"><input type="checkbox" id="f-bet" ${q.bet ? "checked" : ""}> были ставки</label>
  </div>
  <div class="chips" id="months" style="margin-bottom:4px">${q.team || q.div || q.miss || q.bet ? "" : months.map((m) => `<button class="chip ${m === month ? "active" : ""}" data-m="${m}">${MLB_MONTHS[m.slice(5)] || m.slice(5)}</button>`).join("")}</div>
  <div id="list"></div>`;

  let r = games;
  if (q.team) r = r.filter((g) => g.home === q.team || g.away === q.team);
  if (q.div) r = r.filter((g) => isNum(g.p24) && Math.abs(mpOf(g) - g.p24) >= 0.05);
  if (q.miss) r = r.filter((g) => isNum(g.hp) && (mpOf(g) > 0.5) !== (g.hp > g.ap));
  if (q.bet) r = r.filter((g) => g.bet && g.bet[SRC]);
  if (!(q.team || q.div || q.miss || q.bet)) r = r.filter((g) => g.date.startsWith(month));
  const byDay = {};
  r.forEach((g) => (byDay[g.date] = byDay[g.date] || []).push(g));
  const days = Object.keys(byDay).sort().reverse();
  const nW = (n) => (n === 1 ? "матч" : n < 5 ? "матча" : "матчей");
  $("#list").innerHTML = days.length ? days.map((d) => `<section class="day"><div class="day-h"><b>${dayTitle(d)}</b><span>${byDay[d].length} ${nW(byDay[d].length)}</span></div>
    <div class="games">${byDay[d].map(gameCard).join("")}</div></section>`).join("") : `<div class="empty">Нет матчей по этим фильтрам</div>`;

  const upd = (patch) => { setQuery("games", { season, m: q.m, team: q.team, div: q.div, miss: q.miss, bet: q.bet, ...patch }); route(); };
  $$("#seasons .chip").forEach((b) => b.onclick = () => upd({ season: b.dataset.s, m: "" }));
  $$("#months .chip").forEach((b) => b.onclick = () => upd({ m: b.dataset.m }));
  $("#team").onchange = (e) => upd({ team: e.target.value });
  for (const k of ["div", "miss", "bet"]) $(`#f-${k}`).onchange = (e) => upd({ [k]: e.target.checked ? 1 : "" });

  if (S.calibration) chart($("#calib"), {
    type: "scatter",
    data: { datasets: [
      { label: srcName(), data: S.calibration.map((b) => ({ x: b.p, y: b.y, n: b.n })), pointRadius: (c) => 3 + Math.sqrt(c.raw?.n || 1) / 3, backgroundColor: cssVar("--accent") },
      { type: "line", label: "Идеал", data: [{ x: 0.2, y: 0.2 }, { x: 0.8, y: 0.8 }], borderColor: cssVar("--line-2"), borderDash: [4, 4], pointRadius: 0 },
    ] },
    options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { ...tooltipBase(), callbacks: { label: (c) => c.raw.n ? `прогноз ${pct(c.raw.x)} → факт ${pct(c.raw.y)} (${c.raw.n} матчей)` : "" } } },
      scales: { x: { min: 0.2, max: 0.8, title: { display: true, text: "прогноз модели: шанс хозяев" }, ticks: { callback: (v) => pct(v) } }, y: { min: 0.2, max: 0.8, title: { display: true, text: "выиграли хозяева" }, ticks: { callback: (v) => pct(v) } } } },
  });
}

/* ---------- Матч ---------- */
async function viewGame(id) {
  const D = await api("games");
  const g = D.games.find((x) => String(x.id) === String(id));
  if (!g) { app.innerHTML = `<div class="empty">Матч не найден</div>`; return; }
  const played = isNum(g.hp), hw = played && g.hp > g.ap;
  const [ca, ch] = pairColors(g.away, g.home);
  const kpi = (l, v, s) => `<div class="card kpi"><div class="l">${l}</div><div class="v num">${v}</div>${s ? `<div class="s">${s}</div>` : ""}</div>`;
  const tip = parseUtc(g.t);
  const mp = g[PK[SRC]];
  const edge = isNum(g.p24) ? mp - g.p24 : null;
  const bet = g.bet && g.bet[SRC];
  app.innerHTML = `
  <div class="page-head"><div><h1>${esc(teamName(g.home))} — ${esc(teamName(g.away))}</h1><div class="sub">${tip ? ruWd(tip, true) + ", " + ruDT(tip) + " (по Минску) · " : ""}хозяева слева</div></div>
    <div class="chips"><a class="chip" href="#/games?season=${g.date.slice(0, 4)}&m=${g.date.slice(0, 7)}">← к матчам</a></div></div>
  <div class="card" style="margin-bottom:16px"><div class="card-b">
    <div class="gcard" style="padding:6px 4px"><div class="row">
      <div class="gteam ${played && !hw ? "lost" : ""}">${logo(g.home, "lg")}<div><div class="abbr">${g.home}</div><div class="nm">${esc(teamName(g.home))}</div></div></div>
      <div class="gscore"><div class="s">${played ? `<span class="${hw ? "w" : "l"}">${g.hp}</span><span class="faint"> : </span><span class="${hw ? "l" : "w"}">${g.ap}</span>` : startTime(g.t)}</div><div class="e">ожидали ${rnd1(g.rh)}:${rnd1(g.ra)}</div></div>
      <div class="gteam r ${played && hw ? "lost" : ""}">${logo(g.away, "lg")}<div><div class="abbr">${g.away}</div><div class="nm">${esc(teamName(g.away))}</div></div></div>
    </div></div></div></div>
  <div class="kpis">
    ${kpi(srcName(), pct(mp, 1), "шанс хозяев")}
    ${SRC !== "model" ? kpi("SHARP", pct(g.mp, 1), "шанс хозяев") : ""}${SRC !== "glicko" ? kpi("Глико-2", pct(g.gp, 1), "шанс хозяев") : ""}${SRC !== "mix" ? kpi("SHARP+Глико", pct(g.xp, 1), "шанс хозяев") : ""}
    ${kpi("Polymarket за 24 ч", pct(g.p24, 1), isNum(edge) ? `расхождение <b class="${Math.abs(edge) >= 0.03 ? "acc" : ""}">${sgn(100 * edge, 1)} п.п.</b>` : "")}
    ${kpi("Polymarket за 12 ч", pct(g.p12, 1))}
    ${kpi("Polymarket, закрытие", pct(g.pc, 1))}
    ${kpi("Оборот рынка", "$" + (g.vol || 0).toLocaleString("ru-RU"))}
  </div>
  <div class="card" style="margin-bottom:16px"><div class="card-h"><h3>Вероятность победы хозяев</h3></div><div class="card-b pbars">
    ${miniBar("SHARP", g.mp, ca, ch)}${miniBar("Глико-2", g.gp, ca, ch)}${miniBar("SHARP+Глико", g.xp, ca, ch)}${miniBar("Рынок за 24 ч", g.p24, ca, ch)}${miniBar("Рынок за 12 ч", g.p12, ca, ch)}${miniBar("Рынок, закрытие", g.pc, ca, ch)}</div></div>
  <div class="card"><div class="card-h"><h3>Ставка проверки</h3><span class="muted">${srcName()} · вход за 24 ч, заявка «середина − 1 ц», исполнение по ленте сделок</span></div><div class="card-b">${bet ?
    `<div class="kpis" style="margin:0">${kpi("Сторона", bet.w === 1 ? g.home + " (хозяева)" : g.away + " (гости)")}${kpi("Заявка", bet.bid.toFixed(2), "исполнено " + bet.sh + " акц. на $" + bet.cost)}
      ${kpi("Итог", `<span class="${cls(bet.pnl)}">${money(bet.pnl, 2)}</span>`, bet.win ? "ставка выиграла" : "ставка проиграла")}${kpi("CLV", `<span class="${cls(bet.clv)}">${sgn(bet.clv, 1)} п.п.</span>`, "закрытие минус вход")}</div>`
    : `<div class="muted">По этому матчу (источник «${srcName()}») ставки не было: перевес меньше порога 3 п.п., заявка не исполнилась${SRC === "mix" ? " или модели не согласны" : ""}.</div>`}</div></div>`;
}

/* ---------- Ставки (проверка на истории, банк как в НХЛ) ---------- */
// Банк как в НХЛ: ставка = % от «расчётного банка» (Келли или по разнице), расчётный банк пересчитывается при ±step %, не больше maxUsd на ставку.
// Исполнение — по реальной ленте сделок под размер ставки: посчитано для $10/30/100/300/1000, между точками линейно по сумме.
// два набора, как в НХЛ: настройки РОБОТА (по ним НХЛ считает бумажные и реальные ставки; читаем с сервера, чтобы не расходились) и настройки «симуляции» на сайте НХЛ
const SIM_PRESET = { start: 5000, min: 0.5, max: 1, flat: 0.75, step: 25, lo: 3, hi: 12, maxUsd: 150, method: "kelly", kf: 0.3, trust: 0.6 };
let ROBOT_PRESET = { start: 250, min: 1, max: 3, flat: 0.75, step: 25, lo: 3, hi: 12, maxUsd: 7, method: "user", kf: 0.3, trust: 0.6 };
let BANK_DEFAULT = ROBOT_PRESET;
const BANK_KEY = "bankcfg_mlb2";
const METHODS = { diff: "по разнице с ценой (п.п.)", user: "разница × 1.5·цена^0.585", kelly: "Келли (рекомендую)" };
const SIZES = [3, 5, 10, 30, 100, 300, 1000];
const MSTRATS = {
  hold: { name: "Основная: заявка и держать", rule: "За 24 ч до матча, если перевес (0,6 × разница прогноза и цены) ≥ 3 п.п., ставим <b>свою заявку</b> на цент ниже середины и <b>держим до конца матча</b>. Исполняется только тем объёмом, который реально продали ниже нашей цены." },
  chase: { name: "Догонять цену", rule: "Тот же сигнал и та же заявка, но если она исполнилась не полностью — за <b>18, 12 и 6 ч</b> до матча неисполненный остаток <b>переставляем на текущую середину − 1 ¢</b>, пока перевес по текущей цене ещё ≥ 3 п.п. Держим до конца матча." },
  market: { name: "По рынку + догонка", rule: "Сильный сигнал — <b>перевес ≥ 5 п.п.</b> — покупаем <b>сразу по цене продавца</b> плюс комиссия Polymarket 0.05·p·(1−p) на акцию. Берём только тот объём, который за 3 ч после решения реально покупали (не дороже первой покупки + 2 ¢). Слабый (3–5 п.п.) — заявка на цент ниже середины с догонкой за 18/12/6 ч." },
  book: { name: "По стакану (все сигналы)", rule: "Каждый сигнал без исключений за 24 ч покупаем <b>сразу по цене продавца</b>: идём по реальным покупкам нашей стороны за 3 ч после решения и забираем их объём по их ценам (не дороже первой + 2 ¢) плюс комиссия 0.05·p·(1−p). Если за 3 ч никто не покупал — ставки нет. Объём не «бесконечный», как в упрощённых проверках." },
};
function bankCfg() {
  try { return { ...BANK_DEFAULT, ...JSON.parse(localStorage.getItem(BANK_KEY) || "{}") }; } catch (e) { return { ...BANK_DEFAULT }; }
}
function saveBankCfg(c) { try { localStorage.setItem(BANK_KEY, JSON.stringify(c)); } catch (e) { /* без сохранения */ } }
function atSize(vals, S) {                         // прибыль / потрачено под ставку S: линейно между точками, ниже первой — пропорционально, выше последней — не растёт
  if (S <= SIZES[0]) return (vals[0] * S) / SIZES[0];
  for (let k = 1; k < SIZES.length; k++) if (S <= SIZES[k]) return vals[k - 1] + ((S - SIZES[k - 1]) / (SIZES[k] - SIZES[k - 1])) * (vals[k] - vals[k - 1]);
  return vals[SIZES.length - 1];
}
function stakePct(b, c) {
  const m = b.m, p = b.p, q = b.tk ? Math.min(m + 0.025, 0.99) : b.bid;   // тейкер: цену входа на момент решения оцениваем «середина + 2.5 ц»
  if (c.method === "kelly") {
    const edge = c.trust * (p - m) - (q - m);                      // своя оценка = цена + доверие × (модель − цена), минус то, что мы доплачиваем заявкой
    const f = (100 * c.kf * Math.max(edge, 0)) / (1 - q);
    return Math.min(Math.max(f, c.min), c.max);
  }
  const z = Math.min(Math.max((100 * Math.abs(p - m) - c.lo) / (c.hi - c.lo), 0), 1);
  const lin = c.min + (c.max - c.min) * z;
  return c.method === "user" ? Math.min(lin * 1.5 * Math.pow(q, 0.585), 5) : lin;
}
function runBank(bets, c, flat = false) {
  const ev = [];
  bets.forEach((b) => { ev.push({ t: b.open_t, k: 1, b }); ev.push({ t: Math.max(b.close_t, b.open_t + 1), k: 0, b }); });
  ev.sort((a, b) => a.t - b.t || a.k - b.k);
  let bank = c.start, ref = c.ref0 ?? c.start, peak = c.start, dd = 0, ddp = 0, staked = 0;
  const curve = [{ x: (ev[0]?.t || 0) * 1000, y: bank }];
  const out = new Map();
  for (const e of ev) {
    if (e.k === 1) {
      const pct = flat ? c.flat : stakePct(e.b, c);
      out.set(e.b, { pct, ref, stake: Math.min((ref * pct) / 100, c.maxUsd > 0 ? c.maxUsd : Infinity) });
    } else {
      const r = out.get(e.b);
      r.pnl = atSize(e.b.ps, r.stake); r.cost = atSize(e.b.cs, r.stake);
      bank += r.pnl; staked += r.cost; r.bank = bank;
      if (bank >= ref * (1 + c.step / 100) || bank <= ref * (1 - c.step / 100)) ref = bank;
      peak = Math.max(peak, bank); dd = Math.min(dd, bank - peak); ddp = Math.min(ddp, (bank - peak) / peak);
      curve.push({ x: e.t * 1000, y: bank });
    }
  }
  return { res: out, bank, curve, dd, ddp, start: c.start, ref, staked };
}

async function viewBets(q) {
  const sel = (q.s || "hold").split(",").filter((k) => MSTRATS[k]);
  if (!sel.length) sel.push("hold");
  const [O, ...Ds] = await Promise.all([api("overview", 1), ...sel.map((k) => api("bets?strat=" + k, 1))]);
  const D = { bets: Ds.flatMap((d, i) => d.bets.map((b) => ({ ...b, st: sel[i] }))), signals: Ds.reduce((a, d) => a + d.signals, 0) };
  const entry = (b) => (isNum(b.av) ? b.av : b.bid);
  try { const rc = await api("bank_cfg"); if (rc.ok) { ROBOT_PRESET = rc.cfg; BANK_DEFAULT = ROBOT_PRESET; } } catch (e) { /* пресет по умолчанию */ }
  const c = bankCfg();
  const all = D.bets;
  const seasonOf = (b) => +b.date.slice(0, 4);
  const years = [...new Set(all.map(seasonOf))].sort();
  const yr = q.y && years.includes(+q.y) ? +q.y : 0;
  const bets = yr ? all.filter((b) => seasonOf(b) === yr) : all;
  const run = (flat) => {
    if (!yr || yr === years[0]) return runBank(bets, c, flat);
    const p = runBank(all.filter((b) => seasonOf(b) < yr), c, flat);
    return runBank(bets, { ...c, start: p.bank, ref0: p.ref }, flat);
  };
  const B = run(false), F = run(true);
  const kpi = (l, v, s, k = "") => `<div class="card kpi"><div class="l">${l}</div><div class="v num ${k}">${v}</div>${s ? `<div class="s">${s}</div>` : ""}</div>`;
  const ci = (lo, hi, k = 1, u = "") => `${sgn(lo, k)}…${sgn(hi, k)}${u}`;
  const R = (b) => B.res.get(b);
  const n = bets.length, pnl = B.bank - B.start;
  const wins = bets.filter((b) => b.win).length;
  const clv = n ? bets.reduce((a, b) => a + (b.close - entry(b)), 0) / n : null;
  const avgPct = n ? bets.reduce((a, b) => a + R(b).pct, 0) / n : null;
  const vcols = [
    { key: "name", label: "Вариант", l: true, fmt: (x, i) => `${esc(x.name)}${i === 0 ? ' <span class="pill good">основной</span>' : ""}`, sort: (x) => x.name },
    { key: "signals", label: "Сигналов" },
    { key: "filled", label: "Исполнено", fmt: (x) => `${x.filled} <span class="faint">(${pct(x.fill_rate)})</span>` },
    { key: "roi", label: "ROI", fmt: (x) => `<b class="${cls(x.roi)}">${sgn(100 * x.roi, 1)}%</b> <span class="faint" style="font-size:11px">${ci(100 * x.roi_lo, 100 * x.roi_hi, 0)}</span>`, sort: (x) => x.roi },
    { key: "clv", label: "CLV, п.п.", title: "цена закрытия минус цена входа", fmt: (x) => `<b class="${cls(x.clv)}">${sgn(x.clv, 2)}</b> <span class="faint" style="font-size:11px">${ci(x.clv_lo, x.clv_hi, 1)}</span>`, sort: (x) => x.clv },
    { key: "c25", label: "CLV 2025", fmt: (x) => `<span class="${cls(x.seasons[2025]?.clv)}">${sgn(x.seasons[2025]?.clv, 2)}</span>`, sort: (x) => x.seasons[2025]?.clv },
    { key: "c26", label: "CLV 2026", fmt: (x) => `<span class="${cls(x.seasons[2026]?.clv)}">${sgn(x.seasons[2026]?.clv, 2)}</span>`, sort: (x) => x.seasons[2026]?.clv },
  ];
  const hcols = [
    { key: "name", label: "Когда", l: true, fmt: (x) => esc(x.name), sort: (x) => x.n },
    { key: "n", label: "Матчей", fmt: (x) => x.n.toLocaleString("ru-RU") },
    { key: "ll_const", label: "Без модели", title: "log loss константы — базовая линия", fmt: (x) => f1(x.ll_const, 4) },
    { key: "ll_market", label: "Polymarket", fmt: (x) => f1(x.ll_market, 4) },
    ...["model", "glicko", "mix"].map((k) => ({ key: "ll_" + k, label: SRC_NAMES[k], fmt: (x) => `<b class="${x["ll_" + k] < x.ll_market ? "good" : "bad"}">${f1(x["ll_" + k], 4)}</b>`, sort: (x) => x["ll_" + k] })),
  ];
  const bcols = [
    { key: "date", label: "Матч", l: true, fmt: (b) => ruTxt(b.date), sort: (b) => b.date },
    ...(sel.length > 1 ? [{ key: "st", label: "Стратегия", l: true, sort: (b) => b.st, fmt: (b) => esc(MSTRATS[b.st].name) }] : []),
    { key: "home", label: "Дом", l: true, sort: (b) => b.home, fmt: (b) => `<span class="match-mini">${logo(b.home, "sm")}${b.home}</span>` },
    { key: "away", label: "Гости", l: true, sort: (b) => b.away, fmt: (b) => `<span class="match-mini">${logo(b.away, "sm")}${b.away}</span>` },
    { key: "team", label: "На кого", l: true, sort: (b) => (b.w === 1 ? b.home : b.away), fmt: (b) => `<span class="match-mini">${logo(b.w === 1 ? b.home : b.away, "sm")}<b>${b.w === 1 ? b.home : b.away}</b></span>` },
    { key: "p", label: srcName(), title: "шанс нашей стороны по выбранному прогнозу", fmt: (b) => pct(b.p) },
    { key: "m", label: "Рынок", title: "середина цены Polymarket за 24 ч", fmt: (b) => pct(b.m) },
    { key: "bid", label: "Вход", sep: true, title: "средняя цена покупки (с комиссией у тейкера)", sort: (b) => entry(b), fmt: (b) => f1(100 * entry(b), 1) + "¢" + (b.tk ? ' <span class="faint" title="куплено сразу по цене продавца">·рын</span>' : "") },
    { key: "clv", label: "CLV", title: "цена закрытия минус цена входа, п.п.", sort: (b) => b.close - entry(b), fmt: (b) => `<span class="${cls(b.close - entry(b))}">${sgn(100 * (b.close - entry(b)), 1)}</span>` },
    { key: "ref", label: "От банка", sep: true, title: "расчётный банк на момент ставки — от него считался процент (пересчитывается при изменении банка на ±" + c.step + "%)", sort: (b) => R(b).ref, fmt: (b) => money(R(b).ref, 0).replace("+", "") },
    { key: "pct", label: "Ставка", sort: (b) => R(b).stake, fmt: (b) => `${f1(R(b).pct, 2)}% = <b>${money(R(b).stake, 0).replace("+", "")}</b>` },
    { key: "fillp", label: "Исполнено", title: "какую часть суммы ставки реально купили по ленте сделок Polymarket (прибыль — только с купленного)", sort: (b) => R(b).cost / R(b).stake, fmt: (b) => { const f = R(b).cost / R(b).stake; return `<span class="${f < 0.5 ? "acc" : ""}">${pct(Math.min(f, 1))}</span>`; } },
    { key: "res", label: "Исход", fmt: (b) => `<span class="pill ${b.win ? "good" : "bad"}">${b.win ? "выиграна" : "проиграна"}</span>`, sort: (b) => b.win },
    { key: "pnl", label: "Итог", sort: (b) => R(b).pnl, fmt: (b) => `<b class="${cls(R(b).pnl)}">${money(R(b).pnl, 2)}</b>` },
    { key: "bank", label: "Банк", sort: (b) => R(b).bank, fmt: (b) => money(R(b).bank, 0).replace("+", "") },
  ];
  const th = table({ cols: hcols, rows: O.horizons, id: "th" });
  const tv = table({ cols: vcols, rows: O.variants, id: "tv" });
  const bt = table({ cols: bcols, rows: bets.slice().sort((a, b) => b.open_t - a.open_t), onRow: (b) => (location.hash = `#/game/${b.id}`), id: "betsT", sortKey: "date", page: 150 });
  const km = c.method === "kelly";
  app.innerHTML = `
  <div class="page-head"><div><h1>Ставки</h1><div class="sub">Источник «${srcName()}», стратегий выбрано: ${sel.length}. Проверка на истории 2025–26 с честным исполнением: заявка исполняется только тем объёмом, который реально продали ниже нашей цены. Ставка растёт и падает вместе с банком, как в НХЛ. Бумажного робота и реальных ставок пока нет.</div></div></div>
  <div class="strat-pick" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:12px;margin:0 0 14px">${Object.entries(MSTRATS).map(([k, v], i) => { const vr = O.variants[i]; return `<div class="card strat" data-k="${k}" style="cursor:pointer;padding:12px 14px;${sel.includes(k) ? "border-color:var(--accent);box-shadow:0 0 0 1px var(--accent) inset" : ""}">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline"><b>${v.name}</b><label class="toggle strat-add" title="совместить несколько стратегий на общем банке" style="font-size:12px"><input type="checkbox" data-add="${k}" ${sel.includes(k) ? "checked" : ""}> в сумму</label></div>
      <div class="hint" style="margin:6px 0 8px">${v.rule}</div>
      <div class="faint" style="font-size:12px">ставка $100: исполнено ${vr.filled}, ROI <b class="${cls(vr.roi)}">${sgn(100 * vr.roi, 1)}%</b>, CLV <b class="${cls(vr.clv)}">${sgn(vr.clv, 2)}</b> п.п.</div></div>`; }).join("")}</div>
  <div class="hint" style="margin:-6px 0 12px">Нажмите на стратегию — откроется её проверка; галочка «в сумму» — совместить несколько на общем банке. Две стратегии могут поставить на один матч, тогда это две ставки.</div>
  ${years.length > 1 ? `<div class="chips" id="years" style="margin:-4px 0 12px"><button class="chip ${yr ? "" : "active"}" data-y="">Все сезоны</button>${years.map((y) => `<button class="chip ${y === yr ? "active" : ""}" data-y="${y}">${y}</button>`).join("")}</div>` : ""}
  <details class="card bankcfg" ${q.cfg ? "open" : ""}><summary>⚙ Управление банком</summary>
    <div class="cfg-grid">
      <label>Банк на старте, $<input class="input" type="number" id="c-start" value="${c.start}" min="100" step="100"></label>
      <label>Ставка min, % банка<input class="input" type="number" id="c-min" value="${c.min}" min="0.1" step="0.1"></label>
      <label>Ставка max, % банка<input class="input" type="number" id="c-max" value="${c.max}" min="0.1" step="0.1"></label>
      <label>Обычная ставка, %<input class="input" type="number" id="c-flat" value="${c.flat}" min="0.1" step="0.1"></label>
      <label title="крупные заявки на Polymarket исполняются хуже; проверка учитывает это по реальной ленте сделок">Максимальная ставка, $ (0 — без лимита)<input class="input" type="number" id="c-maxusd" value="${c.maxUsd}" min="0" step="50"></label>
      <label>Пересчёт банка при изменении на, %<input class="input" type="number" id="c-step" value="${c.step}" min="1" step="1"></label>
      <label class="${km ? "off" : ""}" title="${km ? "при методе Келли не используется" : ""}">Расхождение для min / max, п.п.${km ? " — не для Келли" : ""}<span class="pair"><input class="input" type="number" id="c-lo" value="${c.lo}" min="0" step="0.5" ${km ? "disabled" : ""}><input class="input" type="number" id="c-hi" value="${c.hi}" min="1" step="0.5" ${km ? "disabled" : ""}></span></label>
      <label>Метод ставки<select class="select" id="c-method">${Object.entries(METHODS).map(([k, v]) => `<option value="${k}" ${c.method === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
      <label class="${km ? "" : "off"}">Келли: доля (0.3 ≈ ставка около 1% в среднем)<input class="input" type="number" id="c-kf" value="${c.kf}" min="0.05" max="1" step="0.05" ${km ? "" : "disabled"}></label>
      <label class="${km ? "" : "off"}">Келли: доверие к модели<input class="input" type="number" id="c-trust" value="${c.trust}" min="0.05" max="1" step="0.05" ${km ? "" : "disabled"}></label>
      <button class="chip" id="c-robot" style="align-self:end" title="банк, метод и лимиты — как у робота НХЛ сейчас: ${ROBOT_PRESET.start}$ банк, ${ROBOT_PRESET.min}–${ROBOT_PRESET.max}%, до $${ROBOT_PRESET.maxUsd}">Как у робота НХЛ</button>
      <button class="chip" id="c-sim" style="align-self:end" title="настройки «симуляции» на сайте НХЛ: Келли 0,5–1%, банк $5000, до $150">Как в симуляции НХЛ</button>
    </div>
    <div class="hint">По умолчанию — <b>те же настройки, что у робота НХЛ</b> (по ним НХЛ считает бумажные и реальные ставки). Ставка = % × «расчётный банк», но не больше максимальной ставки (${c.maxUsd ? "$" + c.maxUsd : "без лимита"}). Расчётный банк пересчитывается, когда банк вырос или упал на ${c.step}%: вырос банк на 25% — ставка тоже на 25% больше, упал — меньше. Крупные ставки исполняются хуже — результат под размер ставки берётся по реальной ленте сделок ($3 / 5 / 10 / 30 / 100 / 300 / 1000, между точками линейно). ${km ? `<b>Келли:</b> своя оценка = цена + ${c.trust} × (модель − цена); доля банка = ${c.kf} × перевес / (1 − цена), в пределах ${c.min}–${c.max}%.` : c.method === "user" ? `<b>Разница × 1.5·цена^0.585:</b> ставка по разнице (≤ ${c.lo} п.п. → ${c.min}%, ≥ ${c.hi} п.п. → ${c.max}%), умноженная на 1.5·цена^0.585.` : `<b>По разнице:</b> расхождение ≤ ${c.lo} п.п. → ${c.min}%, ≥ ${c.hi} п.п. → ${c.max}%, между — пропорционально.`}</div>
  </details>
  <div class="kpis">
    ${kpi("Банк", money(B.bank).replace("+", ""), `${yr && yr > years[0] ? "на начало сезона" : "старт"} ${money(B.start).replace("+", "")}`, cls(pnl))}
    ${kpi("Прибыль", money(pnl), `${pct(pnl / B.start, 1)} к банку · при ровных ${c.flat}%: ${money(F.bank - F.start)}`, cls(pnl))}
    ${kpi("ROI", pct(B.staked ? pnl / B.staked : null, 2), `оборот ${money(B.staked).replace("+", "")}`)}
    ${kpi("Ставок", n, `${yr ? "" : `сигналов ${D.signals} · исполнено ${pct(n / D.signals)} · `}ср. ставка ${f1(avgPct, 2)}%`)}
    ${kpi("В плюс", pct(n ? wins / n : null), `${wins} из ${n}`)}
    ${kpi("CLV", isNum(clv) ? sgn(100 * clv, 2) + " п.п." : "—", "цена к началу матча против нашей", cls(clv))}
    ${kpi("Макс. просадка", money(B.dd), pct(B.ddp, 1) + " от пика")}
  </div>
  <div class="grid g2">
    <div class="card"><div class="card-h"><h3 id="eq-h">Банк</h3><div class="seg seg-sm" id="eqmode"><button data-m="bank">Банк</button><button data-m="pnl">Доход</button></div></div><div class="card-b"><div class="chart-box lg"><canvas id="eq"></canvas></div></div></div>
    <div class="card"><div class="card-h"><h3>По месяцам</h3><span class="muted">прибыль за месяц, $</span></div><div class="card-b"><div class="chart-box lg"><canvas id="mo"></canvas></div></div></div>
  </div>
  <div class="card" style="margin:16px 0"><div class="card-h"><h3>Точность прогноза против рынка</h3><span class="muted">log loss на матчах 2025–26, меньше — лучше; зелёным — лучше Polymarket в тот же момент</span></div><div class="card-b">${th.html}<div class="hint">Все три источника лучше рынка за 24 ч; ближе к матчу рынок их догоняет и обгоняет. Поэтому вход — за сутки, а критерий успеха — CLV.</div></div></div>
  <div class="card" style="margin-bottom:16px"><div class="card-h"><h3>Варианты стратегии</h3><span class="muted">ставка ровно $100 — чистое сравнение вариантов; главный критерий — CLV, интервал ROI захватывает ноль; мейкер заметно лучше тейкера</span></div><div class="card-b">${tv.html}</div></div>
  <div class="section-title">Все ставки</div>
  <div class="card"><div class="card-b">${bt.html}</div></div>`;
  th.render(); tv.render(); bt.render();

  const setCfg = () => setQuery("bets", { y: q.y, s: q.s, cfg: 1 });
  $$("#years .chip").forEach((b) => b.onclick = () => { setQuery("bets", { y: b.dataset.y || undefined, s: q.s, cfg: q.cfg }); route(); });
  const upd = () => {
    const nn = (id, def) => { const v = parseFloat($("#" + id).value); return Number.isFinite(v) ? v : def; };
    saveBankCfg({ start: nn("c-start", 5000), min: nn("c-min", 0.5), max: nn("c-max", 1), flat: nn("c-flat", 0.75), maxUsd: nn("c-maxusd", 150), step: nn("c-step", 25),
      lo: nn("c-lo", 3), hi: nn("c-hi", 12), method: $("#c-method").value, kf: nn("c-kf", 0.3), trust: nn("c-trust", 0.6) });
    setCfg(); route();
  };
  $$(".bankcfg input, .bankcfg select").forEach((i) => (i.onchange = upd));
  const goS = (list) => { setQuery("bets", { y: q.y, s: list.join(",") === "hold" ? undefined : list.join(","), cfg: q.cfg }); route(); };
  $$(".strat").forEach((el) => el.onclick = (e) => { if (e.target.closest(".strat-add")) return; goS([el.dataset.k]); });
  $$("[data-add]").forEach((cb) => cb.onchange = () => { const k = cb.dataset.add; let l = sel.filter((x) => x !== k); if (cb.checked) l.push(k); goS(l.length ? l : [k]); });
  $("#c-robot").onclick = () => { saveBankCfg(ROBOT_PRESET); setCfg(); route(); };
  $("#c-sim").onclick = () => { saveBankCfg(SIM_PRESET); setCfg(); route(); };

  const acc = cssVar("--accent");
  let mode = "bank";
  try { mode = localStorage.getItem("eqmode") || "bank"; } catch (e) { /* по умолчанию банк */ }
  const drawEq = () => {
    charts.filter((x) => x.canvas.id === "eq").forEach((x) => { x.destroy(); charts = charts.filter((y) => y !== x); });
    $$("#eqmode button").forEach((b) => b.classList.toggle("active", b.dataset.m === mode));
    $("#eq-h").textContent = mode === "bank" ? "Банк" : "Доход";
    const pts = B.curve.map((p) => ({ x: p.x, y: mode === "bank" ? p.y : p.y - B.start }));
    chart($("#eq"), {
      type: "line",
      data: { datasets: [{ data: pts, borderColor: acc, backgroundColor: "transparent", borderWidth: 2, pointRadius: 0, tension: 0.15 }] },
      options: { maintainAspectRatio: false, parsing: false, plugins: { legend: { display: false }, tooltip: { ...tooltipBase(), callbacks: { title: (it) => ruDT(new Date(it[0].raw.x)), label: (it) => money(it.raw.y, 0).replace(mode === "bank" ? "+" : "", "") } } },
        scales: { x: { type: "linear", ticks: { maxTicksLimit: 7, callback: (v) => ruDateS(new Date(v)) } }, y: { ticks: { callback: (v) => money(v).replace(mode === "bank" ? "+" : "", "") } } } },
    });
  };
  $$("#eqmode button").forEach((b) => b.onclick = () => { mode = b.dataset.m; try { localStorage.setItem("eqmode", mode); } catch (e) { /* без сохранения */ } drawEq(); });
  drawEq();
  const mo = {};
  bets.forEach((b) => { const k = b.date.slice(0, 7); mo[k] = (mo[k] || 0) + R(b).pnl; });
  const ks = Object.keys(mo).sort();
  chart($("#mo"), {
    type: "bar",
    data: { labels: ks.map((k) => `${MLB_MONTHS[k.slice(5)] || k.slice(5)} ${k.slice(2, 4)}`), datasets: [{ data: ks.map((k) => mo[k]), backgroundColor: ks.map((k) => (mo[k] >= 0 ? cssVar("--good") || "#22c55e" : cssVar("--bad") || "#ef4444")), borderRadius: 4 }] },
    options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { ...tooltipBase(), callbacks: { label: (it) => money(it.raw, 0) } } }, scales: { y: { ticks: { callback: (v) => money(v) } } } },
  });
}

/* ---------- Робот ---------- */
async function viewBot() {
  const O = await api("overview", 1), p = O.poll;
  const kpi = (l, v, s, c = "") => `<div class="card kpi"><div class="l">${l}</div><div class="v num ${c}" style="font-size:22px">${v}</div>${s ? `<div class="s">${s}</div>` : ""}</div>`;
  const ch = (p.recent || []).map((c) => ({ ...c, when: tsDate(c.t), game: `${c.away} @ ${c.home}`, who: c.side === "home" ? "хозяева" : "гости", old: c.old || "не объявлен", nw: c.new || "снят" }));
  const ccols = [{ key: "when", label: "Заметили", l: true }, { key: "date", label: "Дата игры", l: true, fmt: (x) => ruTxt(x.date) }, { key: "game", label: "Матч", l: true }, { key: "who", label: "Сторона", l: true },
    { key: "old", label: "Был", l: true }, { key: "nw", label: "Стал", l: true }];
  const tc = table({ cols: ccols, rows: ch, id: "tch" });
  app.innerHTML = `
  <div class="page-head"><div><h1>Робот</h1><div class="sub">Бумажный робот MLB включится к открытию сезона 2027 (регулярный чемпионат — с конца марта). Сейчас работает только опрос стартовых питчеров и составов.</div></div></div>
  <div class="kpis">
    ${kpi("Опрос питчеров", p.alive ? "работает" : "не отвечает", p.last_poll ? "последний опрос " + tsDate(p.last_poll) : "", p.alive ? "good" : "bad")}
    ${kpi("Игр в журнале", p.n_games.toLocaleString("ru-RU"), "со спринг-тренинга (февраль 2027)")}
    ${kpi("Замен питчера", p.n_changes.toLocaleString("ru-RU"), "после объявления")}
    ${kpi("Режим", "только бумага", "реальных ставок нет", "")}
  </div>
  <div class="card" style="margin-bottom:16px"><div class="card-h"><h3>Правила бумажного робота</h3><span class="muted">зафиксированы 10.11.2026 в документе правил сезона, потом не меняются</span></div><div class="card-b how">
    <ul>
      <li><b>Вход</b> — за 24 ч до начала, только регулярный чемпионат. Составы до объявления — проектные (последние 7 игр).</li>
      <li><b>Три источника</b> — SHARP (симуляция), Глико-2 и смесь, каждый отдельной строкой бумажного робота. Смесь ставит, только если обе модели за одну сторону. Основной источник объявляется заранее и потом не меняется.</li>
      <li><b>Сигнал</b> — 0,6 × (прогноз источника − середина цены Polymarket) ≥ 3 п.п.</li>
      <li><b>Размер ставки</b> — как в НХЛ: Келли (доля 0,3, доверие 0,6) от «расчётного банка», 0,5–1% банка, не больше 50; расчётный банк пересчитывается, когда банк меняется на ±25% (вырос на 25% — ставка тоже на 25% больше, упал — меньше).</li>
      <li><b>Заявка</b> — «середина − 1 ц», только своя (мейкер). На бумаге исполняется лишь тем объёмом, который реально продали ниже нашей цены.</li>
      <li><b>Замена стартового питчера</b> после заявки — заявка отменяется («отменена: замена»).</li>
      <li><b>«Догонять»</b> за 18/12/6 ч — отдельной строкой.</li>
      <li><b>Критерий успеха</b> — CLV исполненных ставок выше нуля с интервалом выше нуля после ~300 исполненных. <b>Стоп</b> — скользящий CLV за 150 исполненных ниже нуля.</li>
      <li><b>Реальные деньги</b> — только отдельным решением после этой проверки.</li>
    </ul></div></div>
  <div class="card" style="margin-bottom:16px"><div class="card-h"><h3>Опрос стартовых питчеров и составов</h3></div><div class="card-b how">
    <p>В истории MLB Stats API у прошлых игр стоит тот, кто реально вышел, поэтому замены питчера после выхода рынка прошлым не измерить. Мы пишем собственный журнал: каждые 2 минуты опрашиваем расписание (вчера, сегодня, два дня вперёд) и сохраняем любое изменение вероятных питчеров и составов с отметкой времени.</p>
    ${p.n_games ? "" : `<div class="muted">Межсезонье: игр пока нет. Журнал наполнится со спринг-тренинга.</div>`}</div></div>
  ${ch.length ? `<div class="card" style="margin-bottom:16px"><div class="card-h"><h3>Последние замены вероятного питчера</h3></div><div class="card-b">${tc.html}</div></div>` : ""}
  <div class="card"><div class="card-h"><h3>Как устроена модель</h3></div><div class="card-b how">
    <p><b>Исход одного выхода бэттера</b> (аут, страйкаут, уолк, одиночный, дубль, трипл, хоум-ран, удар по бэттеру) предсказывает градиентный бустинг по 1,7 млн выходов 2017–2024: уровень питчера и бэттера с затуханием по дням (и отдельно против левшей/правшей), качество контакта, парк, температура, ветер, высота над уровнем моря, день/ночь, какой раз бэттер видит стартёра и арсенал питчера против бэттера — доля каждого типа подач, умноженная на то, как этот бэттер на него реагирует.</p>
    <p><b>Матч</b> считается симуляцией по 2000 розыгрышей: по 9 бэттеров, переходы баз и аутов из эмпирической таблицы, выход стартёра по отдельной модели (усталость, счёт, число подач), затем буллпен, призрачный бегун с 10-го иннинга.</p>
    <p><b>Глико-2</b> — второй источник, как в НХЛ: у каждого бэттера (атака) и питчера (защита) есть рейтинг в единицах wOBA и неуверенность, которая растёт без игр и падает после каждого выхода; обновление после каждой игры по всем выходам; буллпен — отдельный рейтинг команды. Матч — логистика по разнице атак составов, стартёров и буллпенов.</p>
    <p><b>Смесь</b> — логистика по двум прогнозам с весами, подобранными на лаборатории 2023–24 (SHARP 0,63, Глико 0,32).</p>
    <p><b>Ограничения:</b> перевес тонкий и тает (CLV 2026 заметно ниже 2025); замена питчера после входа в проверке не учтена; комиссия тейкера не проверялась — проверены только мейкерные заявки.</p></div></div>`;
  if (ch.length) tc.render();
}

/* ---------- Команды / Игроки / Конструктор (рейтинги Глико-2, статистика Savant) ---------- */
let PEOPLE = null;
async function people() {
  if (!PEOPLE) { PEOPLE = await api("people"); PEOPLE.P = PEOPLE.players; }
  return PEOPLE;
}
const PITCH = { FF: "Фастбол (4 шва)", SI: "Синкер", FC: "Каттер", SL: "Слайдер", ST: "Свиперв", CU: "Кёрв", KC: "Нак-кёрв", CH: "Чейнджап", FS: "Сплиттер", SV: "Слёрв", FO: "Форкбол", KN: "Кнакл", EP: "Эфус", CS: "Медл. кёрв", SC: "Скрюбол" };
const POS_P = ["SP", "RP", "P", "TWP"];
const isPitcherPos = (pl) => POS_P.includes(pl.pos);
const sgnPts = (v) => (isNum(v) ? (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(0) : "—");
const rate3 = (v) => (isNum(v) ? v.toFixed(3).replace(/^0/, "") : "—");
const BI = { pa: 0, woba: 1, xw: 2, k: 3, bb: 4, hr: 5, avg: 6, obp: 7, slg: 8, ev: 9, hh: 10, gs: 11 };
const ratingCell = (v, sd) => (isNum(v) ? `<b class="${cls(v)}">${sgnPts(v)}</b> <span class="faint" style="font-size:11px">±${f1(sd, 0)}</span>` : `<span class="faint">нет данных</span>`);
const pLink = (id, n) => `<a href="#/player/${id}">${esc(n)}</a>`;
const lastSeason = (PE) => String(Math.max(...PE.seasons));
function seasonChips(PE, cur, base) {
  return `<div class="chips" id="pseas">${[...PE.seasons].sort((a, b) => b - a).map((s) => `<button class="chip ${String(s) === String(cur) ? "active" : ""}" data-s="${s}">${s}</button>`).join("")}</div>`;
}

/* ---------- Команды ---------- */
async function viewTeams(q) {
  const PE = await people(), sea = q.s || lastSeason(PE);
  const rows = Object.entries(PE.teams).filter(([ab]) => ab !== "OAK").map(([ab, t]) => {
    const r = t.rec[sea] || [0, 0, 0, 0], g = r[0] + r[1];
    const lu = t.lineup.map((id, k) => (PE.P[id]?.o ?? 0) * PE.W[k]).reduce((a, b) => a + b, 0);
    return { ab, name: t.name, w: r[0], l: r[1], pct: g ? r[0] / g : 0, rd: r[2] - r[3], bp: t.bp?.d, lu };
  });
  const order = q.o || "pct";
  rows.sort((a, b) => (order === "name" ? a.name.localeCompare(b.name) : order === "bp" ? b.bp - a.bp : order === "lu" ? b.lu - a.lu : b.pct - a.pct));
  app.innerHTML = `
  <div class="page-head"><div><h1>Команды</h1><div class="sub">Результаты сезона, рейтинги Глико-2 основного состава и буллпена (в очках wOBA над средним; у буллпена плюс — лучше). Нажмите на команду — откроется её страница.</div></div>
    ${seasonChips(PE, sea)}</div>
  <div class="chips" id="ord" style="margin:-4px 0 12px">${[["pct", "по победам"], ["lu", "по атаке"], ["bp", "по буллпену"], ["name", "по алфавиту"]].map(([k, v]) => `<button class="chip ${k === order ? "active" : ""}" data-o="${k}">${v}</button>`).join("")}</div>
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px">${rows.map((t) => `<a class="card" href="#/team/${t.ab}" style="padding:14px;display:block">
    <div style="display:flex;gap:12px;align-items:center">${logo(t.ab, "lg")}<div><b>${esc(shortName(t.ab))}</b><div class="faint" style="font-size:12px">${esc(t.name)}</div></div></div>
    <div style="display:flex;justify-content:space-between;margin-top:12px;font-size:13px"><span><b class="num">${t.w}–${t.l}</b> <span class="faint">${pct(t.pct, 0)}</span></span><span class="${cls(t.rd)}" title="разница пропущенных и забитых">${sgn(t.rd, 0)} ранов</span></div>
    <div class="faint" style="display:flex;justify-content:space-between;margin-top:6px;font-size:12px"><span>атака ${sgnPts(t.lu)}</span><span>буллпен ${sgnPts(t.bp)}</span></div></a>`).join("")}</div>`;
  $$("#pseas .chip").forEach((b) => b.onclick = () => { setQuery("teams", { s: b.dataset.s, o: q.o }); route(); });
  $$("#ord .chip").forEach((b) => b.onclick = () => { setQuery("teams", { s: q.s, o: b.dataset.o }); route(); });
}

async function viewTeam(ab, q) {
  const PE = await people(), t = PE.teams[ab];
  if (!t) { app.innerHTML = `<div class="empty">Команда не найдена</div>`; return; }
  const sea = q.s || lastSeason(PE);
  const r = t.rec[sea] || [0, 0, 0, 0];
  const kpi = (l, v, s, k = "") => `<div class="card kpi"><div class="l">${l}</div><div class="v num ${k}">${v}</div>${s ? `<div class="s">${s}</div>` : ""}</div>`;
  const lu = t.lineup.map((id, k) => (PE.P[id]?.o ?? 0) * PE.W[k]).reduce((a, b) => a + b, 0);
  const hit = t.roster.map((id) => ({ id, ...PE.P[id] })).filter((p) => p.n && !isPitcherPos(p));
  const pit = t.roster.map((id) => ({ id, ...PE.P[id] })).filter((p) => p.n && isPitcherPos(p));
  const bcols = [
    { key: "n", label: "Игрок", l: true, fmt: (p) => pLink(p.id, p.n), sort: (p) => p.n },
    { key: "pos", label: "Поз", l: true }, { key: "b", label: "Бьёт", l: true },
    { key: "pa", label: "PA", sort: (p) => p.bs?.[sea]?.[0], fmt: (p) => p.bs?.[sea]?.[0] ?? "—" },
    { key: "avg", label: "AVG/OBP/SLG", title: "средняя / на базе / длина", sort: (p) => p.bs?.[sea]?.[7], fmt: (p) => (p.bs?.[sea] ? `${rate3(p.bs[sea][6])}/${rate3(p.bs[sea][7])}/${rate3(p.bs[sea][8])}` : "—") },
    { key: "woba", label: "wOBA", sort: (p) => p.bs?.[sea]?.[1], fmt: (p) => rate3(p.bs?.[sea]?.[1]) },
    { key: "hr", label: "HR", sort: (p) => p.bs?.[sea]?.[5], fmt: (p) => p.bs?.[sea]?.[5] ?? "—" },
    { key: "k", label: "K%", sort: (p) => p.bs?.[sea]?.[3], fmt: (p) => pct(p.bs?.[sea]?.[3], 1) },
    { key: "bb", label: "BB%", sort: (p) => p.bs?.[sea]?.[4], fmt: (p) => pct(p.bs?.[sea]?.[4], 1) },
    { key: "o", label: "Рейтинг атаки", title: "Глико-2: очки wOBA над средним, ± неопределённость", sort: (p) => p.o, fmt: (p) => ratingCell(p.o, p.os) },
  ];
  const pcols = [
    { key: "n", label: "Игрок", l: true, fmt: (p) => pLink(p.id, p.n), sort: (p) => p.n },
    { key: "th", label: "Рука", l: true, fmt: (p) => (p.th === "L" ? "левая" : p.th === "R" ? "правая" : "—") },
    { key: "gs", label: "Старты", sort: (p) => p.ps?.[sea]?.[11], fmt: (p) => p.ps?.[sea]?.[11] ?? "—" },
    { key: "bf", label: "Выходов против", title: "сколько бэттеров встретил", sort: (p) => p.ps?.[sea]?.[0], fmt: (p) => p.ps?.[sea]?.[0] ?? "—" },
    { key: "woba", label: "wOBA против", sort: (p) => p.ps?.[sea]?.[1], fmt: (p) => rate3(p.ps?.[sea]?.[1]) },
    { key: "k", label: "K%", sort: (p) => p.ps?.[sea]?.[3], fmt: (p) => pct(p.ps?.[sea]?.[3], 1) },
    { key: "bb", label: "BB%", sort: (p) => p.ps?.[sea]?.[4], fmt: (p) => pct(p.ps?.[sea]?.[4], 1) },
    { key: "hr", label: "HR", sort: (p) => p.ps?.[sea]?.[5], fmt: (p) => p.ps?.[sea]?.[5] ?? "—" },
    { key: "d", label: "Рейтинг защиты", title: "Глико-2: очки wOBA, которые питчер отнимает у бэттеров, ± неопределённость", sort: (p) => p.d, fmt: (p) => ratingCell(p.d, p.ds) },
  ];
  const th = table({ cols: bcols, rows: hit, id: "th", sortKey: "pa" });
  const tp = table({ cols: pcols, rows: pit, id: "tp", sortKey: "bf" });
  const rc = table({ cols: [{ key: "date", label: "Дата", l: true, fmt: (g) => ruTxt(g.date) }, { key: "opp", label: "Соперник", l: true, fmt: (g) => `${g.home ? "дома" : "в гостях"} <span class="match-mini">${logo(g.opp, "sm")}${g.opp}</span>` },
    { key: "sc", label: "Счёт", fmt: (g) => `<b class="${g.rs > g.ra ? "good" : "bad"}">${g.rs}:${g.ra}</b>` }, { key: "res", label: "", fmt: (g) => `<span class="pill ${g.rs > g.ra ? "good" : "bad"}">${g.rs > g.ra ? "победа" : "поражение"}</span>` }],
    rows: t.recent.slice().reverse(), id: "rc" });
  app.innerHTML = `
  <div class="page-head"><div style="display:flex;gap:16px;align-items:center">${logo(ab, "lg")}<div><h1>${esc(t.name)}</h1><div class="sub">Состав — активный ростер MLB; статистика — сезон ${sea}; рейтинги Глико-2 — на конец сезона 2026</div></div></div>
    <div class="chips"><a class="chip" href="#/teams?s=${sea}">← ко всем командам</a></div></div>
  ${seasonChips(PE, sea)}
  <div class="kpis" style="margin-top:12px">
    ${kpi("Победы–поражения", `${r[0]}–${r[1]}`, `${pct(r[0] + r[1] ? r[0] / (r[0] + r[1]) : null, 1)} побед`)}
    ${kpi("Разница ранов", `<span class="${cls(r[2] - r[3])}">${sgn(r[2] - r[3], 0)}</span>`, `забито ${r[2]} · пропущено ${r[3]}`)}
    ${kpi("Атака основного состава", `<span class="${cls(lu)}">${sgnPts(lu)}</span>`, "очков wOBA над средним, по последнему составу")}
    ${kpi("Буллпен", t.bp ? `<span class="${cls(t.bp.d)}">${sgnPts(t.bp.d)}</span>` : "—", t.bp ? `± ${f1(t.bp.ds, 0)} · плюс — лучше среднего` : "")}
    ${kpi("Типовая ротация", t.rotation.length + " питчеров", t.rotation.slice(0, 3).map((id) => PE.P[id]?.n?.split(" ").slice(-1)[0] || "").join(", "))}
  </div>
  <div class="card" style="margin-bottom:16px"><div class="card-h"><h3>Бэттеры</h3><span class="muted">${hit.length} на активном ростере</span></div><div class="card-b">${th.html}</div></div>
  <div class="card" style="margin-bottom:16px"><div class="card-h"><h3>Питчеры</h3><span class="muted">${pit.length} на активном ростере</span></div><div class="card-b">${tp.html}</div></div>
  <div class="card"><div class="card-h"><h3>Последние игры</h3></div><div class="card-b">${rc.html}</div></div>`;
  th.render(); tp.render(); rc.render();
  $$("#pseas .chip").forEach((b) => b.onclick = () => { setQuery("team/" + ab, { s: b.dataset.s }); route(); });
}

/* ---------- Игроки ---------- */
async function viewPlayers(q) {
  const PE = await people(), sea = q.s || lastSeason(PE), role = q.r === "p" ? "p" : "b";
  const rows = Object.entries(PE.P).map(([id, p]) => ({ id, ...p })).filter((p) => (role === "p" ? p.ps?.[sea] : p.bs?.[sea]));
  const bcols = [
    { key: "n", label: "Игрок", l: true, fmt: (p) => pLink(p.id, p.n), sort: (p) => p.n },
    { key: "t", label: "Команда", l: true, fmt: (p) => (p.t ? `<span class="match-mini">${logo(p.t, "sm")}${p.t}</span>` : "—"), sort: (p) => p.t || "" },
    { key: "pos", label: "Поз", l: true }, { key: "b", label: "Бьёт", l: true },
    { key: "pa", label: "PA", sort: (p) => p.bs[sea][0], fmt: (p) => p.bs[sea][0] },
    { key: "avg", label: "AVG/OBP/SLG", sort: (p) => p.bs[sea][7], fmt: (p) => `${rate3(p.bs[sea][6])}/${rate3(p.bs[sea][7])}/${rate3(p.bs[sea][8])}` },
    { key: "woba", label: "wOBA", sort: (p) => p.bs[sea][1], fmt: (p) => rate3(p.bs[sea][1]) },
    { key: "xw", label: "xwOBA на контакте", title: "ожидаемая wOBA по скорости и углу вылета", sort: (p) => p.bs[sea][2], fmt: (p) => rate3(p.bs[sea][2]) },
    { key: "hr", label: "HR", sort: (p) => p.bs[sea][5], fmt: (p) => p.bs[sea][5] },
    { key: "k", label: "K%", sort: (p) => p.bs[sea][3], fmt: (p) => pct(p.bs[sea][3], 1) },
    { key: "bb", label: "BB%", sort: (p) => p.bs[sea][4], fmt: (p) => pct(p.bs[sea][4], 1) },
    { key: "hh", label: "Hard-hit%", title: "доля ударов с вылетом 95+ миль/ч", sort: (p) => p.bs[sea][10], fmt: (p) => pct(p.bs[sea][10], 0) },
    { key: "o", label: "Рейтинг атаки", sort: (p) => p.o, fmt: (p) => ratingCell(p.o, p.os) },
  ];
  const pcols = [
    { key: "n", label: "Игрок", l: true, fmt: (p) => pLink(p.id, p.n), sort: (p) => p.n },
    { key: "t", label: "Команда", l: true, fmt: (p) => (p.t ? `<span class="match-mini">${logo(p.t, "sm")}${p.t}</span>` : "—"), sort: (p) => p.t || "" },
    { key: "th", label: "Рука", l: true, fmt: (p) => (p.th === "L" ? "левая" : p.th === "R" ? "правая" : "—") },
    { key: "gs", label: "Старты", sort: (p) => p.ps[sea][11], fmt: (p) => p.ps[sea][11] },
    { key: "bf", label: "Выходов против", sort: (p) => p.ps[sea][0], fmt: (p) => p.ps[sea][0] },
    { key: "woba", label: "wOBA против", sort: (p) => p.ps[sea][1], fmt: (p) => rate3(p.ps[sea][1]) },
    { key: "xw", label: "xwOBA на контакте", sort: (p) => p.ps[sea][2], fmt: (p) => rate3(p.ps[sea][2]) },
    { key: "k", label: "K%", sort: (p) => p.ps[sea][3], fmt: (p) => pct(p.ps[sea][3], 1) },
    { key: "bb", label: "BB%", sort: (p) => p.ps[sea][4], fmt: (p) => pct(p.ps[sea][4], 1) },
    { key: "hr", label: "HR", sort: (p) => p.ps[sea][5], fmt: (p) => p.ps[sea][5] },
    { key: "d", label: "Рейтинг защиты", sort: (p) => p.d, fmt: (p) => ratingCell(p.d, p.ds) },
  ];
  const tb = table({ cols: role === "p" ? pcols : bcols, rows, id: "tpl", sortKey: role === "p" ? "bf" : "pa", page: 100 });
  app.innerHTML = `
  <div class="page-head"><div><h1>Игроки</h1><div class="sub">Статистика Baseball Savant за сезон и рейтинги Глико-2 (очки wOBA над средним, ± неопределённость). Нажмите на игрока — его страница.</div></div>${seasonChips(PE, sea)}</div>
  <div class="chips" id="role" style="margin:-4px 0 10px"><button class="chip ${role === "b" ? "active" : ""}" data-r="b">Бэттеры · ${Object.values(PE.P).filter((p) => p.bs?.[sea]).length}</button><button class="chip ${role === "p" ? "active" : ""}" data-r="p">Питчеры · ${Object.values(PE.P).filter((p) => p.ps?.[sea]).length}</button></div>
  <div class="card"><div class="card-b">${tb.html}</div></div>`;
  tb.render();
  $$("#pseas .chip").forEach((b) => b.onclick = () => { setQuery("players", { s: b.dataset.s, r: q.r }); route(); });
  $$("#role .chip").forEach((b) => b.onclick = () => { setQuery("players", { s: q.s, r: b.dataset.r }); route(); });
}

async function viewPlayer(id, q) {
  const PE = await people(), p = PE.P[id];
  if (!p) { app.innerHTML = `<div class="empty">Игрок не найден</div>`; return; }
  const kpi = (l, v, s, k = "") => `<div class="card kpi"><div class="l">${l}</div><div class="v num ${k}">${v}</div>${s ? `<div class="s">${s}</div>` : ""}</div>`;
  const hand = (h) => (h === "L" ? "левша" : h === "R" ? "правша" : h === "S" ? "с обеих рук" : "—");
  const seas = Object.keys({ ...(p.bs || {}), ...(p.ps || {}) }).sort().reverse();
  const brow = Object.entries(p.bs || {}).sort((a, b) => b[0] - a[0]).map(([s, v]) => ({ s, v }));
  const prow = Object.entries(p.ps || {}).sort((a, b) => b[0] - a[0]).map(([s, v]) => ({ s, v }));
  const bt = table({ cols: [{ key: "s", label: "Сезон", l: true, fmt: (x) => x.s }, { key: "pa", label: "PA", fmt: (x) => x.v[0] }, { key: "avg", label: "AVG/OBP/SLG", fmt: (x) => `${rate3(x.v[6])}/${rate3(x.v[7])}/${rate3(x.v[8])}` },
    { key: "w", label: "wOBA", fmt: (x) => rate3(x.v[1]) }, { key: "xw", label: "xwOBA на контакте", fmt: (x) => rate3(x.v[2]) }, { key: "hr", label: "HR", fmt: (x) => x.v[5] }, { key: "k", label: "K%", fmt: (x) => pct(x.v[3], 1) },
    { key: "bb", label: "BB%", fmt: (x) => pct(x.v[4], 1) }, { key: "ev", label: "Скорость вылета", fmt: (x) => (isNum(x.v[9]) ? f1(x.v[9], 1) + " миль/ч" : "—") }, { key: "hh", label: "Hard-hit%", fmt: (x) => pct(x.v[10], 0) }], rows: brow, id: "pb" });
  const pt = table({ cols: [{ key: "s", label: "Сезон", l: true, fmt: (x) => x.s }, { key: "gs", label: "Старты", fmt: (x) => x.v[11] }, { key: "bf", label: "Выходов против", fmt: (x) => x.v[0] },
    { key: "w", label: "wOBA против", fmt: (x) => rate3(x.v[1]) }, { key: "xw", label: "xwOBA на контакте", fmt: (x) => rate3(x.v[2]) }, { key: "k", label: "K%", fmt: (x) => pct(x.v[3], 1) }, { key: "bb", label: "BB%", fmt: (x) => pct(x.v[4], 1) },
    { key: "hr", label: "HR", fmt: (x) => x.v[5] }, { key: "ev", label: "Скорость вылета против", fmt: (x) => (isNum(x.v[9]) ? f1(x.v[9], 1) : "—") }], rows: prow, id: "pp" });
  const asea = Object.keys(p.ars || {}).sort().reverse()[0];
  const ars = asea ? p.ars[asea] : null;
  const at = ars ? table({ cols: [{ key: "t", label: "Подача", l: true, fmt: (x) => `${PITCH[x[0]] || x[0]} <span class="faint">${x[0]}</span>` }, { key: "sh", label: "Доля", fmt: (x) => pct(x[1], 0) },
    { key: "v", label: "Скорость", fmt: (x) => f1(x[2], 1) + " миль/ч" }, { key: "sp", label: "Вращение", fmt: (x) => (isNum(x[3]) ? x[3] + " об/мин" : "—") }, { key: "wh", label: "Промахи при замахе", title: "доля замахов мимо", fmt: (x) => pct(x[4], 0) }], rows: ars, id: "pa" }) : null;
  app.innerHTML = `
  <div class="page-head"><div style="display:flex;gap:16px;align-items:center">${p.t ? logo(p.t, "lg") : ""}<div><h1>${esc(p.n)}</h1><div class="sub">${[p.t ? teamName(p.t) : "", p.pos, p.b ? "бьёт: " + hand(p.b) : "", p.th ? "бросает: " + hand(p.th) : "", isNum(p.a) ? p.a + " лет" : "", p.act ? "" : "не на активном ростере"].filter(Boolean).join(" · ")}</div></div></div>
    <div class="chips">${p.t ? `<a class="chip" href="#/team/${p.t}">к команде</a>` : ""}<a class="chip" href="#/players">все игроки</a></div></div>
  <div class="kpis">
    ${kpi("Рейтинг атаки", isNum(p.o) ? `<span class="${cls(p.o)}">${sgnPts(p.o)}</span>` : "—", isNum(p.o) ? `очков wOBA над средним · ±${f1(p.os, 0)} · последняя игра ${ruTxt(p.ol)}` : "не выходил на биту")}
    ${kpi("Рейтинг защиты", isNum(p.d) ? `<span class="${cls(p.d)}">${sgnPts(p.d)}</span>` : "—", isNum(p.d) ? `очков wOBA, которые отнимает у бэттеров · ±${f1(p.ds, 0)} · последняя игра ${ruTxt(p.dl)}` : "не питчер")}
  </div>
  ${brow.length ? `<div class="card" style="margin-bottom:16px"><div class="card-h"><h3>Как бэттер</h3></div><div class="card-b">${bt.html}</div></div>` : ""}
  ${prow.length ? `<div class="card" style="margin-bottom:16px"><div class="card-h"><h3>Как питчер</h3></div><div class="card-b">${pt.html}</div></div>` : ""}
  ${ars ? `<div class="card"><div class="card-h"><h3>Арсенал, ${asea}</h3><span class="muted">подачи не реже 3% от всех</span></div><div class="card-b">${at.html}</div></div>` : ""}`;
  if (brow.length) bt.render();
  if (prow.length) pt.render();
  if (ars) at.render();
}

/* ---------- Конструктор ---------- */
// Тот же расчёт, что у экзамена Глико-2: логистика по разнице атак составов, стартёров и буллпенов (веса — обучены на 2018–24).
function simProb(PE, S) {
  const att = (ids) => ids.reduce((a, id, k) => a + PE.W[k] * ((PE.P[id]?.o ?? 0) / 1000), 0);
  const dp = (id) => (PE.P[id]?.d ?? 0) / 1000, bp = (ab) => (PE.teams[ab]?.bp?.d ?? 0) / 1000;
  const oh = att(S.hl), oa = att(S.al);
  const x = [oh - oa, dp(S.hp) - dp(S.ap), bp(S.home) - bp(S.away)];
  const z = PE.intercept + PE.coef.reduce((a, c, i) => a + c * x[i], 0);
  return { p: 1 / (1 + Math.exp(-z)), x, oh, oa, parts: PE.coef.map((c, i) => c * x[i]), z };
}
async function viewSim(q) {
  const PE = await people();
  const abs = Object.keys(PE.teams).filter((a) => a !== "OAK").sort((a, b) => PE.teams[a].name.localeCompare(PE.teams[b].name));
  let S;
  try { S = JSON.parse(localStorage.getItem("mlb_sim") || "null"); } catch (e) { S = null; }
  const fill = (ab) => ({ lineup: PE.teams[ab].lineup.slice(0, 9), sp: PE.teams[ab].rotation[0] ?? null });
  if (!S || !PE.teams[S.home] || !PE.teams[S.away]) {
    const h = q.h && PE.teams[q.h] ? q.h : "NYY", a = q.a && PE.teams[q.a] ? q.a : "LAD";
    S = { home: h, away: a, hl: fill(h).lineup, al: fill(a).lineup, hp: fill(h).sp, ap: fill(a).sp };
  }
  const save = () => { try { localStorage.setItem("mlb_sim", JSON.stringify(S)); } catch (e) { /* без сохранения */ } };
  const roster = (ab) => PE.teams[ab].roster.map((id) => ({ id, ...PE.P[id] })).filter((p) => p.n);
  const hitters = (ab) => roster(ab).filter((p) => !isPitcherPos(p)).concat(PE.teams[ab].lineup.map((id) => ({ id, ...PE.P[id] })).filter((p) => p.n && !roster(ab).some((r) => r.id === p.id)));
  const pitchers = (ab) => { const r = roster(ab).filter(isPitcherPos); PE.teams[ab].rotation.forEach((id) => { if (PE.P[id] && !r.some((x) => x.id === id)) r.push({ id, ...PE.P[id] }); }); return r.sort((a, b) => (b.ps?.["2026"]?.[11] ?? 0) - (a.ps?.["2026"]?.[11] ?? 0)); };
  const opt = (list, cur, fmt) => list.map((p) => `<option value="${p.id}" ${String(p.id) === String(cur) ? "selected" : ""}>${esc(p.n)}${fmt ? fmt(p) : ""}</option>`).join("");
  const side = (key, ab, lu, sp) => `<div class="card" style="padding:14px"><div style="display:flex;gap:10px;align-items:center;margin-bottom:10px">${logo(ab, "md")}<select class="select" data-team="${key}">${abs.map((a) => `<option value="${a}" ${a === ab ? "selected" : ""}>${esc(PE.teams[a].name)}</option>`).join("")}</select></div>
    <label class="faint" style="font-size:12px">Стартовый питчер</label><select class="select" data-sp="${key}" style="width:100%;margin-bottom:10px">${opt(pitchers(ab), sp, (p) => ` · защита ${sgnPts(p.d)}`)}</select>
    <label class="faint" style="font-size:12px">Состав (порядок в бите)</label>
    ${lu.map((id, k) => `<div style="display:flex;gap:6px;align-items:center;margin-top:4px"><span class="faint" style="width:16px">${k + 1}</span><select class="select" data-lu="${key}" data-k="${k}" style="flex:1">${opt(hitters(ab), id, (p) => ` · ${p.pos || ""} · ${sgnPts(p.o)}`)}</select></div>`).join("")}
    <button class="chip" data-reset="${key}" style="margin-top:10px">Состав по последней игре</button></div>`;
  const R = simProb(PE, S);
  const bar = (p) => `<div class="pbar" style="margin:6px 0"><span>${S.home}</span><div class="t"><i style="width:${100 * p}%;background:var(--accent)"></i><i style="left:auto;right:0;width:${100 * (1 - p)}%;background:var(--line-2)"></i></div><span class="v">${pct(p, 1)}</span></div>`;
  const sig = (z) => 1 / (1 + Math.exp(-z)), eff = (i) => sig(R.z) - sig(R.z - R.parts[i]);   // вклад компоненты в шанс хозяев: с ней и без неё
  const lab = ["Атака составов", "Стартовые питчеры", "Буллпены"];
  const unk = [...S.hl, ...S.al].filter((id) => !isNum(PE.P[id]?.o)).length + [S.hp, S.ap].filter((id) => !isNum(PE.P[id]?.d)).length;
  app.innerHTML = `
  <div class="page-head"><div><h1>Конструктор</h1><div class="sub">Соберите матч: команды, стартовые питчеры и составы — получите шанс хозяев по рейтингам Глико-2 (те же веса, что у экзамена). Хозяева — слева.</div></div></div>
  <div class="card" style="margin-bottom:16px"><div class="card-b">
    <div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px"><h2 style="margin:0">Шанс хозяев: ${pct(R.p, 1)}</h2><span class="muted">гости ${pct(1 - R.p, 1)} · ${esc(teamName(S.home))} — ${esc(teamName(S.away))}</span></div>
    ${bar(R.p)}
    <div class="kpis" style="margin-top:12px">${lab.map((l, i) => `<div class="card kpi"><div class="l">${l}</div><div class="v num ${cls(R.parts[i])}">${eff(i) >= 0 ? "+" : "−"}${Math.abs(eff(i) * 100).toFixed(1)}<small style="font-size:12px"> пп</small></div><div class="s">разница ${i === 0 ? sgnPts(R.x[0] * 1000) + " очков wOBA" : sgnPts(R.x[i] * 1000) + " очков"} × вес ${f1(PE.coef[i], 1)}</div></div>`).join("")}
      <div class="card kpi"><div class="l">Домашнее поле</div><div class="v num">+${Math.abs((1 / (1 + Math.exp(-PE.intercept)) - 0.5) * 100).toFixed(1)}<small style="font-size:12px"> пп</small></div><div class="s">сдвиг модели при равных силах</div></div></div>
    ${unk ? `<div class="hint">У ${unk} выбранных игроков нет рейтинга (редко выходили) — считаются средними.</div>` : ""}
    <div class="hint">Это модель Глико-2. SHARP (симуляция по подачам) считается на ПК и в конструкторе не участвует; рынок Polymarket сейчас закрыт — межсезонье.</div></div></div>
  <div class="grid g2">${side("home", S.home, S.hl, S.hp)}${side("away", S.away, S.al, S.ap)}</div>`;
  const reset = (key) => { const ab = key === "home" ? S.home : S.away, f = fill(ab); if (key === "home") { S.hl = f.lineup; S.hp = f.sp; } else { S.al = f.lineup; S.ap = f.sp; } };
  $$("[data-team]").forEach((el) => el.onchange = () => { const key = el.dataset.team; if (key === "home") S.home = el.value; else S.away = el.value; reset(key); save(); route(); });
  $$("[data-sp]").forEach((el) => el.onchange = () => { if (el.dataset.sp === "home") S.hp = +el.value; else S.ap = +el.value; save(); route(); });
  $$("[data-lu]").forEach((el) => el.onchange = () => { const arr = el.dataset.lu === "home" ? S.hl : S.al; arr[+el.dataset.k] = +el.value; save(); route(); });
  $$("[data-reset]").forEach((el) => el.onclick = () => { reset(el.dataset.reset); save(); route(); });
}

/* ---------- каркас ---------- */
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem("theme", t); } catch (e) { /* хранилище недоступно */ }
}
async function route() {
  clearCharts();
  const { view, id, q } = parseHash();
  $$(".tabs a").forEach((a) => a.classList.toggle("active", a.dataset.tab === ({ game: "games", team: "teams", player: "players" }[view] || view)));
  window.scrollTo({ top: 0 });
  document.body.classList.toggle("wide", ["bot", "games", "teams", "team", "players", "player", "sim"].includes(view) || !view);
  app.innerHTML = `<div class="loading">Загрузка…</div>`;
  try {
    if (view === "game" && id) await viewGame(id);
    else if (view === "bets") await viewBets(q);
    else if (view === "teams") await viewTeams(q);
    else if (view === "team" && id) await viewTeam(id, q);
    else if (view === "players") await viewPlayers(q);
    else if (view === "player" && id) await viewPlayer(id, q);
    else if (view === "sim") await viewSim(q);
    else if (view === "bot") await viewBot();
    else await viewGames(q);
  } catch (e) {
    app.innerHTML = `<div class="empty">Не удалось загрузить: ${esc(e.message)}</div>`;
    console.error(e);
  }
}
async function badge() {
  const b = $("#bot-badge");
  try {
    const p = (await (await fetch(APIP + "hub")).json());
    b.textContent = p.alive ? "Опрос питчеров: работает" : "Опрос питчеров: не отвечает";
    b.classList.toggle("on", !!p.alive);
  } catch (e) { b.textContent = "Опрос питчеров: —"; }
  b.style.cursor = "pointer"; b.onclick = () => (location.hash = "#/bot");
}
(async function init() {
  let t = "dark";
  try { t = localStorage.getItem("theme") || "dark"; } catch (e) { /* по умолчанию тёмная */ }
  applyTheme(t);
  $$("#src button").forEach((b) => { b.classList.toggle("active", b.dataset.s === SRC); b.onclick = () => {
    SRC = b.dataset.s; try { localStorage.setItem("src", SRC); } catch (e) { /* без сохранения */ }
    $$("#src button").forEach((x) => x.classList.toggle("active", x === b)); route(); }; });
  $("#theme").onclick = () => { applyTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light"); route(); };
  try {
    META = await api("meta");
    META.seasons.sort((a, b) => b - a);
    META.teams.forEach((x) => (TEAM[x.team] = x));
    $("#foot").innerHTML = `База собрана ${esc(ruTxt(META.built) || "—")} · Данные: Baseball Savant, MLB Stats API, Polymarket · Только для личного пользования`;
    badge(); setInterval(badge, 60000);
  } catch (e) {
    app.innerHTML = `<div class="empty">Сервер не отвечает или нет данных MLB: ${esc(e.message)}</div>`;
    return;
  }
  window.addEventListener("hashchange", route);
  route();
})();
