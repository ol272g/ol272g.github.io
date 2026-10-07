"use strict";
/* ================= РОБОТ (оба вида спорта): ближайшие матчи и подробное окно матча =================
   Одинаково для НБА и НХЛ; различия — только в данных (у хоккея вратари и DailyFaceoff, у баскетбола — минуты и отчёт НБА). */
const hm = (t) => ruTime(new Date(t * 1000));
const dm = (t) => { const d = new Date(t * 1000); return `${ruWd(d)} ${ruDate(d)}`; };

// компактная сумма: $950, $12.3k, $1.25M
const usd = (v) => (!isNum(v) ? "—" : v >= 1e6 ? "$" + (v / 1e6).toFixed(2) + "M" : v >= 1e3 ? "$" + (v / 1e3).toFixed(v >= 1e4 ? 0 : 1) + "k" : "$" + Math.round(v));
// две стороны: хозяева слева, гости справа (цвета команд)
function twoSide(pHome, ca, ch, faint = false) {
  if (!isNum(pHome)) return `<span class="faint">—</span>`;
  return `<div class="tside ${faint ? "faint" : ""}"><span>${pct(pHome)}</span><div class="bar"><i style="width:${100 * pHome}%;background:${ch}"></i><i style="width:${100 * (1 - pHome)}%;background:${ca}"></i></div><span class="r">${pct(1 - pHome)}</span></div>`;
}

// предварительная ставка по основной стратегии (сервер считает по правилам робота и настройкам банка)
function stakeText(st, full = false) {
  if (!st || !st.length) return "";
  return st.map((x) => {
    const nm = BOT_SRC[x.src] || x.src;
    if (!x.signal) return `<div class="tstake faint">${full ? nm + ": " : ""}сейчас без ставки</div>`;
    const tip = `${nm}: ${x.real ? "реальная" : "бумажная"} ставка на ${x.team} по ${f1(100 * x.price, 0)}¢ · ${f1(x.pct, 2)}% от расчётного банка $${Math.round(x.ref)}${x.real ? "" : " (так было бы при включённых реальных; бумага — всегда $100)"}; сумма меняется вместе с ценой`;
    const amt = x.real ? `<b>${usd2(x.usd)}</b> на ${x.team}` : `бумага $100 на ${x.team}`;
    const KIND = { market: ["по рынку", "сильный сигнал: сразу купим по цене продавца (плюс комиссия ≈ 1 ¢), заявка исполнится целиком"],
                   limit_chase: ["лимитная с докупкой 36/24/12 ч", "заявка на цент ниже середины; неисполненный остаток переставим за 36, 24 и 12 ч до матча"],
                   limit: ["лимитная", "заявка на цент ниже середины; держим до конца матча, без докупки"] }[x.kind];
    const chs = x.real && KIND ? ` <span class="faint" title="${esc(KIND[1] + ". Предварительно: вид входа окончательно решится в момент ставки по стакану и цене на тот момент.")}">· ${KIND[0]} (предв.)</span>` : "";
    return `<div class="tstake ${x.real ? "acc" : ""}" title="${esc(tip)}">${full ? nm + ": " : ""}${x.real ? "ставка " : ""}${amt}${x.small ? ` <span class="bad">меньше минимума (5 акций)</span>` : ""}${chs}${full ? ` <span class="faint">по ${f1(100 * x.price, 0)}¢ · ${f1(x.pct, 2)}% от банка $${Math.round(x.ref)}${x.real ? "" : ` · реально было бы ${usd2(x.usd)}`}</span>` : ""}</div>`;
  }).join("");
}
const usd2 = (v) => (!isNum(v) ? "—" : "$" + (v < 100 ? v.toFixed(2) : Math.round(v)));

// исполнение лимитной заявки: «ждёт» / «исполнено 45%» / «куплено»
function fillText(b) {
  const f = b.shares ? (b.filled || 0) / b.shares : 0;
  if (b.status === "не исполнена" || b.status === "снята") return b.status;
  if (f <= 1e-9) return "заявка ждёт";
  return f >= 0.999 ? "куплено 100%" : `исполнено ${pct(f)}`;
}

// план докупки «догонять цену» (НХЛ): проверки за 36/24/12 ч, текущая цена заявки и что робот сделал бы по цене сейчас
const CHASE_H = [36, 24, 12];
function chasePlan(x, g, midHome) {
  const now = Date.now() / 1000, done = x.chase_k || 0;
  const pts = CHASE_H.map((h, i) => ({ h, k: i + 1, t: x.tip_t - h * 3600 })).filter((p) => p.t > x.signal_t);
  const left = (x.shares || 0) - (x.filled || 0);
  const nxt = pts.find((p) => p.k > done && p.t > now);
  const marks = pts.map((p) => `<span class="${p.k <= done || p.t <= now ? "faint" : p === nxt ? "acc" : ""}" title="за ${p.h} ч до матча">${p.k <= done ? "✓" : p === nxt ? "▸" : "·"} ${hm(p.t)}</span>`).join(" ");
  let what = "";
  if (left <= 1e-6) what = "куплено полностью — докупать нечего";
  else if (!nxt) what = `проверки пройдены — заявка по ${f1(100 * x.order_price, 0)}¢ ждёт до начала`;
  else if (isNum(midHome)) {
    const mid = x.team === g.home ? midHome : 1 - midHome;
    const edge = 0.6 * (x.model_p - mid), np = Math.floor(Math.round((mid - 0.01) * 1000) / 10) / 100;
    if ((x.filled || 0) > 0 && left < 5) what = `остаток ${f1(left, 2)} акц. < 5 — заявка остаётся по ${f1(100 * x.order_price, 0)}¢`;
    else if (edge < 0.03) what = `сейчас перевеса нет (${f1(100 * edge, 1)} п.п.) — не поднимем`;
    else if (np <= x.order_price + 1e-9) what = `цена не выросла — останется ${f1(100 * x.order_price, 0)}¢`;
    else what = `сейчас поднял бы <b>${f1(100 * x.order_price, 0)}¢ → ${f1(100 * np, 0)}¢</b> (перевес ${f1(100 * edge, 1)} п.п.)`;
  }
  return `<div class="tchase" title="«Догонять цену»: за 36, 24 и 12 ч до матча неисполненный остаток переставляется на середину − 1 ¢, если перевес по текущей цене ≥ 3 п.п. (цену только поднимаем)">🎯 докупка: ${marks}${what ? `<div>${what}</div>` : ""}</div>`;
}

