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
const SPORT = /\/nhl\/?$/.test(location.pathname) ? "nhl" : /\/nfl\/?$/.test(location.pathname) ? "nfl" : /\/euro\/?$/.test(location.pathname) ? "euro" : "nba";      // один сайт — три вида спорта
const NHL = SPORT === "nhl";
const NFL = SPORT === "nfl";
const EURO = SPORT === "euro";                 // Евролига: баскетбол по правилам НБА, только бумажные ставки
const ALT = SPORT !== "nba" && !EURO;                    // хоккей и американский футбол: общие правила сайта (стратегии, банк, робот)
const APIP = ALT || EURO ? `/api/${SPORT}/` : "/api/";
document.documentElement.classList.add("sport-" + SPORT);

function parseUtc(s) {
  if (!s) return null;
  const d = new Date(/Z$|[+-]\d\d:?\d\d$/.test(s) ? s.replace(/T(\d\d:\d\d)Z$/, "T$1:00Z") : s + "Z");
  return Number.isNaN(d.getTime()) ? null : d;
}
const startTime = (utc) => { const d = parseUtc(utc); return d ? ruTime(d) : ""; };

const cache = new Map();
async function api(path) {
  if (cache.has(path)) return cache.get(path);
  const r = await fetch(APIP + path);
  if (!r.ok) throw new Error((await r.text()) || r.statusText);
  const j = await r.json();
  cache.set(path, j);
  return j;
}

/* ================= источник прогноза ================= */
const SRC_NAME = { model: "SHARP", glicko: "Глико-2", mix: "SHARP + Глико" };
const SRC_STRAT = { model: "модель", glicko: "глико", mix: "смесь" };
const SRC_HINT = NFL
  ? { model: "основная модель: рейтинги игроков по снапам (EPA за розыгрыш) × ожидаемые доли снапов + квотербек, рыночный рейтинг по прошлым линиям, отдых", glicko: "Глико-2: рейтинги игроков, квотербеков и команд после каждого матча", mix: "смесь основной модели и Глико-2" }
  : NHL
  ? { model: "основная модель: xG-рейтинги игроков по сменам × ожидаемое время на льду + вратари, спецбригады, отдых", glicko: "Глико-2: рейтинги игроков и вратарей после каждого матча", mix: "смесь основной модели и Глико-2" }
  : { model: "основная модель (игроки × минуты + отрезки между заменами)", glicko: "Глико-2: рейтинги игроков после каждого матча", mix: "смесь основной модели и Глико-2 — лучшая по проверке" };
let SRC = "model";
try { SRC = localStorage.getItem("src") || "model"; } catch (e) { /* по умолчанию модель */ }
if (!SRC_NAME[SRC]) SRC = "model";
const pSrc = (g, s = SRC) => g[{ model: "model_p", glicko: "glicko_p", mix: "mix_p" }[s]];
const mSrc = (g, s = SRC) => g[{ model: "model_margin", glicko: "glicko_margin", mix: "mix_margin" }[s]];
const expSc = (g) => { const T = g.model_total, M = mSrc(g); return isNum(T) && isNum(M) ? [Math.round((T + M) / 2), Math.round((T - M) / 2)] : null; };

/* ================= команды, логотипы, фото ================= */
let META = { teams: [], seasons: [] };
const TEAM = {};
const COLORS = {
  ATL: "#E03A3E", BOS: "#0B8A45", BKN: "#8A8A8A", CHA: "#00788C", CHI: "#CE1141", CLE: "#A0204A", DAL: "#0064B1",
  DEN: "#E9B421", DET: "#C8102E", GSW: "#2A5BB5", HOU: "#D12B3F", IND: "#FDBB30", LAC: "#1D66C1", LAL: "#7A3DB8",
  MEM: "#5D76A9", MIA: "#C1123A", MIL: "#2E7D32", MIN: "#2A7AB0", NOP: "#B4975A", NYK: "#F58426", OKC: "#007AC1",
  ORL: "#0077C0", PHI: "#006BB6", PHX: "#E56020", POR: "#E03A3E", SAC: "#7B4DB3", SAS: "#8A8D8F", TOR: "#B8123A",
  UTA: "#6A4FB6", WAS: "#D6283E",
};
if (NHL) Object.assign(COLORS, {
  ANA: "#F47A38", ARI: "#8C2633", BOS: "#FFB81C", BUF: "#1F5AA8", CGY: "#C8102E", CAR: "#CE1126", CHI: "#CF0A2C", COL: "#6F263D",
  CBJ: "#1F4E9E", DAL: "#006847", DET: "#CE1126", EDM: "#FF4C00", FLA: "#C8102E", LAK: "#8A8D8F", MIN: "#154734", MTL: "#AF1E2D",
  NSH: "#FFB81C", NJD: "#CE1126", NYI: "#00539B", NYR: "#0038A8", OTT: "#C52032", PHI: "#F74902", PIT: "#FCB514", SJS: "#006D75",
  SEA: "#68A2B9", STL: "#1F5AA8", TBL: "#1F4FA8", TOR: "#1F4FA8", UTA: "#71AFE5", VAN: "#00843D", VGK: "#B4975A", WSH: "#C8102E", WPG: "#1F5AA8" });
if (NFL) Object.assign(COLORS, {
  ARI: "#97233F", ATL: "#A71930", BAL: "#6B4FBB", BUF: "#00338D", CAR: "#0085CA", CHI: "#C83803", CIN: "#FB4F14", CLE: "#FF3C00",
  DAL: "#1E5AA8", DEN: "#FB4F14", DET: "#0076B6", GB: "#2E6B4F", HOU: "#A71930", IND: "#1F5AA8", JAX: "#006778", KC: "#E31837",
  LA: "#1F5AA8", LAC: "#0080C6", LV: "#8A8D8F", MIA: "#008E97", MIN: "#6B4FBB", NE: "#C60C30", NO: "#D3BC8D", NYG: "#1F4FA8",
  NYJ: "#125740", PHI: "#1C7A7F", PIT: "#FFB612", SEA: "#69BE28", SF: "#AA0000", TB: "#D50A0A", TEN: "#4B92DB", WAS: "#A5343B" });
if (EURO) Object.assign(COLORS, {
  OLY: "#D3212D", MAD: "#7C9CD6", ULK: "#F2C100", IST: "#2C6CB5", BAR: "#A50044", PAN: "#0B8A45", ZAL: "#1F8A4C", RED: "#D1222B",
  PAR: "#5A5A5A", MIL: "#D2232A", BAS: "#C4122F", VIR: "#444444", TEL: "#F5B21B", HTA: "#C8102E", BES: "#555555", DUB: "#8B1A3A",
  VAL: "#F58426", MUN: "#DC052D", ASV: "#2BA6E0", PRS: "#1C3F94", LYO: "#2BA6E0", PAM: "#F58426", MON: "#D41F2B", KHI: "#2E7D32", CSK: "#C8102E" });
const teamColor = (t) => COLORS[t] || "#64748b";
function pairColors(a, h) {
  let ca = teamColor(a), ch = teamColor(h);
  const dist = (x, y) => { const p = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)); const [r1, g1, b1] = p(x), [r2, g2, b2] = p(y); return Math.hypot(r1 - r2, g1 - g2, b1 - b2); };
  if (dist(ca, ch) < 90) ca = "#64748b";
  return [ca, ch];
}
const EURO_LOGO = {"ASV": "https://media-cdn.incrowdsports.com/e33c6d1a-95ca-4dbc-b8cb-0201812104cc.png",
  "BAR": "https://media-cdn.incrowdsports.com/35dfa503-e417-481f-963a-bdf6f013763e.png",
  "BAS": "https://media-cdn.cortextech.io/cbc49cb0-99ce-4462-bdb7-56983ee03cf4.png",
  "DUB": "https://media-cdn.incrowdsports.com/1efae090-16e2-4963-ae47-4b94f249c244.png",
  "HTA": "https://media-cdn.incrowdsports.com/cbb1c3ad-03d5-426a-b5ef-2832a4eee484.png",
  "IST": "https://media-cdn.cortextech.io/1dU3kpCqReRp93/1BSdBWIjCgOCxM/a844756c-a58d-4666-93b8-48f7337bc79d.png",
  "MAD": "https://media-cdn.incrowdsports.com/371b0d9b-9250-4c09-bda7-0686cf024657.png",
  "MCO": "https://media-cdn.incrowdsports.com/89ed276a-2ba3-413f-8ea2-b3be209ca129.png",
  "MIL": "https://media-cdn.cortextech.io/1dU3kpCqReRp93/1BSdBWIjChWbHH/5c2f0ab6-f86a-4df0-b2f3-f9ab92f7267b.png",
  "MUN": "https://media-cdn.incrowdsports.com/817b0e58-d595-4b09-ab0b-1e7cc26249ff.png",
  "OLY": "https://media-cdn.incrowdsports.com/789423ac-3cdf-4b89-b11c-b458aa5f59a6.png",
  "PAM": "https://media-cdn.cortextech.io/1dU3kpCqReRp93/1BSdBWIjChWbHL/bc3e00b2-fea4-40be-a7ec-1e633129bde3.png",
  "PAN": "https://media-cdn.incrowdsports.com/e3dff28a-9ec6-4faf-9d96-ecbc68f75780.png",
  "PAR": "https://media-cdn.incrowdsports.com/2681304e-77dd-4331-88b1-683078c0fb49.png",
  "PRS": "https://media-cdn.incrowdsports.com/a033e5b3-0de7-48a3-98d9-d9a4b9df1f39.png",
  "RED": "https://media-cdn.incrowdsports.com/d2eef4a8-62df-4fdd-9076-276004268515.png",
  "TEL": "https://media-cdn.cortextech.io/1b533342-78f5-4932-b714-a7d80b5826b5.png",
  "ULK": "https://media-cdn.cortextech.io/1dU3kpCqReRp93/1BSdBWIjCiezrk/aa39750a-6203-49ee-a87d-edd0c6f0397d.png",
  "VIR": "https://media-cdn.cortextech.io/1dU3kpCqReRp93/1BSdBWIjCiezvk/a92d4c3b-9f9c-4163-8a10-bcf8fc15893e.png",
  "ZAL": "https://media-cdn.incrowdsports.com/0aa09358-3847-4c4e-b228-3582ee4e536d.png"};   // официальные эмблемы клубов Евролиги (api-live.euroleague.net); у ушедших клубов — запасной значок с кодом
const NFL_ESPN = { LA: "lar", WAS: "wsh" };
const logoUrl = (t) => (NFL ? `https://a.espncdn.com/i/teamlogos/nfl/500/${NFL_ESPN[t] || String(t).toLowerCase()}.png` : NHL ? `https://assets.nhle.com/logos/nhl/svg/${t}_${document.documentElement.dataset.theme === "light" ? "light" : "dark"}.svg`
  : EURO ? (EURO_LOGO[t] || "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="19" fill="${teamColor(t)}"/><text x="20" y="24.5" font-family="Arial,sans-serif" font-size="${String(t).length > 3 ? 11 : 13}" font-weight="700" text-anchor="middle" fill="#fff">${esc(t)}</text></svg>`))
  : TEAM[t] ? `https://cdn.nba.com/logos/nba/${TEAM[t].team_id}/primary/L/logo.svg` : "");
const PHOTO = {};                                // хоккей: фото игроков (адрес зависит от сезона и команды)
const logo = (t, size = "") => `<img class="logo ${size}" src="${logoUrl(t)}" alt="${esc(t)}" loading="lazy" onerror="this.style.visibility='hidden'">`;
const teamName = (t) => TEAM[t]?.name || t;
const shortName = (t) => (TEAM[t]?.name || t).split(" ").slice(-1)[0].replace("Blazers", "Trail Blazers");
const initials = (n) => String(n || "?").split(" ").map((x) => x[0]).slice(0, 2).join("");
const avatar = (pid, name, size = "") => EURO ? `<span class="avatar ${size}"><span class="ini">${esc(initials(name))}</span></span>` :
  `<span class="avatar ${size}"><img src="${NFL ? PHOTO[pid] || "/none.png" : NHL ? PHOTO[pid] || `https://assets.nhle.com/mugs/nhl/latest/${pid}.png` : `https://cdn.nba.com/headshots/nba/latest/260x190/${pid}.png`}" alt="" loading="lazy"
     onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'ini',textContent:'${esc(initials(name)).replace(/'/g, "")}'}))"></span>`;

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

const glk = (v, sd) => (isNum(v) ? `<b class="${v >= 1500 ? "good" : "bad"}">${v}</b>${isNum(sd) ? `<span class="faint" style="font-size:11px"> ±${sd}</span>` : ""}` : "—");
const GLK_TITLE = "Глико-2 перед матчем: 1500 — средний игрок; +22 пункта ≈ +1 очко на 100 владений команды, пока он на площадке; ± — неуверенность рейтинга";

/* ================= полноэкранные таблицы ================= */
// таблицам, которые не влезают по ширине, — кнопка «на весь экран»
function fsCheck() {
  $$(".tbl-wrap").forEach((w) => {
    const host = w.closest(".card") || w.parentElement;
    const on = host.classList.contains("fs");
    let bar = w.previousElementSibling?.classList.contains("fs-bar") ? w.previousElementSibling : null;
    const need = on || w.scrollWidth > w.clientWidth + 2;
    if (!need) { if (bar) bar.remove(); return; }
    if (!bar) {
      bar = document.createElement("div"); bar.className = "fs-bar";
      bar.innerHTML = `<span class="faint">таблица шире экрана — листайте вбок</span><button class="chip fs-btn"></button>`;
      w.before(bar);
      bar.querySelector("button").onclick = () => fsToggle(host);
    }
    const bt = on ? "✕ Свернуть" : "⛶ На весь экран", btn = bar.querySelector("button");
    if (btn.textContent !== bt) btn.textContent = bt;
    bar.querySelector("span").style.display = on ? "none" : "";
  });
}
function fsToggle(host, force) {
  const on = force ?? !host.classList.contains("fs");
  $$(".card.fs").forEach((c) => c.classList.remove("fs"));
  if (on) host.classList.add("fs");
  document.body.classList.toggle("fs-open", on);
  fsCheck();
}
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && $(".card.fs")) fsToggle($(".card.fs"), false); });
window.addEventListener("resize", () => { clearTimeout(window._fsT); window._fsT = setTimeout(fsCheck, 150); });
new MutationObserver(() => { clearTimeout(window._fsR); window._fsR = setTimeout(fsCheck, 60); })
  .observe(document.getElementById("app") || document.body, { childList: true, subtree: true });

/* ================= таблицы с сортировкой ================= */
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

/* ================= маршрутизация ================= */
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
async function route() {
  clearCharts();
  const { view, id, q } = parseHash();
  $$(".tabs a").forEach((a) => a.classList.toggle("active", a.dataset.tab === (view === "game" ? "games" : view === "player" ? "players" : view === "team" ? "teams" : view)));
  window.scrollTo({ top: 0 });
  document.body.classList.remove("fs-open");
  document.body.classList.toggle("wide", view === "bot" || view === "games" || !view);   // широкие таблицы — на весь большой экран
  app.innerHTML = `<div class="loading">Загрузка…</div>`;
  try {
    if (view === "teams") await viewTeams(q);
    else if (view === "team" && id) await viewTeam(id, q);
    else if (NFL && view === "props") await viewPropsNFL();
    else if (NFL && view === "game" && id) await viewGameNFL(id);
    else if (NFL && view === "player" && id) await viewPlayerNFL(id, q);
    else if (NFL && view === "players") await viewPlayersNFL(q);
    else if (NFL && view === "sim") { location.hash = "#/games"; return; }
    else if (NHL && view === "game" && id) await viewGameNHL(id);
    else if (NHL && view === "player" && id) await viewPlayerNHL(+id, q);
    else if (NHL && view === "players") await viewPlayersNHL(q);
    else if (NHL && view === "sim") { location.hash = "#/games"; return; }
    else if (view === "game" && id) await viewGame(id);
    else if (view === "player" && id) await viewPlayer(+id, q);
    else if (view === "players") await viewPlayers(q);
    else if (view === "bets") await viewBets(q);
    else if (view === "portfolio") await viewPortfolio(q);
    else if (view === "sim") await viewSim(q);
    else if (view === "bot") await viewBot(q);
    else { await viewGames(q); renderUpcoming(q); }
  } catch (e) {
    app.innerHTML = `<div class="empty">Не удалось загрузить: ${esc(e.message)}</div>`;
    console.error(e);
  }
}

/* ================= МАТЧИ ================= */
function probLine(pAway, pHome, ca, ch, label, sub, isModel) {
  if (!isNum(pHome)) return "";
  const a = 1 - pHome;
  return `<div class="prow ${isModel ? "model" : ""}"><div class="lbl">${label}${sub ? `<small>${sub}</small>` : ""}</div>
    <div class="pline"><div class="h" style="width:${100 * pHome}%;background:${ch}${isModel ? "" : "cc"};color:#fff">${pct(pHome)}</div>
    <div class="a" style="width:${100 * a}%;background:${ca}${isModel ? "" : "cc"};color:#fff">${pct(a)}</div></div></div>`;
}
function miniBar(label, pHome, ca, ch) {
  if (!isNum(pHome)) return "";
  return `<div class="pbar"><span>${label}</span><div class="t"><i style="width:${100 * pHome}%;background:${ch}"></i><i style="left:auto;right:0;width:${100 * (1 - pHome)}%;background:${ca}"></i></div><span class="v" title="шанс хозяев">${pct(pHome)}</span></div>`;
}

function gameCard(g) {
  const played = isNum(g.hp);
  const hw = played && g.hp > g.ap;
  const [ca, ch] = pairColors(g.away, g.home);
  const tags = [];
  const mp = pSrc(g), ex = expSc(g);
  if (played && isNum(mp)) {
    const right = (mp > 0.5) === hw;
    tags.push(`<span class="pill ${right ? "good" : "bad"}">${right ? "✓ модель угадала" : "✗ модель ошиблась"}</span>`);
  }
  const mkt = isNum(g.pm_24h) ? g.pm_24h : g.book_p_open;
  if (isNum(mp) && isNum(mkt) && Math.abs(mp - mkt) >= 0.05)
    tags.push(`<span class="pill acc" title="${SRC_NAME[SRC]} против ${isNum(g.pm_24h) ? "Polymarket за 24 ч" : "открытия букмекеров"}">Δ ${sgn(100 * (mp - mkt), 0)} п.п.</span>`);
  for (const b of g.bets || []) {
    if (b.status === "закрыта" && (b.strategy === SRC_STRAT[SRC] || b.strategy === "умные деньги")) tags.push(`<span class="pill ${cls(b.pnl) || "neutral"}">${b.strategy === "умные деньги" ? "Умные деньги" : "Ставка: " + b.strategy} ${money(b.pnl, 1)}</span>`);
  }
  if (g.type && g.type !== "регулярка") tags.push(`<span class="pill blue">${esc(g.type)}</span>`);
  return `<a class="card gcard" href="#/game/${g.game_id}">
    <div class="row">
      <div class="gteam ${played && !hw ? "lost" : ""}">${logo(g.home, "md")}<div><div class="abbr">${g.home}</div><div class="nm">${esc(shortName(g.home))}</div></div></div>
      <div class="gscore">
        <div class="s">${played ? `<span class="${hw ? "w" : "l"}">${g.hp}</span><span class="faint"> : </span><span class="${hw ? "l" : "w"}">${g.ap}</span>` : startTime(g.start_utc)}</div>
        <div class="e">${ex ? `ожидали ${ex[0]}:${ex[1]}` : isNum(mSrc(g)) ? `прогноз ${sgn(mSrc(g))}` : ""}</div>
      </div>
      <div class="gteam r ${played && hw ? "lost" : ""}">${logo(g.away, "md")}<div><div class="abbr">${g.away}</div><div class="nm">${esc(shortName(g.away))}</div></div></div>
    </div>
    <div class="pbars">
      ${miniBar(SRC_NAME[SRC], mp, ca, ch)}
      ${miniBar("Polymarket", isNum(g.pm_start) ? g.pm_start : null, ca, ch)}
      ${miniBar("Букмекеры", g.book_p_close, ca, ch)}
    </div>
    ${tags.length ? `<div class="gmeta"><div class="tag-row">${tags.join("")}</div></div>` : ""}
  </a>`;
}

/* ================= ближайшие матчи (расписание + таймеры) ================= */
const cdText = (t) => { let d = Math.round(t - Date.now() / 1000); if (d <= 0) return "идёт"; const D = Math.floor(d / 86400), H = Math.floor((d % 86400) / 3600), M = Math.floor((d % 3600) / 60);
  return D ? `${D} д ${H} ч` : H ? `${H} ч ${M} мин` : `${M} мин`; };
setInterval(() => $$("[data-cd]").forEach((el) => { const t = +el.dataset.cd; el.textContent = t < Date.now() / 1000 ? el.dataset.done || "" : (el.dataset.pre || "") + cdText(t); }), 30000);
async function renderUpcoming(q) {
  const box = $("#upc"); if (!box) return;
  let days = +(q.ud || 3);
  let d; try { d = await api(`upcoming?days=${days}`); } catch (e) { return; }
  if (!q.ud && !d.games.length) { days = 30; try { d = await api(`upcoming?days=30`); } catch (e) { return; } }   // до сезона — сразу месяц
  let games = d.games.filter((g) => !q.team || g.home === q.team || g.away === q.team);
  if (!games.length) {
    box.innerHTML = `<div class="card" style="margin-bottom:16px;padding:14px 16px"><b>Ближайшие матчи</b> <span class="faint">— за ${days} дн. матчей нет</span>
      <span class="seg seg-sm" id="ud" style="margin-left:10px">${[1, 3, 7, 30, 90].map((n) => `<button data-d="${n}" class="${n === days ? "active" : ""}">${n === 1 ? "сутки" : n + " дн"}</button>`).join("")}</span></div>`;
    $$("#ud button").forEach((b) => (b.onclick = () => { setQuery("games", { ...q, ud: b.dataset.d }); renderUpcoming({ ...q, ud: b.dataset.d }); }));
    return;
  }
  box.innerHTML = `<div class="card-h" style="padding:0 0 8px"><h3>Ближайшие матчи</h3>
    <div class="seg seg-sm" id="ud">${[1, 3, 7, 30].map((n) => `<button data-d="${n}" class="${n === days ? "active" : ""}">${n === 1 ? "сутки" : n + " дн"}</button>`).join("")}</div></div>
    <div style="margin-bottom:16px">${upcomingTable(games, d.sources)}</div>`;
  $$("#ud button").forEach((b) => (b.onclick = () => { setQuery("games", { ...q, ud: b.dataset.d }); renderUpcoming({ ...q, ud: b.dataset.d }); }));
  $$("#upc tr[data-g]").forEach((tr) => (tr.onclick = () => showRobotGame(tr.dataset.g)));
}

