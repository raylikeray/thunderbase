/* ThunderBase — live NBA home base. Vanilla JS, no build step.
   Data: ESPN public site API (CORS-enabled). AI reads: ai/<YYYY-MM-DD>.json written daily. */
(() => {
'use strict';

const API  = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
const API2 = 'https://site.api.espn.com/apis/v2/sports/basketball/nba';
const WEB  = 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba';
const TZ = 'America/Chicago';
const OKC = '25';
const $main = document.getElementById('main');

/* ================= utilities ================= */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cache = new Map();
async function j(url, ttl = 60000) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.t < ttl) return hit.v;
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) { const e = new Error('HTTP ' + r.status); e.status = r.status; throw e; }
    const v = await r.json();
    cache.set(url, { t: Date.now(), v });
    return v;
  } finally { clearTimeout(to); }
}
async function jSoft(url, ttl) { try { return await j(url, ttl); } catch { return null; } }

const ymdFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const hourFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hour12: false });
/* the NBA "day" runs until 4 AM Central, so a late tip stays on tonight's slate after midnight */
function todayCT() {
  const now = new Date();
  const h = +hourFmt.format(now) % 24;
  const d = ymdFmt.format(now);
  return h < 4 ? addDays(d, -1) : d;
}
function addDays(ymd, n) { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); }
const compact = ymd => ymd.replace(/-/g, '');
const expand = c => `${c.slice(0,4)}-${c.slice(4,6)}-${c.slice(6,8)}`;
function dayLabel(ymd, opts = { weekday: 'long', month: 'short', day: 'numeric' }) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' });
}
function relDay(ymd) {
  const t = todayCT();
  if (ymd === t) return 'Tonight';
  if (ymd === addDays(t, 1)) return 'Tomorrow';
  if (ymd === addDays(t, -1)) return 'Last night';
  return dayLabel(ymd);
}
const tip = iso => new Date(iso).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
const clockNow = () => new Date().toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit', second: '2-digit' });
const dateShort = iso => new Date(iso).toLocaleDateString('en-US', { timeZone: TZ, month: 'short', day: 'numeric' });
function ago(iso) {
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 3600) return Math.max(1, Math.round(s / 60)) + 'm ago';
  if (s < 86400) return Math.round(s / 3600) + 'h ago';
  return dateShort(iso);
}
const pct = x => Math.round(x * 100) + '%';
const sign = x => (x > 0 ? '+' : '') + x.toFixed(1);
function lum(hex) {
  const h = (hex || '').replace('#', ''); if (h.length < 6) return 0.3;
  const c = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const hx = c => c ? (c.startsWith('#') ? c : '#' + c) : '#55606e';
/* a team color dark enough to carry white text */
function darkOf(a, b) { const A = hx(a), B = hx(b); const la = lum(A), lb = lum(B); const d = la <= lb ? A : B; return lum(d) > 0.2 ? '#1d2633' : d; }
function erf(x) { const s = Math.sign(x); x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return s * y; }
const Phi = z => 0.5 * (1 + erf(z / Math.SQRT2));
const logoUrl = (abbr) => `https://a.espncdn.com/i/teamlogos/nba/500/${String(abbr).toLowerCase()}.png`;
const store = { get(k, d) { try { const v = localStorage.getItem('tb:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem('tb:' + k, JSON.stringify(v)); } catch {} } };

/* ================= parsing ================= */
function parseTeamSide(x) {
  const t = x.team || {};
  const sc = x.score && typeof x.score === 'object' ? x.score.displayValue : x.score;
  return {
    id: String(t.id), abbr: t.abbreviation, name: t.displayName, short: t.shortDisplayName || t.name, loc: t.location,
    color: hx(t.color), alt: hx(t.alternateColor), logo: t.logo || (t.logos && t.logos[0] && t.logos[0].href) || logoUrl(t.abbreviation),
    score: sc != null && sc !== '' ? +sc : null,
    rec: (x.records && x.records[0] && x.records[0].summary) || (x.record && x.record[0] && (x.record[0].displayValue || x.record[0].summary)) || '',
    winner: !!x.winner, lines: (x.linescores || []).map(l => l.displayValue ?? l.value), leaders: x.leaders || []
  };
}
function tvOf(c) {
  const nat = [], loc = [];
  (c.geoBroadcasts || []).forEach(b => { const n = b.media && b.media.shortName; if (!n) return; ((b.market && b.market.type) === 'National' ? nat : loc).push(n); });
  (c.broadcasts || []).forEach(b => (b.names || []).forEach(n => (b.market === 'national' ? nat : loc).push(n)));
  const u = a => [...new Set(a)];
  return { national: u(nat), local: u(loc), label: u(nat).join(' · ') || u(loc).filter(n => !/League Pass/i.test(n)).slice(0, 2).join(' · ') || 'League Pass' };
}
function parseEvent(e) {
  const c = e.competitions[0];
  const st = c.status || e.status; const t = st.type || {};
  const comp = c.competitors || [];
  const home = parseTeamSide(comp.find(x => x.homeAway === 'home') || comp[0]);
  const away = parseTeamSide(comp.find(x => x.homeAway === 'away') || comp[1]);
  return {
    id: String(e.id), date: e.date, state: t.state, detail: t.shortDetail || t.detail || '', completed: !!t.completed,
    period: st.period || 0, clock: st.displayClock || '', home, away,
    venue: c.venue && c.venue.fullName, city: c.venue && c.venue.address && [c.venue.address.city, c.venue.address.state].filter(Boolean).join(', '),
    tv: tvOf(c), note: (c.notes && c.notes[0] && c.notes[0].headline) || (c.type && c.type.abbreviation === 'TRNMNT' ? 'NBA Cup' : '')
  };
}
const hasOKC = g => g.home.id === OKC || g.away.id === OKC;
const isLive = g => g.state === 'in';

/* ================= data access ================= */
async function scoreboard(ymd, ttl) {
  const d = await j(`${API}/scoreboard?dates=${compact(ymd)}&limit=50`, ttl ?? (ymd === todayCT() ? 25000 : (ymd < todayCT() ? 3600000 : 300000)));
  return (d.events || []).map(parseEvent).sort((a, b) => (order(a) - order(b)) || (new Date(a.date) - new Date(b.date)));
}
const order = g => g.state === 'in' ? 0 : g.state === 'pre' ? 1 : 2;

async function standings(season) {
  const d = await j(`${API2}/standings${season ? '?season=' + season : ''}`, 300000);
  const confs = [], byId = {};
  for (const conf of d.children || []) {
    const rows = (conf.standings && conf.standings.entries || []).map(en => {
      const s = {}; (en.stats || []).forEach(x => { s[x.name || x.type] = x; s[(x.name || '').toLowerCase()] = x; if (x.displayName) s[x.displayName] = x; });
      const val = k => s[k] ? (s[k].value ?? parseFloat(s[k].displayValue)) : null;
      const dv = k => s[k] ? s[k].displayValue : '';
      const t = en.team;
      const r = {
        id: String(t.id), abbr: t.abbreviation, name: t.displayName, short: t.shortDisplayName, loc: t.location,
        logo: (t.logos && t.logos[0] && t.logos[0].href) || logoUrl(t.abbreviation),
        w: val('wins') || 0, l: val('losses') || 0, pct: dv('winPercent'), gb: dv('gamesBehind'),
        home: dv('Home'), road: dv('Road'), l10: dv('Last Ten Games'), strk: dv('streak'),
        diff: val('differential') ?? 0, ppg: val('avgPointsFor'), opp: val('avgPointsAgainst'),
        seed: val('playoffSeed') || 99, conf: conf.abbreviation || (conf.name || '').split(' ')[0], confName: conf.name
      };
      byId[r.id] = r; return r;
    }).sort((a, b) => a.seed - b.seed || (b.w - b.l) - (a.w - a.l));
    confs.push({ name: conf.name, abbr: conf.abbreviation, rows });
  }
  return { confs, byId, season: d.seasonDisplayName || '' };
}
async function priorStandings() { try { return await standings(seasonYear() - 1); } catch { return null; } }

async function aiFor(ymd) { return jSoft(`ai/${ymd}.json?d=${ymd}`, 600000); }

/* ================= forecast model =================
   Team strength = point differential per game, shrunk toward last season's
   differential early in the year. Margin = strength gap + home court + rest + form.
   Win probability = normal CDF of margin / 12 (NBA game-level spread). */
const HCA = 2.4, B2B = 1.8, SD = 12;
function strength(id, cur, prior) {
  const r = cur && cur.byId[id]; const p = prior && prior.byId[id];
  const gp = r ? r.w + r.l : 0;
  const curDiff = r ? r.diff : 0;
  const priorDiff = p ? p.diff * 0.65 : 0;            // regress last year a third toward average
  const w = gp / (gp + 10);
  const l10 = r && r.l10 && /^(\d+)-(\d+)$/.test(r.l10) ? r.l10.split('-').map(Number) : null;
  const form = l10 && (l10[0] + l10[1]) >= 5 ? ((l10[0] / (l10[0] + l10[1])) - 0.5) * 3 : 0;
  return { rating: w * curDiff + (1 - w) * priorDiff, gp, curDiff, priorDiff: p ? p.diff : null, weight: w, form };
}
function forecast(g, ctx) {
  const H = strength(g.home.id, ctx.cur, ctx.prior), A = strength(g.away.id, ctx.cur, ctx.prior);
  const restH = ctx.b2b && ctx.b2b.has(g.home.id) ? -B2B : 0;
  const restA = ctx.b2b && ctx.b2b.has(g.away.id) ? -B2B : 0;
  const margin = (H.rating - A.rating) + HCA + (restH - restA) + (H.form - A.form);
  let p = Phi(margin / SD), live = false;
  if (g.state === 'in' && g.home.score != null) {
    const per = g.period || 1;
    const [mm, ss] = String(g.clock || '0:00').split(':').map(Number);
    const left = isFinite(mm) ? (mm + (ss || 0) / 60) : 0;
    const rem = per <= 4 ? (4 - per) * 12 + left : left;
    const frac = Math.max(rem, 0) / 48;
    const lead = g.home.score - g.away.score;
    const sd = SD * Math.sqrt(frac) + 0.6;
    p = Phi((lead + margin * frac) / sd); live = true;
  } else if (g.state === 'post') { p = g.home.winner ? 1 : 0; }
  return { pHome: p, margin, live, H, A, restH, restA };
}
async function forecastCtx(ymd) {
  const [cur, prior, yday] = await Promise.all([standings().catch(() => null), priorStandings(), scoreboard(addDays(ymd, -1)).catch(() => [])]);
  const b2b = new Set(); yday.forEach(g => { b2b.add(g.home.id); b2b.add(g.away.id); });
  return { cur, prior, b2b };
}

/* ================= state & freshness ================= */
const S = { today: [], todayYmd: null, lastOk: 0, err: false, timer: null, route: null, open: new Set(), prevScores: {} };
const $fresh = document.getElementById('fresh'), $freshText = document.getElementById('freshText');
function paintFresh() {
  const live = S.today.filter(isLive).length;
  const age = Date.now() - S.lastOk;
  $fresh.classList.toggle('live', live > 0 && !S.err && age < 120000);
  $fresh.classList.toggle('stale', !S.err && S.lastOk > 0 && age >= 120000 && live > 0);
  $fresh.classList.toggle('err', S.err);
  if (S.err) $freshText.textContent = S.lastOk ? `Feed not responding · last ${new Date(S.lastOk).toLocaleTimeString('en-US',{timeZone:TZ,hour:'numeric',minute:'2-digit'})}` : 'Feed not responding · retrying';
  else if (!S.lastOk) $freshText.textContent = 'Loading…';
  else $freshText.textContent = `${live ? live + ' live · ' : ''}updated ${new Date(S.lastOk).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit', second: '2-digit' })} CT`;
}
setInterval(paintFresh, 5000);

/* ================= strip ================= */
const $strip = document.getElementById('strip'), $stripDate = document.getElementById('stripDate'), $stripCount = document.getElementById('stripCount');
function tileHTML(g) {
  const st = g.state === 'in' ? `<span>Live · ${esc(g.detail)}</span>` : g.state === 'pre' ? `<span>${esc(tip(g.date))} CT</span>` : `<span>${esc(g.detail || 'Final')}</span>`;
  const row = (s, other) => {
    const lose = g.state === 'post' && s.score != null && other.score != null && s.score < other.score;
    return `<div class="tile-row${lose ? ' lose' : ''}" data-k="${g.id}-${s.id}"><span class="tile-tm"><i class="sw" style="background:${s.color}"></i>${esc(s.abbr)} <small>${esc(s.rec)}</small></span><span class="tile-sc">${g.state === 'pre' ? '' : esc(s.score ?? '')}</span></div>`;
  };
  return `<a class="tile${hasOKC(g) ? ' okc' : ''}" href="#game-${g.id}" aria-label="${esc(g.away.name)} at ${esc(g.home.name)}, ${esc(g.detail)}"><div class="tile-st${isLive(g) ? ' live' : ''}">${st}<span class="tv">${esc(g.tv.label)}</span></div>${row(g.away, g.home)}${row(g.home, g.away)}</a>`;
}
let stripFallback = null;
async function paintStrip() {
  const games = S.today;
  if (games.length) {
    $stripDate.textContent = relDay(S.todayYmd) === 'Tonight' ? `Tonight · ${dayLabel(S.todayYmd, { weekday: 'short', month: 'short', day: 'numeric' })}` : dayLabel(S.todayYmd);
    const live = games.filter(isLive).length, fin = games.filter(g => g.state === 'post').length;
    $stripCount.textContent = `${games.length} game${games.length > 1 ? 's' : ''}${live ? ` · ${live} live` : ''}${fin && fin < games.length ? ` · ${fin} final` : ''}`;
    $strip.innerHTML = games.map(tileHTML).join('');
  } else {
    if (!stripFallback) {
      const y = await scoreboard(addDays(S.todayYmd, -1)).catch(() => []);
      let next = null;
      for (let i = 1; i <= 14 && !next; i++) { const d = addDays(S.todayYmd, i); const gs = await scoreboard(d).catch(() => []); if (gs.length) next = { d, n: gs.length }; }
      stripFallback = { y, next };
    }
    const { y, next } = stripFallback;
    $stripDate.textContent = 'No games today';
    $stripCount.textContent = next ? `Next: ${dayLabel(next.d, { weekday: 'short', month: 'short', day: 'numeric' })} · ${next.n} games` : '';
    $strip.innerHTML = y.length ? y.map(tileHTML).join('') : `<div class="tile-empty">Off day across the league.</div>`;
  }
  // gentle emphasis on score changes
  games.forEach(g => [g.home, g.away].forEach(s => {
    const k = `${g.id}-${s.id}`, prev = S.prevScores[k];
    if (prev != null && s.score != null && s.score !== prev) $strip.querySelector(`[data-k="${k}"]`)?.classList.add('bump');
    S.prevScores[k] = s.score;
  }));
}

/* ================= polling ================= */
async function tick() {
  clearTimeout(S.timer);
  const ymd = todayCT();
  if (ymd !== S.todayYmd) { S.todayYmd = ymd; stripFallback = null; }
  try {
    S.today = await scoreboard(ymd, 0);
    S.lastOk = Date.now(); S.err = false;
  } catch { S.err = true; }
  paintFresh();
  await paintStrip();
  if (S.route && S.route.live) { try { await S.route.live(); } catch {} }
  const anyLive = S.today.some(isLive);
  const soon = S.today.some(g => g.state === 'pre' && new Date(g.date) - Date.now() < 30 * 60000);
  const delay = S.err ? 30000 : anyLive ? 30000 : soon ? 60000 : 300000;
  if (!document.hidden) S.timer = setTimeout(tick, delay);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); else clearTimeout(S.timer); });

/* ================= shared render helpers ================= */
const state = (title, body, err) => `<div class="state${err ? ' err' : ''}"><b>${esc(title)}</b>${body}</div>`;
const skeleton = (n = 6) => `<div class="sheet">${Array.from({ length: n }, (_, i) => `<div class="skel" style="width:${90 - (i % 3) * 18}%"></div>`).join('')}</div>`;
const failMsg = (what) => state(`Couldn't load ${what}`, `<p>The data feed didn't answer. It usually comes back within a minute; this page retries on its own, or <a href="#" data-act="reload">try again now</a>.</p>`, true);
function statusLine(g) {
  const where = [g.venue, g.tv.label].filter(Boolean).join(' · ');
  if (g.state === 'in') return `Live · ${g.detail}${where ? ' · ' + where : ''}`;
  if (g.state === 'pre') return `${relDay(ymdFmt.format(new Date(g.date)))} · ${tip(g.date)} CT${where ? ' · ' + where : ''}`;
  return `${g.detail || 'Final'} · ${dateShort(g.date)}${g.venue ? ' · ' + g.venue : ''}`;
}
function fbar(g, f, opts = {}) {
  const pa = 1 - f.pHome, ph = f.pHome;
  const fav = ph >= 0.5 ? g.home : g.away; const p = Math.max(ph, pa);
  const label = g.state === 'post' ? `Final · ${(g.home.winner ? g.home : g.away).short} won` : `${f.live ? 'Live forecast' : 'Forecast'} · ${esc(fav.abbr)} ${pct(p)}`;
  const inputs = g.state === 'post' ? '' : f.live ? `pregame line ${esc(g.home.abbr)} ${sign(f.margin)}` : `rating gap ${sign(f.H.rating - f.A.rating)} · home +${HCA}${f.restH || f.restA ? ' · rest ' + sign(f.restH - f.restA) : ''}`;
  return `<div class="fbar-l"><span>${label}</span><span>${inputs}</span></div><div class="fbar" role="img" aria-label="${esc(g.away.abbr)} ${pct(pa)}, ${esc(g.home.abbr)} ${pct(ph)}"><i style="width:${pa * 100}%;background:${opts.awayColor || 'var(--gold)'}"></i><i style="width:${ph * 100}%;background:${opts.homeColor || '#ffffff'};opacity:.9"></i></div>`;
}
function aiBlock(ai, open, id) {
  if (!ai) return '';
  const keys = (ai.keys || []).map(k => `<li>${esc(k)}</li>`).join('');
  return `<div class="ai" id="ai-${id}" ${open ? '' : 'hidden'}><h4>AI read <small>Claude · written ${esc(ai.generatedLabel || 'this morning')} · an estimate, not a fact</small></h4>${ai.headline ? `<p><b>${esc(ai.headline)}</b></p>` : ''}<p>${esc(ai.read || '')}</p>${keys ? `<ul>${keys}</ul>` : ''}${ai.pick ? `<p class="meta" style="margin-top:8px">Lean: ${esc(ai.pick)}${ai.confidence ? ' · ' + esc(ai.confidence) : ''}</p>` : ''}</div>`;
}
function aiEntry(aiDoc, gameId) {
  if (!aiDoc || !aiDoc.games) return null;
  const e = aiDoc.games[gameId]; if (!e) return null;
  return { ...e, generatedLabel: aiDoc.generated ? new Date(aiDoc.generated).toLocaleString('en-US', { timeZone: TZ, weekday: 'short', hour: 'numeric', minute: '2-digit' }) + ' CT' : null };
}
function leadersOf(side) {
  const pick = n => { const L = side.leaders.find(x => x.name === n); const a = L && L.leaders && L.leaders[0]; return a ? { v: a.displayValue, name: a.athlete && (a.athlete.shortName || a.athlete.displayName), id: a.athlete && a.athlete.id, img: a.athlete && a.athlete.headshot } : null; };
  return { pts: pick('points'), reb: pick('rebounds'), ast: pick('assists') };
}
function keyBlock(g, f, ai, opts = {}) {
  const live = isLive(g), pre = g.state === 'pre';
  const okcHome = g.home.id === OKC;
  const title = hasOKC(g) ? `Thunder ${okcHome ? 'vs' : 'at'} ${esc((okcHome ? g.away : g.home).short)}` : `${esc(g.away.short)} at ${esc(g.home.short)}`;
  const side = (s, cls) => `<div class="key-side"><img class="key-logo" src="${esc(s.logo)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><div class="key-n ${cls}${pre ? ' pre' : ''}">${pre ? esc(s.abbr) : esc(s.score ?? '–')}</div><div class="key-l">${esc(s.short)}${s.rec ? ' · ' + esc(s.rec) : ''}</div></div>`;
  const awayCls = g.away.id === OKC ? '' : 'away', homeCls = g.home.id === OKC ? '' : (g.away.id === OKC ? 'away' : '');
  const mid = pre ? `<div class="key-mid">@<small>${esc(tip(g.date))} CT</small></div>` : `<div class="key-mid">–<small>${esc(live ? g.detail : (g.detail || 'Final'))}</small></div>`;
  const badge = live ? `<span class="key-badge live">Live</span>` : hasOKC(g) && opts.badge ? `<span class="key-badge">${esc(opts.badge)}</span>` : '';
  const open = S.open.has('ai-' + g.id);
  return `<article class="key" aria-label="${esc(g.away.name)} at ${esc(g.home.name)}">
    <div class="key-top"><div><h2><a href="#game-${g.id}">${title}</a></h2><div class="key-sub">${esc(statusLine(g))}</div></div>${badge}</div>
    <div class="key-score">${side(g.away, awayCls)}${mid}${side(g.home, homeCls)}</div>
    <div class="key-foot"><div>${f ? fbar(g, f) : ''}</div><div style="display:flex;gap:8px;flex-wrap:wrap">${opts.noBox ? '' : `<a class="btn sm" href="#game-${g.id}">${pre ? 'Preview' : 'Box score'}</a>`}${ai ? `<button class="btn sm" data-act="ai" data-id="${g.id}" aria-expanded="${open}" aria-controls="ai-${g.id}">${open ? 'Hide AI read' : 'AI read'}</button>` : ''}</div></div>
    ${aiBlock(ai, open, g.id)}
  </article>`;
}
function fcRow(g, f, ai) {
  const ph = f.pHome, pa = 1 - ph;
  const open = S.open.has('fc-' + g.id);
  const detail = `<div class="fc-detail" id="fcd-${g.id}" ${open ? '' : 'hidden'}>${ai ? `<p><b>AI read${ai.headline ? ': ' + esc(ai.headline) : ''}</b></p><p>${esc(ai.read)}</p>${(ai.keys || []).length ? `<ul style="margin:0 0 8px;padding-left:18px">${ai.keys.map(k => `<li>${esc(k)}</li>`).join('')}</ul>` : ''}` : ''}
    <div class="inputs">
      <div><b>${sign(f.margin)}</b>${esc(g.home.abbr)} projected margin</div>
      <div><b>${sign(f.H.rating)}</b>${esc(g.home.abbr)} rating (${f.H.gp} GP, ${Math.round(f.H.weight * 100)}% this season)</div>
      <div><b>${sign(f.A.rating)}</b>${esc(g.away.abbr)} rating (${f.A.gp} GP, ${Math.round(f.A.weight * 100)}% this season)</div>
      <div><b>+${HCA}</b>home court</div>
      <div><b>${f.restH || f.restA ? sign(f.restH - f.restA) : '0.0'}</b>rest (${[f.restH ? g.home.abbr + ' on 2nd night' : '', f.restA ? g.away.abbr + ' on 2nd night' : ''].filter(Boolean).join(', ') || 'both rested'})</div>
      <div><b>${sign(f.H.form - f.A.form)}</b>last-10 form edge</div>
    </div></div>`;
  return `<div class="fc">
    <div class="fc-teams"><a href="#game-${g.id}">${esc(g.away.short)} at ${esc(g.home.short)}</a><small>${g.state === 'in' ? 'Live · ' + esc(g.detail) : esc(tip(g.date)) + ' CT · ' + esc(g.tv.label)}</small></div>
    <div class="fc-mid"><div class="fc-bar" role="img" aria-label="${esc(g.away.abbr)} ${pct(pa)}, ${esc(g.home.abbr)} ${pct(ph)}"><i style="width:${pa * 100}%;background:${g.away.color}"></i><i style="width:${ph * 100}%;background:${g.home.color}"></i></div><div class="fc-pct"><span>${esc(g.away.abbr)} ${pct(pa)}</span><span>${esc(g.home.abbr)} ${pct(ph)}</span></div></div>
    <div class="fc-act"><button class="btn sm ghost" data-act="fc" data-id="${g.id}"${ai ? ' data-ai="1"' : ''} aria-expanded="${open}" aria-controls="fcd-${g.id}">${open ? 'Hide' : ai ? 'AI read' : 'Why'}</button></div>
    ${detail}
  </div>`;
}
function standingsMini(cur, confAbbr = 'West', n = 10) {
  const conf = cur.confs.find(c => (c.name || '').includes(confAbbr)) || cur.confs[0];
  if (!conf) return '';
  const rows = conf.rows.slice(0, n).map((r, i) => `<tr class="click${r.id === OKC ? ' okc' : ''}${i === 5 || i === 9 ? ' cut' : ''}" data-href="#team-${r.id}"><td><span class="team"><span class="rank">${i + 1}</span><a href="#team-${r.id}">${esc(r.short || r.name)}</a></span></td><td>${r.w}</td><td>${r.l}</td><td>${esc(r.gb)}</td><td>${esc(r.strk)}</td></tr>`).join('');
  return `<section class="sheet"><div class="sheet-h"><h2>${esc(conf.name.replace(' Conference', ''))}</h2><a class="more" href="#standings">Full standings</a></div><div class="tw"><table class="t"><thead><tr><th>Team</th><th>W</th><th>L</th><th>GB</th><th>Strk</th></tr></thead><tbody>${rows}</tbody></table></div><p class="note">Top 6 make the playoffs; 7–10 go to the play-in.</p></section>`;
}
function injPill(status) {
  const s = (status || '').toLowerCase();
  const cls = s.includes('out') || s.includes('suspen') ? 'out' : s.includes('day') || s.includes('question') || s.includes('doubt') ? 'dtd' : s.includes('prob') ? 'prob' : '';
  const label = /day-to-day/i.test(status) ? 'DTD' : status;
  return `<span class="pill ${cls}">${esc(label || '—')}</span>`;
}

/* ================= views ================= */
const views = {};

/* ---------- TONIGHT ---------- */
views.tonight = async () => {
  $main.innerHTML = `<div class="grid"><div class="col">${skeleton(5)}${skeleton(4)}</div><div class="col">${skeleton(8)}${skeleton(5)}</div></div>`;
  const ymd = todayCT();
  const [ctx, ai, inj, news] = await Promise.all([forecastCtx(ymd), aiFor(ymd), jSoft(`${API}/injuries`, 600000), jSoft(`${API}/news?limit=12`, 600000)]);
  let okcGame = S.today.find(hasOKC), badge = 'Tonight', okcAi = null;
  if (!okcGame) {
    const sch = await jSoft(`${API}/teams/${OKC}/schedule`, 600000);
    const evs = (sch && sch.events || []).map(parseEvent);
    const next = evs.find(g => g.state !== 'post'); const last = [...evs].reverse().find(g => g.state === 'post');
    okcGame = next || last; badge = next ? (relDay(ymdFmt.format(new Date(next.date))) === 'Tomorrow' ? 'Tomorrow' : 'Next game') : 'Last game';
    if (next) okcAi = aiEntry(await aiFor(ymdFmt.format(new Date(next.date))), next.id);
  } else okcAi = aiEntry(ai, okcGame.id);

  const render = () => {
    const parts = [];
    if (okcGame) parts.push(keyBlock(okcGame, forecast(okcGame, ctx), okcAi, { badge }));
    else parts.push(state('Thunder schedule unavailable', '<p>The team schedule feed did not answer.</p>', true));

    const upcoming = S.today.filter(g => g.state !== 'post');
    const finals = S.today.filter(g => g.state === 'post');
    const fc = upcoming.length
      ? `<section class="sheet"><div class="sheet-h"><h2>Tonight's forecasts</h2><a class="more" href="#forecasts">Next 7 days</a></div><div class="fc-list">${upcoming.map(g => fcRow(g, forecast(g, ctx), aiEntry(ai, g.id))).join('')}</div></section>` : '';
    const res = finals.length
      ? `<section class="sheet"><div class="sheet-h"><h2>Finals</h2><small>tap for box score</small></div><div class="tw"><table class="t"><tbody>${finals.map(g => { const L = leadersOf(g.home.winner ? g.home : g.away).pts; return `<tr class="click" data-href="#game-${g.id}"><td><a href="#game-${g.id}">${esc(g.away.abbr)} ${g.away.score} · ${esc(g.home.abbr)} ${g.home.score}</a></td><td class="l muted">${L ? esc(L.name) + ' ' + esc(L.v) + ' pts' : ''}</td><td>${esc(g.detail)}</td></tr>`; }).join('')}</tbody></table></div></section>` : '';
    const left = parts.join('') + fc + res + (!S.today.length ? state('No games today', '<p>The strip above shows the last slate. Upcoming games and their forecasts are on the <a href="#forecasts">Forecasts</a> page.</p>') : '');

    const right = [];
    if (ctx.cur) right.push(standingsMini(ctx.cur));
    // injuries for teams on tonight's slate (Thunder first)
    if (inj && inj.injuries) {
      const playing = new Set(S.today.flatMap(g => [g.home.id, g.away.id])); playing.add(OKC);
      const teams = inj.injuries.filter(t => playing.has(String(t.id)) || (t.injuries && t.injuries[0] && t.injuries[0].athlete && t.injuries[0].athlete.team && playing.has(String(t.injuries[0].athlete.team.id))));
      const items = [];
      teams.sort((a, b) => (String(b.id) === OKC) - (String(a.id) === OKC)).forEach(t => (t.injuries || []).forEach(x => items.push({ team: t.displayName, x })));
      const top = items.slice(0, 9);
      right.push(`<section class="sheet"><div class="sheet-h"><h2>Injury report</h2><a class="more" href="#wire-injuries">All teams</a></div>${top.length ? top.map(({ team, x }) => `<div class="wire-item">${injPill(x.status)}<span><a href="#player-${esc(x.athlete && x.athlete.id || '')}"><b>${esc(x.athlete && x.athlete.displayName)}</b></a> <span class="muted">· ${esc(team.split(' ').pop())}</span><br><span class="muted">${esc((x.shortComment || '').slice(0, 140))}${(x.shortComment || '').length > 140 ? '…' : ''}</span></span></div>`).join('') : '<p class="muted">No injuries listed for tonight\'s teams.</p>'}</section>`);
    }
    if (news && news.articles) {
      right.push(`<section class="sheet"><div class="sheet-h"><h2>Latest</h2><a class="more" href="#wire">The wire</a></div>${news.articles.slice(0, 6).map(a => `<div class="wire-item"><span class="pill trade">${esc(ago(a.published))}</span><a href="${esc(a.links && a.links.web && a.links.web.href || '#')}" target="_blank" rel="noopener">${esc(a.headline)}</a></div>`).join('')}</section>`);
    }
    $main.innerHTML = `<h1 class="sr-only" style="position:absolute;left:-9999px">ThunderBase tonight</h1><div class="grid"><div class="col">${left}</div><div class="col">${right.join('')}</div></div>`;
  };
  render();
  return { live: async () => { const g = S.today.find(x => okcGame && x.id === okcGame.id); if (g) okcGame = g; render(); } };
};

/* ---------- GAMES (by date) ---------- */
views.games = async (arg) => {
  const ymd = arg && /^\d{8}$/.test(arg) ? expand(arg) : todayCT();
  const head = `<div class="pagehead"><div><h1>${esc(relDay(ymd))}</h1><p>${esc(dayLabel(ymd, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }))}</p></div>
    <div class="datenav"><a class="btn sm" href="#games-${compact(addDays(ymd, -1))}" aria-label="Previous day">‹</a><a class="btn sm ghost" href="#games">Today</a><input class="inp" type="date" id="gameDate" value="${ymd}" aria-label="Pick a date" style="flex:0 1 auto"><a class="btn sm" href="#games-${compact(addDays(ymd, 1))}" aria-label="Next day">›</a></div></div>`;
  $main.innerHTML = head + skeleton(6);
  document.getElementById('gameDate').addEventListener('change', e => { if (e.target.value) location.hash = 'games-' + compact(e.target.value); });
  const render = async (ttl) => {
    let games;
    try { games = ymd === todayCT() && ttl === undefined ? S.today : await scoreboard(ymd, ttl); } catch { $main.innerHTML = head + failMsg('games'); return; }
    if (!games.length) { $main.innerHTML = head + state('No games', '<p>No NBA games on this date.</p>'); rebind(); return; }
    const ctx = await forecastCtx(ymd); const ai = await aiFor(ymd);
    const card = g => {
      const per = Math.max(g.home.lines.length, g.away.lines.length, 4);
      const hdr = Array.from({ length: per }, (_, i) => `<th>${i < 4 ? i + 1 : 'OT' + (per > 5 ? i - 3 : '')}</th>`).join('');
      const row = s => `<tr><td><span class="team"><i class="sw" style="background:${s.color}"></i><a href="#team-${s.id}">${esc(s.abbr)}</a> <span class="muted" style="font-weight:500">${esc(s.rec)}</span></span></td>${Array.from({ length: per }, (_, i) => `<td>${esc(s.lines[i] ?? '')}</td>`).join('')}<td><b>${g.state === 'pre' ? '' : esc(s.score ?? '')}</b></td></tr>`;
      const ld = s => { const L = leadersOf(s); return [L.pts && `${esc(L.pts.name)} ${esc(L.pts.v)} pts`, L.reb && `${esc(L.reb.name)} ${esc(L.reb.v)} reb`, L.ast && `${esc(L.ast.name)} ${esc(L.ast.v)} ast`].filter(Boolean).join(' · '); };
      const f = forecast(g, ctx);
      return `<section class="sheet"><div class="sheet-h"><h3><a href="#game-${g.id}" style="text-decoration:none">${esc(g.away.short)} at ${esc(g.home.short)}</a></h3><small${isLive(g) ? ' style="color:var(--live)"' : ''}>${g.state === 'pre' ? esc(tip(g.date)) + ' CT' : esc(g.detail)} · ${esc(g.tv.label)}</small></div>
        <div class="tw"><table class="t lines"><thead><tr><th>Team</th>${hdr}<th>T</th></tr></thead><tbody>${row(g.away)}${row(g.home)}</tbody></table></div>
        ${g.state !== 'pre' ? `<p class="note" style="margin-top:8px"><b>${esc(g.away.abbr)}:</b> ${ld(g.away) || '—'}<br><b>${esc(g.home.abbr)}:</b> ${ld(g.home) || '—'}</p>` : `<p class="note" style="margin-top:8px">Forecast: ${esc((f.pHome >= .5 ? g.home : g.away).abbr)} ${pct(Math.max(f.pHome, 1 - f.pHome))}${aiEntry(ai, g.id) ? ' · AI read available' : ''} · ${esc(g.venue || '')}</p>`}
        <div style="margin-top:10px"><a class="btn sm ghost" href="#game-${g.id}">${g.state === 'pre' ? 'Preview' : 'Box score'}</a></div></section>`;
    };
    $main.innerHTML = head + `<div class="duo">${games.map(card).join('')}</div>`;
    rebind();
  };
  const rebind = () => { const el = document.getElementById('gameDate'); el && el.addEventListener('change', e => { if (e.target.value) location.hash = 'games-' + compact(e.target.value); }); };
  await render();
  return ymd === todayCT() ? { live: () => render() } : null;
};

/* ---------- GAME DETAIL ---------- */
views.game = async (id) => {
  $main.innerHTML = `<div class="grid"><div class="col">${skeleton(4)}${skeleton(10)}</div><div class="col">${skeleton(6)}</div></div>`;
  let data;
  const load = async (ttl) => { data = await j(`${API}/summary?event=${encodeURIComponent(id)}`, ttl); };
  try { await load(20000); } catch { $main.innerHTML = failMsg('this game'); return; }
  let ctx = null, ai = null;
  const render = async () => {
    const d = data;
    const hc = d.header && d.header.competitions && d.header.competitions[0];
    if (!hc) { $main.innerHTML = state('Game not found', '<p>That game ID didn\'t return anything.</p>', true); return; }
    const ev = { id, competitions: [{ ...hc, venue: d.gameInfo && d.gameInfo.venue, status: hc.status, broadcasts: hc.broadcasts, geoBroadcasts: hc.geoBroadcasts }], date: hc.date, status: hc.status };
    const g = parseEvent(ev);
    const ymd = ymdFmt.format(new Date(g.date));
    if (!ctx) ctx = await forecastCtx(ymd);
    if (ai === null) ai = aiEntry(await aiFor(ymd), id) || false;
    const f = forecast(g, ctx);
    // ESPN's numbers as a second opinion
    const wp = (d.winprobability || []).filter(x => x.homeWinPercentage != null);
    const bpi = d.predictor && d.predictor.homeTeam && d.predictor.homeTeam.gameProjection != null ? parseFloat(d.predictor.homeTeam.gameProjection) / 100 : null;
    const espnLine = g.state === 'in' && wp.length ? `ESPN live win prob: ${esc(g.home.abbr)} ${pct(wp[wp.length - 1].homeWinPercentage)}` : g.state === 'pre' && bpi != null ? `ESPN BPI: ${esc(g.home.abbr)} ${pct(bpi)}` : '';

    const out = [];
    out.push(keyBlock(g, f, ai || null, { noBox: true }));
    if (espnLine) out.push(`<p class="note" style="margin:-8px 0 0;color:var(--navy);font-weight:600">${espnLine} · our model ${esc(g.home.abbr)} ${pct(f.pHome)}</p>`);

    // linescore
    const per = Math.max(g.home.lines.length, g.away.lines.length);
    if (per) {
      const hdr = Array.from({ length: per }, (_, i) => `<th>${i < 4 ? 'Q' + (i + 1) : 'OT' + (per > 5 ? i - 3 : '')}</th>`).join('');
      const row = s => `<tr><td class="l"><span class="team"><i class="sw" style="background:${s.color}"></i><a href="#team-${s.id}">${esc(s.short)}</a></span></td>${Array.from({ length: per }, (_, i) => `<td>${esc(s.lines[i] ?? '')}</td>`).join('')}<td><b>${esc(s.score ?? '')}</b></td></tr>`;
      out.push(`<section class="sheet"><div class="sheet-h"><h2>Scoring</h2><small>${esc(d.gameInfo && d.gameInfo.attendance ? d.gameInfo.attendance.toLocaleString() + ' attendance' : '')}</small></div><div class="tw"><table class="t lines"><thead><tr><th>Team</th>${hdr}<th>T</th></tr></thead><tbody>${row(g.away)}${row(g.home)}</tbody></table></div></section>`);
    }

    // box scores
    const bx = d.boxscore && d.boxscore.players || [];
    const boxFor = side => {
      const p = bx.find(x => String(x.team.id) === side.id); if (!p || !p.statistics || !p.statistics[0]) return '';
      const s = p.statistics[0]; const labels = s.labels || s.names || [];
      const ath = s.athletes || [];
      const rowOf = a => {
        const nm = `<a href="#player-${esc(a.athlete.id)}">${esc(a.athlete.shortName || a.athlete.displayName)}</a> <span class="muted" style="font-weight:500">${esc(a.athlete.position && a.athlete.position.abbreviation || '')}</span>`;
        if (a.didNotPlay || !a.stats || !a.stats.length) return `<tr><td>${nm}</td><td class="dnp" colspan="${labels.length}">${esc(a.reason || 'Did not play')}</td></tr>`;
        return `<tr><td>${nm}</td>${a.stats.map(v => `<td>${esc(v)}</td>`).join('')}</tr>`;
      };
      const st = ath.filter(a => a.starter), bn = ath.filter(a => !a.starter);
      const tot = s.totals && s.totals.length ? `<tr class="tot"><td>Team</td>${s.totals.map(v => `<td>${esc(v)}</td>`).join('')}</tr>` : '';
      return `<section class="sheet"><div class="sheet-h"><h2>${esc(side.short)}</h2><small>box score</small></div><div class="tw"><table class="t box"><thead><tr><th>Player</th>${labels.map(l => `<th>${esc(l)}</th>`).join('')}</tr></thead><tbody>${st.length ? `<tr class="sub"><td colspan="${labels.length + 1}">Starters</td></tr>` + st.map(rowOf).join('') : ''}${bn.length ? `<tr class="sub"><td colspan="${labels.length + 1}">Bench</td></tr>` + bn.map(rowOf).join('') : ''}${tot}</tbody></table></div></section>`;
    };
    const boxes = [boxFor(g.away), boxFor(g.home)].filter(Boolean);

    // team stat comparison
    const tms = d.boxscore && d.boxscore.teams || [];
    const ta = tms.find(t => String(t.team.id) === g.away.id), th = tms.find(t => String(t.team.id) === g.home.id);
    let compare = '';
    if (ta && th && g.state !== 'pre') {
      const want = ['fieldGoalsMade-fieldGoalsAttempted', 'fieldGoalPct', 'threePointFieldGoalsMade-threePointFieldGoalsAttempted', 'threePointFieldGoalPct', 'freeThrowsMade-freeThrowsAttempted', 'totalRebounds', 'offensiveRebounds', 'assists', 'steals', 'blocks', 'turnovers', 'pointsInPaint', 'fastBreakPoints', 'largestLead'];
      const get = (t, n) => (t.statistics || []).find(x => x.name === n);
      const rows = want.map(n => { const a = get(ta, n), h = get(th, n); if (!a || !h) return ''; const av = parseFloat(String(a.displayValue).split('-')[0]) || 0, hv = parseFloat(String(h.displayValue).split('-')[0]) || 0; const tot = av + hv || 1; const lowGood = n === 'turnovers';
        return `<div class="cmp-row"><span>${esc(a.displayValue)}</span><div class="cmp-mid"><small>${esc(a.label || a.abbreviation || n)}</small><div class="cmp-bar"><i style="width:${av / tot * 100}%;background:${g.away.color};opacity:${(lowGood ? av <= hv : av >= hv) ? 1 : .45}"></i><i style="width:${hv / tot * 100}%;background:${g.home.color};opacity:${(lowGood ? hv <= av : hv >= av) ? 1 : .45}"></i></div></div><span>${esc(h.displayValue)}</span></div>`; }).join('');
      if (rows) compare = `<section class="sheet"><div class="sheet-h"><h2>Team stats</h2><small>${esc(g.away.abbr)} · ${esc(g.home.abbr)}</small></div><div class="compare">${rows}</div></section>`;
    }
    // leaders
    let leaders = '';
    if (d.leaders && d.leaders.length) {
      const items = [];
      d.leaders.forEach(t => (t.leaders || []).slice(0, 3).forEach(cat => { const L = cat.leaders && cat.leaders[0]; if (L) items.push({ team: t.team, cat, L }); }));
      leaders = `<section class="sheet"><div class="sheet-h"><h2>${g.state === 'pre' ? 'Season leaders' : 'Game leaders'}</h2></div>${items.map(({ team, cat, L }) => `<div class="leader"><img src="${esc(L.athlete.headshot && (L.athlete.headshot.href || L.athlete.headshot) || '')}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><div><a href="#player-${esc(L.athlete.id)}">${esc(L.athlete.displayName)}</a><small>${esc(team.abbreviation)} · ${esc(cat.displayName)}${L.summary ? ' · ' + esc(L.summary) : ''}</small></div><b>${esc(L.displayValue)}</b></div>`).join('')}</section>`;
    }
    // win probability chart
    let wpChart = '';
    if (wp.length > 3) {
      const W = 600, H = 160, n = wp.length;
      const pts = wp.map((x, i) => `${(i / (n - 1) * W).toFixed(1)},${((1 - x.homeWinPercentage) * H).toFixed(1)}`).join(' ');
      wpChart = `<section class="sheet wp"><div class="sheet-h"><h2>Win probability</h2><small>ESPN · ${esc(g.home.abbr)} above the line</small></div>
        <svg viewBox="-34 -8 ${W + 44} ${H + 26}" role="img" aria-label="Win probability over the game"><line x1="0" y1="${H / 2}" x2="${W}" y2="${H / 2}" stroke="currentColor" stroke-opacity=".25" stroke-dasharray="4 4"/>
        ${[0, .25, .5, .75, 1].map(q => `<line x1="${q * W}" y1="0" x2="${q * W}" y2="${H}" stroke="currentColor" stroke-opacity=".08"/>`).join('')}
        <polygon points="0,${H / 2} ${pts} ${W},${H / 2}" fill="${g.home.color}" fill-opacity=".18"/><polyline points="${pts}" fill="none" stroke="${g.home.color}" stroke-width="2.5"/>
        <text x="-6" y="10" text-anchor="end">${esc(g.home.abbr)}</text><text x="-6" y="${H}" text-anchor="end">${esc(g.away.abbr)}</text><text x="-6" y="${H / 2 + 3}" text-anchor="end">50%</text>
        ${['Q1', 'Q2', 'Q3', 'Q4'].map((q, i) => `<text x="${(i + .5) / 4 * W}" y="${H + 16}" text-anchor="middle">${q}</text>`).join('')}</svg></section>`;
    }
    // injuries
    let inj = '';
    if (d.injuries && d.injuries.some(t => t.injuries && t.injuries.length)) {
      inj = `<section class="sheet"><div class="sheet-h"><h2>Injuries</h2></div>${d.injuries.map(t => (t.injuries || []).map(x => `<div class="wire-item">${injPill(x.status)}<span><a href="#player-${esc(x.athlete && x.athlete.id)}"><b>${esc(x.athlete && x.athlete.displayName)}</b></a> <span class="muted">· ${esc(t.team && t.team.abbreviation)}${x.details && x.details.type ? ' · ' + esc(x.details.type) : ''}</span></span></div>`).join('')).join('')}</section>`;
    }
    // last five
    let l5 = '';
    if (d.lastFiveGames && d.lastFiveGames.length) {
      l5 = `<section class="sheet"><div class="sheet-h"><h2>Last five</h2></div>${d.lastFiveGames.map(t => `<p style="margin:0 0 10px"><b>${esc(t.team && t.team.displayName)}</b><br>${(t.events || []).map(e => `<span class="chip" title="${esc(e.atVs)} ${esc(e.opponent && e.opponent.abbreviation)} ${esc(e.score)}"><span class="${e.gameResult === 'W' ? 'w' : 'lo'}">${esc(e.gameResult)}</span> ${esc(e.atVs)} ${esc(e.opponent && e.opponent.abbreviation)} ${esc(e.score)}</span>`).join(' ')}</p>`).join('')}${d.seasonseries && d.seasonseries[0] ? `<p class="note">Season series: ${esc(d.seasonseries[0].summary || d.seasonseries[0].description || '')}</p>` : ''}</section>`;
    }
    // recap / news
    let recap = '';
    const art = d.article; const arts = d.news && d.news.articles || [];
    if ((art && art.headline) || arts.length) {
      const list = [art && art.headline ? { headline: art.headline, href: art.links && art.links.web && art.links.web.href, desc: art.description } : null, ...arts.slice(0, 4).map(a => ({ headline: a.headline, href: a.links && a.links.web && a.links.web.href, desc: a.description }))].filter(Boolean);
      recap = `<section class="sheet"><div class="sheet-h"><h2>${g.state === 'post' ? 'Recap & stories' : 'Stories'}</h2></div>${list.map(a => `<div class="wire-item"><span><a href="${esc(a.href || '#')}" target="_blank" rel="noopener"><b>${esc(a.headline)}</b></a>${a.desc ? `<br><span class="muted">${esc(a.desc)}</span>` : ''}</span></div>`).join('')}</section>`;
    }

    $main.innerHTML = `<div class="grid"><div class="col">${out.join('')}${boxes.join('')}${wpChart}</div><div class="col">${compare}${leaders}${inj}${l5}${recap}</div></div>`;
  };
  await render();
  return { live: async () => { const g = S.today.find(x => x.id === id); if (g && g.state !== 'post' || (data.header && data.header.competitions[0].status.type.state === 'in')) { try { await load(15000); await render(); } catch {} } } };
};

/* ---------- STANDINGS ---------- */
views.standings = async () => {
  const mode = store.get('stMode', 'conf');
  $main.innerHTML = `<div class="pagehead"><div><h1>Standings</h1><p id="stSeason">&nbsp;</p></div></div>${skeleton(12)}`;
  let cur; try { cur = await standings(); } catch { $main.innerHTML = failMsg('standings'); return; }
  const cols = `<th>W</th><th>L</th><th>Pct</th><th>GB</th><th>Home</th><th>Road</th><th>L10</th><th>Strk</th><th>PPG</th><th>Opp</th><th>Diff</th>`;
  const row = (r, i, cut) => `<tr class="click${r.id === OKC ? ' okc' : ''}${cut ? ' cut' : ''}" data-href="#team-${r.id}"><td><span class="team"><span class="rank">${i + 1}</span><img class="headshot" style="border-radius:0;width:22px;height:22px" src="${esc(r.logo)}" alt="" loading="lazy"><a href="#team-${r.id}">${esc(r.name)}</a></span></td><td>${r.w}</td><td>${r.l}</td><td>${esc(r.pct)}</td><td>${esc(r.gb)}</td><td>${esc(r.home)}</td><td>${esc(r.road)}</td><td>${esc(r.l10)}</td><td>${esc(r.strk)}</td><td>${r.ppg != null ? r.ppg.toFixed(1) : ''}</td><td>${r.opp != null ? r.opp.toFixed(1) : ''}</td><td class="${r.diff > 0 ? 'w' : r.diff < 0 ? 'lo' : ''}">${r.diff != null ? sign(+r.diff) : ''}</td></tr>`;
  const render = (m) => {
    let body;
    if (m === 'league') {
      const all = cur.confs.flatMap(c => c.rows).sort((a, b) => (b.w / Math.max(1, b.w + b.l)) - (a.w / Math.max(1, a.w + a.l)) || b.diff - a.diff);
      body = `<section class="sheet"><div class="tw"><table class="t"><thead><tr><th>League</th>${cols}</tr></thead><tbody>${all.map((r, i) => row(r, i)).join('')}</tbody></table></div></section>`;
    } else {
      body = `<div class="col">${cur.confs.map(c => `<section class="sheet"><div class="sheet-h"><h2>${esc(c.name)}</h2><small>6 playoff · 7–10 play-in</small></div><div class="tw"><table class="t"><thead><tr><th>Team</th>${cols}</tr></thead><tbody>${c.rows.map((r, i) => row(r, i, i === 5 || i === 9)).join('')}</tbody></table></div></section>`).join('')}</div>`;
    }
    $main.innerHTML = `<div class="pagehead"><div><h1>Standings</h1><p>${esc(cur.season || '')} regular season · Diff is average point margin</p></div></div>
      <div class="tabs" role="tablist"><button class="tab" role="tab" aria-selected="${m === 'conf'}" data-act="stmode" data-m="conf">Conference</button><button class="tab" role="tab" aria-selected="${m === 'league'}" data-act="stmode" data-m="league">League</button></div>${body}`;
  };
  render(mode);
  views.standings.render = m => { store.set('stMode', m); render(m); };
};

/* ---------- TEAMS ---------- */
views.teams = async () => {
  $main.innerHTML = `<div class="pagehead"><div><h1>Teams</h1></div></div>${skeleton(8)}`;
  const [td, cur] = await Promise.all([jSoft(`${API}/teams`, 86400000), standings().catch(() => null)]);
  const teams = (td && td.sports && td.sports[0].leagues[0].teams || []).map(x => x.team);
  if (!teams.length) { $main.innerHTML = failMsg('teams'); return; }
  const card = t => { const r = cur && cur.byId[String(t.id)]; return `<a class="team-card" href="#team-${t.id}"><img src="${esc(t.logos && t.logos[0] && t.logos[0].href || logoUrl(t.abbreviation))}" alt="" loading="lazy"><span><b>${esc(t.displayName)}</b><small>${r ? `${r.w}–${r.l} · ${ordinal(r.seed)} in ${esc(r.conf)}` : esc(t.abbreviation)}</small></span><i class="band" style="background:${hx(t.color)}"></i></a>`; };
  const groups = cur ? cur.confs.map(c => ({ name: c.name, list: teams.filter(t => cur.byId[String(t.id)] && cur.byId[String(t.id)].confName === c.name).sort((a, b) => a.displayName.localeCompare(b.displayName)) })) : [{ name: 'All teams', list: teams }];
  const okc = teams.find(t => String(t.id) === OKC);
  $main.innerHTML = `<div class="pagehead"><div><h1>Teams</h1><p>All 30, with every roster, schedule and stat line one tap away</p></div></div>${okc ? `<div class="teams" style="margin-bottom:6px">${card(okc)}</div>` : ''}${groups.map(gp => `<h2 class="conf-h">${esc(gp.name)}</h2><div class="teams">${gp.list.map(card).join('')}</div>`).join('')}`;
};
const ordinal = n => { if (!n || n > 30) return '—'; const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };

/* ---------- league player list (shared by Players and Team) ---------- */
async function leaguePlayers(season) {
  const base = `${WEB}/statistics/byathlete?region=us&lang=en&contentorigin=espn&isqualified=false&limit=100&sort=offensive.avgPoints:desc${season ? `&season=${season}&seasontype=2` : ''}`;
  const first = await j(base + '&page=1', 600000);
  const pages = Math.min((first.pagination && first.pagination.pages) || 1, 10);
  const rest = await Promise.all(Array.from({ length: pages - 1 }, (_, i) => jSoft(base + '&page=' + (i + 2), 600000)));
  const idx = {}; (first.categories || []).forEach(c => { idx[c.name] = c.names || []; });
  const rows = [];
  [first, ...rest].filter(Boolean).forEach(pg => (pg.athletes || []).forEach(a => {
    const v = {}; (a.categories || []).forEach(c => (idx[c.name] || []).forEach((n, i) => { if (!(n in v)) v[n] = c.values ? c.values[i] : parseFloat(c.totals && c.totals[i]); }));
    const at = a.athlete || {};
    rows.push({ id: String(at.id), name: at.displayName, short: at.shortName, team: at.teamShortName || '', teamId: String(at.teamId || ''), pos: at.position && at.position.abbreviation || '', img: at.headshot && at.headshot.href,
      gp: v.gamesPlayed || 0, min: v.avgMinutes || 0, pts: v.avgPoints || 0, reb: v.avgRebounds || 0, ast: v.avgAssists || 0, stl: v.avgSteals || 0, blk: v.avgBlocks || 0, tov: v.avgTurnovers || 0,
      fg: v.fieldGoalPct || 0, tp: v.threePointFieldGoalPct || 0, ft: v.freeThrowPct || 0, tpm: v.avgThreePointFieldGoalsMade || 0, dd: v.doubleDouble || 0 });
  }));
  const label = (first.requestedSeason && (first.requestedSeason.displayName || first.requestedSeason.year)) || (first.currentSeason && first.currentSeason.displayName) || '';
  return { rows, label };
}
const PCOLS = [['gp', 'GP', 0], ['min', 'MIN', 1], ['pts', 'PTS', 1], ['reb', 'REB', 1], ['ast', 'AST', 1], ['stl', 'STL', 1], ['blk', 'BLK', 1], ['tov', 'TO', 1], ['fg', 'FG%', 1], ['tp', '3P%', 1], ['tpm', '3PM', 1], ['ft', 'FT%', 1]];
function playerTable(rows, sortKey, showTeam = true, limit = Infinity) {
  return `<div class="tw"><table class="t"><thead><tr><th>Player</th>${showTeam ? '<th class="l">Team</th>' : ''}<th class="l">Pos</th>${PCOLS.map(([k, l]) => `<th class="sortable${k === sortKey ? ' sorted' : ''}" data-act="psort" data-k="${k}" tabindex="0" aria-sort="${k === sortKey ? 'descending' : 'none'}">${l}</th>`).join('')}</tr></thead><tbody>${rows.slice(0, limit).map((r, i) => `<tr class="click${r.teamId === OKC ? ' okc' : ''}" data-href="#player-${r.id}"><td><span class="team"><span class="rank">${i + 1}</span><img class="headshot" src="${esc(r.img || '')}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><a href="#player-${r.id}">${esc(r.name)}</a></span></td>${showTeam ? `<td class="l"><a href="#team-${r.teamId}">${esc(r.team)}</a></td>` : ''}<td class="l">${esc(r.pos)}</td>${PCOLS.map(([k, , dp]) => `<td>${(+r[k] || 0).toFixed(dp)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

/* ---------- PLAYERS ---------- */
views.players = async () => {
  const P = views.players.st = views.players.st || { sort: 'pts', q: '', pos: '', qual: true, season: '', limit: 100 };
  $main.innerHTML = `<div class="pagehead"><div><h1>Players</h1><p>Loading every player in the league…</p></div></div>${skeleton(14)}`;
  let data; try { data = await leaguePlayers(P.season); } catch { $main.innerHTML = failMsg('player stats'); return; }
  const paint = () => {
    const maxGp = Math.max(1, ...data.rows.map(r => r.gp));
    let rows = data.rows.filter(r => (!P.q || (r.name + ' ' + r.team).toLowerCase().includes(P.q.toLowerCase())) && (!P.pos || r.pos.includes(P.pos)) && (!P.qual || r.gp >= Math.ceil(maxGp * 0.5)));
    rows.sort((a, b) => (b[P.sort] || 0) - (a[P.sort] || 0));
    const table = rows.length ? playerTable(rows, P.sort, true, P.limit) : `<p class="muted">No players match that.</p>`;
    document.getElementById('ptable').innerHTML = table + (rows.length > P.limit ? `<div style="margin-top:12px"><button class="btn sm ghost" data-act="pmore">Show ${Math.min(100, rows.length - P.limit)} more of ${rows.length}</button></div>` : '');
    document.getElementById('pcount').textContent = `${rows.length} players${P.qual ? ` · at least ${Math.ceil(maxGp * 0.5)} games` : ''}`;
  };
  $main.innerHTML = `<div class="pagehead"><div><h1>Players</h1><p>${esc(data.label ? data.label + ' · ' : '')}per-game averages · tap a column to sort</p></div></div>
    <div class="ctrls"><input class="inp" id="pq" type="search" placeholder="Search a player or team (e.g. Shai, OKC)" value="${esc(P.q)}" aria-label="Search players">
    <select class="sel" id="ppos" aria-label="Position"><option value="">All positions</option><option value="G"${P.pos === 'G' ? ' selected' : ''}>Guards</option><option value="F"${P.pos === 'F' ? ' selected' : ''}>Forwards</option><option value="C"${P.pos === 'C' ? ' selected' : ''}>Centers</option></select>
    <select class="sel" id="pseason" aria-label="Season"><option value=""${!P.season ? ' selected' : ''}>This season</option><option value="${seasonYear() - 1}"${P.season ? ' selected' : ''}>Last season</option></select>
    <label class="chip" style="min-height:42px;padding:0 10px;cursor:pointer"><input type="checkbox" id="pqual" ${P.qual ? 'checked' : ''}> Regulars only</label></div>
    <section class="sheet"><div class="sheet-h"><h2>League</h2><small id="pcount"></small></div><div id="ptable"></div></section>`;
  paint();
  const q = document.getElementById('pq'); let t;
  q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { P.q = q.value.trim(); P.limit = 100; paint(); }, 150); });
  document.getElementById('ppos').addEventListener('change', e => { P.pos = e.target.value; paint(); });
  document.getElementById('pqual').addEventListener('change', e => { P.qual = e.target.checked; paint(); });
  document.getElementById('pseason').addEventListener('change', e => { P.season = e.target.value; views.players(); });
  views.players.paint = paint;
};
function seasonYear() { const now = new Date(); return now.getUTCMonth() >= 6 ? now.getUTCFullYear() + 1 : now.getUTCFullYear(); }

/* ---------- TEAM ---------- */
views.team = async (id) => {
  $main.innerHTML = `<div class="grid"><div class="col">${skeleton(4)}${skeleton(12)}</div><div class="col">${skeleton(10)}</div></div>`;
  const [info, roster, sched, cur] = await Promise.all([jSoft(`${API}/teams/${id}`, 600000), jSoft(`${API}/teams/${id}/roster`, 3600000), jSoft(`${API}/teams/${id}/schedule`, 300000), standings().catch(() => null)]);
  const t = info && info.team;
  if (!t) { $main.innerHTML = failMsg('this team'); return; }
  const r = cur && cur.byId[String(id)];
  const bg = darkOf(t.color, t.alternateColor);
  const evs = (sched && sched.events || []).map(parseEvent);
  const next = evs.find(g => g.state !== 'post');
  let nextHtml = '';
  if (next) {
    const ctx = await forecastCtx(ymdFmt.format(new Date(next.date)));
    const f = forecast(next, ctx); const opp = next.home.id === String(id) ? next.away : next.home; const pTeam = next.home.id === String(id) ? f.pHome : 1 - f.pHome;
    nextHtml = `<div class="key-foot"><div><div class="fbar-l"><span>Next: ${next.home.id === String(id) ? 'vs' : 'at'} ${esc(opp.short)} · ${esc(relDay(ymdFmt.format(new Date(next.date))))} ${esc(tip(next.date))} CT</span><span>${next.state === 'in' ? 'live' : 'forecast'} ${pct(pTeam)} to win</span></div><div class="fbar"><i style="width:${pTeam * 100}%;background:var(--gold)"></i><i style="width:${(1 - pTeam) * 100}%;background:${opp.color};opacity:.85"></i></div></div><a class="btn sm" href="#game-${next.id}">${next.state === 'in' ? 'Live' : 'Preview'}</a></div>`;
  }
  const head = `<article class="key team" style="--tc:${bg}"><div class="pl-head"><img src="${esc(t.logos && t.logos[0] && t.logos[0].href || logoUrl(t.abbreviation))}" alt="" style="object-fit:contain;width:110px;height:110px"><div style="padding-bottom:16px"><h2 style="margin:0;font:400 clamp(30px,5vw,50px)/1 var(--display);letter-spacing:.03em;text-transform:uppercase">${esc(t.displayName)}</h2><div class="key-sub">${esc([r ? `${r.w}–${r.l}` : (t.record && t.record.items && t.record.items[0] && t.record.items[0].summary), t.standingSummary, r && r.strk ? 'streak ' + r.strk : ''].filter(Boolean).join(' · '))}</div></div></div>
    ${r ? `<div class="pl-stats"><div><b>${r.ppg != null ? r.ppg.toFixed(1) : '—'}</b><small>Points</small></div><div><b>${r.opp != null ? r.opp.toFixed(1) : '—'}</b><small>Allowed</small></div><div><b>${sign(+r.diff || 0)}</b><small>Margin</small></div><div><b>${esc(r.home || '—')}</b><small>Home</small></div><div><b>${esc(r.road || '—')}</b><small>Road</small></div><div><b>${esc(r.l10 || '—')}</b><small>Last 10</small></div></div>` : ''}${nextHtml}</article>`;

  const ath = (roster && roster.athletes || []).flatMap(a => a.items ? a.items : [a]);
  const rosterHtml = ath.length ? `<section class="sheet"><div class="sheet-h"><h2>Roster</h2><small>${ath.length} players</small></div><div class="tw"><table class="t"><thead><tr><th>Player</th><th>#</th><th class="l">Pos</th><th>Age</th><th>Ht</th><th>Wt</th><th class="l">Status</th></tr></thead><tbody>${ath.map(a => `<tr class="click" data-href="#player-${a.id}"><td><span class="team"><img class="headshot" src="${esc(a.headshot && a.headshot.href || '')}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><a href="#player-${a.id}">${esc(a.displayName)}</a></span></td><td>${esc(a.jersey || '')}</td><td class="l">${esc(a.position && a.position.abbreviation || '')}</td><td>${esc(a.age || '')}</td><td>${esc(a.displayHeight || '')}</td><td>${esc((a.displayWeight || '').replace(' lbs', ''))}</td><td class="l">${a.injuries && a.injuries.length ? injPill(a.injuries[0].status) : '<span class="muted">Active</span>'}</td></tr>`).join('')}</tbody></table></div></section>` : '';

  const done = evs.filter(g => g.state === 'post').slice(-10).reverse(), up = evs.filter(g => g.state !== 'post').slice(0, 8);
  const sRow = g => { const home = g.home.id === String(id); const me = home ? g.home : g.away, op = home ? g.away : g.home; const res = g.state === 'post' ? `<span class="${me.winner ? 'w' : 'lo'}">${me.winner ? 'W' : 'L'}</span> ${me.score}–${op.score}` : g.state === 'in' ? `<span style="color:var(--live)">Live</span> ${me.score}–${op.score}` : `${esc(tip(g.date))}`; return `<tr class="click" data-href="#game-${g.id}"><td>${esc(dateShort(g.date))}</td><td class="l">${home ? 'vs' : '@'} <a href="#team-${op.id}">${esc(op.short)}</a></td><td>${res}</td></tr>`; };
  const schedHtml = `<section class="sheet"><div class="sheet-h"><h2>Schedule</h2><small>${evs.length} games</small></div><div class="tw"><table class="t"><tbody>${up.length ? `<tr class="sub"><td colspan="3">Coming up</td></tr>${up.map(sRow).join('')}` : ''}${done.length ? `<tr class="sub"><td colspan="3">Recent</td></tr>${done.map(sRow).join('')}` : ''}</tbody></table></div></section>`;

  $main.innerHTML = `<div class="grid"><div class="col">${head}<div id="tstats">${skeleton(6)}</div>${rosterHtml}</div><div class="col">${schedHtml}</div></div>`;
  try {
    const lp = await leaguePlayers();
    const mine = lp.rows.filter(p => p.teamId === String(id)).sort((a, b) => b.pts - a.pts);
    document.getElementById('tstats').innerHTML = mine.length ? `<section class="sheet"><div class="sheet-h"><h2>Season stats</h2><small>${esc(lp.label)} · per game</small></div>${playerTable(mine, 'pts', false)}</section>` : '';
  } catch { const el = document.getElementById('tstats'); if (el) el.innerHTML = ''; }
};

/* ---------- PLAYER ---------- */
views.player = async (id) => {
  $main.innerHTML = `<div class="grid"><div class="col">${skeleton(5)}${skeleton(10)}</div><div class="col">${skeleton(8)}</div></div>`;
  const [bio, ov, gl] = await Promise.all([jSoft(`${WEB}/athletes/${id}`, 3600000), jSoft(`${WEB}/athletes/${id}/overview`, 600000), jSoft(`${WEB}/athletes/${id}/gamelog`, 600000)]);
  const a = bio && (bio.athlete || bio);
  if (!a || !a.displayName) { $main.innerHTML = failMsg('this player'); return; }
  const team = a.team || {};
  const bg = darkOf(team.color, team.alternateColor);
  const st = ov && ov.statistics; const labels = st && st.labels || [];
  const reg = st && st.splits && st.splits.find(s => /regular/i.test(s.displayName)) || (st && st.splits && st.splits[0]);
  const val = l => { const i = labels.indexOf(l); return reg && i >= 0 ? reg.stats[i] : '—'; };
  const facts = [a.position && a.position.displayName, a.jersey && '#' + a.jersey, a.displayHeight, a.displayWeight, a.age && `age ${a.age}`, a.college && a.college.name, a.displayDraft || (a.draft && a.draft.displayText)].filter(Boolean);
  const injury = a.injuries && a.injuries[0];
  const head = `<article class="key team" style="--tc:${bg}"><div class="pl-head"><img src="${esc(a.headshot && a.headshot.href || '')}" alt="" onerror="this.style.visibility='hidden'"><div style="padding-bottom:16px;min-width:0"><h2 style="margin:0;font:400 clamp(30px,5vw,50px)/1 var(--display);letter-spacing:.03em;text-transform:uppercase;text-wrap:balance">${esc(a.displayName)}</h2><div class="key-sub">${team.id ? `<a href="#team-${esc(team.id)}" style="color:inherit">${esc(team.displayName)}</a> · ` : ''}${esc(facts.join(' · '))}</div>${injury ? `<div style="margin-top:8px">${injPill(injury.status)} <span class="key-sub">${esc(injury.details && injury.details.type || '')}</span></div>` : ''}</div></div>
    <div class="pl-stats">${['PTS', 'REB', 'AST', 'FG%', '3P%', 'MIN'].map(l => `<div><b>${esc(val(l))}</b><small>${l === 'MIN' ? 'Minutes' : l}</small></div>`).join('')}</div></article>`;
  const splits = st && st.splits && st.splits.length ? `<section class="sheet"><div class="sheet-h"><h2>Averages</h2><small>per game</small></div><div class="tw"><table class="t"><thead><tr><th></th>${labels.map(l => `<th>${esc(l)}</th>`).join('')}</tr></thead><tbody>${st.splits.map(s => `<tr><td><b>${esc(s.displayName)}</b></td>${s.stats.map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>` : '';
  // game log
  let log = '';
  if (gl && gl.events && gl.seasonTypes) {
    const L = gl.labels || [];
    const evRows = [];
    gl.seasonTypes.forEach(stp => (stp.categories || []).forEach(c => (c.events || []).forEach(e => { const meta = gl.events[e.eventId]; if (meta) evRows.push({ meta, stats: e.stats, id: e.eventId }); })));
    evRows.sort((x, y) => new Date(y.meta.gameDate) - new Date(x.meta.gameDate));
    if (evRows.length) log = `<section class="sheet"><div class="sheet-h"><h2>Game log</h2><small>last ${Math.min(12, evRows.length)}</small></div><div class="tw"><table class="t"><thead><tr><th>Date</th><th class="l">Opp</th><th class="l">Result</th>${L.map(l => `<th>${esc(l)}</th>`).join('')}</tr></thead><tbody>${evRows.slice(0, 12).map(r => `<tr class="click" data-href="#game-${esc(r.id)}"><td>${esc(dateShort(r.meta.gameDate))}</td><td class="l">${esc(r.meta.atVs || '')} ${esc(r.meta.opponent && r.meta.opponent.abbreviation || '')}</td><td class="l"><span class="${r.meta.gameResult === 'W' ? 'w' : 'lo'}">${esc(r.meta.gameResult || '')}</span> ${esc(r.meta.score || '')}</td>${(r.stats || []).map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>`;
  }
  const news = ov && ov.news && ov.news.length ? `<section class="sheet"><div class="sheet-h"><h2>News</h2></div>${ov.news.slice(0, 8).map(n => `<div class="wire-item"><span class="pill trade">${esc(n.published ? ago(n.published) : '')}</span><a href="${esc(n.links && n.links.web && n.links.web.href || '#')}" target="_blank" rel="noopener">${esc(n.headline)}</a></div>`).join('')}</section>` : '';
  $main.innerHTML = `<div class="grid"><div class="col">${head}${splits}${log}</div><div class="col">${news || state('No recent news', '<p>Nothing new on this player in the feed.</p>')}</div></div>`;
};

/* ---------- FORECASTS ---------- */
views.forecasts = async () => {
  $main.innerHTML = `<div class="pagehead"><div><h1>Forecasts</h1><p>The next seven days</p></div></div>${skeleton(10)}`;
  const t = todayCT(); const days = Array.from({ length: 7 }, (_, i) => addDays(t, i));
  const [boards, cur, prior, yday, ais] = await Promise.all([Promise.all(days.map(d => scoreboard(d).catch(() => []))), standings().catch(() => null), priorStandings(), scoreboard(addDays(t, -1)).catch(() => []), Promise.all(days.map(aiFor))]);
  const played = days.map((d, i) => new Set((i === 0 ? yday : boards[i - 1]).flatMap(g => [g.home.id, g.away.id])));
  const sections = days.map((d, i) => {
    const games = boards[i].filter(g => g.state !== 'post'); if (!games.length) return '';
    const ctx = { cur, prior, b2b: played[i] };
    return `<section class="sheet"><div class="sheet-h"><h2>${esc(relDay(d))}</h2><small>${esc(dayLabel(d, { weekday: 'short', month: 'short', day: 'numeric' }))} · ${games.length} games${ais[i] ? ' · AI reads in' : ''}</small></div><div class="fc-list">${games.map(g => fcRow(g, forecast(g, ctx), aiEntry(ais[i], g.id))).join('')}</div></section>`;
  }).join('');
  $main.innerHTML = `<div class="pagehead"><div><h1>Forecasts</h1><p>The next seven days · win chances from the ThunderBase rating model</p></div></div>
    <div class="grid"><div class="col">${sections || state('Nothing scheduled', '<p>No games in the next seven days.</p>')}</div>
    <div class="col"><section class="sheet"><div class="sheet-h"><h2>How it works</h2></div>
      <p style="margin:0 0 10px">Each team gets a rating: its average point margin this season, blended with last season's margin while the sample is small. Ten games in, this season counts for half.</p>
      <p style="margin:0 0 10px">Projected margin = rating gap + ${HCA} for home court − ${B2B} for a team on the second night of a back-to-back + a small last-10 form edge. That margin becomes a win chance using the typical ${SD}-point spread of NBA results.</p>
      <p style="margin:0 0 10px">During a game the chance updates from the score and the time left. Tap <b>Why</b> on any game to see its inputs.</p>
      <p class="note">AI reads are written by Claude each morning from the day's standings, injuries and form. They are an opinion with reasons, not a prediction you should bet on.</p></section>
      ${cur ? standingsMini(cur, 'West', 10) : ''}</div></div>`;
};

/* ---------- WIRE ---------- */
views.wire = async (tab) => {
  tab = tab || store.get('wireTab', 'news');
  const tabs = `<div class="tabs" role="tablist">${[['news', 'News'], ['injuries', 'Injuries'], ['moves', 'Transactions']].map(([k, l]) => `<a class="tab" role="tab" aria-selected="${tab === k}" href="#wire-${k}" style="text-decoration:none;display:inline-flex;align-items:center">${l}</a>`).join('')}</div>`;
  const head = `<div class="pagehead"><div><h1>The wire</h1><p>News, injuries and roster moves across the league</p></div></div>${tabs}`;
  $main.innerHTML = head + skeleton(10);
  store.set('wireTab', tab);
  if (tab === 'injuries') {
    const d = await jSoft(`${API}/injuries`, 300000);
    if (!d) { $main.innerHTML = head + failMsg('injuries'); return; }
    const teams = (d.injuries || []).filter(t => t.injuries && t.injuries.length).sort((a, b) => (String(b.id) === OKC) - (String(a.id) === OKC) || a.displayName.localeCompare(b.displayName));
    const sel = store.get('injTeam', '');
    const opts = `<select class="sel" id="injTeam" aria-label="Team"><option value="">All teams (${teams.reduce((n, t) => n + t.injuries.length, 0)} players)</option>${teams.map(t => `<option value="${esc(t.id)}"${String(t.id) === sel ? ' selected' : ''}>${esc(t.displayName)} (${t.injuries.length})</option>`).join('')}</select>`;
    const list = teams.filter(t => !sel || String(t.id) === sel).map(t => `<section class="sheet"><div class="sheet-h"><h2>${esc(t.displayName)}</h2><small>${t.injuries.length}</small></div>${t.injuries.map(x => `<div class="wire-item">${injPill(x.status)}<span><a href="#player-${esc(x.athlete && x.athlete.id)}"><b>${esc(x.athlete && x.athlete.displayName)}</b></a> <span class="muted">· ${esc(x.athlete && x.athlete.position && x.athlete.position.abbreviation || '')}${x.details && x.details.type ? ' · ' + esc(x.details.type) : ''}${x.details && x.details.returnDate ? ' · est. return ' + esc(dateShort(x.details.returnDate)) : ''}</span><br><span class="muted">${esc(x.shortComment || '')}</span></span></div>`).join('')}</section>`).join('');
    $main.innerHTML = head + `<div class="ctrls">${opts}</div><div class="duo">${list}</div>`;
    document.getElementById('injTeam').addEventListener('change', e => { store.set('injTeam', e.target.value); views.wire('injuries'); });
  } else if (tab === 'moves') {
    const d = await jSoft(`${API}/transactions?limit=100`, 900000);
    if (!d) { $main.innerHTML = head + failMsg('transactions'); return; }
    const items = (d.transactions || []);
    $main.innerHTML = head + `<section class="sheet"><div class="sheet-h"><h2>Transactions</h2><small>${items.length} most recent</small></div>${items.map(x => `<div class="wire-item"><span class="pill trade">${esc(dateShort(x.date))}</span><span><b>${esc(x.team && x.team.displayName || '')}</b> · ${esc(x.description)}</span></div>`).join('') || '<p class="muted">No recent transactions.</p>'}</section>`;
  } else {
    const d = await jSoft(`${API}/news?limit=50`, 300000);
    if (!d) { $main.innerHTML = head + failMsg('news'); return; }
    const arts = d.articles || [];
    $main.innerHTML = head + `<div class="news">${arts.map(a => { const img = a.images && a.images[0] && a.images[0].url; return `<a class="story" href="${esc(a.links && a.links.web && a.links.web.href || '#')}" target="_blank" rel="noopener">${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : ''}<div><h3>${esc(a.headline)}</h3><p>${esc(a.description || '')}</p><span class="meta">${esc(ago(a.published))}${a.byline ? ' · ' + esc(a.byline) : ''}</span></div></a>`; }).join('')}</div>`;
  }
};

/* ================= router ================= */
function parseHash() {
  const h = (location.hash || '#tonight').slice(1);
  const m = h.match(/^([a-z]+)(?:-([A-Za-z0-9]+))?$/);
  if (!m || !views[m[1]]) return { name: 'tonight', arg: null };
  return { name: m[1], arg: m[2] || null };
}
let navSeq = 0;
async function route() {
  const { name, arg } = parseHash();
  const seq = ++navSeq;
  document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === name || (name === 'game' && a.dataset.nav === 'games') || (name === 'team' && a.dataset.nav === 'teams') || (name === 'player' && a.dataset.nav === 'players')));
  S.route = null;
  if (!S.lastOk && !S.err) await tick();
  try {
    const r = await views[name](arg);
    if (seq === navSeq) S.route = r || null;
  } catch (e) {
    console.error(e);
    if (seq === navSeq) $main.innerHTML = failMsg('this page');
  }
  const titles = { tonight: 'ThunderBase', games: 'Games · ThunderBase', game: 'Game · ThunderBase', standings: 'Standings · ThunderBase', teams: 'Teams · ThunderBase', team: 'Team · ThunderBase', players: 'Players · ThunderBase', player: 'Player · ThunderBase', forecasts: 'Forecasts · ThunderBase', wire: 'The wire · ThunderBase' };
  document.title = titles[name] || 'ThunderBase';
}
window.addEventListener('hashchange', () => { window.scrollTo({ top: 0 }); $main.focus({ preventScroll: true }); route(); });

/* ================= delegated actions ================= */
document.addEventListener('click', e => {
  const act = e.target.closest('[data-act]');
  if (act) {
    const a = act.dataset.act;
    if (a === 'ai') { const k = 'ai-' + act.dataset.id; S.open.has(k) ? S.open.delete(k) : S.open.add(k); const box = document.getElementById(k); if (box) { box.hidden = !S.open.has(k); act.textContent = S.open.has(k) ? 'Hide AI read' : 'AI read'; act.setAttribute('aria-expanded', S.open.has(k)); } return; }
    if (a === 'fc') { const k = 'fc-' + act.dataset.id; S.open.has(k) ? S.open.delete(k) : S.open.add(k); const on = S.open.has(k); document.querySelectorAll('#fcd-' + act.dataset.id).forEach(el => el.hidden = !on); act.setAttribute('aria-expanded', on); act.textContent = on ? 'Hide' : (act.dataset.ai ? 'AI read' : 'Why'); return; }
    if (a === 'stmode') { views.standings.render(act.dataset.m); return; }
    if (a === 'psort') { views.players.st.sort = act.dataset.k; views.players.paint ? views.players.paint() : route(); return; }
    if (a === 'pmore') { views.players.st.limit += 100; views.players.paint(); return; }
    if (a === 'reload') { e.preventDefault(); cache.clear(); tick().then(route); return; }
  }
  const tr = e.target.closest('tr[data-href]');
  if (tr && !e.target.closest('a,button,input,select')) { location.hash = tr.dataset.href.slice(1); }
});
document.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('th[data-act="psort"]')) { e.preventDefault(); e.target.click(); }
});

/* ================= boot ================= */
S.todayYmd = todayCT();
tick().then(route);
})();
