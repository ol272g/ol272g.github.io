"use strict";
/* ================= КОМАНДЫ: сетка логотипов и страница команды (состав на сегодня + статистика) — для всех лиг ================= */

// как команды делятся в лиге: [[заголовок, [[подзаголовок, [коды…]], …]], …]; не вошедшие — в «Другие»
const TEAM_GROUPS = {
  nba: [["Восточная конференция", [["Атлантический дивизион", ["BOS", "BKN", "NYK", "PHI", "TOR"]], ["Центральный дивизион", ["CHI", "CLE", "DET", "IND", "MIL"]], ["Юго-Восточный дивизион", ["ATL", "CHA", "MIA", "ORL", "WAS"]]]],
    ["Западная конференция", [["Северо-Западный дивизион", ["DEN", "MIN", "OKC", "POR", "UTA"]], ["Тихоокеанский дивизион", ["GSW", "LAC", "LAL", "PHX", "SAC"]], ["Юго-Западный дивизион", ["DAL", "HOU", "MEM", "NOP", "SAS"]]]]],
  nhl: [["Восточная конференция", [["Атлантический дивизион", ["BOS", "BUF", "DET", "FLA", "MTL", "OTT", "TBL", "TOR"]], ["Столичный дивизион", ["CAR", "CBJ", "NJD", "NYI", "NYR", "PHI", "PIT", "WSH"]]]],
    ["Западная конференция", [["Центральный дивизион", ["CHI", "COL", "DAL", "MIN", "NSH", "STL", "UTA", "WPG"]], ["Тихоокеанский дивизион", ["ANA", "CGY", "EDM", "LAK", "SEA", "SJS", "VAN", "VGK"]]]]],
  nfl: [["Американская конференция (AFC)", [["Восток", ["BUF", "MIA", "NE", "NYJ"]], ["Север", ["BAL", "CIN", "CLE", "PIT"]], ["Юг", ["HOU", "IND", "JAX", "TEN"]], ["Запад", ["DEN", "KC", "LAC", "LV"]]]],
    ["Национальная конференция (NFC)", [["Восток", ["DAL", "NYG", "PHI", "WAS"]], ["Север", ["CHI", "DET", "GB", "MIN"]], ["Юг", ["ATL", "CAR", "NO", "TB"]], ["Запад", ["ARI", "LA", "SEA", "SF"]]]]],
  euro: [],
};
const NFL_ST_POS = new Set(["K", "P", "LS"]);

const tAge = (birth) => { if (!birth) return null; const d = new Date(birth + "T12:00:00Z"); if (Number.isNaN(d.getTime())) return null; return Math.floor((Date.now() - d.getTime()) / 31557600000); };
const tRec = (r) => (r.gp ? `${r.w}–${r.l}${r.t ? "–" + r.t : ""}` : "—");
const tSeasonChips = (d, id) => `<div class="chips" id="${id}">${d.seasons.map((s) => `<button class="chip ${s === d.season ? "active" : ""}" data-s="${s}">${seasonLabel(s)}</button>`).join("")}</div>`;
const tPhotos = (list) => list.forEach((p) => { if (p.photo) PHOTO[p.player_id] = p.photo; });
const tPl = (n) => { const a = n % 10, b = n % 100; return `${n} ${a === 1 && b !== 11 ? "игрок" : a >= 2 && a <= 4 && (b < 12 || b > 14) ? "игрока" : "игроков"}`; };
const tNum = (v, d = 0) => (isNum(v) ? Number(v).toFixed(d) : "—");