async function viewGames(q) {
  const season = +(q.season || META.seasons[0]);
  const data = await api(`games?season=${season}&src=${SRC}`);
  let games = data.games;
  const months = [...new Set(games.map((g) => g.date.slice(0, 7)))];
  const month = q.m && months.includes(q.m) ? q.m : months[months.length - 1];
  const S = data.summary || {};
  const kpi = (l, v, s) => `<div class="card kpi"><div class="l">${l}</div><div class="v num">${v}</div>${s ? `<div class="s">${s}</div>` : ""}</div>`;
  const cmpLL = (key, name) => (isNum(S[key + "_ll"]) ? kpi(name, f1(S[key + "_ll"], 3), `${SRC_NAME[SRC].toLowerCase()} на тех же матчах: <b class="${S[key + "_ll_model"] <= S[key + "_ll"] ? "good" : "bad"}">${f1(S[key + "_ll_model"], 3)}</b> · ${S[key + "_n"]} матчей`) : "");

  app.innerHTML = `<div id="upc"></div>
  <div class="page-head">
    <div><h1>Матчи ${seasonLabel(season)}</h1><div class="sub">${NFL ? "Честный прогноз в момент решения робота (рейтинги на вторник, ожидаемые составы и квотербеки) против букмекеров и Polymarket. Счёт — гости : хозяева." : NHL ? "Честный прогноз за 48 ч до матча (ожидаемые составы и стартовые вратари) против букмекеров и Polymarket. Счёт — гости : хозяева, с овертаймом и буллитами." : "Прогноз модели «накануне» против букмекеров и Polymarket. Счёт — гости : хозяева."}</div></div>
    <div class="chips" id="seasons">${META.seasons.map((s) => `<button class="chip ${s === season ? "active" : ""}" data-s="${s}">${seasonLabel(s)}</button>`).join("")}</div>
  </div>
  <div class="card" style="margin-bottom:16px">
    <div class="card-h"><h3>Как модель отработала сезон</h3><span class="muted">log loss — ошибка вероятностей, меньше — лучше</span></div>
    <div class="card-b grid g2" style="align-items:center">
      <div class="kpis" style="margin:0">
        ${kpi("Угадано победителей", pct(S.model_acc, 1), `${S.games || 0} матчей`)}
        ${kpi("Ошибка: " + SRC_NAME[SRC], f1(S.model_ll, 3), "log loss")}
        ${cmpLL("book_open", "Букмекеры, открытие")}
        ${cmpLL("book_close", "Букмекеры, закрытие")}
        ${cmpLL("pm_24h", "Polymarket за 24 ч")}
        ${cmpLL("pm_start", "Polymarket на старте")}
      </div>
      <div><div class="chart-box sm"><canvas id="calib"></canvas></div><div class="hint">Калибровка: если модель говорит «60%», хозяева должны выигрывать ~60% таких матчей (точки у диагонали — хорошо).</div></div>
    </div>
  </div>
  <div class="toolbar">
    <select class="select" id="team"><option value="">Все команды</option>${META.teams.map((t) => `<option value="${t.team}" ${q.team === t.team ? "selected" : ""}>${esc(t.name)}</option>`).join("")}</select>
    <label class="toggle"><input type="checkbox" id="f-pm" ${q.pm ? "checked" : ""}> есть Polymarket</label>
    <label class="toggle"><input type="checkbox" id="f-div" ${q.div ? "checked" : ""}> расхождение ≥ 5 п.п.</label>
    <label class="toggle"><input type="checkbox" id="f-miss" ${q.miss ? "checked" : ""}> модель ошиблась</label>
    <label class="toggle"><input type="checkbox" id="f-bet" ${q.bet ? "checked" : ""}> были ставки</label>
  </div>
  <div class="chips" id="months" style="margin-bottom:4px">${q.team || q.pm || q.div || q.miss || q.bet ? "" : months.map((m) => `<button class="chip ${m === month ? "active" : ""}" data-m="${m}">${MONTHS[+m.slice(5) - 1]}</button>`).join("")}</div>
  <div id="list"></div>`;

  const filtered = () => {
    let r = games;
    if (q.team) r = r.filter((g) => g.home === q.team || g.away === q.team);
    if (q.pm) r = r.filter((g) => isNum(g.pm_start));
    if (q.div) r = r.filter((g) => { const m = isNum(g.pm_24h) ? g.pm_24h : g.book_p_open; return isNum(pSrc(g)) && isNum(m) && Math.abs(pSrc(g) - m) >= 0.05; });
    if (q.miss) r = r.filter((g) => isNum(pSrc(g)) && isNum(g.hp) && (pSrc(g) > 0.5) !== (g.hp > g.ap));
    if (q.bet) r = r.filter((g) => (g.bets || []).length);
    if (!(q.team || q.pm || q.div || q.miss || q.bet)) r = r.filter((g) => g.date.startsWith(month));
    return r;
  };
  const list = filtered();
  const byDay = {};
  list.forEach((g) => (byDay[g.date] = byDay[g.date] || []).push(g));
  const days = Object.keys(byDay).sort().reverse();
  $("#list").innerHTML = days.length ? days.map((d) => `<section class="day"><div class="day-h"><b>${dayTitle(d)}</b><span>${byDay[d].length} ${byDay[d].length === 1 ? "матч" : byDay[d].length < 5 ? "матча" : "матчей"}</span></div>
    <div class="games">${byDay[d].map(gameCard).join("")}</div></section>`).join("") : `<div class="empty">Нет матчей по этим фильтрам</div>`;

  const upd = (patch) => { setQuery("games", { season, m: q.m, team: q.team, pm: q.pm, div: q.div, miss: q.miss, bet: q.bet, ...patch }); route(); };
  $$("#seasons .chip").forEach((b) => b.onclick = () => upd({ season: b.dataset.s, m: "" }));
  $$("#months .chip").forEach((b) => b.onclick = () => upd({ m: b.dataset.m }));
  $("#team").onchange = (e) => upd({ team: e.target.value });
  for (const k of ["pm", "div", "miss", "bet"]) $(`#f-${k}`).onchange = (e) => upd({ [k]: e.target.checked ? 1 : "" });

  if (S.calibration) chart($("#calib"), {
    type: "scatter",
    data: { datasets: [
      { label: SRC_NAME[SRC], data: S.calibration.map((b) => ({ x: b.p, y: b.y, n: b.n })), pointRadius: (c) => 3 + Math.sqrt(c.raw?.n || 1) / 3, backgroundColor: cssVar("--accent") },
      { type: "line", label: "Идеал", data: [{ x: 0, y: 0 }, { x: 1, y: 1 }], borderColor: cssVar("--line-2"), borderDash: [4, 4], pointRadius: 0 },
    ] },
    options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { ...tooltipBase(), callbacks: { label: (c) => c.raw.n ? `прогноз ${pct(c.raw.x)} → факт ${pct(c.raw.y)} (${c.raw.n} матчей)` : "" } } },
      scales: { x: { min: 0, max: 1, title: { display: true, text: "прогноз модели: шанс хозяев" }, ticks: { callback: (v) => pct(v) } }, y: { min: 0, max: 1, title: { display: true, text: "выиграли на деле" }, ticks: { callback: (v) => pct(v) } } } },
  });
}

/* ================= МАТЧ ================= */
const BASIC = [
  { key: "min", label: "Мин", fmt: (x) => f1(x.min, 0) },
  { key: "pts", label: "Очк", fmt: (x) => `<b>${x.pts ?? "—"}</b>` },
  { key: "reb", label: "Подб", title: "подборы" },
  { key: "ast", label: "Пер", title: "результативные передачи" },
  { key: "stl", label: "Пх", title: "перехваты" },
  { key: "blk", label: "Бл", title: "блок-шоты" },
  { key: "tov", label: "Пот", title: "потери" },
  { key: "pf", label: "Фол" },
  { key: "fgm", label: "С игры", sep: true, fmt: (x) => `${x.fgm}-${x.fga}`, sort: (x) => x.fgm },
  { key: "fg_pct", label: "%", fmt: (x) => (x.fga ? pct(x.fgm / x.fga) : "—"), sort: (x) => (x.fga ? x.fgm / x.fga : null) },
  { key: "fg3m", label: "3-очк", fmt: (x) => `${x.fg3m}-${x.fg3a}` },
  { key: "fg3_pct", label: "%", fmt: (x) => (x.fg3a ? pct(x.fg3m / x.fg3a) : "—"), sort: (x) => (x.fg3a ? x.fg3m / x.fg3a : null) },
  { key: "ftm", label: "Штр", fmt: (x) => `${x.ftm}-${x.fta}` },
  { key: "ft_pct", label: "%", fmt: (x) => (x.fta ? pct(x.ftm / x.fta) : "—"), sort: (x) => (x.fta ? x.ftm / x.fta : null) },
  { key: "oreb", label: "Нап", sep: true, title: "подборы в нападении" },
  { key: "dreb", label: "Защ", title: "подборы в защите" },
  { key: "plus_minus", label: "+/−", sep: true, fmt: (x) => `<span class="${cls(x.plus_minus)}">${sgn(x.plus_minus, 0)}</span>` },
];
const ADV = [
  { key: "min", label: "Мин", fmt: (x) => f1(x.min, 0) },
  { key: "ts", label: "TS%", title: "истинный процент реализации: очки на бросок с учётом штрафных и трёхочковых", fmt: (x) => pct(x.ts, 1) },
  { key: "efg", label: "eFG%", title: "эффективный процент с игры (трёхочковый = 1.5 броска)", fmt: (x) => pct(x.efg, 1) },
  { key: "usg", label: "USG%", title: "доля владений команды, закончившихся на игроке", fmt: (x) => pct(x.usg, 1) },
  { key: "ast_pct", label: "AST%", title: "доля попаданий партнёров с его передачи, пока он на площадке", fmt: (x) => pct(x.ast_pct, 1) },
  { key: "reb_pct", label: "REB%", title: "доля доступных подборов", fmt: (x) => pct(x.reb_pct, 1) },
  { key: "oreb_pct", label: "OREB%", fmt: (x) => pct(x.oreb_pct, 1) },
  { key: "dreb_pct", label: "DREB%", fmt: (x) => pct(x.dreb_pct, 1) },
  { key: "tov_pct", label: "TOV%", title: "потерь на 100 его владений", fmt: (x) => pct(x.tov_pct, 1) },
  { key: "stl_pct", label: "STL%", fmt: (x) => pct(x.stl_pct, 1) },
  { key: "blk_pct", label: "BLK%", fmt: (x) => pct(x.blk_pct, 1) },
  { key: "gmsc", label: "GmSc", title: "Game Score (Холлинджер): итог вклада в одну цифру", fmt: (x) => `<b>${f1(x.gmsc)}</b>` },
];
const ONCOURT = [
  { key: "min", label: "Мин", fmt: (x) => f1(x.min, 0) },
  { key: "on_net", label: "± на площадке", title: "разница очков команды, пока игрок был на площадке (по отрезкам между заменами)", fmt: (x) => `<span class="${cls(x.on_net)}">${sgn(x.on_net, 0)}</span>` },
  { key: "on_ortg", label: "Атака", title: "очков команды на 100 владений, пока он на площадке", fmt: (x) => f1(x.on_ortg) },
  { key: "on_drtg", label: "Защита", title: "очков соперника на 100 владений, пока он на площадке (меньше — лучше)", fmt: (x) => f1(x.on_drtg) },
  { key: "on_xnet", label: "± без везения", title: "то же, но трёхочковые и штрафные засчитаны по обычному проценту бросавшего", fmt: (x) => `<span class="${cls(x.on_xnet)}">${sgn(x.on_xnet)}</span>` },
  { key: "rating", label: "SHARP", sep: true, title: "наша оценка игрока перед матчем: очков за 48 минут на площадке сверх среднего", fmt: (x) => `<b class="${cls(x.rating)}">${sgn(x.rating)}</b>` },
  { key: "glicko", label: "Глико-2", title: GLK_TITLE, fmt: (x) => glk(x.glicko) },
  { key: "darko", label: "DARKO", title: "DARKO DPM перед матчем (darko.app): очков на 100 владений сверх среднего", fmt: (x) => `<span class="${cls(x.darko)}">${sgn(x.darko)}</span>` },
];

function boxTable(players, team, mode, tb) {
  const colsSet = mode === "adv" ? ADV : mode === "on" ? ONCOURT : BASIC;
  const cols = [{ key: "name", label: "Игрок", l: true, sort: (x) => x.name, fmt: (x) => `<div class="pl">${avatar(x.player_id, x.name)}<span class="nm">${esc(x.name)}</span>${x.starter ? `<span class="st">С5</span>` : ""}</div>` }, ...colsSet];
  let foot = null;
  if (mode === "basic" && tb) {
    foot = { name: "Команда", min: f1(tb.min, 0), pts: `<b>${tb.pts}</b>`, reb: tb.reb, ast: tb.ast, stl: tb.stl, blk: tb.blk, tov: tb.tov, pf: tb.pf,
      fgm: `${tb.fgm}-${tb.fga}`, fg_pct: pct(tb.fgm / tb.fga), fg3m: `${tb.fg3m}-${tb.fg3a}`, fg3_pct: pct(tb.fg3m / tb.fg3a), ftm: `${tb.ftm}-${tb.fta}`, ft_pct: tb.fta ? pct(tb.ftm / tb.fta) : "—", oreb: tb.oreb, dreb: tb.dreb, plus_minus: "" };
  }
  return table({ cols, rows: players, foot, onRow: (x) => (location.hash = `#/player/${x.player_id}`), sortKey: mode === "adv" ? "gmsc" : mode === "on" ? "on_net" : null });
}

async function viewGame(id) {
  const d = await api(`game/${id}`);
  const g = d.game;
  const played = isNum(g.hp);
  const hw = played && g.hp > g.ap;
  const [ca, ch] = pairColors(g.away, g.home);
  const tb = Object.fromEntries(d.team_box.map((t) => [t.team, t]));
  const P = { [g.away]: d.player_box.filter((p) => p.team === g.away), [g.home]: d.player_box.filter((p) => p.team === g.home) };
  const start = parseUtc(g.start_utc);
  const when = start ? `${ruWd(start, true)}, ${ruDT(start)}` : dayTitle(g.date);
  const form = (arr) => `<div class="form">${arr.slice().reverse().map((f) => `<a class="${f.win ? "w" : "l"}" href="#/game/${f.game_id}" title="${dateShort(f.date)} · ${f.home ? "дома" : "в гостях"} против ${f.opp} · ${f.score}">${f.win ? "В" : "П"}</a>`).join("")}</div>`;

  const probs = [
    ...[SRC, ...Object.keys(SRC_NAME).filter((s) => s !== SRC)].map((s, i) => probLine(null, pSrc(g, s), ca, ch, SRC_NAME[s], s === "model" ? "основная, накануне" : s === "glicko" ? "рейтинги игроков, накануне" : "модель + Глико-2", i === 0)),
    probLine(null, g.pm_open, ca, ch, "Polymarket", "открытие рынка"),
    probLine(null, g.pm_24h, ca, ch, "Polymarket", "за 24 часа"),
    probLine(null, g.pm_6h, ca, ch, "Polymarket", "за 6 часов"),
    probLine(null, g.pm_1h, ca, ch, "Polymarket", "за 1 час"),
    probLine(null, g.pm_start, ca, ch, "Polymarket", "на старте"),
    probLine(null, g.book_p_open, ca, ch, "Букмекеры", "открытие линии (ESPN)"),
    probLine(null, g.book_p_close, ca, ch, "Букмекеры", `закрытие${isNum(g.books) ? ` · ${f1(g.books, 0)} конт.` : ""}`),
  ].join("");

  const verdict = (() => {
    const mp = pSrc(g), mm = mSrc(g);
    if (!played || !isNum(mp)) return "";
    const fav = mp > 0.5 ? g.home : g.away, pf = Math.max(mp, 1 - mp);
    const win = hw ? g.home : g.away;
    return `<div class="hint" style="font-size:13px;margin-top:12px">${SRC_NAME[SRC]} давала <b>${fav}</b> ${pct(pf)} — ${fav === win ? `<span class="good">победил фаворит</span>` : `<span class="bad">победил ${win}</span>`}.
      ${isNum(mm) ? `Ожидаемая разница: <b>${mm > 0 ? g.home : g.away} ${sgn(Math.abs(mm))}</b>, на деле — <b>${hw ? g.home : g.away} +${Math.abs(g.hp - g.ap)}</b>.` : ""}
      ${isNum(g.book_spread_close) ? ` Фора букмекеров: ${g.home} ${sgn(g.book_spread_close)}.` : ""}${isNum(g.book_total_close) ? ` Тотал: ${f1(g.book_total_close)} (модель ${f1(g.model_total)}, факт ${g.hp + g.ap}).` : ""}</div>`;
  })();

  const cmpItems = [
    ["Очки", "pts"], ["С игры", "fg", (t) => t.fgm / t.fga, (t) => `${pct(t.fgm / t.fga, 1)}`], ["Трёхочковые", "fg3", (t) => t.fg3m / t.fg3a, (t) => `${t.fg3m}/${t.fg3a}`],
    ["Штрафные", "ft", (t) => (t.fta ? t.ftm / t.fta : 0), (t) => `${t.ftm}/${t.fta}`], ["Подборы", "reb"], ["В нападении", "oreb"], ["Передачи", "ast"], ["Перехваты", "stl"], ["Блоки", "blk"],
    ["Потери", "tov", null, null, true], ["Фолы", "pf", null, null, true], ["Темп", "pace", null, (t) => f1(t.pace)], ["Рейтинг атаки", "ortg", null, (t) => f1(t.ortg)],
    ["eFG%", "efg", null, (t) => pct(t.efg, 1)], ["TS%", "ts", null, (t) => pct(t.ts, 1)], ["Потери %", "tov_pct", null, (t) => pct(t.tov_pct, 1), true],
    ["Подборы в нап. %", "orb_pct", null, (t) => pct(t.orb_pct, 1)], ["Штрафные / бросок", "ftr", null, (t) => f1(t.ftr, 2)],
  ];
  const A = tb[g.away], H = tb[g.home];
  const cmp = A && H ? cmpItems.map(([name, key, val, fmt, lowerBetter]) => {
    const va = val ? val(A) : A[key], vh = val ? val(H) : H[key];
    const mx = Math.max(va, vh) || 1;
    const aBetter = lowerBetter ? va < vh : va > vh, hBetter = lowerBetter ? vh < va : vh > va;
    return `<div class="cmp-row"><div class="v ${hBetter ? "" : "muted"}">${fmt ? fmt(H) : vh}</div>
      <div class="b l"><i style="width:${100 * vh / mx}%;background:${ch}${hBetter ? "" : "66"}"></i></div><div class="n">${name}</div>
      <div class="b r"><i style="width:${100 * va / mx}%;background:${ca}${aBetter ? "" : "66"}"></i></div><div class="v r ${aBetter ? "" : "muted"}">${fmt ? fmt(A) : va}</div></div>`;
  }).join("") : `<div class="muted">Нет командной статистики</div>`;

  const inactive = (team) => {
    const l = d.inactive.filter((x) => x.team === team);
    const order = { "не играет": 0, "неактивен": 0, "вряд ли сыграет": 1, "под вопросом": 2, "скорее сыграет": 3 };
    l.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));
    const played = new Set(d.player_box.map((p) => p.player_id));
    const pill = (x) => {
      if (x.status === "неактивен") return "";
      const c = x.status === "не играет" ? "bad" : x.status === "скорее сыграет" ? "good" : "acc";
      return ` <span class="pill ${c}">${esc(x.status)}${played.has(x.player_id) ? " · сыграл" : ""}</span>`;
    };
    return l.length ? `<div style="margin-top:10px"><div class="muted" style="font-size:12px;margin-bottom:6px">${team}:</div><div class="inactive">${l.map((x) => `<a href="${x.known ? `#/player/${x.player_id}` : "javascript:void 0"}">${avatar(x.player_id, x.name)}${esc(x.name)}${pill(x)}</a>`).join("")}</div></div>` : "";
  };
  const fromReport = d.inactive.some((x) => x.status && x.status !== "неактивен");
  const betRows = d.bets.map((b) => `<tr class="click" onclick="location.hash='#/bets'"><td class="l">${esc(b.strategy)} <span class="pill neutral">${esc(b.mode)}</span></td>
    <td class="l"><span class="match-mini">${logo(b.team, "sm")}<b>${b.team}</b></span></td><td>${tsDate(b.signal_t)}</td><td>${isNum(b.entry) ? f1(100 * b.entry, 1) + "¢" : "—"}</td>
    <td>${isNum(b.exit) ? f1(100 * b.exit, 1) + "¢" : "—"}</td><td class="l">${esc(b.exit_how || b.status)}</td><td class="${cls(b.pnl)}"><b>${money(b.pnl, 2)}</b></td></tr>`).join("");

  app.innerHTML = `
  <a class="back" href="javascript:history.back()">← Назад</a>
  <div class="card hero" style="--c1:${ch};--c2:${ca}">
    <div class="hero-grid">
      <div class="hteam">${logo(g.home, "lg")}<div><div class="nm">${esc(teamName(g.home))}</div><div class="sub">хозяева${isNum(g.rest_home) ? ` · отдых ${f1(g.rest_home, 0)} дн.` : ""}</div>${form(d.form.home)}</div></div>
      <div class="hscore">
        <div class="s">${played ? `<span class="${hw ? "" : "l"}">${g.hp}</span> : <span class="${hw ? "l" : ""}">${g.ap}</span>` : "—"}</div>
        <div class="d">${esc(when)}${g.type !== "регулярка" ? ` · <span class="pill blue">${esc(g.type)}</span>` : ""}</div>
        ${expSc(g) ? `<div class="exp">Ожидали (${SRC_NAME[SRC]}) <b>${expSc(g)[0]} : ${expSc(g)[1]}</b></div>` : ""}
      </div>
      <div class="hteam r">${logo(g.away, "lg")}<div><div class="nm">${esc(teamName(g.away))}</div><div class="sub">гости${isNum(g.rest_away) ? ` · отдых ${f1(g.rest_away, 0)} дн.` : ""}</div>${form(d.form.away)}</div></div>
    </div>
  </div>

  <div class="grid g2" style="margin-top:16px">
    <div class="card"><div class="card-h"><h3>Вероятность победы</h3><div class="legend"><span><i style="background:${ch}"></i>${g.home}</span><span><i style="background:${ca}"></i>${g.away}</span></div></div>
      <div class="card-b"><div class="probs">${probs}</div>${verdict}</div></div>
    <div class="card"><div class="card-h"><h3>Сравнение команд</h3><div class="legend"><span>${logo(g.home, "sm")} ${g.home}</span><span>${g.away} ${logo(g.away, "sm")}</span></div></div>
      <div class="card-b"><div class="cmp">${cmp}</div></div></div>
  </div>

  <div class="grid ${d.pm_series.length > 3 ? "g2" : ""}" style="margin-top:16px">
    ${d.flow.length ? `<div class="card"><div class="card-h"><h3>Ход матча</h3><span class="muted">разница в счёте по ходу игры</span></div><div class="card-b"><div class="chart-box"><canvas id="flow"></canvas></div></div></div>` : ""}
    ${d.pm_series.length > 3 ? `<div class="card"><div class="card-h"><h3>Цена Polymarket</h3><span class="muted">шанс ${g.home} по часам до начала</span></div><div class="card-b"><div class="chart-box"><canvas id="pm"></canvas></div></div></div>` : ""}
  </div>

  ${d.bets.length ? `<div class="card" style="margin-top:16px"><div class="card-h"><h3>Наши ставки на этот матч</h3></div><div class="card-b tbl-wrap"><table class="tbl"><thead><tr><th class="l">Стратегия</th><th class="l">На кого</th><th>Сигнал</th><th>Вход</th><th>Выход</th><th class="l">Как закрыта</th><th>Итог ($100)</th></tr></thead><tbody>${betRows}</tbody></table></div></div>` : ""}

  <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:26px">
    <div class="section-title" style="margin:0">Статистика игроков</div>
    <div class="seg" id="boxmode"><button data-m="basic" class="active">Основная</button><button data-m="adv">Расширенная</button><button data-m="on">На площадке и рейтинги</button></div>
  </div>
  <div id="boxes"></div>
  ${d.inactive.length ? `<div class="card" style="margin-top:16px"><div class="card-h"><h3>${fromReport ? "Травмы и отсутствия" : "Не играли"}</h3><span class="muted">${fromReport ? "последний отчёт NBA о травмах перед началом" : "официальный список неактивных"}</span></div><div class="card-b">${inactive(g.home)}${inactive(g.away)}</div></div>` : ""}
  ${d.h2h.length ? `<div class="card" style="margin-top:16px"><div class="card-h"><h3>Прошлые встречи</h3></div><div class="card-b tbl-wrap"><table class="tbl"><tbody>${d.h2h.map((m) => `<tr class="click" onclick="location.hash='#/game/${m.game_id}'"><td class="l">${dateShort(m.date)}</td><td class="l"><span class="match-mini">${logo(m.home, "sm")}${m.home} <span class="muted">—</span> ${logo(m.away, "sm")}${m.away}</span></td><td><b>${m.hp} : ${m.ap}</b></td></tr>`).join("")}</tbody></table></div></div>` : ""}
  <div class="hint">С5 — в стартовой пятёрке. «На площадке» считается по отрезкам между заменами из play-by-play; в редких матчах, где данные не сходятся со счётом, эти поля пустые.</div>`;

  const renderBoxes = (mode) => {
    const parts = [g.home, g.away].map((t) => ({ t, tbl: boxTable(P[t], t, mode, tb[t]) }));
    $("#boxes").innerHTML = parts.map(({ t, tbl }) => `<div class="card" style="margin-top:12px"><div class="box-head">${logo(t, "md")}<h3>${esc(teamName(t))}</h3>${tb[t] ? `<span class="muted">${tb[t].pts} очк. · темп ${f1(tb[t].pace)} · атака ${f1(tb[t].ortg)}</span>` : ""}</div><div class="card-b" style="padding-top:4px">${tbl.html}</div></div>`).join("");
    parts.forEach((p) => p.tbl.render());
  };
  renderBoxes("basic");
  $$("#boxmode button").forEach((b) => b.onclick = () => { $$("#boxmode button").forEach((x) => x.classList.toggle("active", x === b)); renderBoxes(b.dataset.m); });

  if (d.flow.length) {
    const pts = [{ x: 0, y: 0 }, ...d.flow.map((f) => ({ x: f.t / 60, y: f.h - f.a }))];
    const end = Math.max(48, pts[pts.length - 1].x);
    pts.push({ x: end, y: pts[pts.length - 1].y });
    chart($("#flow"), {
      type: "line",
      data: { datasets: [{ data: pts, stepped: true, borderWidth: 2, borderColor: cssVar("--muted"), pointRadius: 0, fill: { target: "origin", above: ch + "66", below: ca + "66" } }] },
      options: { maintainAspectRatio: false, parsing: false, plugins: { legend: { display: false }, tooltip: { ...tooltipBase(), intersect: false, mode: "index", callbacks: { title: (c) => `${f1(c[0].raw.x, 1)} мин`, label: (c) => c.raw.y === 0 ? "ничья" : `${c.raw.y > 0 ? g.home : g.away} +${Math.abs(c.raw.y)}` } } },
        scales: { x: { type: "linear", min: 0, max: end, ticks: { stepSize: 12, callback: (v) => `${v} мин` }, grid: { color: (c) => (c.tick.value % 12 === 0 ? cssVar("--line-2") : "transparent") } },
          y: { ticks: { callback: (v) => (v > 0 ? `${g.home} +${v}` : v < 0 ? `${g.away} +${-v}` : "0") } } } },
    });
  }
  if (d.pm_series.length > 3) {
    const tip = start ? start.getTime() / 1000 : d.pm_series[d.pm_series.length - 1].t;
    const ser = d.pm_series.filter((x) => x.t <= tip + 3 * 3600).map((x) => ({ x: (x.t - tip) / 3600, y: x.p_home }));
    const x0 = Math.max(ser[0]?.x ?? -48, -96);
    chart($("#pm"), {
      type: "line",
      data: { datasets: [
        { label: `Polymarket: ${g.home}`, data: ser.filter((p) => p.x >= x0), borderColor: ch, backgroundColor: ch + "22", fill: true, pointRadius: 0, borderWidth: 2, stepped: true },
        ...(isNum(pSrc(g)) ? [{ label: SRC_NAME[SRC], data: [{ x: x0, y: pSrc(g) }, { x: 3, y: pSrc(g) }], borderColor: cssVar("--accent"), borderDash: [6, 4], pointRadius: 0, borderWidth: 2 }] : []),
        ...(isNum(g.book_p_close) ? [{ label: "Букмекеры (закрытие)", data: [{ x: 0, y: g.book_p_close }], borderColor: cssVar("--violet"), backgroundColor: cssVar("--violet"), pointRadius: 5, showLine: false }] : []),
      ] },
      options: { maintainAspectRatio: false, parsing: false, interaction: { intersect: false, mode: "nearest" },
        plugins: { legend: { labels: { boxWidth: 12 } }, tooltip: { ...tooltipBase(), callbacks: { title: (c) => (c[0].raw.x < 0 ? `за ${f1(-c[0].raw.x, 1)} ч до начала` : `через ${f1(c[0].raw.x, 1)} ч после начала`), label: (c) => `${c.dataset.label}: ${pct(c.raw.y, 1)}` } } },
        scales: { x: { type: "linear", min: x0, max: 3, title: { display: true, text: "часов до начала (0 — старт)" }, grid: { color: (c) => (c.tick.value === 0 ? cssVar("--accent") : cssVar("--line")) } }, y: { ticks: { callback: (v) => pct(v) } } } },
    });
  }
}

