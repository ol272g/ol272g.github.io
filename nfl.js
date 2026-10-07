"use strict";
/* ================= АМЕРИКАНСКИЙ ФУТБОЛ (НФЛ): страницы матча и игроков (остальное — общее, app.js) ================= */

const NFL_RATING_T = "SHARP (НФЛ) перед матчем: на сколько EPA (ожидаемых очков) за розыгрыш лучше играет команда, пока игрок на поле (у защитника «+» — соперник набирает меньше), с поправкой на партнёров и соперников";
const NFL_QB_T = "квотербек перед матчем: EPA на дропбэк сверх среднего (пас, сэки, скрамблы)";
const NFL_GLK_T = "Глико-2 перед матчем: 1500 — средний; +50 ≈ +1 очко за матч, если игрок на поле весь матч";
const nflPhotos = (list) => list.forEach((p) => { if (p.headshot) PHOTO[p.player_id] = p.headshot; });
const NFL_GROUPS = [["QB", "Квотербеки"], ["RB", "Раннинбеки"], ["WR", "Ресиверы"], ["TE", "Тайт-энды"], ["OL", "Линия нападения"],
  ["DL", "Линия защиты"], ["LB", "Лайнбекеры"], ["DB", "Защитная вторая линия"]];
const NFL_POS_GRP = { QB: "QB", RB: "RB", FB: "RB", HB: "RB", WR: "WR", TE: "TE", T: "OL", G: "OL", C: "OL", OL: "OL", OT: "OL", OG: "OL",
  DE: "DL", DT: "DL", NT: "DL", DL: "DL", LB: "LB", ILB: "LB", OLB: "LB", MLB: "LB", CB: "DB", S: "DB", FS: "DB", SS: "DB", DB: "DB", SAF: "DB" };
const weekLabel = (g) => (g.type === "регулярка" ? `${g.week}-я неделя` : { WC: "уайлд-кард", DIV: "дивизионный раунд", CON: "финал конференции", SB: "Супербоул" }[g.stage] || g.type);