/* ---------- сетка команд ---------- */
async function viewTeams(q) {
  const d = await api(`teams${q.season ? `?season=${q.season}` : ""}`);
  const by = Object.fromEntries(d.teams.map((t) => [t.team, t]));
  const used = new Set();
  const card = (t) => {
    used.add(t.team);
    return `<a class="tcard" href="#/team/${t.team}" style="--tc:${teamColor(t.team)}" title="${esc(t.name)}">
      ${logo(t.team, "lg").replace(' loading="lazy"', "")}
      <div class="tn">${esc(t.name)}</div>
      <div class="tr"><b>${tRec(t)}</b>${t.n ? `<div class="faint tn2">${tPl(t.n)}</div>` : ""}</div>
      <div class="tf">${(t.form || []).slice().reverse().map((f) => `<i class="${f === "В" ? "w" : f === "П" ? "l" : ""}" title="${f === "В" ? "победа" : f === "П" ? "поражение" : "ничья"}"></i>`).join("")}</div>
    </a>`;
  };
  const grid = (codes) => `<div class="tgrid">${codes.filter((c) => by[c]).map((c) => card(by[c])).join("")}</div>`;
  let body = "";
  for (const [conf, divs] of TEAM_GROUPS[SPORT] || []) {
    body += `<div class="section-title">${conf}</div>` + divs.map(([dv, codes]) => `<div class="tdiv">${dv}</div>${grid(codes)}`).join("");
  }
  const rest = d.teams.filter((t) => !used.has(t.team));
  if (rest.length) body += (used.size ? `<div class="section-title">Другие</div>` : "") + `<div class="tgrid">${rest.map(card).join("")}</div>`;
  app.innerHTML = `
  <div class="page-head"><div><h1>Команды</h1><div class="sub">Нажмите на команду — откроется её состав на сегодня со статистикой игроков. Рекорд и «форма» (последние пять матчей, справа — самый свежий) — за регулярный сезон ${d.season != null ? seasonLabel(d.season) : "—"}${d.roster_built ? `; составы обновлены ${ruTxt(d.roster_built)}` : ""}.</div></div>
    ${d.seasons.length > 1 ? tSeasonChips(d, "tseas") : ""}</div>
  ${d.teams.length ? body : `<div class="empty">Нет данных о командах</div>`}`;
  $$("#tseas .chip").forEach((b) => (b.onclick = () => { setQuery("teams", { season: b.dataset.s }); route(); }));
}

/* ---------- таблицы состава ---------- */
const tPlayer = (x, showPos = true) => `<div class="pl">${avatar(x.player_id, x.name)}<span class="nm">${esc(x.name)}</span>${showPos && x.pos ? `<span class="st">${esc(x.pos)}</span>` : ""}${x.status ? `<span class="pill neutral" title="статус в заявке">${esc(x.status)}</span>` : ""}${tNewTag(x)}</div>`;
function tNewTag(x) {
  if (x.exp === 0) return `<span class="pill acc" title="первый сезон в лиге">новичок</span>`;
  if (x.prev) return `<span class="pill blue" title="последний матч сыграл за ${esc(teamName(x.prev))}">из ${esc(x.prev)}</span>`;
  return "";
}
const tBase = (hasWeight) => [
  { key: "num", label: "№", l: true, sort: (x) => (x.num != null && /^\d+$/.test(x.num) ? +x.num : null), fmt: (x) => `<span class="faint">${esc(x.num ?? "")}</span>` },
  { key: "name", label: "Игрок", l: true, sort: (x) => x.name, fmt: (x) => tPlayer(x) },
  { key: "age", label: "Возр.", title: "возраст, лет", sort: (x) => tAge(x.birth), fmt: (x) => tNum(tAge(x.birth)) },
  { key: "h", label: "Рост", title: "рост, см", sort: (x) => x.height_cm, fmt: (x) => tNum(x.height_cm) },
  ...(hasWeight ? [{ key: "w", label: "Вес", title: "вес, кг", sort: (x) => x.weight_kg, fmt: (x) => tNum(x.weight_kg) }] : []),
];
const tSt = (k) => (x) => x.s?.[k];
const tCell = (k, d = 0, bold) => ({ sort: tSt(k), fmt: (x) => { const v = tNum(x.s?.[k], d); return bold ? `<b>${v}</b>` : v; } });
const tRating = (key, label, title, d = 2) => ({ key, label, sep: true, title, sort: (x) => x[key === "r" ? "rating" : key], fmt: (x) => { const v = x[key === "r" ? "rating" : key]; return isNum(v) ? `<b class="${cls(v)}">${sgn(v, d)}</b>` : "—"; } });
const tGlk = (title) => ({ key: "glicko", label: "Глико-2", title, sort: (x) => x.glicko, fmt: (x) => glk(x.glicko, x.glicko_sd) });

function tSection(title, players, cols, sortKey, note) {
  if (!players.length) return "";
  const t = table({ cols, rows: players, onRow: (x) => (location.hash = `#/player/${x.player_id}`), sortKey, id: "tt" + Math.random().toString(36).slice(2, 7) });
  tSection.pending.push(t);
  return `<div class="section-title">${title} <span class="faint" style="text-transform:none;letter-spacing:0;font-weight:500">· ${players.length}${note ? " · " + note : ""}</span></div><div class="card"><div class="card-b">${t.html}</div></div>`;
}
tSection.pending = [];

