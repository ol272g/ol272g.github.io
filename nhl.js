"use strict";
/* ================= ХОККЕЙ: страницы матча и игроков (остальное — общее с баскетболом, app.js) ================= */

const NHL_RATING_T = "SHARP (хоккей) перед матчем: насколько больше ожидаемых голов команда создаёт, чем пропускает, пока игрок на льду, за 60 минут в равных составах (сверх среднего)";
const NHL_GSAX_T = "вратарь перед матчем: голы, предотвращённые сверх ожидаемых, на 30 бросков (0 — средний)";
const NHL_GLK_T = "Глико-2 перед матчем: 1500 — средний; +30 пунктов ≈ +0.1 ожидаемого гола за 60 минут";
const toiFmt = (m) => (isNum(m) ? `${Math.floor(m)}:${String(Math.round((m % 1) * 60)).padStart(2, "0")}` : "—");
const endName = (e) => (e === "OT" ? "ОТ" : e === "SO" ? "Б" : "");
const svPct = (sv, sa) => (sa ? (sv / sa).toFixed(3).replace(/^0/, "") : "—");

function nhlPhotos(list) { list.forEach((p) => { if (p.headshot) PHOTO[p.player_id] = p.headshot; }); }

async function viewGameNHL(id) {
  const d = await api(`game/${id}`);
  const g = d.game, played = isNum(g.hp), hw = played && g.hp > g.ap;
  const [ca, ch] = pairColors(g.away, g.home);
  const tb = Object.fromEntries(d.team_box.map((t) => [t.team, t]));
  const pl = (team, goalie) => d.player_box.filter((p) => p.team === team && (p.pos === "G") === goalie);
  const statRow = (label, k, fmt = (v) => v ?? "—", better = 1) => {
    const a = tb[g.away]?.[k], h = tb[g.home]?.[k];
    const wa = isNum(a) && isNum(h) && (better > 0 ? a > h : a < h), wh = isNum(a) && isNum(h) && (better > 0 ? h > a : h < a);
    return `<tr><td class="${wh ? "good" : ""}"><b>${fmt(h)}</b></td><td class="muted">${label}</td><td class="${wa ? "good" : ""}"><b>${fmt(a)}</b></td></tr>`;
  };
  const skCols = [
    { key: "name", label: "Игрок", l: true, sort: (x) => x.name, fmt: (x) => `<div class="pl">${avatar(x.player_id, x.name)}<span class="nm">${esc(x.name)}</span><span class="st">${esc(x.pos || "")}</span></div>` },
    { key: "toi", label: "Время", fmt: (x) => toiFmt(x.toi) },
    { key: "g", label: "Г", title: "голы", fmt: (x) => `<b>${x.g ?? 0}</b>` },
    { key: "a", label: "П", title: "передачи" },
    { key: "pts", label: "О", title: "очки (голы + передачи)" },
    { key: "sog", label: "Бр", title: "броски в створ" },
    { key: "ixg", label: "xG", title: "ожидаемые голы с его бросков", fmt: (x) => f1(x.ixg, 2) },
    { key: "hits", label: "Сил", title: "силовые приёмы" },
    { key: "blk", label: "Бл", title: "блокированные броски соперника" },
    { key: "fo_w", label: "Вбр", title: "вбрасывания: выиграл-проиграл", fmt: (x) => (x.fo_w || x.fo_l ? `${x.fo_w}-${x.fo_l}` : "—") },
    { key: "pim", label: "Штр", title: "штрафные минуты" },
    { key: "rating", label: "SHARP", sep: true, title: NHL_RATING_T, fmt: (x) => `<b class="${cls(x.rating)}">${sgn(x.rating, 2)}</b>` },
    { key: "glicko", label: "Глико-2", title: NHL_GLK_T, fmt: (x) => glk(x.glicko) },
  ];
  const gkCols = [
    { key: "name", label: "Вратарь", l: true, sort: (x) => x.name, fmt: (x) => `<div class="pl">${avatar(x.player_id, x.name)}<span class="nm">${esc(x.name)}</span>${x.starter ? `<span class="st">старт</span>` : ""}</div>` },
    { key: "toi", label: "Время", fmt: (x) => toiFmt(x.toi) },
    { key: "sa", label: "Бросков", title: "броски в створ по нему" },
    { key: "sv", label: "Сейвы" },
    { key: "ga", label: "Пропустил" },
    { key: "svp", label: "% отр.", sort: (x) => (x.sa ? x.sv / x.sa : null), fmt: (x) => svPct(x.sv, x.sa) },
    { key: "gsax", label: "Сверх ожид.", title: "голы, предотвращённые сверх ожидаемых в этом матче (ожидаемые голы по броскам минус пропущенные)", fmt: (x) => `<b class="${cls(x.gsax)}">${sgn(x.gsax, 2)}</b>` },
    { key: "gsax30", label: "Рейтинг", sep: true, title: NHL_GSAX_T, fmt: (x) => `<b class="${cls(x.gsax30)}">${sgn(x.gsax30, 2)}</b>` },
    { key: "glicko", label: "Глико-2", title: NHL_GLK_T, fmt: (x) => glk(x.glicko) },
  ];
  const tables = [];
  const teamBlock = (team) => {
    const s = table({ cols: skCols, rows: pl(team, false), onRow: (x) => (location.hash = `#/player/${x.player_id}`), sortKey: "toi" });
    const k = table({ cols: gkCols, rows: pl(team, true), onRow: (x) => (location.hash = `#/player/${x.player_id}`), sortKey: "toi" });
    tables.push(s, k);
    return `<div class="card" style="margin-top:16px"><div class="card-h"><h3><span class="match-mini">${logo(team, "sm")} ${esc(teamName(team))}</span></h3></div>
      <div class="card-b">${s.html}<div style="height:10px"></div>${k.html}</div></div>`;
  };
  const form = (arr) => arr.map((m) => `<a class="pill ${m.win ? "good" : "bad"}" href="#/game/${m.game_id}" title="${dateShort(m.date)} ${m.home ? "дома" : "в гостях"} — ${m.opp}">${m.win ? "В" : "П"} ${m.score}</a>`).join(" ");
  const betRows = d.bets.map((b) => `<tr class="click" onclick="location.hash='#/bets'"><td class="l">${esc(BOT_SRC[b.strategy] || b.strategy)} <span class="pill neutral">${esc(b.mode)}</span></td>
    <td class="l"><span class="match-mini">${logo(b.team, "sm")}<b>${b.team}</b></span></td><td>${pct(b.model_p)}</td><td>${pct(b.market_p)}</td><td>${isNum(b.entry) ? f1(100 * b.entry, 0) + "¢" : `<span class="faint">${esc(b.status)}</span>`}</td>
    <td class="${cls(b.clv)}">${sgn(100 * b.clv, 1)}</td><td><b class="${cls(b.pnl_hold)}">${money(b.pnl_hold, 2)}</b></td></tr>`).join("");

  app.innerHTML = `
  <div class="card game-hero" style="padding:20px">
    <div class="row" style="display:flex;align-items:center;justify-content:space-between;gap:16px">
      <a class="gteam ${played && !hw ? "lost" : ""}" href="#/games?team=${g.home}" style="display:flex;gap:12px;align-items:center">${logo(g.home, "lg")}<div><div class="abbr" style="font-size:22px">${g.home}</div><div class="nm">${esc(teamName(g.home))}</div><div class="faint" style="font-size:12px">хозяева${g.b2b_home ? " · 2-я игра подряд" : ""}</div></div></a>
      <div style="text-align:center">
        <div class="num" style="font-family:var(--display);font-size:46px;line-height:1">${played ? `<span class="${hw ? "" : "faint"}">${g.hp}</span> : <span class="${hw ? "faint" : ""}">${g.ap}</span>` : startTime(g.start_utc)}</div>
        <div class="muted">${dateShort(g.date)}${endName(g.end_type) ? ` · <b>${endName(g.end_type)}</b>` : ""}${g.type !== "регулярка" ? ` · <span class="pill blue">${esc(g.type)}</span>` : ""}</div>
      </div>
      <a class="gteam r ${played && hw ? "lost" : ""}" href="#/games?team=${g.away}" style="display:flex;gap:12px;align-items:center;flex-direction:row-reverse;text-align:right">${logo(g.away, "lg")}<div><div class="abbr" style="font-size:22px">${g.away}</div><div class="nm">${esc(teamName(g.away))}</div><div class="faint" style="font-size:12px">гости${g.b2b_away ? " · 2-я игра подряд" : ""}</div></div></a>
    </div>
  </div>
  <div class="grid g2" style="margin-top:16px">
    <div class="card"><div class="card-h"><h3>Шансы на победу</h3><span class="muted">хозяева ← → гости</span></div><div class="card-b">
      ${probLine(null, g.model_p, ca, ch, "SHARP", "за 48 ч", SRC === "model")}
      ${probLine(null, g.glicko_p, ca, ch, "Глико-2", "за 48 ч", SRC === "glicko")}
      ${probLine(null, g.mix_p, ca, ch, "SHARP + Глико", "за 48 ч", SRC === "mix")}
      ${probLine(null, g.pm_48h, ca, ch, "Polymarket", "за 48 ч")}
      ${probLine(null, g.pm_24h, ca, ch, "Polymarket", "за 24 ч")}
      ${probLine(null, g.pm_start, ca, ch, "Polymarket", "на старте")}
      ${probLine(null, g.book_p_open, ca, ch, "Букмекеры", "открытие")}
      ${probLine(null, g.book_p_close, ca, ch, "Букмекеры", "закрытие")}
      <div class="hint">Прогнозы моделей честные: сделаны утром за двое суток до матча, по ожидаемым составам и вероятностям стартовых вратарей.</div>
    </div></div>
    <div class="card"><div class="card-h"><h3>Цена на Polymarket</h3><span class="muted">шанс хозяев по часам до начала</span></div><div class="card-b">${d.pm_series.length ? `<div class="chart-box"><canvas id="pmc"></canvas></div>` : `<div class="empty">Рынка на Polymarket не было</div>`}</div></div>
  </div>
  ${played && tb[g.home] ? `<div class="card" style="margin-top:16px"><div class="card-h"><h3>Статистика команд</h3></div><div class="card-b tbl-wrap"><table class="tbl cmp" style="max-width:520px;margin:0 auto"><thead><tr><th>${g.home}</th><th></th><th>${g.away}</th></tr></thead><tbody>
    ${statRow("Голы", "goals")}${statRow("Ожидаемые голы (xG)", "xg", (v) => f1(v, 2))}${statRow("Броски в створ", "sog")}${statRow("Попытки бросков", "att")}
    ${statRow("Выигранные вбрасывания", "fo_w")}${statRow("Силовые приёмы", "hits")}${statRow("Блоки", "blk")}${statRow("Отборы", "take")}${statRow("Потери", "give", (v) => v ?? "—", -1)}${statRow("Штрафные минуты", "pim", (v) => v ?? "—", -1)}
  </tbody></table></div></div>` : ""}
  ${d.bets.length ? `<div class="card" style="margin-top:16px"><div class="card-h"><h3>Ставки по матчу</h3></div><div class="card-b tbl-wrap"><table class="tbl"><thead><tr><th class="l">Стратегия</th><th class="l">На кого</th><th>Модель</th><th>Цена</th><th>Вход</th><th>CLV</th><th>Итог ($100)</th></tr></thead><tbody>${betRows}</tbody></table></div></div>` : ""}
  ${played ? teamBlock(g.home) + teamBlock(g.away) : ""}
  <div class="grid g2" style="margin-top:16px">
    <div class="card"><div class="card-h"><h3>Форма</h3><span class="muted">последние 5 матчей</span></div><div class="card-b">
      <div style="margin-bottom:8px"><span class="match-mini">${logo(g.home, "sm")}<b>${g.home}</b></span> ${form(d.form.home)}</div>
      <div><span class="match-mini">${logo(g.away, "sm")}<b>${g.away}</b></span> ${form(d.form.away)}</div></div></div>
    <div class="card"><div class="card-h"><h3>Прошлые встречи</h3></div><div class="card-b tbl-wrap">${d.h2h.length ? `<table class="tbl"><tbody>${d.h2h.map((m) => `<tr class="click" onclick="location.hash='#/game/${m.game_id}'"><td class="l">${dateShort(m.date)}</td><td class="l"><span class="match-mini">${logo(m.home, "sm")}${m.home} <span class="muted">—</span> ${logo(m.away, "sm")}${m.away}</span></td><td><b>${m.hp} : ${m.ap}</b></td></tr>`).join("")}</tbody></table>` : `<div class="empty">Не встречались</div>`}</div></div>
  </div>`;
  tables.forEach((t) => t.render());
  if (d.pm_series.length) {
    const tip = parseUtc(g.start_utc)?.getTime() / 1000;
    chart($("#pmc"), { type: "line",
      data: { datasets: [{ label: "шанс хозяев", data: d.pm_series.map((r) => ({ x: isNum(tip) ? (r.t - tip) / 3600 : r.t, y: r.p_home })), borderColor: ch, pointRadius: 0, borderWidth: 2, tension: .2 },
        ...(isNum(g.mix_p) ? [{ label: "SHARP + Глико", data: [{ x: -48, y: g.mix_p }, { x: 0, y: g.mix_p }], borderColor: cssVar("--accent"), borderDash: [5, 4], pointRadius: 0, borderWidth: 1.5 }] : [])] },
      options: { maintainAspectRatio: false, parsing: false, plugins: { legend: { display: false }, tooltip: { ...tooltipBase(), callbacks: { title: (c) => `${f1(-c[0].raw.x, 1)} ч до начала`, label: (c) => `${c.dataset.label}: ${pct(c.raw.y, 1)}` } } },
        scales: { x: { type: "linear", title: { display: true, text: "часов до начала" }, ticks: { callback: (v) => (v === 0 ? "старт" : v) } }, y: { ticks: { callback: (v) => pct(v) } } } } });
  }
}

