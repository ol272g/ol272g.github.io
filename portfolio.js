"use strict";
/* ================= ПОРТФЕЛЬ: симуляция НБА + НХЛ на одном банке =================
   Те же правила, что на странице «Ставки»: ставка = % от расчётного банка (Келли / по разнице), доходность под размер
   ставки по реальной ленте сделок Polymarket. Ставки обоих видов спорта идут по времени и делят один банк. */
const PF_KEY = "portfolio_cfg";
const PF_SPORTS = {
  nba: { name: "НБА", icon: '<svg class="sic" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M3 16h26M16 3v26M7 7c5 4 5 14 0 18M25 7c-5 4-5 14 0 18" stroke="currentColor" stroke-width="2.2" fill="none"/></svg>', api: "/api/bets", trust: 0.3, color: "--accent",
         strats: { hold: "держать до конца", chase: "догонять цену", market: "по рынку + догонка", swing: "выход до начала" } },
  nhl: { name: "НХЛ", icon: '<svg class="sic" viewBox="0 0 32 32" aria-hidden="true"><ellipse cx="16" cy="19" rx="12" ry="5" fill="none" stroke="currentColor" stroke-width="2.4"/><ellipse cx="16" cy="14" rx="12" ry="5" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M4 14v5M28 14v5" stroke="currentColor" stroke-width="2.4"/></svg>', api: "/api/nhl/bets", trust: 0.6, color: "--blue",
         strats: { hold: "держать до конца", chase: "догонять цену", market: "по рынку + догонка" } },
  nfl: { name: "НФЛ", icon: '<svg class="sic" viewBox="0 0 32 32" aria-hidden="true"><ellipse cx="16" cy="16" rx="13" ry="8" transform="rotate(-35 16 16)" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M11 21 21 11M14 16l2 2M16 14l2 2" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>', api: "/api/nfl/bets", trust: 0.3, color: "--good",
         strats: { hold: "держать до конца", chase: "догонять цену", market: "по рынку + догонка" } },
};
const PF_SRC = { "модель": "SHARP", "глико": "Глико-2", "смесь": "SHARP + Глико" };
const PF_DEFAULT = {
  bank: { start: 5000, min: 0.5, max: 2, flat: 1, step: 25, lo: 3, hi: 12, maxUsd: 150, method: "kelly", kf: 0.3, trust: 0.3 },
  nba: { on: true, src: "смесь", key: "chase", trust: 0.3 },
  nhl: { on: true, src: "глико", key: "chase", trust: 0.6 },
  nfl: { on: false, src: "смесь", key: "hold", trust: 0.3 },
  season: "",
};
function pfCfg() {
  try {
    const s = JSON.parse(localStorage.getItem(PF_KEY) || "{}");
    return { ...PF_DEFAULT, ...s, bank: { ...PF_DEFAULT.bank, ...(s.bank || {}) }, nba: { ...PF_DEFAULT.nba, ...(s.nba || {}) }, nhl: { ...PF_DEFAULT.nhl, ...(s.nhl || {}) }, nfl: { ...PF_DEFAULT.nfl, ...(s.nfl || {}) } };
  } catch (e) { return JSON.parse(JSON.stringify(PF_DEFAULT)); }
}
function pfSave(c) { try { localStorage.setItem(PF_KEY, JSON.stringify(c)); } catch (e) { /* без сохранения */ } }

// ставки симуляции одного вида спорта → формат банка (как strategyBets на странице «Ставки»)
function pfBets(raw, sport, src, key, trust) {
  return raw.filter((b) => b.mode === "симуляция" && b.strategy === src && !b.line
      && (key !== "chase" || b.chase_status != null) && (key !== "market" || b.market_status != null))
    .map((b) => {
      const start = parseUtc(b.start_utc);
      const endT = start ? start.getTime() / 1000 + 3 * 3600 : b.exit_t;
      const x = { ...b, sport, key, trust, open_t: b.entry_t || b.signal_t, close_t: endT, exit_px: b.outcome,
        diff: isNum(b.model_p) && isNum(b.market_p) ? Math.abs(b.model_p - b.market_p) : null };
      if (key === "chase") Object.assign(x, { done: b.chase_status === "закрыта", entry: b.chase_entry, ret: isNum(b.pnl_chase) ? b.pnl_chase / 100 : null,
        retN: [b.r_chase_300, b.r_chase_1000, b.r_chase_3000], retS: [b.r_chase_10, b.r_chase_30] });
      else if (key === "market") Object.assign(x, { done: b.market_status === "закрыта", entry: b.market_entry, ret: isNum(b.pnl_market) ? b.pnl_market / 100 : null,
        retN: [b.r_market_300, b.r_market_1000, b.r_market_3000], retS: [b.r_market_10, b.r_market_30] });
      else if (key === "swing") Object.assign(x, { done: b.status === "закрыта", ret: isNum(b.pnl) ? b.pnl / 100 : null, close_t: b.exit_t, exit_px: b.exit,
        retN: [b.r_swing_300, b.r_swing_1000, b.r_swing_3000], retS: [b.r_swing_10, b.r_swing_30] });
      else Object.assign(x, { done: b.status === "закрыта", ret: isNum(b.pnl_hold) ? b.pnl_hold / 100 : null,
        retN: [b.r_hold_300, b.r_hold_1000, b.r_hold_3000], retS: [b.r_hold_10, b.r_hold_30] });
      return x;
    });
}

