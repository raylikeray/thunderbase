/* Hardwood — views. Every league view takes (L, arg); global views take (arg). */
(function () {
'use strict';
const HW = window.HW;
const { LEAGUES, ORDER, esc, jSoft, todayCT, addDays, compact, expand, ymdOf, dayLabel, relDay, tip, dateShort, ago, pct, sign, ordinal, hx, darkOf, store, API, WEB, logoUrl, seasonYear, favs,
  parseEvent, isLive, isFav, isRanked, interest, scoreboard, standings, rankings, record, aiFor, aiEntry, injuries, forecast, forecastCtx, leaguePlayers, S, allToday } = HW;
const $main = document.getElementById('main');
const href = (L, v) => `#${L.key}${v ? '/' + v : ''}`;

/* ---------- shared render helpers ---------- */
const state = (title, body, err) => `<div class="state${err ? ' err' : ''}"><b>${esc(title)}</b>${body}</div>`;
const skeleton = (n = 6) => `<div class="sheet">${Array.from({ length: n }, (_, i) => `<div class="skel" style="width:${90 - (i % 3) * 18}%"></div>`).join('')}</div>`;
const failMsg = what => state(`Couldn't load ${what}`, `<p>The data feed didn't answer. It usually comes back within a minute; this page retries on its own, or <a href="#" data-act="reload">try again now</a>.</p>`, true);
const rk = s => s.rank ? `<span class="rk">${s.rank}</span>` : '';
const tn = (s, field = 'short') => `${rk(s)}${esc(s[field])}`;
function statusLine(g) {
  const where = [g.venue, g.tv.label].filter(Boolean).join(' · ');
  if (g.state === 'in') return `Live · ${g.detail}${where ? ' · ' + where : ''}`;
  if (g.state === 'pre') return `${relDay(ymdOf(g.date))} · ${tip(g.date)} CT${where ? ' · ' + where : ''}`;
  return `${g.detail || 'Final'} · ${dateShort(g.date)}${g.venue ? ' · ' + g.venue : ''}`;
}
function fbar(L, g, f, opts = {}) {
  const pa = 1 - f.pHome, ph = f.pHome;
  const fav = ph >= 0.5 ? g.home : g.away; const p = Math.max(ph, pa);
  const label = g.state === 'post' ? `Final · ${esc((g.home.score > g.away.score ? g.home : g.away).short)} won` : `${f.live ? 'Live forecast' : 'Forecast'} · ${esc(fav.abbr)} ${pct(p)}`;
  const bits = [];
  if (g.state !== 'post') {
    if (f.live) bits.push(`pregame ${esc(g.home.abbr)} ${sign(f.margin)}`);
    else { const gap = f.H.rating - f.A.rating; bits.push(`${esc((gap >= 0 ? g.home : g.away).abbr)} rating edge +${Math.abs(gap).toFixed(1)}`); if (f.hca) bits.push(`${esc(g.home.abbr)} home +${f.hca}`); if (f.restH || f.restA) bits.push(`rest ${sign(f.restH - f.restA)}`); if (f.soH) bits.push(`${esc(g.home.abbr)} ${f.soH.names.length > 1 ? f.soH.names.length + ' out' : esc(f.soH.name) + ' out'} ${sign(f.soH.pts)}`); if (f.soA) bits.push(`${esc(g.away.abbr)} ${f.soA.names.length > 1 ? f.soA.names.length + ' out' : esc(f.soA.name) + ' out'} ${sign(f.soA.pts)}`); }
  }
  return `<div class="fbar-l"><span>${label}</span><span>${bits.join(' · ')}</span></div><div class="fbar" role="img" aria-label="${esc(g.away.abbr)} ${pct(pa)}, ${esc(g.home.abbr)} ${pct(ph)}"><i style="width:${pa * 100}%;background:${opts.awayColor || 'var(--gold)'}"></i><i style="width:${ph * 100}%;background:${opts.homeColor || '#ffffff'};opacity:.9"></i></div>`;
}
function aiBlock(ai, open, id) {
  if (!ai) return '';
  const keys = (ai.keys || []).map(k => `<li>${esc(k)}</li>`).join('');
  return `<div class="ai" id="ai-${id}" ${open ? '' : 'hidden'}><h4>AI read <small>Claude · ${esc(ai.generatedLabel || 'this morning')} · an opinion with reasons, not a prediction to bet on</small></h4>${ai.headline ? `<p><b>${esc(ai.headline)}</b></p>` : ''}<p>${esc(ai.read || '')}</p>${keys ? `<ul>${keys}</ul>` : ''}${ai.pick ? `<p class="meta" style="margin-top:8px">Lean: ${esc(ai.pick)}${ai.confidence ? ' · ' + esc(ai.confidence) + ' confidence' : ''}</p>` : ''}</div>`;
}
function leadersOf(side) {
  const pick = n => { const L1 = side.leaders.find(x => new RegExp(n, 'i').test(x.name)); const a = L1 && L1.leaders && L1.leaders[0]; return a ? { v: a.displayValue, name: a.athlete && (a.athlete.shortName || a.athlete.displayName), id: a.athlete && a.athlete.id } : null; };
  return { pts: pick('points'), reb: pick('rebounds'), ast: pick('assists') };
}
function keyBlock(L, g, f, ai, opts = {}) {
  const live = isLive(g), pre = g.state === 'pre';
  const homeId = L.home; const mine = homeId && (g.home.id === homeId || g.away.id === homeId);
  const favSide = favs.has(L.key, g.home.id) ? g.home : favs.has(L.key, g.away.id) ? g.away : null;
  const title = favSide ? `${esc(favSide.short)} ${favSide === g.home ? 'vs' : 'at'} ${tn(favSide === g.home ? g.away : g.home)}` : `${tn(g.away)} at ${tn(g.home)}`;
  const side = (s, cls) => `<div class="key-side"><img class="key-logo" src="${esc(s.logo)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><div class="key-n ${cls}${pre ? ' pre' : ''}">${pre ? esc(s.abbr) : esc(s.score ?? '–')}</div><div class="key-l">${rk(s)}${esc(s.short)}${s.rec ? ` · <span class="nw">${esc(s.rec)}</span>` : ''}</div></div>`;
  const awayCls = favSide === g.away ? '' : 'away', homeCls = favSide === g.home ? '' : (favSide === g.away ? 'away' : '');
  const mid = pre ? `<div class="key-mid">@<small>${esc(tip(g.date))} CT</small></div>` : `<div class="key-mid">–<small>${esc(live ? g.detail : (g.detail || 'Final'))}</small></div>`;
  const badge = live ? `<span class="key-badge live">Live</span>` : opts.badge ? `<span class="key-badge">${esc(opts.badge)}</span>` : '';
  const open = S.open.has('ai-' + g.id);
  const tc = favSide && !mine ? darkOf(favSide.color, favSide.alt) : null;
  return `<article class="key${tc ? ' team' : ''}" ${tc ? `style="--tc:${tc}"` : ''} aria-label="${esc(g.away.name)} at ${esc(g.home.name)}">
    <div class="key-top"><div><h2><a href="${href(L, 'game-' + g.id)}">${title}</a></h2><div class="key-sub">${opts.leagueTag ? esc(L.short) + ' · ' : ''}${esc(statusLine(g))}${g.note ? ' · ' + esc(g.note) : ''}</div></div>${badge}</div>
    <div class="key-score">${side(g.away, awayCls)}${mid}${side(g.home, homeCls)}</div>
    <div class="key-foot"><div>${f ? fbar(L, g, f) : ''}</div><div style="display:flex;gap:8px;flex-wrap:wrap">${opts.noBox ? '' : `<a class="btn sm" href="${href(L, 'game-' + g.id)}">${pre ? 'Preview' : 'Box score'}</a>`}${ai ? `<button class="btn sm" data-act="ai" data-id="${g.id}" aria-expanded="${open}" aria-controls="ai-${g.id}">${open ? 'Hide AI read' : 'AI read'}</button>` : ''}</div></div>
    ${aiBlock(ai, open, g.id)}
  </article>`;
}
function fcRow(L, g, f, ai, opts = {}) {
  const ph = f.pHome, pa = 1 - ph;
  const open = S.open.has('fc-' + g.id);
  const src = f.source === 'elo' ? 'Elo rating' : 'point margin (early-season fallback)';
  const detail = `<div class="fc-detail" id="fcd-${g.id}" ${open ? '' : 'hidden'}>${ai ? `<p><b>AI read${ai.headline ? ': ' + esc(ai.headline) : ''}</b></p><p>${esc(ai.read)}</p>${(ai.keys || []).length ? `<ul style="margin:0 0 8px;padding-left:18px">${ai.keys.map(k => `<li>${esc(k)}</li>`).join('')}</ul>` : ''}` : ''}
    <div class="inputs">
      <div><b>${sign(f.margin)}</b>${esc(g.home.abbr)} projected margin</div>
      <div><b>${sign(f.H.rating)}</b>${esc(g.home.abbr)} ${src}${f.H.gp ? ` · ${f.H.gp} GP` : ''}</div>
      <div><b>${sign(f.A.rating)}</b>${esc(g.away.abbr)} ${src}${f.A.gp ? ` · ${f.A.gp} GP` : ''}</div>
      <div><b>${f.hca ? '+' + f.hca : '0'}</b>${g.neutral ? 'neutral site' : 'home court'}</div>
      <div><b>${f.restH || f.restA ? sign(f.restH - f.restA) : '0.0'}</b>rest (${[f.restH ? g.home.abbr + ' played yesterday' : '', f.restA ? g.away.abbr + ' played yesterday' : ''].filter(Boolean).join(', ') || 'both rested'})</div>
      ${f.soH ? `<div><b>${sign(f.soH.pts)}</b>${esc(g.home.abbr)} out: ${esc(f.soH.name)}</div>` : ''}${f.soA ? `<div><b>${sign(-f.soA.pts)}</b>${esc(g.away.abbr)} out: ${esc(f.soA.name)}</div>` : ''}
      ${f.source !== 'elo' && (f.H.form || f.A.form) ? `<div><b>${sign(f.H.form - f.A.form)}</b>last-10 form edge</div>` : ''}
    </div></div>`;
  return `<div class="fc${isFav(g) ? ' fav' : ''}">
    <div class="fc-teams"><a href="${href(L, 'game-' + g.id)}">${tn(g.away)} at ${tn(g.home)}</a><small>${opts.leagueTag ? esc(L.short) + ' · ' : ''}${g.state === 'in' ? 'Live · ' + esc(g.detail) : g.state === 'post' ? esc(g.detail) + ` · ${g.away.score}–${g.home.score}` : esc(tip(g.date)) + ' CT' + (g.tv.label ? ' · ' + esc(g.tv.label) : '')}</small></div>
    <div class="fc-mid"><div class="fc-bar" role="img" aria-label="${esc(g.away.abbr)} ${pct(pa)}, ${esc(g.home.abbr)} ${pct(ph)}"><i style="width:${pa * 100}%;background:${g.away.color}"></i><i style="width:${ph * 100}%;background:${g.home.color}"></i></div><div class="fc-pct"><span>${esc(g.away.abbr)} ${pct(pa)}</span><span>${esc(g.home.abbr)} ${pct(ph)}</span></div></div>
    <div class="fc-act"><button class="btn sm ghost" data-act="fc" data-id="${g.id}"${ai ? ' data-ai="1"' : ''} aria-expanded="${open}" aria-controls="fcd-${g.id}">${open ? 'Hide' : ai ? 'AI read' : 'Why'}</button></div>
    ${detail}
  </div>`;
}
function standingsMini(L, cur, groupMatch, n = 10, title) {
  const grp = cur.groups.find(c => groupMatch ? (c.name || '').includes(groupMatch) : true) || cur.groups[0];
  if (!grp) return '';
  const cuts = L.playoffLine || [];
  const rows = grp.rows.slice(0, n).map((r, i) => `<tr class="click${favs.has(L.key, r.id) ? ' okc' : ''}${cuts.includes(i + 1) ? ' cut' : ''}" data-href="${href(L, 'team-' + r.id)}"><td><span class="team"><span class="rank">${i + 1}</span><a href="${href(L, 'team-' + r.id)}">${esc(r.short || r.name)}</a></span></td><td>${r.w}</td><td>${r.l}</td><td>${esc(r.gb || r.conf || '')}</td><td>${esc(r.strk)}</td></tr>`).join('');
  return `<section class="sheet"><div class="sheet-h"><h2>${esc(title || grp.name.replace(' Conference', ''))}</h2><a class="more" href="${href(L, 'standings')}">Full standings</a></div><div class="tw"><table class="t"><thead><tr><th>Team</th><th>W</th><th>L</th><th>${L.standingsMode === 'conferences' ? 'Conf' : 'GB'}</th><th>Strk</th></tr></thead><tbody>${rows}</tbody></table></div>${L.key === 'nba' ? '<p class="note">Top 6 make the playoffs; 7–10 go to the play-in.</p>' : ''}</section>`;
}
function rankMini(L, R, n = 10) {
  if (!R) return '';
  return `<section class="sheet"><div class="sheet-h"><h2>${esc(L.label)} Top ${n}</h2><a class="more" href="${href(L, 'rankings')}">${esc(R.name)}</a></div><div class="tw"><table class="t"><tbody>${R.ranks.slice(0, n).map(r => `<tr class="click${favs.has(L.key, r.team.id) ? ' okc' : ''}" data-href="${href(L, 'team-' + r.team.id)}"><td><span class="team"><span class="rank">${r.rank}</span><img class="headshot sq" src="${esc(r.team.logo || '')}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><a href="${href(L, 'team-' + r.team.id)}">${esc(r.team.short)}</a></span></td><td>${esc(r.rec || '')}</td><td class="muted">${r.trend === '-' || !r.trend ? '' : esc(r.trend)}</td></tr>`).join('')}</tbody></table></div></section>`;
}
function injPill(status) {
  const s = (status || '').toLowerCase();
  const cls = s.includes('out') || s.includes('suspen') ? 'out' : s.includes('day') || s.includes('question') || s.includes('doubt') ? 'dtd' : s.includes('prob') ? 'prob' : '';
  return `<span class="pill ${cls}">${esc(/day-to-day/i.test(status) ? 'DTD' : status || '—')}</span>`;
}
function injItem(x, teamLabel, L) {
  const ret = x.details && x.details.returnDate ? ` · ESPN est. return ${esc(dateShort(x.details.returnDate))}` : '';
  return `<div class="wire-item">${injPill(x.status)}<span><a href="${href(L, 'player-' + esc(x.athlete && x.athlete.id || ''))}"><b>${esc(x.athlete && x.athlete.displayName)}</b></a> <span class="muted">· ${esc(teamLabel)}${x.details && x.details.type ? ' · ' + esc(x.details.type) : ''}${ret}</span><br><span class="muted">${esc((x.shortComment || '').slice(0, 160))}${(x.shortComment || '').length > 160 ? '…' : ''}</span></span></div>`;
}
function tileHTML(g, showLeague) {
  const L = LEAGUES[g.lk];
  const st = g.state === 'in' ? `<span>Live · ${esc(g.detail)}</span>` : g.state === 'pre' ? `<span>${esc(tip(g.date))} CT</span>` : `<span>${esc(g.detail || 'Final')}</span>`;
  const row = (s, other) => { const lose = g.state === 'post' && s.score != null && other.score != null && s.score < other.score; return `<div class="tile-row${lose ? ' lose' : ''}" data-k="${g.id}-${s.id}"><span class="tile-tm"><i class="sw" style="background:${s.color}"></i>${rk(s)}${esc(s.abbr)} <small>${esc(s.rec)}</small></span><span class="tile-sc">${g.state === 'pre' ? '' : esc(s.score ?? '')}</span></div>`; };
  return `<a class="tile${isFav(g) ? ' okc' : ''}" href="${href(L, 'game-' + g.id)}" aria-label="${esc(g.away.name)} at ${esc(g.home.name)}, ${esc(g.detail)}"><div class="tile-st${isLive(g) ? ' live' : ''}">${st}<span class="tv">${showLeague ? esc(L.short) : esc(g.tv.label)}</span></div>${row(g.away, g.home)}${row(g.home, g.away)}</a>`;
}
const pagehead = (h1, p, right = '') => `<div class="pagehead"><div><h1>${h1}</h1>${p ? `<p>${p}</p>` : ''}</div>${right}</div>`;
const leagueSwitch = (L, view) => `<div class="tabs" role="tablist" aria-label="League">${ORDER.map(k => `<a class="tab" role="tab" aria-selected="${k === L.key}" href="#${k}${view ? '/' + view : ''}">${esc(LEAGUES[k].label)}</a>`).join('')}</div>`;

/* ================= HOME (all leagues) ================= */
async function home() {
  $main.innerHTML = `<div class="grid"><div class="col">${skeleton(5)}${skeleton(6)}</div><div class="col">${skeleton(8)}${skeleton(6)}</div></div>`;
  const ymd = todayCT();
  const F = favs.all();
  // favorites: today's game, else next game from the team schedule
  const favGames = [];
  const seen = new Set();
  for (const lk of ORDER) for (const id of F[lk] || []) {
    const L = LEAGUES[lk];
    let g = S.today[lk].find(x => x.home.id === id || x.away.id === id);
    let badge = 'Tonight';
    if (!g) {
      const sch = await jSoft(`${API(L)}/teams/${id}/schedule`, 900000);
      const evs = (sch && sch.events || []).map(e => parseEvent(e, L));
      const next = evs.find(x => x.state !== 'post'); const last = [...evs].reverse().find(x => x.state === 'post');
      g = next || last; if (!g) continue;
      badge = next ? (relDay(ymdOf(next.date)) === 'Tomorrow' ? 'Tomorrow' : dayLabel(ymdOf(next.date), { weekday: 'short', month: 'short', day: 'numeric' })) : 'Last game';
      if (!next && sch && sch.team) g.teamName = sch.team.displayName;
    }
    if (seen.has(lk + g.id)) continue; seen.add(lk + g.id);
    favGames.push({ L, g, badge, id });
  }
  const ctxs = {}; const getCtx = async (L, d) => { const k = L.key + d; if (!ctxs[k]) ctxs[k] = await forecastCtx(L, d); return ctxs[k]; };
  const ai = await aiFor(ymd);
  const [nbaSt, mR, wR, news] = await Promise.all([standings(LEAGUES.nba).catch(() => null), rankings(LEAGUES.ncaam), rankings(LEAGUES.ncaaw), jSoft(`${API(LEAGUES.nba)}/news?limit=8`, 600000)]);
  const render = async () => {
    const left = [];
    // the home team's block first, then other favorites as compact rows
    const lead = favGames.find(x => x.id === LEAGUES.nba.home) || favGames[0];
    if (lead) { const d = ymdOf(lead.g.date); const live = S.today[lead.L.key].find(x => x.id === lead.g.id) || lead.g; left.push(keyBlock(lead.L, live, forecast(lead.L, live, await getCtx(lead.L, d)), aiEntry(d === ymd ? ai : await aiFor(d), live), { badge: lead.badge, leagueTag: true })); }
    const others = favGames.filter(x => x !== lead);
    if (others.length) {
      const rows = [];
      for (const x of others) { const d = ymdOf(x.g.date); const live = S.today[x.L.key].find(y => y.id === x.g.id) || x.g; rows.push(fcRow(x.L, live, forecast(x.L, live, await getCtx(x.L, d)), aiEntry(d === ymd ? ai : null, live), { leagueTag: true }).replace('<small>', `<small>${esc(x.badge)} · `)); }
      left.push(`<section class="sheet"><div class="sheet-h"><h2>Your teams</h2><small>tap a team page's star to change these</small></div><div class="fc-list">${rows.join('')}</div></section>`);
    }
    // each league's slate, by interest
    for (const lk of ORDER) {
      const L = LEAGUES[lk]; const games = S.today[lk]; if (!games.length) continue;
      const ctx = await getCtx(L, ymd);
      const sorted = [...games].sort((a, b) => (a.state === 'post') - (b.state === 'post') || interest(b) - interest(a) || new Date(a.date) - new Date(b.date));
      const show = sorted.slice(0, lk === 'nba' ? 15 : 8);
      const live = games.filter(isLive).length, fin = games.filter(g => g.state === 'post').length;
      left.push(`<section class="sheet"><div class="sheet-h"><h2>${esc(L.label)} tonight</h2><a class="more" href="${href(L)}">${games.length} game${games.length > 1 ? 's' : ''}${live ? ` · ${live} live` : ''}${fin ? ` · ${fin} final` : ''} →</a></div><div class="fc-list">${show.map(g => fcRow(L, g, forecast(L, g, ctx), aiEntry(ai, g))).join('')}</div>${games.length > show.length ? `<p class="note"><a href="${href(L)}">All ${games.length} ${esc(L.noun)} games today →</a></p>` : ''}</section>`);
    }
    if (!allToday().length) left.push(state('No games today', `<p>Off day across basketball. Upcoming games and their forecasts are on each league's Forecasts page.</p>`));
    const right = [];
    if (nbaSt) right.push(standingsMini(LEAGUES.nba, nbaSt, 'West'));
    if (wR) right.push(rankMini(LEAGUES.ncaaw, wR, 10));
    if (mR) right.push(rankMini(LEAGUES.ncaam, mR, 10));
    if (news && news.articles) right.push(`<section class="sheet"><div class="sheet-h"><h2>Latest</h2><a class="more" href="#nba/wire">The wire</a></div>${news.articles.slice(0, 6).map(a => `<div class="wire-item"><span class="pill trade">${esc(ago(a.published))}</span><a href="${esc(a.links && a.links.web && a.links.web.href || '#')}" target="_blank" rel="noopener">${esc(a.headline)}</a></div>`).join('')}</section>`);
    $main.innerHTML = `<div class="grid"><div class="col">${left.join('')}</div><div class="col">${right.join('')}</div></div>`;
  };
  await render();
  return { live: render };
}

/* ================= LEAGUE: TONIGHT ================= */
async function tonight(L) {
  $main.innerHTML = leagueSwitch(L) + `<div class="grid"><div class="col">${skeleton(5)}${skeleton(4)}</div><div class="col">${skeleton(8)}${skeleton(5)}</div></div>`;
  const ymd = todayCT();
  const [ctx, ai, inj, news, R] = await Promise.all([forecastCtx(L, ymd), aiFor(ymd), injuries(L), jSoft(`${API(L)}/news?limit=12`, 600000), rankings(L)]);
  const F = favs.all()[L.key] || [];
  let lead = S.today[L.key].find(isFav), badge = 'Tonight', leadAi = null, leadCtx = ctx;
  if (!lead && F.length) {
    for (const id of F) {
      const sch = await jSoft(`${API(L)}/teams/${id}/schedule`, 900000);
      const evs = (sch && sch.events || []).map(e => parseEvent(e, L));
      const next = evs.find(g => g.state !== 'post'); const last = [...evs].reverse().find(g => g.state === 'post');
      if (next || last) { lead = next || last; badge = next ? (relDay(ymdOf(next.date)) === 'Tomorrow' ? 'Tomorrow' : 'Next game') : 'Last game'; if (next) { const nd = ymdOf(next.date); leadAi = aiEntry(await aiFor(nd), next); leadCtx = await forecastCtx(L, nd); } break; }
    }
  } else if (lead) leadAi = aiEntry(ai, lead);
  if (!lead && S.today[L.key].length) { lead = [...S.today[L.key]].sort((a, b) => interest(b) - interest(a))[0]; badge = 'Game of the night'; leadAi = aiEntry(ai, lead); }
  const render = () => {
    const games = S.today[L.key];
    const parts = [];
    if (lead) { const live = games.find(x => x.id === lead.id) || lead; parts.push(keyBlock(L, live, forecast(L, live, leadCtx), leadAi, { badge })); }
    const upcoming = [...games.filter(g => g.state !== 'post')].sort((a, b) => interest(b) - interest(a) || new Date(a.date) - new Date(b.date));
    const finals = games.filter(g => g.state === 'post');
    if (upcoming.length) parts.push(`<section class="sheet"><div class="sheet-h"><h2>Tonight's forecasts</h2><a class="more" href="${href(L, 'forecasts')}">Next 7 days</a></div><div class="fc-list">${upcoming.slice(0, 30).map(g => fcRow(L, g, forecast(L, g, ctx), aiEntry(ai, g))).join('')}</div>${upcoming.length > 30 ? `<p class="note"><a href="${href(L, 'games')}">All ${games.length} games →</a></p>` : ''}</section>`);
    if (finals.length) parts.push(`<section class="sheet"><div class="sheet-h"><h2>Finals</h2><small>tap for box score</small></div><div class="tw"><table class="t"><tbody>${finals.sort((a, b) => interest(b) - interest(a)).slice(0, 40).map(g => { const w = g.home.score > g.away.score ? g.home : g.away; const Ld = leadersOf(w).pts; return `<tr class="click${isFav(g) ? ' okc' : ''}" data-href="${href(L, 'game-' + g.id)}"><td><a href="${href(L, 'game-' + g.id)}">${tn(g.away, 'abbr')} ${g.away.score} · ${tn(g.home, 'abbr')} ${g.home.score}</a></td><td class="l muted">${Ld ? esc(Ld.name) + ' ' + esc(Ld.v) + ' pts' : ''}</td><td>${esc(g.detail)}</td></tr>`; }).join('')}</tbody></table></div>${finals.length > 40 ? `<p class="note"><a href="${href(L, 'games')}">All ${finals.length} finals →</a></p>` : ''}</section>`);
    if (!games.length) parts.push(state(`No ${L.noun} games today`, `<p>${L.key === 'wnba' ? 'The WNBA is in its off-season; the schedule returns in May.' : 'Upcoming games and forecasts are on the <a href="' + href(L, 'forecasts') + '">Forecasts</a> page.'}</p>`));
    const right = [];
    if (R) right.push(rankMini(L, R, 10));
    if (ctx.cur) right.push(standingsMini(L, ctx.cur, L.key === 'nba' ? 'West' : null, 10));
    if (inj) {
      const playing = new Set(games.flatMap(g => [g.home.id, g.away.id])); F.forEach(id => playing.add(id));
      const items = [];
      Object.entries(inj.byTeam).filter(([id]) => playing.has(id)).sort(([a], [b]) => F.includes(b) - F.includes(a)).forEach(([, t]) => t.list.forEach(x => items.push({ team: t.name, x })));
      right.push(`<section class="sheet"><div class="sheet-h"><h2>Injury report</h2><a class="more" href="${href(L, 'wire-injuries')}">All teams</a></div>${items.length ? items.slice(0, 10).map(({ team, x }) => injItem(x, team.split(' ').pop(), L)).join('') : '<p class="muted">No injuries listed for tonight\'s teams.</p>'}</section>`);
    }
    if (news && news.articles) right.push(`<section class="sheet"><div class="sheet-h"><h2>Latest</h2><a class="more" href="${href(L, 'wire')}">The wire</a></div>${news.articles.slice(0, 6).map(a => `<div class="wire-item"><span class="pill trade">${esc(ago(a.published))}</span><a href="${esc(a.links && a.links.web && a.links.web.href || '#')}" target="_blank" rel="noopener">${esc(a.headline)}</a></div>`).join('')}</section>`);
    $main.innerHTML = leagueSwitch(L) + `<div class="grid"><div class="col">${parts.join('')}</div><div class="col">${right.join('')}</div></div>`;
  };
  render();
  return { live: async () => render() };
}

/* ================= GAMES (by date) ================= */
async function games(L, arg) {
  const ymd = arg && /^\d{8}$/.test(arg) ? expand(arg) : todayCT();
  const head = pagehead(esc(relDay(ymd)), esc(dayLabel(ymd, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })) + ' · ' + esc(L.label),
    `<div class="datenav"><a class="btn sm" href="${href(L, 'games-' + compact(addDays(ymd, -1)))}" aria-label="Previous day">‹</a><a class="btn sm ghost" href="${href(L, 'games')}">Today</a><input class="inp" type="date" id="gameDate" value="${ymd}" aria-label="Pick a date" style="flex:0 1 auto"><a class="btn sm" href="${href(L, 'games-' + compact(addDays(ymd, 1)))}" aria-label="Next day">›</a></div>`);
  const bind = () => { const el = document.getElementById('gameDate'); el && el.addEventListener('change', e => { if (e.target.value) location.hash = `${L.key}/games-` + compact(e.target.value); }); };
  $main.innerHTML = leagueSwitch(L, 'games') + head + skeleton(6); bind();
  const render = async (ttl) => {
    let list;
    try { list = ymd === todayCT() && ttl === undefined ? S.today[L.key] : await scoreboard(L, ymd, ttl); } catch { $main.innerHTML = leagueSwitch(L, 'games') + head + failMsg('games'); bind(); return; }
    if (!list.length) { $main.innerHTML = leagueSwitch(L, 'games') + head + state('No games', `<p>No ${esc(L.noun)} games on this date.</p>`); bind(); return; }
    const [ctx, ai] = await Promise.all([forecastCtx(L, ymd), aiFor(ymd)]);
    const sorted = [...list].sort((a, b) => (a.state === 'post') - (b.state === 'post') || interest(b) - interest(a) || new Date(a.date) - new Date(b.date));
    const card = g => {
      const per = Math.max(g.home.lines.length, g.away.lines.length, L.minutes === 48 ? 4 : 2);
      const reg = L.minutes === 48 ? 4 : 2;
      const hdr = Array.from({ length: per }, (_, i) => `<th>${i < reg ? i + 1 : 'OT' + (per > reg + 1 ? i - reg + 1 : '')}</th>`).join('');
      const row = s => `<tr><td><span class="team"><i class="sw" style="background:${s.color}"></i><a href="${href(L, 'team-' + s.id)}">${tn(s, 'abbr')}</a> <span class="muted" style="font-weight:500">${esc(s.rec)}</span></span></td>${Array.from({ length: per }, (_, i) => `<td>${esc(s.lines[i] ?? '')}</td>`).join('')}<td><b>${g.state === 'pre' ? '' : esc(s.score ?? '')}</b></td></tr>`;
      const ld = s => { const Ld = leadersOf(s); return [Ld.pts && `${esc(Ld.pts.name)} ${esc(Ld.pts.v)} pts`, Ld.reb && `${esc(Ld.reb.name)} ${esc(Ld.reb.v)} reb`, Ld.ast && `${esc(Ld.ast.name)} ${esc(Ld.ast.v)} ast`].filter(Boolean).join(' · '); };
      const f = forecast(L, g, ctx);
      return `<section class="sheet${isFav(g) ? ' favsheet' : ''}"><div class="sheet-h"><h3><a href="${href(L, 'game-' + g.id)}" style="text-decoration:none">${tn(g.away)} at ${tn(g.home)}</a></h3><small${isLive(g) ? ' style="color:var(--live)"' : ''}>${g.state === 'pre' ? esc(tip(g.date)) + ' CT' : esc(g.detail)}${g.tv.label ? ' · ' + esc(g.tv.label) : ''}</small></div>
        <div class="tw"><table class="t lines"><thead><tr><th>Team</th>${hdr}<th>T</th></tr></thead><tbody>${row(g.away)}${row(g.home)}</tbody></table></div>
        ${g.state !== 'pre' ? `<p class="note" style="margin-top:8px"><b>${esc(g.away.abbr)}:</b> ${ld(g.away) || '—'}<br><b>${esc(g.home.abbr)}:</b> ${ld(g.home) || '—'}</p>` : `<p class="note" style="margin-top:8px">Forecast: ${esc((f.pHome >= .5 ? g.home : g.away).abbr)} ${pct(Math.max(f.pHome, 1 - f.pHome))}${aiEntry(ai, g) ? ' · AI read available' : ''}${g.venue ? ' · ' + esc(g.venue) : ''}${g.note ? ' · ' + esc(g.note) : ''}</p>`}
        <div style="margin-top:10px"><a class="btn sm ghost" href="${href(L, 'game-' + g.id)}">${g.state === 'pre' ? 'Preview' : 'Box score'}</a></div></section>`;
    };
    $main.innerHTML = leagueSwitch(L, 'games') + head + `<p class="note" style="margin:-6px 0 12px">${list.length} game${list.length > 1 ? 's' : ''}${L.hasRankings ? ' · favorites and ranked matchups first' : ''}</p><div class="duo">${sorted.map(card).join('')}</div>`;
    bind();
  };
  await render();
  return ymd === todayCT() ? { live: () => render() } : null;
}

/* ================= GAME DETAIL ================= */
async function game(L, id) {
  $main.innerHTML = `<div class="grid"><div class="col">${skeleton(4)}${skeleton(10)}</div><div class="col">${skeleton(6)}</div></div>`;
  let data;
  const load = async (ttl) => { data = await HW.j(`${API(L)}/summary?event=${encodeURIComponent(id)}`, ttl); };
  try { await load(20000); } catch { $main.innerHTML = failMsg('this game'); return; }
  let ctx = null, ai = null;
  const render = async () => {
    const d = data;
    const hc = d.header && d.header.competitions && d.header.competitions[0];
    if (!hc) { $main.innerHTML = state('Game not found', '<p>That game ID didn\'t return anything.</p>', true); return; }
    const ev = { id, competitions: [{ ...hc, venue: d.gameInfo && d.gameInfo.venue, status: hc.status, broadcasts: hc.broadcasts, geoBroadcasts: hc.geoBroadcasts }], date: hc.date, status: hc.status, season: d.header.season };
    const g = parseEvent(ev, L);
    const ymd = ymdOf(g.date);
    if (!ctx) ctx = await forecastCtx(L, ymd);
    if (ai === null) ai = aiEntry(await aiFor(ymd), g) || false;
    const f = forecast(L, g, ctx);
    const wp = (d.winprobability || []).filter(x => x.homeWinPercentage != null);
    const bpi = d.predictor && d.predictor.homeTeam && d.predictor.homeTeam.gameProjection != null ? parseFloat(d.predictor.homeTeam.gameProjection) / 100 : null;
    const espnLine = g.state === 'in' && wp.length ? `ESPN live win prob: ${esc(g.home.abbr)} ${pct(wp[wp.length - 1].homeWinPercentage)}` : g.state === 'pre' && bpi != null ? `ESPN BPI: ${esc(g.home.abbr)} ${pct(bpi)}` : '';
    const out = [keyBlock(L, g, f, ai || null, { noBox: true })];
    if (espnLine) out.push(`<p class="note cmpline">${espnLine} · Hardwood model ${esc(g.home.abbr)} ${pct(f.pHome)} · <a href="#record">how we've done</a></p>`);
    // linescore
    const per = Math.max(g.home.lines.length, g.away.lines.length); const reg = L.minutes === 48 ? 4 : 2;
    if (per) {
      const hdr = Array.from({ length: per }, (_, i) => `<th>${i < reg ? (reg === 4 ? 'Q' : 'H') + (i + 1) : 'OT' + (per > reg + 1 ? i - reg + 1 : '')}</th>`).join('');
      const row = s => `<tr><td class="l"><span class="team"><i class="sw" style="background:${s.color}"></i><a href="${href(L, 'team-' + s.id)}">${tn(s)}</a></span></td>${Array.from({ length: per }, (_, i) => `<td>${esc(s.lines[i] ?? '')}</td>`).join('')}<td><b>${esc(s.score ?? '')}</b></td></tr>`;
      out.push(`<section class="sheet"><div class="sheet-h"><h2>Scoring</h2><small>${esc(d.gameInfo && d.gameInfo.attendance ? d.gameInfo.attendance.toLocaleString() + ' attendance' : '')}</small></div><div class="tw"><table class="t lines"><thead><tr><th>Team</th>${hdr}<th>T</th></tr></thead><tbody>${row(g.away)}${row(g.home)}</tbody></table></div></section>`);
    }
    // box scores
    const bx = d.boxscore && d.boxscore.players || [];
    const boxFor = side => {
      const p = bx.find(x => String(x.team.id) === side.id); if (!p || !p.statistics || !p.statistics[0]) return '';
      const s = p.statistics[0]; const labels = s.labels || s.names || []; const ath = s.athletes || [];
      const rowOf = a => {
        const nm = `<a href="${href(L, 'player-' + esc(a.athlete.id))}">${esc(a.athlete.shortName || a.athlete.displayName)}</a> <span class="muted" style="font-weight:500">${esc(a.athlete.position && a.athlete.position.abbreviation || '')}</span>`;
        if (a.didNotPlay || !a.stats || !a.stats.length) return `<tr><td>${nm}</td><td class="dnp" colspan="${labels.length}">${esc(a.reason || 'Did not play')}</td></tr>`;
        return `<tr><td>${nm}</td>${a.stats.map(v => `<td>${esc(v)}</td>`).join('')}</tr>`;
      };
      const st = ath.filter(a => a.starter), bn = ath.filter(a => !a.starter);
      const tot = s.totals && s.totals.length ? `<tr class="tot"><td>Team</td>${s.totals.map(v => `<td>${esc(v)}</td>`).join('')}</tr>` : '';
      return `<section class="sheet"><div class="sheet-h"><h2>${tn(side)}</h2><small>box score</small></div><div class="tw"><table class="t box"><thead><tr><th>Player</th>${labels.map(l => `<th>${esc(l)}</th>`).join('')}</tr></thead><tbody>${st.length ? `<tr class="sub"><td colspan="${labels.length + 1}">Starters</td></tr>` + st.map(rowOf).join('') : ''}${bn.length ? `<tr class="sub"><td colspan="${labels.length + 1}">Bench</td></tr>` + bn.map(rowOf).join('') : ''}${tot}</tbody></table></div></section>`;
    };
    const boxes = [boxFor(g.away), boxFor(g.home)].filter(Boolean);
    // team stats + four factors
    const tms = d.boxscore && d.boxscore.teams || [];
    const ta = tms.find(t => String(t.team.id) === g.away.id), th = tms.find(t => String(t.team.id) === g.home.id);
    let compare = '', factors = '';
    if (ta && th && g.state !== 'pre') {
      const get = (t, n) => (t.statistics || []).find(x => x.name === n);
      const num = (t, n, part = 0) => { const x = get(t, n); if (!x) return null; const v = String(x.displayValue).split('-')[part]; return parseFloat(v); };
      const want = ['fieldGoalsMade-fieldGoalsAttempted', 'fieldGoalPct', 'threePointFieldGoalsMade-threePointFieldGoalsAttempted', 'threePointFieldGoalPct', 'freeThrowsMade-freeThrowsAttempted', 'totalRebounds', 'offensiveRebounds', 'assists', 'steals', 'blocks', 'turnovers', 'pointsInPaint', 'fastBreakPoints', 'largestLead'];
      const rows = want.map(n => { const a = get(ta, n), h = get(th, n); if (!a || !h) return ''; const av = parseFloat(String(a.displayValue).split('-')[0]) || 0, hv = parseFloat(String(h.displayValue).split('-')[0]) || 0; const tot = av + hv || 1; const lowGood = n === 'turnovers';
        return `<div class="cmp-row"><span>${esc(a.displayValue)}</span><div class="cmp-mid"><small>${esc(a.label || a.abbreviation || n)}</small><div class="cmp-bar"><i style="width:${av / tot * 100}%;background:${g.away.color};opacity:${(lowGood ? av <= hv : av >= hv) ? 1 : .45}"></i><i style="width:${hv / tot * 100}%;background:${g.home.color};opacity:${(lowGood ? hv <= av : hv >= av) ? 1 : .45}"></i></div></div><span>${esc(h.displayValue)}</span></div>`; }).join('');
      if (rows) compare = `<section class="sheet"><div class="sheet-h"><h2>Team stats</h2><small>${esc(g.away.abbr)} · ${esc(g.home.abbr)}</small></div><div class="compare">${rows}</div></section>`;
      const ff = (t, o, s, os) => {
        const fgm = num(t, 'fieldGoalsMade-fieldGoalsAttempted', 0), fga = num(t, 'fieldGoalsMade-fieldGoalsAttempted', 1), tpm = num(t, 'threePointFieldGoalsMade-threePointFieldGoalsAttempted', 0), ftm = num(t, 'freeThrowsMade-freeThrowsAttempted', 0), fta = num(t, 'freeThrowsMade-freeThrowsAttempted', 1), orb = num(t, 'offensiveRebounds'), tov = num(t, 'turnovers'), odrb = num(o, 'defensiveRebounds'), oorb = num(o, 'offensiveRebounds'), ofga = num(o, 'fieldGoalsMade-fieldGoalsAttempted', 1), ofta = num(o, 'freeThrowsMade-freeThrowsAttempted', 1), otov = num(o, 'turnovers');
        if ([fgm, fga, tpm, ftm, fta, orb, tov].some(v => v == null || isNaN(v))) return null;
        const poss = fga - orb + tov + 0.44 * fta; const oposs = ofga != null ? ofga - (oorb || 0) + (otov || 0) + 0.44 * (ofta || 0) : poss;
        const pace = ((poss + oposs) / 2);
        return { efg: (fgm + 0.5 * tpm) / fga, ts: s.score / (2 * (fga + 0.44 * fta)), tov: tov / (fga + 0.44 * fta + tov), orb: odrb != null ? orb / (orb + odrb) : null, ftr: fta / fga, ortg: s.score / poss * 100, poss, pace };
      };
      const A = ff(ta, th, g.away, g.home), Hh = ff(th, ta, g.home, g.away);
      if (A && Hh) {
        const r = (lbl, a, h, fmt, lowGood) => `<div class="cmp-row"><span${(lowGood ? a <= h : a >= h) ? ' class="w"' : ''}>${fmt(a)}</span><div class="cmp-mid"><small>${lbl}</small></div><span${(lowGood ? h <= a : h >= a) ? ' class="w"' : ''}>${fmt(h)}</span></div>`;
        const p1 = v => v == null ? '—' : (v * 100).toFixed(1) + '%', d1 = v => v == null ? '—' : v.toFixed(1);
        factors = `<section class="sheet"><div class="sheet-h"><h2>Four factors</h2><small>${esc(g.away.abbr)} · ${esc(g.home.abbr)}</small></div><div class="compare">${r('Effective FG%', A.efg, Hh.efg, p1)}${r('True shooting', A.ts, Hh.ts, p1)}${r('Turnover rate', A.tov, Hh.tov, p1, true)}${r('Off. rebound rate', A.orb, Hh.orb, p1)}${r('FT rate (FTA/FGA)', A.ftr, Hh.ftr, p1)}${r('Offensive rating', A.ortg, Hh.ortg, d1)}</div><p class="note">Pace: about ${d1(A.pace)} possessions per team${g.state === 'in' ? ' so far' : ''}. Offensive rating is points per 100 possessions.</p></section>`;
      }
    }
    let leaders = '';
    if (d.leaders && d.leaders.length) {
      const items = [];
      d.leaders.forEach(t => (t.leaders || []).slice(0, 3).forEach(cat => { const Ld = cat.leaders && cat.leaders[0]; if (Ld) items.push({ team: t.team, cat, Ld }); }));
      if (items.length) leaders = `<section class="sheet"><div class="sheet-h"><h2>${g.state === 'pre' ? 'Season leaders' : 'Game leaders'}</h2></div>${items.map(({ team, cat, Ld }) => `<div class="leader"><img src="${esc(Ld.athlete.headshot && (Ld.athlete.headshot.href || Ld.athlete.headshot) || '')}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><div><a href="${href(L, 'player-' + esc(Ld.athlete.id))}">${esc(Ld.athlete.displayName)}</a><small>${esc(team.abbreviation)} · ${esc(cat.displayName)}${Ld.summary ? ' · ' + esc(Ld.summary) : ''}</small></div><b>${esc(Ld.displayValue)}</b></div>`).join('')}</section>`;
    }
    let wpChart = '';
    if (wp.length > 3) {
      const W = 600, Hc = 160, n = wp.length;
      const pts = wp.map((x, i) => `${(i / (n - 1) * W).toFixed(1)},${((1 - x.homeWinPercentage) * Hc).toFixed(1)}`).join(' ');
      const labels = reg === 4 ? ['Q1', 'Q2', 'Q3', 'Q4'] : ['1st half', '2nd half'];
      wpChart = `<section class="sheet wp"><div class="sheet-h"><h2>Win probability</h2><small>ESPN · ${esc(g.home.abbr)} above the line</small></div>
        <svg viewBox="-34 -8 ${W + 44} ${Hc + 26}" role="img" aria-label="Win probability over the game"><line x1="0" y1="${Hc / 2}" x2="${W}" y2="${Hc / 2}" stroke="currentColor" stroke-opacity=".25" stroke-dasharray="4 4"/>
        ${labels.map((_, i) => `<line x1="${(i + 1) / labels.length * W}" y1="0" x2="${(i + 1) / labels.length * W}" y2="${Hc}" stroke="currentColor" stroke-opacity=".08"/>`).join('')}
        <polygon points="0,${Hc / 2} ${pts} ${W},${Hc / 2}" fill="${g.home.color}" fill-opacity=".18"/><polyline points="${pts}" fill="none" stroke="${g.home.color}" stroke-width="2.5"/>
        <text x="-6" y="10" text-anchor="end">${esc(g.home.abbr)}</text><text x="-6" y="${Hc}" text-anchor="end">${esc(g.away.abbr)}</text><text x="-6" y="${Hc / 2 + 3}" text-anchor="end">50%</text>
        ${labels.map((q, i) => `<text x="${(i + .5) / labels.length * W}" y="${Hc + 16}" text-anchor="middle">${q}</text>`).join('')}</svg></section>`;
    }
    let inj = '';
    if (d.injuries && d.injuries.some(t => t.injuries && t.injuries.length)) inj = `<section class="sheet"><div class="sheet-h"><h2>Injuries</h2></div>${d.injuries.map(t => (t.injuries || []).map(x => injItem(x, t.team && t.team.abbreviation, L)).join('')).join('')}</section>`;
    let l5 = '';
    if (d.lastFiveGames && d.lastFiveGames.length) l5 = `<section class="sheet"><div class="sheet-h"><h2>Last five</h2></div>${d.lastFiveGames.map(t => `<p style="margin:0 0 10px"><b>${esc(t.team && t.team.displayName)}</b><br>${(t.events || []).map(e => `<span class="chip"><span class="${e.gameResult === 'W' ? 'w' : 'lo'}">${esc(e.gameResult)}</span> ${esc(e.atVs)} ${esc(e.opponent && e.opponent.abbreviation)} ${esc(e.score)}</span>`).join(' ')}</p>`).join('')}${d.seasonseries && d.seasonseries[0] ? `<p class="note">Season series: ${esc(d.seasonseries[0].summary || d.seasonseries[0].description || '')}</p>` : ''}</section>`;
    let recap = '';
    const art = d.article; const arts = d.news && d.news.articles || [];
    if ((art && art.headline) || arts.length) {
      const list = [art && art.headline ? { headline: art.headline, href: art.links && art.links.web && art.links.web.href, desc: art.description } : null, ...arts.slice(0, 4).map(a => ({ headline: a.headline, href: a.links && a.links.web && a.links.web.href, desc: a.description }))].filter(Boolean);
      recap = `<section class="sheet"><div class="sheet-h"><h2>${g.state === 'post' ? 'Recap & stories' : 'Stories'}</h2></div>${list.map(a => `<div class="wire-item"><span><a href="${esc(a.href || '#')}" target="_blank" rel="noopener"><b>${esc(a.headline)}</b></a>${a.desc ? `<br><span class="muted">${esc(a.desc)}</span>` : ''}</span></div>`).join('')}</section>`;
    }
    $main.innerHTML = `<div class="grid"><div class="col">${out.join('')}${boxes.join('')}${wpChart}</div><div class="col">${factors}${compare}${leaders}${inj}${l5}${recap}</div></div>`;
  };
  await render();
  return { live: async () => { const st = data.header && data.header.competitions[0].status.type.state; const g = S.today[L.key].find(x => x.id === id); if ((g && g.state !== 'post') || st === 'in') { try { await load(15000); await render(); } catch { } } } };
}

/* ================= STANDINGS ================= */
async function standingsView(L) {
  $main.innerHTML = leagueSwitch(L, 'standings') + pagehead('Standings', '&nbsp;') + skeleton(12);
  let cur; try { cur = await standings(L); } catch { $main.innerHTML = leagueSwitch(L, 'standings') + failMsg('standings'); return; }
  const conf = L.standingsMode === 'conferences';
  const cols = conf ? `<th>W</th><th>L</th><th>Pct</th><th>Conf</th><th>Home</th><th>Road</th><th>Strk</th><th>PPG</th><th>Opp</th><th>Diff</th>` : `<th>W</th><th>L</th><th>Pct</th><th>GB</th><th>Home</th><th>Road</th><th>L10</th><th>Strk</th><th>PPG</th><th>Opp</th><th>Diff</th>`;
  const row = (r, i, cut) => `<tr class="click${favs.has(L.key, r.id) ? ' okc' : ''}${cut ? ' cut' : ''}" data-href="${href(L, 'team-' + r.id)}"><td><span class="team"><span class="rank">${i + 1}</span><img class="headshot sq" src="${esc(r.logo)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><a href="${href(L, 'team-' + r.id)}">${esc(r.name)}</a></span></td><td>${r.w}</td><td>${r.l}</td><td>${esc(r.pct)}</td>${conf ? `<td>${esc(r.conf)}</td>` : `<td>${esc(r.gb)}</td>`}<td>${esc(r.home)}</td><td>${esc(r.road)}</td>${conf ? '' : `<td>${esc(r.l10)}</td>`}<td>${esc(r.strk)}</td><td>${r.ppg != null ? (+r.ppg).toFixed(1) : ''}</td><td>${r.opp != null ? (+r.opp).toFixed(1) : ''}</td><td class="${r.diff > 0 ? 'w' : r.diff < 0 ? 'lo' : ''}">${r.diff != null ? sign(+r.diff) : ''}</td></tr>`;
  const mode = store.get('stMode:' + L.key, conf ? 'conf' : L.standingsMode === 'league' ? 'league' : 'conf');
  const groupsSorted = [...cur.groups].sort((a, b) => { const fa = a.rows.some(r => favs.has(L.key, r.id)), fb = b.rows.some(r => favs.has(L.key, r.id)); return fb - fa || a.name.localeCompare(b.name); });
  const render = (m) => {
    let body;
    if (m === 'league') {
      const all = cur.groups.flatMap(c => c.rows).sort((a, b) => (b.w / Math.max(1, b.w + b.l)) - (a.w / Math.max(1, a.w + a.l)) || (b.diff || 0) - (a.diff || 0));
      body = `<section class="sheet"><div class="tw"><table class="t"><thead><tr><th>${conf ? 'All D1' : 'League'}</th>${cols}</tr></thead><tbody>${all.map((r, i) => row(r, i)).join('')}</tbody></table></div></section>`;
    } else {
      const sel = conf ? store.get('stGroup:' + L.key, '') : '';
      const list = conf && sel ? groupsSorted.filter(c => c.name === sel) : groupsSorted;
      body = `<div class="col">${list.map(c => `<section class="sheet"><div class="sheet-h"><h2>${esc(c.name)}</h2><small>${conf ? c.rows.length + ' teams' : L.key === 'nba' ? '6 playoff · 7–10 play-in' : ''}</small></div><div class="tw"><table class="t"><thead><tr><th>Team</th>${cols}</tr></thead><tbody>${c.rows.map((r, i) => row(r, i, (L.playoffLine || []).includes(i + 1))).join('')}</tbody></table></div></section>`).join('')}</div>`;
    }
    const picker = conf && m !== 'league' ? `<select class="sel" id="stGroup" aria-label="Conference"><option value="">All conferences</option>${groupsSorted.map(c => `<option value="${esc(c.name)}"${store.get('stGroup:' + L.key, '') === c.name ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select>` : '';
    $main.innerHTML = leagueSwitch(L, 'standings') + pagehead('Standings', `${esc(cur.season || '')} ${esc(L.label)} · Diff is average point margin`) +
      `<div class="ctrls"><div class="tabs" style="margin:0" role="tablist"><button class="tab" role="tab" aria-selected="${m !== 'league'}" data-act="stmode" data-m="conf">${conf ? 'By conference' : L.standingsMode === 'league' ? 'League' : 'Conference'}</button><button class="tab" role="tab" aria-selected="${m === 'league'}" data-act="stmode" data-m="league">${conf ? 'All teams' : 'League'}</button></div>${picker}</div>${body}`;
    const sg = document.getElementById('stGroup'); sg && sg.addEventListener('change', e => { store.set('stGroup:' + L.key, e.target.value); render(m); });
  };
  render(mode);
  standingsView.render = m => { store.set('stMode:' + L.key, m); render(m); };
}

/* ================= RANKINGS (college) ================= */
async function rankingsView(L) {
  $main.innerHTML = leagueSwitch(L, 'rankings') + pagehead('Rankings', '&nbsp;') + skeleton(12);
  const R = await rankings(L);
  if (!R) { $main.innerHTML = leagueSwitch(L, 'rankings') + failMsg('rankings'); return; }
  $main.innerHTML = leagueSwitch(L, 'rankings') + pagehead(esc(R.name), esc(R.week || L.label)) + `<section class="sheet"><div class="tw"><table class="t"><thead><tr><th>Team</th><th>Record</th><th>Pts</th><th>1st</th><th>Prev</th><th>Trend</th></tr></thead><tbody>${R.ranks.map(r => `<tr class="click${favs.has(L.key, r.team.id) ? ' okc' : ''}" data-href="${href(L, 'team-' + r.team.id)}"><td><span class="team"><span class="rank">${r.rank}</span><img class="headshot sq" src="${esc(r.team.logo || '')}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><a href="${href(L, 'team-' + r.team.id)}">${esc(r.team.name)}</a></span></td><td>${esc(r.rec || '')}</td><td>${esc(r.pts || '')}</td><td>${r.first ? esc(r.first) : ''}</td><td>${esc(r.prev || '')}</td><td class="${/^\+/.test(r.trend || '') ? 'w' : /^-\d/.test(r.trend || '') ? 'lo' : ''}">${esc(r.trend && r.trend !== '-' ? r.trend : '')}</td></tr>`).join('')}</tbody></table></div></section>`;
}

/* ================= TEAMS ================= */
async function teams(L) {
  $main.innerHTML = leagueSwitch(L, 'teams') + pagehead('Teams', '&nbsp;') + skeleton(8);
  const [cur, R] = await Promise.all([standings(L).catch(() => null), rankings(L)]);
  if (!cur || !cur.groups.length) { $main.innerHTML = leagueSwitch(L, 'teams') + failMsg('teams'); return; }
  const rankOf = {}; (R && R.ranks || []).forEach(r => rankOf[r.team.id] = r.rank);
  const card = r => `<a class="team-card" href="${href(L, 'team-' + r.id)}"><img src="${esc(r.logo)}" alt="" loading="lazy"><span><b>${rankOf[r.id] ? `<span class="rk">${rankOf[r.id]}</span>` : ''}${esc(r.name)}</b><small>${r.w}–${r.l}${L.standingsMode === 'conferences' ? ` · ${esc(r.conf || '')} ${esc(r.groupAbbr || r.group)}` : ` · ${ordinal(r.pos)} in ${esc(r.groupAbbr || r.group)}`}</small></span>${favs.has(L.key, r.id) ? '<span class="star on" aria-label="Favorite">★</span>' : ''}</a>`;
  const myIds = favs.all()[L.key] || [];
  const mine = cur.groups.flatMap(c => c.rows).filter(r => myIds.includes(r.id));
  const q = L.standingsMode === 'conferences' ? `<div class="ctrls"><input class="inp" id="teamq" type="search" placeholder="Find a school or conference" aria-label="Find a team"></div>` : '';
  const groupsHtml = cur.groups.map(gp => `<div class="tgroup" data-name="${esc(gp.name.toLowerCase())}"><h2 class="conf-h">${esc(gp.name)}</h2><div class="teams">${gp.rows.map(card).join('')}</div></div>`).join('');
  $main.innerHTML = leagueSwitch(L, 'teams') + pagehead('Teams', `${cur.groups.reduce((n, c) => n + c.rows.length, 0)} teams · every roster, schedule and stat line one tap away`) + q + (mine.length ? `<h2 class="conf-h">Your teams</h2><div class="teams" style="margin-bottom:6px">${mine.map(card).join('')}</div>` : '') + groupsHtml;
  const inp = document.getElementById('teamq');
  if (inp) inp.addEventListener('input', () => { const v = inp.value.trim().toLowerCase(); document.querySelectorAll('.tgroup').forEach(gq => { let any = false; gq.querySelectorAll('.team-card').forEach(c => { const hit = !v || c.textContent.toLowerCase().includes(v) || gq.dataset.name.includes(v); c.hidden = !hit; any = any || hit; }); gq.hidden = !any; }); });
}

/* ---------- player table ---------- */
const PCOLS = [['gp', 'GP', 0], ['min', 'MIN', 1], ['pts', 'PTS', 1], ['reb', 'REB', 1], ['ast', 'AST', 1], ['stl', 'STL', 1], ['blk', 'BLK', 1], ['tov', 'TO', 1], ['fg', 'FG%', 1], ['tp', '3P%', 1], ['tpm', '3PM', 1], ['ft', 'FT%', 1], ['ts', 'TS%', 1]];
function playerTable(L, rows, sortKey, showTeam = true, limit = Infinity) {
  return `<div class="tw"><table class="t"><thead><tr><th>Player</th>${showTeam ? '<th class="l">Team</th>' : ''}<th class="l">Pos</th>${PCOLS.map(([k, l]) => `<th class="sortable${k === sortKey ? ' sorted' : ''}" data-act="psort" data-k="${k}" tabindex="0" aria-sort="${k === sortKey ? 'descending' : 'none'}">${l}</th>`).join('')}</tr></thead><tbody>${rows.slice(0, limit).map((r, i) => `<tr class="click${favs.has(L.key, r.teamId) ? ' okc' : ''}" data-href="${href(L, 'player-' + r.id)}"><td><span class="team"><span class="rank">${i + 1}</span><img class="headshot" src="${esc(r.img || '')}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><a href="${href(L, 'player-' + r.id)}">${esc(r.name)}</a></span></td>${showTeam ? `<td class="l"><a href="${href(L, 'team-' + r.teamId)}">${esc(r.team)}</a></td>` : ''}<td class="l">${esc(r.pos)}</td>${PCOLS.map(([k, , dp]) => `<td>${(+r[k] || 0).toFixed(dp)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

/* ================= PLAYERS ================= */
const PST = {};
async function players(L) {
  const P = PST[L.key] = PST[L.key] || { sort: 'pts', q: '', pos: '', qual: true, season: '', limit: 100 };
  $main.innerHTML = leagueSwitch(L, 'players') + pagehead('Players', `Loading every ${esc(L.noun)} player…`) + skeleton(14);
  let data; try { data = await leaguePlayers(L, P.season); } catch { $main.innerHTML = leagueSwitch(L, 'players') + failMsg('player stats'); return; }
  const paint = () => {
    const maxGp = Math.max(1, ...data.rows.map(r => r.gp));
    const minGp = Math.ceil(maxGp * 0.5);
    let rows = data.rows.filter(r => (!P.q || (r.name + ' ' + r.team).toLowerCase().includes(P.q.toLowerCase())) && (!P.pos || r.pos.includes(P.pos)) && (!P.qual || r.gp >= minGp));
    rows.sort((a, b) => (b[P.sort] || 0) - (a[P.sort] || 0));
    document.getElementById('ptable').innerHTML = (rows.length ? playerTable(L, rows, P.sort, true, P.limit) : `<p class="muted">No players match that.</p>`) + (rows.length > P.limit ? `<div style="margin-top:12px"><button class="btn sm ghost" data-act="pmore">Show ${Math.min(100, rows.length - P.limit)} more of ${rows.length}</button></div>` : '');
    document.getElementById('pcount').textContent = `${rows.length} players${P.qual ? ` · at least ${minGp} game${minGp === 1 ? '' : 's'}` : ''}`;
  };
  $main.innerHTML = leagueSwitch(L, 'players') + pagehead('Players', `${esc(data.label ? data.label + ' · ' : '')}per-game averages · tap a column to sort · TS% is true shooting`) +
    `<div class="ctrls"><input class="inp" id="pq" type="search" placeholder="Search a player or team" value="${esc(P.q)}" aria-label="Search players">
    <select class="sel" id="ppos" aria-label="Position"><option value="">All positions</option><option value="G"${P.pos === 'G' ? ' selected' : ''}>Guards</option><option value="F"${P.pos === 'F' ? ' selected' : ''}>Forwards</option><option value="C"${P.pos === 'C' ? ' selected' : ''}>Centers</option></select>
    <select class="sel" id="pseason" aria-label="Season"><option value=""${!P.season ? ' selected' : ''}>This season</option><option value="${seasonYear() - 1}"${P.season ? ' selected' : ''}>Last season</option></select>
    <label class="chip" style="min-height:42px;padding:0 10px;cursor:pointer"><input type="checkbox" id="pqual" ${P.qual ? 'checked' : ''}> Regulars only</label></div>
    <section class="sheet"><div class="sheet-h"><h2>${esc(L.label)}</h2><small id="pcount"></small></div><div id="ptable"></div></section>${L.key.startsWith('ncaa') ? '<p class="note">College lists the top 800 scorers; search by name for anyone else.</p>' : ''}`;
  paint();
  const q = document.getElementById('pq'); let t;
  q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { P.q = q.value.trim(); P.limit = 100; paint(); }, 150); });
  document.getElementById('ppos').addEventListener('change', e => { P.pos = e.target.value; paint(); });
  document.getElementById('pqual').addEventListener('change', e => { P.qual = e.target.checked; paint(); });
  document.getElementById('pseason').addEventListener('change', e => { P.season = e.target.value; players(L); });
  players.paint = paint; players.st = P;
}

/* ================= TEAM ================= */
async function team(L, id) {
  $main.innerHTML = `<div class="grid"><div class="col">${skeleton(4)}${skeleton(12)}</div><div class="col">${skeleton(10)}</div></div>`;
  const [roster, sched, cur, R] = await Promise.all([jSoft(`${API(L)}/teams/${id}/roster`, 900000), jSoft(`${API(L)}/teams/${id}/schedule`, 300000), standings(L).catch(() => null), rankings(L)]);
  const t0 = (roster && roster.team) || (sched && sched.team);
  if (!t0) { $main.innerHTML = failMsg('this team'); return; }
  const r = cur && cur.byId[String(id)];
  const rank = R && (R.ranks.find(x => x.team.id === String(id)) || {}).rank;
  const bg = darkOf(t0.color || HW.TEAM_COLORS && HW.TEAM_COLORS[t0.abbreviation], t0.alternateColor);
  const logo = t0.logo || (t0.logos && t0.logos[0] && t0.logos[0].href) || logoUrl(L, t0.abbreviation);
  const evs = (sched && sched.events || []).map(e => parseEvent(e, L));
  const next = evs.find(g => g.state !== 'post');
  let nextHtml = '';
  if (next) {
    const ctx = await forecastCtx(L, ymdOf(next.date));
    const f = forecast(L, next, ctx); const homeSide = next.home.id === String(id); const opp = homeSide ? next.away : next.home; const pTeam = homeSide ? f.pHome : 1 - f.pHome;
    nextHtml = `<div class="key-foot"><div><div class="fbar-l"><span>Next: ${homeSide ? 'vs' : 'at'} ${tn(opp)} · ${esc(relDay(ymdOf(next.date)))} ${esc(tip(next.date))} CT</span><span>${next.state === 'in' ? 'live' : 'forecast'} ${pct(pTeam)} to win</span></div><div class="fbar"><i style="width:${pTeam * 100}%;background:var(--gold)"></i><i style="width:${(1 - pTeam) * 100}%;background:${opp.color};opacity:.85"></i></div></div><a class="btn sm" href="${href(L, 'game-' + next.id)}">${next.state === 'in' ? 'Live' : 'Preview'}</a></div>`;
  }
  const isF = favs.has(L.key, id);
  const sub = [r ? `${r.w}–${r.l}` : t0.recordSummary, t0.standingSummary || (r && L.standingsMode !== 'conferences' ? `${ordinal(r.pos)} in ${r.group}` : r ? `${r.conf || ''} in ${r.group}` : ''), r && r.strk ? 'streak ' + r.strk : ''].filter(Boolean).join(' · ');
  const head = `<article class="key team" style="--tc:${bg}"><div class="pl-head"><img src="${esc(logo)}" alt="" style="object-fit:contain;width:110px;height:110px"><div style="padding-bottom:16px;min-width:0"><h2 style="margin:0;font:400 clamp(30px,5vw,50px)/1 var(--display);letter-spacing:.03em;text-transform:uppercase;text-wrap:balance">${rank ? `<span class="rk big">${rank}</span>` : ''}${esc(t0.displayName)}</h2><div class="key-sub">${esc(L.label)} · ${esc(sub)}</div><div style="margin-top:10px"><button class="btn sm" data-act="fav" data-lk="${L.key}" data-id="${esc(id)}" aria-pressed="${isF}">${isF ? '★ Favorite' : '☆ Add to my teams'}</button></div></div></div>
    ${r ? `<div class="pl-stats"><div><b>${r.ppg != null ? (+r.ppg).toFixed(1) : '—'}</b><small>Points</small></div><div><b>${r.opp != null ? (+r.opp).toFixed(1) : '—'}</b><small>Allowed</small></div><div><b>${r.diff != null ? sign(+r.diff) : '—'}</b><small>Margin</small></div><div><b>${esc(r.home || '—')}</b><small>Home</small></div><div><b>${esc(r.road || '—')}</b><small>Road</small></div><div><b>${esc(L.standingsMode === 'conferences' ? (r.conf || '—') : (r.l10 || '—'))}</b><small>${L.standingsMode === 'conferences' ? 'Conf' : 'Last 10'}</small></div></div>` : ''}${nextHtml}</article>`;
  const ath = (roster && roster.athletes || []).flatMap(a => a.items ? a.items : [a]);
  const rosterHtml = ath.length ? `<section class="sheet"><div class="sheet-h"><h2>Roster</h2><small>${ath.length} players</small></div><div class="tw"><table class="t"><thead><tr><th>Player</th><th>#</th><th class="l">Pos</th><th>${L.key.startsWith('ncaa') ? 'Yr' : 'Age'}</th><th>Ht</th><th>Wt</th><th class="l">Status</th></tr></thead><tbody>${ath.map(a => `<tr class="click" data-href="${href(L, 'player-' + a.id)}"><td><span class="team"><img class="headshot" src="${esc(a.headshot && a.headshot.href || '')}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><a href="${href(L, 'player-' + a.id)}">${esc(a.displayName)}</a></span></td><td>${esc(a.jersey || '')}</td><td class="l">${esc(a.position && a.position.abbreviation || '')}</td><td>${esc(L.key.startsWith('ncaa') ? (a.experience && a.experience.abbreviation || '') : (a.age || ''))}</td><td>${esc(a.displayHeight || '')}</td><td>${esc((a.displayWeight || '').replace(' lbs', ''))}</td><td class="l">${a.injuries && a.injuries.length ? injPill(a.injuries[0].status) : '<span class="muted">Active</span>'}</td></tr>`).join('')}</tbody></table></div></section>` : '';
  const done = evs.filter(g => g.state === 'post').slice(-12).reverse(), up = evs.filter(g => g.state !== 'post').slice(0, 10);
  const sRow = g => { const homeSide = g.home.id === String(id); const me = homeSide ? g.home : g.away, op = homeSide ? g.away : g.home; const res = g.state === 'post' ? `<span class="${(me.score > op.score) ? 'w' : 'lo'}">${me.score > op.score ? 'W' : 'L'}</span> ${me.score}–${op.score}` : g.state === 'in' ? `<span style="color:var(--live)">Live</span> ${me.score}–${op.score}` : `${esc(tip(g.date))}`; return `<tr class="click" data-href="${href(L, 'game-' + g.id)}"><td>${esc(dateShort(g.date))}</td><td class="l">${g.neutral ? 'vs' : homeSide ? 'vs' : '@'} <a href="${href(L, 'team-' + op.id)}">${tn(op)}</a></td><td>${res}</td></tr>`; };
  const schedHtml = `<section class="sheet"><div class="sheet-h"><h2>Schedule</h2><small>${evs.length} games</small></div><div class="tw"><table class="t"><tbody>${up.length ? `<tr class="sub"><td colspan="3">Coming up</td></tr>${up.map(sRow).join('')}` : ''}${done.length ? `<tr class="sub"><td colspan="3">Recent</td></tr>${done.map(sRow).join('')}` : ''}</tbody></table></div></section>`;
  $main.innerHTML = `<div class="grid"><div class="col">${head}<div id="tstats">${skeleton(6)}</div>${rosterHtml}</div><div class="col">${schedHtml}</div></div>`;
  try {
    const lp = await leaguePlayers(L);
    const mine = lp.rows.filter(p => p.teamId === String(id)).sort((a, b) => b.pts - a.pts);
    document.getElementById('tstats').innerHTML = mine.length ? `<section class="sheet"><div class="sheet-h"><h2>Season stats</h2><small>${esc(lp.label)} · per game</small></div>${playerTable(L, mine, 'pts', false)}</section>` : '';
  } catch { const el = document.getElementById('tstats'); if (el) el.innerHTML = ''; }
}

/* ================= PLAYER ================= */
async function player(L, id) {
  $main.innerHTML = `<div class="grid"><div class="col">${skeleton(5)}${skeleton(10)}</div><div class="col">${skeleton(8)}</div></div>`;
  const [bio, ov, gl] = await Promise.all([jSoft(`${WEB(L)}/athletes/${id}`, 3600000), jSoft(`${WEB(L)}/athletes/${id}/overview`, 600000), jSoft(`${WEB(L)}/athletes/${id}/gamelog`, 600000)]);
  const a = bio && (bio.athlete || bio);
  if (!a || !a.displayName) { $main.innerHTML = failMsg('this player'); return; }
  const tm = a.team || {};
  const bg = darkOf(tm.color, tm.alternateColor);
  const st = ov && ov.statistics; const labels = st && st.labels || [];
  const reg = st && st.splits && (st.splits.find(s => /regular/i.test(s.displayName)) || st.splits[0]);
  const val = l => { const i = labels.indexOf(l); return reg && i >= 0 ? reg.stats[i] : '—'; };
  const facts = [a.position && a.position.displayName, a.jersey && '#' + a.jersey, a.displayHeight, a.displayWeight, L.key.startsWith('ncaa') ? (a.experience && a.experience.displayValue) : (a.age && `age ${a.age}`), a.college && a.college.name, a.displayDraft || (a.draft && a.draft.displayText), a.birthPlace && L.key.startsWith('ncaa') ? [a.birthPlace.city, a.birthPlace.state].filter(Boolean).join(', ') : ''].filter(Boolean);
  const injury = a.injuries && a.injuries[0];
  const head = `<article class="key team" style="--tc:${bg}"><div class="pl-head"><img src="${esc(a.headshot && a.headshot.href || '')}" alt="" onerror="this.style.visibility='hidden'"><div style="padding-bottom:16px;min-width:0"><h2 style="margin:0;font:400 clamp(30px,5vw,50px)/1 var(--display);letter-spacing:.03em;text-transform:uppercase;text-wrap:balance">${esc(a.displayName)}</h2><div class="key-sub">${tm.id ? `<a href="${href(L, 'team-' + esc(tm.id))}" style="color:inherit">${esc(tm.displayName)}</a> · ` : ''}${esc(facts.join(' · '))}</div>${injury ? `<div style="margin-top:8px">${injPill(injury.status)} <span class="key-sub">${esc(injury.details && injury.details.type || '')}${injury.details && injury.details.returnDate ? ' · ESPN est. return ' + esc(dateShort(injury.details.returnDate)) : ''}</span></div>` : ''}</div></div>
    <div class="pl-stats">${['PTS', 'REB', 'AST', 'FG%', '3P%', 'MIN'].map(l => `<div><b>${esc(val(l))}</b><small>${l === 'MIN' ? 'Minutes' : l}</small></div>`).join('')}</div></article>`;
  const splits = st && st.splits && st.splits.length ? `<section class="sheet"><div class="sheet-h"><h2>Averages</h2><small>per game</small></div><div class="tw"><table class="t"><thead><tr><th></th>${labels.map(l => `<th>${esc(l)}</th>`).join('')}</tr></thead><tbody>${st.splits.map(s => `<tr><td><b>${esc(s.displayName)}</b></td>${s.stats.map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>` : '';
  let log = '';
  if (gl && gl.events && gl.seasonTypes) {
    const Lb = gl.labels || []; const evRows = [];
    gl.seasonTypes.forEach(stp => (stp.categories || []).forEach(c => (c.events || []).forEach(e => { const meta = gl.events[e.eventId]; if (meta) evRows.push({ meta, stats: e.stats, id: e.eventId }); })));
    evRows.sort((x, y) => new Date(y.meta.gameDate) - new Date(x.meta.gameDate));
    if (evRows.length) log = `<section class="sheet"><div class="sheet-h"><h2>Game log</h2><small>last ${Math.min(15, evRows.length)}</small></div><div class="tw"><table class="t"><thead><tr><th>Date</th><th class="l">Opp</th><th class="l">Result</th>${Lb.map(l => `<th>${esc(l)}</th>`).join('')}</tr></thead><tbody>${evRows.slice(0, 15).map(r => `<tr class="click" data-href="${href(L, 'game-' + esc(r.id))}"><td>${esc(dateShort(r.meta.gameDate))}</td><td class="l">${esc(r.meta.atVs || '')} ${esc(r.meta.opponent && r.meta.opponent.abbreviation || '')}</td><td class="l"><span class="${r.meta.gameResult === 'W' ? 'w' : 'lo'}">${esc(r.meta.gameResult || '')}</span> ${esc(r.meta.score || '')}</td>${(r.stats || []).map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>`;
  }
  const news = ov && ov.news && ov.news.length ? `<section class="sheet"><div class="sheet-h"><h2>News</h2></div>${ov.news.slice(0, 8).map(n => `<div class="wire-item"><span class="pill trade">${esc(n.published ? ago(n.published) : '')}</span><a href="${esc(n.links && n.links.web && n.links.web.href || '#')}" target="_blank" rel="noopener">${esc(n.headline)}</a></div>`).join('')}</section>` : '';
  $main.innerHTML = `<div class="grid"><div class="col">${head}${splits}${log}</div><div class="col">${news || state('No recent news', '<p>Nothing new on this player in the feed.</p>')}</div></div>`;
}

/* ================= FORECASTS ================= */
async function forecasts(L) {
  $main.innerHTML = leagueSwitch(L, 'forecasts') + pagehead('Forecasts', 'The next seven days') + skeleton(10);
  const t = todayCT(); const days = Array.from({ length: 7 }, (_, i) => addDays(t, i));
  const [boards, ais, rt] = await Promise.all([Promise.all(days.map(d => scoreboard(L, d).catch(() => []))), Promise.all(days.map(aiFor)), HW.ratings(L)]);
  const base = await forecastCtx(L, t);
  const yday = await scoreboard(L, addDays(t, -1)).catch(() => []);
  const played = days.map((d, i) => new Set((i === 0 ? yday : boards[i - 1]).filter(g => g.state !== 'pre').flatMap(g => [g.home.id, g.away.id])));
  const sections = days.map((d, i) => {
    const gs = [...boards[i].filter(g => g.state !== 'post')].sort((a, b) => interest(b) - interest(a) || new Date(a.date) - new Date(b.date)); if (!gs.length) return '';
    const ctx = { ...base, b2b: played[i] };
    const show = gs.slice(0, L.key.startsWith('ncaa') ? 25 : 30);
    return `<section class="sheet"><div class="sheet-h"><h2>${esc(relDay(d))}</h2><small>${esc(dayLabel(d, { weekday: 'short', month: 'short', day: 'numeric' }))} · ${gs.length} games${ais[i] ? ' · AI reads in' : ''}</small></div><div class="fc-list">${show.map(g => fcRow(L, g, forecast(L, g, ctx), aiEntry(ais[i], g))).join('')}</div>${gs.length > show.length ? `<p class="note"><a href="${href(L, 'games-' + compact(d))}">All ${gs.length} games that day →</a></p>` : ''}</section>`;
  }).join('');
  const top = rt && rt.teams ? Object.entries(rt.teams).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.elo - a.elo).slice(0, 15) : [];
  $main.innerHTML = leagueSwitch(L, 'forecasts') + pagehead('Forecasts', `${esc(L.label)} · the next seven days · win chances from the Hardwood rating model`) +
    `<div class="grid"><div class="col">${sections || state('Nothing scheduled', `<p>No ${esc(L.noun)} games in the next seven days.</p>`)}</div>
    <div class="col">${top.length ? `<section class="sheet"><div class="sheet-h"><h2>Power ratings</h2><small>Elo · updated ${esc(rt.generated ? ago(rt.generated) : '')}</small></div><div class="tw"><table class="t"><thead><tr><th>Team</th><th>Elo</th><th>vs avg</th><th>GP</th></tr></thead><tbody>${top.map((r, i) => `<tr class="click${favs.has(L.key, r.id) ? ' okc' : ''}" data-href="${href(L, 'team-' + r.id)}"><td><span class="team"><span class="rank">${i + 1}</span><a href="${href(L, 'team-' + r.id)}">${esc(r.name || r.abbr || r.id)}</a></span></td><td>${Math.round(r.elo)}</td><td>${sign((r.elo - 1500) / L.eloPerPoint)}</td><td>${r.gp || 0}</td></tr>`).join('')}</tbody></table></div><p class="note">"vs avg" is the projected margin against an average team on a neutral floor.</p></section>` : ''}
    <section class="sheet"><div class="sheet-h"><h2>How it works</h2><a class="more" href="#record">Our record</a></div>
      <p style="margin:0 0 10px">Every team carries an Elo rating that moves after each game by how surprising the result was and by how big the margin was. It's rebuilt nightly from every ${esc(L.noun)} result this season${L.key.startsWith('ncaa') ? ', starting from the preseason poll' : ', starting from last season\'s point margins'}.</p>
      <p style="margin:0 0 10px">Projected margin = rating gap + ${L.hca} for home court${L.b2b ? ` − ${L.b2b} for a team that played yesterday` : ''}${L.hasInjuries ? ' − about 0.18 points per point-per-game of scoring that\'s ruled out (capped at 8)' : ''}. That margin becomes a win chance using the typical ${L.sd}-point spread of ${esc(L.noun)} results. During a game it updates from the score and time left.</p>
      <p class="note">Tap <b>Why</b> on any game for its inputs. Until the nightly ratings exist for a league, the model falls back to this season's point margin blended with last season's.</p></section></div></div>`;
}

/* ================= WIRE ================= */
async function wire(L, tab) {
  tab = tab || store.get('wireTab:' + L.key, 'news');
  const tabsList = [['news', 'News'], L.hasInjuries ? ['injuries', 'Injuries'] : null, L.hasTransactions ? ['moves', 'Transactions'] : null].filter(Boolean);
  if (!tabsList.some(t => t[0] === tab)) tab = 'news';
  const tabs = `<div class="tabs" role="tablist">${tabsList.map(([k, l]) => `<a class="tab" role="tab" aria-selected="${tab === k}" href="${href(L, 'wire-' + k)}">${l}</a>`).join('')}</div>`;
  const head = leagueSwitch(L, 'wire') + pagehead('The wire', `${esc(L.label)} news${L.hasInjuries ? ', injuries' : ''}${L.hasTransactions ? ' and roster moves' : ''}`) + tabs;
  $main.innerHTML = head + skeleton(10);
  store.set('wireTab:' + L.key, tab);
  if (tab === 'injuries') {
    const inj = await injuries(L);
    if (!inj) { $main.innerHTML = head + failMsg('injuries'); return; }
    const F = favs.all()[L.key] || [];
    const teamsL = Object.entries(inj.byTeam).filter(([, t]) => t.list.length).sort(([a, ta], [b, tb]) => F.includes(b) - F.includes(a) || ta.name.localeCompare(tb.name));
    const sel = store.get('injTeam:' + L.key, '');
    const opts = `<select class="sel" id="injTeam" aria-label="Team"><option value="">All teams (${teamsL.reduce((n, [, t]) => n + t.list.length, 0)} players)</option>${teamsL.map(([id, t]) => `<option value="${esc(id)}"${id === sel ? ' selected' : ''}>${esc(t.name)} (${t.list.length})</option>`).join('')}</select>`;
    const list = teamsL.filter(([id]) => !sel || id === sel).map(([id, t]) => `<section class="sheet"><div class="sheet-h"><h2><a href="${href(L, 'team-' + id)}" style="text-decoration:none">${esc(t.name)}</a></h2><small>${t.list.length}</small></div>${t.list.map(x => injItem(x, x.athlete && x.athlete.position && x.athlete.position.abbreviation || '', L)).join('')}</section>`).join('');
    $main.innerHTML = head + `<div class="ctrls">${opts}</div><p class="note" style="margin:-6px 0 12px">Status, comments and estimated return dates are ESPN's, sourced from team reports; "est. return" is their estimate, not ours.</p><div class="duo">${list}</div>`;
    document.getElementById('injTeam').addEventListener('change', e => { store.set('injTeam:' + L.key, e.target.value); wire(L, 'injuries'); });
  } else if (tab === 'moves') {
    const d = await jSoft(`${API(L)}/transactions?limit=100`, 900000);
    if (!d) { $main.innerHTML = head + failMsg('transactions'); return; }
    const items = d.transactions || [];
    $main.innerHTML = head + `<section class="sheet"><div class="sheet-h"><h2>Transactions</h2><small>${items.length} most recent</small></div>${items.map(x => `<div class="wire-item"><span class="pill trade">${esc(dateShort(x.date))}</span><span><b>${esc(x.team && x.team.displayName || '')}</b> · ${esc(x.description)}</span></div>`).join('') || '<p class="muted">No recent transactions.</p>'}</section>`;
  } else {
    const d = await jSoft(`${API(L)}/news?limit=50`, 300000);
    if (!d) { $main.innerHTML = head + failMsg('news'); return; }
    const arts = d.articles || [];
    $main.innerHTML = head + `<div class="news">${arts.map(a => { const img = a.images && a.images[0] && a.images[0].url; return `<a class="story" href="${esc(a.links && a.links.web && a.links.web.href || '#')}" target="_blank" rel="noopener">${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : ''}<div><h3>${esc(a.headline)}</h3><p>${esc(a.description || '')}</p><span class="meta">${esc(ago(a.published))}${a.byline ? ' · ' + esc(a.byline) : ''}</span></div></a>`; }).join('')}</div>`;
  }
}

/* ================= RECORD (forecast scoreboard) ================= */
async function recordView() {
  $main.innerHTML = pagehead('Our record', 'Every pregame forecast, scored against what happened') + skeleton(10);
  const recs = await Promise.all(ORDER.map(k => record(LEAGUES[k])));
  const secs = []; let tot = { n: 0, hit: 0, brier: 0, en: 0, ehit: 0, ebrier: 0 };
  ORDER.forEach((k, i) => {
    const L = LEAGUES[k], r = recs[i]; if (!r || !r.games || !r.games.length) return;
    const gs = r.games; const n = gs.length;
    const hit = gs.filter(g => (g.p >= .5) === (g.hs > g.as)).length;
    const brier = gs.reduce((s, g) => s + ((g.hs > g.as ? 1 : 0) - g.p) ** 2, 0) / n;
    const eg = gs.filter(g => g.ep != null); const en = eg.length;
    const ehit = eg.filter(g => (g.ep >= .5) === (g.hs > g.as)).length;
    const ebrier = en ? eg.reduce((s, g) => s + ((g.hs > g.as ? 1 : 0) - g.ep) ** 2, 0) / en : null;
    const ourOnEspn = en ? eg.filter(g => (g.p >= .5) === (g.hs > g.as)).length : 0;
    const ourBrierOnEspn = en ? eg.reduce((s, g) => s + ((g.hs > g.as ? 1 : 0) - g.p) ** 2, 0) / en : null;
    tot.n += n; tot.hit += hit; tot.brier += brier * n; tot.en += en; tot.ehit += ehit; tot.ebrier += (ebrier || 0) * en;
    // calibration buckets
    const buckets = [[.5, .6], [.6, .7], [.7, .8], [.8, .9], [.9, 1.01]].map(([a, b]) => { const in_ = gs.filter(g => { const q = Math.max(g.p, 1 - g.p); return q >= a && q < b; }); const won = in_.filter(g => (g.p >= .5) === (g.hs > g.as)).length; return { a, b, n: in_.length, won }; });
    const last = [...gs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15);
    secs.push(`<section class="sheet"><div class="sheet-h"><h2>${esc(L.label)}</h2><small>${n} games since ${esc(dayLabel(gs.reduce((m, g) => g.date < m ? g.date : m, gs[0].date), { month: 'short', day: 'numeric' }))}</small></div>
      <div class="pl-stats light"><div><b>${(hit / n * 100).toFixed(1)}%</b><small>Straight-up</small></div><div><b>${brier.toFixed(3)}</b><small>Brier score</small></div>${en ? `<div><b>${(ehit / en * 100).toFixed(1)}%</b><small>ESPN pregame (${en} games)</small></div><div><b>${ebrier.toFixed(3)}</b><small>ESPN Brier</small></div><div><b>${(ourOnEspn / en * 100).toFixed(1)}%</b><small>Ours, same ${en}</small></div><div><b>${ourBrierOnEspn.toFixed(3)}</b><small>Our Brier, same ${en}</small></div>` : ''}</div>
      <p class="note">Brier score is the average squared error of the win chance: 0.250 is a coin flip, lower is better; good NBA models land near 0.200. ESPN's number is its own pregame win probability, captured from the game page the same night. The record scores the ratings alone (home court and rest included); the injury adjustment you see on live pages isn't kept historically, so it isn't scored.</p>
      <div class="tw"><table class="t"><thead><tr><th>Forecast confidence</th><th>Games</th><th>Hit</th><th>Expected</th></tr></thead><tbody>${buckets.filter(b => b.n).map(b => `<tr><td>${Math.round(b.a * 100)}–${Math.min(100, Math.round(b.b * 100) - (b.b > 1 ? 1 : 0))}%</td><td>${b.n}</td><td>${(b.won / b.n * 100).toFixed(0)}%</td><td class="muted">${Math.round((b.a + Math.min(b.b, 1)) / 2 * 100)}%</td></tr>`).join('')}</tbody></table></div>
      <h3 style="margin:16px 0 6px;font:400 17px/1 var(--display);letter-spacing:.06em;text-transform:uppercase">Recent</h3>
      <div class="tw"><table class="t"><thead><tr><th class="l">Date</th><th class="l">Game</th><th>Final</th><th>Our call</th><th>ESPN</th><th>Line</th><th>Result</th></tr></thead><tbody>${last.map(g => { const fav = g.p >= .5 ? g.h : g.a; const ok = (g.p >= .5) === (g.hs > g.as); return `<tr class="click" data-href="${href(L, 'game-' + g.id)}"><td class="l">${esc(dayLabel(g.date, { month: 'short', day: 'numeric' }))}</td><td class="l"><a href="${href(L, 'game-' + g.id)}">${esc(g.a)} at ${esc(g.h)}</a></td><td>${g.as}–${g.hs}</td><td>${esc(fav)} ${pct(Math.max(g.p, 1 - g.p))}</td><td>${g.ep != null ? esc(g.ep >= .5 ? g.h : g.a) + ' ' + pct(Math.max(g.ep, 1 - g.ep)) : '—'}</td><td class="muted">${esc(g.line || '—')}</td><td class="${ok ? 'w' : 'lo'}">${ok ? 'Hit' : 'Miss'}</td></tr>`; }).join('')}</tbody></table></div></section>`);
  });
  const overall = tot.n ? `<section class="sheet"><div class="sheet-h"><h2>All leagues</h2><small>${tot.n} games</small></div><div class="pl-stats light"><div><b>${(tot.hit / tot.n * 100).toFixed(1)}%</b><small>Straight-up</small></div><div><b>${(tot.brier / tot.n).toFixed(3)}</b><small>Brier</small></div>${tot.en ? `<div><b>${(tot.ehit / tot.en * 100).toFixed(1)}%</b><small>ESPN pregame (${tot.en})</small></div><div><b>${(tot.ebrier / tot.en).toFixed(3)}</b><small>ESPN Brier</small></div>` : ''}</div></section>` : '';
  $main.innerHTML = pagehead('Our record', 'Every pregame forecast the model made, scored against what happened. Updated nightly.') + (secs.length ? `<div class="grid"><div class="col">${secs.join('')}</div><div class="col">${overall}<section class="sheet"><div class="sheet-h"><h2>What counts</h2></div><p style="margin:0 0 8px">Each night the ratings job records the win chance the model gave every game <i>before</i> tip-off, using only the ratings as they stood that morning. Nothing is re-scored after the fact.</p><p style="margin:0 0 8px">"Straight-up" is how often the favored team won. Brier rewards being confident when right and punishes being confident when wrong, so it's the fairer test.</p><p class="note">ESPN's pregame win probability is pulled from the same game page when available (not every college game has one). Where ESPN shows a betting line, it's listed for reference only.</p></section></div></div>` : state('No record yet', '<p>The nightly job hasn\'t scored a game yet. Check back after the first slate of results.</p>'));
}

HW.views = { home, tonight, games, game, standings: standingsView, rankings: rankingsView, teams, team, players, player, forecasts, wire, record: recordView };
HW.render = { skeleton, state, failMsg, tileHTML };
})();