async function viewPlayersNHL(q) {
  const goalies = q.pos === "G";
  const d = await api(`players?pos=${goalies ? "G" : ""}&order=${SRC === "glicko" ? "glicko" : ""}${q.team ? "&team=" + q.team : ""}${q.q ? "&q=" + encodeURIComponent(q.q) : ""}`);
  nhlPhotos(d.players);
  const cols = [
    { key: "rank", label: "#", nosort: true, fmt: (x, i) => `<span class="faint">${i + 1}</span>` },
    { key: "name", label: goalies ? "Вратарь" : "Игрок", l: true, sort: (x) => x.name, fmt: (x) => `<div class="pl">${avatar(x.player_id, x.name)}<span class="nm">${esc(x.name)}</span><span class="st">${esc(x.pos || "")}</span></div>` },
    { key: "team", label: "Команда", l: true, fmt: (x) => `<span class="match-mini">${logo(x.team, "sm")}${x.team}</span>` },
    { key: "gp", label: "Игр", sort: (x) => x.season_avg?.gp, fmt: (x) => x.season_avg?.gp ?? "—" },
    ...(goalies ? [
      { key: "svp", label: "% отр.", sort: (x) => (x.season_avg?.sa ? x.season_avg.sv / x.season_avg.sa : null), fmt: (x) => svPct(x.season_avg?.sv, x.season_avg?.sa) },
      { key: "gsax", label: "Сверх ожид.", title: "голы, предотвращённые сверх ожидаемых за сезон", sort: (x) => x.season_avg?.gsax, fmt: (x) => `<span class="${cls(x.season_avg?.gsax)}">${sgn(x.season_avg?.gsax, 1)}</span>` },
      { key: "rating", label: "Рейтинг", sep: true, title: NHL_GSAX_T, fmt: (x) => `<b class="${cls(x.rating)}">${sgn(x.rating, 2)}</b>` },
    ] : [
      { key: "toi", label: "Время", sort: (x) => x.season_avg?.toi, fmt: (x) => toiFmt(x.season_avg?.toi) },
      { key: "g", label: "Г", sort: (x) => x.season_avg?.g, fmt: (x) => x.season_avg?.g ?? "—" },
      { key: "a", label: "П", sort: (x) => x.season_avg?.a, fmt: (x) => x.season_avg?.a ?? "—" },
      { key: "pts", label: "О", sort: (x) => x.season_avg?.pts, fmt: (x) => `<b>${x.season_avg?.pts ?? "—"}</b>` },
      { key: "ixg", label: "xG", title: "ожидаемые голы с его бросков за сезон", sort: (x) => x.season_avg?.ixg, fmt: (x) => f1(x.season_avg?.ixg, 1) },
      { key: "off", label: "Атака", sep: true, title: "SHARP: вклад в ожидаемые голы своей команды за 60 минут", fmt: (x) => `<span class="${cls(x.off)}">${sgn(x.off, 2)}</span>` },
      { key: "def", label: "Защита", title: "SHARP: сколько ожидаемых голов соперника он «снимает» за 60 минут (+ — хорошо)", fmt: (x) => `<span class="${cls(x.def)}">${sgn(x.def, 2)}</span>` },
      { key: "rating", label: "SHARP", title: NHL_RATING_T, fmt: (x) => `<b class="${cls(x.rating)}">${sgn(x.rating, 2)}</b>` },
    ]),
    { key: "glicko", label: "Глико-2", title: NHL_GLK_T, fmt: (x) => glk(x.glicko) },
  ];
  const t = table({ cols, rows: d.players, onRow: (x) => (location.hash = `#/player/${x.player_id}`), sortKey: SRC === "glicko" ? "glicko" : "rating" });
  app.innerHTML = `
  <div class="page-head"><div><h1>${goalies ? "Вратари" : "Полевые игроки"}</h1><div class="sub">Рейтинги на ${dateShort(d.rating_date)}; статистика — сезон ${seasonLabel(d.season)}. ${goalies ? "Рейтинг — голы, предотвращённые сверх ожидаемых, на 30 бросков (за 3 года, свежие матчи важнее)." : "SHARP — xG-рейтинг по сменам: ожидаемые голы «за» минус «против», пока игрок на льду, за 60 минут, с поправкой на партнёров и соперников."}</div></div>
    <div class="chips" id="pos"><button class="chip ${goalies ? "" : "active"}" data-p="">Полевые</button><button class="chip ${goalies ? "active" : ""}" data-p="G">Вратари</button></div></div>
  <div class="toolbar">
    <input class="input" id="pq" placeholder="Поиск по имени" value="${esc(q.q || "")}">
    <select class="select" id="team"><option value="">Все команды</option>${META.teams.map((x) => `<option value="${x.team}" ${q.team === x.team ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select>
  </div>
  <div class="card"><div class="card-b">${t.html}</div></div>`;
  t.render();
  const upd = (patch) => { setQuery("players", { pos: q.pos, team: q.team, q: q.q, ...patch }); route(); };
  $$("#pos .chip").forEach((b) => (b.onclick = () => upd({ pos: b.dataset.p })));
  $("#team").onchange = (e) => upd({ team: e.target.value });
  $("#pq").onkeydown = (e) => { if (e.key === "Enter") upd({ q: e.target.value.trim() }); };
}

async function viewPlayerNHL(pid, q) {
  const d = await api(`player/${pid}${q.season ? "?season=" + q.season : ""}`);
  const p = d.player, goalie = p.pos === "G";
  nhlPhotos([p]);
  const age = p.birth ? Math.floor((Date.now() - new Date(p.birth)) / (365.25 * 864e5)) : null;
  const lastR = d.ratings[d.ratings.length - 1], lastG = d.glicko[d.glicko.length - 1];
  const reg = d.seasons.filter((s) => s.type === "регулярка");
  const sCols = goalie ? [
    { key: "season", label: "Сезон", l: true, fmt: (s) => `${seasonLabel(s.season)}${s.type !== "регулярка" ? ` <span class="pill blue">${esc(s.type)}</span>` : ""}` },
    { key: "teams", label: "Команда", l: true }, { key: "gp", label: "Игр" }, { key: "gs", label: "Старт" },
    { key: "sa", label: "Бросков" }, { key: "svp", label: "% отр.", sort: (s) => (s.sa ? s.sv / s.sa : null), fmt: (s) => svPct(s.sv, s.sa) },
    { key: "ga", label: "Пропустил" }, { key: "gsax", label: "Сверх ожид.", fmt: (s) => `<b class="${cls(s.gsax)}">${sgn(s.gsax, 1)}</b>` },
  ] : [
    { key: "season", label: "Сезон", l: true, fmt: (s) => `${seasonLabel(s.season)}${s.type !== "регулярка" ? ` <span class="pill blue">${esc(s.type)}</span>` : ""}` },
    { key: "teams", label: "Команда", l: true }, { key: "gp", label: "Игр" }, { key: "toi", label: "Время", fmt: (s) => toiFmt(s.toi) },
    { key: "g", label: "Г" }, { key: "a", label: "П" }, { key: "pts", label: "О", fmt: (s) => `<b>${s.pts}</b>` }, { key: "sog", label: "Бр" },
    { key: "ixg", label: "xG", fmt: (s) => f1(s.ixg, 1) }, { key: "hits", label: "Сил" }, { key: "blk", label: "Бл" },
    { key: "fo", label: "Вбр %", sort: (s) => (s.fo_w + s.fo_l ? s.fo_w / (s.fo_w + s.fo_l) : null), fmt: (s) => (s.fo_w + s.fo_l > 20 ? pct(s.fo_w / (s.fo_w + s.fo_l)) : "—") },
    { key: "pim", label: "Штр" }, { key: "pp_toi", label: "В бол.", title: "время в большинстве за матч", fmt: (s) => toiFmt(s.pp_toi) },
  ];
  const lCols = goalie ? [
    { key: "date", label: "Дата", l: true, fmt: (x) => dateShort(x.date) },
    { key: "opp", label: "Соперник", l: true, sort: (x) => x.home, fmt: (x) => { const opp = x.team === x.home ? x.away : x.home; return `<span class="match-mini">${x.team === x.home ? "" : "@ "}${logo(opp, "sm")}${opp}</span> <span class="faint">${x.ap}:${x.hp}</span>`; } },
    { key: "toi", label: "Время", fmt: (x) => toiFmt(x.toi) }, { key: "sa", label: "Бросков" }, { key: "ga", label: "Пропустил" },
    { key: "svp", label: "% отр.", sort: (x) => (x.sa ? x.sv / x.sa : null), fmt: (x) => svPct(x.sv, x.sa) },
    { key: "gsax", label: "Сверх ожид.", fmt: (x) => `<b class="${cls(x.gsax)}">${sgn(x.gsax, 2)}</b>` },
  ] : [
    { key: "date", label: "Дата", l: true, fmt: (x) => dateShort(x.date) },
    { key: "opp", label: "Соперник", l: true, sort: (x) => x.home, fmt: (x) => { const opp = x.team === x.home ? x.away : x.home; return `<span class="match-mini">${x.team === x.home ? "" : "@ "}${logo(opp, "sm")}${opp}</span> <span class="faint">${x.ap}:${x.hp}</span>`; } },
    { key: "toi", label: "Время", fmt: (x) => toiFmt(x.toi) }, { key: "g", label: "Г" }, { key: "a", label: "П" }, { key: "sog", label: "Бр" },
    { key: "ixg", label: "xG", fmt: (x) => f1(x.ixg, 2) }, { key: "hits", label: "Сил" }, { key: "blk", label: "Бл" }, { key: "pim", label: "Штр" },
  ];
  const st = table({ cols: sCols, rows: d.seasons, sortKey: null });
  const lt = table({ cols: lCols, rows: d.log, onRow: (x) => (location.hash = `#/game/${x.game_id}`), sortKey: "date" });
  const seasonsOpt = [...new Set(d.seasons.map((s) => s.season))];
  app.innerHTML = `
  <div class="card" style="padding:20px;display:flex;gap:20px;align-items:center;flex-wrap:wrap">
    ${avatar(p.player_id, p.name, "xl")}
    <div style="flex:1;min-width:220px"><h1 style="margin:0">${esc(p.name)}</h1>
      <div class="muted" style="display:flex;gap:14px;flex-wrap:wrap;margin-top:6px">
        <span class="match-mini">${logo(p.team, "sm")}<b>${esc(teamName(p.team))}</b></span><span>Позиция: <b>${esc(p.pos || "—")}</b></span>
        ${age ? `<span>Возраст: <b>${age}</b></span>` : ""}${p.height ? `<span>Рост: <b>${Math.round(p.height * 2.54)} см</b></span>` : ""}${p.weight ? `<span>Вес: <b>${Math.round(p.weight * 0.4536)} кг</b></span>` : ""}
        <span>Драфт: <b>${p.pick ? `${p.draft_year}, №${p.pick}` : "не выбирался"}</b></span></div></div>
    <div class="kpis" style="margin:0">
      <div class="card kpi"><div class="l">${goalie ? "Рейтинг вратаря" : "SHARP"}</div><div class="v num ${cls(lastR?.rating)}">${sgn(lastR?.rating, 2)}</div><div class="s">${goalie ? "голы сверх ожид. на 30 бросков" : "xG ± за 60 минут"}</div></div>
      <div class="card kpi"><div class="l">Глико-2</div><div class="v num">${lastG ? lastG.glicko : "—"}</div><div class="s">1500 — средний</div></div>
    </div>
  </div>
  <div class="card" style="margin-top:16px"><div class="card-h"><h3>Рейтинги во времени</h3><span class="muted">${goalie ? "рейтинг вратаря" : "SHARP"} — слева, Глико-2 — справа</span></div><div class="card-b"><div class="chart-box lg"><canvas id="rc"></canvas></div></div></div>
  <div class="section-title">По сезонам</div><div class="card"><div class="card-b">${st.html}</div></div>
  <div class="section-title" style="display:flex;justify-content:space-between;align-items:center">Матчи сезона ${seasonLabel(d.season)}
    <div class="chips" id="ps">${seasonsOpt.map((s) => `<button class="chip ${s === d.season ? "active" : ""}" data-s="${s}">${seasonLabel(s)}</button>`).join("")}</div></div>
  <div class="card"><div class="card-b">${lt.html}</div></div>`;
  st.render(); lt.render();
  $$("#ps .chip").forEach((b) => (b.onclick = () => { setQuery(`player/${pid}`, { season: b.dataset.s }); route(); }));
  const toX = (s) => new Date(s + "T12:00:00").getTime();
  chart($("#rc"), { type: "line",
    data: { datasets: [
      { label: goalie ? "Рейтинг вратаря" : "SHARP", data: d.ratings.map((r) => ({ x: toX(r.date), y: r.rating })), borderColor: cssVar("--accent"), pointRadius: 0, borderWidth: 2, tension: .25, yAxisID: "y" },
      { label: "Глико-2", data: d.glicko.map((r) => ({ x: toX(r.date), y: r.glicko })), borderColor: cssVar("--blue"), pointRadius: 0, borderWidth: 1.5, tension: .25, yAxisID: "y2" }] },
    options: { maintainAspectRatio: false, parsing: false, plugins: { tooltip: { ...tooltipBase(), callbacks: { title: (c) => new Date(c[0].raw.x).toLocaleDateString("ru-RU") } } },
      scales: { x: { type: "linear", ticks: { callback: (v) => ruMonthY(new Date(v)) } },
        y: { position: "left", title: { display: true, text: goalie ? "голы сверх ожид. / 30 бросков" : "xG ± / 60 мин" } }, y2: { position: "right", grid: { display: false }, title: { display: true, text: "Глико-2" } } } } });
}

/* окно «Ожидаемые составы» у хоккея: полевые с временем на льду, вратари с вероятностью старта, поправки робота */
function showLineupsNHL(g) {
  const p = g.prediction, L = (s) => { try { return JSON.parse(s || "{}"); } catch (e) { return {}; } };
  const col = (team, x) => `<div><h4>${logo(team, "sm")} ${esc(teamName(team))}</h4>
    ${(x["поправки"] || []).map((n) => `<div class="ev acc">⚑ ${esc(n.replace(team + ": ", ""))}</div>`).join("")}
    <div class="faint" style="font-size:12px;margin:6px 0 2px">Вратари — шанс выйти в старте</div>
    ${(x.goalies || []).filter((q) => q[2] > 0.001).sort((a, b) => b[2] - a[2]).map(([pid, nm, q]) => `<div class="ev" style="display:flex;justify-content:space-between;gap:10px"><span>${esc(nm)}</span><b>${pct(q)}</b></div>`).join("") || `<div class="faint">—</div>`}
    <div class="faint" style="font-size:12px;margin:8px 0 2px">Полевые — ожидаемое время на льду</div>
    ${(x.skaters || []).sort((a, b) => b[2] - a[2]).map(([pid, nm, m]) => `<div class="ev" style="display:flex;justify-content:space-between;gap:10px"><span>${esc(nm)}</span><span class="faint">${toiFmt(m)}</span></div>`).join("")}</div>`;
  const box = document.createElement("div");
  box.className = "modal"; box.innerHTML = `<div class="card modal-c"><div class="card-h"><h3>Ожидаемые составы · ${g.home} — ${g.away}</h3><button class="chip" id="m-x">✕</button></div>
    <div class="card-b grid g2">${col(g.home, L(p.lineup_h))}${col(g.away, L(p.lineup_a))}</div>
    <div class="hint" style="padding:0 16px 14px">Состав — по последним матчам команды (среднее время за 5 игр), сверенный с текущей заявкой НХЛ; травмы ESPN и Hockey-Reference учитываются, если новость вышла после последнего сыгранного игроком матча; вратари — по модели старта или подтверждению DailyFaceoff.</div></div>`;
  document.body.appendChild(box);
  const close = () => box.remove();
  box.onclick = (e) => { if (e.target === box) close(); };
  box.querySelector("#m-x").onclick = close;
}