function teamTables(d) {
  const P = d.players, hasW = P.some((x) => x.weight_kg);
  const out = [];
  if (SPORT === "nba" || SPORT === "euro") {
    const cols = [...tBase(hasW),
      { key: "gp", label: "И", title: "игр за сезон", sep: true, ...tCell("gp") }, { key: "min", label: "Мин", ...tCell("min", 1) }, { key: "pts", label: "Очк", ...tCell("pts", 1, true) },
      { key: "reb", label: "Подб", ...tCell("reb", 1) }, { key: "ast", label: "Пер", ...tCell("ast", 1) }, { key: "stl", label: "Пх", ...tCell("stl", 1) }, { key: "blk", label: "Бл", ...tCell("blk", 1) },
      { key: "fg", label: "С игры", sep: true, sort: tSt("fg_pct"), fmt: (x) => pct(x.s?.fg_pct, 1) }, { key: "fg3", label: "3-очк", sort: tSt("fg3_pct"), fmt: (x) => pct(x.s?.fg3_pct, 1) },
      { key: "ft", label: "Штр", sort: tSt("ft_pct"), fmt: (x) => pct(x.s?.ft_pct, 1) }, { key: "ts", label: "TS%", sort: tSt("ts"), fmt: (x) => pct(x.s?.ts, 1) },
      { key: "pm", label: "+/−", sort: tSt("pm"), fmt: (x) => `<span class="${cls(x.s?.pm)}">${sgn(x.s?.pm)}</span>` },
      tRating("r", "SHARP", "наша оценка: очков за 48 минут сверх среднего игрока лиги", 2),
      ...(P.some((x) => isNum(x.glicko)) ? [tGlk(GLK_TITLE)] : []),
      ...(P.some((x) => isNum(x.darko)) ? [{ key: "darko", label: "DARKO", sort: (x) => x.darko, fmt: (x) => `<span class="${cls(x.darko)}">${sgn(x.darko)}</span>` }] : [])];
    out.push(tSection("Состав", P, cols, "min"));
  } else if (SPORT === "nhl") {
    const sk = P.filter((x) => x.pos !== "G"), gk = P.filter((x) => x.pos === "G");
    const sCols = [...tBase(hasW),
      { key: "gp", label: "И", sep: true, ...tCell("gp") }, { key: "toi", label: "Время", sort: tSt("toi"), fmt: (x) => toiFmt(x.s?.toi) },
      { key: "g", label: "Г", ...tCell("g") }, { key: "a", label: "П", ...tCell("a") }, { key: "pts", label: "О", ...tCell("pts", 0, true) },
      { key: "sog", label: "Бр", title: "броски в створ", ...tCell("sog") }, { key: "ixg", label: "xG", title: "ожидаемые голы с его бросков", ...tCell("ixg", 1) },
      { key: "hits", label: "Хиты", ...tCell("hits") }, { key: "blk", label: "Бл", title: "блок-шоты", ...tCell("blk") }, { key: "pim", label: "Штр", title: "штрафные минуты", ...tCell("pim") },
      { key: "off", label: "Атака", sep: true, title: NHL_RATING_T, sort: (x) => x.off, fmt: (x) => `<span class="${cls(x.off)}">${sgn(x.off, 2)}</span>` },
      { key: "def", label: "Защита", sort: (x) => x.def, fmt: (x) => `<span class="${cls(x.def)}">${sgn(x.def, 2)}</span>` },
      tRating("r", "SHARP", NHL_RATING_T, 2), tGlk(NHL_GLK_T)];
    out.push(tSection("Нападающие", sk.filter((x) => x.pos !== "D"), sCols, "pts"));
    out.push(tSection("Защитники", sk.filter((x) => x.pos === "D"), sCols, "pts"));
    const gCols = [...tBase(hasW), { key: "gp", label: "И", sep: true, ...tCell("gp") }, { key: "gs", label: "Старт", ...tCell("gs") },
      { key: "svp", label: "% отр.", sort: (x) => (x.s?.sa ? x.s.sv / x.s.sa : null), fmt: (x) => svPct(x.s?.sv, x.s?.sa) },
      { key: "ga", label: "Пропущ.", ...tCell("ga") },
      { key: "gsax", label: "Сверх ожид.", title: "голы, предотвращённые сверх ожидаемых за сезон", sort: tSt("gsax"), fmt: (x) => `<span class="${cls(x.s?.gsax)}">${sgn(x.s?.gsax, 1)}</span>` },
      tRating("r", "Рейтинг", NHL_GSAX_T, 2), tGlk(NHL_GLK_T)];
    out.push(tSection("Вратари", gk, gCols, "gp"));
  } else {
    const snap = (x) => (x.s ? (x.s.off_pct || 0) + (x.s.def_pct || 0) : null);
    const snapC = { key: "snap", label: "Снапы", title: "доля розыгрышей на поле, % (в среднем за игру)", sort: snap, fmt: (x) => (isNum(snap(x)) ? Math.round(snap(x)) + "%" : "—") };
    const rt = (key) => ({ key: "sharp", label: "SHARP", sep: true, title: key === "rating_q" ? NFL_QB_T : NFL_RATING_T, sort: (x) => x[key], fmt: (x) => (isNum(x[key]) ? `<b class="${cls(x[key])}">${sgn(x[key], 3)}</b>` : "—") });
    const epa = { key: "epa", label: "EPA", title: "ожидаемые очки, добавленные за сезон", sort: tSt("epa"), fmt: (x) => `<span class="${cls(x.s?.epa)}">${sgn(x.s?.epa, 0)}</span>` };
    const base = tBase(hasW), gp = { key: "gp", label: "И", sep: true, ...tCell("gp") }, glk2 = tGlk(NFL_GLK_T);
    const grp = (g) => P.filter((x) => (NFL_ST_POS.has(x.pos) ? "ST" : NFL_POS_GRP[x.pos] || "OT") === g);
    out.push(tSection("Квотербеки", grp("QB"), [...base, gp, snapC, { key: "cmp", label: "Пасы", title: "точных / всего", sort: tSt("att"), fmt: (x) => (x.s?.att ? `${x.s.cmp}/${x.s.att}` : "—") },
      { key: "py", label: "Ярды", ...tCell("pass_yds", 0, true) }, { key: "ptd", label: "TD", ...tCell("pass_td") }, { key: "int", label: "INT", ...tCell("int") }, { key: "sk", label: "Сэки", title: "сколько раз его сбили", ...tCell("sacked") }, epa, rt("rating_q"), glk2], "snap"));
    out.push(tSection("Раннинбеки", grp("RB"), [...base, gp, snapC, { key: "car", label: "Выносы", ...tCell("car") }, { key: "ry", label: "Ярды", ...tCell("rush_yds", 0, true) }, { key: "rtd", label: "TD", ...tCell("rush_td") },
      { key: "rec", label: "Приёмы", ...tCell("rec") }, { key: "recy", label: "Ярды", title: "ярды приёма", ...tCell("rec_yds") }, epa, rt("rating"), glk2], "snap"));
    const rcCols = [...base, gp, snapC, { key: "tgt", label: "Цели", ...tCell("tgt") }, { key: "rec", label: "Приёмы", ...tCell("rec") }, { key: "recy", label: "Ярды", ...tCell("rec_yds", 0, true) }, { key: "rtd", label: "TD", ...tCell("rec_td") }, epa, rt("rating"), glk2];
    out.push(tSection("Ресиверы", grp("WR"), rcCols, "snap"));
    out.push(tSection("Тайт-энды", grp("TE"), rcCols, "snap"));
    out.push(tSection("Линия нападения", grp("OL"), [...base, gp, snapC, rt("rating"), glk2], "snap"));
    const dfCols = [...base, gp, snapC, { key: "tkl", label: "Захв.", title: "захваты", ...tCell("tkl", 0, true) }, { key: "tfl", label: "В тылу", title: "захваты с потерей ярдов", ...tCell("tfl") },
      { key: "sacks", label: "Сэки", ...tCell("sacks", 1) }, { key: "qbh", label: "Давл.", title: "удары по квотербеку", ...tCell("qb_hits") }, { key: "dint", label: "Перехв.", ...tCell("def_int") },
      { key: "pd", label: "Отбои", ...tCell("pd") }, { key: "ff", label: "Выб.", title: "выбитые мячи", ...tCell("ff") }, rt("rating_d"), glk2];
    out.push(tSection("Линия защиты", grp("DL"), dfCols, "snap"));
    out.push(tSection("Лайнбекеры", grp("LB"), dfCols, "snap"));
    out.push(tSection("Защитная вторая линия", grp("DB"), dfCols, "snap"));
    out.push(tSection("Спецкоманды", grp("ST"), [...base, gp, { key: "fg", label: "Голы с поля", sort: tSt("fga"), fmt: (x) => (x.s?.fga ? `${x.s.fg}/${x.s.fga}` : "—") }], "gp"));
    out.push(tSection("Прочие", grp("OT"), [...base, gp, snapC], "snap"));
  }
  return out.join("");
}