/* ================= ИГРОКИ ================= */
async function viewPlayers(q) {
  const qs = new URLSearchParams(); if (q.q) qs.set("q", q.q); if (q.team) qs.set("team", q.team);
  if (SRC === "glicko") qs.set("order", "glicko");
  const d = await api(`players?${qs}`);
  app.innerHTML = `
  <div class="page-head"><div><h1>Игроки</h1><div class="sub">Наша оценка на ${d.rating_date ? dateShort(d.rating_date) : "—"} — сколько очков за 48 минут игрок добавляет команде сверх среднего. Глико-2 — рейтинг по шкале 1500${d.glicko_date ? ` на ${dateShort(d.glicko_date)}` : ""}. Рядом — DARKO для сравнения. ${SRC === "glicko" ? "Список — по Глико-2." : "Список — по рейтингу модели; при переключателе «Глико-2» — по Глико."}</div></div></div>
  <div class="toolbar">
    <input class="input" id="pq" placeholder="Поиск по имени…" value="${esc(q.q || "")}">
    <select class="select" id="pt"><option value="">Все команды</option>${META.teams.map((t) => `<option value="${t.team}" ${q.team === t.team ? "selected" : ""}>${esc(t.name)}</option>`).join("")}</select>
  </div>
  <div class="card"><div class="card-b" id="ptbl"></div></div>`;
  const cols = [
    { key: "rank", label: "#", l: true, nosort: true, fmt: (x, i) => `<span class="faint">${i + 1}</span>` },
    { key: "name", label: "Игрок", l: true, sort: (x) => x.name, fmt: (x) => `<div class="pl">${avatar(x.player_id, x.name)}<span class="nm">${esc(x.name)}</span></div>` },
    { key: "team", label: "Команда", l: true, fmt: (x) => `<span class="match-mini">${logo(x.team, "sm")}${x.team}</span>` },
    { key: "rating", label: "SHARP", fmt: (x) => `<b class="${cls(x.rating)}">${sgn(x.rating)}</b>` },
    { key: "glicko", label: "Глико-2", title: GLK_TITLE, fmt: (x) => glk(x.glicko, x.glicko_sd) },
    { key: "darko", label: "DARKO", fmt: (x) => `<span class="${cls(x.darko)}">${sgn(x.darko)}</span>` },
    { key: "gp", label: "И", sep: true, sort: (x) => x.season_avg?.gp, fmt: (x) => x.season_avg?.gp ?? "—" },
    { key: "min", label: "Мин", sort: (x) => x.season_avg?.min, fmt: (x) => f1(x.season_avg?.min) },
    { key: "pts", label: "Очк", sort: (x) => x.season_avg?.pts, fmt: (x) => `<b>${f1(x.season_avg?.pts)}</b>` },
    { key: "reb", label: "Подб", sort: (x) => x.season_avg?.reb, fmt: (x) => f1(x.season_avg?.reb) },
    { key: "ast", label: "Пер", sort: (x) => x.season_avg?.ast, fmt: (x) => f1(x.season_avg?.ast) },
    { key: "draft", label: "Драфт", l: true, sep: true, sort: (x) => x.draft_pick, fmt: (x) => (x.draft_year ? `${x.draft_year} · №${f1(x.draft_pick, 0)}` : `<span class="faint">не выбран</span>`) },
  ];
  const t = table({ cols, rows: d.players, onRow: (x) => (location.hash = `#/player/${x.player_id}`), sortKey: SRC === "glicko" ? "glicko" : undefined });
  $("#ptbl").innerHTML = d.players.length ? t.html : `<div class="empty">Никого не нашли</div>`;
  t.render();
  let timer;
  $("#pq").oninput = (e) => { clearTimeout(timer); timer = setTimeout(() => { setQuery("players", { q: e.target.value, team: q.team }); route().then(() => { const i = $("#pq"); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }); }, 350); };
  $("#pt").onchange = (e) => { setQuery("players", { q: q.q, team: e.target.value }); route(); };
}

async function viewPlayer(pid, q) {
  const d = await api(`player/${pid}${q.season ? `?season=${q.season}` : ""}`);
  const p = d.player;
  const cur = d.seasons.find((s) => s.season === d.season && s.type === "регулярка") || d.seasons[0];
  const lastR = d.ratings[d.ratings.length - 1], lastD = d.darko[d.darko.length - 1], lastG = (d.glicko || [])[(d.glicko || []).length - 1];
  const color = teamColor(p.team);
  const seasonsList = [...new Set(d.seasons.map((s) => s.season))];
  app.innerHTML = `
  <a class="back" href="javascript:history.back()">← Назад</a>
  <div class="card phero hero" style="--c1:${color};--c2:${color}">
    ${avatar(p.player_id, p.name, "xl")}
    <div>
      <div class="nm">${esc(p.name)}</div>
      <div class="meta">
        <span class="match-mini">${logo(p.team, "sm")}<b>${esc(teamName(p.team))}</b></span>
        <span>Драфт: <b>${p.draft_year ? `${p.draft_year}, №${f1(p.draft_pick, 0)}${p.draft_team ? " (" + p.draft_team + ")" : ""}` : "не выбран"}</b></span>
        ${p.college ? `<span>До НБА: <b>${esc(p.college)}</b></span>` : ""}
        <span>Матчей в базе: <b>${p.games}</b></span>
      </div>
    </div>
    <div class="pstats">
      <div><div class="v">${f1(cur?.pts)}</div><div class="l">очков</div></div>
      <div><div class="v">${f1(cur?.reb)}</div><div class="l">подборов</div></div>
      <div><div class="v">${f1(cur?.ast)}</div><div class="l">передач</div></div>
      <div><div class="v ${cls(lastR?.rating)}">${sgn(lastR?.rating)}</div><div class="l">рейтинг SHARP</div></div>
      <div title="${GLK_TITLE}"><div class="v ${lastG ? (lastG.glicko >= 1500 ? "good" : "bad") : ""}">${lastG ? lastG.glicko : "—"}</div><div class="l">Глико-2${lastG ? ` ±${lastG.glicko_sd}` : ""}</div></div>
      <div><div class="v ${cls(lastD?.dpm)}">${sgn(lastD?.dpm)}</div><div class="l">DARKO</div></div>
      <div><div class="v">${pct(cur?.ts, 1)}</div><div class="l">TS%</div></div>
    </div>
  </div>
  <div class="grid g2" style="margin-top:16px">
    <div class="card"><div class="card-h"><h3>Рейтинг по времени</h3><span class="muted">перед каждым матчем, без будущего</span></div><div class="card-b"><div class="chart-box"><canvas id="rt"></canvas></div></div></div>
    <div class="card"><div class="card-h"><h3>Очки по матчам · ${seasonLabel(d.season)}</h3><span class="muted">яркие — победы</span></div><div class="card-b"><div class="chart-box"><canvas id="pp"></canvas></div></div></div>
  </div>
  ${(d.glicko || []).length ? `<div class="card" style="margin-top:16px"><div class="card-h"><h3>Глико-2 по времени</h3><span class="muted">шкала 1500 · полоса — неуверенность ±1σ · атака ${sgn(lastG.off)} · защита ${sgn(lastG.def)} очка на 100 владений</span></div><div class="card-b"><div class="chart-box"><canvas id="gl"></canvas></div></div></div>` : ""}
  <div class="chips" id="pseasons" style="margin-top:14px">${seasonsList.map((s) => `<button class="chip ${s === d.season ? "active" : ""}" data-s="${s}">${seasonLabel(s)}</button>`).join("")}</div>
  ${ffCard(d.ff)}
  <div class="section-title">Средние по сезонам</div>
  <div class="card"><div class="card-b" id="stbl"></div></div>
  <div class="section-title">Матчи сезона ${seasonLabel(d.season)}</div>
  <div class="card"><div class="card-b" id="ltbl"></div></div>`;

  const scols = [
    { key: "season", label: "Сезон", l: true, fmt: (x) => `<b>${seasonLabel(x.season)}</b> ${x.type !== "регулярка" ? `<span class="pill blue">${esc(x.type)}</span>` : ""}` },
    { key: "teams", label: "Команда", l: true, fmt: (x) => x.teams.split(",").map((t) => `<span class="match-mini">${logo(t, "sm")}${t}</span>`).join(" ") },
    { key: "gp", label: "И" }, { key: "gs", label: "Старт" }, { key: "min", label: "Мин", fmt: (x) => f1(x.min) },
    { key: "pts", label: "Очк", fmt: (x) => `<b>${f1(x.pts)}</b>` }, { key: "reb", label: "Подб", fmt: (x) => f1(x.reb) }, { key: "ast", label: "Пер", fmt: (x) => f1(x.ast) },
    { key: "stl", label: "Пх", fmt: (x) => f1(x.stl) }, { key: "blk", label: "Бл", fmt: (x) => f1(x.blk) }, { key: "tov", label: "Пот", fmt: (x) => f1(x.tov) },
    { key: "fg_pct", label: "С игры", sep: true, fmt: (x) => pct(x.fg_pct, 1) }, { key: "fg3_pct", label: "3-очк", fmt: (x) => pct(x.fg3_pct, 1) }, { key: "ft_pct", label: "Штр", fmt: (x) => pct(x.ft_pct, 1) },
    { key: "ts", label: "TS%", sep: true, fmt: (x) => pct(x.ts, 1) }, { key: "usg", label: "USG%", fmt: (x) => pct(x.usg, 1) }, { key: "ast_pct", label: "AST%", fmt: (x) => pct(x.ast_pct, 1) }, { key: "reb_pct", label: "REB%", fmt: (x) => pct(x.reb_pct, 1) },
    { key: "gmsc", label: "GmSc", fmt: (x) => f1(x.gmsc) }, { key: "pm", label: "+/−", fmt: (x) => `<span class="${cls(x.pm)}">${sgn(x.pm)}</span>` }, { key: "on_net", label: "± на площ.", fmt: (x) => `<span class="${cls(x.on_net)}">${sgn(x.on_net)}</span>` },
  ];
  const st = table({ cols: scols, rows: d.seasons, onRow: (x) => { setQuery(`player/${pid}`, { season: x.season }); route(); } });
  $("#stbl").innerHTML = st.html; st.render();

  const lcols = [
    { key: "date", label: "Дата", l: true, sort: (x) => x.date, fmt: (x) => dateShort(x.date) },
    { key: "opp", label: "Соперник", l: true, sort: (x) => (x.team === x.home ? x.away : x.home), fmt: (x) => { const opp = x.team === x.home ? x.away : x.home; return `<span class="match-mini">${x.team === x.home ? "" : "@ "}${logo(opp, "sm")}${opp}</span>`; } },
    { key: "res", label: "Итог", l: true, nosort: true, fmt: (x) => { const own = x.team === x.home ? x.hp : x.ap, opp = x.team === x.home ? x.ap : x.hp; return `<span class="${own > opp ? "good" : "bad"}"><b>${own > opp ? "В" : "П"}</b> ${own}:${opp}</span>`; } },
    ...BASIC, { key: "gmsc", label: "GmSc", sep: true, fmt: (x) => f1(x.gmsc) }, { key: "ts", label: "TS%", fmt: (x) => pct(x.ts, 1) }, { key: "usg", label: "USG%", fmt: (x) => pct(x.usg, 1) },
    { key: "on_net", label: "± на площ.", fmt: (x) => `<span class="${cls(x.on_net)}">${sgn(x.on_net, 0)}</span>` },
  ];
  const lt = table({ cols: lcols, rows: d.log, onRow: (x) => (location.hash = `#/game/${x.game_id}`), sortKey: "date" });
  $("#ltbl").innerHTML = d.log.length ? lt.html : `<div class="empty">Нет матчей</div>`; lt.render();
  $$("#pseasons .chip").forEach((b) => b.onclick = () => { setQuery(`player/${pid}`, { season: b.dataset.s }); route(); });

  const toX = (s) => new Date(s + "T12:00:00").getTime();
  const xs = [...d.ratings.map((r) => toX(r.date)), ...d.darko.filter((r) => r.date >= (d.ratings[0]?.date || "")).map((r) => toX(r.date))];
  const rMin = xs.length ? Math.min(...xs) : undefined, rMax = xs.length ? Math.max(...xs) : undefined;
  chart($("#rt"), {
    type: "line",
    data: { datasets: [
      { label: "SHARP", data: d.ratings.map((r) => ({ x: toX(r.date), y: r.rating })), borderColor: cssVar("--accent"), pointRadius: 0, borderWidth: 2, tension: .25 },
      { label: "DARKO", data: d.darko.filter((r) => r.date >= (d.ratings[0]?.date || "")).map((r) => ({ x: toX(r.date), y: r.dpm })), borderColor: cssVar("--blue"), pointRadius: 0, borderWidth: 1.5, tension: .25 },
    ] },
    options: { maintainAspectRatio: false, parsing: false, interaction: { intersect: false, mode: "nearest", axis: "x" },
      plugins: { legend: { labels: { boxWidth: 12 } }, tooltip: { ...tooltipBase(), callbacks: { title: (c) => new Date(c[0].raw.x).toLocaleDateString("ru-RU"), label: (c) => `${c.dataset.label}: ${sgn(c.raw.y)}` } } },
      scales: { x: { type: "linear", min: rMin, max: rMax, ticks: { maxTicksLimit: 8, callback: (v) => ruMonthY(new Date(v)) } }, y: { grid: { color: (c) => (c.tick.value === 0 ? cssVar("--line-2") : cssVar("--line")) } } } },
  });
  if ((d.glicko || []).length) {
    const G = d.glicko, gc = cssVar("--violet");
    chart($("#gl"), {
      type: "line",
      data: { datasets: [
        { label: "верх", data: G.map((r) => ({ x: toX(r.date), y: r.glicko + r.glicko_sd })), borderWidth: 0, pointRadius: 0, fill: false },
        { label: "низ", data: G.map((r) => ({ x: toX(r.date), y: r.glicko - r.glicko_sd })), borderWidth: 0, pointRadius: 0, fill: "-1", backgroundColor: gc + "26" },
        { label: "Глико-2", data: G.map((r) => ({ x: toX(r.date), y: r.glicko })), borderColor: gc, pointRadius: 0, borderWidth: 2, tension: .2 },
      ] },
      options: { maintainAspectRatio: false, parsing: false, interaction: { intersect: false, mode: "nearest", axis: "x" },
        plugins: { legend: { display: false }, tooltip: { ...tooltipBase(), filter: (c) => c.datasetIndex === 2,
          callbacks: { title: (c) => new Date(c[0].raw.x).toLocaleDateString("ru-RU"), label: (c) => { const r = G[c.dataIndex]; return `Глико-2: ${r.glicko} ±${r.glicko_sd} (атака ${sgn(r.off)}, защита ${sgn(r.def)})`; } } } },
        scales: { x: { type: "linear", min: toX(G[0].date), max: toX(G[G.length - 1].date), ticks: { maxTicksLimit: 8, callback: (v) => ruMonthY(new Date(v)) } },
          y: { grid: { color: (c) => (c.tick.value === 1500 ? cssVar("--line-2") : cssVar("--line")) } } } },
    });
  }
  ffChart(d.ff);
  const logAsc = d.log.slice().reverse();
  chart($("#pp"), {
    type: "bar",
    data: { labels: logAsc.map((x) => dateShort(x.date)), datasets: [{ label: "Очки", data: logAsc.map((x) => x.pts), backgroundColor: logAsc.map((x) => { const own = x.team === x.home ? x.hp : x.ap, opp = x.team === x.home ? x.ap : x.hp; return own > opp ? color + "dd" : color + "66"; }), borderRadius: 3 }] },
    options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { ...tooltipBase(), callbacks: { afterLabel: (c) => { const x = logAsc[c.dataIndex]; return `${x.min} мин · ${x.reb} подб · ${x.ast} пер`; } } } },
      scales: { x: { ticks: { maxTicksLimit: 10, maxRotation: 0 } }, y: { beginAtZero: true } },
      onClick: (e, els) => { if (els.length) location.hash = `#/game/${logAsc[els[0].index].game_id}`; } },
  });
}

/* ================= СТАВКИ ================= */
const MODES = ["симуляция", "бумага", "реально"];                 // одинаково у НБА и НХЛ
const MODE_TITLE = { "симуляция": "Симуляция 2024-26", "бумага": "Бумажные", "реально": "Реальные" };
const STRATS = {
  hold: { name: "Основная модель", icon: '<svg class="sic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18M5 8l7-5 7 5M5 16l7 5 7-5M5 8v8M19 8v8" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>', color: "--accent",
    rule: "За ~24 ч до матча, если модель расходится с ценой Polymarket больше чем на 3 п.п. (основная часть регулярки), ставим <b>свою заявку</b> на цент ниже середины и <b>держим до конца матча</b>. Выигрыш зависит от исхода — доходность выше, но и разброс большой." },
  swing: { name: "Выход до начала матча", icon: '<svg class="sic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 9v4l3 2M9 2h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>', color: "--blue",
    rule: "Те же сигналы и та же заявка, но после исполнения сразу ставим заявку на продажу <b>+2 ¢</b>; не сработала — <b>продаём перед началом</b>. Зарабатываем на движении цены к началу матча, исход не важен — разброс в разы меньше." },
  smart: { name: "Умные деньги", icon: '<svg class="sic" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17c3-6 9-8 15-4M3 17h13a5 5 0 0 0 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="15" cy="12" r="1.2" fill="currentColor"/></svg>', color: "--violet",
    rule: "10 кошельков с лучшим CLV в первой половине сезона (ставки — только второй половины, честная проверка). Их первая сделка на матч → через 60 с покупаем ту же сторону по цене следующей сделки и держим до конца матча." },
};
const BANK_DEFAULT = ALT
  // хоккей: доверие к модели 0.6 (измерено на линиях открытия 2019–22), ставки меньше — просадки в НХЛ глубже
  ? { start: 5000, min: 0.5, max: 1, flat: 0.75, step: 25, lo: 3, hi: 12, smartScale: false, maxUsd: 150, method: "kelly", kf: 0.3, trust: 0.6 }
  : { start: 10000, min: 1, max: 3, flat: 2, step: 25, lo: 3, hi: 12, smartScale: false, maxUsd: 300, method: "kelly", kf: 0.3, trust: 0.3 };
