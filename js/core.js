/* Tipoff — data layer: fetching, parsing, the forecast model, shared state. */
(function () {
'use strict';
const HW = window.HW;
const { LEAGUES, ORDER, ESPN, TZ } = HW;

/* ---------- small utilities ---------- */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
/* the basketball "day" runs until 4 AM Central, so a late West Coast tip stays on tonight's slate */
function todayCT() { const now = new Date(); const h = +hourFmt.format(now) % 24; const d = ymdFmt.format(now); return h < 4 ? addDays(d, -1) : d; }
function addDays(ymd, n) { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); }
const compact = ymd => ymd.replace(/-/g, '');
const expand = c => `${c.slice(0, 4)}-${c.slice(4, 6)}-${c.slice(6, 8)}`;
const ymdOf = iso => ymdFmt.format(new Date(iso));
function dayLabel(ymd, opts = { weekday: 'long', month: 'short', day: 'numeric' }) { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' }); }
function relDay(ymd) { const t = todayCT(); if (ymd === t) return 'Tonight'; if (ymd === addDays(t, 1)) return 'Tomorrow'; if (ymd === addDays(t, -1)) return 'Last night'; return dayLabel(ymd); }
const tip = iso => new Date(iso).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
const dateShort = iso => new Date(iso).toLocaleDateString('en-US', { timeZone: TZ, month: 'short', day: 'numeric' });
const timeCT = (d = new Date()) => d.toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit', second: '2-digit' });
function ago(iso) { const s = (Date.now() - new Date(iso)) / 1000; if (s < 3600) return Math.max(1, Math.round(s / 60)) + 'm ago'; if (s < 86400) return Math.round(s / 3600) + 'h ago'; return dateShort(iso); }
const pct = x => Math.round(x * 100) + '%';
const sign = x => (x > 0 ? '+' : '') + (+x).toFixed(1);
const ordinal = n => { n = +n; if (!n) return '—'; const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
function lum(hex) { const h = (hex || '').replace('#', ''); if (h.length < 6) return 0.3; const c = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
const hx = c => c ? (c.startsWith('#') ? c : '#' + c) : '#55606e';
/* a team color dark enough to carry white text */
function darkOf(a, b) { const A = hx(a), B = hx(b); const d = lum(A) <= lum(B) ? A : B; return lum(d) > 0.22 ? '#1d2633' : d; }
function erf(x) { const s = Math.sign(x); x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return s * y; }
const Phi = z => 0.5 * (1 + erf(z / Math.SQRT2));
const store = { get(k, d) { try { const v = localStorage.getItem('hw:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem('hw:' + k, JSON.stringify(v)); } catch { } } };
const API = L => ESPN.site + L.path, API2 = L => ESPN.v2 + L.path, WEB = L => ESPN.web + L.path;
const logoUrl = (L, abbr) => `https://a.espncdn.com/i/teamlogos/${L.key.startsWith('ncaa') ? 'ncaa' : L.path}/500/${String(abbr || '').toLowerCase()}.png`;
function seasonYear() { const now = new Date(); return now.getUTCMonth() >= 6 ? now.getUTCFullYear() + 1 : now.getUTCFullYear(); }

/* ---------- favorites (defaults from config, editable per viewer) ---------- */
const favs = {
  all() { const u = store.get('favs', null); if (u) return u; const o = {}; ORDER.forEach(k => o[k] = [...LEAGUES[k].favs]); return o; },
  has(lk, id) { return (this.all()[lk] || []).includes(String(id)); },
  toggle(lk, id) { const a = this.all(); a[lk] = a[lk] || []; id = String(id); a[lk] = a[lk].includes(id) ? a[lk].filter(x => x !== id) : [...a[lk], id]; store.set('favs', a); return a[lk].includes(id); },
  reset() { store.set('favs', null); }
};

/* ---------- parsing ---------- */
function parseTeamSide(x, L) {
  const t = x.team || {};
  const sc = x.score && typeof x.score === 'object' ? x.score.displayValue : x.score;
  const rank = x.curatedRank && x.curatedRank.current && x.curatedRank.current <= 25 ? x.curatedRank.current : null;
  return {
    id: String(t.id), abbr: t.abbreviation || t.shortDisplayName || '', name: t.displayName || t.name || '', short: t.shortDisplayName || t.name || t.displayName || '', loc: t.location || '',
    color: hx(t.color), alt: hx(t.alternateColor), logo: t.logo || (t.logos && t.logos[0] && t.logos[0].href) || logoUrl(L, t.abbreviation),
    score: sc != null && sc !== '' ? +sc : null, rank,
    rec: (x.records && x.records[0] && x.records[0].summary) || (x.record && x.record[0] && (x.record[0].displayValue || x.record[0].summary)) || '',
    winner: !!x.winner, lines: (x.linescores || []).map(l => l.displayValue ?? l.value), leaders: x.leaders || [], conf: t.conferenceId
  };
}
function tvOf(c) {
  const nat = [], loc = [];
  (c.geoBroadcasts || []).forEach(b => { const n = b.media && b.media.shortName; if (!n) return; ((b.market && b.market.type) === 'National' ? nat : loc).push(n); });
  (c.broadcasts || []).forEach(b => (b.names || []).forEach(n => (b.market === 'national' ? nat : loc).push(n)));
  const u = a => [...new Set(a)];
  return { national: u(nat), local: u(loc), label: u(nat).join(' · ') || u(loc).filter(n => !/League Pass/i.test(n)).slice(0, 2).join(' · ') || (u(loc).length ? u(loc)[0] : '') };
}
function parseEvent(e, L) {
  const c = e.competitions[0];
  const st = c.status || e.status || {}; const t = st.type || {};
  const comp = c.competitors || [];
  const home = parseTeamSide(comp.find(x => x.homeAway === 'home') || comp[0] || {}, L);
  const away = parseTeamSide(comp.find(x => x.homeAway === 'away') || comp[1] || {}, L);
  return {
    lk: L.key, id: String(e.id), date: e.date, state: t.state || 'pre', detail: t.shortDetail || t.detail || '', completed: !!t.completed,
    period: st.period || 0, clock: st.displayClock || '', home, away,
    venue: c.venue && c.venue.fullName, city: c.venue && c.venue.address && [c.venue.address.city, c.venue.address.state].filter(Boolean).join(', '),
    tv: tvOf(c), neutral: !!c.neutralSite, confGame: !!c.conferenceCompetition,
    note: (c.notes && c.notes[0] && c.notes[0].headline) || (e.season && e.season.slug === 'post-season' ? 'Postseason' : ''),
    headline: c.headlines && c.headlines[0] && (c.headlines[0].shortLinkText || c.headlines[0].description) || ''
  };
}
const isLive = g => g.state === 'in';
const isFav = g => favs.has(g.lk, g.home.id) || favs.has(g.lk, g.away.id);
const isRanked = g => g.home.rank || g.away.rank;
const order = g => g.state === 'in' ? 0 : g.state === 'pre' ? 1 : 2;
/* interest score: favorites, then ranked-vs-ranked, then ranked, then closeness later in the slate */
function interest(g) { let s = 0; if (isFav(g)) s += 100; if (g.home.rank && g.away.rank) s += 40 + (50 - g.home.rank - g.away.rank); else if (isRanked(g)) s += 20 + (26 - (g.home.rank || g.away.rank)) / 2; if (g.lk === 'nba') s += 10; if (g.tv.national.length) s += 5; return s; }

/* ---------- data access ---------- */
async function scoreboard(L, ymd, ttl) {
  const t = todayCT();
  const d = await j(`${API(L)}/scoreboard?dates=${compact(ymd)}${L.sbParams}`, ttl ?? (ymd === t ? 25000 : (ymd < t ? 3600000 : 300000)));
  return (d.events || []).map(e => parseEvent(e, L)).sort((a, b) => (order(a) - order(b)) || (new Date(a.date) - new Date(b.date)));
}
function statMap(stats) { const s = {}; (stats || []).forEach(x => { if (x.name) s[x.name] = x; if (x.type) s[x.type] = s[x.type] || x; if (x.displayName) s[x.displayName] = s[x.displayName] || x; if (x.abbreviation) s[x.abbreviation] = s[x.abbreviation] || x; }); return s; }
function parseStandingRow(en, L, grp) {
  const s = statMap(en.stats); const val = k => s[k] ? (s[k].value ?? parseFloat(s[k].displayValue)) : null; const dv = k => s[k] ? s[k].displayValue : '';
  const t = en.team || {};
  const w = val('wins') || 0, l = val('losses') || 0;
  return {
    id: String(t.id), abbr: t.abbreviation, name: t.displayName, short: t.shortDisplayName || t.name, loc: t.location,
    logo: (t.logos && t.logos[0] && t.logos[0].href) || logoUrl(L, t.abbreviation),
    w, l, pct: dv('winPercent') || (w + l ? (w / (w + l)).toFixed(3).replace(/^0/, '') : ''), gb: dv('gamesBehind'),
    home: dv('Home'), road: dv('Road') || dv('Away'), l10: dv('Last Ten Games'), strk: dv('streak'), conf: dv('vs. Conf.') || dv('vsConf'),
    diff: val('differential') ?? val('pointDifferential') ?? (val('avgPointsFor') != null && val('avgPointsAgainst') != null ? val('avgPointsFor') - val('avgPointsAgainst') : null),
    ppg: val('avgPointsFor'), opp: val('avgPointsAgainst'), seed: val('playoffSeed') || null,
    group: grp.name, groupAbbr: grp.abbr
  };
}
async function standings(L, season) {
  const url = `${API2(L)}/standings${season ? '?season=' + season : ''}${L.standingsMode === 'conferences' ? (season ? '&' : '?') + 'group=50&level=3' : ''}`;
  const d = await j(url, 600000);
  const groups = [], byId = {};
  const addGroup = (name, abbr, entries) => {
    const rows = (entries || []).map(en => parseStandingRow(en, L, { name, abbr })).sort((a, b) => (a.seed || 99) - (b.seed || 99) || (b.w - b.l) - (a.w - a.l) || (b.diff || 0) - (a.diff || 0));
    rows.forEach((r, i) => { r.pos = i + 1; byId[r.id] = r; });
    groups.push({ name, abbr, rows });
  };
  const walk = node => {
    if (!node) return;
    if (node.standings && node.standings.entries && node.standings.entries.length) addGroup(node.name || L.label, node.abbreviation || node.name || L.short, node.standings.entries);
    (node.children || []).forEach(walk);
  };
  walk(d);
  if (!groups.length && d.standings) addGroup(L.label, L.short, d.standings.entries);
  return { groups, byId, season: d.seasonDisplayName || '' };
}
async function priorStandings(L) { try { return await standings(L, seasonYear() - 1); } catch { return null; } }
async function rankings(L) { if (!L.hasRankings) return null; const d = await jSoft(`${API(L)}/rankings`, 1800000); if (!d || !d.rankings) return null; const ap = d.rankings.find(r => /AP/i.test(r.name)) || d.rankings[0]; return { name: ap.name, week: ap.headline || ap.shortHeadline || '', ranks: (ap.ranks || []).map(r => ({ rank: r.current, prev: r.previous, trend: r.trend, team: (() => { const t = r.team || {}; const loc = t.location || t.nickname || t.name || ''; const mascot = t.name && t.name !== loc ? t.name : ''; return { id: String(t.id), name: mascot ? `${loc} ${mascot}` : loc, short: t.nickname || loc, abbr: t.abbreviation, logo: t.logos && t.logos[0] && t.logos[0].href }; })(), rec: r.recordSummary, pts: r.points, first: r.firstPlaceVotes })) }; }
async function ratings(L) { return jSoft(`data/${L.key}/ratings.json?d=${todayCT()}`, 900000); }
async function record(L) { return jSoft(`data/${L.key}/record.json?d=${todayCT()}`, 900000); }
async function params(L) { return jSoft(`data/${L.key}/params.json?d=${todayCT()}`, 900000); }
async function aiRecord() { return jSoft(`ai/record.json?d=${todayCT()}`, 900000); }
async function aiFor(ymd) { return jSoft(`ai/${ymd}.json?d=${ymd}`, 600000); }
function aiEntry(doc, g) { if (!doc || !doc.games) return null; const e = doc.games[`${g.lk}:${g.id}`] || doc.games[g.id]; if (!e) return null; return { ...e, generatedLabel: doc.generated ? new Date(doc.generated).toLocaleString('en-US', { timeZone: TZ, weekday: 'short', hour: 'numeric', minute: '2-digit' }) + ' CT' : null }; }
async function injuries(L) { if (!L.hasInjuries) return null; const d = await jSoft(`${API(L)}/injuries`, 600000); if (!d || !d.injuries) return null; const byTeam = {}; d.injuries.forEach(t => { const id = String(t.id || (t.injuries && t.injuries[0] && t.injuries[0].athlete && t.injuries[0].athlete.team && t.injuries[0].athlete.team.id) || ''); byTeam[id] = { name: t.displayName, list: t.injuries || [] }; }); return { teams: d.injuries, byTeam }; }

/* ---------- forecast model ----------
   Ratings come from data/<league>/ratings.json (margin-based Elo, rebuilt nightly by tools/nightly.mjs).
   Fallback when that file is missing: this season's point margin blended with last season's.
   Projected margin = rating gap + home court + rest + star-out adjustment (+ form in fallback).
   Win probability = normal CDF of margin / league SD; in-game it updates from score and time left. */
function strengthFallback(id, cur, prior) {
  const r = cur && cur.byId[id]; const p = prior && prior.byId[id];
  const gp = r ? r.w + r.l : 0; const curDiff = r && r.diff != null ? r.diff : 0; const priorDiff = p && p.diff != null ? p.diff * 0.65 : 0;
  const w = gp / (gp + 10);
  const l10 = r && r.l10 && /^(\d+)-(\d+)$/.test(r.l10) ? r.l10.split('-').map(Number) : null;
  const form = l10 && (l10[0] + l10[1]) >= 5 ? ((l10[0] / (l10[0] + l10[1])) - 0.5) * 3 : 0;
  return { rating: w * curDiff + (1 - w) * priorDiff, gp, weight: w, form, source: 'margin' };
}
function strength(L, id, ctx) {
  const R = ctx.ratings && ctx.ratings.teams && ctx.ratings.teams[id];
  if (R && R.elo != null) return { rating: (R.elo - 1500) / L.eloPerPoint, gp: R.gp || 0, weight: 1, form: 0, source: 'elo', elo: R.elo };
  return strengthFallback(id, ctx.cur, ctx.prior);
}
/* players ruled out, weighted by their scoring: about 0.18 points of margin per point per game, capped at 8.
   (The nightly record is scored without this, since injury reports aren't kept historically.) */
function starOut(L, side, ctx) {
  if (!ctx.inj || !ctx.inj.byTeam[side.id]) return null;
  const out = ctx.inj.byTeam[side.id].list.filter(x => /out|suspen/i.test(x.status || ''));
  if (!out.length) return null;
  const ppgOf = n => { const r = ctx.ppg && ctx.ppg[(n || '').toLowerCase()]; return r && r.teamId === side.id ? r.pts : null; };
  const L1 = (side.leaders || []).find(l => /points/i.test(l.name)); const top = L1 && L1.leaders && L1.leaders[0];
  let total = 0; const names = [];
  out.forEach(x => { const n = x.athlete && x.athlete.displayName; if (!n) return; let ppg = ppgOf(n); if (ppg == null && top && top.athlete && top.athlete.displayName === n) ppg = parseFloat(top.displayValue) || 20; if (ppg != null && ppg >= 6) { total += ppg * 0.18; names.push(n.split(' ').pop()); } });
  if (!names.length) return null;
  return { name: names.join(', '), names, pts: -Math.min(8, total) };
}
/* tuned parameters (data/<league>/params.json, refit nightly) override the config defaults */
const paramsOf = (L, ctx) => { const P = ctx && ctx.params; return { hca: P && P.hca != null ? P.hca : L.hca, b2b: P && P.b2b != null ? P.b2b : L.b2b, sd: P && P.sd != null ? P.sd : L.sd, calib: P && P.calib ? P.calib : null }; };
const logit = p => Math.log(p / (1 - p)), sigm = z => 1 / (1 + Math.exp(-z));
const calibrate = (p, c) => { if (!c || !isFinite(c.a) || !isFinite(c.b)) return p; const q = Math.min(.995, Math.max(.005, p)); return sigm(c.a * logit(q) + c.b); };
function forecast(L, g, ctx) {
  const H = strength(L, g.home.id, ctx), A = strength(L, g.away.id, ctx);
  const P = paramsOf(L, ctx);
  const hca = g.neutral ? 0 : P.hca;
  const restH = ctx.b2b && ctx.b2b.has(g.home.id) ? -P.b2b : 0, restA = ctx.b2b && ctx.b2b.has(g.away.id) ? -P.b2b : 0;
  const soH = starOut(L, g.home, ctx), soA = starOut(L, g.away, ctx);
  const inj = (soH ? soH.pts : 0) - (soA ? soA.pts : 0);
  const margin = (H.rating - A.rating) + hca + (restH - restA) + (H.form - A.form) + inj;
  let p = calibrate(Phi(margin / P.sd), P.calib), live = false;
  if (g.state === 'in' && g.home.score != null && g.away.score != null) {
    const per = g.period || 1; const [mm, ss] = String(g.clock || '0:00').split(':').map(Number);
    const left = isFinite(mm) ? (mm + (ss || 0) / 60) : 0;
    const regPeriods = L.minutes === 48 ? 4 : 2, perLen = L.minutes / regPeriods;
    const rem = per <= regPeriods ? (regPeriods - per) * perLen + left : left;
    const frac = Math.max(rem, 0) / L.minutes;
    const lead = g.home.score - g.away.score;
    const sd = (P.sd + 2) * Math.sqrt(frac) + 1.5;
    p = Phi((lead + margin * frac) / sd); live = true;
  }   // finals keep the pregame estimate so cards can show hit/miss
  return { pHome: p, margin, live, H, A, hca, restH, restA, soH, soA, source: H.source === 'elo' && A.source === 'elo' ? 'elo' : 'margin' };
}
const ctxCache = new Map();
async function forecastCtx(L, ymd) {
  const k = L.key + ymd; const hit = ctxCache.get(k); if (hit && Date.now() - hit.t < 300000) return hit.v;
  const [rt, cur, yday, inj, lp, params] = await Promise.all([ratings(L), standings(L).catch(() => null), scoreboard(L, addDays(ymd, -1)).catch(() => []), injuries(L), L.hasInjuries ? leaguePlayers(L).catch(() => null) : null, jSoft(`data/${L.key}/params.json?d=${todayCT()}`, 900000)]);
  const prior = rt ? null : await priorStandings(L);
  const b2b = new Set(); yday.forEach(g => { if (g.state !== 'pre') { b2b.add(g.home.id); b2b.add(g.away.id); } });
  const ppg = {}; if (lp) lp.rows.forEach(r => { ppg[(r.name || '').toLowerCase()] = { pts: r.pts, teamId: r.teamId }; });
  const v = { ratings: rt, cur, prior, b2b, inj, ppg, params };
  ctxCache.set(k, { t: Date.now(), v }); return v;
}

/* ---------- league player list ---------- */
async function leaguePlayers(L, season) {
  const base = `${WEB(L)}/statistics/byathlete?region=us&lang=en&contentorigin=espn&isqualified=false&limit=100&sort=offensive.avgPoints:desc${season ? `&season=${season}&seasontype=2` : ''}`;
  const first = await j(base + '&page=1', 600000);
  const pages = Math.min((first.pagination && first.pagination.pages) || 1, L.key.startsWith('ncaa') ? 8 : 10);
  const rest = await Promise.all(Array.from({ length: pages - 1 }, (_, i) => jSoft(base + '&page=' + (i + 2), 600000)));
  const idx = {}; (first.categories || []).forEach(c => { idx[c.name] = c.names || []; });
  const rows = [];
  [first, ...rest].filter(Boolean).forEach(pg => (pg.athletes || []).forEach(a => {
    const v = {}; (a.categories || []).forEach(c => (idx[c.name] || []).forEach((n, i) => { if (!(n in v)) v[n] = c.values ? c.values[i] : parseFloat(c.totals && c.totals[i]); }));
    const at = a.athlete || {};
    const pts = v.avgPoints || 0, fga = v.avgFieldGoalsAttempted || 0, fta = v.avgFreeThrowsAttempted || 0;
    rows.push({ id: String(at.id), name: at.displayName, short: at.shortName, team: at.teamShortName || at.teamName || '', teamId: String(at.teamId || ''), pos: at.position && at.position.abbreviation || '', img: at.headshot && at.headshot.href,
      gp: v.gamesPlayed || 0, min: v.avgMinutes || 0, pts, reb: v.avgRebounds || 0, ast: v.avgAssists || 0, stl: v.avgSteals || 0, blk: v.avgBlocks || 0, tov: v.avgTurnovers || 0,
      fg: v.fieldGoalPct || 0, tp: v.threePointFieldGoalPct || 0, ft: v.freeThrowPct || 0, tpm: v.avgThreePointFieldGoalsMade || 0, ts: (fga + 0.44 * fta) > 0 ? pts / (2 * (fga + 0.44 * fta)) * 100 : 0 });
  }));
  const label = (first.requestedSeason && (first.requestedSeason.displayName || first.requestedSeason.year)) || (first.currentSeason && first.currentSeason.displayName) || '';
  return { rows, label };
}

/* ---------- shared state ---------- */
const S = { today: {}, todayYmd: null, lastOk: 0, err: false, timer: null, route: null, open: new Set(), prevScores: {}, league: 'nba' };
ORDER.forEach(k => S.today[k] = []);
const allToday = () => ORDER.flatMap(k => S.today[k]);

Object.assign(HW, { esc, j, jSoft, cache, todayCT, addDays, compact, expand, ymdOf, dayLabel, relDay, tip, dateShort, timeCT, ago, pct, sign, ordinal, hx, darkOf, Phi, store, API, API2, WEB, logoUrl, seasonYear, favs,
  parseEvent, isLive, isFav, isRanked, order, interest, scoreboard, standings, priorStandings, rankings, ratings, record, params, aiRecord, aiFor, aiEntry, injuries, forecast, forecastCtx, leaguePlayers, S, allToday });
})();