// таблица «Ближайшие матчи» (4 дня): начало по Минску, решение робота, Polymarket (цена в обе стороны, объёмы),
// ожидаемый счёт, прогнозы трёх моделей в обе стороны и отличие от цены, ставки
function upcomingTable(games, mains) {
  setTimeout(liveTick, 0);
  const now = Date.now() / 1000;
  const main = new Set(mains && mains.length ? mains : [NHL ? "глико" : "смесь"]);
  const mc = (k) => (main.has(k) ? "main-col" : "");
  if (!games.length) return `<div class="card"><div class="empty">В ближайшие 4 дня матчей нет</div></div>`;
  const trust = NHL ? 0.6 : (typeof NFL !== "undefined" && NFL) ? (window.NFL_TRUST || 0.3) : 1, edge = 0.03;
  const byDay = {};
  games.forEach((g) => { const t = parseUtc(g.start_utc); const k = `${ruWd(t, true)}, ${ruDate(t)}`; (byDay[k] = byDay[k] || []).push(g); });
  // решение сохранено, но ставки по основной стратегии нет — сказать почему (а не «принято»)
  const PF = { "модель": "model_p", "глико": "glicko_p", "смесь": "mix_p" };
  const noBet = (g, p, mid) => {
    if ((g.bets || []).some((x) => main.has(x.strategy))) return `<span class="pill good" title="решение принято, ставка по основной стратегии сделана">принято</span>`;
    const ks = [...main].filter((k) => PF[k] && isNum(p[PF[k]]));
    if (!isNum(mid) || !ks.length) return `<span class="pill good">принято</span>`;
    const d = ks.map((k) => p[PF[k]] - mid), sig = d.some((x) => trust * Math.abs(x) >= edge && ((typeof ALT !== "undefined" ? ALT : NHL) || Math.abs(x) > edge));
    const split = main.has("смесь") && [p.model_p, p.glicko_p].every(isNum) && (p.model_p - mid) * (p.glicko_p - mid) < 0;
    const why = split ? "SHARP и Глико спорят о стороне" : sig ? "сигнал есть, ждём ставку" : `перевес ${sgn(100 * Math.max(...d.map(Math.abs)) * trust, 1)} п.п. — ниже порога ${100 * edge} п.п.`;
    return `<span class="faint">без ставки</span><div class="faint" style="font-size:11.5px" title="решение по основной стратегии: ставка не нужна">${why}</div>`;
  };
  // шанс исполнения лимитной заявки «середина − 1 ц» — по прошлому опыту симуляции (сильнее перевес → рынок уходит, реже исполняется)
  const fillHtml = (g) => {
    const fi = g.fill && [...main].map((k) => g.fill[k]).find(Boolean);
    if (!fi || !(trust * fi.edge >= edge)) return "";
    const H = fi.hold, C = fi.chase, pc = (v) => (isNum(v) ? Math.round(100 * v) + "%" : "—");
    const cls = H.p >= 0.6 ? "good" : H.p >= 0.4 ? "acc" : "bad";
    const tip = `Шанс, что лимитная заявка хоть частично купится до начала матча, по ${fi.n} прошлым сигналам с перевесом ${Math.round(100 * fi.lo)}–${fi.hi > 0.5 ? "∞" : Math.round(100 * fi.hi)} п.п. (симуляция 2024–26). `
      + `Просто заявка: ${pc(H.p)} (сезон 2024-25: ${pc(H.p_old)}, 2025-26: ${pc(H.p_new)}), в среднем купится ${pc(H.share)} суммы. С догонкой: ${pc(C.p)} (${pc(C.p_old)} / ${pc(C.p_new)}), ${pc(C.share)} суммы. `
      + `Чем сильнее перевес, тем реже исполняется: рынок уходит от нашей цены. Это оценка по симуляции, реальных исполнений пока мало.`;
    return `<div class="fillp" title="${esc(tip)}">лимитка купится <b class="${cls}">${pc(H.p)}</b><span class="faint"> · с догонкой ${pc(C.p)}</span></div>`;
  };
  const MODELS = [["модель", "SHARP", "model_p", "model"], ["глико", "Глико-2", "glicko_p", "glicko"], ["смесь", "SHARP + Глико", "mix_p", "mix"]];
  const mk = [...main][0], MM = MODELS.find((m) => m[0] === mk) || MODELS[2];
  const row = (g) => {
    const tip = parseUtc(g.start_utc).getTime() / 1000, p = g.prediction, pv = g.preview, b = g.base || {}, L = g.live || {};
    const [ca, ch] = pairColors(g.away, g.home);
    const mid = isNum(L.mid) ? L.mid : p?.mid_home ?? pv?.mid_home;
    const val = (k, bk) => (p && isNum(p[k]) ? p[k] : pv && isNum(pv[k]) ? pv[k] : b[bk]);
    const info = (m) => {
      const v = val(m[2], m[3]); if (!isNum(v)) return null;
      const d = isNum(mid) ? v - mid : null;
      return { v, d, e: isNum(d) ? trust * Math.abs(d) : null, side: isNum(d) ? (d > 0 ? g.home : g.away) : "",
               sig: isNum(d) && trust * Math.abs(d) >= edge && ((typeof ALT !== "undefined" ? ALT : NHL) || Math.abs(d) > edge) };
    };
    const pbar = (cls, pHome, faint) => !isNum(pHome) ? `<div class="pb ${cls}"><span class="faint">нет данных</span></div>`
      : `<div class="pb ${cls}${faint ? " faint" : ""}"><span class="n">${pct(pHome)}</span><div class="bar"><i style="width:${100 * pHome}%;background:${ch}"></i><i style="width:${100 * (1 - pHome)}%;background:${ca}"></i></div><span class="n r">${pct(1 - pHome)}</span></div>`;
    const mi = info(MM);
    const edgeTxt = mi && isNum(mi.d)
      ? `<span class="edge${mi.sig ? "" : " weak"}" title="разница с ценой ${sgn(100 * Math.abs(mi.d), 1)} п.п.${trust < 1 ? `; перевес = ${trust} × разница = ${f1(100 * mi.e, 1)} п.п. (ставка при ≥ 3)` : ""}">${mi.sig ? "сигнал " : "перевес "}${sgn(100 * mi.e, 1)} п.п. → ${mi.side}</span>` : `<span></span>`;
    const volTxt = isNum(L.vol_home) ? `<span class="faint" title="деньги, поставленные на каждую команду (по ленте сделок Polymarket): ${g.home} ${usd(L.vol_home)} · ${g.away} ${usd(L.vol_away)}">объём <b>${usd(L.vol_home + L.vol_away)}</b></span>` : "";
    const probs = !mi && !isNum(mid) ? `<div class="faint sub">Прогноз и цена появятся ближе к матчу</div>` : `<div class="prow"><em title="${MM[1]} — основная модель, по ней робот ставит${p || pv ? "" : " (утренний прогноз, без поправок)"}">Мы</em>${pbar("us", mi?.v, !(p || pv))}</div>
      <div class="prow"><em title="цена на Polymarket (обновляется каждые 20 с)">Рынок</em>${pbar("mk", mid)}</div>
      <div class="pfoot">${edgeTxt}${volTxt}</div>`;
    const others = !mi && !isNum(mid) ? "" : MODELS.filter((m) => m !== MM).map((m) => {
      const i = info(m);
      if (!i || !isNum(i.d)) return `<div class="oth"><i class="dot"></i><span>${m[1]}</span><span class="faint">—</span></div>`;
      const agree = mi && mi.side ? (i.side === mi.side ? "ag" : "dis") : "";
      return `<div class="oth ${agree}" title="${m[1]}: ${g.home} ${pct(i.v)} / ${g.away} ${pct(1 - i.v)} · разница с ценой ${sgn(100 * Math.abs(i.d), 1)} п.п.${agree === "dis" ? " — спорит с основной моделью" : ""}"><i class="dot"></i><span>${m[1]}</span><b class="${i.sig ? "acc" : ""}">${sgn(100 * i.e, 1)}</b><span class="faint">${i.side}</span></div>`;
    }).join("");
    const missed = !p && g.signal_t + 3 * 3600 < now;
    const decF = () => missed ? `<span class="bad">пропущено</span><div class="faint sub" title="в момент решения робот не работал (компьютер спал или был выключен); опоздание больше 3 ч — робот не ставит">робот не работал в ${hm(g.signal_t)}</div>` : g.signal_t > now
      ? `<span class="faint">решение в ${hm(g.signal_t)}</span><div class="faint sub" data-cd="${g.signal_t}" data-pre="через " data-done="сейчас">через ${cdText(g.signal_t)}</div>${stakeText(g.stake)}`
      : p ? (p.note ? `<span class="faint" title="${esc(p.note)}">без ставки</span><div class="faint sub">${esc(p.note.split(" — ")[0])}</div>` : noBet(g, p, mid)) : `<span class="faint">ждём робота…</span>`;
    // реальные ставки — главное в колонке решения (вместо «принято»)
    const reals = g.bets.filter((x) => x.mode === "реально");
    const WAIT = ["повтор", "ждёт связи"];
    const realOk = reals.filter((x) => !["ошибка", "пропуск", "снята", "не исполнена"].includes(x.status));
    const realTxt = realOk.length
      ? realOk.map((x) => `<div class="rb"><span class="pill bad" title="${esc(x.status)}">₽ ${x.team} ${f1(100 * x.order_price, 0)}¢${isNum(x.stake) && x.stake > 0 ? " · " + usd2(x.stake) : ""}</span><div class="sub ${WAIT.includes(x.status) ? "acc" : (x.filled || 0) > 0 ? "good" : "faint"}" ${WAIT.includes(x.status) ? `title="${esc(x.note || "")}"` : ""}>${x.strategy === "вручную" ? "вручную · " : x.strategy === "на Polymarket вручную" ? "ваша на Polymarket · " : x.plan === "market" && !x.strategy.startsWith("на") ? (x.fee != null && !(x.chase_k > 0) ? "по рынку · " : x.chase_k > 0 ? "заявка + догонка · " : "заявка · ") : ""}${WAIT.includes(x.status) ? "биржа не приняла — робот повторит" : fillText(x)}</div>${x.plan === "chase" && !WAIT.includes(x.status) && x.status !== "не исполнена" ? chasePlan(x, g, L.mid) : ""}</div>`).join("")
      : reals.length ? `<span class="pill bad" title="${esc(reals.map((x) => x.note || x.status).join("; "))}">₽ ${esc(reals[reals.length - 1].status)}</span><div class="bad sub" style="max-width:220px;white-space:normal">${esc((reals[reals.length - 1].note || "").slice(0, 80))}</div>` : "";
    g.bets.sort((a, b) => (b.mode === "реально") - (a.mode === "реально"));
    const paper = g.bets.filter((x) => x.mode !== "реально");
    // бумажные ставки сгруппированы по команде: «NYR ×6 · куплено 5»; полный список — при наведении
    const byTeam = {};
    paper.forEach((x) => (byTeam[x.team] = byTeam[x.team] || []).push(x));
    const bets = Object.entries(byTeam).map(([tm, xs]) => {
      const got = xs.filter((x) => (x.filled || 0) > 0).length;
      const list = xs.map((x) => `${BOT_SRC_ALL[x.strategy] || x.strategy}: ${fillText(x)}`).join("\n");
      return `<span class="pill neutral" title="${esc(list)}">${logo(tm, "sm")}<b>${tm}</b> ×${xs.length}${got ? `<span class="good"> · куплено ${got}</span>` : `<span class="faint"> · ждут</span>`}</span>`;
    }).join("");
    const e = g.exp;
    const dec = realTxt ? `${realTxt}${g.signal_t > now ? `<div class="faint sub">решение робота в ${hm(g.signal_t)}</div>` : ""}` : decF();
    const st = realOk.length ? "st-real" : paper.some((x) => (x.filled || 0) > 0) ? "st-paper" : "st-none";
    const xg = e ? (() => { const d = NHL ? 1 : 0, a = +e.away, h = +e.home; return `<div class="mx" title="${NHL ? "ожидаемые голы" : "ожидаемые очки"}: хозяева · гости"><span class="sc"><i class="${h > a ? "up" : ""}">${f1(h, d)}</i><s>:</s><i class="${a > h ? "up" : ""}">${f1(a, d)}</i></span><small>${NHL ? "ожид. голы" : "ожид. очки"}</small></div>` })() : `<div class="mx"><span class="faint">—</span></div>`;
    return `<tr class="click gm ${st}" data-g="${g.game_id}"><td class="l"><b class="tt">${hm(tip)}</b><div class="faint sub" data-cd="${tip}" data-pre="через " data-done="идёт">через ${cdText(tip)}</div><div class="lv" data-lv="${g.away}@${g.home}|${String(g.start_utc).slice(0, 10)}"></div></td>
      <td class="l"><div class="mt"><div class="tm">${logo(g.home, "xl")}<b>${g.home}</b></div>${xg}<div class="tm">${logo(g.away, "xl")}<b>${g.away}</b></div></div>${g.type !== "регулярка" ? `<div style="text-align:center;margin-top:4px"><span class="pill blue">${esc(g.type)}</span></div>` : ""}</td>
      <td class="l dcell">${dec}${fillHtml(g)}</td>
      <td class="l pcell">${probs}</td>
      <td class="l ocell">${others}</td>
      <td class="l"><div class="bch">${bets}</div></td></tr>`;
  };
  return `<div class="card"><div class="card-b tbl-wrap"><table class="tbl upc"><thead><tr><th class="l">Старт (Минск)</th><th class="l">Дом · Гости</th><th class="l">Решение робота</th>
      <th class="l" title="Мы — прогноз основной модели, Рынок — цена на Polymarket; обновляется каждые 20 с">Вероятности<div class="main-tag">★ ${MM[1]} · ставит робот</div></th><th class="l" title="остальные модели: перевес над ценой и сторона; зелёная точка — за ту же сторону, что и основная, жёлтая — спорит">Другие модели</th><th class="l">Бумажные ставки</th></tr></thead>
    <tbody>${Object.entries(byDay).map(([k, gs]) => `<tr class="dayrow"><td colspan="6" class="l">${k}</td></tr>${gs.map(row).join("")}`).join("")}</tbody></table></div>
    <div class="hint" style="padding:0 16px 14px">Слева — хозяева, справа — гости. «Мы» — прогноз основной модели (★, по ней робот ставит), «Рынок» — цена Polymarket; чем дальше полосы друг от друга, тем больше перевес. Под полосами — перевес над ценой и за кого${NHL ? " (перевес = 0.6 × разница модели с ценой; разница — при наведении)" : ""}; оранжевым — сигнал: ${NHL ? "перевес ≥ 3 п.п." : "перевес больше 3 п.п."}. Между логотипами — ожидаемый счёт (${NHL ? "голы" : "очки"}). Прогнозы — с поправками на травмы и составы${NHL ? " и вратарей" : ""} (пересчёт раз в час; бледным — утренний, если поправок ещё нет). Реальные ставки — в колонке решения, бумажные — справа. Нажмите на матч — подробности.</div></div>`;
}