const BANK_KEY = ALT ? "bankcfg_" + SPORT : "bankcfg";
if (NFL) BANK_DEFAULT.trust = 0.3;
const METHODS = { diff: "по разнице с ценой (п.п.)", user: "разница × 1.5·цена^0.585", kelly: "Келли (рекомендую)" };
function bankCfg() {
  try { return { ...BANK_DEFAULT, ...JSON.parse(localStorage.getItem(BANK_KEY) || "{}") }; } catch (e) { return { ...BANK_DEFAULT }; }
}
function saveBankCfg(c) { try { localStorage.setItem(BANK_KEY, JSON.stringify(c)); } catch (e) { /* без сохранения */ } }
if (NFL) {
  delete STRATS.swing; delete STRATS.smart;
  STRATS.hold.rule = "<b>Когда:</b> вторник 12:00 по Нью-Йорку перед матчем, то есть <b>за ≈ 5 суток</b> до воскресной игры (в среднем 4.8 дня; игра в понедельник — ≈ 6, в четверг — ≈ 2). За 6–7 суток эта стратегия не ставит: ранний вход проверяется отдельной бумажной строкой во вкладке «Робот» → «Проверка вперёд». Если <b>реальный перевес</b> (доверие к модели × разница модели и цены Polymarket) не меньше 3 п.п., ставим <b>свою заявку</b> на цент ниже середины и <b>держим до конца матча</b>. Исполнение — только тем объёмом, который кто-то реально продал ниже нашей цены.";
} else if (NHL) {
  delete STRATS.swing; delete STRATS.smart;
  STRATS.hold.rule = "За 48 ч до матча, если <b>реальный перевес</b> (0.6 × разница модели и цены Polymarket) не меньше 3 п.п., ставим <b>свою заявку</b> на цент ниже середины и <b>держим до конца матча</b>. Исполнение — только тем объёмом, который кто-то реально продал ниже нашей цены.";

}

// «догонять цену» и «по рынку + догонка» — у обоих видов спорта (НХЛ: перевес = 0.6 × расхождение, порог рынка 5 п.п.; НБА: расхождение, 10 п.п.)
STRATS.market = { name: "По рынку + догонка", icon: '<svg class="sic" viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>', color: "--violet",
  rule: NFL ? "<b>Когда:</b> вторник 12:00 по Нью-Йорку перед матчем, то есть <b>за ≈ 5 суток</b> до воскресной игры (в среднем 4.8 дня; игра в понедельник — ≈ 6, в четверг — ≈ 2). За 6–7 суток эта стратегия не ставит: ранний вход проверяется отдельной бумажной строкой во вкладке «Робот» → «Проверка вперёд». Сильный сигнал — <b>перевес ≥ 5 п.п.</b> в момент решения — покупаем <b>сразу по цене продавца</b> (только тем объёмом, который по таким ценам реально покупали, плюс комиссия Polymarket). Слабый (3–5 п.п.) — заявка на цент ниже середины с догонкой. Держим до конца матча."
    : NHL ? "Сильный сигнал — <b>перевес ≥ 5 п.п.</b> за 48 ч — покупаем <b>сразу по цене продавца</b> (плюс комиссия Polymarket ≈ 1 ¢): берём ставку всегда, а не только когда нам продали. Слабый (3–5 п.п.) — заявка на цент ниже середины с догонкой за 36/24/12 ч. Держим до конца матча. Робот ведёт её на бумаге рядом с другими; для реальных ставок — выбрать в настройках робота."
    : "Сильный сигнал — <b>расхождение с ценой ≥ 10 п.п.</b> за 48 ч — покупаем <b>сразу по цене продавца</b> (плюс комиссия Polymarket ≈ 1 ¢). Слабый (3–10 п.п.) — заявка на цент ниже середины с догонкой за 36/24/12 ч. За 24 ч — пересчёт по отчёту о травмах: наша сторона переоценена — выходим. Держим до конца матча. Робот ведёт её на бумаге; для реальных — выбрать в настройках робота." };
STRATS.book = { name: "По стакану (все сигналы)", icon: '<svg class="sic" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h11M4 17h7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>', color: "--good",
  rule: (NFL ? "<b>Когда:</b> вторник 12:00 по Нью-Йорку перед матчем, то есть <b>за ≈ 5 суток</b> до воскресной игры (в среднем 4.8 дня; игра в понедельник — ≈ 6, в четверг — ≈ 2). За 6–7 суток эта стратегия не ставит: ранний вход проверяется отдельной бумажной строкой во вкладке «Робот» → «Проверка вперёд». " : "") + "За " + (NFL ? "≈ 5 суток (в момент решения)" : "48 ч") + " до матча <b>каждый сигнал без исключений</b> покупаем <b>сразу по цене продавца</b> (без ожидания заявки и без дополнительных фильтров). Комиссия Polymarket 0.05·p·(1−p) на акцию (≈ 1.2 ¢ при 50 ¢) учтена. Цена продавца — первая реальная покупка нашей стороны за 3 ч после решения, а если покупок не было — оценка «середина + 2.5 ц». Объём считаем неограниченным (для ставок $5–100 это близко к правде). Робот ведёт её на бумаге (покупка сразу по продавцу, $100) рядом с остальными; для реальных ставок не подключена." };
STRATS.chase = { name: "Догонять цену", icon: '<svg class="sic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg>', color: "--blue",
  rule: NFL ? "<b>Когда:</b> вторник 12:00 по Нью-Йорку перед матчем, то есть <b>за ≈ 5 суток</b> до воскресной игры (в среднем 4.8 дня; игра в понедельник — ≈ 6, в четверг — ≈ 2). За 6–7 суток эта стратегия не ставит: ранний вход проверяется отдельной бумажной строкой во вкладке «Робот» → «Проверка вперёд». Тот же сигнал и та же заявка, но если она исполнилась не полностью — в контрольные точки (каждые сутки до −24 ч при решении во вторник) неисполненный остаток <b>переставляем на текущую середину − 1 ¢</b>, пока перевес по текущей цене ещё ≥ 3 п.п. Держим до конца матча." : "Тот же сигнал и та же заявка за 48 ч, но если она исполнилась не полностью — за <b>36, 24 и 12 ч</b> до матча неисполненный остаток <b>переставляем на текущую середину − 1 ¢</b>, пока " + (NHL ? "перевес по текущей цене ещё ≥ 3 п.п." : "расхождение с текущей ценой ещё больше 3 п.п. (после выхода по пересчёту за 24 ч — не догоняем)") + ". Цену только поднимаем за рынком. Держим до конца матча. Робот ведёт её и на бумаге, и в реальных ставках, если она выбрана в настройках." };

// из записей симуляции/робота — ставки трёх стратегий (у основной и свинга общие сигналы)
let MK = "ml";                                   // рынок на странице ставок: победа / фора / тотал
const MK_NAME = { ml: "Победа", spread: "Фора", total: "Тотал" };
let SMART_ON = false;                            // «SHARP+Глико + умные деньги» (только победа, только смесь)
const mkStrat = (src) => (MK === "spread" ? "фора·" + src : MK === "total" ? "тотал·модель" : SMART_ON && src === "смесь" ? "смесь+умные" : src);
// итог ставки на фору / тотал по счёту матча: {text, win, v}
function lineRes(b) {
  if (!b.line || !isNum(b.hp) || !isNum(b.ap)) return null;
  const num = parseFloat(b.line.split(" ").pop());
  if (b.line.startsWith("больше") || b.line.startsWith("меньше")) {
    const tot = b.hp + b.ap, over = b.line.startsWith("больше");
    return { v: tot, win: over ? tot > num : tot < num, text: `набрали <b>${tot}</b> (${tot > num ? "больше" : "меньше"} ${num})` };
  }
  const m = b.team === b.home ? b.hp - b.ap : b.ap - b.hp;
  return { v: m + num, win: m + num > 0, text: `${b.team} ${m > 0 ? "выиграл" : "проиграл"} ${m > 0 ? "+" : "−"}${Math.abs(m)}; с форой ${sgn(m + num, 1)}` };
}
function strategyBets(raw, key) {
  // реальные: каждая ставка уже со своей стратегией (plan) и фактической суммой
  const real = raw.length && raw[0].mode === "реально";
  const src = raw.filter((b) => (real ? (b.filled || 0) > 1e-9 : key === "smart" ? b.strategy === "умные деньги" : b.strategy === mkStrat(SRC_STRAT[SRC])))
    .filter((b) => real || key !== "market" || b.mode !== "симуляция" || b.market_status != null)
    .filter((b) => real || key !== "book" || b.mode !== "симуляция" || b.book_status != null)                 // «по стакану»: в симуляции — свои колонки, в бумаге — строки с планом book
    .filter((b) => real || (b.mode === "симуляция" ? key !== "chase" || b.chase_status != null           // симуляция: свои колонки «догонять»
      : key === "chase" || key === "market" || key === "book" ? b.plan === key : b.plan !== "chase" && b.plan !== "market" && b.plan !== "book"));   // бумага: свои строки на сигнал
  return src.map((b) => {
    if (real) {
      return { ...b, key, real: true, done: b.status === "закрыта", open_t: b.entry_t || b.signal_t, close_t: b.exit_t,
        ret: isNum(b.pnl) && b.stake ? b.pnl / b.stake : null, exit_px: b.exit,
        diff: isNum(b.model_p) && isNum(b.market_p) ? Math.abs(b.model_p - b.market_p) : null };
    }
    const start = parseUtc(b.start_utc);
    const x = { ...b, key, done: b.status === "закрыта", open_t: b.entry_t || b.signal_t };
    if (key === "book" && b.mode === "симуляция") {   // «по стакану»: сразу по цене продавца + комиссия, если перевес после цены ≥ 3 п.п.
      x.done = b.book_status === "закрыта"; x.status = b.book_status;
      x.entry = isNum(b.book_entry) ? b.book_entry : null;
      x.ret = isNum(b.pnl_book) ? b.pnl_book / 100 : null;
      x.retN = [b.r_book_300, b.r_book_1000, b.r_book_3000]; x.retS = [b.r_book_10, b.r_book_30];
      x.clv = isNum(b.close_p) && isNum(x.entry) ? b.close_p - x.entry : null;
      x.close_t = start ? start.getTime() / 1000 + 3 * 3600 : b.exit_t;
      x.exit_px = b.outcome; x.exit_how = "итог матча";
    } else if (key === "market" && b.mode === "симуляция") {   // «по рынку + догонка»: цена входа — продавца с комиссией или средняя по заявке
      x.done = b.market_status === "закрыта"; x.status = b.market_status;
      x.entry = isNum(b.market_entry) ? b.market_entry : null;
      x.ret = isNum(b.pnl_market) ? b.pnl_market / 100 : null;
      x.retN = [b.r_market_300, b.r_market_1000, b.r_market_3000]; x.retS = [b.r_market_10, b.r_market_30];
      x.clv = isNum(b.close_p) && isNum(x.entry) ? b.close_p - x.entry : null;
      x.close_t = start ? start.getTime() / 1000 + 3 * 3600 : b.exit_t;
      x.exit_px = b.outcome; x.exit_how = "итог матча";
    } else if (key === "chase" && b.mode === "симуляция") {   // «догонять цену» в симуляции: своё исполнение и средняя цена входа
      x.done = b.chase_status === "закрыта"; x.status = b.chase_status;
      x.entry = isNum(b.chase_entry) ? b.chase_entry : null;
      x.ret = isNum(b.pnl_chase) ? b.pnl_chase / 100 : null;
      x.retN = [b.r_chase_300, b.r_chase_1000, b.r_chase_3000]; x.retS = [b.r_chase_10, b.r_chase_30];
      x.clv = isNum(b.close_p) && isNum(x.entry) ? b.close_p - x.entry : null;
      x.close_t = start ? start.getTime() / 1000 + 3 * 3600 : b.exit_t;
      x.exit_px = b.outcome; x.exit_how = "итог матча";
    } else if (key === "hold" || key === "chase" || key === "market" || key === "book") {
      x.ret = isNum(b.pnl_hold) ? b.pnl_hold / 100 : null;
      x.retN = [b.r_hold_300, b.r_hold_1000, b.r_hold_3000]; x.retS = [b.r_hold_10, b.r_hold_30];
      x.close_t = start ? start.getTime() / 1000 + 3 * 3600 : b.exit_t;
      x.exit_px = b.outcome; x.exit_how = "итог матча";
    } else {
      x.ret = isNum(b.pnl) ? b.pnl / 100 : null;
      x.retN = [b.r_swing_300, b.r_swing_1000, b.r_swing_3000];
      x.close_t = b.exit_t; x.exit_px = b.exit;
    }
    x.diff = isNum(b.model_p) && isNum(b.market_p) ? Math.abs(b.model_p - b.market_p) : null;
    return x;
  });
}
function stakePct(b, c) {
  const q = isNum(b.entry) ? b.entry : b.market_p;              // цена нашей стороны при входе
  if (b.key === "smart") {
    if (c.smartScale && isNum(b.their_amount)) {
      const z = Math.min(Math.max((Math.log10(b.their_amount) - Math.log10(500)) / (Math.log10(20000) - Math.log10(500)), 0), 1);
      return c.min + (c.max - c.min) * z;
    }
    // Келли при постоянном ожидаемом перевесе: доля ∝ 1/(1 − цена); на цене 50 ¢ — обычная ставка
    if (c.method === "kelly" && isNum(q)) return Math.min(Math.max((c.flat * 0.5) / (1 - q), c.min), c.max);
    return c.flat;
  }
  if (!isNum(b.diff)) return c.flat;
  if (c.method === "kelly" && isNum(q) && isNum(b.model_p)) {
    // своя оценка = цена + доверие × (модель − цена); доля Келли = перевес / (1 − цена), берём kf от неё
    const tr = isNum(b.trust) ? b.trust : c.trust;
    const edge = tr * (b.model_p - (isNum(b.market_p) ? b.market_p : q)) - (q - (isNum(b.market_p) ? b.market_p : q));
    const f = (100 * c.kf * Math.max(edge, 0)) / (1 - q);
    return Math.min(Math.max(f, c.min), c.max);
  }
  const z = Math.min(Math.max((100 * b.diff - c.lo) / (c.hi - c.lo), 0), 1);
  const lin = c.min + (c.max - c.min) * z;
  if (c.method === "user" && isNum(q)) return Math.min(lin * 1.5 * Math.pow(q, 0.585), 5);
  return lin;
}
// банк во времени: ставка = % от «расчётного банка», который пересчитывается при изменении банка на ±step%
// доходность на $1 для ставки размера S: по реальной ленте сделок посчитаны $100/300/1000/3000
// (крупные исполняются хуже и в худшие моменты); между точками — по логарифму суммы
function retAt(b, S) {
  // прибыль в $ под размер ставки S: по ленте сделок посчитаны $10/30/100/300/1000/3000; между точками — линейно по сумме
  // (прибыль растёт, пока хватает продавцов по нашей цене, и дальше не растёт — доходность на $1 падает)
  const pts = [[10, b.retS?.[0]], [30, b.retS?.[1]], [100, b.ret], [300, b.retN?.[0]], [1000, b.retN?.[1]], [3000, b.retN?.[2]]]
    .filter(([, r]) => isNum(r)).map(([x, r]) => [x, r * x]);
  if (!pts.length) return b.ret;
  if (S <= pts[0][0]) return pts[0][1] / pts[0][0];
  for (let k = 1; k < pts.length; k++) {
    const [x0, p0] = pts[k - 1], [x1, p1] = pts[k];
    if (S <= x1) return (p0 + ((S - x0) / (x1 - x0)) * (p1 - p0)) / S;
  }
  return pts[pts.length - 1][1] / S;                                    // крупнее всех точек — купить больше не получится
}
// доля суммы, купленная на самом деле: выигрыш — r = доля × (1 − цена) / цена; проигрыш — r = −доля
function fillFrac(b, R) {
  if (b.real) return b.shares ? Math.min((b.filled || 0) / b.shares, 1) : null;
  if (!R || !R.stake || !isNum(R.pnl)) return null;
  const r = R.pnl / R.stake, e = isNum(b.entry) ? b.entry : b.order_price;
  if (!isNum(e) || !(e > 0 && e < 1)) return null;
  return b.exit_px ? (r * e) / (1 - e) : -r;
}
function runBank(bets, c, flat = false) {
  const ev = [];
  // закрытие не раньше открытия (время начала матча у ESPN и Polymarket иногда расходится)
  bets.filter((b) => b.done && isNum(b.ret)).forEach((b) => { ev.push({ t: b.open_t, k: 1, b }); ev.push({ t: Math.max(b.close_t || b.open_t, b.open_t + 1), k: 0, b }); });
  ev.sort((a, b) => a.t - b.t || a.k - b.k);
  let bank = c.start, ref = c.ref0 ?? c.start, peak = c.start, dd = 0, ddp = 0;
  const curve = [{ x: (ev[0]?.t || 0) * 1000, y: bank }];
  const out = new Map();
  for (const e of ev) {
    if (e.k === 1) {
      if (e.b.real) { out.set(e.b, { pct: (100 * e.b.stake) / (e.b.bank_ref || ref), ref: e.b.bank_ref || ref, stake: e.b.stake }); continue; }
      const pct = flat ? c.flat : stakePct(e.b, c);
      out.set(e.b, { pct, ref, stake: Math.min((ref * pct) / 100, c.maxUsd > 0 ? c.maxUsd : Infinity) });
    } else {
      const r = out.get(e.b);
      r.pnl = r.stake * retAt(e.b, r.stake);
      bank += r.pnl; r.bank = bank;
      if (bank >= ref * (1 + c.step / 100) || bank <= ref * (1 - c.step / 100)) ref = bank;
      peak = Math.max(peak, bank); dd = Math.min(dd, bank - peak); ddp = Math.min(ddp, (bank - peak) / peak);
      curve.push({ x: e.t * 1000, y: bank });
    }
  }
  return { res: out, bank, curve, dd, ddp, start: c.start, ref };
}

// текущие ставки робота (бумага / реально), ещё без итога матча — видны сразу после решения
const planName = (b) => (b.mode === "реально" && b.plan === "market" && b.fee !== undefined ? PLAN_NAME[b.chase_k > 0 ? "market_chase" : b.fee != null ? "market" : "market_limit"] : PLAN_NAME[b.plan]);
const PLAN_NAME = { hold: "держать", chase: "догонять", market: "по рынку", both: "держать / выход", swing: "выход до начала", book: "по стакану", market_limit: "заявка", market_chase: "заявка + догонка" };
// ---- купленные ставки в реальном времени: цена покупателей сейчас против цены входа, раз в 15 секунд, пока таблица на экране ----
let POS_TIMER = null, POS_BUSY = false;
async function posLiveTick() {
  const tb = document.querySelector("table[data-live]");
  if (!tb || document.hidden || POS_BUSY) return;
  POS_BUSY = true;
  try {
    const r = await fetch(APIP + "bets/live", { cache: "no-store" });
    if (!r.ok) throw new Error(r.status);
    const j = await r.json(), P = j.positions || {};
    let pnl = 0, cost = 0, val = 0, n = 0, miss = 0;
    tb.querySelectorAll("tbody tr[data-id]").forEach((tr) => {
      const p = P[tr.dataset.id], c = (k) => tr.querySelector(`[data-k=${k}]`);
      if (!p || !isNum(p.px)) { if (p) miss++; return; }
      c("bid").textContent = f1(100 * p.px, 1) + "¢";
      c("bid").title = `цена позиции, как на Polymarket (середина стакана): ${f1(100 * p.px, 1)}¢; покупатели ${isNum(p.bid) ? f1(100 * p.bid, 1) + "¢" : "—"}${isNum(p.ask) ? " · продавцы " + f1(100 * p.ask, 1) + "¢" : ""}; стоимость ${money(p.value, 2).replace("+", "")}; вход ${f1(100 * p.entry, 1)}¢ с комиссией; позиция ${f1(p.size, 2)} акц. на ${money(p.cost, 2).replace("+", "")}; если выиграет ${money(p.win, 2)}, если проиграет ${money(p.lose, 2)}${isNum(p.pnl_bid) ? "; если продать прямо сейчас покупателям ≈ " + money(p.pnl_bid, 2) : ""}`;
      c("pct").textContent = sgn(100 * p.pct, 1) + "%"; c("pct").className = "mono " + cls(p.pct);
      c("pnl").innerHTML = `<b>${money(p.pnl, 2)}</b>`; c("pnl").className = "mono " + cls(p.pnl);
      pnl += p.pnl; cost += p.cost; val += p.value; n++;
    });
    const sum = document.getElementById("pos-sum");
    if (sum) sum.innerHTML = n
      ? `Сейчас по купленным (цена как на Polymarket — середина стакана): стоимость <b>${money(val, 2).replace("+", "")}</b>, результат <b class="${cls(pnl)}">${money(pnl, 2)}</b> к вложенным ${money(cost, 2).replace("+", "")} с комиссией покупки (${sgn(100 * pnl / cost, 1)}%), позиций ${n}${miss ? `, без цены ${miss}` : ""}. На Polymarket результат на комиссию выше — он считает от цены без неё. Обновлено ${new Date().toLocaleTimeString("ru-RU")}, дальше — раз в 15 секунд.`
      : `Купленных позиций с ценой сейчас нет — результат появится, когда заявки исполнятся.`;
  } catch (e) {
    const sum = document.getElementById("pos-sum");
    if (sum) sum.textContent = "Цены Polymarket сейчас не получить — повторим через 15 секунд.";
  } finally { POS_BUSY = false; }
}
if (!POS_TIMER) { POS_TIMER = setInterval(posLiveTick, 15000); document.addEventListener("visibilitychange", () => { if (!document.hidden) posLiveTick(); }); }