async function viewGameNFL(id) {
  const d = await api(`game/${id}`);
  const g = d.game, played = isNum(g.hp), hw = played && g.hp > g.ap;
  nflPhotos(d.player_box);
  const [ca, ch] = pairColors(g.away, g.home);
  const tb = Object.fromEntries(d.team_box.map((t) => [t.team, t]));
  const statRow = (label, k, fmt = (v) => v ?? "—", better = 1) => {
    const a = tb[g.away]?.[k], h = tb[g.home]?.[k];
    const wa = isNum(a) && isNum(h) && (better > 0 ? a > h : a < h), wh = isNum(a) && isNum(h) && (better > 0 ? h > a : h < a);
    return `<tr><td class="${wh ? "good" : ""}"><b>${fmt(h)}</b></td><td class="muted">${label}</td><td class="${wa ? "good" : ""}"><b>${fmt(a)}</b></td></tr>`;
  };
  const who = { key: "name", label: "Игрок", l: true, sort: (x) => x.name, fmt: (x) => `<div class="pl">${avatar(x.player_id, x.name)}<span class="nm">${esc(x.name || x.player_id)}</span><span class="st">${esc(x.pos || "")}</span></div>` };
  const rt = { key: "rating", label: "SHARP", sep: true, title: NFL_RATING_T, fmt: (x) => (isNum(x.rating) ? `<b class="${cls(x.rating)}">${sgn(x.rating, 3)}</b>` : "—") };
  const gl = { key: "glicko", label: "Глико-2", title: NFL_GLK_T, fmt: (x) => glk(x.glicko) };
  const offCols = [who,
    { key: "off_pct", label: "Снапы", title: "доля снапов нападения", fmt: (x) => (x.off_pct ? x.off_pct + "%" : "—") },
    { key: "pass", label: "Пас", title: "передачи: точных/попыток, ярды, тачдауны, перехваты", sort: (x) => x.pass_yds, fmt: (x) => (x.att ? `${x.cmp}/${x.att}, ${x.pass_yds} ярд., ${x.pass_td} TD${x.int ? ", " + x.int + " INT" : ""}` : "") },
    { key: "rush", label: "Вынос", sort: (x) => x.rush_yds, fmt: (x) => (x.car ? `${x.car} — ${x.rush_yds} ярд.${x.rush_td ? ", " + x.rush_td + " TD" : ""}` : "") },
    { key: "recv", label: "Приём", sort: (x) => x.rec_yds, fmt: (x) => (x.tgt ? `${x.rec}/${x.tgt} — ${x.rec_yds} ярд.${x.rec_td ? ", " + x.rec_td + " TD" : ""}` : "") },
    { key: "epa", label: "EPA", title: "ожидаемые очки, добавленные его пасами, выносами и приёмами", fmt: (x) => (x.epa ? `<span class="${cls(x.epa)}">${sgn(x.epa, 1)}</span>` : "") },
    { ...rt, fmt: (x) => (NFL_POS_GRP[x.pos] === "QB" && isNum(x.qb_rating) ? `<b class="${cls(x.qb_rating)}" title="${NFL_QB_T}">${sgn(x.qb_rating, 3)}</b>` : isNum(x.rating) ? `<b class="${cls(x.rating)}">${sgn(x.rating, 3)}</b>` : "—") }, gl];
  const defCols = [who,
    { key: "def_pct", label: "Снапы", title: "доля снапов защиты", fmt: (x) => (x.def_pct ? x.def_pct + "%" : "—") },
    { key: "tkl", label: "Захв.", title: "захваты (сам + с помощью)" }, { key: "tfl", label: "С потерей", title: "захваты с потерей ярдов" },
    { key: "sacks", label: "Сэки" }, { key: "qb_hits", label: "По QB", title: "удары по квотербеку" }, { key: "def_int", label: "Перехв." },
    { key: "pd", label: "Сбитые", title: "сбитые передачи" }, { key: "ff", label: "Выбитые", title: "выбитые мячи (фамблы)" }, rt, gl];
  const tables = [];
  const teamBlock = (team) => {
    const pl = d.player_box.filter((p) => p.team === team);
    const o = table({ cols: offCols, rows: pl.filter((p) => p.off_snaps > 0), onRow: (x) => (location.hash = `#/player/${x.player_id}`), sortKey: "off_pct" });
    const df = table({ cols: defCols, rows: pl.filter((p) => p.def_snaps > 0), onRow: (x) => (location.hash = `#/player/${x.player_id}`), sortKey: "def_pct" });
    tables.push(o, df);
    return `<div class="card" style="margin-top:16px"><div class="card-h"><h3><span class="match-mini">${logo(team, "sm")} ${esc(teamName(team))}</span></h3></div>
      <div class="card-b"><div class="faint" style="margin-bottom:4px">Нападение</div>${o.html}<div class="faint" style="margin:12px 0 4px">Защита</div>${df.html}</div></div>`;
  };
  const form = (arr) => arr.map((m) => `<a class="pill ${m.win ? "good" : "bad"}" href="#/game/${m.game_id}" title="${dateShort(m.date)} ${m.home ? "дома" : "в гостях"} — ${m.opp}">${m.win ? "В" : "П"} ${m.score}</a>`).join(" ");
  const betRows = d.bets.map((b) => `<tr><td class="l">${esc(BOT_SRC[b.strategy] || b.strategy)} <span class="pill neutral">${esc(b.mode)}</span></td>
    <td class="l"><span class="match-mini">${logo(b.team, "sm")}<b>${b.team}</b></span></td><td>${pct(b.model_p)}</td><td>${pct(b.market_p)}</td><td>${isNum(b.entry) ? f1(100 * b.entry, 0) + "¢" : `<span class="faint">${esc(b.status)}</span>`}</td>
    <td class="${cls(b.clv)}">${sgn(100 * b.clv, 1)}</td><td><b class="${cls(b.pnl_hold)}">${money(b.pnl_hold, 2)}</b></td></tr>`).join("");
  const wx = [g.roof && g.roof !== "outdoors" ? (g.roof === "dome" ? "под крышей" : "крыша") : null, isNum(g.temp) ? Math.round((g.temp - 32) / 1.8) + "°C" : null, isNum(g.wind) ? "ветер " + Math.round(g.wind * 0.447) + " м/с" : null].filter(Boolean).join(" · ");
  app.innerHTML = `
  <div class="card game-hero" style="padding:20px">
    <div class="row" style="display:flex;align-items:center;justify-content:space-between;gap:16px">
      <a class="gteam ${played && !hw ? "lost" : ""}" href="#/games?team=${g.home}" style="display:flex;gap:12px;align-items:center">${logo(g.home, "lg")}<div><div class="abbr" style="font-size:22px">${g.home}</div><div class="nm">${esc(teamName(g.home))}</div><div class="faint" style="font-size:12px">хозяева · отдых ${g.rest_home ?? "—"} дн.</div></div></a>
      <div style="text-align:center">
        <div class="num" style="font-family:var(--display);font-size:46px;line-height:1">${played ? `<span class="${hw ? "" : "faint"}">${g.hp}</span> : <span class="${hw ? "faint" : ""}">${g.ap}</span>` : startTime(g.start_utc)}</div>
        <div class="muted">${dateShort(g.date)} · ${esc(weekLabel(g))}${g.end_type ? " · <b>ОТ</b>" : ""}${g.neutral ? " · нейтральное поле" : ""}</div>
        ${wx ? `<div class="faint" style="font-size:12px">${esc(wx)}</div>` : ""}
      </div>
      <a class="gteam r ${played && hw ? "lost" : ""}" href="#/games?team=${g.away}" style="display:flex;gap:12px;align-items:center;flex-direction:row-reverse;text-align:right">${logo(g.away, "lg")}<div><div class="abbr" style="font-size:22px">${g.away}</div><div class="nm">${esc(teamName(g.away))}</div><div class="faint" style="font-size:12px">гости · отдых ${g.rest_away ?? "—"} дн.</div></div></a>
    </div>
  </div>
  <div class="grid g2" style="margin-top:16px">
    <div class="card"><div class="card-h"><h3>Шансы на победу</h3><span class="muted">хозяева ← → гости</span></div><div class="card-b">
      ${probLine(null, g.model_p, ca, ch, "SHARP", "в момент решения", SRC === "model")}
      ${probLine(null, g.glicko_p, ca, ch, "Глико-2", "в момент решения", SRC === "glicko")}
      ${probLine(null, g.mix_p, ca, ch, "SHARP + Глико", "в момент решения", SRC === "mix")}
      ${probLine(null, g.mix_p_report, ca, ch, "SHARP + Глико", "после отчёта о травмах")}
      ${probLine(null, g.pm_dec, ca, ch, "Polymarket", "в момент решения")}
      ${probLine(null, g.pm_24h, ca, ch, "Polymarket", "за 24 ч")}
      ${probLine(null, g.pm_start, ca, ch, "Polymarket", "на старте")}
      ${probLine(null, g.book_p_open, ca, ch, "Букмекеры", "открытие")}
      ${probLine(null, g.book_p_close, ca, ch, "Букмекеры", "закрытие")}
      <div class="hint">Прогнозы моделей честные: рейтинги на вторник перед матчем (только прошлые матчи), составы — ожидаемые.${isNum(g.book_spread_close) ? ` Фора закрытия: хозяева ${g.book_spread_close > 0 ? "−" : "+"}${Math.abs(g.book_spread_close)}, тотал ${g.book_total_close ?? "—"}.` : ""}</div>
    </div></div>
    <div class="card"><div class="card-h"><h3>Цена на Polymarket</h3><span class="muted">шанс хозяев по часам до начала</span></div><div class="card-b">${d.pm_series.length ? `<div class="chart-box"><canvas id="pmc"></canvas></div>` : `<div class="empty">Рынка на Polymarket не было</div>`}</div></div>
  </div>
  ${played && tb[g.home] ? `<div class="card" style="margin-top:16px"><div class="card-h"><h3>Статистика команд</h3></div><div class="card-b tbl-wrap"><table class="tbl cmp" style="max-width:520px;margin:0 auto"><thead><tr><th>${g.home}</th><th></th><th>${g.away}</th></tr></thead><tbody>
    ${statRow("Очки", "points", (v) => v ?? "—")}${statRow("EPA за розыгрыш", "epa", (v) => sgn(v, 3))}${statRow("EPA паса", "pass_epa", (v) => sgn(v, 3))}${statRow("EPA выноса", "rush_epa", (v) => sgn(v, 3))}
    ${statRow("Успешные розыгрыши, %", "success", (v) => f1(v, 1))}${statRow("Ярды", "yards")}${statRow("Розыгрыши", "plays")}${statRow("Сэки (пропустили)", "sacks", (v) => v ?? "—", -1)}${statRow("Потери мяча", "turnovers", (v) => v ?? "—", -1)}
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
        ...(isNum(g.mix_p) ? [{ label: "SHARP + Глико", data: [{ x: -168, y: g.mix_p }, { x: 0, y: g.mix_p }], borderColor: cssVar("--accent"), borderDash: [5, 4], pointRadius: 0, borderWidth: 1.5 }] : [])] },
      options: { maintainAspectRatio: false, parsing: false, plugins: { legend: { display: false }, tooltip: { ...tooltipBase(), callbacks: { title: (c) => `${f1(-c[0].raw.x, 1)} ч до начала`, label: (c) => `${c.dataset.label}: ${pct(c.raw.y, 1)}` } } },
        scales: { x: { type: "linear", title: { display: true, text: "часов до начала" }, ticks: { callback: (v) => (v === 0 ? "старт" : v) } }, y: { ticks: { callback: (v) => pct(v) } } } } });
  }
}