async function showRobotGame(gid) {
  const r = await fetch(`${APIP}robot/game/${gid}`);
  if (!r.ok) { alert("Нет данных о матче"); return; }
  const d = await r.json(), g = d.game, P = d.players, now = Date.now() / 1000;
  const [ca, ch] = pairColors(g.away, g.home);
  const mid = d.book?.mid ?? d.live?.mid ?? d.prediction?.mid_home;
  const pp = d.prediction && isNum(d.prediction.model_p) ? d.prediction : d.preview && isNum(d.preview.model_p) ? d.preview : null;
  const src = pp ? { model: pp.model_p, glicko: pp.glicko_p, mix: pp.mix_p } : d.base || {};
  const srcName = d.prediction ? "с поправками, при решении" : d.preview ? "с поправками, сейчас" : "утренний";
  const modelRow = (k, name) => {
    const v = src[k]; if (!isNum(v)) return "";
    const raw = isNum(mid) ? v - mid : null, eh = isNum(mid) ? d.trust * (v - mid) : null, side = isNum(eh) ? (eh > 0 ? g.home : g.away) : null;
    const sig = isNum(eh) && Math.abs(eh) >= d.edge;
    return `<tr><td class="l"><b>${name}</b></td><td>${pct(v, 1)}</td><td>${pct(1 - v, 1)}</td>${d.trust < 1 ? `<td>${isNum(raw) ? sgn(100 * raw, 1) + " п.п." : "—"}</td>` : ""}<td>${isNum(eh) ? sgn(100 * eh, 1) + " п.п." : "—"}</td>
      <td class="l">${isNum(eh) ? (sig ? `<span class="pill acc">сигнал: ${side}</span>` : `<span class="faint">перевеса нет</span>`) : "—"}</td></tr>`;
  };
  const inj = (team) => d.injuries.filter((x) => x.team === team);
  const nflTable = (team) => {
    const x = d.lineups[team] || {}, pl = (x.players || []).slice();
    if (!pl.length) return `<div class="faint">Состав появится в момент решения робота</div>`;
    const G = Object.fromEntries(NFL_GROUPS.map(([k], i) => [k, i]));
    pl.sort((a, b) => (G[a[2]] ?? 99) - (G[b[2]] ?? 99) || b[3] - a[3]);
    let last = null;
    return `<table class="tbl" style="font-size:12.5px"><thead><tr><th class="l">Игрок</th><th title="ожидаемая доля снапов">Снапы</th><th title="${esc(NFL_RATING_T)}">SHARP</th><th title="${esc(NFL_GLK_T)}">Глико</th><th class="sep l" title="текущий сезон">Сезон</th></tr></thead><tbody>
      ${pl.map(([pid, nm, grp, sh]) => { const p = P[pid] || {}, s = p.stat || {};
        if (p.headshot) PHOTO[pid] = p.headshot;
        const head = grp !== last ? `<tr><td class="l faint" colspan="5" style="padding-top:8px">${esc((NFL_GROUPS.find(([k]) => k === grp) || [grp, grp])[1])}</td></tr>` : ""; last = grp;
        const qb = grp === "QB", r = qb ? p.qb_sharp : p.sharp, gg = qb ? p.qb_glicko : p.glicko;
        const stat = qb ? (s.gp ? `${s.gp} и · ${s.pass_yds} ярд., ${s.pass_td} TD, ${s.int} INT` : "—")
          : ["DL", "LB", "DB"].includes(grp) ? (s.gp ? `${s.gp} и · ${s.tkl} захв., ${s.sacks} сэк.` : "—")
          : (s.gp ? `${s.gp} и · ${(s.rush_yds || 0) + (s.rec_yds || 0)} ярд., ${s.td} TD` : "—");
        return head + (pid === "-" ? `<tr><td class="l faint">неизвестные (новички, подписанные)</td><td>${pct(sh)}</td><td colspan="3"></td></tr>`
          : `<tr class="click" onclick="window.open('/nfl#/player/${pid}','_blank')"><td class="l"><div class="pl">${avatar(pid, p.name || nm)}<span class="nm">${esc(p.name || nm || pid)}</span><span class="st">${esc(p.pos || "")}</span></div></td>
          <td>${pct(sh)}</td><td><b class="${cls(r)}">${sgn(r, 3)}</b></td><td>${glk(gg)}</td><td class="sep l faint">${esc(stat)}</td></tr>`); }).join("")}</tbody></table>`;
  };
  const skTable = (team) => {
    if (typeof NFL !== "undefined" && NFL) return nflTable(team);
    const ord = (g) => { const m = /^(f|d)(\d)/.exec(g || ""); return m ? (m[1] === "f" ? 0 : 10) + +m[2] : 99; };
    const x = d.lineups[team] || {}, sk = (x.skaters || []).slice().sort((a, b) => ord(a[3]) - ord(b[3]) || b[2] - a[2]);
    if (!sk.length) return `<div class="faint">Состав появится в момент решения робота</div>`;
    if (!NHL) return `<table class="tbl" style="font-size:12.5px"><thead><tr><th class="l">Игрок</th><th title="ожидаемые минуты">Мин</th><th title="рейтинг SHARP перед матчем">SHARP</th><th title="${esc(GLK_TITLE)}">Глико</th>
      <th class="sep" title="прогноз на матч: очки">Очк</th><th title="прогноз на матч: подборы">Подб</th><th title="прогноз на матч: передачи">Пер</th><th class="sep" title="сезон: игр">И</th><th title="сезон: очков за игру">Очк/и</th></tr></thead><tbody>
      ${sk.map(([pid, nm, m]) => { const p = P[pid] || {}, s = p.stat || {}, pr = (d.proj || {})[pid] || {};
        return `<tr class="click" onclick="window.open('/nba#/player/${pid}','_blank')"><td class="l"><div class="pl">${avatar(pid, p.name || nm)}<span class="nm">${esc(p.name || nm || pid)}</span></div></td>
        <td>${f1(m, 0)}</td><td><b class="${cls(p.sharp)}">${sgn(p.sharp)}</b></td><td>${glk(p.glicko)}</td>
        <td class="sep"><b>${f1(pr.pts)}</b></td><td>${f1(pr.reb)}</td><td>${f1(pr.ast)}</td><td class="sep">${s.gp ?? "—"}</td><td>${f1(s.pts)}</td></tr>`; }).join("")}</tbody></table>`;
    return `<table class="tbl" style="font-size:12.5px"><thead><tr><th class="l">Игрок</th><th class="l" title="звено по DailyFaceoff: F1–F4 нападение, D1–D3 защита; PP1/PP2 — бригады большинства">Звено</th><th title="ожидаемое время на льду">Время</th><th title="${esc(NHL_RATING_T)}">SHARP</th><th title="${esc(NHL_GLK_T)}">Глико</th>
      <th class="sep" title="прогноз на матч: ожидаемые голы">Г</th><th title="прогноз на матч: передачи">П</th><th title="прогноз на матч: очки">О</th><th title="прогноз на матч: броски в створ">Бр</th><th title="шанс забить хотя бы один гол">Забьёт</th>
      <th class="sep" title="прошлый сезон: игр">И</th><th title="прошлый сезон: очков">О</th></tr></thead><tbody>
      ${sk.map(([pid, nm, m, grp]) => { const p = P[pid] || {}, s = p.stat || {}, pr = (d.proj || {})[pid] || {};
        if (p.headshot) PHOTO[pid] = p.headshot;
        return `<tr class="click" onclick="window.open('/nhl#/player/${pid}','_blank')"><td class="l"><div class="pl">${avatar(pid, p.name || nm)}<span class="nm">${esc(p.name || nm || pid)}</span><span class="st">${esc(p.pos || "")}</span></div></td>
        <td class="l">${(grp || "").split(" ").filter(Boolean).map((x) => `<span class="pill ${x.startsWith("pp") ? "acc" : "neutral"}" style="padding:1px 6px">${x.toUpperCase()}</span>`).join(" ") || `<span class="faint">—</span>`}</td>
        <td>${toiFmt(m)}</td><td><b class="${cls(p.sharp)}">${sgn(p.sharp, 2)}</b></td><td>${glk(p.glicko)}</td>
        <td class="sep"><b>${f1(pr.g, 2)}</b></td><td>${f1(pr.a, 2)}</td><td><b>${f1(pr.pts, 2)}</b></td><td>${f1(pr.sog, 1)}</td><td>${isNum(pr.p_goal) ? pct(pr.p_goal) : "—"}</td>
        <td class="sep">${s.gp ?? "—"}</td><td>${s.pts ?? "—"}</td></tr>`; }).join("")}</tbody></table>`;
  };
  const gkTable = (team) => {
    const x = d.lineups[team] || {}, conf = d.dfo.find((q) => q.team === team);
    const gk = (x.goalies || []).slice().sort((a, b) => b[2] - a[2]);
    return `<table class="tbl" style="font-size:12.5px"><thead><tr><th class="l">Вратарь</th><th title="вероятность выйти в старте (модель / подтверждение)">Старт</th><th title="${esc(NHL_GSAX_T)}">Рейтинг</th><th>Глико</th><th title="прогноз на матч (с учётом шанса старта): броски по нему / пропустит">Броски / проп.</th><th title="сезон: игр · % отражённых">Сезон</th></tr></thead><tbody>
      ${gk.map(([pid, nm, q]) => { const p = P[pid] || {}, s = p.stat || {};
        if (p.headshot) PHOTO[pid] = p.headshot;
        return `<tr><td class="l"><div class="pl">${avatar(pid, p.name || nm)}<span class="nm">${esc(p.name || nm || pid)}</span></div></td><td><b>${pct(q)}</b></td>
        <td><b class="${cls(p.gsax30)}">${sgn(p.gsax30, 2)}</b></td><td>${glk(p.glicko)}</td><td>${(d.proj || {})[pid] ? f1(d.proj[pid].shots, 1) + " / " + f1(d.proj[pid].ga, 2) : "—"}</td><td class="faint">${s.gp ?? "—"} · ${svPct(s.sv, s.sa)}</td></tr>`; }).join("")}</tbody></table>
      ${conf ? `<div class="hint">DailyFaceoff: <b>${esc(conf.name || "—")}</b> — ${esc(conf.status || "не подтверждён")}${conf.news_at ? ` (${tsDate(new Date(conf.news_at).getTime() / 1000)})` : ""}</div>` : ""}`;
  };
  const teamCol = (team, isHome) => {
    const x = d.lineups[team] || {}, f = d.form[team] || [];
    return `<div class="card" style="padding:14px">
      <h3 style="margin:0 0 8px;display:flex;align-items:center;gap:8px">${logo(team, "md")} ${esc(teamName(team))} <span class="faint" style="font-size:12px">${isHome ? "хозяева" : "гости"}</span></h3>
      <div style="margin-bottom:8px">${f.map((m) => `<span class="pill ${m.win ? "good" : "bad"}" title="${dateShort(m.date)} — ${m.opp}">${m.win ? "В" : "П"} ${m.score}</span>`).join(" ") || `<span class="faint">форма: матчей ещё не было</span>`}</div>
      ${(x["поправки"] || []).map((n) => `<div class="ev acc">⚑ ${esc(n.replace(team + ": ", ""))}</div>`).join("")}
      ${inj(team).length ? `<div style="margin:6px 0"><b style="font-size:12.5px">Травмы</b>${inj(team).map((i) => `<div class="ev" style="font-size:12.5px"><b>${esc(i.name)}</b> — ${esc(i.status || "")}${i["return"] ? ` <span class="faint">(~${esc(String(i["return"]).slice(0, 10))})</span>` : ""} <span class="faint">${esc(i.src)}</span></div>`).join("")}</div>` : ""}
      ${NHL ? `<div class="section-title" style="margin:10px 0 6px">Вратари</div>${gkTable(team)}` : ""}
      <div class="section-title" style="margin:12px 0 6px">Ожидаемый состав</div><div class="tbl-wrap">${skTable(team)}</div></div>`;
  };
  const betRows = d.bets.map((b) => `<tr><td class="l">${b.mode === "реально" ? `<span class="pill bad">реально</span>` : `<span class="pill neutral">бумага</span>`} ${esc(BOT_SRC_ALL[b.strategy] || b.strategy)}</td>
    <td class="l">${logo(b.team, "sm")} <b>${b.team}</b></td><td>${tsDate(b.signal_t)}</td><td>${pct(b.model_p, 1)} / ${pct(b.market_p, 1)}</td><td>${f1(100 * b.order_price, 0)}¢</td>
    <td>${money(b.stake, 2).replace("+", "")}</td><td class="l" style="white-space:nowrap">${b.shares ? `<b>${fillText(b)}</b><div class="faint" style="font-size:11px">${f1(b.filled || 0, 1)} из ${f1(b.shares, 1)} акций${b.entry_t ? " · с " + hm(b.entry_t) : ""}</div>` : "—"}</td><td class="l">${esc(b.status)}${b.exit_how ? " · " + esc(b.exit_how) : ""}${b.note && ["ошибка", "пропуск", "повтор", "ждёт связи"].includes(b.status) ? `<div class="${b.status === "повтор" || b.status === "ждёт связи" ? "acc" : "bad"}" style="font-size:11px">${esc(b.note)}${b.status === "повтор" || b.status === "ждёт связи" ? " — робот повторит" : ""}</div>` : ""}${b.mode === "реально" && b.status === "ждёт исполнения" && b.buy_oid ? ` <button class="chip" data-cancel="${esc(b.id)}" style="padding:2px 8px;font-size:11px">снять</button>` : ""}</td>
    <td class="${cls(b.clv)}">${isNum(b.clv) ? sgn(100 * b.clv, 1) + "¢" : "—"}</td><td><b class="${cls(b.pnl)}">${isNum(b.pnl) ? money(b.pnl, 2) : "—"}</b></td></tr>`).join("");
  const fillLog = d.bets.filter((b) => (b.fills || []).length).map((b) => `<div style="margin-top:8px"><b>${b.mode === "реально" ? "реально" : "бумага"} · ${esc(BOT_SRC_ALL[b.strategy] || b.strategy)} → ${b.team}</b> <span class="faint">(заявка ${f1(100 * b.order_price, 0)}¢ на ${f1(b.shares, 1)} акций, выставлена ${tsDate(b.signal_t)})</span>
      ${b.fills.map((x) => `<div class="ev">${tsDate(x.t)} — ${x.kind} ${f1(x.shares, 1)} акц. по ${f1(100 * (x.price || b.order_price), 0)}¢ <span class="faint">→ всего ${f1(x.total, 1)}${x.kind === "покупка" && b.shares ? " (" + pct(x.total / b.shares) + ")" : ""}</span></div>`).join("")}</div>`).join("");
  const box = document.createElement("div");
  box.className = "modal full";
  box.innerHTML = `<div class="card modal-c wide"><div class="card-h"><h3>${g.home} — ${g.away}</h3><button class="chip" id="m-x">✕</button></div>
    <div class="card-b">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap">
        <div style="display:flex;align-items:center;gap:14px">${logo(g.home, "lg")}<div style="font-family:var(--display);font-size:34px">${g.home} <span class="faint">—</span> ${g.away}</div>${logo(g.away, "lg")}</div>
        <div style="text-align:right"><div style="font-size:18px"><b>${dm(d.tip)}, ${hm(d.tip)}</b> <span class="faint">по Минску</span></div>
          <div class="faint">начало через <b data-cd="${d.tip}" data-done="идёт">${cdText(d.tip)}</b></div>
          <div class="faint">решение робота ${d.decision_t > now ? `через <b data-cd="${d.decision_t}" data-done="сейчас">${cdText(d.decision_t)}</b> (${hm(d.decision_t)})` : d.prediction ? `принято ${tsDate(d.prediction.t)}` : "— ждём робота"}</div>
          <div class="faint">пересчёт за 24 ч: ${d.recheck_t > now ? hm(d.recheck_t) + ", " + dm(d.recheck_t) : d.recheck ? "сделан " + tsDate(d.recheck.t) : "—"}</div></div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0">
        ${d.pm_url ? `<a class="chip active" href="${d.pm_url}" target="_blank" rel="noopener">Polymarket ↗</a>` : `<span class="chip" title="робот ищет рынок за 2 ч до решения">рынок Polymarket ещё не найден</span>`}
        <a class="chip" href="${d.ext_url}" target="_blank" rel="noopener">${esc(d.ext_name)} ↗</a>
        ${d.book && isNum(d.book.mid) ? `<span class="chip">цена сейчас: ${g.home} ${pct(d.book.mid, 1)} · ${g.away} ${pct(1 - d.book.mid, 1)} (стакан ${f1(100 * d.book.bid, 0)} / ${f1(100 * d.book.ask, 0)}¢)</span>` : ""}
        ${d.live && isNum(d.live.vol_home) ? `<span class="chip" title="деньги на каждую команду по ленте сделок">поставлено: ${g.home} ${usd(d.live.vol_home)} · ${g.away} ${usd(d.live.vol_away)} · всего ${usd(d.live.vol_home + d.live.vol_away)}</span>` : ""}
      </div>
      <div class="grid g2" style="align-items:start">
        <div class="card" style="padding:14px"><h4 style="margin:0 0 8px">Шансы и решение</h4>
          ${probLine(null, src.mix, ca, ch, "SHARP + Глико", srcName, true)}
          ${probLine(null, mid, ca, ch, "Polymarket", d.book ? "сейчас" : "при решении")}
          <table class="tbl" style="margin-top:10px;font-size:12.5px"><thead><tr><th class="l">Модель</th><th>${g.home}</th><th>${g.away}</th>${d.trust < 1 ? `<th title="модель − цена Polymarket (за хозяев)">Разница с ценой</th>` : ""}<th title="${d.trust < 1 ? d.trust + " × разница с ценой — это сравнивается с порогом" : "модель − цена (за хозяев)"}">Перевес${d.trust < 1 ? ` (${d.trust} ×)` : ""}</th><th class="l">Итог</th></tr></thead><tbody>
            ${modelRow("model", "SHARP")}${modelRow("glicko", "Глико-2")}${modelRow("mix", "SHARP + Глико")}</tbody></table>
          ${!d.goals && d.exp ? `<div class="card" style="padding:12px;margin-top:12px;background:var(--card-2)"><div style="display:flex;justify-content:center;align-items:center;gap:16px;font-family:var(--display);font-size:30px">${logo(g.home, "sm")} ${g.home} <b>${f1(d.exp.home, 0)}</b> <span class="faint">:</span> <b>${f1(d.exp.away, 0)}</b> ${g.away} ${logo(g.away, "sm")}</div><div class="faint" style="text-align:center;font-size:12px">ожидаемый счёт</div></div>` : ""}
          ${d.goals ? `<div class="card" style="padding:12px;margin-top:12px;background:var(--card-2)">
            <div style="display:flex;justify-content:center;align-items:center;gap:16px;font-family:var(--display);font-size:30px">${logo(g.home, "sm")} ${g.home} <b>${f1(d.goals.home, 1)}</b> <span class="faint">:</span> <b>${f1(d.goals.away, 1)}</b> ${g.away} ${logo(g.away, "sm")}</div>
            <div class="faint" style="text-align:center;font-size:12px;margin-bottom:8px">ожидаемые голы (с овертаймом и буллитами)</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">
              <span class="chip">овертайм ${pct(d.goals.ot)}</span><span class="chip">тотал больше 5.5: ${pct(d.goals.over_5_5)}</span><span class="chip">больше 6.5: ${pct(d.goals.over_6_5)}</span>
              <span class="chip">${g.home} −1.5: ${pct(d.goals.home_m15)}</span><span class="chip">${g.away} −1.5: ${pct(d.goals.away_m15)}</span></div></div>` : ""}
          ${d.stake && d.decision_t > now ? `<div class="card" style="padding:10px 12px;margin-top:10px;background:var(--card-2)"><div class="faint" style="font-size:12px;margin-bottom:4px">Предварительно (если цена и прогноз не изменятся к моменту решения):</div>${stakeText(d.stake, true)}</div>` : ""}
          <div class="hint">${!isNum(src.mix) ? "Прогноз появится в момент решения робота. " : ""}Ставка — если перевес ${ALT ? "≥" : ">"} ${100 * d.edge} п.п.${ALT ? " — у смеси ещё и SHARP с Глико в одну сторону." : ""}${(typeof NFL !== "undefined" && NFL) ? " Доверие к модели поверх рынка (по лаборатории): " + Object.entries(d.trusts || {}).map(([k, v]) => BOT_SRC[k] + " " + v).join(", ") + "." : ""} Реальные ставки: ${d.settings["реальные"]["включены"] ? d.settings["реальные"]["источники"].map((x) => BOT_SRC[x]).join(", ") : "выключены"}.</div></div>
        <div class="card" style="padding:14px"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:8px"><h4 style="margin:0">Ставки робота</h4>${d.tip - 180 > now ? `<button class="chip" id="m-manual" title="своя лимитная заявка на Polymarket — ставит робот, с вашим подтверждением и паролем управления">✋ Поставить вручную</button>` : ""}</div>
          ${d.bets.length ? `<div class="tbl-wrap"><table class="tbl" style="font-size:12.5px"><thead><tr><th class="l">Кто</th><th class="l">На кого</th><th>Когда</th><th title="прогноз / цена при сигнале">Прогноз / цена</th><th>Заявка</th><th>Сумма</th><th class="l" title="лимитная заявка: сколько акций уже купили по нашей цене">Исполнено</th><th class="l">Статус</th><th>CLV</th><th>Итог</th></tr></thead><tbody>${betRows}</tbody></table></div>
            ${fillLog ? `<h4 style="margin:14px 0 2px">Исполнение заявок</h4>${fillLog}` : `<div class="hint">Заявка — лимитная, на 1 ¢ ниже середины цены; исполнится, когда кто-то продаст по нашей цене. Время исполнения появится здесь.</div>`}`
            : `<div class="empty" style="padding:12px">${d.prediction ? (d.prediction.note ? esc(d.prediction.note) : "Перевеса нет — ставок нет") : "Решения ещё не было"}</div>`}
          ${d.h2h.length ? `<h4 style="margin:14px 0 6px">Личные встречи</h4>${d.h2h.map((m) => `<div class="ev">${dateShort(m.date)} — ${m.home} ${m.hp} : ${m.ap} ${m.away}</div>`).join("")}` : ""}</div>
      </div>
      <div class="grid g2" style="margin-top:14px;align-items:start">${teamCol(g.home, true)}${teamCol(g.away, false)}</div>
    </div></div>`;
  document.body.appendChild(box);
  const close = () => box.remove();
  box.onclick = (e) => { if (e.target === box) close(); };
  box.querySelector("#m-x").onclick = close;
  const reopen = () => { close(); showRobotGame(gid); };
  if (box.querySelector("#m-manual")) box.querySelector("#m-manual").onclick = () => manualOrder(d, reopen);
  box.querySelectorAll("[data-cancel]").forEach((bt) => (bt.onclick = async () => {
    const b = d.bets.find((x) => x.id === bt.dataset.cancel);
    if (!confirm(`Снять реальную заявку: ${b.team} по ${f1(100 * b.order_price, 0)}¢? Уже купленное останется.`)) return;
    const pw = BOT_PW || prompt("Пароль управления") || "";
    try { const r = await botApi("manual", { kind: "снять", bet_id: b.id }, pw); BOT_PW = pw; bt.disabled = true; bt.textContent = "снимаем…"; await manualWait(r.id, (t) => (bt.textContent = t)); reopen(); }
    catch (e) { alert(e.message); }
  }));
  const esc_ = (e) => { if (e.key === "Escape") { if (document.querySelector(".modal.manual")) return; close(); document.removeEventListener("keydown", esc_); } };
  document.addEventListener("keydown", esc_);
  document.body.style.overflow = "hidden";
  const obs = new MutationObserver(() => { if (!document.body.contains(box)) { document.body.style.overflow = ""; obs.disconnect(); } });
  obs.observe(document.body, { childList: true });
}