/* ---------- страница команды ---------- */
async function viewTeam(abbr, q) {
  const d = await api(`team/${encodeURIComponent(abbr)}${q.season ? `?season=${q.season}` : ""}`);
  tPhotos(d.players);
  const t = d.team, c = teamColor(t.team), P = d.players;
  const ages = P.map((x) => tAge(x.birth)).filter(isNum), hs = P.map((x) => x.height_cm).filter(isNum);
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  let grp = "";
  for (const [conf, divs] of TEAM_GROUPS[SPORT] || []) for (const [dv, codes] of divs) if (codes.includes(t.team)) grp = `${conf.split(" (")[0]} · ${dv}`;
  const gl = (g) => { const home = g.home === t.team, own = home ? g.hp : g.ap, opp = home ? g.ap : g.hp, o = home ? g.away : g.home; return { o, home, own, opp, win: own > opp, tie: own === opp }; };
  const lastHtml = d.last.length ? d.last.map((g) => { const r = gl(g); return `<a class="trow" href="#/game/${g.game_id}"><span class="faint">${dateShort(g.date)}</span><span class="match-mini">${r.home ? "" : "@ "}${logo(r.o, "sm")}${r.o}</span><span class="pill ${r.tie ? "neutral" : r.win ? "good" : "bad"}">${r.tie ? "Н" : r.win ? "В" : "П"} ${r.own}:${r.opp}</span></a>`; }).join("") : `<div class="empty" style="padding:18px">Матчей ещё не было</div>`;
  const nextHtml = d.next.length ? d.next.map((g) => { const home = g.home === t.team, o = home ? g.away : g.home, dt = parseUtc(g.start_utc); return `<a class="trow" href="#/game/${g.game_id}"><span class="faint">${dt ? ruDate(dt) : dateShort(g.date)}</span><span class="match-mini">${home ? "" : "@ "}${logo(o, "sm")}${o}</span><span class="faint">${dt ? ruTime(dt) : ""}</span></a>`; }).join("") : `<div class="empty" style="padding:18px">Расписание не загружено</div>`;
  tSection.pending = [];
  const tables = teamTables(d);
  app.innerHTML = `
  <a class="back" href="#/teams">← Все команды</a>
  <div class="card phero hero tphero" style="--c1:${c};--c2:${c}">
    ${logo(t.team, "lg")}
    <div><div class="nm">${esc(t.name)}</div>
      <div class="meta">${grp ? `<span>${esc(grp)}</span>` : ""}<span>Сезон ${d.season != null ? seasonLabel(d.season) : "—"}: <b>${d.record.gp ? tRec(d.record) : "матчей не было"}</b></span></div></div>
    <div class="pstats">
      <div><div class="v">${P.length}</div><div class="l">игроков в составе</div></div>
      <div><div class="v">${f1(avg(ages))}</div><div class="l">средний возраст</div></div>
      <div><div class="v">${tNum(avg(hs))}</div><div class="l">средний рост, см</div></div>
    </div>
  </div>
  ${d.seasons.length > 1 ? `<div style="margin-top:14px">${tSeasonChips(d, "tseas")}</div>` : ""}
  <div class="sub tsub">${d.source === "official" ? `Состав — официальная заявка на сегодня${d.roster_built ? ` (обновлён ${ruTxt(d.roster_built)})` : ""}.` : "Официальный состав сейчас недоступен — показаны игроки, выходившие за команду в этом сезоне."}
    Статистика — регулярный сезон ${d.season != null ? seasonLabel(d.season) : "—"}, за все команды, где игрок играл. Метка «из …» — игрок пришёл из другой команды. Нажмите на игрока — откроется его страница.</div>
  ${P.length ? tables : `<div class="empty">Состав не найден</div>`}
  <div class="grid g2" style="margin-top:6px">
    <div><div class="section-title">Последние матчи</div><div class="card tlist">${lastHtml}</div></div>
    <div><div class="section-title">Ближайшие матчи</div><div class="card tlist">${nextHtml}</div></div>
  </div>`;
  tSection.pending.forEach((x) => x.render());
  $$("#tseas .chip").forEach((b) => (b.onclick = () => { setQuery(`team/${abbr}`, { season: b.dataset.s }); route(); }));
}