let PF_DATA = null;
async function viewPortfolio() {
  $$(".tabs a").forEach((a) => a.classList.toggle("active", a.dataset.tab === "portfolio"));
  if (!PF_DATA) {
    const get = (u) => fetch(u + "?mode=" + encodeURIComponent("симуляция")).then((r) => (r.ok ? r.json() : { bets: [] })).catch(() => ({ bets: [] }));
    const [a, h, f] = await Promise.all([get(PF_SPORTS.nba.api), get(PF_SPORTS.nhl.api), get(PF_SPORTS.nfl.api)]);
    PF_DATA = { nba: a.bets || [], nhl: h.bets || [], nfl: f.bets || [] };
  }
  const c = pfCfg();
  const seasonOf = (b) => { const dt = new Date((b.signal_t || b.entry_t || 0) * 1000); return dt.getUTCMonth() >= 7 ? dt.getUTCFullYear() : dt.getUTCFullYear() - 1; };
  const per = {}, all = [];
  for (const sp of Object.keys(PF_SPORTS)) {
    const s = c[sp];
    per[sp] = s.on ? pfBets(PF_DATA[sp], sp, s.src, s.key, s.trust).filter((b) => !c.season || seasonOf(b) === +c.season) : [];
    all.push(...per[sp]);
  }
  const B = runBank(all, c.bank);
  const alone = Object.fromEntries(Object.keys(PF_SPORTS).map((sp) => [sp, per[sp].length ? runBank(per[sp], c.bank) : null]));
  const stat = {};
  for (const sp of Object.keys(PF_SPORTS)) {
    let n = 0, staked = 0, pnl = 0, wins = 0;
    per[sp].filter((b) => b.done && isNum(b.ret)).forEach((b) => { const r = B.res.get(b); if (r) { n++; staked += r.stake; pnl += r.pnl; wins += r.pnl > 0; } });
    stat[sp] = { n, staked, pnl, wins, signals: per[sp].length };
  }
  const tot = Object.values(stat).reduce((a, s) => ({ n: a.n + s.n, staked: a.staked + s.staked, pnl: a.pnl + s.pnl }), { n: 0, staked: 0, pnl: 0 });
  const kpi = (l, v, sub, cl = "") => `<div class="card kpi"><div class="l">${l}</div><div class="v num ${cl}">${v}</div>${sub ? `<div class="s">${sub}</div>` : ""}</div>`;
  const inp = (id, v, step = "0.1") => `<input class="input" type="number" id="${id}" value="${v}" step="${step}">`;
  const sel = (id, opts, v) => `<select class="select" id="${id}">${Object.entries(opts).map(([k, t]) => `<option value="${k}" ${k === v ? "selected" : ""}>${t}</option>`).join("")}</select>`;
  const sportCard = (sp) => {
    const S = PF_SPORTS[sp], s = c[sp], st = stat[sp];
    return `<div class="card" style="padding:14px">
      <label class="toggle" style="font-size:16px;font-weight:700"><input type="checkbox" id="pf-${sp}-on" ${s.on ? "checked" : ""}> ${S.icon} ${S.name}</label>
      <div class="cfg-grid" style="margin-top:10px">
        <label>Прогноз${sel("pf-" + sp + "-src", PF_SRC, s.src)}</label>
        <label>Стратегия${sel("pf-" + sp + "-key", S.strats, s.key)}</label>
        <label title="Келли: своя оценка = цена + доверие × (модель − цена); измерено на лаборатории: НБА 0.3, НХЛ 0.6">Келли: доверие к модели${inp("pf-" + sp + "-trust", s.trust, "0.05")}</label>
      </div>
      <div class="hint" style="margin-top:6px">${s.on ? `сигналов ${st.signals} · ставок ${st.n} · прибыль <b class="${cls(st.pnl)}">${money(st.pnl)}</b> в общем банке${alone[sp] ? ` · отдельно на своём банке: ${money(alone[sp].bank - alone[sp].start)}` : ""}` : "не участвует"}</div></div>`;
  };
  const seasons = [...new Set(Object.values(PF_DATA).flat().filter((b) => b.mode === "симуляция").map(seasonOf))].sort();
  app.innerHTML = `
  <div class="page-head"><div><h1>Портфель</h1><div class="sub">Симуляция 2024-26: НБА и НХЛ на одном банке — ставки обоих видов спорта идут по времени и делят один банк. Правила те же, что на странице «Ставки»: процент от расчётного банка и исполнение по реальной ленте сделок Polymarket.</div></div></div>
  <div class="chips" id="pf-season" style="margin:0 0 12px"><button class="chip ${c.season ? "" : "active"}" data-y="">Все сезоны</button>${seasons.map((y) => `<button class="chip ${String(y) === String(c.season) ? "active" : ""}" data-y="${y}">${y}-${String(y + 1).slice(2)}</button>`).join("")}</div>
  <div class="grid g3" style="margin-bottom:14px">${sportCard("nba")}${sportCard("nhl")}${sportCard("nfl")}</div>
  <details class="card bankcfg" open><summary>⚙ Общий банк</summary>
    <div class="cfg-grid">
      <label>Банк на старте, $${inp("pf-start", c.bank.start, "100")}</label>
      <label>Ставка min, % банка${inp("pf-min", c.bank.min)}</label>
      <label>Ставка max, % банка${inp("pf-max", c.bank.max)}</label>
      <label>Максимальная ставка, $ (0 — без лимита)${inp("pf-maxusd", c.bank.maxUsd, "10")}</label>
      <label>Пересчёт банка при изменении на, %${inp("pf-step", c.bank.step, "1")}</label>
      <label>Метод ставки${sel("pf-method", METHODS, c.bank.method)}</label>
      <label>Келли: доля${inp("pf-kf", c.bank.kf, "0.05")}</label>
      <label>Обычная ставка, %${inp("pf-flat", c.bank.flat)}</label>
      <button class="chip" id="pf-reset" style="align-self:end">Сбросить</button>
    </div></details>
  ${tot.n ? `
  <div class="kpis">
    ${kpi("Банк", money(B.bank).replace("+", ""), "старт " + money(B.start).replace("+", ""), cls(B.bank - B.start))}
    ${kpi("Прибыль", money(B.bank - B.start), pct((B.bank - B.start) / B.start, 1) + " к банку", cls(B.bank - B.start))}
    ${kpi("ROI", pct(tot.staked ? tot.pnl / tot.staked : null, 2), "оборот " + money(tot.staked).replace("+", ""))}
    ${kpi("Ставок", tot.n, Object.keys(PF_SPORTS).filter((sp) => c[sp].on).map((sp) => `${PF_SPORTS[sp].name} ${stat[sp].n}`).join(" · "))}
    ${kpi("Макс. просадка", money(B.dd), pct(B.ddp, 1) + " от пика", "bad")}
  </div>
  <div class="card" style="margin-bottom:14px"><div class="card-b tbl-wrap"><table class="tbl"><thead><tr><th class="l">Вид спорта</th><th class="l">Прогноз · стратегия</th><th>Ставок</th><th>Оборот</th><th>Прибыль</th><th>ROI</th><th>В плюс</th><th>Доля прибыли</th><th title="тот же вид спорта один, на своём банке с теми же настройками">Отдельно на своём банке</th></tr></thead><tbody>
    ${Object.keys(PF_SPORTS).filter((sp) => c[sp].on).map((sp) => { const s = stat[sp], S = PF_SPORTS[sp];
      return `<tr><td class="l"><b>${S.icon} ${S.name}</b></td><td class="l">${PF_SRC[c[sp].src]} · ${S.strats[c[sp].key]}</td><td>${s.n}</td><td>${money(s.staked).replace("+", "")}</td>
        <td><b class="${cls(s.pnl)}">${money(s.pnl)}</b></td><td>${pct(s.staked ? s.pnl / s.staked : null, 1)}</td><td>${pct(s.n ? s.wins / s.n : null)}</td>
        <td>${pct(tot.pnl ? s.pnl / tot.pnl : null)}</td><td>${alone[sp] ? `${money(alone[sp].bank - alone[sp].start)} <span class="faint">(просадка ${pct(alone[sp].ddp, 0)})</span>` : "—"}</td></tr>`; }).join("")}
  </tbody></table></div></div>
  <div class="grid g2">
    <div class="card"><div class="card-h"><h3>Банк и вклад каждого вида спорта</h3></div><div class="card-b"><div class="chart-box lg"><canvas id="pf-eq"></canvas></div></div></div>
    <div class="card"><div class="card-h"><h3>По месяцам</h3><span class="muted">прибыль, $</span></div><div class="card-b"><div class="chart-box lg"><canvas id="pf-mo"></canvas></div></div></div>
  </div>
  <div class="hint" style="margin-top:10px">Симуляция: исполнение заявок — по реальной ленте сделок, доходность — под размер каждой ставки. Правила «догонять» и «по рынку» выбраны на тех же данных, поэтому их результат может быть немного завышен; в 2026 преимущество у обоих видов спорта заметно меньше, чем в 2024-25.</div>`
  : `<div class="card"><div class="empty">Включите хотя бы один вид спорта.</div></div>`}`;

  // управление
  const upd = () => {
    const n = (id, d) => { const v = parseFloat($("#" + id).value); return Number.isFinite(v) ? v : d; };
    const nc = { ...c, bank: { ...c.bank, start: n("pf-start", 5000), min: n("pf-min", 0.5), max: n("pf-max", 2), maxUsd: n("pf-maxusd", 150), step: n("pf-step", 25),
      method: $("#pf-method").value, kf: n("pf-kf", 0.3), flat: n("pf-flat", 1) } };
    for (const sp of Object.keys(PF_SPORTS)) nc[sp] = { on: $("#pf-" + sp + "-on").checked, src: $("#pf-" + sp + "-src").value, key: $("#pf-" + sp + "-key").value, trust: n("pf-" + sp + "-trust", PF_SPORTS[sp].trust) };
    pfSave(nc); viewPortfolio();
  };
  $$("#app input, #app select").forEach((i) => (i.onchange = upd));
  $$("#pf-season .chip").forEach((b) => (b.onclick = () => { pfSave({ ...c, season: b.dataset.y }); viewPortfolio(); }));
  $("#pf-reset").onclick = () => { pfSave(PF_DEFAULT); viewPortfolio(); };
  if (!tot.n) return;

  // график: общий банк + накопленная прибыль каждого вида спорта (в общем банке)
  clearCharts();
  const ev = [];
  for (const sp of Object.keys(PF_SPORTS)) per[sp].forEach((b) => { const r = B.res.get(b); if (r && isNum(r.pnl)) ev.push({ t: Math.max(b.close_t || b.open_t, b.open_t + 1), sp, pnl: r.pnl }); });
  ev.sort((a, b) => a.t - b.t);
  const cum = { nba: 0, nhl: 0, nfl: 0 }, lines = { nba: [], nhl: [], nfl: [] };
  ev.forEach((e) => { cum[e.sp] += e.pnl; lines[e.sp].push({ x: e.t * 1000, y: B.start + cum[e.sp] }); });
  const ds = [{ label: "Общий банк", data: B.curve, borderColor: cssVar("--good"), backgroundColor: cssVar("--good") + "22", fill: true, pointRadius: 0, borderWidth: 2.2 }];
  for (const sp of Object.keys(PF_SPORTS)) if (lines[sp].length) ds.push({ label: `${PF_SPORTS[sp].name}: старт + прибыль`, data: lines[sp], borderColor: cssVar(PF_SPORTS[sp].color), pointRadius: 0, borderWidth: 1.5, borderDash: [5, 3] });
  chart($("#pf-eq"), { type: "line", data: { datasets: ds },
    options: { maintainAspectRatio: false, parsing: false, interaction: { intersect: false, mode: "nearest", axis: "x" },
      plugins: { legend: { labels: { boxWidth: 12 } }, tooltip: { ...tooltipBase(), callbacks: { title: (x) => new Date(x[0].raw.x).toLocaleDateString("ru-RU"), label: (x) => `${x.dataset.label}: ${money(x.raw.y).replace("+", "")}` } } },
      scales: { x: { type: "linear", ticks: { maxTicksLimit: 8, callback: (v) => ruDateS(new Date(v)) } },
        y: { ticks: { callback: (v) => "$" + Math.round(v).toLocaleString("ru-RU") } } } } });
  const months = {};
  ev.forEach((e) => { const dt = new Date(e.t * 1000); const k = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`; (months[k] = months[k] || { nba: 0, nhl: 0, nfl: 0 })[e.sp] += e.pnl; });
  const mk = Object.keys(months).sort();
  chart($("#pf-mo"), { type: "bar",
    data: { labels: mk.map((k) => `${k.slice(5)}.${k.slice(0, 4)}`),
      datasets: Object.keys(PF_SPORTS).filter((sp) => c[sp].on).map((sp) => ({ label: PF_SPORTS[sp].name, data: mk.map((k) => months[k][sp]), backgroundColor: cssVar(PF_SPORTS[sp].color), borderRadius: 4 })) },
    options: { maintainAspectRatio: false, plugins: { legend: { labels: { boxWidth: 12 } }, tooltip: { ...tooltipBase(), callbacks: { label: (x) => `${x.dataset.label}: ${money(x.raw)}` } } },
      scales: { x: { stacked: true }, y: { stacked: true, ticks: { callback: (v) => money(v) } } } } });
}