// ---- реальные ставки: CLV отдельно для покупок по рынку (тейкер) и по заявке (мейкер) — контроль из правил от 04.10.2026 ----
function takerMakerCard(rows) {
  const mine = rows.filter((b) => b.mode === "реально" && b.status === "закрыта" && (b.filled || 0) > 1e-9 && isNum(b.clv) && !["вручную", "на Polymarket вручную"].includes(b.strategy));
  if (!mine.length) return "";
  const taker = (b) => isNum(b.entry) && isNum(b.order_price) && b.entry > b.order_price + 0.005;
  const agg = (xs) => { const st = xs.reduce((a, b) => a + (b.filled || 0) * (b.entry || b.order_price || 0), 0), pn = xs.reduce((a, b) => a + (b.pnl || 0), 0);
    return { n: xs.length, clv: xs.length ? xs.reduce((a, b) => a + b.clv, 0) / xs.length : null, pnl: pn, roi: st ? pn / st : null }; };
  const T = agg(mine.filter(taker)), M = agg(mine.filter((b) => !taker(b)));
  const row = (name, a, tip) => `<tr><td class="l" title="${tip}">${name}</td><td>${a.n}</td><td class="${cls(a.clv)}"><b>${isNum(a.clv) ? sgn(100 * a.clv, 2) + "¢" : "—"}</b></td><td class="${cls(a.pnl)}">${a.n ? money(a.pnl, 2) : "—"}</td><td class="${cls(a.roi)}">${isNum(a.roi) ? sgn(100 * a.roi, 1) + "%" : "—"}</td></tr>`;
  const verdict = T.n >= 10 && M.n >= 10
    ? (T.clv < M.clv ? `<span class="bad">CLV покупок по рынку ниже, чем по заявке — по правилам от 04.10.2026 «по рынку» отключаем (остаётся «догонять»).</span>` : `<span class="good">CLV покупок по рынку не ниже, чем по заявке — оставляем.</span>`)
    : `Пока мало: нужно не меньше 10 ставок в каждой группе, сейчас ${T.n} и ${M.n}.`;
  return `<div class="section-title">CLV по типу исполнения <span class="muted" style="font-weight:400">— закрытые реальные ставки робота</span></div>
  <div class="card"><div class="card-b tbl-wrap"><table class="tbl"><thead><tr><th class="l">Как куплено</th><th>Ставок</th><th title="цена закрытия минус цена входа (с комиссией)">CLV</th><th>Итог</th><th>ROI</th></tr></thead><tbody>
    ${row("По рынку (сразу у продавца, с комиссией)", T, "цена входа выше цены заявки более чем на 0,5 цента")}${row("По заявке (мейкер, «середина − 1 ц» и догонка)", M, "куплено по цене заявки")}</tbody></table></div>
    <div class="hint" style="padding:0 16px 14px">${verdict} Контроль из замороженных правил: если тейкерный CLV окажется ниже мейкерного, «по рынку» отключаем.</div></div>`;
}

function openBetsTable(rows, mode, stakeOf) {
  // как в симуляции: только выбранные стратегии и выбранный прогноз; сумма бумажной ставки — по управлению банком
  // «снята» / «не исполнена» — мёртвые записи (ставки нет); «пропуск», «ошибка», «повтор» — только пока матч не начался
  const live = (b) => { if (["ждёт исполнения", "куплено"].includes(b.status)) return true; if (["закрыта", "снята", "не исполнена"].includes(b.status)) return false; const t = parseUtc(b.start_utc); return !t || t.getTime() > Date.now(); };
  const open = rows.filter((b) => b.outcome == null && live(b)).sort((a, b) => (b.signal_t || 0) - (a.signal_t || 0));
  if (!open.length) return "";
  const st = (b) => {
    const f = b.shares ? (b.filled || 0) / b.shares : 0;
    const txt = b.status === "ждёт исполнения" ? (f > 0 ? `исполнено ${pct(f)}` : "заявка ждёт") : b.status === "куплено" ? (f >= 0.999 ? "куплено" : `куплено ${pct(f)}`) : b.status;
    const cl = ["ошибка", "пропуск"].includes(b.status) ? "bad" : ["повтор", "ждёт связи"].includes(b.status) ? "acc" : b.status === "куплено" ? "good" : "neutral";
    return `<span class="pill ${cl}">${esc(txt)}</span>${b.note && !/^вход за|^держим/.test(b.note) ? `<div class="faint" style="font-size:11px;white-space:normal;max-width:320px">${esc(ruTxt(b.note))}</div>` : ""}`;
  };
  const tip = (b) => { const t = parseUtc(b.start_utc); return t ? `${ruWd(t)} ${ruDT(t)}` : ""; };
  [300, 1500, 4000].forEach((t) => setTimeout(posLiveTick, t));       // таблица попадает на страницу чуть позже — первые обновления с запасом
  return `<div class="section-title">Текущие ставки <span class="muted" style="font-weight:400">— ещё без итога матча (${open.length})</span></div>
  <div class="pos-sum hint" id="pos-sum" style="margin:-4px 0 8px">Считаем, сколько стоят купленные ставки сейчас…</div>
  <div class="card"><div class="card-b tbl-wrap"><table class="tbl" data-live="${esc(mode)}"><thead><tr><th class="l">Решение</th><th class="l">Дом</th><th class="l">Гости</th><th class="l">Начало (Минск)</th><th class="l">Прогноз · стратегия</th><th class="l">На кого</th>
    <th title="шанс нашей стороны по прогнозу / цена рынка при решении">Прогноз / цена</th><th title="цена заявки; у купленных — средняя цена входа">Цена</th><th title="по какой цене можно продать прямо сейчас (лучшая цена покупателей); обновляется раз в 15 секунд">Сейчас</th><th title="текущая цена покупателей относительно цены входа">К входу</th><th title="результат, если продать сейчас по цене покупателей, без комиссии выхода; считается только по исполненной части">Прибыль сейчас</th><th>Сумма</th><th class="l">Состояние</th></tr></thead><tbody>
  ${open.map((b) => `<tr class="click" data-g="${b.game_id}" data-id="${esc(b.id)}"><td class="l">${tsDate(b.signal_t)}</td>
    <td class="l"><span class="match-mini">${logo(b.home, "sm")}${b.home}</span></td><td class="l"><span class="match-mini">${logo(b.away, "sm")}${b.away}</span></td><td class="l"><span class="faint">${tip(b)}</span></td>
    <td class="l">${esc(BOT_SRC_ALL[b.strategy] || b.strategy)} <span class="faint">· ${esc(planName(b) || b.plan || "")}</span></td>
    <td class="l"><span class="match-mini">${logo(b.team, "sm")}<b>${b.team}</b></span></td>
    <td>${isNum(b.model_p) ? pct(b.model_p, 1) : "—"} / ${isNum(b.market_p) ? pct(b.market_p, 1) : "—"}</td>
    <td>${isNum(b.entry) ? f1(100 * b.entry, 1) + "¢" : isNum(b.order_price) ? f1(100 * b.order_price, 0) + "¢" : "—"}</td>
    <td data-k="bid" class="mono">—</td><td data-k="pct" class="mono">—</td><td data-k="pnl" class="mono">—</td>
    <td>${(() => { const s = stakeOf ? stakeOf(b) : b.stake; return isNum(s) && s > 0 ? money(s, 2).replace("+", "") : "—"; })()}</td>
    <td class="l">${st(b)}</td></tr>`).join("")}</tbody></table></div>
    <div class="hint" style="padding:0 16px 14px">${mode === "бумага" ? "Бумажные — как в симуляции: выбранный вверху прогноз и выбранные стратегии; сумма — по управлению банком (процент от расчётного банка, не больше максимальной ставки). Робот ведёт бумагу по всем прогнозам и стратегиям — переключите прогноз или стратегию, чтобы увидеть другие. Итог и банк появятся после матчей." : "Реальные — робота, ваши ручные с сайта и сделанные вами прямо на Polymarket; итог и банк появятся после матчей."} Нажмите на строку — откроется матч.</div></div>`;
}

