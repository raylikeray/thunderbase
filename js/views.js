/* Tipoff — views (v4). A league is always in context: #<league>/<section>. */
(function () {
'use strict';
const HW = window.HW;
const { LEAGUES, ORDER, SPORTS, sportOf, statCategory, STAT_CATS, esc, jSoft, todayCT, addDays, compact, expand, ymdOf, dayLabel, relDay, tip, dateShort, ago, pct, sign, ordinal, store, API, WEB, logoUrl, seasonYear, favs,
  parseEvent, isLive, isFav, interest, scoreboard, standings, rankings, record, params, aiRecord, aiFor, aiEntry, injuries, forecast, forecastCtx, leaguePlayers, S } = HW;
const $main = document.getElementById('main');
const COLLEGE = ['ncaam', 'ncaaw', 'ncaaf', 'ncaab'];
/* period labels for the scoring table and the win-probability chart */
const perLabel = (L, i, per) => { const reg = L.periods || 4; if (L.sport === 'baseball') return String(i + 1); if (i < reg) return (reg === 4 ? 'Q' : 'H') + (i + 1); return 'OT' + (per > reg + 1 ? i - reg + 1 : ''); };
const lkOf = (v) => LEAGUES[v] ? v : (LEAGUES[store.get('lk', 'nba')] ? store.get('lk', 'nba') : 'nba');
const remember = lk => { if (LEAGUES[lk]) store.set('lk', lk); };
const hrefS = (section, lk, arg) => `#${lk}/${section}${arg ? '/' + arg : ''}`;
const hrefG = (lk, id) => `#${lk}/game/${id}`;
const hrefT = (lk, id) => `#${lk}/team/${id}`;
const hrefP = (lk, id) => `#${lk}/player/${id}`;
const seg = () => '';

/* ---------- shared bits ---------- */
const state = (title, body, err) => `<div class="state${err ? ' err' : ''}"><b>${esc(title)}</b>${body}</div>`;
const skeleton = (n = 6) => `<div class="mod"><div class="mb">${Array.from({ length: n }, (_, i) => `<div class="skel" style="width:${90 - (i % 3) * 18}%"></div>`).join('')}</div></div>`;
const failMsg = what => state(`Couldn't load ${what}`, `<p>The data feed didn't answer. It usually comes back within a minute; this page retries on its own, or <a href="#" data-act="reload">try again now</a>.</p>`, true);
const rk = s => s.rank ? `<span class="rk">${s.rank}</span>` : '';
const tn = (s, field = 'short') => `${rk(s)}${esc(s[field])}`;
const head = (h1, d, right = '') => `<div class="head"><h1>${h1}</h1>${d ? `<span class="d">${d}</span>` : ''}${right}</div>`;
const mod = (title, body, opts = {}) => `<section class="mod ${opts.cls || ''}" ${opts.id ? `id="${opts.id}"` : ''}><div class="mh">${esc(title)}${opts.x ? (opts.href ? `<a class="x" href="${opts.href}">${opts.x}</a>` : `<span class="x">${opts.x}</span>`) : ''}<span class="c"></span></div><div class="mb${opts.flush ? ' flush' : ''}">${body}</div></section>`;
function statusLine(g) {
  const where = [g.venue, g.tv.label].filter(Boolean).join(' · ');
  if (g.state === 'in') return `Live · ${g.detail}${where ? ' · ' + where : ''}`;
  if (g.state === 'pre') return `${relDay(ymdOf(g.date))} · ${tip(g.date)} CT${where ? ' · ' + where : ''}`;
  return `${g.detail || 'Final'} · ${dateShort(g.date)}${g.venue ? ' · ' + g.venue : ''}`;
}
function fcText(g, f) {
  const fav = f.pHome >= .5 ? g.home : g.away; const p = Math.max(f.pHome, 1 - f.pHome);
  if (g.state === 'post') { const won = g.home.score > g.away.score ? g.home : g.away; const hit = won === fav; return { label: `${hit ? 'Hit' : 'Miss'} · ${esc(fav.abbr)} ${pct(p)}`, cls: hit ? 'hit' : 'miss', fill: p }; }
  return { label: `${esc(fav.abbr)} ${pct(p)}${f.live ? ' live' : ''}`, cls: '', fill: p };
}
function bug(g, f) {
  const L = LEAGUES[g.lk];
  const h = g.state === 'in' ? `<span>Live · ${esc(g.detail)}${g.sit && g.sit.short ? ` · ${esc(g.sit.short)}` : ''}</span>` : g.state === 'pre' ? `<span>${esc(tip(g.date))} CT</span>` : `<span>${esc(g.detail || 'Final')}</span>`;
  const row = (s, other) => { const lose = g.state === 'post' && s.score != null && other.score != null && s.score < other.score; return `<div class="tm"><span class="ab" style="background:${s.color}">${esc(s.abbr)}</span><span class="nm"><span class="n">${rk(s)}${esc(s.short)}${g.sit && g.sit.poss === s.id ? ' <i class="poss" title="has the ball" aria-label="has the ball"></i>' : ''}</span><small>${esc(s.rec)}</small></span><span class="s${lose ? ' lo' : ''}" data-s="${g.id}-${s.id}">${g.state === 'pre' ? '' : esc(s.score ?? '')}</span></div>`; };
  const t = f ? fcText(g, f) : null;
  return `<a class="bug${isFav(g) ? ' fav' : ''}" href="${hrefG(g.lk, g.id)}" aria-label="${esc(g.away.name)} at ${esc(g.home.name)}, ${esc(g.detail)}"><div class="h${isLive(g) ? ' on' : ''}">${h}<span class="tv">${esc(g.state === 'post' ? 'Box score' : g.tv.label || L.tag)}</span></div>${row(g.away, g.home)}${row(g.home, g.away)}${t ? `<div class="f"><span class="${t.cls}">${t.label}</span><b><i style="width:${t.fill * 100}%"></i></b></div>` : ''}</a>`;
}
function sortGames(list) { return [...list].sort((a, b) => (a.state === 'in' ? 0 : a.state === 'pre' ? 1 : 2) - (b.state === 'in' ? 0 : b.state === 'pre' ? 1 : 2) || isFav(b) - isFav(a) || interest(b) - interest(a) || new Date(a.date) - new Date(b.date)); }
const unit = L => L.sport === 'baseball' ? 'runs' : 'points';
const homeWord = L => L.sport === 'basketball' ? 'home court' : 'home field';
const floorWord = L => L.sport === 'basketball' ? 'neutral floor' : 'neutral site';
function whyText(L, g, f) {
  const bits = [];
  const gap = f.H.rating - f.A.rating; const lead = gap >= 0 ? g.home : g.away;
  bits.push(Math.abs(gap) < 1.5 ? 'even on the ratings' : `${lead.short} ${Math.abs(gap).toFixed(1)} ${unit(L)} better on the ratings`);
  if (f.restH && f.restA) bits.push('both on a back-to-back'); else if (f.restH) bits.push(`${g.home.short} played last night`); else if (f.restA) bits.push(`${g.away.short} played last night`);
  if (f.soH) bits.push(`${g.home.short} without ${f.soH.name}`); if (f.soA) bits.push(`${g.away.short} without ${f.soA.name}`);
  bits.push(g.neutral ? floorWord(L) : `${g.home.short} at home`);
  return bits.join(' · ');
}
function fbar(L, g, f) {
  const pa = 1 - f.pHome, ph = f.pHome; const fav = ph >= .5 ? g.home : g.away; const p = Math.max(ph, pa);
  const label = g.state === 'post' ? `Final · <b>${esc((g.home.score > g.away.score ? g.home : g.away).short)}</b> won · model had ${esc(fav.abbr)} ${pct(p)}` : `${f.live ? 'Live forecast' : 'Forecast'} · <b>${esc(fav.abbr)} ${pct(p)}</b>`;
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
  return `<div class="ai" id="ai-${id}" ${open ? '' : 'hidden'}><h4>Prediction <small>written ${esc(ai.generatedLabel || 'this morning')} · graded the next morning · not betting advice</small></h4>${ai.headline ? `<p><b>${esc(ai.headline)}</b></p>` : ''}<p>${esc(ai.read || '')}</p>${keys ? `<ul>${keys}</ul>` : ''}${ai.pick ? `<p class="meta" style="margin-top:8px">Lean: ${esc(ai.pick)}${ai.confidence ? ' · ' + esc(ai.confidence) + ' confidence' : ''}</p>` : ''}</div>`;
}
function hero(L, g, f, ai, opts = {}) {
  const live = isLive(g), pre = g.state === 'pre';
  const side = (s, lo) => `<div class="side-t"><img src="${esc(s.logo)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><div class="n${pre ? ' pre' : ''}${lo ? ' lo' : ''}">${pre ? esc(s.abbr) : esc(s.score ?? '–')}</div><div class="l">${rk(s)}${esc(s.short)}${s.rec ? ` · <span class="nw">${esc(s.rec)}</span>` : ''}</div></div>`;
  const aLo = g.state === 'post' && g.away.score < g.home.score, hLo = g.state === 'post' && g.home.score < g.away.score;
  const mid = pre ? `<div class="mid">@<small>${esc(tip(g.date))} CT</small></div>` : `<div class="mid">–<small>${esc(live ? g.detail : (g.detail || 'Final'))}${live && g.sit && g.sit.text ? `<br>${esc(g.sit.text)}${g.sit.poss ? ' · ' + esc((g.sit.poss === g.home.id ? g.home : g.away).abbr) + ' ball' : ''}` : ''}</small></div>`;
  const badge = live ? `<span class="badge live">Live</span>` : opts.badge ? `<span class="badge">${esc(opts.badge)}</span>` : '';
  const open = S.open.has('ai-' + g.id);
  return `<article class="hero" aria-label="${esc(g.away.name)} at ${esc(g.home.name)}">
    <div class="top"><div><h1>${tn(g.away)} at ${tn(g.home)}</h1><div class="sub">${esc(statusLine(g))}${g.note ? ' · ' + esc(g.note) : ''}</div></div>${badge}</div>
    <div class="score">${side(g.away, aLo)}${mid}${side(g.home, hLo)}</div>
    <div class="foot"><div>${f ? fbar(L, g, f) : ''}</div><div style="display:flex;gap:8px;flex-wrap:wrap">${ai ? `<button class="btn sm" data-act="ai" data-id="${g.id}" aria-expanded="${open}" aria-controls="ai-${g.id}">${open ? 'Hide prediction' : 'Prediction'}</button>` : ''}${opts.actions || ''}</div></div>
    ${aiBlock(ai, open, g.id)}
  </article>`;
}
function fcRow(L, g, f, ai, opts = {}) {
  const ph = f.pHome, pa = 1 - ph;
  const open = S.open.has('fc-' + g.id);
  const src = f.source === 'elo' ? 'Elo' : 'margin (early-season fallback)';
  const detail = `<div class="fc-detail" id="fcd-${g.id}" ${open ? '' : 'hidden'}>${ai ? `<p><b>Prediction${ai.headline ? ': ' + esc(ai.headline) : ''}</b></p><p>${esc(ai.read)}</p>${(ai.keys || []).length ? `<ul style="margin:0 0 8px;padding-left:18px">${ai.keys.map(k => `<li>${esc(k)}</li>`).join('')}</ul>` : ''}` : ''}
    <div class="inputs">
      <div><b>${sign(f.margin)}</b>${esc(g.home.abbr)} projected margin</div>
      <div><b>${sign(f.H.rating)}</b>${esc(g.home.abbr)} ${src}${f.H.gp ? ` · ${f.H.gp} GP` : ''}</div>
      <div><b>${sign(f.A.rating)}</b>${esc(g.away.abbr)} ${src}${f.A.gp ? ` · ${f.A.gp} GP` : ''}</div>
      <div><b>${f.hca ? '+' + f.hca : '0'}</b>${g.neutral ? 'neutral site' : homeWord(L) + ' (tuned)'}</div>
      <div><b>${f.restH || f.restA ? sign(f.restH - f.restA) : '0.0'}</b>rest (${[f.restH ? g.home.abbr + ' played yesterday' : '', f.restA ? g.away.abbr + ' played yesterday' : ''].filter(Boolean).join(', ') || 'both rested'})</div>
      ${f.soH ? `<div><b>${sign(f.soH.pts)}</b>${esc(g.home.abbr)} out: ${esc(f.soH.name)}</div>` : ''}${f.soA ? `<div><b>${sign(-f.soA.pts)}</b>${esc(g.away.abbr)} out: ${esc(f.soA.name)}</div>` : ''}
    </div></div>`;
  return `<div class="fcrow${isFav(g) ? ' fav' : ''}">
    <div class="fcrow-teams"><a href="${hrefG(g.lk, g.id)}">${tn(g.away)} at ${tn(g.home)}</a><small>${g.state === 'in' ? 'Live · ' + esc(g.detail) : g.state === 'post' ? esc(g.detail) + ` · ${g.away.score}–${g.home.score}` : esc(tip(g.date)) + ' CT' + (g.tv.label ? ' · ' + esc(g.tv.label) : '')}</small></div>
    <div class="fcrow-mid"><div class="fc-bar" role="img" aria-label="${esc(g.away.abbr)} ${pct(pa)}, ${esc(g.home.abbr)} ${pct(ph)}"><i style="width:${pa * 100}%;background:${g.away.color}"></i><i style="width:${ph * 100}%;background:${g.home.color}"></i></div><div class="fc-pct"><span>${esc(g.away.abbr)} ${pct(pa)}</span><span>${esc(g.home.abbr)} ${pct(ph)}</span></div></div>
    <div><button class="btn sm ghost" data-act="fc" data-id="${g.id}"${ai ? ' data-ai="1"' : ''} aria-expanded="${open}" aria-controls="fcd-${g.id}">${open ? 'Hide' : ai ? 'Prediction' : 'Why'}</button></div>
    ${detail}
  </div>`;
}
const miniRow = (g, f) => { const ph = f.pHome, pa = 1 - ph; const fav = ph >= .5 ? g.home : g.away; const sub = g.state === 'in' ? `Live · ${g.detail}` : g.state === 'post' ? `Final ${g.away.score}–${g.home.score}` : `${tip(g.date)}${g.tv.label ? ' · ' + g.tv.label : ''}`; const why = (f.soH || f.soA || f.restH || f.restA) ? ' · ' + [f.restH && f.restA ? 'both on a b2b' : f.restH ? `${g.home.abbr} b2b` : f.restA ? `${g.away.abbr} b2b` : '', f.soH ? `${g.home.abbr} ${f.soH.names.length} out` : '', f.soA ? `${g.away.abbr} ${f.soA.names.length} out` : ''].filter(Boolean).join(' · ') : ''; return `<div class="fcr${isFav(g) ? ' fav' : ''}"><span><a href="${hrefG(g.lk, g.id)}">${tn(g.away)} at ${tn(g.home)}</a><small>${esc(sub)}${esc(why)}</small></span><div><div class="pb"><i style="width:${pa * 100}%;background:${g.away.color}"></i><i style="width:${ph * 100}%;background:${g.home.color}"></i></div><div class="pc">${esc(fav.abbr)} ${pct(Math.max(ph, pa))}</div></div></div>`; };
function injPill(status) { const s = (status || '').toLowerCase(); const cls = s.includes('out') || s.includes('suspen') ? 'out' : s.includes('day') || s.includes('question') || s.includes('doubt') ? 'dtd' : s.includes('prob') ? 'prob' : ''; return `<span class="pill ${cls}">${esc(/day-to-day/i.test(status) ? 'DTD' : status || '—')}</span>`; }
function injItem(x, teamLabel, L) {
  const ret = x.details && x.details.returnDate ? ` · ESPN est. return ${esc(dateShort(x.details.returnDate))}` : '';
  return `<div class="wire-item">${injPill(x.status)}<span><a href="${hrefP(L.key, esc(x.athlete && x.athlete.id || ''))}"><b>${esc(x.athlete && x.athlete.displayName)}</b></a> <span class="muted">· ${esc(teamLabel)}${x.details && x.details.type ? ' · ' + esc(x.details.type) : ''}${ret}</span><br><span class="muted">${esc((x.shortComment || '').slice(0, 160))}${(x.shortComment || '').length > 160 ? '…' : ''}</span></span></div>`;
}
const tuneLine = P => { if (!P || !P.tunedAt) return ''; if (P.note && !(P.history && P.history.length)) return `Self-tuning starts at ${P.tuneAt} games · ${P.n} so far`; const h = P.history && P.history.length > 1 ? P.history[P.history.length - 2] : null; const changed = h && (h.hca !== P.hca || h.b2b !== P.b2b || h.sd !== P.sd); return `Ratings tuned ${esc(ago(P.tunedAt))}${changed ? ` · ${h.hca !== P.hca ? `${homeWord(LEAGUES[P.league] || {})} ${h.hca} → ${P.hca}` : h.b2b !== P.b2b ? `rest ${h.b2b} → ${P.b2b}` : `spread ${h.sd} → ${P.sd}`}` : ' · no change'}`; };


/* ---------- my teams ---------- */
const favIds = lk => (favs.all()[lk] || []).map(String);
function myTeamCard(L, id, cur, R, sched, inj, ctx) {
  const lk = L.key; const r = cur && cur.byId[id]; const t0 = sched && sched.team;
  const name = (r && (r.short || r.name)) || (t0 && (t0.shortDisplayName || t0.displayName)) || 'Team';
  const logo = (r && r.logo) || (t0 && (t0.logo || (t0.logos && t0.logos[0] && t0.logos[0].href))) || '';
  const rank = R && (R.ranks.find(x => x.team.id === id) || {}).rank;
  const today = S.today[lk].find(g => g.home.id === id || g.away.id === id);
  const evs = (sched && sched.events || []).map(e => parseEvent(e, L));
  const next = today || evs.find(g => g.state !== 'post');
  const last = [...evs].reverse().find(g => g.state === 'post' && g.home.score != null);
  const vs = g => { const home = g.home.id === id; const op = home ? g.away : g.home; return `${g.neutral ? 'vs' : home ? 'vs' : 'at'} ${rk(op)}${esc(op.abbr)}`; };
  let line1 = '', cls = '';
  if (next) {
    const home = next.home.id === id; const me = home ? next.home : next.away, op = home ? next.away : next.home;
    if (next.state === 'in') { cls = 'live'; line1 = `<b>Live</b> ${esc(next.detail)} · ${esc(me.abbr)} ${me.score}, ${esc(op.abbr)} ${op.score}`; }
    else if (next.state === 'post') { const won = me.score > op.score; line1 = `<b class="${won ? 'w' : 'lo'}">${won ? 'W' : 'L'}</b> ${me.score}–${op.score} ${vs(next)} · Final`; }
    else { let fc = ''; try { const f = forecast(L, next, ctx); fc = ` · <b>${pct(home ? f.pHome : 1 - f.pHome)}</b>`; } catch { } line1 = `${esc(relDay(ymdOf(next.date)))} ${esc(tip(next.date))} ${vs(next)}${fc}`; }
  } else line1 = 'No game scheduled';
  let line2 = '';
  if (last && last !== next) { const home = last.home.id === id; const me = home ? last.home : last.away, op = home ? last.away : last.home; const won = me.score > op.score; line2 = `Last: <b class="${won ? 'w' : 'lo'}">${won ? 'W' : 'L'}</b> ${me.score}–${op.score} ${vs(last)}`; }
  const outs = inj && inj.byTeam[id] ? inj.byTeam[id].list.filter(x => /out/i.test(x.status || '')).length : 0;
  const stand = r ? (L.standingsMode === 'conferences' ? `${r.w}–${r.l}${r.conf ? ' · ' + esc(r.conf) + ' ' + esc(r.groupAbbr || '') : ''}` : `${r.w}–${r.l} · ${ordinal(r.pos)} ${esc(r.groupAbbr || r.group)}`) : (t0 && t0.recordSummary) || '';
  const href = next && next.state !== 'post' ? hrefG(lk, next.id) : hrefT(lk, id);
  return `<a class="my-card ${cls}" href="${href}"><img src="${esc(logo)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><div class="my-b"><div class="my-n">${rank ? `<span class="rk">${rank}</span>` : ''}${esc(name)} <small>${stand}</small></div><div class="my-l">${line1}</div><div class="my-l muted">${line2}${outs ? `${line2 ? ' · ' : ''}<span class="neg">${outs} out</span>` : ''}</div></div></a>`;
}
const NOTIFY_KINDS = [['pre', 'Pregame', '30 minutes before game time, with the forecast and who is out'], ['close', 'Close games', 'Within one score in the last minutes (two runs in the ninth)'], ['final', 'Finals', 'The final score and how the forecast did'], ['inj', 'Injuries', 'When a player on your team is newly out or back'], ['moves', 'Trades and signings', 'Transactions involving your teams']];
function notifyPrefs() { return Object.assign({ on: false, pre: true, close: true, final: true, inj: true, moves: true, score: 'quarters' }, store.get('notify', {})); }
function notifySupport() { if (!('Notification' in window)) return { ok: false, why: /iPhone|iPad|iPod/.test(navigator.userAgent) ? 'On iPhone, add Tipoff to your home screen first (Share, then Add to Home Screen); updates work from the installed app.' : 'This browser does not support notifications.' }; return { ok: true }; }
function pickerBody(lk, cur, R) {
  const L = LEAGUES[lk]; const rankOf = {}; (R && R.ranks || []).forEach(r => rankOf[r.team.id] = r.rank);
  const chip = r => `<button class="pick-t${favs.has(lk, r.id) ? ' on' : ''}" data-act="pickt" data-lk="${lk}" data-id="${esc(r.id)}" data-q="${esc((r.name + ' ' + (r.abbr || '') + ' ' + (r.loc || '')).toLowerCase())}" aria-pressed="${favs.has(lk, r.id)}"><img src="${esc(r.logo)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><span>${rankOf[r.id] ? `<span class="rk">${rankOf[r.id]}</span>` : ''}${esc(r.short || r.name)}</span></button>`;
  const college = L.standingsMode === 'conferences';
  const groups = college ? [...cur.groups].sort((a, b) => a.name.localeCompare(b.name)) : cur.groups;
  return (college ? `<input class="inp" id="pickq" type="search" placeholder="Find a school or conference" aria-label="Find a team" style="margin-bottom:10px;width:100%">` : '') + groups.map(gp => `<div class="pick-g" data-name="${esc(gp.name.toLowerCase())}"><h4 class="conf-h">${esc(gp.name)}</h4><div class="pick-grid">${gp.rows.map(chip).join('')}</div></div>`).join('');
}
function updatesBody() {
  const P = notifyPrefs(); const sup = notifySupport(); const granted = sup.ok && Notification.permission === 'granted';
  const rows = NOTIFY_KINDS.map(([k, l, d]) => `<label class="nrow"><input type="checkbox" data-act="nkind" data-k="${k}" ${P[k] ? 'checked' : ''}><span><b>${l}</b><small>${d}</small></span></label>`).join('') + `<label class="nrow wrap"><span><b>Score updates</b><small>One notification per game that updates in place</small></span><select class="sel" data-act="nscore" aria-label="Score updates"><option value="quarters"${P.score === 'quarters' ? ' selected' : ''}>Quarter or inning ends, lead changes</option><option value="often"${P.score === 'often' ? ' selected' : ''}>Every few minutes</option><option value="off"${P.score === 'off' ? ' selected' : ''}>Off</option></select></label>`;
  const pushOn = !!store.get('push:active', false);
  const status = !sup.ok ? `<p class="note">${esc(sup.why)}</p>` : granted && P.on ? `<p class="note" style="color:var(--win)">On. ${pushOn ? 'Updates reach this device even when Tipoff is closed.' : (HW.PUSH && HW.PUSH.url ? 'Connecting to the update server…' : 'You get updates while Tipoff is open or installed on your home screen.')}</p><button class="btn sm ghost" data-act="noff">Turn off</button>` : Notification.permission === 'denied' ? `<p class="note">Notifications are blocked for this site in your browser settings; allow them there to turn these on.</p>` : `<button class="btn" data-act="non">Turn on updates</button><p class="note">Only your teams, only these events. Nothing else.</p>`;
  return `<div class="pick-up"><h4 class="conf-h" style="margin-top:0">Updates for my teams</h4>${rows}${status}</div>`;
}
async function pickerOpen(lk, opts = {}) {
  lk = LEAGUES[lk] ? lk : 'nba';
  let dlg = document.getElementById('pick');
  if (!dlg) { dlg = document.createElement('dialog'); dlg.id = 'pick'; dlg.className = 'pick'; document.body.appendChild(dlg); dlg.addEventListener('close', () => { store.set('onboarded', true); HW.route(); }); }
  const welcome = !!opts.welcome;
  // same two-level switch as the header: a sport row, then that sport's leagues
  const spKey = LEAGUES[lk].sport; const spDef = SPORTS.find(x => x.key === spKey) || SPORTS[0];
  const tabs = `<div class="pick-nav"><div class="pick-sports">${SPORTS.map(x => `<button class="${x.key === spKey ? 'on' : ''}" data-act="picklk" data-lk="${x.key === spKey ? lk : (x.leagues.includes(store.get('lk:' + x.key, '')) ? store.get('lk:' + x.key, '') : x.leagues[0])}" aria-pressed="${x.key === spKey}">${esc(x.label)}</button>`).join('')}</div><div class="pick-tabs">${spDef.leagues.map(k => `<button class="pick-lk${k === lk ? ' on' : ''}" data-act="picklk" data-lk="${k}" aria-pressed="${k === lk}">${esc(LEAGUES[k].label)}</button>`).join('')}</div></div>`;
  dlg.innerHTML = `<div class="pick-h"><b>${welcome ? 'Welcome to Tipoff' : 'My teams'}</b><span class="x">${welcome ? 'every game, one screen' : 'tap the teams you follow'}</span><button class="btn sm" data-act="pickdone">Done</button></div>${welcome ? '<p class="pick-w">Pick the teams you follow. They lead every screen, go first in the scoreboard, and are the only ones you get updates about. Switch sports and leagues above the list.</p>' : ''}${tabs}<div class="pick-b"><p class="muted" style="margin:0 0 8px">Loading teams…</p></div><div class="pick-f" id="pickf">${opts.updates !== false ? updatesBody() : ''}</div>`;
  if (!dlg.open) dlg.showModal();
  dlg.scrollTop = 0;
  if (opts.updates === 'only') { dlg.querySelector('.pick-b').hidden = true; dlg.querySelector('.pick-nav').hidden = true; dlg.querySelector('.pick-h b').textContent = 'Updates'; dlg.querySelector('.pick-h .x').textContent = 'for the teams you picked'; return; }
  const L = LEAGUES[lk];
  let cur; try { cur = await standings(L); } catch { dlg.querySelector('.pick-b').innerHTML = failMsg('teams'); return; }
  const R = await rankings(L);
  dlg.querySelector('.pick-b').innerHTML = pickerBody(lk, cur, R) + `<p class="note">Saved on this device only. Your teams lead each league's screen, go first in the scoreboard and are highlighted in standings.</p>`;
  const q = document.getElementById('pickq');
  if (q) q.addEventListener('input', () => { const v = q.value.trim().toLowerCase(); dlg.querySelectorAll('.pick-g').forEach(gq => { let any = false; gq.querySelectorAll('.pick-t').forEach(c => { const hit = !v || (c.dataset.q || c.textContent.toLowerCase()).includes(v) || gq.dataset.name.includes(v); c.hidden = !hit; any = any || hit; }); gq.hidden = !any; }); });
}
function pickerRefreshUpdates() { const f = document.getElementById('pickf'); if (f) f.innerHTML = updatesBody(); }
/* ================= CENTER ================= */
async function center(lk) {
  const L = LEAGUES[lk]; remember(lk);
  const ymd = todayCT();
  $main.innerHTML = `<div class="rail">${Array.from({ length: 5 }, () => `<div class="bug" style="height:96px"></div>`).join('')}</div><div class="grid">${['c4', 'c5', 'c3', 'c3', 'c3', 'c3', 'c6'].map(c => `<div class="${c}">${skeleton(5)}</div>`).join('')}</div>`;
  const mine = favIds(lk).slice(0, 8);
  const [ctx, ai, cur, R, P, news, lp, inj, recs, aiRec, scheds] = await Promise.all([forecastCtx(L, ymd), aiFor(ymd), standings(L).catch(() => null), rankings(L), params(L), jSoft(`${API(L)}/news?limit=8`, 600000), L.sport === 'basketball' ? leaguePlayers(L).catch(() => null) : Promise.all((STAT_CATS[L.sport] || []).slice(0, 3).map(([c, , srt]) => statCategory(L, c, srt, 5).catch(() => null))), injuries(L), record(L), aiRecord(), Promise.all(mine.map(id => jSoft(`${API(L)}/teams/${id}/schedule`, 300000)))]);
  const render = () => {
    const games = sortGames(S.today[lk]);
    const live = games.filter(isLive).length;
    const fcs = new Map(games.map(g => [g.id, forecast(L, g, ctx)]));
    const parts = [];
    // my teams
    if (mine.length) parts.push(`<section class="my" id="m-my"><div class="my-h"><span>My teams</span><button class="lnk" data-act="pick" data-lk="${lk}">Edit</button></div><div class="my-grid">${mine.map((id, i) => myTeamCard(L, id, cur, R, scheds[i], inj, ctx)).join('')}</div></section>`);
    else if (!store.get('nofavs:' + lk, false)) parts.push(`<section class="cta" id="m-my"><div><b>Make it yours.</b> Pick the ${esc(L.label)} teams you follow and they lead this screen: next game, live score, forecast, who's out.</div><div class="cta-b"><button class="btn" data-act="pick" data-lk="${lk}">Pick my teams</button><button class="btn ghost" data-act="nofavs" data-lk="${lk}">Not now</button></div></section>`);
    // scoreboard rail
    parts.push(`<div class="head" id="m-scores"><h1>${esc(L.weekly ? 'This week' : relDay(ymd) === 'Tonight' ? 'Today' : relDay(ymd))}</h1><span class="d">${esc(L.weekly ? 'week of ' + dayLabel(ymd, { month: 'short', day: 'numeric' }) : dayLabel(ymd, { weekday: 'short', month: 'short', day: 'numeric' }))} · ${games.length} ${esc(L.label)} game${games.length === 1 ? '' : 's'}${live ? ` · <span style="color:var(--live)">${live} live</span>` : ''} · <a href="${hrefS('scores', lk)}">All scores →</a>${!mine.length && store.get('nofavs:' + lk, false) ? ` · <a href="#" data-act="pick" data-lk="${lk}">Pick my teams</a>` : ''}</span></div>`);
    parts.push(games.length ? `<div class="rail">${games.map(g => bug(g, fcs.get(g.id))).join('')}</div>` : `<div style="margin-bottom:12px">${state(`No ${L.noun} games ${L.weekly ? 'this week' : 'today'}`, `<p>${L.offseason ? esc(L.offseason) : `Upcoming games and forecasts are on the <a href="${hrefS('forecasts', lk)}">Forecasts</a> page.`}</p>`)}</div>`);
    // jump bar (phone)
    parts.push(`<nav class="jump" aria-label="Jump to"><a href="#m-call">Call</a><a href="#m-standings">${L.hasRankings ? 'Rankings' : 'Standings'}</a><a href="#m-leaders">Leaders</a><a href="#m-injuries">${L.hasInjuries ? 'Injuries' : 'Movers'}</a><a href="#m-ratings">Ratings</a><a href="#m-model">Model</a><a href="#m-news">News</a></nav>`);
    const grid = [];
    // tonight's call
    const upcoming = games.filter(g => g.state !== 'post');
    let callBody;
    if (upcoming.length) {
      const cands = upcoming.map(g => { const f = fcs.get(g.id); const close = 1 - Math.abs(f.pHome - .5) * 2; return { g, f, s: interest(g) + close * 40 + (g.state === 'in' ? 45 : 0) }; }).sort((a, b) => b.s - a.s);
      const c = cands[0]; const g = c.g, f = c.f; const a = aiEntry(ai, g);
      const txt = a ? `<b>${esc(a.headline || '')}</b> ${esc((a.read || '').split(/(?<=\.)\s/).slice(0, 2).join(' '))}` : `<b>${g.state === 'in' ? 'Live now.' : 'The model\'s read.'}</b> ${esc(whyText(L, g, f))}.`;
      callBody = `<div class="feat"><div class="t"><a href="${hrefT(lk, g.away.id)}"><div class="ab" style="color:${g.away.color}">${esc(g.away.abbr)}</div></a><small>${tn(g.away)} · ${esc(g.away.rec)}</small><div class="pct${1 - f.pHome >= .5 ? ' lead' : ''}">${g.state === 'in' ? g.away.score : pct(1 - f.pHome)}</div></div><div class="mid">${g.state === 'in' ? `<span class="big">${esc(g.detail)}</span>` : `${esc(tip(g.date))}<br>${esc(g.tv.label || '')}`}<br>${esc(g.venue || '')}</div><div class="t"><a href="${hrefT(lk, g.home.id)}"><div class="ab" style="color:${g.home.color}">${esc(g.home.abbr)}</div></a><small>${tn(g.home)} · ${esc(g.home.rec)}</small><div class="pct${f.pHome > .5 ? ' lead' : ''}">${g.state === 'in' ? g.home.score : pct(f.pHome)}</div></div></div><p class="aiq">${txt} <a href="${hrefG(lk, g.id)}" style="color:var(--link);text-decoration:none;font-weight:700">${a ? 'Full read →' : 'Preview →'}</a></p>` +
        (cands.length > 1 ? `<div class="fcl" style="margin-top:8px">${cands.slice(1, 6).map(x => miniRow(x.g, x.f)).join('')}</div>` : '') + (upcoming.length > 6 ? `<p class="note"><a href="${hrefS('forecasts', lk)}" style="color:var(--link);text-decoration:none">All ${upcoming.length} forecasts →</a></p>` : '');
    } else callBody = `<p class="muted" style="margin:0">Nothing left on today's slate.</p><div class="fcl" style="margin-top:6px">${games.slice(0, 6).map(g => miniRow(g, fcs.get(g.id))).join('')}</div>`;
    grid.push(mod("Tonight's call", callBody, { cls: 'c4', id: 'm-call', x: (ai && ai.games && games.some(g => aiEntry(ai, g))) ? 'Prediction · ' + (ai && ai.generated ? new Date(ai.generated).toLocaleTimeString('en-US', { timeZone: HW.TZ, hour: 'numeric', minute: '2-digit' }) : 'today') : 'model', href: hrefS('forecasts', lk) }));
    // standings / rankings
    if (L.hasRankings) {
      const eloTop = ctx.ratings && ctx.ratings.teams ? Object.entries(ctx.ratings.teams).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.elo - a.elo).slice(0, 10) : [];
      const apT = R ? `<table class="t"><thead><tr><th>AP Top 10</th><th>Rec</th></tr></thead><tbody>${R.ranks.slice(0, 10).map(r => `<tr class="click${favs.has(lk, r.team.id) ? ' fav' : ''}" data-href="${hrefT(lk, r.team.id)}"><td><span class="team"><span class="n">${r.rank}</span><img class="headshot sq" src="${esc(r.team.logo || '')}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><a href="${hrefT(lk, r.team.id)}">${esc(r.team.short)}</a></span></td><td>${esc(r.rec || '')}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Poll not out yet.</p>';
      const elT = eloTop.length ? `<table class="t"><thead><tr><th>Tipoff Top 10</th><th>Elo</th></tr></thead><tbody>${eloTop.map((r, i) => `<tr class="click" data-href="${hrefT(lk, r.id)}"><td><span class="team"><span class="n">${i + 1}</span><a href="${hrefT(lk, r.id)}">${esc(r.name || r.abbr)}</a></span></td><td>${Math.round(r.elo)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Ratings start with the first results.</p>';
      grid.push(mod('Rankings', `<div class="duo">${apT}${elT}</div>`, { cls: 'c5', id: 'm-standings', x: R ? R.name + ' · Tipoff Elo' : 'Tipoff Elo', href: hrefS('rankings', lk) }));
    } else if (cur && cur.groups.length) {
      const tbl = (grp, n) => `<table class="t"><thead><tr><th>${esc(grp.name.replace(' Conference', ''))}</th><th>W-L</th><th>Net</th><th>L10</th></tr></thead><tbody>${grp.rows.slice(0, n).map((r, i) => `<tr class="click${favs.has(lk, r.id) ? ' fav' : ''}${(L.playoffLine || []).includes(i + 1) ? ' cut' : ''}" data-href="${hrefT(lk, r.id)}"><td><span class="team"><span class="n">${i + 1}</span><img class="headshot sq" src="${esc(r.logo || '')}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><a href="${hrefT(lk, r.id)}">${esc(r.short || r.name)}</a></span></td><td>${r.w}-${r.l}</td><td class="${r.diff > 0 ? 'pos' : r.diff < 0 ? 'neg' : ''}">${r.diff != null ? sign(+r.diff) : ''}</td><td>${esc(r.l10 || '')}</td></tr>`).join('')}</tbody></table>`;
      const gs = cur.groups.length >= 2 ? cur.groups.slice(0, 2) : cur.groups;
      grid.push(mod('Standings', `<div class="${gs.length > 1 ? 'duo' : ''}">${gs.map(g => tbl(g, 10)).join('')}</div>`, { cls: 'c5', id: 'm-standings', x: `${esc(cur.season || '')} · Net = avg margin`, href: hrefS('standings', lk) }));
    } else grid.push(mod('Standings', '<p class="muted">Standings unavailable right now.</p>', { cls: 'c5', id: 'm-standings' }));
    // leaders
    if (L.sport !== 'basketball') {
      const cats = (lp || []).filter(Boolean);
      const items = cats.map((c, i) => { const r = c.rows[0]; if (!r) return ''; const pick = (names, fallback) => { const k = c.names.findIndex(n => names.includes(n)); return k >= 0 ? { v: r.vals[k], l: c.labels[k] || '' } : { v: r.vals[0] || '', l: c.labels[0] || '' }; }; const want = L.sport === 'football' ? { passing: ['passingYards'], rushing: ['rushingYards'], receiving: ['receivingYards'], defensive: ['totalTackles'] } : { batting: ['homeRuns'], pitching: ['ERA'] }; const { v, l } = pick(want[c.cat] || [], 0); return `<div class="ldr"><img src="${esc(r.img || '')}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><div><a class="nm" href="${hrefP(lk, r.id)}">${esc(r.name)}</a><small>${esc(r.team)} · ${esc((STAT_CATS[L.sport].find(x => x[0] === c.cat) || [])[1] || c.cat)} · ${esc(l)}</small></div><b>${esc(v)}</b></div>`; }).join('');
      grid.push(mod('Leaders', items || '<p class="muted">Player stats load once the season has games.</p>', { cls: 'c3', id: 'm-leaders', x: 'season', href: hrefS('players', lk) }));
    } else if (lp && lp.rows.length) {
      const maxGp = Math.max(1, ...lp.rows.map(r => r.gp)); const q = lp.rows.filter(r => r.gp >= Math.ceil(maxGp * 0.5));
      const top = (k, label, dp = 1) => { const r = [...q].sort((a, b) => b[k] - a[k])[0]; return r ? `<div class="ldr"><img src="${esc(r.img || '')}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><div><a class="nm" href="${hrefP(lk, r.id)}">${esc(r.name)}</a><small>${esc(r.team)} · ${label}</small></div><b>${(+r[k]).toFixed(dp)}</b></div>` : ''; };
      grid.push(mod('Leaders', top('pts', 'points') + top('reb', 'rebounds') + top('ast', 'assists') + top('tpm', '3-pointers made') + top('stl', 'steals') + top('blk', 'blocks'), { cls: 'c3', id: 'm-leaders', x: 'per game', href: hrefS('players', lk) }));
    } else grid.push(mod('Leaders', '<p class="muted">Player stats load once the season has games.</p>', { cls: 'c3', id: 'm-leaders', href: hrefS('players', lk), x: 'per game' }));
    // injuries (NBA/WNBA) or movers (college)
    if (L.hasInjuries && inj) {
      const playing = new Set(games.flatMap(g => [g.home.id, g.away.id]));
      const items = [];
      games.filter(g => g.state !== 'post').forEach(g => { const f = fcs.get(g.id); if (f.soH) items.push({ id: g.home.id, abbr: g.home.abbr, names: f.soH.names, pts: f.soH.pts }); if (f.soA) items.push({ id: g.away.id, abbr: g.away.abbr, names: f.soA.names, pts: f.soA.pts }); });
      items.sort((a, b) => a.pts - b.pts);
      const seen = new Set(items.map(x => x.id));
      const rest = Object.entries(inj.byTeam).filter(([id, t]) => !seen.has(id) && t.list.some(x => /out/i.test(x.status || ''))).slice(0, 8 - items.length).map(([id, t]) => ({ id, abbr: (t.name || '').split(' ').pop(), names: t.list.filter(x => /out/i.test(x.status || '')).slice(0, 3).map(x => (x.athlete.displayName || '').split(' ').pop()), pts: null, today: playing.has(id) }));
      const rows = [...items, ...rest].slice(0, 8).map(x => `<div class="inj"><span class="pill out">Out</span><span class="ab">${esc(x.abbr)}</span><a href="${hrefT(lk, x.id)}">${esc(x.names.join(', '))}</a>${x.pts != null ? `<span class="dl">${sign(x.pts)}</span>` : '<span class="dl" style="color:var(--ink-4)">off tonight</span>'}</div>`).join('');
      grid.push(mod('Injuries', rows || '<p class="muted">Nobody notable ruled out.</p>', { cls: 'c3', id: 'm-injuries', x: 'line impact', href: hrefS('injuries', lk) }));
    } else {
      const mv = ctx.ratings && ctx.ratings.teams ? Object.entries(ctx.ratings.teams).map(([id, v]) => ({ id, ...v })).filter(v => v.d7 != null).sort((a, b) => Math.abs(b.d7) - Math.abs(a.d7)).slice(0, 8) : [];
      grid.push(mod('Movers', mv.length ? mv.map(r => `<div class="mv"><a href="${hrefT(lk, r.id)}" style="text-decoration:none">${esc(r.name || r.abbr)}</a><b class="${r.d7 > 0 ? 'pos' : 'neg'}">${r.d7 > 0 ? '+' : ''}${Math.round(r.d7)}</b></div>`).join('') : '<p class="muted">Movers show after a week of results.</p>', { cls: 'c3', id: 'm-injuries', x: 'Elo change · 7 days', href: hrefS('forecasts', lk) }));
    }
    // power ratings
    const topR = ctx.ratings && ctx.ratings.teams ? Object.entries(ctx.ratings.teams).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.elo - a.elo).slice(0, 8) : [];
    grid.push(mod('Power ratings', topR.length ? `<table class="t"><thead><tr><th>Team</th><th>Elo</th><th>7d</th></tr></thead><tbody>${topR.map((r, i) => `<tr class="click${favs.has(lk, r.id) ? ' fav' : ''}" data-href="${hrefT(lk, r.id)}"><td><span class="team"><span class="n">${i + 1}</span><a href="${hrefT(lk, r.id)}">${esc(r.short || r.name || r.abbr)}</a></span></td><td>${Math.round(r.elo)}</td><td class="${r.d7 > 0 ? 'pos' : r.d7 < 0 ? 'neg' : ''}">${r.d7 != null ? (r.d7 > 0 ? '+' : '') + Math.round(r.d7) : ''}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Ratings start with the first results of the season.</p>', { cls: 'c3', id: 'm-ratings', x: ctx.ratings ? 'Elo · ' + ago(ctx.ratings.generated) : 'Elo', href: hrefS('forecasts', lk) }));
    // model
    let modelBody = '';
    if (recs && recs.games && recs.games.length) { const gs = recs.games, n = gs.length; const hit = gs.filter(g => (g.p >= .5) === (g.hs > g.as)).length; const br = gs.reduce((s, g) => s + ((g.hs > g.as ? 1 : 0) - g.p) ** 2, 0) / n; const eg = gs.filter(g => g.ep != null); const eh = eg.filter(g => (g.ep >= .5) === (g.hs > g.as)).length; modelBody += `<div class="rec"><div><b>${(hit / n * 100).toFixed(1)}%</b><small>Tipoff</small></div>${eg.length ? `<div><b>${(eh / eg.length * 100).toFixed(1)}%</b><small>ESPN</small></div>` : ''}<div><b>${br.toFixed(3)}</b><small>Brier</small></div></div>`; modelBody += `<div class="mv"><span>Games scored</span><b>${n}</b></div>`; }
    else modelBody += '<p class="muted" style="margin:0 0 6px">No forecasts scored yet this season.</p>';
    if (P && P.tunedAt) modelBody += `<div class="mv"><span>Last tune</span><b>${esc(tuneLine(P).replace(/^Ratings tuned /, ''))}</b></div><div class="mv"><span>Home court · rest · spread</span><b>${P.hca} · ${P.b2b} · ${P.sd}</b></div>`;
    if (P && P.calib) modelBody += `<div class="mv"><span>Calibration</span><b>${P.calib.a > 1.05 ? 'was underconfident' : P.calib.a < .95 ? 'was overconfident' : 'on target'}</b></div>`;
    if (aiRec && aiRec.byLeague && aiRec.byLeague[lk]) { const r = aiRec.byLeague[lk]; modelBody += `<div class="mv"><span>Predictions</span><b>${r.hit} of ${r.n}${r.last7 ? ` · ${r.last7.hit} of ${r.last7.n} last 7d` : ''}</b></div>`; }
    grid.push(mod('Model', modelBody, { cls: 'c3', id: 'm-model', x: 'learns nightly', href: '#record' }));
    // news
    if (news && news.articles && news.articles.length) grid.push(mod('News', `<div class="news">${news.articles.slice(0, 5).map(a => { const img = a.images && a.images[0] && a.images[0].url; return `<a href="${esc(a.links && a.links.web && a.links.web.href || '#')}" target="_blank" rel="noopener">${img ? `<img class="im" src="${esc(img)}" alt="" loading="lazy">` : '<span class="im"></span>'}<div><h5>${esc(a.headline)}</h5><small>${esc(ago(a.published))}${a.byline ? ' · ' + esc(a.byline) : ''}</small></div></a>`; }).join('')}</div>`, { cls: 'c3', id: 'm-news', x: 'latest', href: hrefS('news', lk) }));
    parts.push(`<div class="grid">${grid.join('')}</div>`);
    $main.innerHTML = parts.join('');
    const sub = document.querySelector('#subnav .d'); if (sub && P) sub.textContent = tuneLine(P);
  };
  render();
  return { live: render };
}

/* ================= SCORES ================= */
async function scores(lk, dateArg) {
  const L = LEAGUES[lk]; remember(lk);
  const ymd = dateArg && /^\d{8}$/.test(dateArg) ? expand(dateArg) : todayCT();
  const isToday = ymd === todayCT();
  const nav = `<div class="datenav"><a class="btn sm ghost" href="${hrefS('scores', lk, compact(addDays(ymd, -1)))}" aria-label="Previous day">‹</a>${isToday ? '' : `<a class="btn sm ghost" href="${hrefS('scores', lk)}">Today</a>`}<input class="inp" type="date" id="gameDate" value="${ymd}" aria-label="Pick a date" style="flex:0 1 auto"><a class="btn sm ghost" href="${hrefS('scores', lk, compact(addDays(ymd, 1)))}" aria-label="Next day">›</a></div>`;
  const bind = () => { const el = document.getElementById('gameDate'); el && el.addEventListener('change', e => { if (e.target.value) location.hash = hrefS('scores', lk, compact(e.target.value)).slice(1); }); };
  $main.innerHTML = head(esc(isToday ? 'Today' : relDay(ymd)), esc(L.label), nav) + `<div class="bugs">${Array.from({ length: 6 }, () => '<div class="bug" style="height:96px"></div>').join('')}</div>`; bind();
  let list; try { list = isToday ? S.today[lk] : await scoreboard(L, ymd); } catch { $main.innerHTML = head(esc(relDay(ymd)), esc(L.label), nav) + failMsg('games'); bind(); return; }
  const ctx = await forecastCtx(L, ymd);
  const render = () => {
    const games = sortGames(isToday ? S.today[lk] : list);
    const live = games.filter(isLive).length, fin = games.filter(g => g.state === 'post').length;
    const d = `${esc(L.label)} · ${esc(dayLabel(ymd, { weekday: 'long', month: 'long', day: 'numeric' }))} · ${games.length} game${games.length === 1 ? '' : 's'}${live ? ` · <span style="color:var(--live)">${live} live</span>` : ''}${fin && fin < games.length ? ` · ${fin} final` : ''}${L.hasRankings ? ' · ranked matchups first' : ''}`;
    $main.innerHTML = head(esc(isToday ? 'Today' : relDay(ymd)), d, nav) + (games.length ? `<div class="bugs">${games.map(g => bug(g, forecast(L, g, ctx))).join('')}</div>` : state(`No ${L.noun} games ${isToday ? 'today' : 'on this date'}`, `<p>${L.offseason && isToday ? esc(L.offseason) : `Upcoming games and forecasts are on the <a href="${hrefS('forecasts', lk)}">Forecasts</a> page.`}</p>`));
    bind();
  };
  render();
  return isToday ? { live: render } : null;
}

/* ================= INJURIES ================= */
async function injuriesView(lk) {
  const L = LEAGUES[lk]; remember(lk);
  if (!L.hasInjuries) { $main.innerHTML = head('Injuries', esc(L.label)) + state('No injury feed for this league', `<p>ESPN doesn't publish a ${esc(L.noun)} injury report. Rosters on each <a href="${hrefS('teams', lk)}">team page</a> show who is listed out.</p>`); return; }
  $main.innerHTML = head('Injuries', esc(L.label)) + skeleton(10);
  const [inj, ctx] = await Promise.all([injuries(L), forecastCtx(L, todayCT())]);
  if (!inj) { $main.innerHTML = head('Injuries', esc(L.label)) + failMsg('injuries'); return; }
  const F = favs.all()[lk] || [];
  const playing = new Set(S.today[lk].flatMap(g => [g.home.id, g.away.id]));
  const teamsL = Object.entries(inj.byTeam).filter(([, t]) => t.list.length).sort(([a, ta], [b, tb]) => F.includes(b) - F.includes(a) || playing.has(b) - playing.has(a) || ta.name.localeCompare(tb.name));
  const sel = store.get('injTeam:' + lk, '');
  const opts = `<select class="sel" id="injTeam" aria-label="Team"><option value="">All teams (${teamsL.reduce((n, [, t]) => n + t.list.length, 0)} players)</option>${teamsL.map(([id, t]) => `<option value="${esc(id)}"${id === sel ? ' selected' : ''}>${esc(t.name)} (${t.list.length})</option>`).join('')}</select>`;
  const impact = id => { const g = S.today[lk].find(x => x.home.id === id || x.away.id === id); if (!g || g.state === 'post') return ''; const f = forecast(L, g, ctx); const so = g.home.id === id ? f.soH : f.soA; return so ? `<span class="pill" style="background:var(--loss)">tonight ${sign(so.pts)}</span>` : ''; };
  const list = teamsL.filter(([id]) => !sel || id === sel).map(([id, t]) => mod(t.name, t.list.map(x => injItem(x, x.athlete && x.athlete.position && x.athlete.position.abbreviation || '', L)).join(''), { x: `${t.list.length} listed ${playing.has(id) ? '· plays today ' : ''}${impact(id)}`, href: hrefT(lk, id) })).join('');
  $main.innerHTML = head('Injuries', `${esc(L.label)} · status, comments and estimated return dates are ESPN's; "tonight −x" is what the model takes off the line`) + `<div class="ctrls">${opts}</div><div class="grid">${list.replace(/<section class="mod /g, '<section class="mod c6 ')}</div>`;
  document.getElementById('injTeam').addEventListener('change', e => { store.set('injTeam:' + lk, e.target.value); injuriesView(lk); });
}

/* ================= FORECASTS ================= */
async function forecasts(lk) {
  const L = LEAGUES[lk]; remember(lk);
  $main.innerHTML = head('Forecasts', `${esc(L.label)} · the next seven days`) + skeleton(10);
  const t = todayCT(); const days = Array.from({ length: 7 }, (_, i) => addDays(t, i));
  const [ais, boards, base, yday, rt, P] = await Promise.all([Promise.all(days.map(aiFor)), Promise.all(days.map(d => scoreboard(L, d).catch(() => []))), forecastCtx(L, t), scoreboard(L, addDays(t, -1)).catch(() => []), HW.ratings(L), params(L)]);
  const sections = days.map((d, i) => { const gs = sortGames(boards[i].filter(g => g.state !== 'post')); if (!gs.length) return ''; const played = new Set((i === 0 ? yday : boards[i - 1]).filter(g => g.state !== 'pre').flatMap(g => [g.home.id, g.away.id])); const ctx = { ...base, b2b: played }; const cap = COLLEGE.includes(lk) ? 40 : 30; return mod(relDay(d), `<div class="fcl">${gs.slice(0, cap).map(g => fcRow(L, g, forecast(L, g, ctx), aiEntry(ais[i], g))).join('')}</div>${gs.length > cap ? `<p class="note"><a href="${hrefS('scores', lk, compact(d))}">All ${gs.length} games that day →</a></p>` : ''}`, { x: `${dayLabel(d, { weekday: 'short', month: 'short', day: 'numeric' })} · ${gs.length} games${ais[i] ? ' · predictions in' : ''}` }); }).join('');
  const side = [];
  if (rt && rt.teams) { const topT = Object.entries(rt.teams).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.elo - a.elo).slice(0, 15); side.push(mod('Power ratings', `<table class="t"><thead><tr><th>Team</th><th>Elo</th><th>vs avg</th><th>7d</th></tr></thead><tbody>${topT.map((r, i) => `<tr class="click${favs.has(lk, r.id) ? ' fav' : ''}" data-href="${hrefT(lk, r.id)}"><td><span class="team"><span class="n">${i + 1}</span><a href="${hrefT(lk, r.id)}">${esc(r.short || r.name || r.abbr)}</a></span></td><td>${Math.round(r.elo)}</td><td>${sign((r.elo - 1500) / L.eloPerPoint)}</td><td class="${r.d7 > 0 ? 'pos' : r.d7 < 0 ? 'neg' : ''}">${r.d7 != null ? (r.d7 > 0 ? '+' : '') + Math.round(r.d7) : ''}</td></tr>`).join('')}</tbody></table><p class="note">"vs avg" is the projected margin against an average team on a neutral floor.</p>`, { x: 'Elo · updated ' + ago(rt.generated) })); }
  const hca = P && P.hca != null ? P.hca : L.hca, b2b = P && P.b2b != null ? P.b2b : L.b2b, sd = P && P.sd != null ? P.sd : L.sd;
  side.push(mod('How it learns', `<p style="margin:0 0 8px;font-size:13px">Every team carries an Elo rating that moves after each game by how surprising the result was and how big the margin was. It's rebuilt nightly from every ${esc(L.noun)} result this season.</p><p style="margin:0 0 8px;font-size:13px">Projected margin = rating gap + <b>${hca}</b> for ${homeWord(L)}${L.b2b ? ` − <b>${b2b}</b> for a team that played yesterday` : ''}${L.sport === 'basketball' ? " − about 0.18 points per point-per-game of scoring that's ruled out" : L.hasInjuries ? ' − a small adjustment for listed-out starters' : ''}. The margin becomes a win chance using a <b>${sd}</b>-${unit(L).replace(/s$/, '')} spread, then a calibration layer corrects any over- or under-confidence the record shows.</p><p style="margin:0;font-size:13px">Every night the job re-tests ${homeWord(L)}, rest and spread against the whole season and keeps whatever scores best. ${P && P.tunedAt ? `Last tune: ${esc(tuneLine(P).replace(/^Ratings tuned /, ''))}.` : 'First tune runs after tonight\'s games.'}</p><p class="note">Tap <b>Why</b> on any game for its inputs. <a href="#record" style="color:var(--link)">See the record →</a></p>`, { x: 'self-tuning', href: '#record' }));
  $main.innerHTML = head('Forecasts', `${esc(L.label)} · the next seven days · win chances from the Tipoff rating model`) + `<div class="page"><div class="col">${sections || state('Nothing scheduled', `<p>No ${esc(L.noun)} games in the next seven days.</p>`)}</div><div class="col">${side.join('')}</div></div>`;
}

/* ================= GAME ================= */
async function game(lk, id) {
  const L = LEAGUES[lk]; if (!L || !id) { $main.innerHTML = failMsg('this game'); return; } remember(lk);
  $main.innerHTML = `<div class="page"><div class="col">${skeleton(4)}${skeleton(10)}</div><div class="col">${skeleton(6)}</div></div>`;
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
    const out = [hero(L, g, f, ai || null, { actions: `<a class="btn sm" style="background:transparent;color:var(--on-hdr);box-shadow:inset 0 0 0 1px rgba(255,255,255,.35)" href="${hrefS('scores', lk, ymd === todayCT() ? null : compact(ymd))}">All ${esc(L.label)} games</a>` })];
    if (espnLine) out.push(`<p class="cmpline">${espnLine} · Tipoff ${esc(g.home.abbr)} ${pct(f.pHome)} · <a href="#record">our record</a></p>`);
    const per = Math.max(g.home.lines.length, g.away.lines.length, L.sport === 'baseball' && g.state !== 'pre' ? 9 : 0); const reg = L.periods || 4;
    if (per) {
      const bb = L.sport === 'baseball'; const comp = side => (hc.competitors || []).find(c => String(c.team && c.team.id) === side.id) || {};
      const hdr = Array.from({ length: per }, (_, i) => `<th>${perLabel(L, i, per)}</th>`).join('');
      const row = s => { const c = comp(s); return `<tr><td class="l"><span class="team"><i class="tb" style="background:${s.color}"></i><a href="${hrefT(lk, s.id)}">${tn(s)}</a></span></td>${Array.from({ length: per }, (_, i) => `<td>${esc(s.lines[i] ?? '')}</td>`).join('')}<td><b>${esc(s.score ?? '')}</b></td>${bb ? `<td>${esc(c.hits ?? '')}</td><td>${esc(c.errors ?? '')}</td>` : ''}</tr>`; };
      out.push(mod(bb ? 'Line score' : 'Scoring', `<div class="tw"><table class="t"><thead><tr><th>Team</th>${hdr}<th>${bb ? 'R' : 'T'}</th>${bb ? '<th>H</th><th>E</th>' : ''}</tr></thead><tbody>${row(g.away)}${row(g.home)}</tbody></table></div>`, { x: d.gameInfo && d.gameInfo.attendance ? d.gameInfo.attendance.toLocaleString() + ' attendance' : '' }));
    }
    const bx = d.boxscore && d.boxscore.players || [];
    const boxFor = side => {
      const p = bx.find(x => String(x.team.id) === side.id); if (!p || !p.statistics || !p.statistics.length) return '';
      const cats = p.statistics.filter(s => s && (s.athletes || []).length);
      if (!cats.length) return '';
      const table = s => {
        const labels = s.labels || s.names || []; const ath = s.athletes || [];
        const rowOf = a => { const nm = `<a href="${hrefP(lk, esc(a.athlete.id))}">${esc(a.athlete.shortName || a.athlete.displayName)}</a> <span class="muted" style="font-weight:500">${esc(a.athlete.position && a.athlete.position.abbreviation || '')}</span>`; if (a.didNotPlay || !a.stats || !a.stats.length) return `<tr><td>${nm}</td><td class="dnp" colspan="${labels.length}">${esc(a.reason || 'Did not play')}</td></tr>`; return `<tr><td>${nm}</td>${a.stats.map(v => `<td>${esc(v)}</td>`).join('')}</tr>`; };
        const tot = s.totals && s.totals.length ? `<tr class="tot"><td>Team</td>${s.totals.map(v => `<td>${esc(v)}</td>`).join('')}</tr>` : '';
        let body;
        if (L.sport === 'basketball') { const st = ath.filter(a => a.starter), bn = ath.filter(a => !a.starter); body = `${st.length ? `<tr class="sub"><td colspan="${labels.length + 1}">Starters</td></tr>` + st.map(rowOf).join('') : ''}${bn.length ? `<tr class="sub"><td colspan="${labels.length + 1}">Bench</td></tr>` + bn.map(rowOf).join('') : ''}`; }
        else body = `<tr class="sub"><td colspan="${labels.length + 1}">${esc(s.text || s.displayName || s.name || '')}</td></tr>` + ath.map(rowOf).join('');
        return `<div class="tw"><table class="t box"><thead><tr><th>Player</th>${labels.map(l => `<th>${esc(l)}</th>`).join('')}</tr></thead><tbody>${body}${tot}</tbody></table></div>`;
      };
      return mod(side.short, cats.map(table).join(''), { x: 'box score' });
    };
    const boxes = [boxFor(g.away), boxFor(g.home)].filter(Boolean);
    const tms = d.boxscore && d.boxscore.teams || [];
    const ta = tms.find(t => String(t.team.id) === g.away.id), th = tms.find(t => String(t.team.id) === g.home.id);
    let compare = '', factors = '';
    if (ta && th && g.state !== 'pre') {
      const flat = t => (t.statistics || []).flatMap(x => x && x.displayValue != null ? [x] : (x && (x.stats || x.statistics) || []));
      const get = (t, n) => flat(t).find(x => x.name === n);
      const num = (t, n, part = 0) => { const x = get(t, n); if (!x) return null; return parseFloat(String(x.displayValue).split('-')[part]); };
      const WANT = {
        basketball: ['fieldGoalsMade-fieldGoalsAttempted', 'fieldGoalPct', 'threePointFieldGoalsMade-threePointFieldGoalsAttempted', 'threePointFieldGoalPct', 'freeThrowsMade-freeThrowsAttempted', 'totalRebounds', 'offensiveRebounds', 'assists', 'steals', 'blocks', 'turnovers', 'pointsInPaint', 'fastBreakPoints', 'largestLead'],
        football: ['firstDowns', 'totalYards', 'yardsPerPlay', 'netPassingYards', 'completionAttempts', 'yardsPerPass', 'rushingYards', 'rushingAttempts', 'yardsPerRushAttempt', 'thirdDownEff', 'fourthDownEff', 'redZoneAttempts', 'totalPenaltiesYards', 'turnovers', 'sacksYardsLost', 'possessionTime'],
        baseball: ['runs', 'hits', 'errors', 'homeRuns', 'doubles', 'triples', 'RBIs', 'walks', 'strikeouts', 'stolenBases', 'leftOnBase', 'avg', 'earnedRuns', 'pitchesThrown']
      };
      const LOW = { turnovers: 1, totalPenaltiesYards: 1, sacksYardsLost: 1, errors: 1, leftOnBase: 1, earnedRuns: 1 };
      let want = (WANT[L.sport] || []).filter(n => get(ta, n) && get(th, n));
      if (want.length < 4) want = flat(ta).map(x => x.name).filter(n => get(th, n)).slice(0, 14);
      const rows = want.map(n => { const a = get(ta, n), h = get(th, n); if (!a || !h) return ''; const av = parseFloat(String(a.displayValue).split('-')[0]) || 0, hv = parseFloat(String(h.displayValue).split('-')[0]) || 0; const tot = av + hv || 1; const lowGood = !!LOW[n]; return `<div class="cmp-row"><span>${esc(a.displayValue)}</span><div class="cmp-mid"><small>${esc(a.label || a.abbreviation || n)}</small><div class="cmp-bar"><i style="width:${av / tot * 100}%;background:${g.away.color};opacity:${(lowGood ? av <= hv : av >= hv) ? 1 : .4}"></i><i style="width:${hv / tot * 100}%;background:${g.home.color};opacity:${(lowGood ? hv <= av : hv >= av) ? 1 : .4}"></i></div></div><span>${esc(h.displayValue)}</span></div>`; }).join('');
      if (rows) compare = mod('Team stats', `<div class="compare">${rows}</div>`, { x: `${esc(g.away.abbr)} · ${esc(g.home.abbr)}` });
      const ff = (t, o, s) => { const fgm = num(t, 'fieldGoalsMade-fieldGoalsAttempted', 0), fga = num(t, 'fieldGoalsMade-fieldGoalsAttempted', 1), tpm = num(t, 'threePointFieldGoalsMade-threePointFieldGoalsAttempted', 0), fta = num(t, 'freeThrowsMade-freeThrowsAttempted', 1), orb = num(t, 'offensiveRebounds'), tov = num(t, 'turnovers'), odrb = num(o, 'defensiveRebounds'), oorb = num(o, 'offensiveRebounds'), ofga = num(o, 'fieldGoalsMade-fieldGoalsAttempted', 1), ofta = num(o, 'freeThrowsMade-freeThrowsAttempted', 1), otov = num(o, 'turnovers'); if ([fgm, fga, tpm, fta, orb, tov].some(v => v == null || isNaN(v))) return null; const poss = fga - orb + tov + 0.44 * fta; const oposs = ofga != null ? ofga - (oorb || 0) + (otov || 0) + 0.44 * (ofta || 0) : poss; return { efg: (fgm + 0.5 * tpm) / fga, ts: s.score / (2 * (fga + 0.44 * fta)), tov: tov / (fga + 0.44 * fta + tov), orb: odrb != null ? orb / (orb + odrb) : null, ftr: fta / fga, ortg: s.score / poss * 100, pace: (poss + oposs) / 2 }; };
      const A = L.sport === 'basketball' ? ff(ta, th, g.away) : null, Hh = L.sport === 'basketball' ? ff(th, ta, g.home) : null;
      if (A && Hh) { const r = (lbl, a, h, fmt, lowGood) => `<div class="cmp-row"><span${(lowGood ? a <= h : a >= h) ? ' class="w"' : ''}>${fmt(a)}</span><div class="cmp-mid"><small>${lbl}</small></div><span${(lowGood ? h <= a : h >= a) ? ' class="w"' : ''}>${fmt(h)}</span></div>`; const p1 = v => v == null ? '—' : (v * 100).toFixed(1) + '%', d1 = v => v == null ? '—' : v.toFixed(1); factors = mod('Four factors', `<div class="compare">${r('Effective FG%', A.efg, Hh.efg, p1)}${r('True shooting', A.ts, Hh.ts, p1)}${r('Turnover rate', A.tov, Hh.tov, p1, true)}${r('Off. rebound rate', A.orb, Hh.orb, p1)}${r('FT rate (FTA/FGA)', A.ftr, Hh.ftr, p1)}${r('Offensive rating', A.ortg, Hh.ortg, d1)}</div><p class="note">Pace: about ${d1(A.pace)} possessions per team${g.state === 'in' ? ' so far' : ''}. Offensive rating is points per 100 possessions.</p>`, { x: `${esc(g.away.abbr)} · ${esc(g.home.abbr)}` }); }
    }
    let leaders = '';
    if (d.leaders && d.leaders.length) { const items = []; d.leaders.forEach(t => (t.leaders || []).slice(0, 3).forEach(cat => { const Ld = cat.leaders && cat.leaders[0]; if (Ld) items.push({ team: t.team, cat, Ld }); })); if (items.length) leaders = mod(g.state === 'pre' ? 'Season leaders' : 'Game leaders', items.map(({ team, cat, Ld }) => `<div class="leader"><img src="${esc(Ld.athlete.headshot && (Ld.athlete.headshot.href || Ld.athlete.headshot) || '')}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><div><a href="${hrefP(lk, esc(Ld.athlete.id))}">${esc(Ld.athlete.displayName)}</a><small>${esc(team.abbreviation)} · ${esc(cat.displayName)}${Ld.summary ? ' · ' + esc(Ld.summary) : ''}</small></div><b>${esc(Ld.displayValue)}</b></div>`).join('')); }
    let wpChart = '';
    if (wp.length > 3) { const W = 600, Hc = 160, n = wp.length; const pts = wp.map((x, i) => `${(i / (n - 1) * W).toFixed(1)},${((1 - x.homeWinPercentage) * Hc).toFixed(1)}`).join(' '); const labels = L.sport === 'baseball' ? Array.from({ length: 9 }, (_, i) => String(i + 1)) : reg === 4 ? ['Q1', 'Q2', 'Q3', 'Q4'] : ['1st half', '2nd half']; wpChart = mod('Win probability', `<div class="wp"><svg viewBox="-34 -8 ${W + 44} ${Hc + 26}" role="img" aria-label="Win probability over the game"><line x1="0" y1="${Hc / 2}" x2="${W}" y2="${Hc / 2}" stroke="currentColor" stroke-opacity=".25" stroke-dasharray="4 4"/>${labels.map((_, i) => `<line x1="${(i + 1) / labels.length * W}" y1="0" x2="${(i + 1) / labels.length * W}" y2="${Hc}" stroke="currentColor" stroke-opacity=".08"/>`).join('')}<polygon points="0,${Hc / 2} ${pts} ${W},${Hc / 2}" fill="${g.home.color}" fill-opacity=".18"/><polyline points="${pts}" fill="none" stroke="${g.home.color}" stroke-width="2.5"/><text x="-6" y="10" text-anchor="end">${esc(g.home.abbr)}</text><text x="-6" y="${Hc}" text-anchor="end">${esc(g.away.abbr)}</text><text x="-6" y="${Hc / 2 + 3}" text-anchor="end">50%</text>${labels.map((q, i) => `<text x="${(i + .5) / labels.length * W}" y="${Hc + 16}" text-anchor="middle">${q}</text>`).join('')}</svg></div>`, { x: `ESPN · ${esc(g.home.abbr)} above the line` }); }
    let inj = '';
    if (d.injuries && d.injuries.some(t => t.injuries && t.injuries.length)) inj = mod('Injuries', d.injuries.map(t => (t.injuries || []).map(x => injItem(x, t.team && t.team.abbreviation, L)).join('')).join(''));
    let l5 = '';
    if (d.lastFiveGames && d.lastFiveGames.length) l5 = mod('Last five', d.lastFiveGames.map(t => `<p style="margin:0 0 10px"><b>${esc(t.team && t.team.displayName)}</b><br>${(t.events || []).map(e => `<span class="chip"><span class="${e.gameResult === 'W' ? 'w' : 'lo'}">${esc(e.gameResult)}</span> ${esc(e.atVs)} ${esc(e.opponent && e.opponent.abbreviation)} ${esc(e.score)}</span>`).join(' ')}</p>`).join('') + (d.seasonseries && d.seasonseries[0] ? `<p class="note">Season series: ${esc(d.seasonseries[0].summary || d.seasonseries[0].description || '')}</p>` : ''));
    let recap = '';
    const art = d.article; const arts = d.news && d.news.articles || [];
    if ((art && art.headline) || arts.length) { const list = [art && art.headline ? { headline: art.headline, href: art.links && art.links.web && art.links.web.href, desc: art.description } : null, ...arts.slice(0, 4).map(a => ({ headline: a.headline, href: a.links && a.links.web && a.links.web.href, desc: a.description }))].filter(Boolean); recap = mod(g.state === 'post' ? 'Recap & stories' : 'Stories', list.map(a => `<div class="wire-item"><span><a href="${esc(a.href || '#')}" target="_blank" rel="noopener"><b>${esc(a.headline)}</b></a>${a.desc ? `<br><span class="muted">${esc(a.desc)}</span>` : ''}</span></div>`).join('')); }
    $main.innerHTML = `<div class="page"><div class="col">${out.join('')}${boxes.join('')}${wpChart}</div><div class="col">${factors}${compare}${leaders}${inj}${l5}${recap}</div></div>`;
  };
  await render();
  return { live: async () => { const st = data.header && data.header.competitions[0].status.type.state; const g = S.today[lk].find(x => x.id === id); if ((g && g.state !== 'post') || st === 'in') { try { await load(15000); await render(); } catch { } } } };
}

/* ================= STANDINGS ================= */
async function standingsView(lk) {
  const L = LEAGUES[lk]; remember(lk);
  $main.innerHTML = head('Standings', esc(L.label)) + skeleton(12);
  let cur; try { cur = await standings(L); } catch { $main.innerHTML = head('Standings', esc(L.label)) + failMsg('standings'); return; }
  const rt = await HW.ratings(L).catch(() => null); const eloOf = id => rt && rt.teams && rt.teams[id] ? Math.round(rt.teams[id].elo) : null;
  const conf = L.standingsMode === 'conferences';
  const cols = conf ? `<th>W</th><th>L</th><th>Pct</th><th>Conf</th><th>Home</th><th>Road</th><th>Strk</th><th>PPG</th><th>Opp</th><th>Net</th><th>Elo</th>` : `<th>W</th><th>L</th><th>Pct</th><th>GB</th><th>Home</th><th>Road</th><th>L10</th><th>Strk</th><th>PPG</th><th>Opp</th><th>Net</th><th>Elo</th>`;
  const row = (r, i, cut) => `<tr class="click${favs.has(lk, r.id) ? ' fav' : ''}${cut ? ' cut' : ''}" data-href="${hrefT(lk, r.id)}"><td><span class="team"><span class="n">${i + 1}</span><img class="headshot sq" src="${esc(r.logo)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><a href="${hrefT(lk, r.id)}">${esc(r.name)}</a></span></td><td>${r.w}</td><td>${r.l}</td><td>${esc(r.pct)}</td>${conf ? `<td>${esc(r.conf)}</td>` : `<td>${esc(r.gb)}</td>`}<td>${esc(r.home)}</td><td>${esc(r.road)}</td>${conf ? '' : `<td>${esc(r.l10)}</td>`}<td>${esc(r.strk)}</td><td>${r.ppg != null ? (+r.ppg).toFixed(1) : ''}</td><td>${r.opp != null ? (+r.opp).toFixed(1) : ''}</td><td class="${r.diff > 0 ? 'pos' : r.diff < 0 ? 'neg' : ''}">${r.diff != null ? sign(+r.diff) : ''}</td><td>${eloOf(r.id) ?? ''}</td></tr>`;
  const groupsSorted = [...cur.groups].sort((a, b) => { const fa = a.rows.some(r => favs.has(lk, r.id)), fb = b.rows.some(r => favs.has(lk, r.id)); return fb - fa || a.name.localeCompare(b.name); });
  const render = (m) => {
    let body;
    if (m === 'league') { const all = cur.groups.flatMap(c => c.rows).sort((a, b) => (b.w / Math.max(1, b.w + b.l)) - (a.w / Math.max(1, a.w + a.l)) || (b.diff || 0) - (a.diff || 0)); body = mod(conf ? 'All Division I' : 'League', `<div class="tw"><table class="t"><thead><tr><th>Team</th>${cols}</tr></thead><tbody>${all.map((r, i) => row(r, i)).join('')}</tbody></table></div>`, { x: `${all.length} teams` }); }
    else { const sel = conf ? store.get('stGroup:' + lk, '') : ''; const list = conf && sel ? groupsSorted.filter(c => c.name === sel) : groupsSorted; body = `<div class="col">${list.map(c => mod(c.name, `<div class="tw"><table class="t"><thead><tr><th>Team</th>${cols}</tr></thead><tbody>${c.rows.map((r, i) => row(r, i, (L.playoffLine || []).includes(i + 1))).join('')}</tbody></table></div>`, { x: conf ? c.rows.length + ' teams' : lk === 'nba' ? 'top 6 playoff · 7–10 play-in' : lk === 'wnba' ? 'top 8 make the playoffs' : '' })).join('')}</div>`; }
    const picker = conf && m !== 'league' ? `<select class="sel" id="stGroup" aria-label="Conference"><option value="">All conferences</option>${groupsSorted.map(c => `<option value="${esc(c.name)}"${store.get('stGroup:' + lk, '') === c.name ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select>` : '';
    $main.innerHTML = head('Standings', `${esc(cur.season || '')} ${esc(L.label)} · Net is average point margin · Elo is the Tipoff rating`) + `<div class="ctrls"><div class="tabs" style="margin:0" role="tablist"><button class="${m !== 'league' ? 'on' : ''}" role="tab" aria-selected="${m !== 'league'}" data-act="stmode" data-m="conf">${conf ? 'By conference' : L.standingsMode === 'league' ? 'League' : 'By conference'}</button><button class="${m === 'league' ? 'on' : ''}" role="tab" aria-selected="${m === 'league'}" data-act="stmode" data-m="league">${conf ? 'All teams' : 'League'}</button></div>${picker}</div>${body}`;
    const sg = document.getElementById('stGroup'); sg && sg.addEventListener('change', e => { store.set('stGroup:' + lk, e.target.value); render(m); });
  };
  render(store.get('stMode:' + lk, 'conf'));
  standingsView.render = m => { store.set('stMode:' + lk, m); render(m); };
}

/* ================= RANKINGS (college) ================= */
async function rankingsView(lk) {
  const L = LEAGUES[lk]; remember(lk);
  if (!L.hasRankings) { location.replace(hrefS('standings', lk)); return; }
  $main.innerHTML = head('Rankings', esc(L.label)) + skeleton(12);
  const [R, rt] = await Promise.all([rankings(L), HW.ratings(L)]);
  if (!R) { $main.innerHTML = head('Rankings', esc(L.label)) + failMsg('rankings'); return; }
  const eloRank = {}; const eloList = rt && rt.teams ? Object.entries(rt.teams).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.elo - a.elo) : []; eloList.forEach((t, i) => eloRank[t.id] = i + 1);
  const apRank = {}; R.ranks.forEach(r => apRank[r.team.id] = r.rank);
  const ap = mod(R.name, `<div class="tw"><table class="t"><thead><tr><th>Team</th><th>Record</th><th>Pts</th><th>1st</th><th>Prev</th><th>Trend</th><th>Tipoff</th></tr></thead><tbody>${R.ranks.map(r => `<tr class="click${favs.has(lk, r.team.id) ? ' fav' : ''}" data-href="${hrefT(lk, r.team.id)}"><td><span class="team"><span class="n">${r.rank}</span><img class="headshot sq" src="${esc(r.team.logo || '')}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><a href="${hrefT(lk, r.team.id)}">${esc(r.team.name)}</a></span></td><td>${esc(r.rec || '')}</td><td>${esc(r.pts || '')}</td><td>${r.first ? esc(r.first) : ''}</td><td>${esc(r.prev || '')}</td><td class="${/^\+/.test(r.trend || '') ? 'pos' : /^-\d/.test(r.trend || '') ? 'neg' : ''}">${esc(r.trend && r.trend !== '-' ? r.trend : '')}</td><td>${eloRank[r.team.id] ? '#' + eloRank[r.team.id] : '—'}</td></tr>`).join('')}</tbody></table></div><p class="note">"Tipoff" is where the team sits in our Elo power ratings, which ignore reputation and only move on results.</p>`, { x: R.week || 'poll' });
  const elo = eloList.length ? mod('Tipoff Top 25', `<div class="tw"><table class="t"><thead><tr><th>Team</th><th>Elo</th><th>7d</th><th>AP</th></tr></thead><tbody>${eloList.slice(0, 25).map((r, i) => `<tr class="click${favs.has(lk, r.id) ? ' fav' : ''}" data-href="${hrefT(lk, r.id)}"><td><span class="team"><span class="n">${i + 1}</span><a href="${hrefT(lk, r.id)}">${esc(r.name || r.abbr)}</a></span></td><td>${Math.round(r.elo)}</td><td class="${r.d7 > 0 ? 'pos' : r.d7 < 0 ? 'neg' : ''}">${r.d7 != null ? (r.d7 > 0 ? '+' : '') + Math.round(r.d7) : ''}</td><td>${apRank[r.id] ? '#' + apRank[r.id] : '—'}</td></tr>`).join('')}</tbody></table></div>`, { x: 'results only · ' + ago(rt.generated) }) : mod('Tipoff Top 25', '<p class="muted">Ratings start with the first results of the season.</p>');
  $main.innerHTML = head('Rankings', `${esc(L.label)} · the AP poll next to Tipoff's own results-only ratings`) + `<div class="page"><div class="col">${ap}</div><div class="col">${elo}</div></div>`;
}

/* ================= TEAMS ================= */
async function teams(lk) {
  const L = LEAGUES[lk]; remember(lk);
  $main.innerHTML = head('Teams', esc(L.label)) + skeleton(8);
  const [cur, R] = await Promise.all([standings(L).catch(() => null), rankings(L)]);
  if (!cur || !cur.groups.length) { $main.innerHTML = head('Teams', esc(L.label)) + failMsg('teams'); return; }
  const rankOf = {}; (R && R.ranks || []).forEach(r => rankOf[r.team.id] = r.rank);
  const card = r => `<a class="team-card" href="${hrefT(lk, r.id)}"><img src="${esc(r.logo)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><span style="min-width:0"><b>${rankOf[r.id] ? `<span class="rk">${rankOf[r.id]}</span>` : ''}${esc(r.name)}</b><small>${r.w}–${r.l}${L.standingsMode === 'conferences' ? ` · ${esc(r.conf || '')} ${esc(r.groupAbbr || r.group)}` : ` · ${ordinal(r.pos)} in ${esc(r.groupAbbr || r.group)}`}</small></span>${favs.has(lk, r.id) ? '<span class="star" aria-label="Favorite">★</span>' : ''}</a>`;
  const myIds = favs.all()[lk] || []; const mine = cur.groups.flatMap(c => c.rows).filter(r => myIds.includes(r.id));
  const q = L.standingsMode === 'conferences' ? `<div class="ctrls"><input class="inp" id="teamq" type="search" placeholder="Find a school or conference" aria-label="Find a team"></div>` : '';
  $main.innerHTML = head('Teams', `${cur.groups.reduce((n, c) => n + c.rows.length, 0)} ${esc(L.label)} teams · star a team on its page to pin it here and highlight its games`) + q + (mine.length ? `<h2 class="conf-h" style="margin-top:4px">My teams</h2><div class="teams">${mine.map(card).join('')}</div>` : '') + cur.groups.map(gp => `<div class="tgroup" data-name="${esc(gp.name.toLowerCase())}"><h2 class="conf-h">${esc(gp.name)}</h2><div class="teams">${gp.rows.map(card).join('')}</div></div>`).join('');
  const inp = document.getElementById('teamq');
  if (inp) inp.addEventListener('input', () => { const v = inp.value.trim().toLowerCase(); document.querySelectorAll('.tgroup').forEach(gq => { let any = false; gq.querySelectorAll('.team-card').forEach(c => { const hit = !v || (c.dataset.q || c.textContent.toLowerCase()).includes(v) || gq.dataset.name.includes(v); c.hidden = !hit; any = any || hit; }); gq.hidden = !any; }); });
}

/* ================= PLAYERS ================= */
const PST = {};
const PCOLS = [['gp', 'GP', 0], ['min', 'MIN', 1], ['pts', 'PTS', 1], ['reb', 'REB', 1], ['ast', 'AST', 1], ['stl', 'STL', 1], ['blk', 'BLK', 1], ['tov', 'TO', 1], ['fg', 'FG%', 1], ['tp', '3P%', 1], ['tpm', '3PM', 1], ['ft', 'FT%', 1], ['ts', 'TS%', 1]];
function playerTable(lk, rows, sortKey, showTeam = true, limit = Infinity) {
  return `<div class="tw"><table class="t"><thead><tr><th>Player</th>${showTeam ? '<th class="l">Team</th>' : ''}<th class="l">Pos</th>${PCOLS.map(([k, l]) => `<th class="sortable${k === sortKey ? ' sorted' : ''}" data-act="psort" data-k="${k}" tabindex="0" aria-sort="${k === sortKey ? 'descending' : 'none'}">${l}</th>`).join('')}</tr></thead><tbody>${rows.slice(0, limit).map((r, i) => `<tr class="click${favs.has(lk, r.teamId) ? ' fav' : ''}" data-href="${hrefP(lk, r.id)}"><td><span class="team"><span class="n">${i + 1}</span><img class="headshot" src="${esc(r.img || '')}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><a href="${hrefP(lk, r.id)}">${esc(r.name)}</a></span></td>${showTeam ? `<td class="l"><a href="${hrefT(lk, r.teamId)}">${esc(r.team)}</a></td>` : ''}<td class="l">${esc(r.pos)}</td>${PCOLS.map(([k, , dp]) => `<td>${(+r[k] || 0).toFixed(dp)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
async function players(lk) {
  const L = LEAGUES[lk]; remember(lk);
  if (L.sport !== 'basketball') return playersByCategory(lk);
  const P = PST[lk] = PST[lk] || { sort: 'pts', q: '', pos: '', qual: true, season: '', limit: 100 };
  $main.innerHTML = head('Players', `Loading every ${esc(L.noun)} player…`) + skeleton(14);
  let data; try { data = await leaguePlayers(L, P.season); } catch { $main.innerHTML = head('Players', esc(L.label)) + failMsg('player stats'); return; }
  const paint = () => {
    const maxGp = Math.max(1, ...data.rows.map(r => r.gp)); const minGp = Math.ceil(maxGp * 0.5);
    let rows = data.rows.filter(r => (!P.q || (r.name + ' ' + r.team).toLowerCase().includes(P.q.toLowerCase())) && (!P.pos || r.pos.includes(P.pos)) && (!P.qual || r.gp >= minGp));
    rows.sort((a, b) => (b[P.sort] || 0) - (a[P.sort] || 0));
    document.getElementById('ptable').innerHTML = (rows.length ? playerTable(lk, rows, P.sort, true, P.limit) : `<p class="muted">No players match that.</p>`) + (rows.length > P.limit ? `<div style="margin-top:12px"><button class="btn sm ghost" data-act="pmore">Show ${Math.min(100, rows.length - P.limit)} more of ${rows.length}</button></div>` : '');
    document.querySelector('#pcount').textContent = `${rows.length} players${P.qual ? ` · at least ${minGp} game${minGp === 1 ? '' : 's'}` : ''}`;
  };
  $main.innerHTML = head('Players', `${esc(data.label ? data.label + ' · ' : '')}${esc(L.label)} per-game averages · tap a column to sort · TS% is true shooting`) +
    `<div class="ctrls"><input class="inp" id="pq" type="search" placeholder="Search a player or team" value="${esc(P.q)}" aria-label="Search players">
    <select class="sel" id="ppos" aria-label="Position"><option value="">All positions</option><option value="G"${P.pos === 'G' ? ' selected' : ''}>Guards</option><option value="F"${P.pos === 'F' ? ' selected' : ''}>Forwards</option><option value="C"${P.pos === 'C' ? ' selected' : ''}>Centers</option></select>
    <select class="sel" id="pseason" aria-label="Season"><option value=""${!P.season ? ' selected' : ''}>This season</option><option value="${seasonYear() - 1}"${P.season ? ' selected' : ''}>Last season</option></select>
    <label class="chip" style="min-height:34px;cursor:pointer"><input type="checkbox" id="pqual" ${P.qual ? 'checked' : ''}> Regulars only</label></div>
    <section class="mod"><div class="mh">${esc(L.label)}<span class="x" id="pcount"></span><span class="c"></span></div><div class="mb" id="ptable"></div></section>${COLLEGE.includes(lk) ? '<p class="note">College lists the top 800 scorers; search by name for anyone else.</p>' : ''}`;
  paint();
  const q = document.getElementById('pq'); let t;
  q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { P.q = q.value.trim(); P.limit = 100; paint(); }, 150); });
  document.getElementById('ppos').addEventListener('change', e => { P.pos = e.target.value; paint(); });
  document.getElementById('pqual').addEventListener('change', e => { P.qual = e.target.checked; paint(); });
  document.getElementById('pseason').addEventListener('change', e => { P.season = e.target.value; players(lk); });
  players.paint = paint; players.st = P;
}

/* football and baseball: one sortable table per stat category (ESPN's season leaders feed) */
async function playersByCategory(lk) {
  const L = LEAGUES[lk]; const cats = STAT_CATS[L.sport] || [];
  const P = PST[lk] = PST[lk] || { cat: cats[0][0], sort: '', q: '', season: '', limit: 100 };
  if (!cats.some(c => c[0] === P.cat)) P.cat = cats[0][0];
  const def = cats.find(c => c[0] === P.cat);
  const tabs = `<div class="tabs" role="tablist">${cats.map(([k, l]) => `<a class="${P.cat === k ? 'on' : ''}" role="tab" aria-selected="${P.cat === k}" href="#" data-act="pcat" data-k="${k}">${l}</a>`).join('')}</div>`;
  $main.innerHTML = head('Players', `${esc(L.label)} season leaders · ${esc(def[1].toLowerCase())}`) + tabs + skeleton(14);
  let data; try { data = await statCategory(L, P.cat, def[2], 400, P.season); } catch { data = null; }
  if (!data || !data.rows.length) { $main.innerHTML = head('Players', esc(L.label)) + tabs + state('No player stats yet', `<p>ESPN's ${esc(L.noun)} leaders fill in once the season has games.</p>`); players.setCat = k => { P.cat = k; P.sort = ''; players(lk); }; return; }
  const norm = srt => { const [k, d] = String(srt || '').split(':'); return [k.split('.').pop(), d || 'desc']; };
  const paint = () => {
    const [sk, sd] = norm(P.sort || def[2]); const i0 = data.names.indexOf(sk); const si = i0 >= 0 ? i0 : 0; const asc = sd === 'asc';
    let rows = data.rows.filter(r => !P.q || (r.name + ' ' + r.team).toLowerCase().includes(P.q.toLowerCase()));
    rows = rows.slice().sort((a, b) => asc ? (a.nums[si] ?? 1e9) - (b.nums[si] ?? 1e9) : (b.nums[si] ?? -1e9) - (a.nums[si] ?? -1e9));
    const th = data.labels.map((l, i) => `<th class="sortable${i === si ? ' sorted' : ''}" data-act="psort" data-k="${esc(data.names[i])}" title="${esc(data.full[i] || '')}" tabindex="0" aria-sort="${i === si ? (asc ? 'ascending' : 'descending') : 'none'}">${esc(l)}</th>`).join('');
    document.getElementById('ptable').innerHTML = rows.length ? `<div class="tw"><table class="t"><thead><tr><th>Player</th><th class="l">Team</th><th class="l">Pos</th>${th}</tr></thead><tbody>${rows.slice(0, P.limit).map((r, i) => `<tr class="click${favs.has(lk, r.teamId) ? ' fav' : ''}" data-href="${hrefP(lk, r.id)}"><td><span class="team"><span class="n">${i + 1}</span><img class="headshot" src="${esc(r.img || '')}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><a href="${hrefP(lk, r.id)}">${esc(r.name)}</a></span></td><td class="l"><a href="${hrefT(lk, r.teamId)}">${esc(r.team)}</a></td><td class="l">${esc(r.pos)}</td>${r.vals.map((v, j) => `<td${j === si ? ' style="font-weight:800"' : ''}>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` + (rows.length > P.limit ? `<div style="margin-top:12px"><button class="btn sm ghost" data-act="pmore">Show ${Math.min(100, rows.length - P.limit)} more of ${rows.length}</button></div>` : '') : '<p class="muted">No players match that.</p>';
    document.querySelector('#pcount').textContent = `${rows.length} players`;
  };
  $main.innerHTML = head('Players', `${esc(data.label ? data.label + ' · ' : '')}${esc(L.label)} season leaders · tap a column to sort`) + tabs +
    `<div class="ctrls"><input class="inp" id="pq" type="search" placeholder="Search a player or team" value="${esc(P.q)}" aria-label="Search players">
    <select class="sel" id="pseason" aria-label="Season"><option value=""${!P.season ? ' selected' : ''}>This season</option><option value="${seasonYear() - 1}"${P.season ? ' selected' : ''}>Last season</option></select></div>
    <section class="mod"><div class="mh">${esc(def[1])}<span class="x" id="pcount"></span><span class="c"></span></div><div class="mb" id="ptable"></div></section><p class="note">ESPN lists the top ${data.rows.length} in each category; search by name for anyone else.</p>`;
  paint();
  const q = document.getElementById('pq'); let t;
  q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { P.q = q.value.trim(); P.limit = 100; paint(); }, 150); });
  document.getElementById('pseason').addEventListener('change', e => { P.season = e.target.value; players(lk); });
  players.paint = () => {
    const k = P.sort;
    if (k && !k.includes(':')) { // a column tap: same column flips the direction, a new one starts from its natural end
      const [pk, pd] = norm(P.prev || def[2]);
      const dir = k === pk ? (pd === 'asc' ? 'desc' : 'asc') : /^(ERA|WHIP|interceptions|fumblesLost)$/.test(k) ? 'asc' : 'desc';
      P.sort = data.names.includes(k) ? `${k}:${dir}` : def[2];
    }
    P.prev = P.sort || def[2]; paint();
  };
  players.st = P;
  players.setCat = k => { P.cat = k; P.sort = ''; P.limit = 100; players(lk); };
}

