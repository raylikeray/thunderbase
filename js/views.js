/* Hardwood — views. Sections first; every section takes a league key ('all' where it makes sense). */
(function () {
'use strict';
const HW = window.HW;
const { LEAGUES, ORDER, esc, jSoft, todayCT, addDays, compact, expand, ymdOf, dayLabel, relDay, tip, dateShort, ago, pct, sign, ordinal, store, API, WEB, logoUrl, seasonYear, favs,
  parseEvent, isLive, isFav, interest, scoreboard, standings, rankings, record, aiFor, aiEntry, injuries, forecast, forecastCtx, leaguePlayers, S } = HW;
const $main = document.getElementById('main');
const COLLEGE = ['ncaam', 'ncaaw'];
const lkOf = (v, allowAll, def) => { if (v === 'all' && allowAll) return 'all'; if (LEAGUES[v]) return v; const last = store.get('lk', 'nba'); return def || (allowAll ? 'all' : (LEAGUES[last] ? last : 'nba')); };
const remember = lk => { if (LEAGUES[lk]) store.set('lk', lk); };
const hrefS = (section, lk, arg) => `#${section}${lk ? '/' + lk : ''}${arg ? '/' + arg : ''}`;
const hrefG = (lk, id) => `#game/${lk}/${id}`;
const hrefT = (lk, id) => `#team/${lk}/${id}`;
const hrefP = (lk, id) => `#player/${lk}/${id}`;

/* ---------- shared bits ---------- */
const state = (title, body, err) => `<div class="state${err ? ' err' : ''}"><b>${esc(title)}</b>${body}</div>`;
const skeleton = (n = 6) => `<div class="card">${Array.from({ length: n }, (_, i) => `<div class="skel" style="width:${90 - (i % 3) * 18}%"></div>`).join('')}</div>`;
const failMsg = what => state(`Couldn't load ${what}`, `<p>The data feed didn't answer. It usually comes back within a minute; this page retries on its own, or <a href="#" data-act="reload">try again now</a>.</p>`, true);
const rk = s => s.rank ? `<span class="rk">${s.rank}</span>` : '';
const tn = (s, field = 'short') => `${rk(s)}${esc(s[field])}`;
const seg = (section, lk, opts = {}) => { const items = []; if (opts.all) items.push(['all', 'All']); (opts.leagues || ORDER).forEach(k => items.push([k, LEAGUES[k].label])); return `<div class="seg${opts.sticky ? ' sticky' : ''}" role="tablist" aria-label="League">${items.map(([k, l]) => `<a role="tab" aria-selected="${k === lk}" class="${k === lk ? 'on' : ''}" href="${hrefS(section, k, opts.arg)}">${esc(l)}</a>`).join('')}</div>`; };
const head = (h1, d, right = '') => `<div class="head"><h1>${h1}</h1>${d ? `<span class="d">${d}</span>` : ''}${right}</div>`;
function statusLine(g) {
  const where = [g.venue, g.tv.label].filter(Boolean).join(' · ');
  if (g.state === 'in') return `Live · ${g.detail}${where ? ' · ' + where : ''}`;
  if (g.state === 'pre') return `${relDay(ymdOf(g.date))} · ${tip(g.date)} CT${where ? ' · ' + where : ''}`;
  return `${g.detail || 'Final'} · ${dateShort(g.date)}${g.venue ? ' · ' + g.venue : ''}`;
}
function fcText(g, f) {
  const fav = f.pHome >= .5 ? g.home : g.away; const p = Math.max(f.pHome, 1 - f.pHome);
  if (g.state === 'post') { const won = g.home.score > g.away.score ? g.home : g.away; const hit = won === fav; return { label: `${hit ? 'Hit' : 'Miss'} · ${esc(fav.abbr)} ${pct(p)}`, cls: hit ? 'hit' : 'miss', fill: f.pHome }; }
  return { label: `${esc(fav.abbr)} ${pct(p)}${f.live ? ' live' : ''}`, cls: '', fill: f.pHome };
}
function gameCard(g, f) {
  const L = LEAGUES[g.lk];
  const st = g.state === 'in' ? `<span>Live · ${esc(g.detail)}</span>` : g.state === 'pre' ? `<span>${esc(tip(g.date))} CT</span>` : `<span>${esc(g.detail || 'Final')}</span>`;
  const row = (s, other) => { const lose = g.state === 'post' && s.score != null && other.score != null && s.score < other.score; return `<div class="tm" data-k="${g.id}-${s.id}"><i class="tab" style="background:${s.color}"></i><span class="n">${rk(s)}${esc(s.short)}</span><small>${esc(s.rec)}</small></div><div class="sc${lose ? ' lo' : ''}">${g.state === 'pre' ? '' : esc(s.score ?? '')}</div>`; };
  const t = f ? fcText(g, f) : null;
  return `<a class="g${isLive(g) ? ' live' : ''}${isFav(g) ? ' fav' : ''}" href="${hrefG(g.lk, g.id)}" aria-label="${esc(g.away.name)} at ${esc(g.home.name)}, ${esc(g.detail)}"><div class="st${isLive(g) ? ' on' : ''}">${st}<span class="tv">${esc(g.state === 'post' ? 'Box score' : g.tv.label || L.tag)}</span></div>${row(g.away, g.home)}${row(g.home, g.away)}${t ? `<div class="fc"><span class="${t.cls}">${t.label}</span><b><i style="width:${Math.max(t.fill, 1 - t.fill) * 100}%"></i></b></div>` : ''}</a>`;
}
function sortGames(list) { return [...list].sort((a, b) => (a.state === 'in' ? 0 : a.state === 'pre' ? 1 : 2) - (b.state === 'in' ? 0 : b.state === 'pre' ? 1 : 2) || interest(b) - interest(a) || new Date(a.date) - new Date(b.date)); }
function whyText(L, g, f) {
  const bits = [];
  const gap = f.H.rating - f.A.rating; const lead = gap >= 0 ? g.home : g.away;
  bits.push(Math.abs(gap) < 1.5 ? 'even on the ratings' : `${lead.short} ${Math.abs(gap).toFixed(1)} points better on the ratings`);
  if (f.restH && f.restA) bits.push('both on a back-to-back'); else if (f.restH) bits.push(`${g.home.short} played last night`); else if (f.restA) bits.push(`${g.away.short} played last night`);
  if (f.soH) bits.push(`${g.home.short} without ${f.soH.name}`); if (f.soA) bits.push(`${g.away.short} without ${f.soA.name}`);
  bits.push(g.neutral ? 'neutral floor' : `${g.home.short} at home`);
  return bits.join(' · ');
}
function featured(L, g, f, ai) {
  const ph = f.pHome, pa = 1 - ph;
  const txt = ai ? `${ai.headline ? ai.headline + '. ' : ''}${(ai.read || '').split(/(?<=\.)\s/)[0] || ''}` : whyText(L, g, f);
  const when = g.state === 'in' ? `Live · ${g.detail}` : `${tip(g.date)} CT${g.tv.label ? ' · ' + g.tv.label : ''}`;
  return `<section class="feat" aria-label="Featured game"><div><div class="k">Game of the night · ${esc(L.label)} · ${esc(when)}</div><h2><a href="${hrefG(g.lk, g.id)}">${tn(g.away)} at ${tn(g.home)}</a></h2><p>${esc(txt)}</p></div><div class="big"><div class="n${pa >= ph ? ' okc' : ''}">${g.state === 'in' && g.away.score != null ? g.away.score : pct(pa)}<small>${esc(g.away.abbr)}${g.state === 'in' ? ' · ' + pct(pa) : ''}</small></div><div class="n${ph > pa ? ' okc' : ''}">${g.state === 'in' && g.home.score != null ? g.home.score : pct(ph)}<small>${esc(g.home.abbr)}${g.state === 'in' ? ' · ' + pct(ph) : ''}</small></div><a class="btn" href="${hrefG(g.lk, g.id)}">${g.state === 'in' ? 'Box score' : ai ? 'Read the preview' : 'Preview'}</a></div></section>`;
}
function fbar(L, g, f) {
  const pa = 1 - f.pHome, ph = f.pHome; const fav = ph >= .5 ? g.home : g.away; const p = Math.max(ph, pa);
  const label = g.state === 'post' ? `Final · <b>${esc((g.home.score > g.away.score ? g.home : g.away).short)}</b> won` : `${f.live ? 'Live forecast' : 'Forecast'} · <b>${esc(fav.abbr)} ${pct(p)}</b>`;
  const bits = [];
  if (g.state !== 'post') {
    if (f.live) bits.push(`pregame ${esc(g.home.abbr)} ${sign(f.margin)}`);
    else { const gap = f.H.rating - f.A.rating; bits.push(`${esc((gap >= 0 ? g.home : g.away).abbr)} rating edge +${Math.abs(gap).toFixed(1)}`); if (f.hca) bits.push(`${esc(g.home.abbr)} home +${f.hca}`); if (f.restH || f.restA) bits.push(`rest ${sign(f.restH - f.restA)}`); if (f.soH) bits.push(`${esc(g.home.abbr)} ${f.soH.names.length > 1 ? f.soH.names.length + ' out' : esc(f.soH.name) + ' out'} ${sign(f.soH.pts)}`); if (f.soA) bits.push(`${esc(g.away.abbr)} ${f.soA.names.length > 1 ? f.soA.names.length + ' out' : esc(f.soA.name) + ' out'} ${sign(f.soA.pts)}`); }
  }
  return `<div class="fbar-l"><span>${label}</span><span>${bits.join(' · ')}</span></div><div class="fbar" role="img" aria-label="${esc(g.away.abbr)} ${pct(pa)}, ${esc(g.home.abbr)} ${pct(ph)}"><i style="width:${pa * 100}%;background:${g.away.color}"></i><i style="width:${ph * 100}%;background:${g.home.color}"></i></div>`;
}
function aiBlock(ai, open, id) {
  if (!ai) return '';
  const keys = (ai.keys || []).map(k => `<li>${esc(k)}</li>`).join('');
  return `<div class="ai" id="ai-${id}" ${open ? '' : 'hidden'}><h4>AI read <small>Claude · ${esc(ai.generatedLabel || 'this morning')} · an opinion with reasons, not a prediction to bet on</small></h4>${ai.headline ? `<p><b>${esc(ai.headline)}</b></p>` : ''}<p>${esc(ai.read || '')}</p>${keys ? `<ul>${keys}</ul>` : ''}${ai.pick ? `<p class="meta" style="margin-top:8px">Lean: ${esc(ai.pick)}${ai.confidence ? ' · ' + esc(ai.confidence) + ' confidence' : ''}</p>` : ''}</div>`;
}
function hero(L, g, f, ai, opts = {}) {
  const live = isLive(g), pre = g.state === 'pre';
  const side = (s, lo) => `<div class="side-t"><img src="${esc(s.logo)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><div class="n${pre ? ' pre' : ''}${lo ? ' lo' : ''}">${pre ? esc(s.abbr) : esc(s.score ?? '–')}</div><div class="l">${rk(s)}${esc(s.short)}${s.rec ? ` · <span class="nw">${esc(s.rec)}</span>` : ''}</div></div>`;
  const aLo = g.state === 'post' && g.away.score < g.home.score, hLo = g.state === 'post' && g.home.score < g.away.score;
  const mid = pre ? `<div class="mid">@<small>${esc(tip(g.date))} CT</small></div>` : `<div class="mid">–<small>${esc(live ? g.detail : (g.detail || 'Final'))}</small></div>`;
  const badge = live ? `<span class="badge live">Live</span>` : opts.badge ? `<span class="badge">${esc(opts.badge)}</span>` : '';
  const open = S.open.has('ai-' + g.id);
  return `<article class="hero" aria-label="${esc(g.away.name)} at ${esc(g.home.name)}">
    <div class="top"><div><h1>${tn(g.away)} at ${tn(g.home)}</h1><div class="sub">${esc(L.label)} · ${esc(statusLine(g))}${g.note ? ' · ' + esc(g.note) : ''}</div></div>${badge}</div>
    <div class="score">${side(g.away, aLo)}${mid}${side(g.home, hLo)}</div>
    <div class="foot"><div>${f ? fbar(L, g, f) : ''}</div><div style="display:flex;gap:8px;flex-wrap:wrap">${ai ? `<button class="btn sm" data-act="ai" data-id="${g.id}" aria-expanded="${open}" aria-controls="ai-${g.id}">${open ? 'Hide AI read' : 'AI read'}</button>` : ''}${opts.actions || ''}</div></div>
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
  return `<div class="fcr${isFav(g) ? ' fav' : ''}">
    <div class="fcr-teams"><a href="${hrefG(g.lk, g.id)}">${tn(g.away)} at ${tn(g.home)}</a><small>${opts.leagueTag ? esc(L.label) + ' · ' : ''}${g.state === 'in' ? 'Live · ' + esc(g.detail) : g.state === 'post' ? esc(g.detail) + ` · ${g.away.score}–${g.home.score}` : esc(tip(g.date)) + ' CT' + (g.tv.label ? ' · ' + esc(g.tv.label) : '')}</small></div>
    <div class="fcr-mid"><div class="fc-bar" role="img" aria-label="${esc(g.away.abbr)} ${pct(pa)}, ${esc(g.home.abbr)} ${pct(ph)}"><i style="width:${pa * 100}%;background:${g.away.color}"></i><i style="width:${ph * 100}%;background:${g.home.color}"></i></div><div class="fc-pct"><span>${esc(g.away.abbr)} ${pct(pa)}</span><span>${esc(g.home.abbr)} ${pct(ph)}</span></div></div>
    <div class="fcr-act"><button class="btn sm ghost" data-act="fc" data-id="${g.id}"${ai ? ' data-ai="1"' : ''} aria-expanded="${open}" aria-controls="fcd-${g.id}">${open ? 'Hide' : ai ? 'AI read' : 'Why'}</button></div>
    ${detail}
  </div>`;
}
function standingsMini(L, cur, groupMatch, n = 8, title) {
  const grp = cur.groups.find(c => groupMatch ? (c.name || '').includes(groupMatch) : true) || cur.groups[0];
  if (!grp) return '';
  const cuts = L.playoffLine || [];
  const rows = grp.rows.slice(0, n).map((r, i) => `<tr class="click${favs.has(L.key, r.id) ? ' fav' : ''}${cuts.includes(i + 1) ? ' cut' : ''}" data-href="${hrefT(L.key, r.id)}"><td><span class="team"><span class="rank">${i + 1}</span><a href="${hrefT(L.key, r.id)}">${esc(r.short || r.name)}</a></span></td><td>${r.w}-${r.l}</td><td class="${r.diff > 0 ? 'w' : r.diff < 0 ? 'lo' : ''}">${r.diff != null ? sign(+r.diff) : ''}</td><td>${esc(r.strk)}</td></tr>`).join('');
  return `<section class="card"><h3>${esc(title || `${L.label} ${grp.name.replace(' Conference', '')}`)}<a class="more" href="${hrefS('standings', L.key)}">Standings →</a></h3><div class="tw"><table class="t"><thead><tr><th>Team</th><th>W-L</th><th>Net</th><th>Strk</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}
function rankMini(L, R, n = 10) {
  if (!R) return '';
  return `<section class="card"><h3>${esc(L.label)} Top ${n}<a class="more" href="${hrefS('rankings', L.key)}">${esc(R.name)} →</a></h3><div class="tw"><table class="t"><tbody>${R.ranks.slice(0, n).map(r => `<tr class="click${favs.has(L.key, r.team.id) ? ' fav' : ''}" data-href="${hrefT(L.key, r.team.id)}"><td><span class="team"><span class="rank">${r.rank}</span><img class="headshot sq" src="${esc(r.team.logo || '')}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><a href="${hrefT(L.key, r.team.id)}">${esc(r.team.short)}</a></span></td><td>${esc(r.rec || '')}</td><td class="muted">${r.trend === '-' || !r.trend ? '' : esc(r.trend)}</td></tr>`).join('')}</tbody></table></div></section>`;
}
function injPill(status) { const s = (status || '').toLowerCase(); const cls = s.includes('out') || s.includes('suspen') ? 'out' : s.includes('day') || s.includes('question') || s.includes('doubt') ? 'dtd' : s.includes('prob') ? 'prob' : ''; return `<span class="pill ${cls}">${esc(/day-to-day/i.test(status) ? 'DTD' : status || '—')}</span>`; }
function injItem(x, teamLabel, L) {
  const ret = x.details && x.details.returnDate ? ` · ESPN est. return ${esc(dateShort(x.details.returnDate))}` : '';
  return `<div class="wire-item">${injPill(x.status)}<span><a href="${hrefP(L.key, esc(x.athlete && x.athlete.id || ''))}"><b>${esc(x.athlete && x.athlete.displayName)}</b></a> <span class="muted">· ${esc(teamLabel)}${x.details && x.details.type ? ' · ' + esc(x.details.type) : ''}${ret}</span><br><span class="muted">${esc((x.shortComment || '').slice(0, 160))}${(x.shortComment || '').length > 160 ? '…' : ''}</span></span></div>`;
}
async function recordMini() {
  const recs = await Promise.all(ORDER.map(k => record(LEAGUES[k])));
  let n = 0, hit = 0, br = 0, en = 0, ehit = 0, ebr = 0;
  recs.forEach(r => { if (!r || !r.games) return; r.games.forEach(g => { const y = g.hs > g.as ? 1 : 0; n++; hit += (g.p >= .5) === !!y; br += (y - g.p) ** 2; if (g.ep != null) { en++; ehit += (g.ep >= .5) === !!y; ebr += (y - g.ep) ** 2; } }); });
  if (!n) return '';
  return `<section class="card"><h3>Forecast record<a class="more" href="#record">How it's scored →</a></h3><div class="tw"><table class="t"><thead><tr><th></th><th>Games</th><th>Hit</th><th>Brier</th></tr></thead><tbody><tr><td><b>Hardwood</b></td><td>${n}</td><td>${(hit / n * 100).toFixed(1)}%</td><td>${(br / n).toFixed(3)}</td></tr>${en ? `<tr><td>ESPN</td><td>${en}</td><td>${(ehit / en * 100).toFixed(1)}%</td><td>${(ebr / en).toFixed(3)}</td></tr>` : ''}</tbody></table></div><p class="note">Every pregame call this season, scored nightly. Lower Brier is better.</p></section>`;
}
function injuriesMoving(lks, ctxs, ymd, games) {
  const items = [];
  lks.forEach(lk => { const L = LEAGUES[lk]; const ctx = ctxs[lk + ymd]; if (!ctx || !ctx.inj) return; games.filter(g => g.lk === lk && g.state !== 'post').forEach(g => { const f = forecast(L, g, ctx); if (f.soH) items.push({ abbr: g.home.abbr, so: f.soH, lk, id: g.home.id }); if (f.soA) items.push({ abbr: g.away.abbr, so: f.soA, lk, id: g.away.id }); }); });
  if (!items.length) return '';
  items.sort((a, b) => a.so.pts - b.so.pts);
  return `<section class="card"><h3>Injuries moving tonight's lines<a class="more" href="#news/nba/injuries">All →</a></h3>${items.slice(0, 8).map(x => `<div class="wire-item"><span class="t">${esc(x.abbr)}</span><span><span class="pill out">Out</span> <a href="${hrefT(x.lk, x.id)}">${esc(x.so.names.join(', '))}</a> <span class="muted">${sign(x.so.pts)}</span></span></div>`).join('')}<p class="note">Points of margin taken off the forecast for players ruled out, weighted by their scoring.</p></section>`;
}

/* ================= SCORES ================= */
async function scores(lkArg, dateArg) {
  const lk = lkOf(lkArg, true);
  const ymd = dateArg && /^\d{8}$/.test(dateArg) ? expand(dateArg) : todayCT();
  const isToday = ymd === todayCT();
  const lks = lk === 'all' ? ORDER : [lk];
  const title = isToday ? 'Today' : relDay(ymd);
  const nav = `<div class="datenav"><a class="btn sm ghost" href="${hrefS('scores', lk, compact(addDays(ymd, -1)))}" aria-label="Previous day">‹</a>${isToday ? '' : `<a class="btn sm ghost" href="${hrefS('scores', lk)}">Today</a>`}<input class="inp" type="date" id="gameDate" value="${ymd}" aria-label="Pick a date"><a class="btn sm ghost" href="${hrefS('scores', lk, compact(addDays(ymd, 1)))}" aria-label="Next day">›</a></div>`;
  const bind = () => { const el = document.getElementById('gameDate'); el && el.addEventListener('change', e => { if (e.target.value) location.hash = hrefS('scores', lk, compact(e.target.value)).slice(1); }); };
  const segHtml = seg('scores', lk, { all: true, sticky: true, arg: isToday ? null : compact(ymd) });
  $main.innerHTML = head(esc(title), '', nav) + segHtml + `<div class="page" style="margin-top:14px"><div class="col">${skeleton(4)}${skeleton(8)}</div><div class="side">${skeleton(6)}</div></div>`; bind();

  const boards = {}; const ctxs = {};
  await Promise.all(lks.map(async k => { const L = LEAGUES[k]; try { boards[k] = isToday ? S.today[k] : await scoreboard(L, ymd); } catch { boards[k] = null; } ctxs[k + ymd] = await forecastCtx(L, ymd); }));
  const ai = await aiFor(ymd);
  const stL = LEAGUES[lk === 'all' ? 'nba' : lk];
  const [st, mR, wR, newsD, recMini] = await Promise.all([standings(stL).catch(() => null), lk === 'all' || lk === 'ncaam' ? rankings(LEAGUES.ncaam) : null, lk === 'all' || lk === 'ncaaw' ? rankings(LEAGUES.ncaaw) : null, jSoft(`${API(stL)}/news?limit=8`, 600000), recordMini()]);

  const render = () => {
    const all = lks.flatMap(k => (isToday ? S.today[k] : boards[k]) || []);
    const total = all.length, live = all.filter(isLive).length, fin = all.filter(g => g.state === 'post').length;
    const d = `${esc(dayLabel(ymd, { weekday: 'short', month: 'short', day: 'numeric' }))} · ${total} game${total === 1 ? '' : 's'}${live ? ` · <span style="color:var(--live)">${live} live</span>` : ''}${fin && fin < total ? ` · ${fin} final` : ''}`;
    const left = [];
    const mine = all.filter(isFav);
    if (mine.length) left.push(`<div class="lg"><span>My teams</span></div><div class="games">${mine.map(g => gameCard(g, forecast(LEAGUES[g.lk], g, ctxs[g.lk + ymd]))).join('')}</div>`);
    if (isToday && total) {
      const cands = all.filter(g => g.state !== 'post').map(g => { const f = forecast(LEAGUES[g.lk], g, ctxs[g.lk + ymd]); const close = 1 - Math.abs(f.pHome - .5) * 2; return { g, f, s: interest(g) + close * 40 + (g.state === 'in' ? 15 : 0) }; }).sort((a, b) => b.s - a.s);
      if (cands.length) { const c = cands[0]; left.push(featured(LEAGUES[c.g.lk], c.g, c.f, aiEntry(ai, c.g))); }
    }
    lks.forEach(k => {
      const L = LEAGUES[k]; const list = (isToday ? S.today[k] : boards[k]);
      if (list === null) { left.push(`<div class="lg"><span>${esc(L.label)}</span></div>` + failMsg(`${L.label} games`)); return; }
      if (!list || !list.length) { if (lk !== 'all') left.push(state(`No ${L.noun} games ${isToday ? 'today' : 'on this date'}`, `<p>${k === 'wnba' && isToday ? 'The WNBA is in its off-season; the schedule returns in May.' : `Upcoming games and forecasts are on the <a href="${hrefS('forecasts', k)}">Forecasts</a> page.`}</p>`)); return; }
      const sorted = sortGames(list); const cap = lk === 'all' ? (k === 'nba' ? 16 : 8) : Infinity;
      const lv = list.filter(isLive).length;
      left.push(`<div class="lg"><span>${esc(L.label)} · ${list.length}${lv ? ` <span class="live">· ${lv} live</span>` : ''}</span>${lk === 'all' ? `<a href="${hrefS('scores', k, isToday ? null : compact(ymd))}">All ${esc(L.label)} →</a>` : (L.hasRankings ? '<span>ranked matchups first</span>' : '')}</div><div class="games">${sorted.slice(0, cap).map(g => gameCard(g, forecast(L, g, ctxs[k + ymd]))).join('')}</div>${sorted.length > cap ? `<a class="more-link" href="${hrefS('scores', k, isToday ? null : compact(ymd))}">See all ${sorted.length} ${esc(L.label)} games →</a>` : ''}`);
    });
    if (!total && lk === 'all') left.push(state(isToday ? 'No games today' : 'No games on this date', '<p>Off day across basketball. Upcoming games are on the <a href="#forecasts">Forecasts</a> page.</p>'));
    const right = [];
    if (st) right.push(standingsMini(stL, st, stL.key === 'nba' ? 'West' : null));
    right.push(injuriesMoving(lks.filter(k => LEAGUES[k].hasInjuries), ctxs, ymd, all));
    if (recMini) right.push(recMini);
    if (wR) right.push(rankMini(LEAGUES.ncaaw, wR, 10)); if (mR) right.push(rankMini(LEAGUES.ncaam, mR, 10));
    if (newsD && newsD.articles) right.push(`<section class="card"><h3>Latest<a class="more" href="${hrefS('news', stL.key)}">News →</a></h3>${newsD.articles.slice(0, 6).map(a => `<div class="wire-item"><span class="t">${esc(ago(a.published))}</span><a href="${esc(a.links && a.links.web && a.links.web.href || '#')}" target="_blank" rel="noopener">${esc(a.headline)}</a></div>`).join('')}</section>`);
    $main.innerHTML = head(esc(title), d, nav) + segHtml + `<div class="page" style="margin-top:14px"><div class="col">${left.join('')}</div><div class="side">${right.join('')}</div></div>`;
    bind();
  };
  render();
  return isToday ? { live: render } : null;
}

/* ================= GAME ================= */
async function game(lk, id) {
  const L = LEAGUES[lk]; if (!L) { $main.innerHTML = failMsg('this game'); return; }
  $main.innerHTML = `<div class="page"><div class="col">${skeleton(4)}${skeleton(10)}</div><div class="side">${skeleton(6)}</div></div>`;
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
    const espnLine = g.state === 'in' && wp.length ? `ESPN live: ${esc(g.home.abbr)} ${pct(wp[wp.length - 1].homeWinPercentage)}` : g.state === 'pre' && bpi != null ? `ESPN BPI: ${esc(g.home.abbr)} ${pct(bpi)}` : '';
    const out = [hero(L, g, f, ai || null, { actions: `<a class="btn sm ghost" style="color:var(--on-dark);box-shadow:inset 0 0 0 1px rgba(255,255,255,.3)" href="${hrefS('scores', lk, ymd === todayCT() ? null : compact(ymd))}">All ${esc(L.label)} games</a>` })];
    if (espnLine) out.push(`<p class="cmpline">${espnLine} · Hardwood ${esc(g.home.abbr)} ${pct(f.pHome)} · <a href="#record">our record</a></p>`);
    const per = Math.max(g.home.lines.length, g.away.lines.length); const reg = L.minutes === 48 ? 4 : 2;
    if (per) {
      const hdr = Array.from({ length: per }, (_, i) => `<th>${i < reg ? (reg === 4 ? 'Q' : 'H') + (i + 1) : 'OT' + (per > reg + 1 ? i - reg + 1 : '')}</th>`).join('');
      const row = s => `<tr><td class="l"><span class="team"><i class="tab-c" style="background:${s.color}"></i><a href="${hrefT(lk, s.id)}">${tn(s)}</a></span></td>${Array.from({ length: per }, (_, i) => `<td>${esc(s.lines[i] ?? '')}</td>`).join('')}<td><b>${esc(s.score ?? '')}</b></td></tr>`;
      out.push(`<section class="card"><h2>Scoring<small>${esc(d.gameInfo && d.gameInfo.attendance ? d.gameInfo.attendance.toLocaleString() + ' attendance' : '')}</small></h2><div class="tw"><table class="t"><thead><tr><th>Team</th>${hdr}<th>T</th></tr></thead><tbody>${row(g.away)}${row(g.home)}</tbody></table></div></section>`);
    }
    const bx = d.boxscore && d.boxscore.players || [];
    const boxFor = side => {
      const p = bx.find(x => String(x.team.id) === side.id); if (!p || !p.statistics || !p.statistics[0]) return '';
      const s = p.statistics[0]; const labels = s.labels || s.names || []; const ath = s.athletes || [];
      const rowOf = a => { const nm = `<a href="${hrefP(lk, esc(a.athlete.id))}">${esc(a.athlete.shortName || a.athlete.displayName)}</a> <span class="muted" style="font-weight:500">${esc(a.athlete.position && a.athlete.position.abbreviation || '')}</span>`; if (a.didNotPlay || !a.stats || !a.stats.length) return `<tr><td>${nm}</td><td class="dnp" colspan="${labels.length}">${esc(a.reason || 'Did not play')}</td></tr>`; return `<tr><td>${nm}</td>${a.stats.map(v => `<td>${esc(v)}</td>`).join('')}</tr>`; };
      const st = ath.filter(a => a.starter), bn = ath.filter(a => !a.starter);
      const tot = s.totals && s.totals.length ? `<tr class="tot"><td>Team</td>${s.totals.map(v => `<td>${esc(v)}</td>`).join('')}</tr>` : '';
      return `<section class="card"><h2>${tn(side)}<small>box score</small></h2><div class="tw"><table class="t box"><thead><tr><th>Player</th>${labels.map(l => `<th>${esc(l)}</th>`).join('')}</tr></thead><tbody>${st.length ? `<tr class="sub"><td colspan="${labels.length + 1}">Starters</td></tr>` + st.map(rowOf).join('') : ''}${bn.length ? `<tr class="sub"><td colspan="${labels.length + 1}">Bench</td></tr>` + bn.map(rowOf).join('') : ''}${tot}</tbody></table></div></section>`;
    };
    const boxes = [boxFor(g.away), boxFor(g.home)].filter(Boolean);
    const tms = d.boxscore && d.boxscore.teams || [];
    const ta = tms.find(t => String(t.team.id) === g.away.id), th = tms.find(t => String(t.team.id) === g.home.id);
    let compare = '', factors = '';
    if (ta && th && g.state !== 'pre') {
      const get = (t, n) => (t.statistics || []).find(x => x.name === n);
      const num = (t, n, part = 0) => { const x = get(t, n); if (!x) return null; return parseFloat(String(x.displayValue).split('-')[part]); };
      const want = ['fieldGoalsMade-fieldGoalsAttempted', 'fieldGoalPct', 'threePointFieldGoalsMade-threePointFieldGoalsAttempted', 'threePointFieldGoalPct', 'freeThrowsMade-freeThrowsAttempted', 'totalRebounds', 'offensiveRebounds', 'assists', 'steals', 'blocks', 'turnovers', 'pointsInPaint', 'fastBreakPoints', 'largestLead'];
      const rows = want.map(n => { const a = get(ta, n), h = get(th, n); if (!a || !h) return ''; const av = parseFloat(String(a.displayValue).split('-')[0]) || 0, hv = parseFloat(String(h.displayValue).split('-')[0]) || 0; const tot = av + hv || 1; const lowGood = n === 'turnovers'; return `<div class="cmp-row"><span>${esc(a.displayValue)}</span><div class="cmp-mid"><small>${esc(a.label || a.abbreviation || n)}</small><div class="cmp-bar"><i style="width:${av / tot * 100}%;background:${g.away.color};opacity:${(lowGood ? av <= hv : av >= hv) ? 1 : .4}"></i><i style="width:${hv / tot * 100}%;background:${g.home.color};opacity:${(lowGood ? hv <= av : hv >= av) ? 1 : .4}"></i></div></div><span>${esc(h.displayValue)}</span></div>`; }).join('');
      if (rows) compare = `<section class="card"><h2>Team stats<small>${esc(g.away.abbr)} · ${esc(g.home.abbr)}</small></h2><div class="compare">${rows}</div></section>`;
      const ff = (t, o, s) => { const fgm = num(t, 'fieldGoalsMade-fieldGoalsAttempted', 0), fga = num(t, 'fieldGoalsMade-fieldGoalsAttempted', 1), tpm = num(t, 'threePointFieldGoalsMade-threePointFieldGoalsAttempted', 0), fta = num(t, 'freeThrowsMade-freeThrowsAttempted', 1), orb = num(t, 'offensiveRebounds'), tov = num(t, 'turnovers'), odrb = num(o, 'defensiveRebounds'), oorb = num(o, 'offensiveRebounds'), ofga = num(o, 'fieldGoalsMade-fieldGoalsAttempted', 1), ofta = num(o, 'freeThrowsMade-freeThrowsAttempted', 1), otov = num(o, 'turnovers'); if ([fgm, fga, tpm, fta, orb, tov].some(v => v == null || isNaN(v))) return null; const poss = fga - orb + tov + 0.44 * fta; const oposs = ofga != null ? ofga - (oorb || 0) + (otov || 0) + 0.44 * (ofta || 0) : poss; return { efg: (fgm + 0.5 * tpm) / fga, ts: s.score / (2 * (fga + 0.44 * fta)), tov: tov / (fga + 0.44 * fta + tov), orb: odrb != null ? orb / (orb + odrb) : null, ftr: fta / fga, ortg: s.score / poss * 100, pace: (poss + oposs) / 2 }; };
      const A = ff(ta, th, g.away), Hh = ff(th, ta, g.home);
      if (A && Hh) { const r = (lbl, a, h, fmt, lowGood) => `<div class="cmp-row"><span${(lowGood ? a <= h : a >= h) ? ' class="w"' : ''}>${fmt(a)}</span><div class="cmp-mid"><small>${lbl}</small></div><span${(lowGood ? h <= a : h >= a) ? ' class="w"' : ''}>${fmt(h)}</span></div>`; const p1 = v => v == null ? '—' : (v * 100).toFixed(1) + '%', d1 = v => v == null ? '—' : v.toFixed(1); factors = `<section class="card"><h2>Four factors<small>${esc(g.away.abbr)} · ${esc(g.home.abbr)}</small></h2><div class="compare">${r('Effective FG%', A.efg, Hh.efg, p1)}${r('True shooting', A.ts, Hh.ts, p1)}${r('Turnover rate', A.tov, Hh.tov, p1, true)}${r('Off. rebound rate', A.orb, Hh.orb, p1)}${r('FT rate (FTA/FGA)', A.ftr, Hh.ftr, p1)}${r('Offensive rating', A.ortg, Hh.ortg, d1)}</div><p class="note">Pace: about ${d1(A.pace)} possessions per team${g.state === 'in' ? ' so far' : ''}. Offensive rating is points per 100 possessions.</p></section>`; }
    }
    let leaders = '';
    if (d.leaders && d.leaders.length) { const items = []; d.leaders.forEach(t => (t.leaders || []).slice(0, 3).forEach(cat => { const Ld = cat.leaders && cat.leaders[0]; if (Ld) items.push({ team: t.team, cat, Ld }); })); if (items.length) leaders = `<section class="card"><h2>${g.state === 'pre' ? 'Season leaders' : 'Game leaders'}</h2>${items.map(({ team, cat, Ld }) => `<div class="leader"><img src="${esc(Ld.athlete.headshot && (Ld.athlete.headshot.href || Ld.athlete.headshot) || '')}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><div><a href="${hrefP(lk, esc(Ld.athlete.id))}">${esc(Ld.athlete.displayName)}</a><small>${esc(team.abbreviation)} · ${esc(cat.displayName)}${Ld.summary ? ' · ' + esc(Ld.summary) : ''}</small></div><b>${esc(Ld.displayValue)}</b></div>`).join('')}</section>`; }
    let wpChart = '';
    if (wp.length > 3) { const W = 600, Hc = 160, n = wp.length; const pts = wp.map((x, i) => `${(i / (n - 1) * W).toFixed(1)},${((1 - x.homeWinPercentage) * Hc).toFixed(1)}`).join(' '); const labels = reg === 4 ? ['Q1', 'Q2', 'Q3', 'Q4'] : ['1st half', '2nd half']; wpChart = `<section class="card wp"><h2>Win probability<small>ESPN · ${esc(g.home.abbr)} above the line</small></h2><svg viewBox="-34 -8 ${W + 44} ${Hc + 26}" role="img" aria-label="Win probability over the game"><line x1="0" y1="${Hc / 2}" x2="${W}" y2="${Hc / 2}" stroke="currentColor" stroke-opacity=".25" stroke-dasharray="4 4"/>${labels.map((_, i) => `<line x1="${(i + 1) / labels.length * W}" y1="0" x2="${(i + 1) / labels.length * W}" y2="${Hc}" stroke="currentColor" stroke-opacity=".08"/>`).join('')}<polygon points="0,${Hc / 2} ${pts} ${W},${Hc / 2}" fill="${g.home.color}" fill-opacity=".18"/><polyline points="${pts}" fill="none" stroke="${g.home.color}" stroke-width="2.5"/><text x="-6" y="10" text-anchor="end">${esc(g.home.abbr)}</text><text x="-6" y="${Hc}" text-anchor="end">${esc(g.away.abbr)}</text><text x="-6" y="${Hc / 2 + 3}" text-anchor="end">50%</text>${labels.map((q, i) => `<text x="${(i + .5) / labels.length * W}" y="${Hc + 16}" text-anchor="middle">${q}</text>`).join('')}</svg></section>`; }
    let inj = '';
    if (d.injuries && d.injuries.some(t => t.injuries && t.injuries.length)) inj = `<section class="card"><h2>Injuries</h2>${d.injuries.map(t => (t.injuries || []).map(x => injItem(x, t.team && t.team.abbreviation, L)).join('')).join('')}</section>`;
    let l5 = '';
    if (d.lastFiveGames && d.lastFiveGames.length) l5 = `<section class="card"><h2>Last five</h2>${d.lastFiveGames.map(t => `<p style="margin:0 0 10px"><b>${esc(t.team && t.team.displayName)}</b><br>${(t.events || []).map(e => `<span class="chip"><span class="${e.gameResult === 'W' ? 'w' : 'lo'}">${esc(e.gameResult)}</span> ${esc(e.atVs)} ${esc(e.opponent && e.opponent.abbreviation)} ${esc(e.score)}</span>`).join(' ')}</p>`).join('')}${d.seasonseries && d.seasonseries[0] ? `<p class="note">Season series: ${esc(d.seasonseries[0].summary || d.seasonseries[0].description || '')}</p>` : ''}</section>`;
    let recap = '';
    const art = d.article; const arts = d.news && d.news.articles || [];
    if ((art && art.headline) || arts.length) { const list = [art && art.headline ? { headline: art.headline, href: art.links && art.links.web && art.links.web.href, desc: art.description } : null, ...arts.slice(0, 4).map(a => ({ headline: a.headline, href: a.links && a.links.web && a.links.web.href, desc: a.description }))].filter(Boolean); recap = `<section class="card"><h2>${g.state === 'post' ? 'Recap & stories' : 'Stories'}</h2>${list.map(a => `<div class="wire-item"><span><a href="${esc(a.href || '#')}" target="_blank" rel="noopener"><b>${esc(a.headline)}</b></a>${a.desc ? `<br><span class="muted">${esc(a.desc)}</span>` : ''}</span></div>`).join('')}</section>`; }
    $main.innerHTML = `<div class="page"><div class="col">${out.join('')}${boxes.join('')}${wpChart}</div><div class="side">${factors}${compare}${leaders}${inj}${l5}${recap}</div></div>`;
  };
  await render();
  return { live: async () => { const st = data.header && data.header.competitions[0].status.type.state; const g = S.today[lk].find(x => x.id === id); if ((g && g.state !== 'post') || st === 'in') { try { await load(15000); await render(); } catch { } } } };
}

/* ================= STANDINGS ================= */
async function standingsView(lkArg) {
  const lk = lkOf(lkArg, false); remember(lk); const L = LEAGUES[lk];
  const top = head('Standings', '') + seg('standings', lk, { sticky: true });
  $main.innerHTML = top + skeleton(12);
  let cur; try { cur = await standings(L); } catch { $main.innerHTML = top + failMsg('standings'); return; }
  const conf = L.standingsMode === 'conferences';
  const cols = conf ? `<th>W</th><th>L</th><th>Pct</th><th>Conf</th><th>Home</th><th>Road</th><th>Strk</th><th>PPG</th><th>Opp</th><th>Net</th>` : `<th>W</th><th>L</th><th>Pct</th><th>GB</th><th>Home</th><th>Road</th><th>L10</th><th>Strk</th><th>PPG</th><th>Opp</th><th>Net</th>`;
  const row = (r, i, cut) => `<tr class="click${favs.has(lk, r.id) ? ' fav' : ''}${cut ? ' cut' : ''}" data-href="${hrefT(lk, r.id)}"><td><span class="team"><span class="rank">${i + 1}</span><img class="headshot sq" src="${esc(r.logo)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><a href="${hrefT(lk, r.id)}">${esc(r.name)}</a></span></td><td>${r.w}</td><td>${r.l}</td><td>${esc(r.pct)}</td>${conf ? `<td>${esc(r.conf)}</td>` : `<td>${esc(r.gb)}</td>`}<td>${esc(r.home)}</td><td>${esc(r.road)}</td>${conf ? '' : `<td>${esc(r.l10)}</td>`}<td>${esc(r.strk)}</td><td>${r.ppg != null ? (+r.ppg).toFixed(1) : ''}</td><td>${r.opp != null ? (+r.opp).toFixed(1) : ''}</td><td class="${r.diff > 0 ? 'w' : r.diff < 0 ? 'lo' : ''}">${r.diff != null ? sign(+r.diff) : ''}</td></tr>`;
  const groupsSorted = [...cur.groups].sort((a, b) => { const fa = a.rows.some(r => favs.has(lk, r.id)), fb = b.rows.some(r => favs.has(lk, r.id)); return fb - fa || a.name.localeCompare(b.name); });
  const render = (m) => {
    let body;
    if (m === 'league') { const all = cur.groups.flatMap(c => c.rows).sort((a, b) => (b.w / Math.max(1, b.w + b.l)) - (a.w / Math.max(1, a.w + a.l)) || (b.diff || 0) - (a.diff || 0)); body = `<section class="card"><div class="tw"><table class="t"><thead><tr><th>${conf ? 'All Division I' : 'League'}</th>${cols}</tr></thead><tbody>${all.map((r, i) => row(r, i)).join('')}</tbody></table></div></section>`; }
    else { const sel = conf ? store.get('stGroup:' + lk, '') : ''; const list = conf && sel ? groupsSorted.filter(c => c.name === sel) : groupsSorted; body = `<div class="col">${list.map(c => `<section class="card"><h2>${esc(c.name)}<small>${conf ? c.rows.length + ' teams' : lk === 'nba' ? 'top 6 playoff · 7–10 play-in' : ''}</small></h2><div class="tw"><table class="t"><thead><tr><th>Team</th>${cols}</tr></thead><tbody>${c.rows.map((r, i) => row(r, i, (L.playoffLine || []).includes(i + 1))).join('')}</tbody></table></div></section>`).join('')}</div>`; }
    const picker = conf && m !== 'league' ? `<select class="sel" id="stGroup" aria-label="Conference"><option value="">All conferences</option>${groupsSorted.map(c => `<option value="${esc(c.name)}"${store.get('stGroup:' + lk, '') === c.name ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select>` : '';
    $main.innerHTML = head('Standings', `${esc(cur.season || '')} ${esc(L.label)} · Net is average point margin`) + seg('standings', lk, { sticky: true }) + `<div class="ctrls" style="margin-top:14px"><div class="tabs" style="margin:0;border:0" role="tablist"><button class="${m !== 'league' ? 'on' : ''}" role="tab" aria-selected="${m !== 'league'}" data-act="stmode" data-m="conf">${conf ? 'By conference' : L.standingsMode === 'league' ? 'League' : 'By conference'}</button><button class="${m === 'league' ? 'on' : ''}" role="tab" aria-selected="${m === 'league'}" data-act="stmode" data-m="league">${conf ? 'All teams' : 'League'}</button></div>${picker}</div>${body}`;
    const sg = document.getElementById('stGroup'); sg && sg.addEventListener('change', e => { store.set('stGroup:' + lk, e.target.value); render(m); });
  };
  render(store.get('stMode:' + lk, 'conf'));
  standingsView.render = m => { store.set('stMode:' + lk, m); render(m); };
}

/* ================= RANKINGS ================= */
async function rankingsView(lkArg) {
  const lk = COLLEGE.includes(lkArg) ? lkArg : (COLLEGE.includes(store.get('lk')) ? store.get('lk') : 'ncaam'); remember(lk); const L = LEAGUES[lk];
  const top = head('Rankings', '') + seg('rankings', lk, { leagues: COLLEGE, sticky: true });
  $main.innerHTML = top + skeleton(12);
  const [R, rt] = await Promise.all([rankings(L), HW.ratings(L)]);
  if (!R) { $main.innerHTML = top + failMsg('rankings'); return; }
  const eloRank = {}; if (rt && rt.teams) Object.entries(rt.teams).map(([id, v]) => ({ id, elo: v.elo })).sort((a, b) => b.elo - a.elo).forEach((t, i) => eloRank[t.id] = i + 1);
  $main.innerHTML = head(esc(R.name), `${esc(L.label)}${R.week ? ' · ' + esc(R.week) : ''}`) + seg('rankings', lk, { leagues: COLLEGE, sticky: true }) + `<section class="card" style="margin-top:14px"><div class="tw"><table class="t"><thead><tr><th>Team</th><th>Record</th><th>Pts</th><th>1st</th><th>Prev</th><th>Trend</th><th>Hardwood</th></tr></thead><tbody>${R.ranks.map(r => `<tr class="click${favs.has(lk, r.team.id) ? ' fav' : ''}" data-href="${hrefT(lk, r.team.id)}"><td><span class="team"><span class="rank">${r.rank}</span><img class="headshot sq" src="${esc(r.team.logo || '')}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><a href="${hrefT(lk, r.team.id)}">${esc(r.team.name)}</a></span></td><td>${esc(r.rec || '')}</td><td>${esc(r.pts || '')}</td><td>${r.first ? esc(r.first) : ''}</td><td>${esc(r.prev || '')}</td><td class="${/^\+/.test(r.trend || '') ? 'w' : /^-\d/.test(r.trend || '') ? 'lo' : ''}">${esc(r.trend && r.trend !== '-' ? r.trend : '')}</td><td>${eloRank[r.team.id] ? '#' + eloRank[r.team.id] : '—'}</td></tr>`).join('')}</tbody></table></div><p class="note">"Hardwood" is where the team sits in our Elo power ratings, which ignore reputation and only move on results.</p></section>`;
}

/* ================= TEAMS ================= */
async function teams(lkArg) {
  const lk = lkOf(lkArg, false); remember(lk); const L = LEAGUES[lk];
  const top = head('Teams', '') + seg('teams', lk, { sticky: true });
  $main.innerHTML = top + skeleton(8);
  const [cur, R] = await Promise.all([standings(L).catch(() => null), rankings(L)]);
  if (!cur || !cur.groups.length) { $main.innerHTML = top + failMsg('teams'); return; }
  const rankOf = {}; (R && R.ranks || []).forEach(r => rankOf[r.team.id] = r.rank);
  const card = r => `<a class="team-card" href="${hrefT(lk, r.id)}"><img src="${esc(r.logo)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><span style="min-width:0"><b>${rankOf[r.id] ? `<span class="rk">${rankOf[r.id]}</span>` : ''}${esc(r.name)}</b><small>${r.w}–${r.l}${L.standingsMode === 'conferences' ? ` · ${esc(r.conf || '')} ${esc(r.groupAbbr || r.group)}` : ` · ${ordinal(r.pos)} in ${esc(r.groupAbbr || r.group)}`}</small></span>${favs.has(lk, r.id) ? '<span class="star" aria-label="Favorite">★</span>' : ''}</a>`;
  const myIds = favs.all()[lk] || []; const mine = cur.groups.flatMap(c => c.rows).filter(r => myIds.includes(r.id));
  const q = L.standingsMode === 'conferences' ? `<div class="ctrls" style="margin-top:14px"><input class="inp" id="teamq" type="search" placeholder="Find a school or conference" aria-label="Find a team"></div>` : '<div style="height:14px"></div>';
  $main.innerHTML = head('Teams', `${cur.groups.reduce((n, c) => n + c.rows.length, 0)} ${esc(L.label)} teams`) + seg('teams', lk, { sticky: true }) + q + (mine.length ? `<h2 class="conf-h" style="margin-top:4px">My teams</h2><div class="teams">${mine.map(card).join('')}</div>` : '') + cur.groups.map(gp => `<div class="tgroup" data-name="${esc(gp.name.toLowerCase())}"><h2 class="conf-h">${esc(gp.name)}</h2><div class="teams">${gp.rows.map(card).join('')}</div></div>`).join('');
  const inp = document.getElementById('teamq');
  if (inp) inp.addEventListener('input', () => { const v = inp.value.trim().toLowerCase(); document.querySelectorAll('.tgroup').forEach(gq => { let any = false; gq.querySelectorAll('.team-card').forEach(c => { const hit = !v || c.textContent.toLowerCase().includes(v) || gq.dataset.name.includes(v); c.hidden = !hit; any = any || hit; }); gq.hidden = !any; }); });
}

/* ---------- player table ---------- */
const PCOLS = [['gp', 'GP', 0], ['min', 'MIN', 1], ['pts', 'PTS', 1], ['reb', 'REB', 1], ['ast', 'AST', 1], ['stl', 'STL', 1], ['blk', 'BLK', 1], ['tov', 'TO', 1], ['fg', 'FG%', 1], ['tp', '3P%', 1], ['tpm', '3PM', 1], ['ft', 'FT%', 1], ['ts', 'TS%', 1]];
function playerTable(lk, rows, sortKey, showTeam = true, limit = Infinity) {
  return `<div class="tw"><table class="t"><thead><tr><th>Player</th>${showTeam ? '<th class="l">Team</th>' : ''}<th class="l">Pos</th>${PCOLS.map(([k, l]) => `<th class="sortable${k === sortKey ? ' sorted' : ''}" data-act="psort" data-k="${k}" tabindex="0" aria-sort="${k === sortKey ? 'descending' : 'none'}">${l}</th>`).join('')}</tr></thead><tbody>${rows.slice(0, limit).map((r, i) => `<tr class="click${favs.has(lk, r.teamId) ? ' fav' : ''}" data-href="${hrefP(lk, r.id)}"><td><span class="team"><span class="rank">${i + 1}</span><img class="headshot" src="${esc(r.img || '')}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><a href="${hrefP(lk, r.id)}">${esc(r.name)}</a></span></td>${showTeam ? `<td class="l"><a href="${hrefT(lk, r.teamId)}">${esc(r.team)}</a></td>` : ''}<td class="l">${esc(r.pos)}</td>${PCOLS.map(([k, , dp]) => `<td>${(+r[k] || 0).toFixed(dp)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

/* ================= PLAYERS ================= */
const PST = {};
async function players(lkArg) {
  const lk = lkOf(lkArg, false); remember(lk); const L = LEAGUES[lk];
  const P = PST[lk] = PST[lk] || { sort: 'pts', q: '', pos: '', qual: true, season: '', limit: 100 };
  const top = head('Players', `Loading every ${esc(L.noun)} player…`) + seg('players', lk, { sticky: true });
  $main.innerHTML = top + skeleton(14);
  let data; try { data = await leaguePlayers(L, P.season); } catch { $main.innerHTML = top + failMsg('player stats'); return; }
  const paint = () => {
    const maxGp = Math.max(1, ...data.rows.map(r => r.gp)); const minGp = Math.ceil(maxGp * 0.5);
    let rows = data.rows.filter(r => (!P.q || (r.name + ' ' + r.team).toLowerCase().includes(P.q.toLowerCase())) && (!P.pos || r.pos.includes(P.pos)) && (!P.qual || r.gp >= minGp));
    rows.sort((a, b) => (b[P.sort] || 0) - (a[P.sort] || 0));
    document.getElementById('ptable').innerHTML = (rows.length ? playerTable(lk, rows, P.sort, true, P.limit) : `<p class="muted">No players match that.</p>`) + (rows.length > P.limit ? `<div style="margin-top:12px"><button class="btn sm ghost" data-act="pmore">Show ${Math.min(100, rows.length - P.limit)} more of ${rows.length}</button></div>` : '');
    document.getElementById('pcount').textContent = `${rows.length} players${P.qual ? ` · at least ${minGp} game${minGp === 1 ? '' : 's'}` : ''}`;
  };
  $main.innerHTML = head('Players', `${esc(data.label ? data.label + ' · ' : '')}${esc(L.label)} per-game averages · tap a column to sort · TS% is true shooting`) + seg('players', lk, { sticky: true }) +
    `<div class="ctrls" style="margin-top:14px"><input class="inp" id="pq" type="search" placeholder="Search a player or team" value="${esc(P.q)}" aria-label="Search players">
    <select class="sel" id="ppos" aria-label="Position"><option value="">All positions</option><option value="G"${P.pos === 'G' ? ' selected' : ''}>Guards</option><option value="F"${P.pos === 'F' ? ' selected' : ''}>Forwards</option><option value="C"${P.pos === 'C' ? ' selected' : ''}>Centers</option></select>
    <select class="sel" id="pseason" aria-label="Season"><option value=""${!P.season ? ' selected' : ''}>This season</option><option value="${seasonYear() - 1}"${P.season ? ' selected' : ''}>Last season</option></select>
    <label class="chip" style="min-height:38px;cursor:pointer"><input type="checkbox" id="pqual" ${P.qual ? 'checked' : ''}> Regulars only</label></div>
    <section class="card"><h2>${esc(L.label)}<small id="pcount"></small></h2><div id="ptable"></div></section>${COLLEGE.includes(lk) ? '<p class="note">College lists the top 800 scorers; search by name for anyone else.</p>' : ''}`;
  paint();
  const q = document.getElementById('pq'); let t;
  q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { P.q = q.value.trim(); P.limit = 100; paint(); }, 150); });
  document.getElementById('ppos').addEventListener('change', e => { P.pos = e.target.value; paint(); });
  document.getElementById('pqual').addEventListener('change', e => { P.qual = e.target.checked; paint(); });
  document.getElementById('pseason').addEventListener('change', e => { P.season = e.target.value; players(lk); });
  players.paint = paint; players.st = P;
}

/* ================= TEAM ================= */
async function team(lk, id) {
  const L = LEAGUES[lk]; if (!L) { $main.innerHTML = failMsg('this team'); return; } remember(lk);
  $main.innerHTML = `<div class="page"><div class="col">${skeleton(4)}${skeleton(12)}</div><div class="side">${skeleton(10)}</div></div>`;
  const [roster, sched, cur, R] = await Promise.all([jSoft(`${API(L)}/teams/${id}/roster`, 900000), jSoft(`${API(L)}/teams/${id}/schedule`, 300000), standings(L).catch(() => null), rankings(L)]);
  const t0 = (roster && roster.team) || (sched && sched.team);
  if (!t0) { $main.innerHTML = failMsg('this team'); return; }
  const r = cur && cur.byId[String(id)];
  const rank = R && (R.ranks.find(x => x.team.id === String(id)) || {}).rank;
  const logo = t0.logo || (t0.logos && t0.logos[0] && t0.logos[0].href) || logoUrl(L, t0.abbreviation);
  const evs = (sched && sched.events || []).map(e => parseEvent(e, L));
  const next = evs.find(g => g.state !== 'post');
  let nextHtml = '';
  if (next) { const ctx = await forecastCtx(L, ymdOf(next.date)); const f = forecast(L, next, ctx); const homeSide = next.home.id === String(id); const opp = homeSide ? next.away : next.home; const pTeam = homeSide ? f.pHome : 1 - f.pHome; nextHtml = `<div class="foot"><div><div class="fbar-l"><span>Next: ${homeSide ? 'vs' : 'at'} ${tn(opp)} · ${esc(relDay(ymdOf(next.date)))} ${esc(tip(next.date))} CT</span><span>${next.state === 'in' ? 'live' : 'forecast'} <b>${pct(pTeam)}</b> to win</span></div><div class="fbar"><i style="width:${pTeam * 100}%;background:var(--accent)"></i><i style="width:${(1 - pTeam) * 100}%;background:${opp.color};opacity:.85"></i></div></div><a class="btn sm" href="${hrefG(lk, next.id)}">${next.state === 'in' ? 'Live' : 'Preview'}</a></div>`; }
  const isF = favs.has(lk, id);
  const sub = [r ? `${r.w}–${r.l}` : t0.recordSummary, t0.standingSummary || (r && L.standingsMode !== 'conferences' ? `${ordinal(r.pos)} in ${r.group}` : r ? `${r.conf || ''} in ${r.group}` : ''), r && r.strk ? 'streak ' + r.strk : ''].filter(Boolean).join(' · ');
  const hd = `<article class="hero"><div class="ent-head"><img class="logo" src="${esc(logo)}" alt="" onerror="this.style.visibility='hidden'"><div style="min-width:0"><h1>${rank ? `<span class="rk" style="color:var(--accent);font-size:.6em">${rank}</span>` : ''}${esc(t0.displayName)}</h1><div class="sub">${esc(L.label)} · ${esc(sub)}</div><div style="margin-top:10px"><button class="star-btn" data-act="fav" data-lk="${lk}" data-id="${esc(id)}" aria-pressed="${isF}">${isF ? '★ In my teams' : '☆ Add to my teams'}</button></div></div></div>
    ${r ? `<div class="stats"><div><b>${r.ppg != null ? (+r.ppg).toFixed(1) : '—'}</b><small>Points</small></div><div><b>${r.opp != null ? (+r.opp).toFixed(1) : '—'}</b><small>Allowed</small></div><div><b>${r.diff != null ? sign(+r.diff) : '—'}</b><small>Net</small></div><div><b>${esc(r.home || '—')}</b><small>Home</small></div><div><b>${esc(r.road || '—')}</b><small>Road</small></div><div><b>${esc(L.standingsMode === 'conferences' ? (r.conf || '—') : (r.l10 || '—'))}</b><small>${L.standingsMode === 'conferences' ? 'Conf' : 'Last 10'}</small></div></div>` : ''}${nextHtml}</article>`;
  const ath = (roster && roster.athletes || []).flatMap(a => a.items ? a.items : [a]);
  const rosterHtml = ath.length ? `<section class="card"><h2>Roster<small>${ath.length} players</small></h2><div class="tw"><table class="t"><thead><tr><th>Player</th><th>#</th><th class="l">Pos</th><th>${COLLEGE.includes(lk) ? 'Yr' : 'Age'}</th><th>Ht</th><th>Wt</th><th class="l">Status</th></tr></thead><tbody>${ath.map(a => `<tr class="click" data-href="${hrefP(lk, a.id)}"><td><span class="team"><img class="headshot" src="${esc(a.headshot && a.headshot.href || '')}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><a href="${hrefP(lk, a.id)}">${esc(a.displayName)}</a></span></td><td>${esc(a.jersey || '')}</td><td class="l">${esc(a.position && a.position.abbreviation || '')}</td><td>${esc(COLLEGE.includes(lk) ? (a.experience && a.experience.abbreviation || '') : (a.age || ''))}</td><td>${esc(a.displayHeight || '')}</td><td>${esc((a.displayWeight || '').replace(' lbs', ''))}</td><td class="l">${a.injuries && a.injuries.length ? injPill(a.injuries[0].status) : '<span class="muted">Active</span>'}</td></tr>`).join('')}</tbody></table></div></section>` : '';
  const done = evs.filter(g => g.state === 'post').slice(-12).reverse(), up = evs.filter(g => g.state !== 'post').slice(0, 10);
  const sRow = g => { const homeSide = g.home.id === String(id); const me = homeSide ? g.home : g.away, op = homeSide ? g.away : g.home; const res = g.state === 'post' ? `<span class="${(me.score > op.score) ? 'w' : 'lo'}">${me.score > op.score ? 'W' : 'L'}</span> ${me.score}–${op.score}` : g.state === 'in' ? `<span style="color:var(--live)">Live</span> ${me.score}–${op.score}` : `${esc(tip(g.date))}`; return `<tr class="click" data-href="${hrefG(lk, g.id)}"><td>${esc(dateShort(g.date))}</td><td class="l">${g.neutral ? 'vs' : homeSide ? 'vs' : '@'} <a href="${hrefT(lk, op.id)}">${tn(op)}</a></td><td>${res}</td></tr>`; };
  const schedHtml = `<section class="card"><h2>Schedule<small>${evs.length} games</small></h2><div class="tw"><table class="t"><tbody>${up.length ? `<tr class="sub"><td colspan="3">Coming up</td></tr>${up.map(sRow).join('')}` : ''}${done.length ? `<tr class="sub"><td colspan="3">Recent</td></tr>${done.map(sRow).join('')}` : ''}</tbody></table></div></section>`;
  $main.innerHTML = `<div class="page"><div class="col">${hd}<div id="tstats">${skeleton(6)}</div>${rosterHtml}</div><div class="side">${schedHtml}</div></div>`;
  try { const lp = await leaguePlayers(L); const mine = lp.rows.filter(p => p.teamId === String(id)).sort((a, b) => b.pts - a.pts); document.getElementById('tstats').innerHTML = mine.length ? `<section class="card"><h2>Season stats<small>${esc(lp.label)} · per game</small></h2>${playerTable(lk, mine, 'pts', false)}</section>` : ''; } catch { const el = document.getElementById('tstats'); if (el) el.innerHTML = ''; }
}

/* ================= PLAYER ================= */
async function player(lk, id) {
  const L = LEAGUES[lk]; if (!L) { $main.innerHTML = failMsg('this player'); return; } remember(lk);
  $main.innerHTML = `<div class="page"><div class="col">${skeleton(5)}${skeleton(10)}</div><div class="side">${skeleton(8)}</div></div>`;
  const [bio, ov, gl] = await Promise.all([jSoft(`${WEB(L)}/athletes/${id}`, 3600000), jSoft(`${WEB(L)}/athletes/${id}/overview`, 600000), jSoft(`${WEB(L)}/athletes/${id}/gamelog`, 600000)]);
  const a = bio && (bio.athlete || bio);
  if (!a || !a.displayName) { $main.innerHTML = failMsg('this player'); return; }
  const tm = a.team || {};
  const st = ov && ov.statistics; const labels = st && st.labels || [];
  const reg = st && st.splits && (st.splits.find(s => /regular/i.test(s.displayName)) || st.splits[0]);
  const val = l => { const i = labels.indexOf(l); return reg && i >= 0 ? reg.stats[i] : '—'; };
  const facts = [a.position && a.position.displayName, a.jersey && '#' + a.jersey, a.displayHeight, a.displayWeight, COLLEGE.includes(lk) ? (a.experience && a.experience.displayValue) : (a.age && `age ${a.age}`), a.college && a.college.name, a.displayDraft || (a.draft && a.draft.displayText), a.birthPlace && COLLEGE.includes(lk) ? [a.birthPlace.city, a.birthPlace.state].filter(Boolean).join(', ') : ''].filter(Boolean);
  const injury = a.injuries && a.injuries[0];
  const hd = `<article class="hero"><div class="ent-head"><img src="${esc(a.headshot && a.headshot.href || '')}" alt="" onerror="this.style.visibility='hidden'"><div style="min-width:0"><h1>${esc(a.displayName)}</h1><div class="sub">${tm.id ? `<a href="${hrefT(lk, esc(tm.id))}">${esc(tm.displayName)}</a> · ` : ''}${esc(facts.join(' · '))}</div>${injury ? `<div style="margin-top:8px">${injPill(injury.status)} <span class="sub" style="display:inline">${esc(injury.details && injury.details.type || '')}${injury.details && injury.details.returnDate ? ' · ESPN est. return ' + esc(dateShort(injury.details.returnDate)) : ''}</span></div>` : ''}</div></div>
    <div class="stats">${['PTS', 'REB', 'AST', 'FG%', '3P%', 'MIN'].map(l => `<div><b>${esc(val(l))}</b><small>${l === 'MIN' ? 'Minutes' : l}</small></div>`).join('')}</div></article>`;
  const splits = st && st.splits && st.splits.length ? `<section class="card"><h2>Averages<small>per game</small></h2><div class="tw"><table class="t"><thead><tr><th></th>${labels.map(l => `<th>${esc(l)}</th>`).join('')}</tr></thead><tbody>${st.splits.map(s => `<tr><td><b>${esc(s.displayName)}</b></td>${s.stats.map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>` : '';
  let log = '';
  if (gl && gl.events && gl.seasonTypes) { const Lb = gl.labels || []; const evRows = []; gl.seasonTypes.forEach(stp => (stp.categories || []).forEach(c => (c.events || []).forEach(e => { const meta = gl.events[e.eventId]; if (meta) evRows.push({ meta, stats: e.stats, id: e.eventId }); }))); evRows.sort((x, y) => new Date(y.meta.gameDate) - new Date(x.meta.gameDate)); if (evRows.length) log = `<section class="card"><h2>Game log<small>last ${Math.min(15, evRows.length)}</small></h2><div class="tw"><table class="t"><thead><tr><th>Date</th><th class="l">Opp</th><th class="l">Result</th>${Lb.map(l => `<th>${esc(l)}</th>`).join('')}</tr></thead><tbody>${evRows.slice(0, 15).map(r => `<tr class="click" data-href="${hrefG(lk, esc(r.id))}"><td>${esc(dateShort(r.meta.gameDate))}</td><td class="l">${esc(r.meta.atVs || '')} ${esc(r.meta.opponent && r.meta.opponent.abbreviation || '')}</td><td class="l"><span class="${r.meta.gameResult === 'W' ? 'w' : 'lo'}">${esc(r.meta.gameResult || '')}</span> ${esc(r.meta.score || '')}</td>${(r.stats || []).map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>`; }
  const news = ov && ov.news && ov.news.length ? `<section class="card"><h2>News</h2>${ov.news.slice(0, 8).map(n => `<div class="wire-item"><span class="t">${esc(n.published ? ago(n.published) : '')}</span><a href="${esc(n.links && n.links.web && n.links.web.href || '#')}" target="_blank" rel="noopener">${esc(n.headline)}</a></div>`).join('')}</section>` : '';
  $main.innerHTML = `<div class="page"><div class="col">${hd}${splits}${log}</div><div class="side">${news || state('No recent news', '<p>Nothing new on this player in the feed.</p>')}</div></div>`;
}

/* ================= FORECASTS ================= */
async function forecasts(lkArg) {
  const lk = lkOf(lkArg, true); const lks = lk === 'all' ? ORDER : [lk];
  const top = head('Forecasts', 'The next seven days') + seg('forecasts', lk, { all: true, sticky: true });
  $main.innerHTML = top + skeleton(10);
  const t = todayCT(); const days = Array.from({ length: 7 }, (_, i) => addDays(t, i));
  const ais = await Promise.all(days.map(aiFor));
  const per = {};
  await Promise.all(lks.map(async k => { const L = LEAGUES[k]; const boards = await Promise.all(days.map(d => scoreboard(L, d).catch(() => []))); const base = await forecastCtx(L, t); const yday = await scoreboard(L, addDays(t, -1)).catch(() => []); const rt = await HW.ratings(L); per[k] = { boards, base, yday, rt }; }));
  const sections = days.map((d, i) => {
    const groups = lks.map(k => { const L = LEAGUES[k]; const P = per[k]; const gs = sortGames(P.boards[i].filter(g => g.state !== 'post')); if (!gs.length) return ''; const played = new Set((i === 0 ? P.yday : P.boards[i - 1]).filter(g => g.state !== 'pre').flatMap(g => [g.home.id, g.away.id])); const ctx = { ...P.base, b2b: played }; const cap = lk === 'all' ? (k === 'nba' ? 16 : 6) : (COLLEGE.includes(k) ? 40 : 30); return `<div class="lg" style="margin-top:14px"><span>${esc(L.label)} · ${gs.length}</span>${gs.length > cap ? `<a href="${hrefS('scores', k, compact(d))}">All ${gs.length} →</a>` : ''}</div><div class="fc-list">${gs.slice(0, cap).map(g => fcRow(L, g, forecast(L, g, ctx), aiEntry(ais[i], g))).join('')}</div>`; }).filter(Boolean);
    if (!groups.length) return '';
    return `<section class="card"><h2>${esc(relDay(d))}<small>${esc(dayLabel(d, { weekday: 'short', month: 'short', day: 'numeric' }))}${ais[i] ? ' · AI reads in' : ''}</small></h2>${groups.join('')}</section>`;
  }).join('');
  const side = [];
  if (lk !== 'all' && per[lk].rt && per[lk].rt.teams) { const L = LEAGUES[lk]; const rt = per[lk].rt; const topT = Object.entries(rt.teams).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.elo - a.elo).slice(0, 15); side.push(`<section class="card"><h3>Power ratings<small>Elo · updated ${esc(rt.generated ? ago(rt.generated) : '')}</small></h3><div class="tw"><table class="t"><thead><tr><th>Team</th><th>Elo</th><th>vs avg</th><th>GP</th></tr></thead><tbody>${topT.map((r, i) => `<tr class="click${favs.has(lk, r.id) ? ' fav' : ''}" data-href="${hrefT(lk, r.id)}"><td><span class="team"><span class="rank">${i + 1}</span><a href="${hrefT(lk, r.id)}">${esc(r.name || r.abbr || r.id)}</a></span></td><td>${Math.round(r.elo)}</td><td>${sign((r.elo - 1500) / L.eloPerPoint)}</td><td>${r.gp || 0}</td></tr>`).join('')}</tbody></table></div><p class="note">"vs avg" is the projected margin against an average team on a neutral floor.</p></section>`); }
  side.push(`<section class="card"><h3>How it works<a class="more" href="#record">Our record →</a></h3><p style="margin:0 0 8px;font-size:13.5px">Every team carries an Elo rating that moves after each game by how surprising the result was and how big the margin was. It's rebuilt nightly from every result this season, starting from last season's margins (NBA, WNBA) or the preseason poll (college).</p><p style="margin:0 0 8px;font-size:13.5px">Projected margin = rating gap + home court (${ORDER.map(k => `${LEAGUES[k].label} ${LEAGUES[k].hca}`).join(', ')}) − a rest penalty for a team that played yesterday − about 0.18 points per point-per-game of scoring that's ruled out. That margin becomes a win chance using each league's typical spread of results, and during a game it updates from the score and time left.</p><p class="note">Tap <b>Why</b> on any game for its inputs.</p></section>`);
  $main.innerHTML = head('Forecasts', `The next seven days · ${lk === 'all' ? 'all leagues' : esc(LEAGUES[lk].label)}`) + seg('forecasts', lk, { all: true, sticky: true }) + `<div class="page" style="margin-top:14px"><div class="col">${sections || state('Nothing scheduled', '<p>No games in the next seven days.</p>')}</div><div class="side">${side.join('')}</div></div>`;
}

/* ================= NEWS ================= */
async function news(lkArg, tab) {
  const lk = lkOf(lkArg, false); remember(lk); const L = LEAGUES[lk];
  tab = tab || store.get('newsTab:' + lk, 'news');
  const tabsList = [['news', 'News'], L.hasInjuries ? ['injuries', 'Injuries'] : null, L.hasTransactions ? ['moves', 'Transactions'] : null].filter(Boolean);
  if (!tabsList.some(t => t[0] === tab)) tab = 'news';
  const tabs = `<div class="tabs" role="tablist" style="margin-top:14px">${tabsList.map(([k, l]) => `<a class="${tab === k ? 'on' : ''}" role="tab" aria-selected="${tab === k}" href="${hrefS('news', lk, k)}">${l}</a>`).join('')}</div>`;
  const top = head('News', esc(L.label)) + seg('news', lk, { sticky: true, arg: tab === 'news' ? null : tab }) + tabs;
  $main.innerHTML = top + skeleton(10);
  store.set('newsTab:' + lk, tab);
  if (tab === 'injuries') {
    const inj = await injuries(L); if (!inj) { $main.innerHTML = top + failMsg('injuries'); return; }
    const F = favs.all()[lk] || [];
    const teamsL = Object.entries(inj.byTeam).filter(([, t]) => t.list.length).sort(([a, ta], [b, tb]) => F.includes(b) - F.includes(a) || ta.name.localeCompare(tb.name));
    const sel = store.get('injTeam:' + lk, '');
    const opts = `<select class="sel" id="injTeam" aria-label="Team"><option value="">All teams (${teamsL.reduce((n, [, t]) => n + t.list.length, 0)} players)</option>${teamsL.map(([id, t]) => `<option value="${esc(id)}"${id === sel ? ' selected' : ''}>${esc(t.name)} (${t.list.length})</option>`).join('')}</select>`;
    const list = teamsL.filter(([id]) => !sel || id === sel).map(([id, t]) => `<section class="card"><h2><a href="${hrefT(lk, id)}" style="text-decoration:none">${esc(t.name)}</a><small>${t.list.length}</small></h2>${t.list.map(x => injItem(x, x.athlete && x.athlete.position && x.athlete.position.abbreviation || '', L)).join('')}</section>`).join('');
    $main.innerHTML = top + `<div class="ctrls">${opts}</div><p class="note" style="margin:-6px 0 12px">Status, comments and estimated return dates are ESPN's, sourced from team reports; "est. return" is their estimate, not ours.</p><div class="duo">${list}</div>`;
    document.getElementById('injTeam').addEventListener('change', e => { store.set('injTeam:' + lk, e.target.value); news(lk, 'injuries'); });
  } else if (tab === 'moves') {
    const d = await jSoft(`${API(L)}/transactions?limit=100`, 900000); if (!d) { $main.innerHTML = top + failMsg('transactions'); return; }
    const items = d.transactions || [];
    $main.innerHTML = top + `<section class="card"><h2>Transactions<small>${items.length} most recent</small></h2>${items.map(x => `<div class="wire-item"><span class="t">${esc(dateShort(x.date))}</span><span><b>${esc(x.team && x.team.displayName || '')}</b> · ${esc(x.description)}</span></div>`).join('') || '<p class="muted">No recent transactions.</p>'}</section>`;
  } else {
    const d = await jSoft(`${API(L)}/news?limit=50`, 300000); if (!d) { $main.innerHTML = top + failMsg('news'); return; }
    const arts = d.articles || [];
    $main.innerHTML = top + `<div class="news">${arts.map(a => { const img = a.images && a.images[0] && a.images[0].url; return `<a class="story" href="${esc(a.links && a.links.web && a.links.web.href || '#')}" target="_blank" rel="noopener">${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : ''}<div><h3>${esc(a.headline)}</h3><p>${esc(a.description || '')}</p><span class="meta">${esc(ago(a.published))}${a.byline ? ' · ' + esc(a.byline) : ''}</span></div></a>`; }).join('')}</div>`;
  }
}

/* ================= RECORD ================= */
async function recordView() {
  $main.innerHTML = head('Our record', 'Every pregame forecast, scored against what happened') + skeleton(10);
  const recs = await Promise.all(ORDER.map(k => record(LEAGUES[k])));
  const secs = []; let tot = { n: 0, hit: 0, brier: 0, en: 0, ehit: 0, ebrier: 0 };
  ORDER.forEach((k, i) => {
    const L = LEAGUES[k], r = recs[i]; if (!r || !r.games || !r.games.length) return;
    const gs = r.games; const n = gs.length;
    const hit = gs.filter(g => (g.p >= .5) === (g.hs > g.as)).length; const brier = gs.reduce((s, g) => s + ((g.hs > g.as ? 1 : 0) - g.p) ** 2, 0) / n;
    const eg = gs.filter(g => g.ep != null); const en = eg.length; const ehit = eg.filter(g => (g.ep >= .5) === (g.hs > g.as)).length; const ebrier = en ? eg.reduce((s, g) => s + ((g.hs > g.as ? 1 : 0) - g.ep) ** 2, 0) / en : null;
    const ourOnEspn = en ? eg.filter(g => (g.p >= .5) === (g.hs > g.as)).length : 0; const ourBrierOnEspn = en ? eg.reduce((s, g) => s + ((g.hs > g.as ? 1 : 0) - g.p) ** 2, 0) / en : null;
    tot.n += n; tot.hit += hit; tot.brier += brier * n; tot.en += en; tot.ehit += ehit; tot.ebrier += (ebrier || 0) * en;
    const buckets = [[.5, .6], [.6, .7], [.7, .8], [.8, .9], [.9, 1.01]].map(([a, b]) => { const in_ = gs.filter(g => { const q = Math.max(g.p, 1 - g.p); return q >= a && q < b; }); const won = in_.filter(g => (g.p >= .5) === (g.hs > g.as)).length; return { a, b, n: in_.length, won }; });
    const last = [...gs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15);
    secs.push(`<section class="card"><h2>${esc(L.label)}<small>${n} games since ${esc(dayLabel(gs.reduce((m, g) => g.date < m ? g.date : m, gs[0].date), { month: 'short', day: 'numeric' }))}</small></h2>
      <div class="stats" style="margin:0 0 12px"><div><b>${(hit / n * 100).toFixed(1)}%</b><small>Straight-up</small></div><div><b>${brier.toFixed(3)}</b><small>Brier</small></div>${en ? `<div><b>${(ehit / en * 100).toFixed(1)}%</b><small>ESPN (${en})</small></div><div><b>${ebrier.toFixed(3)}</b><small>ESPN Brier</small></div><div><b>${(ourOnEspn / en * 100).toFixed(1)}%</b><small>Ours, same ${en}</small></div><div><b>${ourBrierOnEspn.toFixed(3)}</b><small>Our Brier, same ${en}</small></div>` : ''}</div>
      <p class="note">Brier is the average squared error of the win chance: 0.250 is a coin flip, lower is better; good NBA models land near 0.200. ESPN's number is its own pregame win probability from the same game page. The record scores the ratings alone (home court and rest included); the injury adjustment on live pages isn't kept historically, so it isn't scored.</p>
      <div class="tw"><table class="t"><thead><tr><th>Forecast confidence</th><th>Games</th><th>Hit</th><th>Expected</th></tr></thead><tbody>${buckets.filter(b => b.n).map(b => `<tr><td>${Math.round(b.a * 100)}–${Math.min(100, Math.round(b.b * 100) - (b.b > 1 ? 1 : 0))}%</td><td>${b.n}</td><td>${(b.won / b.n * 100).toFixed(0)}%</td><td class="muted">${Math.round((b.a + Math.min(b.b, 1)) / 2 * 100)}%</td></tr>`).join('')}</tbody></table></div>
      <h3 style="margin:16px 0 6px">Recent</h3>
      <div class="tw"><table class="t"><thead><tr><th class="l">Date</th><th class="l">Game</th><th>Final</th><th>Our call</th><th>ESPN</th><th>Line</th><th>Result</th></tr></thead><tbody>${last.map(g => { const fav = g.p >= .5 ? g.h : g.a; const ok = (g.p >= .5) === (g.hs > g.as); return `<tr class="click" data-href="${hrefG(k, g.id)}"><td class="l">${esc(dayLabel(g.date, { month: 'short', day: 'numeric' }))}</td><td class="l"><a href="${hrefG(k, g.id)}">${esc(g.a)} at ${esc(g.h)}</a></td><td>${g.as}–${g.hs}</td><td>${esc(fav)} ${pct(Math.max(g.p, 1 - g.p))}</td><td>${g.ep != null ? esc(g.ep >= .5 ? g.h : g.a) + ' ' + pct(Math.max(g.ep, 1 - g.ep)) : '—'}</td><td class="muted">${esc(g.line || '—')}</td><td class="${ok ? 'w' : 'lo'}">${ok ? 'Hit' : 'Miss'}</td></tr>`; }).join('')}</tbody></table></div></section>`);
  });
  const overall = tot.n ? `<section class="card"><h3>All leagues<small>${tot.n} games</small></h3><div class="stats"><div><b>${(tot.hit / tot.n * 100).toFixed(1)}%</b><small>Straight-up</small></div><div><b>${(tot.brier / tot.n).toFixed(3)}</b><small>Brier</small></div>${tot.en ? `<div><b>${(tot.ehit / tot.en * 100).toFixed(1)}%</b><small>ESPN (${tot.en})</small></div><div><b>${(tot.ebrier / tot.en).toFixed(3)}</b><small>ESPN Brier</small></div>` : ''}</div></section>` : '';
  $main.innerHTML = head('Our record', 'Every pregame forecast the model made, scored against what happened. Updated nightly.') + (secs.length ? `<div class="page"><div class="col">${secs.join('')}</div><div class="side">${overall}<section class="card"><h3>What counts</h3><p style="margin:0 0 8px;font-size:13.5px">Each night the ratings job records the win chance the model gave every game <i>before</i> tip-off, using only the ratings as they stood that morning. Nothing is re-scored after the fact.</p><p style="margin:0 0 8px;font-size:13.5px">"Straight-up" is how often the favored team won. Brier rewards being confident when right and punishes being confident when wrong, so it's the fairer test.</p><p class="note">ESPN's pregame win probability is pulled from the same game page when available. Where ESPN shows a betting line, it's listed for reference only.</p></section></div></div>` : state('No record yet', '<p>The nightly job hasn\'t scored a game yet. Check back after the first slate of results.</p>'));
}

HW.views = { scores, game, standings: standingsView, rankings: rankingsView, teams, team, players, player, forecasts, news, record: recordView };
HW.render = { skeleton, state, failMsg };
})();