// ---------------- ручная лимитная заявка (реальные деньги; ставит робот, подтверждение + пароль управления) ----------------
async function manualWait(id, onText) {
  for (let i = 0; i < 60; i++) {                                   // робот берёт очередь раз в ~20 с
    await new Promise((r) => setTimeout(r, 2000));
    let m; try { m = await botApi("manual/" + id); } catch (e) { continue; }
    if (m.status === "готово") { onText("✓ " + (m.note || "готово")); return m; }
    if (m.status === "ошибка") { onText("✗ " + (m.note || "ошибка")); throw new Error(m.note || "ошибка"); }
    onText(m.note && m.note.startsWith("повторим") ? `биржа не приняла — робот повторяет (${m.note.slice(10, 90)})` : `ждём робота… ${2 * (i + 1)} с`);
  }
  throw new Error("за 2 минуты заявка ещё не выставлена — робот продолжит пытаться сам (видно в окне матча). Если робот не запущен, заявка дождётся его в очереди.");
}

function manualOrder(d, done) {
  const g = d.game, bk = d.book || {}, tick = 0.01;
  const sideBook = (team) => {                                     // цены нашей стороны: покупают / продают / середина
    if (!isNum(bk.mid)) return {};
    return team === g.home ? { bid: bk.bid, ask: bk.ask, mid: bk.mid } : { bid: isNum(bk.ask) ? 1 - bk.ask : null, ask: isNum(bk.bid) ? 1 - bk.bid : null, mid: 1 - bk.mid };
  };
  const sug = (d.stake || []).find((x) => x.signal);
  let team = sug ? sug.team : g.home;
  const box = document.createElement("div");
  box.className = "modal manual";
  box.style.zIndex = 2000;
  const draw = () => {
    const sb = sideBook(team);
    const defPx = isNum(sb.mid) ? Math.floor(Math.round((sb.mid - 0.01) * 1000) / 10) / 100 : 0.5;
    const defUsd = sug && sug.team === team ? Math.max(sug.usd, 1) : 5;
    box.innerHTML = `<div class="card modal-c" style="max-width:520px;padding:18px">
      <div class="card-h" style="padding:0 0 10px"><h3>✋ Ручная заявка — реальные деньги</h3><button class="chip" id="mo-x">✕</button></div>
      <div class="faint" style="font-size:12.5px;margin-bottom:12px">${g.home} — ${g.away} · Polymarket, победитель матча. Заявку ставит робот своим ключом; дальше — как обычная реальная ставка «держать»: исполнение, снятие остатка за 3 мин до начала, итог.</div>
      <div class="seg" id="mo-team" style="margin-bottom:12px">${[g.home, g.away].map((t) => `<button data-t="${t}" class="${t === team ? "active" : ""}">${logo(t, "sm")} ${t}</button>`).join("")}</div>
      <div class="chip" style="margin-bottom:12px;display:inline-block">${isNum(sb.mid) ? `${team}: покупают ${f1(100 * sb.bid, 0)}¢ · продают ${f1(100 * sb.ask, 0)}¢ · середина ${f1(100 * sb.mid, 1)}¢` : "цены сейчас нет"}</div>
      ${sug ? `<div class="hint" style="margin:0 0 10px">Робот по ${esc(BOT_SRC[sug.src] || sug.src)}: ${sug.team} по ${f1(100 * sug.price, 0)}¢, ${usd2(sug.usd)}.</div>` : ""}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <label style="font-size:12.5px;font-weight:600;color:var(--muted)">Цена, ¢<input class="input" type="number" id="mo-px" min="1" max="99" step="1" value="${Math.round(100 * defPx)}"></label>
        <label style="font-size:12.5px;font-weight:600;color:var(--muted)">Сумма, $<input class="input" type="number" id="mo-usd" min="1" step="0.5" value="${f1(defUsd, 2)}"></label>
      </div>
      <label class="toggle" style="margin:10px 0"><input type="checkbox" id="mo-po" checked> только своей заявкой (не покупать сразу по чужой цене)</label>
      <div id="mo-sum" style="margin:6px 0 12px;font-size:13.5px"></div>
      <label style="font-size:12.5px;font-weight:600;color:var(--muted)">Пароль управления<input class="input" type="password" id="mo-pw" value="${esc(BOT_PW)}" autocomplete="current-password"></label>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px"><span id="mo-st" class="faint" style="margin-right:auto;align-self:center;font-size:12.5px"></span>
        <button class="chip" id="mo-cancel">Отмена</button><button class="chip active" id="mo-go">Поставить</button></div></div>`;
    const calc = () => {
      const px = parseFloat(box.querySelector("#mo-px").value) / 100, usd = parseFloat(box.querySelector("#mo-usd").value);
      const po = box.querySelector("#mo-po").checked, el = box.querySelector("#mo-sum");
      if (!(px >= 0.01 && px <= 0.99) || !(usd >= 1)) { el.innerHTML = `<span class="bad">цена 1–99 ¢, сумма от $1</span>`; return null; }
      const sh = Math.floor((usd / px) * 100) / 100, cost = sh * px;
      const cross = isNum(sb.ask) && px >= sb.ask - 1e-9;
      el.innerHTML = `Купить <b>${f1(sh, 2)}</b> акций ${team} по <b>${Math.round(100 * px)}¢</b> = <b>${usd2(cost)}</b>. Если ${team} выиграет — получите ${usd2(sh)} (прибыль ${usd2(sh - cost)}).
        ${sh < 5 ? `<div class="bad">меньше 5 акций — Polymarket не примет</div>` : ""}
        ${cross ? (po ? `<div class="bad">цена ≥ цены продавцов (${f1(100 * sb.ask, 0)}¢): «только своей заявкой» — биржа отклонит; снимите галочку, чтобы купить сразу</div>` : `<div class="acc">исполнится сразу по цене продавцов (до ${Math.round(100 * px)}¢)</div>`) : `<div class="faint">заявка ждёт, пока кто-то продаст по ${Math.round(100 * px)}¢; до начала матча не исполненный остаток снимется</div>`}`;
      return { px, usd, sh, cost, po };
    };
    box.querySelectorAll("#mo-px, #mo-usd, #mo-po").forEach((i) => (i.oninput = calc));
    calc();
    box.querySelectorAll("#mo-team button").forEach((b) => (b.onclick = () => { team = b.dataset.t; draw(); }));
    const shut = () => box.remove();
    box.querySelector("#mo-x").onclick = shut; box.querySelector("#mo-cancel").onclick = shut;
    box.querySelector("#mo-go").onclick = async () => {
      const o = calc(); if (!o || o.sh < 5) return;
      if (!confirm(`РЕАЛЬНЫЕ ДЕНЬГИ\n\nКупить ${f1(o.sh, 2)} акций ${team} (${g.home} — ${g.away}) по ${Math.round(100 * o.px)}¢ — всего ${usd2(o.cost)}.\n${o.po ? "Своей лимитной заявкой (ждёт продавца)." : "Может исполниться сразу по цене продавцов."}\n\nПодтверждаете?`)) return;
      const pw = box.querySelector("#mo-pw").value, st = box.querySelector("#mo-st"), go = box.querySelector("#mo-go");
      go.disabled = true; st.textContent = "отправляем роботу…";
      try {
        const r = await botApi("manual", { kind: "купить", game_id: g.game_id, team, price: o.px, usd: o.usd, post_only: o.po }, pw);
        BOT_PW = pw;
        await manualWait(r.id, (t) => (st.textContent = t));
        setTimeout(() => { shut(); done && done(); }, 1500);
      } catch (e) { st.innerHTML = `<span class="bad">${esc(e.message)}</span>`; go.disabled = false; }
    };
  };
  box.onclick = (e) => { if (e.target === box) box.remove(); };
  const esc2 = (e) => { if (e.key === "Escape" && document.body.contains(box)) { box.remove(); document.removeEventListener("keydown", esc2); } };
  document.addEventListener("keydown", esc2);
  draw();
  document.body.appendChild(box);
}