/* ================= TEAM ================= */
async function team(lk, id) {
  const L = LEAGUES[lk]; if (!L || !id) { $main.innerHTML = failMsg('this team'); return; } remember(lk);
  $main.innerHTML = `<div class="page"><div class="col">${skeleton(4)}${skeleton(12)}</div><div class="col">${skeleton(10)}</div></div>`;
  const [roster, sched, cur, R, rt] = await Promise.all([jSoft(`${API(L)}/teams/${id}/roster`, 900000), jSoft(`${API(L)}/teams/${id}/schedule`, 300000), standings(L).catch(() => null), rankings(L), HW.ratings(L).catch(() => null)]);
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
  const el = rt && rt.teams && rt.teams[String(id)]; const eloRank = el ? Object.values(rt.teams).filter(v => v.elo > el.elo).length + 1 : null;
  const sub = [r ? `${r.w}–${r.l}` : t0.recordSummary, t0.standingSummary || (r && L.standingsMode !== 'conferences' ? `${ordinal(r.pos)} in ${r.group}` : r ? `${r.conf || ''} in ${r.group}` : ''), r && r.strk ? 'streak ' + r.strk : '', el ? `Tipoff #${eloRank} · Elo ${Math.round(el.elo)}` : ''].filter(Boolean).join(' · ');
  const hd = `<article class="hero"><div class="ent-head"><img class="logo" src="${esc(logo)}" alt="" onerror="this.style.visibility='hidden'"><div style="min-width:0"><h1>${rank ? `<span class="rk" style="color:var(--accent);font-size:.6em">${rank}</span>` : ''}${esc(t0.displayName)}</h1><div class="sub">${esc(L.label)} · ${esc(sub)}</div><div style="margin-top:10px"><button class="star-btn" data-act="fav" data-lk="${lk}" data-id="${esc(id)}" aria-pressed="${isF}">${isF ? '★ In my teams' : '☆ Add to my teams'}</button></div></div></div>
    ${r ? `<div class="stats"><div><b>${r.ppg != null ? (+r.ppg).toFixed(1) : '—'}</b><small>Points</small></div><div><b>${r.opp != null ? (+r.opp).toFixed(1) : '—'}</b><small>Allowed</small></div><div><b>${r.diff != null ? sign(+r.diff) : '—'}</b><small>Net</small></div><div><b>${esc(r.home || '—')}</b><small>Home</small></div><div><b>${esc(r.road || '—')}</b><small>Road</small></div><div><b>${esc(L.standingsMode === 'conferences' ? (r.conf || '—') : (r.l10 || '—'))}</b><small>${L.standingsMode === 'conferences' ? 'Conf' : 'Last 10'}</small></div></div>` : ''}${nextHtml}</article>`;
  const ath = (roster && roster.athletes || []).flatMap(a => a.items ? a.items : [a]);
  const rosterHtml = ath.length ? mod('Roster', `<div class="tw"><table class="t"><thead><tr><th>Player</th><th>#</th><th class="l">Pos</th><th>${COLLEGE.includes(lk) ? 'Yr' : 'Age'}</th><th>Ht</th><th>Wt</th><th class="l">Status</th></tr></thead><tbody>${ath.map(a => `<tr class="click" data-href="${hrefP(lk, a.id)}"><td><span class="team"><img class="headshot" src="${esc(a.headshot && a.headshot.href || '')}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><a href="${hrefP(lk, a.id)}">${esc(a.displayName)}</a></span></td><td>${esc(a.jersey || '')}</td><td class="l">${esc(a.position && a.position.abbreviation || '')}</td><td>${esc(COLLEGE.includes(lk) ? (a.experience && a.experience.abbreviation || '') : (a.age || ''))}</td><td>${esc(a.displayHeight || '')}</td><td>${esc((a.displayWeight || '').replace(' lbs', ''))}</td><td class="l">${a.injuries && a.injuries.length ? injPill(a.injuries[0].status) : '<span class="muted">Active</span>'}</td></tr>`).join('')}</tbody></table></div>`, { x: `${ath.length} players` }) : '';
  const done = evs.filter(g => g.state === 'post').slice(-12).reverse(), up = evs.filter(g => g.state !== 'post').slice(0, 10);
  const sRow = g => { const homeSide = g.home.id === String(id); const me = homeSide ? g.home : g.away, op = homeSide ? g.away : g.home; const res = g.state === 'post' ? `<span class="${(me.score > op.score) ? 'w' : 'lo'}">${me.score > op.score ? 'W' : 'L'}</span> ${me.score}–${op.score}` : g.state === 'in' ? `<span style="color:var(--live)">Live</span> ${me.score}–${op.score}` : `${esc(tip(g.date))}`; return `<tr class="click" data-href="${hrefG(lk, g.id)}"><td>${esc(dateShort(g.date))}</td><td class="l">${g.neutral ? 'vs' : homeSide ? 'vs' : '@'} <a href="${hrefT(lk, op.id)}">${tn(op)}</a></td><td>${res}</td></tr>`; };
  const schedHtml = mod('Schedule', `<div class="tw"><table class="t"><tbody>${up.length ? `<tr class="sub"><td colspan="3">Coming up</td></tr>${up.map(sRow).join('')}` : ''}${done.length ? `<tr class="sub"><td colspan="3">Recent</td></tr>${done.map(sRow).join('')}` : ''}</tbody></table></div>`, { x: `${evs.length} games` });
  $main.innerHTML = `<div class="page"><div class="col">${hd}<div id="tstats">${skeleton(6)}</div>${rosterHtml}</div><div class="col">${schedHtml}</div></div>`;
  try {
    if (L.sport === 'basketball') { const lp = await leaguePlayers(L); const mine = lp.rows.filter(p => p.teamId === String(id)).sort((a, b) => b.pts - a.pts); document.getElementById('tstats').innerHTML = mine.length ? mod('Season stats', playerTable(lk, mine, 'pts', false), { x: `${esc(lp.label)} · per game` }) : ''; }
    else { const cats = (STAT_CATS[L.sport] || []).slice(0, 3); const res = await Promise.all(cats.map(([c, , srt]) => statCategory(L, c, srt, 400).catch(() => null))); const blocks = res.map((c, i) => { if (!c) return ''; const mine = c.rows.filter(r => r.teamId === String(id)).slice(0, 6); if (!mine.length) return ''; return `<div class="tw"><table class="t"><thead><tr><th>${esc(cats[i][1])}</th>${c.labels.map(l => `<th>${esc(l)}</th>`).join('')}</tr></thead><tbody>${mine.map(r => `<tr class="click" data-href="${hrefP(lk, r.id)}"><td><span class="team"><img class="headshot" src="${esc(r.img || '')}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><a href="${hrefP(lk, r.id)}">${esc(r.name)}</a> <span class="muted">${esc(r.pos)}</span></span></td>${r.vals.map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`; }).filter(Boolean); document.getElementById('tstats').innerHTML = blocks.length ? mod('Season leaders', blocks.join(''), { x: 'from ESPN\'s league leaders' }) : ''; }
  } catch { const el2 = document.getElementById('tstats'); if (el2) el2.innerHTML = ''; }
}

/* ================= PLAYER ================= */
async function player(lk, id) {
  const L = LEAGUES[lk]; if (!L || !id) { $main.innerHTML = failMsg('this player'); return; } remember(lk);
  $main.innerHTML = `<div class="page"><div class="col">${skeleton(5)}${skeleton(10)}</div><div class="col">${skeleton(8)}</div></div>`;
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
    <div class="stats">${(L.sport === 'basketball' ? ['PTS', 'REB', 'AST', 'FG%', '3P%', 'MIN'] : labels.slice(0, 6)).map(l => `<div><b>${esc(val(l))}</b><small>${l === 'MIN' ? 'Minutes' : esc(l)}</small></div>`).join('')}</div></article>`;
  const splits = st && st.splits && st.splits.length ? mod('Averages', `<div class="tw"><table class="t"><thead><tr><th></th>${labels.map(l => `<th>${esc(l)}</th>`).join('')}</tr></thead><tbody>${st.splits.map(s => `<tr><td><b>${esc(s.displayName)}</b></td>${s.stats.map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`, { x: L.sport === 'basketball' ? 'per game' : 'season' }) : '';
  let log = '';
  if (gl && gl.events && gl.seasonTypes) { const Lb = gl.labels || []; const evRows = []; gl.seasonTypes.forEach(stp => (stp.categories || []).forEach(c => (c.events || []).forEach(e => { const meta = gl.events[e.eventId]; if (meta) evRows.push({ meta, stats: e.stats, id: e.eventId }); }))); evRows.sort((x, y) => new Date(y.meta.gameDate) - new Date(x.meta.gameDate)); if (evRows.length) log = mod('Game log', `<div class="tw"><table class="t"><thead><tr><th>Date</th><th class="l">Opp</th><th class="l">Result</th>${Lb.map(l => `<th>${esc(l)}</th>`).join('')}</tr></thead><tbody>${evRows.slice(0, 15).map(r => `<tr class="click" data-href="${hrefG(lk, esc(r.id))}"><td>${esc(dateShort(r.meta.gameDate))}</td><td class="l">${esc(r.meta.atVs || '')} ${esc(r.meta.opponent && r.meta.opponent.abbreviation || '')}</td><td class="l"><span class="${r.meta.gameResult === 'W' ? 'w' : 'lo'}">${esc(r.meta.gameResult || '')}</span> ${esc(r.meta.score || '')}</td>${(r.stats || []).map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`, { x: `last ${Math.min(15, evRows.length)}` }); }
  const newsM = ov && ov.news && ov.news.length ? mod('News', ov.news.slice(0, 8).map(n => `<div class="wire-item"><span class="t">${esc(n.published ? ago(n.published) : '')}</span><a href="${esc(n.links && n.links.web && n.links.web.href || '#')}" target="_blank" rel="noopener">${esc(n.headline)}</a></div>`).join('')) : '';
  $main.innerHTML = `<div class="page"><div class="col">${hd}${splits}${log}</div><div class="col">${newsM || state('No recent news', '<p>Nothing new on this player in the feed.</p>')}</div></div>`;
}

/* ================= NEWS ================= */
async function news(lk, tab) {
  const L = LEAGUES[lk]; remember(lk);
  tab = tab || store.get('newsTab:' + lk, 'news');
  const tabsList = [['news', 'News'], L.hasTransactions ? ['moves', 'Transactions'] : null].filter(Boolean);
  if (!tabsList.some(t => t[0] === tab)) tab = 'news';
  const tabs = tabsList.length > 1 ? `<div class="tabs" role="tablist">${tabsList.map(([k, l]) => `<a class="${tab === k ? 'on' : ''}" role="tab" aria-selected="${tab === k}" href="${hrefS('news', lk, k === 'news' ? null : k)}">${l}</a>`).join('')}</div>` : '';
  const top = head('News', esc(L.label)) + tabs;
  $main.innerHTML = top + skeleton(10);
  store.set('newsTab:' + lk, tab);
  if (tab === 'moves') {
    const d = await jSoft(`${API(L)}/transactions?limit=100`, 900000); if (!d) { $main.innerHTML = top + failMsg('transactions'); return; }
    const items = d.transactions || [];
    $main.innerHTML = top + mod('Transactions', items.map(x => `<div class="wire-item"><span class="t">${esc(dateShort(x.date))}</span><span><b>${esc(x.team && x.team.displayName || '')}</b> · ${esc(x.description)}</span></div>`).join('') || '<p class="muted">No recent transactions.</p>', { x: `${items.length} most recent` });
  } else {
    const d = await jSoft(`${API(L)}/news?limit=50`, 300000); if (!d) { $main.innerHTML = top + failMsg('news'); return; }
    const arts = d.articles || [];
    $main.innerHTML = top + `<div class="newsgrid">${arts.map(a => { const img = a.images && a.images[0] && a.images[0].url; return `<a class="story" href="${esc(a.links && a.links.web && a.links.web.href || '#')}" target="_blank" rel="noopener">${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : ''}<div><h3>${esc(a.headline)}</h3><p>${esc(a.description || '')}</p><span class="meta">${esc(ago(a.published))}${a.byline ? ' · ' + esc(a.byline) : ''}</span></div></a>`; }).join('')}</div>`;
  }
}

/* ================= RECORD ================= */
async function recordView() {
  $main.innerHTML = head('The record', 'Every pregame forecast, scored against what happened') + skeleton(10);
  const [recs, prms, aiRec] = await Promise.all([Promise.all(ORDER.map(k => record(LEAGUES[k]))), Promise.all(ORDER.map(k => params(LEAGUES[k]))), aiRecord()]);
  const secs = []; let tot = { n: 0, hit: 0, brier: 0, en: 0, ehit: 0, ebrier: 0 };
  ORDER.forEach((k, i) => {
    const L = LEAGUES[k], r = recs[i], P = prms[i]; if (!r || !r.games || !r.games.length) return;
    const gs = r.games; const n = gs.length;
    const hit = gs.filter(g => (g.p >= .5) === (g.hs > g.as)).length; const brier = gs.reduce((s, g) => s + ((g.hs > g.as ? 1 : 0) - g.p) ** 2, 0) / n;
    const eg = gs.filter(g => g.ep != null); const en = eg.length; const ehit = eg.filter(g => (g.ep >= .5) === (g.hs > g.as)).length; const ebrier = en ? eg.reduce((s, g) => s + ((g.hs > g.as ? 1 : 0) - g.ep) ** 2, 0) / en : null;
    const ourOnEspn = en ? eg.filter(g => (g.p >= .5) === (g.hs > g.as)).length : 0; const ourBrierOnEspn = en ? eg.reduce((s, g) => s + ((g.hs > g.as ? 1 : 0) - g.p) ** 2, 0) / en : null;
    tot.n += n; tot.hit += hit; tot.brier += brier * n; tot.en += en; tot.ehit += ehit; tot.ebrier += (ebrier || 0) * en;
    const buckets = [[.5, .6], [.6, .7], [.7, .8], [.8, .9], [.9, 1.01]].map(([a, b]) => { const in_ = gs.filter(g => { const q = Math.max(g.p, 1 - g.p); return q >= a && q < b; }); const won = in_.filter(g => (g.p >= .5) === (g.hs > g.as)).length; return { a, b, n: in_.length, won }; });
    const last = [...gs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15);
    const tune = P && P.history && P.history.length ? `<h3 style="margin:16px 0 6px;font:800 12px/1 var(--cond);letter-spacing:.1em;text-transform:uppercase;color:var(--ink-3)">Tuning log</h3><div class="tw"><table class="t"><thead><tr><th class="l">Night</th><th>Home court</th><th>Rest</th><th>Spread</th><th>Calibration</th><th>Brier</th></tr></thead><tbody>${[...P.history].reverse().slice(0, 10).map(h => `<tr><td class="l">${esc(dayLabel(h.date, { month: 'short', day: 'numeric' }))}</td><td>${h.hca}</td><td>${h.b2b}</td><td>${h.sd}</td><td>${h.calib ? `${(+h.calib.a).toFixed(2)}×` : '—'}</td><td>${h.brier != null ? (+h.brier).toFixed(3) : '—'}</td></tr>`).join('')}</tbody></table></div><p class="note">Each night the job re-tests home court, rest and spread against every game this season and keeps the mix with the best Brier score. Calibration above 1× means the raw forecasts were underconfident; below 1× overconfident.</p>` : '';
    secs.push(mod(L.label, `
      <div class="stats" style="margin:0 0 12px;border:1px solid var(--line)"><div><b>${(hit / n * 100).toFixed(1)}%</b><small>Straight-up</small></div><div><b>${brier.toFixed(3)}</b><small>Brier</small></div>${en ? `<div><b>${(ehit / en * 100).toFixed(1)}%</b><small>ESPN (${en})</small></div><div><b>${ebrier.toFixed(3)}</b><small>ESPN Brier</small></div><div><b>${(ourOnEspn / en * 100).toFixed(1)}%</b><small>Ours, same ${en}</small></div><div><b>${ourBrierOnEspn.toFixed(3)}</b><small>Our Brier, same ${en}</small></div>` : ''}</div>
      <p class="note" style="margin:0 0 10px">Brier is the average squared error of the win chance: 0.250 is a coin flip, lower is better; good NBA models land near 0.200. ESPN's number is its own pregame win probability from the same game page. The record scores the ratings alone (home court and rest included); the injury adjustment on live pages isn't kept historically, so it isn't scored.</p>
      <div class="tw"><table class="t"><thead><tr><th>Forecast confidence</th><th>Games</th><th>Hit</th><th>Expected</th></tr></thead><tbody>${buckets.filter(b => b.n).map(b => `<tr><td>${Math.round(b.a * 100)}–${Math.min(100, Math.round(b.b * 100) - (b.b > 1 ? 1 : 0))}%</td><td>${b.n}</td><td>${(b.won / b.n * 100).toFixed(0)}%</td><td class="muted">${Math.round((b.a + Math.min(b.b, 1)) / 2 * 100)}%</td></tr>`).join('')}</tbody></table></div>
      ${tune}
      <h3 style="margin:16px 0 6px;font:800 12px/1 var(--cond);letter-spacing:.1em;text-transform:uppercase;color:var(--ink-3)">Recent</h3>
      <div class="tw"><table class="t"><thead><tr><th class="l">Date</th><th class="l">Game</th><th>Final</th><th>Our call</th><th>ESPN</th><th>Line</th><th>Result</th></tr></thead><tbody>${last.map(g => { const fav = g.p >= .5 ? g.h : g.a; const ok = (g.p >= .5) === (g.hs > g.as); return `<tr class="click" data-href="${hrefG(k, g.id)}"><td class="l">${esc(dayLabel(g.date, { month: 'short', day: 'numeric' }))}</td><td class="l"><a href="${hrefG(k, g.id)}">${esc(g.a)} at ${esc(g.h)}</a></td><td>${g.as}–${g.hs}</td><td>${esc(fav)} ${pct(Math.max(g.p, 1 - g.p))}</td><td>${g.ep != null ? esc(g.ep >= .5 ? g.h : g.a) + ' ' + pct(Math.max(g.ep, 1 - g.ep)) : '—'}</td><td class="muted">${esc(g.line || '—')}</td><td class="${ok ? 'w' : 'lo'}">${ok ? 'Hit' : 'Miss'}</td></tr>`; }).join('')}</tbody></table></div>`, { x: `${n} games since ${esc(dayLabel(gs.reduce((m, g) => g.date < m ? g.date : m, gs[0].date), { month: 'short', day: 'numeric' }))}` }));
  });
  const overall = tot.n ? mod('All leagues', `<div class="stats" style="border:1px solid var(--line)"><div><b>${(tot.hit / tot.n * 100).toFixed(1)}%</b><small>Straight-up</small></div><div><b>${(tot.brier / tot.n).toFixed(3)}</b><small>Brier</small></div>${tot.en ? `<div><b>${(tot.ehit / tot.en * 100).toFixed(1)}%</b><small>ESPN (${tot.en})</small></div><div><b>${(tot.ebrier / tot.en).toFixed(3)}</b><small>ESPN Brier</small></div>` : ''}</div>`, { x: `${tot.n} games` }) : '';
  let aiM = '';
  if (aiRec && aiRec.n) {
    const byL = ORDER.filter(k => aiRec.byLeague && aiRec.byLeague[k] && aiRec.byLeague[k].n).map(k => { const r = aiRec.byLeague[k]; return `<div class="mv"><span>${esc(LEAGUES[k].label)}</span><b>${r.hit} of ${r.n} · ${Math.round(r.hit / r.n * 100)}%</b></div>`; }).join('');
    const byC = ['high', 'medium', 'low'].filter(c => aiRec.byConfidence && aiRec.byConfidence[c] && aiRec.byConfidence[c].n).map(c => { const r = aiRec.byConfidence[c]; return `<div class="mv"><span>${c} confidence</span><b>${r.hit} of ${r.n} · ${Math.round(r.hit / r.n * 100)}%</b></div>`; }).join('');
    const agree = aiRec.vsModel ? `<div class="mv"><span>When the prediction went against the model</span><b>prediction ${aiRec.vsModel.aiHit} · model ${aiRec.vsModel.modelHit} of ${aiRec.vsModel.n}</b></div>` : '';
    const recent = (aiRec.recent || []).slice(0, 10).map(x => `<div class="wire-item"><span class="t">${esc(dayLabel(x.date, { month: 'short', day: 'numeric' }))}</span><span><a href="${hrefG(x.lk, x.id)}"><b>${esc(x.game)}</b></a> · leaned ${esc(x.pick)}${x.confidence ? ' (' + esc(x.confidence) + ')' : ''} · <span class="${x.hit ? 'w' : 'lo'}">${x.hit ? 'Hit' : 'Miss'}</span>${x.final ? ' · ' + esc(x.final) : ''}</span></div>`).join('');
    aiM = mod('Predictions', `<div class="rec"><div><b>${Math.round(aiRec.hit / aiRec.n * 100)}%</b><small>Leans right</small></div><div><b>${aiRec.n}</b><small>Graded</small></div>${aiRec.last7 && aiRec.last7.n ? `<div><b>${aiRec.last7.hit}–${aiRec.last7.n - aiRec.last7.hit}</b><small>Last 7 days</small></div>` : ''}</div>${byL}${byC}${agree}<p class="note" style="margin:8px 0 10px">Each morning's predictions are graded the next morning, and the running record, with yesterday's misses, goes back into the next day's write-up so it can correct itself. Only games with a stated lean are graded.</p>${recent}`, { x: 'graded every morning', cls: '' });
  } else aiM = mod('Predictions', '<p class="muted" style="margin:0">The first graded predictions show up the morning after the first day of predictions.</p>', { x: 'graded every morning' });
  $main.innerHTML = head('The record', 'Every pregame forecast the model made, scored against what happened. Updated nightly.') + (secs.length ? `<div class="page"><div class="col">${secs.join('')}</div><div class="col">${overall}${aiM}${mod('What counts', `<p style="margin:0 0 8px;font-size:13.5px">Each night the ratings job records the win chance the model gave every game <i>before</i> tip-off, using only the ratings as they stood that morning. Nothing is re-scored after the fact.</p><p style="margin:0 0 8px;font-size:13.5px">"Straight-up" is how often the favored team won. Brier rewards being confident when right and punishes being confident when wrong, so it's the fairer test.</p><p class="note">ESPN's pregame win probability is pulled from the same game page when available. Where ESPN shows a betting line, it's listed for reference only.</p>`)}</div></div>` : state('No record yet', '<p>The nightly job hasn\'t scored a game yet. Check back after the first slate of results.</p>'));
}

HW.views = { center, scores, game, standings: standingsView, rankings: rankingsView, teams, team, players, player, forecasts, injuries: injuriesView, news, record: recordView };
HW.render = { failMsg, state, lkOf, remember, COLLEGE, tuneLine, pickerOpen, pickerRefreshUpdates, notifyPrefs, notifySupport };
})();