async function viewBets(q) {
  const d = await api("bets");
  const mode = q.mode || "симуляция";
  // бумага: банк, метод, мин./макс. % и лимит ставки — из настроек робота (как у реальных ставок), а не из браузера
  let bs = null;
  if (mode === "бумага" || mode === "реально") { try { bs = await api("bot/status"); } catch (e) { bs = null; } }
  const RS = bs?.settings?.["реальные"], RB_ = RS?.["банк"];
  const c = RB_ ? { ...bankCfg(), start: +RB_.start, min: +RB_.min, max: +RB_.max, flat: +RB_.flat, step: +RB_.step, lo: +RB_.lo, hi: +RB_.hi,
    method: RB_.method, kf: +RB_.kf, trust: +RB_.trust, maxUsd: +(RS["лимиты"]?.["макс_ставка_usd"] ?? 0) } : bankCfg();
  const botRef = isNum(bs?.status?.real_ref) ? bs.status.real_ref : null;
  MK = MK_NAME[q.mk] ? q.mk : "ml";
  SMART_ON = !!q.sm && MK === "ml" && SRC === "mix";
  // бумага: по умолчанию — стратегия, по которой робот ставит реально (порядок робота: по рынку → догонять → держать)
  const botS = RS ? ["market", "chase", "hold", "swing"].find((k) => (RS["стратегии"] || []).includes(k) && STRATS[k]) : null;
  const DEF_S = botS || (ALT ? "hold" : "swing");
  const sel = (q.s || DEF_S).split(",").filter((k) => STRATS[k]);
  if (!sel.length) sel.push(DEF_S);
  const seasonOf = (b) => { const dt = new Date((b.signal_t || b.entry_t || 0) * 1000); return dt.getUTCMonth() >= 7 ? dt.getUTCFullYear() : dt.getUTCFullYear() - 1; };
  const all = d.bets.filter((b) => b.mode === mode);
  const years = [...new Set(all.map(seasonOf))].sort();
  const yr = years.includes(+q.y) ? +q.y : null;
  // выбран один сезон — банк продолжается с того, чем закончились предыдущие сезоны
  const raw = yr ? all.filter((b) => seasonOf(b) <= yr) : all;
  // число на вкладке — ИСПОЛНЕННЫЕ ставки (а не все записи робота: бумажный сигнал ведётся тремя прогнозами × тремя планами, многие заявки не исполняются)
  const countTips = {};
  const counts = Object.fromEntries(MODES.map((m) => {
    const rs = d.bets.filter((b) => b.mode === m), got = (b) => (b.filled || 0) > 1e-9, mine = (b) => b.strategy === SRC_STRAT[SRC];
    let k, tip;
    if (m === "реально") { k = rs.filter(got).length; tip = `Исполненные ставки: куплено и сыграно (робота и ваши ручные). Всего записей ${rs.length} — остальные не исполнены, сняты или пропущены`; }
    else if (m === "бумага") { k = new Set(rs.filter((b) => mine(b) && got(b)).map((b) => b.game_id)).size; tip = `Матчи, где бумажная заявка по прогнозу «${SRC_NAME[SRC]}» исполнилась (по любому плану). Всего записей робота ${rs.length}: каждый сигнал ведётся тремя прогнозами и тремя планами (держать / догонять / по рынку), и значительная часть заявок не исполняется`; }
    else { k = rs.filter((b) => mine(b) && b.status === "закрыта").length; tip = `Исполненные ставки симуляции по прогнозу «${SRC_NAME[SRC]}»`; }
    countTips[m] = tip; return [m, k];
  }));
  const RB = (bs, flat = false) => {
    if (!yr) return runBank(bs, c, flat);
    const p = runBank(bs.filter((b) => seasonOf(b) < yr), c, flat);
    return runBank(bs.filter((b) => seasonOf(b) === yr), { ...c, start: p.bank, ref0: p.ref }, flat);
  };
  const byKeyAll = Object.fromEntries(Object.keys(STRATS).map((k) => [k, strategyBets(raw, k)]));
  const byKey = Object.fromEntries(Object.keys(STRATS).map((k) => [k, byKeyAll[k].filter((b) => !yr || seasonOf(b) === yr)]));
  const solo = Object.fromEntries(Object.keys(STRATS).map((k) => [k, RB(byKeyAll[k])]));
  const bets = sel.flatMap((k) => byKey[k]);
  const allSel = sel.flatMap((k) => byKeyAll[k]);
  const B = RB(allSel), F = RB(allSel, true);
  const done = bets.filter((b) => b.done && isNum(b.ret));
  let staked = 0, pnl = 0, wins = 0;
  done.forEach((b) => { const r = B.res.get(b); if (r) { staked += r.stake; pnl += r.pnl; wins += r.pnl > 0; } });
  const clv = done.length ? done.reduce((s, b) => s + (b.clv || 0), 0) / done.length : null;
  const avgPct = done.length ? done.reduce((s, b) => s + (B.res.get(b)?.pct || 0), 0) / done.length : null;
  const kpi = (l, v, s, cl = "") => `<div class="card kpi"><div class="l">${l}</div><div class="v num ${cl}">${v}</div>${s ? `<div class="s">${s}</div>` : ""}</div>`;
  const setQ = (patch) => { setQuery("bets", { s: sel.join(","), mode: q.mode, y: q.y, mk: q.mk, sm: q.sm, ...patch }); route(); };

  const card = (k) => {
    const S = STRATS[k], st = solo[k], on = sel.includes(k);
    const n = byKey[k].filter((b) => b.done).length, prof = st.bank - st.start;
    return `<div class="card strat ${on ? "on" : ""}" data-k="${k}" style="--sc:var(${S.color})">
      <div class="strat-h"><span class="strat-ic">${S.icon}</span><b>${S.name}</b>
        <label class="toggle strat-add" title="Совместить с выбранными"><input type="checkbox" data-add="${k}" ${on ? "checked" : ""}> в сумму</label></div>
      <div class="strat-v ${cls(prof)}">${money(prof)}</div>
      <div class="muted" style="font-size:12px">${n} ставок · ${pct(prof / st.start, 1)} к банку · просадка ${pct(st.ddp, 0)}</div></div>`;
  };

  app.innerHTML = `
  <div class="page-head">
    <div><h1>Ставки</h1><div class="sub">Банк на старте ${money(c.start).replace("+", "")}; ставка ${c.min}–${c.max}% банка по уверенности. ${mode === "симуляция" ? `Симуляция — по реальному журналу сделок Polymarket ${yr ? "сезона " + seasonLabel(yr) : "сезонов " + years.map(seasonLabel).join(" и ")}; ${yr && yr > years[0] ? "банк сезона продолжается с итога прошлых сезонов." : ""}` : ""}</div></div>
    <div class="chips" id="modes">${MODES.map((m) => `<button class="chip ${m === mode ? "active" : ""}" data-m="${m}" title="${esc(countTips[m])}">${MODE_TITLE[m]} · ${counts[m]}</button>`).join("")}</div>
  </div>
  <div class="chips" id="mks" style="margin:-4px 0 10px">${Object.entries(MK_NAME).map(([k, v]) => `<button class="chip ${k === MK ? "active" : ""}" data-k="${k}">${v}</button>`).join("")}
    ${MK === "ml" && SRC === "mix" ? `<label class="toggle" style="margin-left:10px" title="после нашего входа: 30 лучших кошельков (список на начало месяца по их прошлым сделкам) поставили против нас ≥ $10 000 — продаём; за нас ≥ $10 000 — докупаем полставки"><input type="checkbox" id="smart-on" ${SMART_ON ? "checked" : ""}> + умные деньги</label>` : ""}
    ${MK !== "ml" ? `<span class="hint" style="margin-left:6px">${MK === "total" ? "тотал — по командной модели тоталов (одна для всех прогнозов)" : "фора — по выбранному вверху прогнозу"}; рынки фор и тоталов на Polymarket есть только с сезона 2025-26</span>` : ""}</div>
  ${years.length > 1 ? `<div class="chips" id="years" style="margin:-4px 0 12px"><button class="chip ${yr ? "" : "active"}" data-y="">Все сезоны</button>${years.map((y) => `<button class="chip ${y === yr ? "active" : ""}" data-y="${y}">${seasonLabel(y)}</button>`).join("")}</div>` : ""}
  <div class="hint" style="margin:-6px 0 12px">${ALT ? "Сигналы" : "Сигналы «Основной модели» и «Выхода до начала матча»"} — по прогнозу <b>${SRC_NAME[SRC]}</b> (${SRC_HINT[SRC]}); переключатель — вверху страницы.</div>
  ${mode === "реально" ? `<div class="hint" style="margin:0 0 14px">Здесь все исполненные реальные ставки одним списком: и робота, и ваши ручные (с сайта или прямо на Polymarket). Колонка «Источник» показывает, кто и как поставил; у ручных ставок нет прогноза модели — поэтому там прочерки.</div>` : `<div class="strats">${Object.keys(STRATS).filter((k) => (MK === "ml" || k !== "smart") && (mode !== "реально" || k !== "book")).map(card).join("")}</div>
  <div class="hint" style="margin:-4px 0 14px">Нажмите на стратегию — откроется её страница; галочка «в сумму» — совместить несколько на общем банке.</div>`}
  ${RB_ && mode === "бумага" ? `<div class="card" style="padding:14px 18px;margin-bottom:14px"><b>⚙ Банк — как у робота</b>
    <div class="hint" style="margin-top:6px">Бумажные ставки считаются по настройкам реальных ставок робота (вкладка «Робот»): банк ${money(c.start).replace("+", "")}, ставка ${c.min}–${c.max}% (${METHODS[c.method] || c.method}), не больше ${money(c.maxUsd).replace("+", "")} на ставку${botRef ? `; расчётный банк робота сейчас ${money(botRef, 0).replace("+", "")}` : ""}. Стратегия по умолчанию — ${STRATS[DEF_S]?.name || DEF_S}, как у робота. Отличие от реальных — только осторожное исполнение: бумажная заявка исполнена, если кто-то продал <b>ниже</b> нашей цены (сделка ровно по нашей цене не засчитывается).</div></div>` : ""}
  <details class="card bankcfg" ${q.cfg ? "open" : ""} ${RB_ ? "hidden" : ""}><summary>⚙ Управление банком</summary>
    <div class="cfg-grid">
      <label>Банк на старте, $<input class="input" type="number" id="c-start" value="${c.start}" min="100" step="100"></label>
      <label>Ставка min, % банка<input class="input" type="number" id="c-min" value="${c.min}" min="0.1" step="0.1"></label>
      <label>Ставка max, % банка<input class="input" type="number" id="c-max" value="${c.max}" min="0.1" step="0.1"></label>
      <label>Обычная ставка, %<input class="input" type="number" id="c-flat" value="${c.flat}" min="0.1" step="0.1"></label>
      <label title="крупные заявки на Polymarket исполняются хуже; симуляция учитывает это по реальной ленте сделок">Максимальная ставка, $ (0 — без лимита)<input class="input" type="number" id="c-maxusd" value="${c.maxUsd ?? 300}" min="0" step="50"></label>
      <label>Пересчёт банка при изменении на, %<input class="input" type="number" id="c-step" value="${c.step}" min="1" step="1"></label>
      <label class="m-diff ${c.method === "kelly" ? "off" : ""}" title="${c.method === "kelly" ? "при методе Келли не используется: сумма зависит от перевеса и цены по формуле Келли, а min/max % только ограничивают её" : ""}">Расхождение для min / max, п.п.${c.method === "kelly" ? " — не для Келли" : ""}<span style="display:flex;gap:6px"><input class="input" type="number" id="c-lo" value="${c.lo}" step="0.5" ${c.method === "kelly" ? "disabled" : ""}><input class="input" type="number" id="c-hi" value="${c.hi}" step="0.5" ${c.method === "kelly" ? "disabled" : ""}></span></label>
      <label>Метод ставки<select class="select" id="c-method">${Object.entries(METHODS).map(([k, v]) => `<option value="${k}" ${c.method === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
      <label class="${c.method === "kelly" ? "" : "off"}">Келли: доля (0.3 ≈ ставка 2% в среднем)<input class="input" type="number" id="c-kf" value="${c.kf}" min="0.05" max="1" step="0.05" ${c.method === "kelly" ? "" : "disabled"}></label>
      <label class="${c.method === "kelly" ? "" : "off"}">Келли: доверие к модели<input class="input" type="number" id="c-trust" value="${c.trust}" min="0.05" max="1" step="0.05" ${c.method === "kelly" ? "" : "disabled"}></label>
      <label class="toggle" style="align-self:end"><input type="checkbox" id="c-smart" ${c.smartScale ? "checked" : ""}> умные деньги: ставка по размеру их сделки</label>
      <button class="chip" id="c-reset" style="align-self:end">Сбросить</button>
    </div>
    <div class="hint">Ставка = % × «расчётный банк», но не больше максимальной ставки ($${c.maxUsd || "∞"}). Расчётный банк пересчитывается, когда банк вырос или упал на заданный процент. Крупные ставки исполняются хуже — симуляция берёт результат под размер ставки по реальной ленте сделок.
    ${c.method === "kelly" ? `<b>Келли:</b> своя оценка = цена + ${c.trust} × (модель − цена); доля банка = ${c.kf} × перевес / (1 − цена), в пределах ${c.min}–${c.max}%. На андердога при том же расхождении ставка меньше — риск на доллар у него выше.`
      : c.method === "user" ? `<b>Разница × 1.5·цена^0.585:</b> ставка по разнице (≤ ${c.lo} п.п. → ${c.min}%, ≥ ${c.hi} п.п. → ${c.max}%) умножается на 1.5·цена^0.585 (цена 15 ¢ → ×0.49, 50 ¢ → ×1.0, 80 ¢ → ×1.32).`
      : `<b>По разнице:</b> расхождение модели с ценой ≤ ${c.lo} п.п. → ${c.min}%, ≥ ${c.hi} п.п. → ${c.max}%, между — пропорционально.`} Умные деньги — ${c.smartScale ? `по размеру сделки кошелька ($500 → ${c.min}%, $20 000 → ${c.max}%)` : c.method === "kelly" ? `по Келли от цены: ${c.flat}% на 50 ¢, меньше на андердогов, больше на фаворитов (в пределах ${c.min}–${c.max}%); размер их сделки не учитываем — крупные сделки не надёжнее мелких` : `ровно ${c.flat}%: у крупных сделок кошельков результат не лучше мелких`}.</div>
  </details>
  ${mode === "реально" ? "" : `<div class="bet-rules">${sel.map((k) => `<div class="card"><h4>${STRATS[k].icon} ${STRATS[k].name}</h4><p>${STRATS[k].rule}</p></div>`).join("")}</div>`}
  ${mode === "реально" ? takerMakerCard(all) + openBetsTable(all, mode) : mode === "бумага" ? openBetsTable(sel.flatMap((k) => strategyBets(all, k)), mode,
    (b) => Math.min(((botRef ?? B.ref) * stakePct(b, c)) / 100, c.maxUsd > 0 ? c.maxUsd : Infinity)) : ""}
  ${done.length ? `
  <div class="kpis">
    ${kpi("Банк", money(B.bank).replace("+", ""), `${yr && yr > years[0] ? "на начало сезона" : "старт"} ${money(B.start).replace("+", "")}`, cls(B.bank - B.start))}
    ${kpi("Прибыль", money(B.bank - B.start), `${pct((B.bank - B.start) / B.start, 1)} к банку · при ровных ${c.flat}%: ${money(F.bank - F.start)}`, cls(B.bank - B.start))}
    ${kpi("ROI", pct(staked ? pnl / staked : null, 2), `оборот ${money(staked).replace("+", "")}`)}
    ${kpi("Ставок", done.length, `сигналов ${bets.length} · исполнено ${pct(done.length / bets.length)} · ср. ставка ${f1(avgPct, 2)}%`)}
    ${kpi("В плюс", pct(wins / done.length), `${wins} из ${done.length}`)}
    ${kpi("CLV", isNum(clv) ? sgn(100 * clv, 2) + " п.п." : "—", "цена к началу матча против нашей", cls(clv))}
    ${kpi("Макс. просадка", money(B.dd), pct(B.ddp, 1) + " от пика")}
  </div>
  <div class="grid g2">
    <div class="card"><div class="card-h"><h3 id="eq-h">Банк</h3><div class="seg seg-sm" id="eqmode"><button data-m="bank">Банк</button><button data-m="pnl">Доход</button></div></div><div class="card-b"><div class="chart-box lg"><canvas id="eq"></canvas></div></div></div>
    <div class="card"><div class="card-h"><h3>По месяцам</h3><span class="muted">прибыль за месяц, $</span></div><div class="card-b"><div class="chart-box lg"><canvas id="mo"></canvas></div></div></div>
  </div>
  <div class="section-title">Все ставки</div>
  <div class="card"><div class="card-b" id="btbl"></div><div style="text-align:center;padding:0 0 16px" id="more"></div></div>` :
  `<div class="card"><div class="empty">${mode === "симуляция" ? "Нет ставок" : all.length ? "Рассчитанных ставок пока нет — банк, прибыль и графики появятся после первых сыгранных матчей. Текущие ставки — выше." : `Пока пусто. ${mode === "бумага" ? "Бумажные ставки робот ведёт всегда — появятся после первых его решений (" + (NFL ? "вторник 12:00 по Нью-Йорку, ≈ 5 суток до игры" : "за 48 ч до матча") + ", если есть перевес)." : "Реальные ставки появятся, когда они включены на вкладке «Робот» и робот сделает первую ставку."}`}</div></div>`}`;

  if (ALT) $("#mks")?.remove();
  $$(".tbl tr.click[data-g]").forEach((tr) => (tr.onclick = () => showRobotGame(tr.dataset.g)));
  $$("#modes .chip").forEach((b) => b.onclick = () => setQ({ mode: b.dataset.m, y: undefined }));
  $$("#years .chip").forEach((b) => b.onclick = () => setQ({ y: b.dataset.y || undefined }));
  if ($("#smart-on")) $("#smart-on").onchange = (e) => setQ({ sm: e.target.checked ? 1 : undefined });
  $$("#mks .chip").forEach((b) => b.onclick = () => setQ({ mk: b.dataset.k === "ml" ? undefined : b.dataset.k, s: b.dataset.k !== "ml" && sel.includes("smart") ? "swing" : sel.join(",") }));
  $$(".strat").forEach((el) => el.onclick = (e) => { if (e.target.closest(".strat-add")) return; setQ({ s: el.dataset.k }); });
  $$("[data-add]").forEach((cb) => cb.onchange = () => {
    const k = cb.dataset.add; let s = sel.filter((x) => x !== k);
    if (cb.checked) s.push(k);
    setQ({ s: (s.length ? s : [k]).join(",") });
  });
  const upd = () => {
    const n = (id, def) => { const v = parseFloat($("#" + id).value); return Number.isFinite(v) ? v : def; };
    const nc = { start: n("c-start", 10000), min: n("c-min", 1), max: n("c-max", 3), flat: n("c-flat", 2), maxUsd: n("c-maxusd", 300), step: n("c-step", 25),
      lo: n("c-lo", 3), hi: n("c-hi", 12), smartScale: $("#c-smart").checked,
      method: $("#c-method").value, kf: n("c-kf", 0.5), trust: n("c-trust", 0.3) };
    saveBankCfg(nc); setQuery("bets", { s: sel.join(","), mode: q.mode, y: q.y, mk: q.mk, sm: q.sm, cfg: 1 }); route();
  };
  $$(".bankcfg input, .bankcfg select").forEach((i) => (i.onchange = upd));
  if ($("#c-reset")) $("#c-reset").onclick = () => { saveBankCfg(BANK_DEFAULT); setQuery("bets", { s: sel.join(","), mode: q.mode, y: q.y, mk: q.mk, sm: q.sm, cfg: 1 }); route(); };
  if (!done.length) return;

  const multi = sel.length > 1;
  const R = (b) => B.res.get(b);
  const cols = [
    { key: "signal_t", label: "Сигнал", l: true, fmt: (b) => tsDate(b.signal_t) },
    ...(multi ? [{ key: "key", label: "Стратегия", l: true, fmt: (b) => `${STRATS[b.key].icon} ${STRATS[b.key].name}` }] : []),
    { key: "match", label: "Дом", l: true, sort: (b) => b.home, fmt: (b) => `<span class="match-mini">${logo(b.home, "sm")}${b.home}</span>` },
    { key: "guest", label: "Гости", l: true, sort: (b) => b.away, fmt: (b) => `<span class="match-mini">${logo(b.away, "sm")}${b.away}</span>` },
    { key: "score", label: "Счёт", title: "итоговый счёт: дом : гости", sort: (b) => (isNum(b.hp) ? b.hp + b.ap : -1), fmt: (b) => `<span class="faint">${isNum(b.hp) ? `${b.hp}:${b.ap}` : ""}</span>` },
    { key: "exp", label: "Ожидали", l: true, has: (b) => isNum(mSrc(b)), title: "ожидаемый счёт (дом : гости), фора и тотал по выбранному вверху прогнозу и модели тоталов",
      sort: (b) => mSrc(b), fmt: (b) => { const M = mSrc(b), T = b.model_total; if (!isNum(M)) return "—";
        const fav = M >= 0 ? b.home : b.away, sc = isNum(T) ? `<b>${Math.round((T + M) / 2)}:${Math.round((T - M) / 2)}</b> · ` : "";
        return `${sc}<span title="ожидаемая фора">${fav} −${f1(Math.abs(M), 1)}</span>${isNum(T) ? ` · <span title="ожидаемый тотал">Т ${f1(T, 1)}</span>` : ""}`; } },
    ...(mode === "реально" ? [{ key: "who", label: "Источник", l: true, sort: (b) => b.strategy + b.plan, fmt: (b) => `${esc(BOT_SRC_ALL[b.strategy] || b.strategy)}<div class="faint" style="font-size:11px">${esc(PLAN_NAME[b.plan] || b.plan || "")}</div>` }] : []),
    { key: "team", label: MK === "ml" ? "На кого" : "Ставка (линия)", l: true, fmt: (b) => (b.line ? `<b>${esc(b.line)}</b>` : `<span class="match-mini">${logo(b.team, "sm")}<b>${b.team}</b></span>`) },
    ...(MK !== "ml" ? [{ key: "line_res", label: "Итог линии", l: true, title: "фора: с какой разницей сыграла команда и с учётом форы; тотал: сколько очков набрали всего",
      sort: (b) => lineRes(b)?.v, fmt: (b) => { const r = lineRes(b); return r ? `${r.text} <span class="${r.win ? "good" : "bad"}">${r.win ? "✓ зашла" : "✗ не зашла"}</span>` : "—"; } }] : []),
    ...(sel.includes("smart") ? [{ key: "wallet", label: "Кошелёк", l: true, fmt: (b) => (b.wallet ? `<span class="faint" title="${esc(b.wallet)}">${b.wallet.slice(0, 6)}… · ${money(b.their_amount).replace("+", "")}</span>` : "") }] : []),
    ...(sel.some((k) => k !== "smart") ? [
      { key: "model_p", label: SRC_NAME[SRC], has: (b) => isNum(b.model_p), title: "шанс нашей стороны по выбранному прогнозу", fmt: (b) => pct(b.model_p) },
      { key: "diff", label: "Расхожд.", has: (b) => isNum(b.diff), title: "модель минус цена в момент сигнала, п.п.", fmt: (b) => (isNum(b.diff) ? f1(100 * b.diff, 1) : "—") }] : []),
    { key: "entry", label: "Вход", sep: true, fmt: (b) => (isNum(b.entry) ? f1(100 * b.entry, 1) + "¢" : `<span class="faint">${isNum(b.order_price) ? f1(100 * b.order_price, 1) + "¢" : "—"}</span>`) },
    { key: "exit_px", label: "Выход", fmt: (b) => (!b.done ? "—" : b.exit_how === "итог матча" || b.exit_how === "расчёт по итогу матча" ? (b.exit_px ? `<span class="good">выигрыш</span>` : `<span class="bad">проигрыш</span>`) : f1(100 * b.exit_px, 1) + "¢") },
    ...(sel.includes("swing") ? [{ key: "exit_how", label: "Как закрыта", l: true, fmt: (b) => (b.done ? (b.key === "swing" ? esc(b.exit_how) : "итог матча") : `<span class="pill neutral">${esc(b.status)}</span>`) }] : []),
    { key: "clv", label: "CLV", has: (b) => isNum(b.clv), title: "насколько цена к началу матча ушла в нашу сторону от цены входа", fmt: (b) => (isNum(b.clv) ? `<span class="${cls(b.clv)}">${sgn(100 * b.clv, 1)}</span>` : "—") },
    { key: "ref", label: "От банка", sep: true, title: "расчётный банк на момент ставки — от него считался процент (пересчитывается при изменении банка на ±" + c.step + "%)", sort: (b) => R(b)?.ref, fmt: (b) => (R(b) ? money(R(b).ref, 0).replace("+", "") : "—") },
    { key: "pct", label: "Ставка", sort: (b) => R(b)?.pct, fmt: (b) => (R(b) ? `${f1(R(b).pct, 1)}% = <b>${money(R(b).stake, 0).replace("+", "")}</b>` : "—") },
    { key: "fillp", label: "Исполнено", title: "какую часть суммы ставки реально купили по ленте сделок Polymarket (прибыль — только с купленного)",
      sort: (b) => fillFrac(b, R(b)), fmt: (b) => { const f = fillFrac(b, R(b)); return isNum(f) ? `<span class="${f < 0.5 ? "acc" : ""}">${pct(Math.min(f, 1))}</span>` : "—"; } },
    { key: "pnl", label: "Итог", sort: (b) => R(b)?.pnl, fmt: (b) => (R(b) ? `<b class="${cls(R(b).pnl)}">${money(R(b).pnl, 2)}</b>` : "—") },
    { key: "bank", label: "Банк", sort: (b) => R(b)?.bank, fmt: (b) => (R(b)?.bank ? money(R(b).bank, 0).replace("+", "") : "—") },
  ];
  const sorted = bets.slice().sort((a, b) => b.signal_t - a.signal_t);
  const bt = table({ cols: cols.filter((c) => !c.has || bets.some(c.has)), rows: sorted, onRow: (b) => (location.hash = `#/game/${b.game_id}`), id: "betsT", page: 150 });
  $("#btbl").innerHTML = bt.html; bt.render();

  const acc = cssVar(sel.length === 1 ? STRATS[sel[0]].color : "--accent");
  let eqMode = "bank";
  try { eqMode = localStorage.getItem("eqmode") || "bank"; } catch (e) { /* банк */ }
  let eqChart = null;
  const drawEq = () => {
    if (eqChart) { eqChart.destroy(); charts = charts.filter((x) => x !== eqChart); }
    const pnlM = eqMode === "pnl", conv = (cv, st0) => (pnlM ? cv.map((p) => ({ x: p.x, y: p.y - st0 })) : cv);
    $("#eq-h").textContent = pnlM ? "Доход" : "Банк";
    $$("#eqmode button").forEach((b) => b.classList.toggle("active", b.dataset.m === eqMode));
    eqChart = chart($("#eq"), {
    type: "line",
    data: { datasets: [
      { label: `Ставка ${c.min}–${c.max}% по уверенности`, data: conv(B.curve, B.start), borderColor: acc, backgroundColor: acc + "22", fill: pnlM ? "origin" : true, pointRadius: 0, borderWidth: 2 },
      { label: `Ровно ${c.flat}%`, data: conv(F.curve, F.start), borderColor: cssVar("--muted"), borderDash: [5, 4], pointRadius: 0, borderWidth: 1.5 },
    ] },
    options: { maintainAspectRatio: false, parsing: false, interaction: { intersect: false, mode: "nearest", axis: "x" },
      plugins: { legend: { labels: { boxWidth: 12 } }, tooltip: { ...tooltipBase(), callbacks: { title: (x) => new Date(x[0].raw.x).toLocaleDateString("ru-RU"), label: (x) => (pnlM ? `${x.dataset.label}: ${money(x.raw.y)} (${sgn(100 * x.raw.y / B.start, 1)}% к старту)` : `${x.dataset.label}: ${money(x.raw.y).replace("+", "")}`) } } },
      scales: { x: { type: "linear", min: B.curve[0]?.x, max: B.curve[B.curve.length - 1]?.x, ticks: { maxTicksLimit: 8, callback: (v) => ruDateS(new Date(v)) } },
        y: { ticks: { callback: (v) => (pnlM ? money(v, 0) : "$" + Math.round(v).toLocaleString("ru-RU")) }, grid: { color: (x) => (x.tick.value === (pnlM ? 0 : B.start) ? cssVar("--line-2") : cssVar("--line")) } } } },
    });
  };
  drawEq();
  $$("#eqmode button").forEach((b) => b.onclick = () => { eqMode = b.dataset.m; try { localStorage.setItem("eqmode", eqMode); } catch (e) { /* без сохранения */ } drawEq(); });
  const months = {};
  done.forEach((b) => { const r = R(b); if (!r) return; const dt = new Date((b.close_t || b.open_t) * 1000); const k = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`; months[k] = (months[k] || 0) + r.pnl; });
  const mk = Object.keys(months).sort();
  chart($("#mo"), {
    type: "bar",
    data: { labels: mk.map((k) => `${k.slice(5)}.${k.slice(0, 4)}`), datasets: [{ data: mk.map((k) => months[k]), backgroundColor: mk.map((k) => (months[k] >= 0 ? cssVar("--good") : cssVar("--bad"))), borderRadius: 6 }] },
    options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { ...tooltipBase(), callbacks: { label: (x) => money(x.raw) } } }, scales: { y: { ticks: { callback: (v) => money(v) } } } },
  });
}

/* ================= составляющие вклада (четыре фактора) ================= */
const FF_ROWS = [
  ["a_бросок", "Броски своей команды", "насколько лучше бросает вся команда, пока он на площадке: свои броски, передачи, заслоны"],
  ["a_потери", "Меньше потерь", "насколько реже команда теряет мяч"],
  ["a_подбор", "Подборы в атаке", "насколько больше команда подбирает под чужим кольцом — лишние владения"],
  ["a_штраф", "Штрафные", "насколько чаще команда зарабатывает штрафные"],
  ["d_бросок", "Защита: броски соперника", "насколько хуже бросает соперник — защита кольца и периметра"],
  ["d_потери", "Защита: потери соперника", "насколько чаще соперник теряет мяч — перехваты, давление"],
  ["d_подбор", "Защита: подборы соперника", "насколько меньше соперник подбирает в атаке — борьба за щит"],
  ["d_штраф", "Защита: фолы", "насколько реже соперник ходит на штрафные"],
];
function ffTotal(p) { return FF_ROWS.reduce((s, [k]) => s + (p?.[k] || 0), 0); }
function ffCard(p) {
  if (!p || FF_ROWS.every(([k]) => !p[k])) return "";
  const tot = ffTotal(p), att = FF_ROWS.slice(0, 4).reduce((s, [k]) => s + p[k], 0), def = tot - att;
  return `<div class="card" style="margin-top:16px"><div class="card-h"><h3>Из чего складывается вклад</h3>
    <span class="muted">очков на 100 владений, пока игрок на площадке · атака <b class="${cls(att)}">${sgn(att)}</b> · защита <b class="${cls(def)}">${sgn(def)}</b> · всего <b class="${cls(tot)}">${sgn(tot)}</b></span></div>
    <div class="card-b"><div class="chart-box"><canvas id="ffc"></canvas></div>
    <div class="hint">Считается не личная статистика, а то, как меняется игра всей команды, пока он на площадке (модель четырёх факторов по отрезкам между заменами). Поэтому игрок, забирающий подборы у партнёров, получает меньше, а тот, с кем партнёры бросают лучше, — больше, даже если сам набирает мало.</div></div></div>`;
}
function ffChart(p) {
  const el = $("#ffc");
  if (!el || !p) return;
  const vals = FF_ROWS.map(([k]) => p[k] || 0);
  chart(el, {
    type: "bar",
    data: { labels: FF_ROWS.map((r) => r[1]), datasets: [{ data: vals, backgroundColor: vals.map((v) => (v >= 0 ? cssVar("--good") : cssVar("--bad"))), borderRadius: 5 }] },
    options: { indexAxis: "y", maintainAspectRatio: false, plugins: { legend: { display: false },
      tooltip: { ...tooltipBase(), callbacks: { label: (c) => `${sgn(c.raw)} очка на 100 владений`, afterLabel: (c) => FF_ROWS[c.dataIndex][2] } } },
      scales: { x: { grid: { color: (c) => (c.tick.value === 0 ? cssVar("--line-2") : cssVar("--line")) }, ticks: { callback: (v) => sgn(v) } } } },
  });
}
function ffTeam(roster) {
  const on = roster.filter((p) => p.on && p.min > 0);
  const tot = on.reduce((s, p) => s + p.min, 0) || 1;
  const out = {};
  for (const [k] of FF_ROWS) out[k] = on.reduce((s, p) => s + ((5 * p.min) / tot) * (p[k] || 0), 0);
  return out;
}
function ffCompare(a, h, away, home, awayDef, homeDef) {
  const A = ffTeam(away), H = ffTeam(home), A0 = ffTeam(awayDef), H0 = ffTeam(homeDef);
  const row = ([k, name, hint]) => {
    const da = A[k] - A0[k], dh = H[k] - H0[k];
    const chg = (v) => (Math.abs(v) >= 0.05 ? ` <small class="${cls(v)}">(${sgn(v)})</small>` : "");
    return `<tr title="${esc(hint)}"><td class="l">${name}</td><td class="${cls(H[k])}">${sgn(H[k])}${chg(dh)}</td><td class="${cls(A[k])}">${sgn(A[k])}${chg(da)}</td><td class="${cls(H[k] - A[k])}"><b>${sgn(H[k] - A[k])}</b></td></tr>`;
  };
  const sum = (T) => FF_ROWS.reduce((s, [k]) => s + T[k], 0);
  return `<table class="tbl"><thead><tr><th class="l">Составляющая</th><th>${h}</th><th>${a}</th><th>Перевес ${h}</th></tr></thead>
    <tbody>${FF_ROWS.map(row).join("")}</tbody>
    <tfoot><tr><td class="l">Всего</td><td>${sgn(sum(H))}</td><td>${sgn(sum(A))}</td><td class="${cls(sum(H) - sum(A))}">${sgn(sum(H) - sum(A))}</td></tr></tfoot></table>
    <div class="hint">Очков на 100 владений относительно средней команды, по модели четырёх факторов; в скобках — изменение против обычного состава (убрали игрока — видно, что потеряли). Вероятность выше считает основная модель; это разложение — для понимания, откуда сила.</div>`;
}

/* ================= КОНСТРУКТОР ================= */
const SIM = { data: null, st: null };
function erf(x) {
  const s = Math.sign(x); x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  return s * (1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x));
}
const Phi = (z) => 0.5 * (1 + erf(z / Math.SQRT2));
const logit = (p) => { p = Math.min(Math.max(p, 1e-4), 1 - 1e-4); return Math.log(p / (1 - p)); };
const normName = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function simDefaultRoster(team) {
  const pl = SIM.data.players.filter((p) => p.team === team).map((p) => ({ ...p, min: Math.round(p.min || 12) }));
  pl.sort((a, b) => b.min - a.min);
  const out = pl.map((p, i) => ({ ...p, on: i < 11 && p.min >= 6 }));
  // обычные минуты игроков в сумме редко дают ровно 240 — приводим к 240, чтобы было наглядно
  const tot = out.filter((p) => p.on).reduce((s, p) => s + p.min, 0);
  if (tot > 0) out.forEach((p) => { if (p.on) p.min = Math.min(48, Math.round((p.min * 240) / tot)); });
  return out;
}
function simTeam(roster) {
  const on = roster.filter((p) => p.on && p.min > 0);
  const tot = on.reduce((s, p) => s + p.min, 0);
  const feats = { rookie: 0, top10: 0, undrafted_rookie: 0 };
  const per = {};
  let contrib = 0;
  for (const p of on) {
    const sh = (5 * p.min) / tot;
    per[p.player_id] = sh * p.rating;
    contrib += sh * p.rating;
    for (const f in feats) feats[f] += (sh / 5) * (p[f] || 0);
  }
  return { contrib, feats, per, tot, n: on.length };
}
function simPredict(st, home, away) {
  const P = SIM.data.params, C = P.calib;
  const H = simTeam(home), A = simTeam(away);
  const th = P.teams[st.h], ta = P.teams[st.a];
  const mix = (st.neutral ? 0 : P.hca) + (st.b2bH ? P.b2b_home : 0) + (st.b2bA ? P.b2b_away : 0) + th.eff - ta.eff + H.contrib - A.contrib;
  let margin = (st.neutral ? 0 : C.a) + C.b * mix;
  C.features.forEach((f, i) => (margin += C.rookie_coef[i] * (H.feats[f] - A.feats[f])));
  const p = 1 / (1 + Math.exp(-C.k * logit(Phi(margin / C.sigma))));
  const half = P.pts_home / 2;
  const ptsH = P.pts_mean + (st.neutral ? half : P.pts_home) + th.att - ta.def;
  const ptsA = P.pts_mean + (st.neutral ? half : 0) + ta.att - th.def;
  return { p, margin, total: ptsH + ptsA, H, A };
}

async function viewSim(q) {
  if (!SIM.data) SIM.data = await api("sim");
  const P = SIM.data.params;
  const teams = META.teams.map((t) => t.team);
  let st = SIM.st;
  const h = teams.includes(q.h) ? q.h : st?.h || "DEN", a = teams.includes(q.a) ? q.a : st?.a || "LAL";
  if (!st || st.h !== h || st.a !== a) {
    st = SIM.st = { h, a, neutral: st?.neutral || false, b2bH: false, b2bA: false,
      home: st && st.h === h ? st.home : simDefaultRoster(h), away: st && st.a === a ? st.away : simDefaultRoster(a) };
  }
  const [ca, ch] = pairColors(a, h);
  const teamSelect = (id, val) => `<select class="select" id="${id}">${META.teams.map((t) => `<option value="${t.team}" ${t.team === val ? "selected" : ""}>${esc(t.name)}</option>`).join("")}</select>`;

  app.innerHTML = `
  <div class="page-head"><div><h1>Конструктор матча</h1>
    <div class="sub">Та же модель, что считает прогнозы: меняйте составы и минуты — вероятность пересчитывается сразу. Рейтинги — на ${dateShort(P.ref_date)}; составы — по последним командам игроков (переходы межсезонья и новичков драфта ${P.season} добавляйте поиском).</div></div></div>
  <div class="card sim-top">
    <div class="sim-team">${logo(h, "lg")}<div class="opts"><span class="muted" style="font-size:12px;font-weight:700">ХОЗЯЕВА</span>${teamSelect("sh", h)}<label class="toggle"><input type="checkbox" id="b2bH" ${st.b2bH ? "checked" : ""}> второй матч подряд</label></div></div>
    <div class="sim-mid">
      <button class="chip" id="swap" title="Поменять хозяев и гостей">⇄ Поменять</button>
      <label class="toggle"><input type="checkbox" id="neutral" ${st.neutral ? "checked" : ""}> нейтральная площадка</label>
      <button class="chip" id="reset">↺ Сбросить составы</button>
    </div>
    <div class="sim-team r">${logo(a, "lg")}<div class="opts"><span class="muted" style="font-size:12px;font-weight:700">ГОСТИ</span>${teamSelect("sa", a)}<label class="toggle"><input type="checkbox" id="b2bA" ${st.b2bA ? "checked" : ""}> второй матч подряд</label></div></div>
  </div>
  <div class="card sim-res" id="simres"></div>
  <div class="card" style="margin-top:14px"><div class="card-h"><h3>Откуда сила составов</h3><span class="muted">четыре фактора в атаке и защите</span></div><div class="card-b tbl-wrap" id="simff"></div></div>
  <div class="grid g2" style="margin-top:14px">
    <div class="card" id="ros-home"></div>
    <div class="card" id="ros-away"></div>
  </div>
  <div class="hint">Как считается: разница очков = площадка + поправки команд + Σ (доля минут × рейтинг игрока) хозяев − то же у гостей, плюс поправка на новичков; затем калибровка в вероятность, как у настоящих прогнозов. Минуты нормируются: если сумма не 240, доли пересчитываются пропорционально (убрали игрока — его минуты делят остальные). «Вклад» — сколько очков разницы даёт игрок за матч.</div>`;

  const rosterHtml = (side) => {
    const team = side === "home" ? h : a;
    const R = st[side];
    const T = simTeam(R);
    const rows = R.map((p, i) => `<div class="rrow ${p.on ? "" : "off"}" data-side="${side}" data-i="${i}">
      <input type="checkbox" class="on" ${p.on ? "checked" : ""}>${avatar(p.player_id, p.name)}
      <div class="nm"><a href="#/player/${p.player_id}">${esc(p.name)}</a><small>рейтинг <b class="${cls(p.rating)}">${sgn(p.rating)}</b>${p.rookie ? ` · новичок${p.games === 0 ? " (драфт)" : ""}` : ""}${p.team !== team ? ` · из ${p.team}` : ""}</small></div>
      <input type="range" class="mn" min="0" max="48" step="1" value="${p.min}">
      <input type="number" class="mnn" min="0" max="48" value="${p.min}">
      <div class="ct ${cls(T.per[p.player_id])}">${p.on && p.min > 0 ? sgn(T.per[p.player_id]) : "—"}</div>
      <button class="x" title="Убрать из состава">✕</button></div>`).join("");
    return `<div class="box-head">${logo(team, "md")}<h3>${esc(teamName(team))}</h3><span class="muted" id="sum-${side}"></span></div>
      <div class="rhead"><span></span><span></span><span>Игрок</span><span>Минуты</span><span></span><span style="text-align:right">Вклад</span><span></span></div>
      <div class="roster">${rows || `<div class="empty">Нет игроков — добавьте поиском</div>`}</div>
      <div class="add-wrap"><input class="input" placeholder="+ Добавить игрока (любая команда, новички драфта)…" data-side="${side}"><div class="sugg" hidden></div></div>`;
  };

  const renderResult = () => {
    const r = simPredict(st, st.home, st.away);
    const base = simPredict(st, simDefaultRoster(h), simDefaultRoster(a));
    const eh = Math.round((r.total + r.margin) / 2), ea = Math.round((r.total - r.margin) / 2);
    const dm = r.margin - base.margin, dp = r.p - base.p;
    $("#simres").innerHTML = `<div class="big">
      <div style="display:flex;align-items:center;gap:10px">${logo(h, "md")}<span class="pc" style="color:${ch}">${pct(r.p)}</span></div>
      <div class="bar"><i style="width:${100 * r.p}%;background:${ch}"></i><i style="width:${100 * (1 - r.p)}%;background:${ca}"></i></div>
      <div style="display:flex;align-items:center;gap:10px"><span class="pc" style="color:${ca}">${pct(1 - r.p)}</span>${logo(a, "md")}</div></div>
      <div class="facts">
        <span>Ожидаемый счёт <b>${h} ${eh} : ${ea} ${a}</b></span>
        <span>Разница <b>${r.margin >= 0 ? h : a} +${f1(Math.abs(r.margin))}</b></span>
        <span>Справедливый коэф. <b>${f1(1 / r.p, 2)} / ${f1(1 / (1 - r.p), 2)}</b></span>
        <span>Против обычных составов <b class="${cls(dm)}">${sgn(dm)} очк. · ${sgn(100 * dp, 1)} п.п. ${h}</b></span>
      </div>`;
    $("#simff").innerHTML = ffCompare(a, h, st.away, st.home, simDefaultRoster(a), simDefaultRoster(h));
    for (const side of ["home", "away"]) {
      const T = side === "home" ? r.H : r.A;
      const el = $("#sum-" + side);
      if (el) el.textContent = `сила состава ${sgn(T.contrib)} · ${T.n} игр. · ${Math.round(T.tot)} мин`;
      $$(`.rrow[data-side="${side}"]`).forEach((row) => {
        const p = st[side][+row.dataset.i];
        const c = T.per[p.player_id];
        const ct = $(".ct", row);
        ct.textContent = p.on && p.min > 0 ? sgn(c) : "—";
        ct.className = "ct " + cls(c);
      });
    }
  };

  const renderRosters = () => {
    for (const side of ["away", "home"]) {
      const box = $("#ros-" + side);
      box.innerHTML = rosterHtml(side);
      $$(".rrow", box).forEach((row) => {
        const p = st[side][+row.dataset.i];
        $(".on", row).onchange = (e) => { p.on = e.target.checked; row.classList.toggle("off", !p.on); renderResult(); };
        const setMin = (v) => {
          p.min = Math.max(0, Math.min(48, +v || 0));
          $(".mn", row).value = p.min; $(".mnn", row).value = p.min;
          if (p.min > 0 && !p.on) { p.on = true; $(".on", row).checked = true; row.classList.remove("off"); }
          renderResult();
        };
        $(".mn", row).oninput = (e) => setMin(e.target.value);
        $(".mnn", row).onchange = (e) => setMin(e.target.value);
        $(".x", row).onclick = () => { st[side].splice(+row.dataset.i, 1); renderRosters(); };
      });
      const inp = $(".add-wrap .input", box), sg = $(".sugg", box);
      inp.oninput = () => {
        const qq = normName(inp.value.trim());
        if (qq.length < 2) { sg.hidden = true; return; }
        const taken = new Set([...st.home, ...st.away].map((p) => p.player_id));
        const found = SIM.data.players.filter((p) => !taken.has(p.player_id) && normName(p.name).includes(qq)).sort((x, y) => y.rating - x.rating).slice(0, 12);
        sg.innerHTML = found.length ? found.map((p) => `<div data-id="${p.player_id}">${avatar(p.player_id, p.name)}<span style="flex:1">${esc(p.name)} <span class="faint">${p.team || ""}${p.games === 0 && p.rookie ? " · драфт" : ""}</span></span><b class="${cls(p.rating)}">${sgn(p.rating)}</b></div>`).join("") : `<div class="muted">Не найдено</div>`;
        sg.hidden = false;
        $$("div[data-id]", sg).forEach((el) => el.onmousedown = () => {
          const p = SIM.data.players.find((x) => x.player_id === +el.dataset.id);
          st[side].push({ ...p, min: Math.round(p.min || 15), on: true });
          renderRosters();
        });
      };
      inp.onblur = () => setTimeout(() => (sg.hidden = true), 150);
    }
    renderResult();
  };
  renderRosters();

  const go = (hh, aa) => { setQuery("sim", { h: hh, a: aa }); route(); };
  $("#sh").onchange = (e) => go(e.target.value, a);
  $("#sa").onchange = (e) => go(h, e.target.value);
  $("#swap").onclick = () => { SIM.st = { ...st, h: a, a: h, home: st.away, away: st.home, b2bH: st.b2bA, b2bA: st.b2bH }; go(a, h); };
  $("#reset").onclick = () => { st.home = simDefaultRoster(h); st.away = simDefaultRoster(a); renderRosters(); };
  for (const k of ["neutral", "b2bH", "b2bA"]) $("#" + k).onchange = (e) => { st[k] = e.target.checked; renderResult(); };
}

/* ================= запуск ================= */
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem("theme", t); } catch (e) { /* хранилище недоступно */ }
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
    META.teams.forEach((x) => (TEAM[x.team] = x));
    if (EURO) {
      document.title = "Euro Edge";
      $$('.tabs a[data-tab="sim"]').forEach((a) => a.remove());
      botBadge(); setInterval(botBadge, 60000);
      $(".brand span").innerHTML = "Euro <b>Edge</b>";
      const st_ = document.createElement("style"); st_.textContent = ".sport-euro .rc{display:none}"; document.head.appendChild(st_);
      $("#foot").innerHTML = `База собрана ${esc(ruTxt(META.built) || "—")} · Данные: официальный API Евролиги, Polymarket · Только бумажные ставки · Для личного пользования<div id="fresh-line" style="margin-top:4px"></div>`; loadFresh(); setInterval(loadFresh, 600000);
    } else if (NFL) {
      document.title = "NFL Edge";
      $$('.tabs a[data-tab="sim"]').forEach((a) => a.remove());
      $('.tabs a[data-tab="bot"]')?.insertAdjacentHTML("beforebegin", '<a href="#/props" data-tab="props">Игроки · ставки</a>');          // бумажный робот игроков (тачдаун в матче)
      botBadge(); setInterval(botBadge, 60000);
      $(".brand").innerHTML = `<svg viewBox="0 0 32 32" aria-hidden="true"><ellipse cx="16" cy="16" rx="13" ry="8" transform="rotate(-35 16 16)" fill="var(--accent)"/><path d="M10 22 22 10M13 16l3 3M16 13l3 3M11 19l2 2M19 11l2 2" stroke="#0c1220" stroke-width="1.6" stroke-linecap="round"/></svg><span>NFL <b>Edge</b></span>`;
      $("#foot").innerHTML = `База собрана ${esc(ruTxt(META.built) || "—")} · Данные: nflverse (nflfastR), Polymarket, SportsbookReviewsOnline, ESPN · Только для личного пользования<div id="fresh-line" style="margin-top:4px"></div>`; loadFresh(); setInterval(loadFresh, 600000);
    } else if (NHL) {
      document.title = "NHL Edge";
      $$('.tabs a[data-tab="sim"]').forEach((a) => a.remove());
      botBadge(); setInterval(botBadge, 60000);
      $(".brand").innerHTML = `<svg viewBox="0 0 32 32" aria-hidden="true"><ellipse cx="16" cy="19" rx="13" ry="6" fill="#0c1220" stroke="var(--accent)" stroke-width="1.6"/><ellipse cx="16" cy="15" rx="13" ry="6" fill="var(--accent)"/><ellipse cx="16" cy="15" rx="8" ry="3.2" fill="none" stroke="#0c1220" stroke-width="1.2" opacity=".55"/></svg><span>NHL <b>Edge</b></span>`;
      $("#foot").innerHTML = `База собрана ${esc(ruTxt(META.built) || "—")} · Данные: NHL API, Polymarket, SportsbookReviewsOnline, ESPN, DailyFaceoff · Только для личного пользования<div id="fresh-line" style="margin-top:4px"></div>`; loadFresh(); setInterval(loadFresh, 600000);
    } else {
      botBadge(); setInterval(botBadge, 60000);
      $("#foot").innerHTML = `База собрана ${esc(ruTxt(META.built) || "—")} · Данные: stats.nba.com, ESPN, Polymarket, DARKO · Только для личного пользования<div id="fresh-line" style="margin-top:4px"></div>`; loadFresh(); setInterval(loadFresh, 600000);
    }
  } catch (e) {
    app.innerHTML = `<div class="empty">Сервер не отвечает или нет базы: ${esc(e.message)}<br>Запустите «6. Обновить сайт.bat», затем «7. Открыть сайт.bat».</div>`;
    return;
  }
  window.addEventListener("hashchange", route);
  route();
})();


/* ================= РОБОТ ================= */
let BOT_PW = "";
async function botApi(path, body, pw) {
  const r = await fetch(APIP + "bot/" + path, { method: body === undefined ? "GET" : "POST", headers: { "Content-Type": "application/json", "X-Password": pw ?? BOT_PW }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (r.status === 403) throw new Error("Неверный пароль управления");
  if (!r.ok) throw new Error((await r.text()).replace(/<[^>]+>/g, " ").trim().slice(0, 200) || r.statusText);
  return r.json();
}
async function botBadge() {
  const b = $("#bot-badge");
  try {
    const d = await botApi("status");
    const s = d.status, real = s.real_on && !s.stop;
    b.textContent = !s.alive ? "Робот: не запущен" : real ? "Робот: реально + бумага" : "Робот: бумага";
    b.classList.toggle("on", s.alive && !real); b.classList.toggle("real", s.alive && real);
  } catch (e) { b.textContent = "Робот: —"; }
  b.style.cursor = "pointer"; b.onclick = () => (location.hash = "#/bot");
}
const agoText = (sec) => (!isNum(sec) ? "—" : sec < 90 ? "только что" : sec < 3600 ? Math.round(sec / 60) + " мин назад" : sec < 86400 ? Math.round(sec / 3600) + " ч назад" : Math.round(sec / 86400) + " дн назад");
function forwardBox(d) {
  const c = (x) => (isNum(x) ? (100 * x).toFixed(2) + "¢" : "—");
  const rows = d.forward.map((r) => `<tr><td class="l">${esc(r.name)}<div class="faint" style="font-size:11.5px">${esc(r.rule)}</div></td>
    <td>${r.signals} / ${r.decisions}</td><td>${r.filled}</td><td>${c(r.clv)}${isNum(r.clv_se) ? ` <span class="faint">±${(100 * r.clv_se).toFixed(2)}</span>` : ""}</td>
    <td>${isNum(r.pnl) ? money(r.pnl, 0) : "—"}${isNum(r.roi) ? ` <span class="faint">(${(100 * r.roi).toFixed(0)}%)</span>` : ""}</td></tr>`).join("");
  const last = (d.forward_rows || []).slice(0, 12).map((b) => `<tr><td class="l">${esc(b.kind)}</td><td class="l">${esc(String(b.game_id).replace(/^\d+_/, "").replace("_", " нед. ").replace("_", "@"))}</td><td class="l">${esc(b.team || "")}</td>
    <td>${isNum(b.bid) ? Math.round(100 * b.bid) + "¢" : ""}</td><td>${esc(b.status)}</td><td>${isNum(b.clv) ? c(b.clv) : ""}</td><td>${isNum(b.pnl) ? money(b.pnl, 2) : ""}</td></tr>`).join("");
  return `<div class="section-title">Проверка вперёд (бумага, заведена 04.10.2026)</div>
  <div class="card"><div class="card-b" style="padding:0"><div class="tblwrap"><table class="tbl" style="font-size:12.5px"><thead><tr><th class="l">Строка</th><th>Сигналов / решений</th><th>Исполнено</th><th title="цена закрытия минус наша цена входа, по исполненным">CLV исполненных</th><th>Прибыль (ROI)</th></tr></thead><tbody>${rows}</tbody></table></div></div>
  <div class="hint" style="padding:10px 16px 14px">Правила заморожены до начала проверки, пороги не подбираются. Критерий успеха — CLV исполненных заявок, а не прибыль: выборки малы (десятки ставок). На реальные ставки эти строки не влияют.</div>
  ${last ? `<div class="tblwrap"><table class="tbl" style="font-size:12px"><thead><tr><th class="l">Строка</th><th class="l">Матч</th><th class="l">Ставка</th><th>Заявка</th><th>Статус</th><th>CLV</th><th>Итог $</th></tr></thead><tbody>${last}</tbody></table></div>` : ""}</div>`;
}
const BOT_SRC = { "модель": "SHARP", "глико": "Глико-2", "смесь": "SHARP + Глико" };
const BOT_SRC_ALL = { ...BOT_SRC, "вручную": "вручную", "на Polymarket вручную": "на Polymarket вручную" };

// раз в минуту — тихое обновление вкладки «Робот» (без прокрутки наверх; не трогаем, пока меняют настройки)
setInterval(() => { const h = parseHash(); if (h.view !== "bot" || window._botDirty || document.querySelector(".modal") || window.ST?.isOpen() || document.activeElement?.closest(".st-bar")) return; const y = scrollY; viewBot(h.q).then(() => scrollTo(0, y)).catch(() => {}); }, 20000);
// свежесть данных и моделей: строка внизу каждой страницы и таблица на вкладке «Робот»
let FRESH = null;
async function loadFresh() {
  try { FRESH = await (await fetch(APIP + "freshness")).json(); } catch (e) { FRESH = null; }
  const el = $("#fresh-line");
  if (el) el.innerHTML = freshLine();
  return FRESH;
}
function freshLine() {
  if (!FRESH) return "";
  const d = FRESH.data_to ? dateShort(FRESH.data_to) : "—";
  const m = FRESH.models_at ? tsDate(FRESH.models_at) : "—";
  const stale = FRESH.models_at && Date.now() / 1000 - FRESH.models_at > 36 * 3600;
  return `<span class="${stale ? "bad" : ""}">Данные по матчам до <b>${d}</b> · модели пересчитаны <b>${m}</b>${stale ? " — больше 1.5 суток назад!" : ""}</span>`;
}
function freshTable() {
  if (!FRESH) return "";
  const now = Date.now() / 1000;
  return `<div class="section-title">Данные и модели — когда обновлены</div>
  <div class="card"><div class="card-b tbl-wrap"><table class="tbl"><thead><tr><th class="l">Часть системы</th><th class="l">Пересчитана (Минск)</th><th class="l">Данные до</th></tr></thead><tbody>
  ${FRESH.parts.map((r) => `<tr><td class="l">${esc(r.part)}</td>
    <td class="l ${r.updated && now - r.updated > 36 * 3600 && !/архив|снимки|База/.test(r.part) ? "bad" : ""}">${r.updated ? `${tsDate(r.updated)} <span class="faint">(${agoText(now - r.updated)})</span>` : "—"}</td>
    <td class="l">${r.data_to ? `<b>${esc(dateShort(r.data_to))}</b> <span class="faint">${esc(ruTxt(r.what || ""))}</span>` : "<span class='faint'>—</span>"}</td></tr>`).join("")}
  </tbody></table></div>
  <div class="hint" style="padding:0 16px 14px">Ежедневный цикл: ${FRESH.daily_done ? `последний — ${esc(dateShort(FRESH.daily_done))}${FRESH.daily_rc ? ' <span class="bad">(с ошибкой)</span>' : ""}` : "ещё не было"}${FRESH.daily_next ? ` · следующий — ${tsDate(FRESH.daily_next)} (через ${cdText(FRESH.daily_next)})` : ""}. Красным — часть, которая не пересчитывалась больше 1.5 суток.</div></div>`;
}

/* проверка идей на бумаге: подмножества уже исполненных бумажных ставок; на работу робота не влияют (правило сезона: новые идеи — только отдельной строкой на бумаге) */
async function ideasCard() {
  try {
    const d = await api("bets");
    const allP = d.bets.filter((b) => b.mode === "бумага"), paper = allP.filter((b) => (b.filled || 0) > 1e-9 && b.plan !== "book");
    if (paper.length < 5) return "";
    const plans = {}; paper.forEach((b) => (plans[b.plan] = (plans[b.plan] || 0) + 1));
    const plan = Object.keys(plans).sort((a, b) => plans[b] - plans[a])[0], main = EURO ? "модель" : "смесь";
    const base = paper.filter((b) => b.plan === plan && b.strategy === main);
    const px = (b) => (isNum(b.entry) ? b.entry : b.order_price), cost = (b) => b.filled * px(b);
    const stat = (rows) => {
      const done = rows.filter((b) => b.status === "закрыта" && isNum(b.pnl)), c = done.reduce((s, b) => s + cost(b), 0);
      const cl = rows.filter((b) => isNum(b.clv)), cc = cl.reduce((s, b) => s + cost(b), 0);
      return { n: rows.length, done: done.length, roi: c ? done.reduce((s, b) => s + b.pnl, 0) / c : null, clv: cc ? cl.reduce((s, b) => s + b.clv * cost(b), 0) / cc : null };
    };
    const gl = {}; allP.filter((b) => b.strategy === "глико").forEach((b) => (gl[b.game_id] = (gl[b.game_id] || new Set()).add(b.team)));
    const noClash = (b) => !gl[b.game_id] || gl[b.game_id].has(b.team);          // Глико не ставит на другую сторону этого матча
    const rows = [["Как сейчас" + " (" + BOT_SRC[main] + ", " + (PLAN_NAME[plan] || plan) + ")", base], ["Цена входа не ниже 25¢", base.filter((b) => px(b) >= 0.25)]];
    if (EURO) rows.push(["SHARP без спора с Глико-2", base.filter(noClash)], ["SHARP без спора и цена не ниже 25¢", base.filter((b) => noClash(b) && px(b) >= 0.25)]);
    const body = rows.map(([name, r]) => { const s = stat(r); return `<tr><td class="l">${name}</td><td>${s.n}</td><td>${s.done}</td><td class="${cls(s.roi)}">${isNum(s.roi) ? sgn(100 * s.roi, 1) + "%" : "—"}</td><td class="${cls(s.clv)}">${isNum(s.clv) ? sgn(100 * s.clv, 1) + "¢" : "—"}</td></tr>`; }).join("");
    return `<div class="section-title">Проверка идей на бумаге</div>
  <div class="card"><div class="card-b tbl-wrap"><table class="tbl"><thead><tr><th class="l">Вариант</th><th title="исполненные бумажные ставки">Исполнено</th><th title="матч сыгран, итог известен">Сыграно</th><th>ROI</th><th title="цена к началу матча против цены входа">CLV</th></tr></thead><tbody>${body}</tbody></table></div>
  <div class="hint" style="padding:0 16px 14px">Это части тех же бумажных ставок, отобранные по правилу: на реальные ставки и работу робота не влияют. Решать можно по CLV, когда наберётся ≈150 ставок (сейчас выборки малы, различия — шум). Идея про цену ≥ 25¢ и вето «Глико против SHARP» взяты из разбора Gemini; на истории обе не подтвердились.</div></div>`;
  } catch (e) { return ""; }
}
async function viewBot(q) {
  cache.delete("bot");
  await loadFresh();
  const d = await botApi("status");
  if (NFL && d.trusts) window.NFL_TRUST = Math.max(...Object.values(d.trusts));
  const s = d.status, S = d.settings, R = S["реальные"], bank = R["банк"], lim = R["лимиты"];
  const stopped = S["стоп"] || d.stop_file;
  const kpi = (l, v, sub, cl = "") => `<div class="card kpi"><div class="l">${l}</div><div class="v num ${cl}" style="font-size:22px">${v}</div>${sub ? `<div class="s">${sub}</div>` : ""}</div>`;
  const dailyOk = s.daily_rc === 0 || s.daily_rc === undefined;
  const now = Date.now() / 1000;
  const lvl = { info: "", warn: "acc", error: "bad" };

  const up = d.upcoming.map((g) => {
    const p = g.prediction, tip = parseUtc(g.start_utc);
    const when = tip ? `${ruWd(tip)} ${ruDT(tip)}` : "";
    const mid = p?.mid_home;
    const cell = (v) => (isNum(v) ? `<b>${pct(v)}</b>${isNum(mid) ? ` <span class="${Math.abs(v - mid) > 0.03 ? "acc" : "faint"}" style="font-size:11.5px">${sgn(100 * (v - mid), 1)}</span>` : ""}` : "—");
    const bets = g.bets.map((b) => `<span class="pill ${b.mode === "реально" ? "bad" : "neutral"}" title="${esc(b.status)}">${b.mode === "реально" ? "₽ " : ""}${esc(BOT_SRC[b.strategy] || b.strategy)} → ${b.team} · ${esc(b.status)}${isNum(b.pnl) ? " " + money(b.pnl, 2) : ""}</span>`).join(" ");
    const sig = p ? (p.note ? `<span class="faint" title="${esc(p.note)}">${esc(p.note.split(" — ")[0])}</span>` : "") : g.signal_t > now ? `<span class="faint">сигнал ${tsDate(g.signal_t)}</span>` : `<span class="faint">ожидание…</span>`;
    return `<tr class="click" data-g="${g.game_id}"><td class="l">${when}</td>
      <td class="l"><span class="match-mini">${logo(g.home, "sm")}${g.home} <span class="faint">—</span> ${logo(g.away, "sm")}${g.away}</span>${g.type !== "регулярка" ? ` <span class="pill blue">${esc(g.type)}</span>` : ""}</td>
      <td>${isNum(mid) ? pct(mid) : "—"}</td><td>${cell(p?.model_p)}</td><td>${cell(p?.glicko_p)}</td><td>${cell(p?.mix_p)}</td>
      <td class="l">${ALT ? (p?.report ? `<span class="pill acc">поправки</span>` : p ? `<span class="pill neutral">без поправок</span>` : "") : p?.report ? `<span class="pill good">отчёт</span>` : p ? `<span class="pill neutral">без отчёта</span>` : ""}</td><td class="l">${bets || sig}</td></tr>`;
  }).join("");

  const srcBox = Object.entries(BOT_SRC).map(([k, v]) => `<label class="rc-pill"><input type="checkbox" data-src="${k}" ${R["источники"].includes(k) ? "checked" : ""}><span>${v}</span></label>`).join("");
  const planBox = Object.entries(d.plans).map(([k, v]) => { const m = String(v).match(/^(.*?)\s*(\(.*\)|,.*)?$/);
    return `<label class="rc-opt"><input type="checkbox" data-plan="${k}" ${R["стратегии"].includes(k) ? "checked" : ""}><i class="rc-box"></i><span><b>${esc(m ? m[1] : v)}</b>${m && m[2] ? `<small>${esc(m[2].replace(/^,\s*/, "").replace(/^\((.*)\)$/, "$1"))}</small>` : ""}</span></label>`; }).join("");
  const inp = (id, v, step = "0.1", extra = "") => `<input class="input" type="number" id="${id}" value="${v}" step="${step}" ${extra}>`;
  const fld = (label, html, cls = "", unit = "") => `<label class="rc-f ${cls}"><span class="rc-l">${label}</span><span class="rc-in">${html}${unit ? `<em>${unit}</em>` : ""}</span></label>`;
  const sw = (id, on, title, sub = "") => `<label class="rc-sw"><input type="checkbox" id="${id}" ${on ? "checked" : ""}><i></i><span><b>${title}</b>${sub ? `<small>${sub}</small>` : ""}</span></label>`;
  const IC = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  const IDEAS = await ideasCard();
  app.innerHTML = `
  <div class="page-head"><div><h1>Робот</h1><div class="sub">Бумажные ставки ведутся всегда — по всем трём прогнозам, как в проверке. Реальные — только по вашим настройкам ниже.</div></div>
    <div class="chips">${EURO ? "" : `<button class="chip" id="b-goreal" title="Перейти к переключателю и настройкам реальных ставок (внизу страницы)">${R["включены"] ? "⚙ Реальные ставки: ВКЛ — настройки" : "⚙ Включить реальные ставки"}</button>`}<button class="chip ${stopped ? "" : "active"}" id="b-stop">${stopped ? "▶ Снять стоп" : "■ Стоп реальных ставок"}</button></div></div>
  <div class="kpis">
    ${kpi("Робот", s.alive ? "работает" : "не запущен", s.alive ? "последний цикл " + agoText(s.age) : ALT ? "запустите «8. Робот.bat» (nba-edge) — он запускает роботов всех видов спорта" : "запустите «8. Робот.bat»", s.alive ? "good" : "bad")}
    ${typeof NFL !== "undefined" && NFL ? kpi("Версия модели", s.freeze && s.freeze.frozen ? (s.freeze.changed.length ? "изменена" : "заморожена") : "не зафиксирована", s.freeze && s.freeze.frozen ? "с " + s.freeze.frozen + (s.freeze.changed.length ? ": " + s.freeze.changed.join(", ") : " · без подгонки в сезоне") : "защита от подгонки", s.freeze && s.freeze.changed && s.freeze.changed.length ? "bad" : "") : ""}
    ${kpi("Ежедневный цикл", s.daily_done ? dateShort(s.daily_done) : "—", dailyOk ? (NHL ? "06:30 по Нью-Йорку" : "07:00 по Нью-Йорку") : "последний запуск с ошибкой", dailyOk ? "" : "bad")}
    ${kpi("Рейтинги", ruTxt(d.state) || "—", "когда посчитаны")}
    ${kpi("Реальные ставки", stopped ? "стоп" : R["включены"] ? (s.real_on && s.alive ? "включены" : !s.alive ? "ждут робота" : "ошибка") : "выключены", s.real_error ? esc(s.real_error) : R["включены"] ? R["источники"].map((x) => BOT_SRC[x]).join(", ") + " · " + R["стратегии"].map((x) => d.plans[x]).join(", ") : "только бумага" + (typeof NFL !== "undefined" && NFL && s.key_env === false ? " · ключа кошелька на сервере нет" : ""), stopped || s.real_error ? "bad" : R["включены"] ? "good" : "")}
    ${kpi("Счёт Polymarket", isNum(s.real_cash) ? money(s.real_cash + (s.real_positions || 0), 2).replace("+", "") : "—", isNum(s.real_cash) ? `деньги ${money(s.real_cash, 2).replace("+", "")} · в позициях ${money(s.real_positions || 0, 2).replace("+", "")}` : "видно, когда включены реальные ставки")}
    ${kpi("Расчётный банк", isNum(s.real_ref) ? money(s.real_ref, 0).replace("+", "") : "—", "от него считается % ставки")}
    ${kpi("Связь с Polymarket", !s.net ? "—" : s.net.ok ? "в порядке" : "обрыв", !s.net ? "проверит робот" : s.net.ok ? (s.net.last_down_min ? `последний обрыв — ${f1(s.net.last_down_min, 0)} мин` : "без обрывов") : `с ${tsDate(s.net.down_since)} · сбоев ${s.net.fails} · робот повторяет сам`, !s.net ? "" : s.net.ok ? "good" : "bad")}
    ${kpi("Регион для Polymarket", s.geo ? (s.geo.blocked ? "запрет" : "разрешено") : "—", s.geo ? `${esc(s.geo.country || "")} · проверка раз в 10 мин${s.geo.blocked ? " — реальные ставки ждут" : ""}` : "проверит робот", s.geo ? (s.geo.blocked ? "bad" : "good") : "")}
    ${(() => { const L = d.live_clv || {}, r = L["реально"], p = L["бумага"];
      const v = r && r.n >= 20 ? r : p;
      const warn = r && r.n >= 150 && r.clv < 0.01;
      return kpi("Живой CLV", v ? sgn(100 * v.clv, 1) + "¢" : "—",
        `${r ? `реально: ${sgn(100 * r.clv, 1)}¢ по ${r.n}` : "реальных пока нет"} · ${p ? `бумага: ${sgn(100 * p.clv, 1)}¢ по ${p.n}` : "бумажных пока нет"}. Ориентир: ≈150 ставок и CLV < +1¢ — реальные остановить`,
        warn ? "bad" : v && v.clv > 0.01 ? "good" : ""); })()}
  </div>

  ${IDEAS}
  ${freshTable()}
  <div class="section-title">Что робот опрашивает</div>
  <div class="card"><div class="card-b tbl-wrap"><table class="tbl"><thead><tr><th class="l">Опрос</th><th class="l">Последний раз</th><th class="l">Результат</th><th class="l">Следующий</th></tr></thead><tbody>
  ${(NFL ? [["heartbeat", "Цикл робота (каждые 20 с)"], ["signals", "Решения по матчам (" + (d.mode === "report" ? "за 24 ч, после отчёта о травмах" : "вторник 12:00 ET") + ")"], ["markets", "Поиск рынков Polymarket"], ["trades", "Лента сделок Polymarket (исполнение заявок)"],
     ["prices", "Цены и объёмы Polymarket (каждые 20 с)"], ["previews", "Прогноз с поправками на 7 дней (каждый час)"], ["injuries", "Травмы: ESPN (каждые 2 ч)"], ["schedule", "Расписание НФЛ (каждый час)"], ["daily", "Ежедневный цикл (07:00 Нью-Йорк)"], ["account", "Счёт Polymarket (реальные ставки)"]]
   : NHL ? [["heartbeat", "Цикл робота (каждые 20 с)"], ["signals", "Решения по матчам (за 48 ч до начала)"], ["markets", "Поиск рынков Polymarket"], ["trades", "Лента сделок Polymarket (исполнение заявок)"],
     ["prices", "Цены и объёмы Polymarket (каждые 20 с)"], ["previews", "Прогноз с поправками на 4 дня (каждый час)"], ["injuries", "Травмы: ESPN + Hockey-Reference (каждые 2 ч)"], ["goalies", "Стартовые вратари: DailyFaceoff (каждые 30 мин)"], ["schedule", "Расписание НХЛ (каждый час)"], ["daily", "Ежедневный цикл (06:30 Нью-Йорк)"], ["account", "Счёт Polymarket (реальные ставки)"]]
   : [["heartbeat", "Цикл робота (каждые 20 с)"], ["signals", "Решения по матчам (за сутки до начала)"], ["markets", "Поиск рынков Polymarket"], ["trades", "Лента сделок Polymarket (исполнение заявок)"],
     ["prices", "Цены и объёмы Polymarket (каждые 20 с)"], ["previews", "Прогноз с поправками на 4 дня (каждый час)"], ["reports", "Отчёты НБА о травмах (каждые 15 мин)"], ["rosters", "Составы и переходы (каждые 3 ч)"], ["daily", "Ежедневный цикл (07:00 Нью-Йорк)"], ["account", "Счёт Polymarket (реальные ставки)"]]).map(([k, name]) => {
      const a = k === "heartbeat" ? (s.heartbeat ? { t: s.heartbeat, msg: s.alive ? "работает" : "не отвечает" } : null) : s["act_" + k];
      return `<tr><td class="l">${name}</td><td class="l">${a ? `${tsDate(a.t)} <span class="faint">(${agoText(now - a.t)})</span>` : `<span class="faint">ещё не было</span>`}</td>
        <td class="l">${a ? esc(ruTxt(a.msg)) : ""}</td><td class="l">${a?.next ? (a.next > now ? `${tsDate(a.next)} <span class="faint">(через ${cdText(a.next)})</span>` : "сейчас") : "—"}</td></tr>`; }).join("")}
  </tbody></table></div><div class="hint" style="padding:0 16px 14px">Страница обновляется сама каждые 20 секунд.</div></div>

  <div class="section-title">Ближайшие матчи (4 дня)</div>
  ${upcomingTable(d.upcoming, R["включены"] ? R["источники"] : null)}

  ${typeof NFL !== "undefined" && NFL && d.forward && d.forward.length ? forwardBox(d) : ""}
  <div class="section-title">${EURO ? "Ставки" : "Реальные ставки — настройки"}</div>
  ${EURO ? `<div class="card"><div class="card-b">Евролига — <b>только бумажные ставки</b>: робот ведёт их по тем же правилам, что у НБА (вход за 48 ч, заявка «середина − 1 ¢», стратегии «по рынку», «догонять», «держать»), а размер ставки пересчитывается по банку как у НБА. Реальных ставок и ручных заявок для Евролиги нет.</div></div>` : ""}
  <div class="card rc">
    ${d.has_password ? "" : `<div class="rc-warn">Пароль управления ещё не задан — сначала запустите «9. Пароль управления.bat» на компьютере с роботом.</div>`}
    <div class="rc-head ${R["включены"] ? "on" : ""}">
      ${sw("r-on", R["включены"], "Реальные ставки", R["включены"] ? "включены — робот ставит настоящие деньги по настройкам ниже" : "выключены — робот ведёт только бумажные ставки")}
      <span class="rc-state">${R["включены"] ? "ВКЛ" : "ВЫКЛ"}</span>
    </div>
    <div class="rc-grid">
      <section class="rc-s rc-wide">
        <h4>${IC("M4 19V5M4 19h16M8 15l3-4 3 2 5-6")}Что ставим</h4>
        <div class="rc-l">Прогноз</div>
        <div class="rc-pills">${srcBox}</div>
        <div class="rc-l" style="margin-top:16px">Стратегии входа</div>
        <div class="rc-opts">${planBox}</div>
        <div style="margin-top:14px">${sw("r-one", R["одна_ставка_на_матч"], "Не больше одной ставки на матч")}</div>
      </section>
      <section class="rc-s">
        <h4>${IC("M3 7h15a3 3 0 0 1 3 3v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7l12-4v4M17 14h.01")}Кошелёк</h4>
        ${fld("Адрес кошелька Polymarket", `<input class="input rc-mono" id="r-wallet" value="${esc(R["кошелёк"])}" placeholder="0x…" spellcheck="false">`)}
        ${fld("Вход в Polymarket", `<select class="select" id="r-sig"><option value="1" ${R["тип_подписи"] == 1 ? "selected" : ""}>по почте (Magic)</option><option value="2" ${R["тип_подписи"] == 2 ? "selected" : ""}>через браузерный кошелёк</option><option value="0" ${R["тип_подписи"] == 0 ? "selected" : ""}>обычный кошелёк (без прокси)</option></select>`)}
        <div class="rc-note">${IC("M6 11V8a6 6 0 0 1 12 0v3M5 11h14v10H5z")}<span>Ключ кошелька на сайте не вводится и никуда не передаётся — только переменная <b>POLYMARKET_PRIVATE_KEY</b> на сервере с роботом.</span></div>
      </section>
      <section class="rc-s">
        <h4>${IC("M12 3v18M17 7H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6")}Банк и размер ставки</h4>
        <div class="rc-row">${fld("Банк на старте", inp("k-start", bank.start, "10", "min=10"), "", "$")}${fld("Пересчёт банка при изменении на", inp("k-step", bank.step, "1"), "", "%")}</div>
        ${sw("k-acc", bank["из_аккаунта"], "Банк = сумма на счёте Polymarket")}
        ${fld("Метод ставки", `<select class="select" id="k-method">${Object.entries(METHODS).map(([k, v]) => `<option value="${k}" ${bank.method === k ? "selected" : ""}>${v}</option>`).join("")}</select>`)}
        <div class="rc-row">${fld("Ставка min", inp("k-min", bank.min), "", "% банка")}${fld("Ставка max", inp("k-max", bank.max), "", "% банка")}</div>
        <div class="rc-row m-diff">${fld("Расхождение для min", inp("k-lo", bank.lo, "0.5"), "", "п.п.")}${fld("для max", inp("k-hi", bank.hi, "0.5"), "", "п.п.")}<span class="m-note rc-hint"> — не для Келли</span></div>
        <div class="rc-row">${fld("Келли: доля", inp("k-kf", bank.kf, "0.05"), "m-kelly")}${fld("Келли: доверие к модели", inp("k-trust", bank.trust, "0.05"), "m-kelly")}</div>
      </section>
      <section class="rc-s">
        <h4>${IC("M12 3 4 6v6c0 4.4 3.4 8.5 8 9 4.6-.5 8-4.6 8-9V6z")}Лимиты безопасности</h4>
        <div class="rc-row">${fld("Максимум на одну ставку", inp("l-max", lim["макс_ставка_usd"], "1"), "", "$")}${fld("Ставок за сутки", inp("l-day", lim["в_день_usd"], "10"), "", "$")}</div>
        <div class="rc-row">${fld("Остановиться при убытке", inp("l-loss", lim["макс_убыток_usd"], "10"), "", "$")}${fld("Открытых ставок", inp("l-open", lim["макс_открытых"], "1"), "", "шт.")}</div>
        <div class="rc-note">${IC("M12 8v5M12 16h.01M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z")}<span>Стоп можно нажать без пароля, снять — только с паролем.</span></div>
      </section>
    </div>
    <div class="rc-foot">
      <label class="rc-f rc-pw"><span class="rc-l">Пароль управления</span><span class="rc-in"><input class="input" type="password" id="r-pw" value="${esc(BOT_PW)}" autocomplete="current-password" placeholder="нужен для сохранения"></span></label>
      <button class="rc-save" id="r-save">${IC("M5 12l5 5L20 7")}Сохранить настройки</button>
      <button class="chip" id="r-recheck" title="Сразу перепроверить все отложенные реальные ставки (лимит, связь, минимальная заявка) по текущим ценам">Перепроверить сейчас</button>
      <span id="r-msg" class="hint"></span>
    </div>
  </div>

  <div class="grid g2" style="margin-top:16px">
    <div class="card"><div class="card-h"><h3>Журнал</h3><span class="muted">последние события робота</span></div>
      <div class="card-b" style="max-height:420px;overflow:auto">${d.events.map((e) => `<div class="ev ${lvl[e.level] || ""}"><span class="faint">${tsDate(e.t)}</span> ${esc(ruTxt(e.message))}</div>`).join("") || `<div class="empty">Пока пусто</div>`}</div></div>
    ${ALT ? `<div class="card"><div class="card-h"><h3>Травмы</h3><span class="muted">последний снимок ${NFL ? "ESPN (официальный отчёт)" : "ESPN и Hockey-Reference"}</span></div>
      <div class="card-b" style="max-height:420px;overflow:auto">${(d.injuries || []).map((t) => `<div class="ev"><span class="match-mini">${logo(t.team, "sm")}${esc(t.team)}</span> <b>${esc(t.name)}</b> — ${esc(t.status || "")}${t["return"] ? ` <span class="faint">(вернётся ~${esc(String(t["return"]).slice(0, 10))})</span>` : ""} <span class="faint">${esc(t.src)}${t.note ? " · " + esc(String(t.note).slice(0, 90)) : ""}</span></div>`).join("") || `<div class="empty">Снимка травм ещё нет — появится, когда робот запустится</div>`}</div></div>` : `<div class="card"><div class="card-h"><h3>Переходы игроков</h3><span class="muted">по ежедневным снимкам составов</span></div>
      <div class="card-b" style="max-height:420px;overflow:auto">${d.transactions.map((t) => `<div class="ev"><span class="faint">${dateShort(t.date)}${t.time ? " " + t.time : ""}</span> <b>${esc(t.name)}</b>: ${t.from ? `<span class="match-mini">${logo(t.from, "sm")}${t.from}</span>` : "вне состава"} → ${t.to ? `<span class="match-mini">${logo(t.to, "sm")}${t.to}</span>` : "вне состава"}</div>`).join("") || `<div class="empty">Пока нет: появятся, когда составы изменятся после первого снимка</div>`}</div></div>`}
  </div>`;

  window._botDirty = false;
  $$(".card input, .card select").forEach((i) => i.addEventListener("input", () => (window._botDirty = true)));
  $$("tr[data-g]").forEach((tr) => tr.onclick = () => showRobotGame(tr.dataset.g));
  if ($("#b-goreal")) $("#b-goreal").onclick = () => { const c = $(".rc"); if (c) { c.scrollIntoView({ behavior: "smooth", block: "start" }); c.classList.add("flash"); setTimeout(() => c.classList.remove("flash"), 1800); } };
  $("#b-stop").onclick = async () => {
    try {
      if (stopped) { BOT_PW = $("#r-pw").value || prompt("Пароль управления") || ""; }
      await botApi("stop", { stop: !stopped }); route();
    } catch (e) { alert(e.message); }
  };
  const methodUi = () => {                                          // у Келли «расхождение для min/max» не участвует, у остальных — доля и доверие Келли
    const k = $("#k-method").value === "kelly";
    $$(".m-diff").forEach((l) => { l.classList.toggle("off", k); l.querySelectorAll("input").forEach((i) => (i.disabled = k)); const m = l.querySelector(".m-note"); if (m) m.style.display = k ? "" : "none"; });
    $$(".m-kelly").forEach((l) => { l.classList.toggle("off", !k); l.querySelectorAll("input").forEach((i) => (i.disabled = !k)); });
  };
  if ($("#k-method")) { $("#k-method").addEventListener("change", methodUi); methodUi(); }
  $("#r-on")?.addEventListener("change", (e) => { const h = $(".rc-head"); h.classList.toggle("on", e.target.checked);
    $(".rc-state", h).textContent = e.target.checked ? "ВКЛ" : "ВЫКЛ";
    $(".rc-sw small", h).textContent = e.target.checked ? "будут включены после сохранения" : "будут выключены после сохранения"; });
  $("#r-recheck").onclick = async () => {                           // очередь ручных заявок: робот сам перепроверяет отложенные ставки
    BOT_PW = $("#r-pw").value; const msg = $("#r-msg"); msg.textContent = "Отправляю…";
    try {
      const q = await botApi("manual", { kind: "перепроверить" });
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const s = await botApi("manual/" + q.id);
        if (s.status === "готово" || s.status === "ошибка") { msg.textContent = (s.status === "готово" ? "Готово ✓ " : "") + (s.note || ""); setTimeout(route, 6000); return; }
      }
      msg.textContent = "Робот пока не ответил — смотрите журнал";
    } catch (e) { msg.textContent = e.message; }
  };
  $("#r-save").onclick = async () => {
    const n = (id) => parseFloat($("#" + id).value);
    const body = { "реальные": {
      "включены": $("#r-on").checked, "одна_ставка_на_матч": $("#r-one").checked,
      "источники": $$("[data-src]").filter((x) => x.checked).map((x) => x.dataset.src),
      "стратегии": $$("[data-plan]").filter((x) => x.checked).map((x) => x.dataset.plan),
      "кошелёк": $("#r-wallet").value.trim(), "тип_подписи": +$("#r-sig").value,
      "банк": { start: n("k-start"), "из_аккаунта": $("#k-acc").checked, min: n("k-min"), max: n("k-max"), flat: bank.flat, step: n("k-step"),
        lo: n("k-lo"), hi: n("k-hi"), method: $("#k-method").value, kf: n("k-kf"), trust: n("k-trust") },
      "лимиты": { "макс_ставка_usd": n("l-max"), "в_день_usd": n("l-day"), "макс_убыток_usd": n("l-loss"), "макс_открытых": n("l-open") } } };
    if (body["реальные"]["включены"] && (!body["реальные"]["источники"].length || !body["реальные"]["стратегии"].length)) { $("#r-msg").textContent = "Выберите хотя бы один прогноз и одну стратегию"; return; }
    if (body["реальные"]["включены"] && !R["включены"] && !confirm("Включить РЕАЛЬНЫЕ ставки на Polymarket? Робот начнёт ставить настоящие деньги по этим настройкам.")) return;
    BOT_PW = $("#r-pw").value;
    try { await botApi("settings", body); $("#r-msg").textContent = "Сохранено ✓ (робот применит в течение минуты)"; setTimeout(route, 1200); }
    catch (e) { $("#r-msg").textContent = e.message; }
  };
}

function showLineups(g) {
  const p = g.prediction, L = (s) => JSON.parse(s || "[]");
  const col = (team, arr) => `<div><h4>${logo(team, "sm")} ${esc(teamName(team))}</h4>${arr.map(([pid, nm, sh]) => `<div class="ev" style="display:flex;justify-content:space-between;gap:10px"><span>${esc(nm)}</span><span class="faint">${f1((48 * sh) / 5, 0)} мин</span></div>`).join("")}</div>`;
  const box = document.createElement("div");
  box.className = "modal"; box.innerHTML = `<div class="card modal-c"><div class="card-h"><h3>Ожидаемые составы · ${g.home} — ${g.away}</h3><button class="chip" id="m-x">✕</button></div>
    <div class="card-b grid g2">${col(g.home, L(p.lineup_h))}${col(g.away, L(p.lineup_a))}</div>
    <div class="hint" style="padding:0 16px 14px">Минуты — ожидаемые, с учётом вероятности выхода (отчёт о травмах: Out — 0, Questionable — половина). ${p.report ? "Отчёт о травмах учтён." : "Отчёта о травмах на момент прогноза не было."}</div></div>`;
  document.body.appendChild(box);
  const close = () => box.remove();
  box.onclick = (e) => { if (e.target === box) close(); };
  box.querySelector("#m-x").onclick = close;
}