async function viewPlayersNFL(q) {
  const side = ["Q", "O", "D"].includes(q.side) ? q.side : "Q";
  const d = await api(`players?side=${side}&order=${SRC === "glicko" ? "glicko" : ""}${q.team ? "&team=" + q.team : ""}${q.q ? "&q=" + encodeURIComponent(q.q) : ""}`);
  nflPhotos(d.players);
  const s = (x, k) => x.season_avg?.[k];
  const cols = [
    { key: "rank", label: "#", nosort: true, fmt: (x, i) => `<span class="faint">${i + 1}</span>` },
    { key: "name", label: side === "Q" ? "Квотербек" : "Игрок", l: true, sort: (x) => x.name, fmt: (x) => `<div class="pl">${avatar(x.player_id, x.name)}<span class="nm">${esc(x.name)}</span><span class="st">${esc(x.pos || "")}</span></div>` },
    { key: "team", label: "Команда", l: true, fmt: (x) => `<span class="match-mini">${logo(x.team, "sm")}${x.team}</span>` },
    { key: "gp", label: "Игр", sort: (x) => s(x, "gp"), fmt: (x) => s(x, "gp") ?? "—" },
    ...(side === "Q" ? [
      { key: "py", label: "Ярды паса", sort: (x) => s(x, "pass_yds"), fmt: (x) => s(x, "pass_yds") ?? "—" },
      { key: "ptd", label: "TD", sort: (x) => s(x, "pass_td"), fmt: (x) => s(x, "pass_td") ?? "—" },
      { key: "int", label: "INT", sort: (x) => s(x, "int"), fmt: (x) => s(x, "int") ?? "—" },
      { key: "epa", label: "EPA", title: "ожидаемые очки, добавленные за сезон", sort: (x) => s(x, "epa"), fmt: (x) => `<span class="${cls(s(x, "epa"))}">${sgn(s(x, "epa"), 0)}</span>` },
      { key: "rating", label: "SHARP", sep: true, title: NFL_QB_T, fmt: (x) => `<b class="${cls(x.rating)}">${sgn(x.rating, 3)}</b>` },
    ] : side === "O" ? [
      { key: "snap", label: "Снапы", sort: (x) => s(x, "snap_pct"), fmt: (x) => (isNum(s(x, "snap_pct")) ? Math.round(s(x, "snap_pct")) + "%" : "—") },
      { key: "ry", label: "Вынос", sort: (x) => s(x, "rush_yds"), fmt: (x) => s(x, "rush_yds") || "—" },
      { key: "rec", label: "Приём", sort: (x) => s(x, "rec_yds"), fmt: (x) => (s(x, "rec") ? `${s(x, "rec")} — ${s(x, "rec_yds")}` : "—") },
      { key: "td", label: "TD", sort: (x) => (s(x, "rush_td") || 0) + (s(x, "rec_td") || 0), fmt: (x) => (s(x, "rush_td") || 0) + (s(x, "rec_td") || 0) || "—" },
      { key: "rating", label: "SHARP", sep: true, title: NFL_RATING_T, fmt: (x) => `<b class="${cls(x.rating)}">${sgn(x.rating, 3)}</b>` },
    ] : [
      { key: "snap", label: "Снапы", sort: (x) => s(x, "snap_pct"), fmt: (x) => (isNum(s(x, "snap_pct")) ? Math.round(s(x, "snap_pct")) + "%" : "—") },
      { key: "tkl", label: "Захв.", sort: (x) => s(x, "tkl"), fmt: (x) => s(x, "tkl") ?? "—" },
      { key: "sacks", label: "Сэки", sort: (x) => s(x, "sacks"), fmt: (x) => s(x, "sacks") ?? "—" },
      { key: "dint", label: "Перехв.", sort: (x) => s(x, "def_int"), fmt: (x) => s(x, "def_int") ?? "—" },
      { key: "rating", label: "SHARP", sep: true, title: NFL_RATING_T, fmt: (x) => `<b class="${cls(x.rating)}">${sgn(x.rating, 3)}</b>` },
    ]),
    { key: "glicko", label: "Глико-2", title: NFL_GLK_T, fmt: (x) => glk(x.glicko) },
  ];
  const t = table({ cols, rows: d.players, onRow: (x) => (location.hash = `#/player/${x.player_id}`), sortKey: SRC === "glicko" ? "glicko" : "rating" });
  app.innerHTML = `
  <div class="page-head"><div><h1>${side === "Q" ? "Квотербеки" : side === "O" ? "Нападение" : "Защита"}</h1><div class="sub">Рейтинги на ${dateShort(d.rating_date)}; статистика — сезон ${d.season}. SHARP — рейтинг по снапам: на сколько EPA за розыгрыш лучше играет команда, пока игрок на поле, с поправкой на партнёров и соперников${side === "Q" ? "; у квотербека — EPA на дропбэк сверх среднего" : ""}.</div></div>
    <div class="chips" id="side"><button class="chip ${side === "Q" ? "active" : ""}" data-s="Q">Квотербеки</button><button class="chip ${side === "O" ? "active" : ""}" data-s="O">Нападение</button><button class="chip ${side === "D" ? "active" : ""}" data-s="D">Защита</button></div></div>
  <div class="toolbar">
    <input class="input" id="pq" placeholder="Поиск по имени" value="${esc(q.q || "")}">
    <select class="select" id="team"><option value="">Все команды</option>${META.teams.map((x) => `<option value="${x.team}" ${q.team === x.team ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select>
  </div>
  <div class="card"><div class="card-b">${t.html}</div></div>`;
  t.render();
  const upd = (patch) => { setQuery("players", { side: q.side, team: q.team, q: q.q, ...patch }); route(); };
  $$("#side .chip").forEach((b) => (b.onclick = () => upd({ side: b.dataset.s })));
  $("#team").onchange = (e) => upd({ team: e.target.value });
  $("#pq").onkeydown = (e) => { if (e.key === "Enter") upd({ q: e.target.value.trim() }); };
}

async function viewPlayerNFL(pid, q) {
  const d = await api(`player/${pid}${q.season ? "?season=" + q.season : ""}`);
  const p = d.player, grp = NFL_POS_GRP[p.pos] || "", qb = grp === "QB", def = ["DL", "LB", "DB"].includes(grp);
  nflPhotos([p]);
  const age = p.birth ? Math.floor((Date.now() - new Date(p.birth)) / (365.25 * 864e5)) : null;
  const side = qb ? "Q" : def ? "D" : "O";
  const R = d.ratings.filter((r) => r.side === side), G = d.glicko.filter((r) => r.kind === (qb ? "Q" : "P"));
  const lastR = R[R.length - 1], lastG = G[G.length - 1];
  const seasonCol = { key: "season", label: "Сезон", l: true, fmt: (s) => `${s.season}${s.type !== "регулярка" ? ` <span class="pill blue">${esc(s.type)}</span>` : ""}` };
  const sCols = [seasonCol, { key: "teams", label: "Команда", l: true }, { key: "gp", label: "Игр" },
    { key: "snap_pct", label: "Снапы", fmt: (s) => (isNum(s.snap_pct) ? Math.round(s.snap_pct) + "%" : "—") },
    ...(qb ? [{ key: "cmp", label: "Пас", fmt: (s) => `${s.cmp}/${s.att}` }, { key: "pass_yds", label: "Ярды" }, { key: "pass_td", label: "TD" }, { key: "int", label: "INT" }, { key: "sacked", label: "Сэки" }, { key: "rush_yds", label: "Вынос" }]
      : def ? [{ key: "tkl", label: "Захв." }, { key: "tfl", label: "С потерей" }, { key: "sacks", label: "Сэки" }, { key: "qb_hits", label: "По QB" }, { key: "def_int", label: "Перехв." }, { key: "pd", label: "Сбитые" }, { key: "ff", label: "Выбитые" }]
        : [{ key: "car", label: "Выносы" }, { key: "rush_yds", label: "Ярды выноса" }, { key: "rec", label: "Приёмы", fmt: (s) => `${s.rec}/${s.tgt}` }, { key: "rec_yds", label: "Ярды приёма" }, { key: "td", label: "TD", sort: (s) => s.rush_td + s.rec_td, fmt: (s) => s.rush_td + s.rec_td }]),
    ...(def ? [] : [{ key: "epa", label: "EPA", fmt: (s) => `<b class="${cls(s.epa)}">${sgn(s.epa, 1)}</b>` }])];
  const opp = { key: "opp", label: "Соперник", l: true, sort: (x) => x.home, fmt: (x) => { const o = x.team === x.home ? x.away : x.home; return `<span class="match-mini">${x.team === x.home ? "" : "@ "}${logo(o, "sm")}${o}</span> <span class="faint">${x.ap ?? ""}:${x.hp ?? ""}</span>`; } };
  const lCols = [{ key: "date", label: "Дата", l: true, fmt: (x) => `${dateShort(x.date)} <span class="faint">${x.type === "регулярка" ? x.week + " нед." : ""}</span>` }, opp,
    { key: "snaps", label: "Снапы", sort: (x) => x.off_pct + x.def_pct, fmt: (x) => (def ? x.def_pct : x.off_pct) + "%" },
    ...(qb ? [{ key: "pass", label: "Пас", fmt: (x) => `${x.cmp}/${x.att}, ${x.pass_yds} ярд., ${x.pass_td} TD, ${x.int} INT` }, { key: "rush_yds", label: "Вынос" }]
      : def ? [{ key: "tkl", label: "Захв." }, { key: "sacks", label: "Сэки" }, { key: "def_int", label: "Перехв." }, { key: "pd", label: "Сбитые" }]
        : [{ key: "rush", label: "Вынос", fmt: (x) => (x.car ? `${x.car} — ${x.rush_yds}` : "") }, { key: "recv", label: "Приём", fmt: (x) => (x.tgt ? `${x.rec}/${x.tgt} — ${x.rec_yds}` : "") }, { key: "td", label: "TD", fmt: (x) => x.rush_td + x.rec_td || "" }]),
    ...(def ? [] : [{ key: "epa", label: "EPA", fmt: (x) => `<span class="${cls(x.epa)}">${sgn(x.epa, 1)}</span>` }])];
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
      <div class="card kpi"><div class="l">SHARP${qb ? " (QB)" : ""}</div><div class="v num ${cls(lastR?.rating)}">${sgn(lastR?.rating, 3)}</div><div class="s">${qb ? "EPA на дропбэк" : "EPA за розыгрыш на поле"}</div></div>
      <div class="card kpi"><div class="l">Глико-2</div><div class="v num">${lastG ? lastG.glicko : "—"}</div><div class="s">1500 — средний</div></div>
    </div>
  </div>
  <div class="card" style="margin-top:16px"><div class="card-h"><h3>Рейтинги во времени</h3><span class="muted">SHARP — слева, Глико-2 — справа</span></div><div class="card-b"><div class="chart-box lg"><canvas id="rc"></canvas></div></div></div>
  <div class="section-title">По сезонам</div><div class="card"><div class="card-b">${st.html}</div></div>
  <div class="section-title" style="display:flex;justify-content:space-between;align-items:center">Матчи сезона ${d.season ?? ""}
    <div class="chips" id="ps">${seasonsOpt.map((s) => `<button class="chip ${s === d.season ? "active" : ""}" data-s="${s}">${s}</button>`).join("")}</div></div>
  <div class="card"><div class="card-b">${lt.html}</div></div>`;
  st.render(); lt.render();
  $$("#ps .chip").forEach((b) => (b.onclick = () => { setQuery(`player/${pid}`, { season: b.dataset.s }); route(); }));
  const toX = (s) => new Date(s + "T12:00:00").getTime();
  chart($("#rc"), { type: "line",
    data: { datasets: [
      { label: "SHARP", data: R.map((r) => ({ x: toX(r.date), y: r.rating })), borderColor: cssVar("--accent"), pointRadius: 0, borderWidth: 2, tension: .25, yAxisID: "y" },
      { label: "Глико-2", data: G.map((r) => ({ x: toX(r.date), y: r.glicko })), borderColor: cssVar("--blue"), pointRadius: 0, borderWidth: 1.5, tension: .25, yAxisID: "y2" }] },
    options: { maintainAspectRatio: false, parsing: false, plugins: { tooltip: { ...tooltipBase(), callbacks: { title: (c) => new Date(c[0].raw.x).toLocaleDateString("ru-RU") } } },
      scales: { x: { type: "linear", ticks: { callback: (v) => ruMonthY(new Date(v)) } },
        y: { position: "left", title: { display: true, text: qb ? "EPA / дропбэк" : "EPA / розыгрыш" } }, y2: { position: "right", grid: { display: false }, title: { display: true, text: "Глико-2" } } } } });
}


/* ================= НФЛ: бумажные ставки робота игроков (тачдаун в матче) — данные nfl-edge/data/pp/pp.db ================= */
async function viewPropsNFL() {
  const r = await fetch(APIP + "props", { cache: "no-store" });
  if (!r.ok) throw new Error((await r.text()) || r.statusText);
  const d = await r.json();
  const age = d.snap && d.snap.ts ? d.now - d.snap.ts : null;
  let vr = d.summary.some((x) => x.variant === "B0") ? "B0" : (d.summary[0]?.variant || "A0"), stf = "all";
  const gm = (id) => { const m = /^(\d{4})_(\d+)_([A-Z]+)_([A-Z]+)$/.exec(id || ""); return m ? { week: +m[2], away: m[3], home: m[4] } : null; };
  const when = (t) => new Date(t * 1000).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const kpi = (l, v, sub, c = "") => `<div class="card kpi"><div class="l">${l}</div><div class="v num ${c}">${v}</div>${sub ? `<div class="s">${sub}</div>` : ""}</div>`;
  const cards = d.summary.map((x) => {
    const roi = x.closed_cost > 0 ? x.pnl / x.closed_cost : null;
    return kpi(`Вариант ${esc(x.variant)}`, `${x.n} ставок`, `вложено ${money(x.cost).replace("+", "")} · закрыто ${x.closed}` + (x.closed ? ` · итог ${money(x.pnl, 2)} · ROI ${pct(roi, 1)} · выиграно ${pct(x.wins / x.closed, 0)}` : " · итогов пока нет"));
  }).join("");
  const cols = [
    { key: "name", label: "Игрок", l: true, sort: (x) => x.name, fmt: (x) => `<b>${esc(x.name)}</b>` },
    { key: "game", label: "Матч", l: true, sort: (x) => x.gs, fmt: (x) => { const g = gm(x.game_id); return g ? `<span class="match-mini">${logo(g.away, "sm")}${g.away} @ ${logo(g.home, "sm")}${g.home}</span> <span class="faint">${when(x.gs)}</span>` : esc(x.game_id); } },
    { key: "side", label: "Ставка", l: true, sort: (x) => x.side, fmt: (x) => (x.side === "Y" ? `<span class="good">ДА, забьёт</span>` : `<span style="color:#e8a33d">НЕТ, не забьёт</span>`) },
    { key: "price", label: "Цена", title: "средняя цена покупки по лестнице продавцов", fmt: (x) => x.price.toFixed(3) },
    { key: "shares", label: "Акций", fmt: (x) => x.shares.toFixed(1) },
    { key: "cost", label: "Вложено", fmt: (x) => money(x.cost, 2).replace("+", "") },
    { key: "p", label: "Модель", title: "шанс нашей стороны по модели", sep: true, fmt: (x) => pct(x.p, 1) },
    { key: "edge", label: "Перевес", title: "модель минус цена, п.п.", sort: (x) => x.edge, fmt: (x) => `<b class="${cls(x.edge)}">${sgn(100 * x.edge, 1)} п.п.</b>` },
    { key: "variant", label: "Вариант", l: true, fmt: (x) => `<span class="pill">${esc(x.variant)}</span>` },
    { key: "ts", label: "Куплено", sort: (x) => x.ts, fmt: (x) => `<span class="faint">${when(x.ts)}</span>` },
    { key: "res", label: "Итог", l: true, sort: (x) => (x.status === "закрыто" ? x.pnl : -1e9), fmt: (x) => (x.status === "закрыто" ? `<b class="${x.won ? "good" : "bad"}">${x.won ? "выиграна" : "проиграна"} ${money(x.pnl, 2)}</b>` : `<span class="muted">ждёт игры</span>`) },
  ];
  app.innerHTML = `
  <div class="page-head"><div><h1>Игроки · ставки</h1><div class="sub">Бумажный робот: шанс «игрок забьёт тачдаун» по модели против цены Polymarket; «покупает» на $10 по лестнице продавцов, комиссия 3% тейкера учтена. Реальных денег нет. Правила заморожены (A — 06.10, B/S — 09.10); выводы — не раньше 3–4 недель игр.</div></div>
    <div class="chips" id="pp-v"></div></div>
  <div class="kpis">${kpi("Робот игроков", age !== null && age < 1800 ? "работает" : "нет свежих снимков", age === null ? "снимков нет" : `последний снимок ${agoText(age)} · рынков ${d.snap.markets}`, age !== null && age < 1800 ? "good" : "bad")}${cards}</div>
  <div class="chips" id="pp-s" style="margin:6px 0 10px"></div>
  <div class="card"><div class="card-b" id="pp-t"></div></div>
  <div class="hint" style="margin-top:10px"><b>Варианты.</b> <b>A0/A5/A10</b> — первая модель (v1), перевес до комиссии (от 0, 5, 10 п.п.); с 09.10 новых ставок не открывают, прежние закрываются как раньше. <b>B0/B3/B7</b> — улучшенная модель v2 (смена роли, опыт, травмы партнёров), перевес <b>после комиссии</b> (больше 0, от 3 и от 7 п.п.). <b>S3</b> — v2 со сжатием к рынку, как у основных роботов: 0.3·(модель − цена) − комиссия ≥ 3 п.п. (то есть модель выше цены примерно на 10 п.п.). Варианты вложены друг в друга, поэтому показан один за раз. Игроки вне модели (квотербеки, запасные) не ставятся.</div>`;
  const draw = () => {
    $("#pp-v").innerHTML = d.summary.map((x) => `<button class="chip ${vr === x.variant ? "active" : ""}" data-v="${esc(x.variant)}">${esc(x.variant)}</button>`).join("");
    $("#pp-s").innerHTML = [["all", "все"], ["куплено", "открытые"], ["закрыто", "закрытые"]].map(([k, t]) => `<button class="chip ${stf === k ? "active" : ""}" data-s="${k}">${t}</button>`).join("");
    $$("#pp-v .chip").forEach((b) => (b.onclick = () => { vr = b.dataset.v; draw(); }));
    $$("#pp-s .chip").forEach((b) => (b.onclick = () => { stf = b.dataset.s; draw(); }));
    const rows = d.bets.filter((b) => b.variant === vr && (stf === "all" || b.status === stf));
    if (!rows.length) { $("#pp-t").innerHTML = `<div class="empty">Нет ставок по выбранному фильтру</div>`; return; }
    const t = table({ cols, rows, id: "pp-tbl", sortKey: "game", sortDir: 1 });
    $("#pp-t").innerHTML = t.html; t.render();
  };
  draw();
}