/* ---------- счёт в реальном времени ---------- */
function liveHtml(x) {
  const a = +x.a, h = +x.h, fin = x.state === "final";
  const sc = `<b class="${a > h ? "w" : ""}">${a}</b><span>:</span><b class="${h > a ? "w" : ""}">${h}</b>`;
  return fin
    ? `<div class="lv-s fin" title="итог · ${esc(x.src)}">${sc}</div><div class="lv-p">финал${x.final_note ? " · " + x.final_note : ""}</div>`
    : `<div class="lv-s" title="счёт в реальном времени · ${esc(x.src)}"><i class="lv-dot"></i>${sc}</div><div class="lv-p">${esc([x.period, x.clock].filter(Boolean).join(" · "))}</div>`;
}
async function liveTick() {
  const els = document.querySelectorAll("[data-lv]");
  if (!els.length) return;
  try {
    const d = (await (await fetch(APIP + "live")).json()).games || {};
    els.forEach((el) => {
      const x = d[el.dataset.lv];
      const on = x && x.state !== "pre" && x.a != null;
      el.innerHTML = on ? liveHtml(x) : "";
      el.closest("tr")?.classList.toggle("is-live", !!on && x.state === "live");
    });
  } catch (e) { /* нет связи — покажем в следующий раз */ }
}
setInterval(liveTick, 30000);
