// Tipoff nightly jobs. Runs in GitHub Actions (Node 20+).
//   node tools/nightly.mjs ratings   → data/<league>/{ratings,record,state}.json (margin Elo + forecast record vs ESPN BPI)
//   node tools/nightly.mjs tune      → data/<league>/params.json (re-fits home court, rest, spread, rating speed and a calibration layer
//                                      by replaying the season; the ratings are rebuilt with the winning mix)
//   node tools/nightly.mjs teamstats → data/<league>/teamstats.json (four factors, pace, offensive/defensive rating, ranks; NBA and WNBA)
//   node tools/nightly.mjs schedule  → data/<league>/schedule.json (every game of the season, compact: results so far and what's left,
//                                      for the season simulation in RIVL; NBA and WNBA)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
const { LEAGUES, ORDER, ESPN, TZ } = createRequire(import.meta.url)('../js/config.js');

const mode = process.env.MODE || process.argv[2] || 'ratings';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(u, tries = 2) { for (let i = 0; ; i++) { try { const r = await fetch(u, { headers: { 'user-agent': 'tipoff-nightly' } }); if (!r.ok) throw new Error(u + ' ' + r.status); return await r.json(); } catch (e) { if (i >= tries) throw e; await sleep(800 * (i + 1)); } } }
const soft = async u => { try { return await get(u); } catch (e) { console.log('fetch failed:', e.message); return null; } };
const ymdFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const todayCT = () => { const d = new Date(); const h = +new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hour12: false }).format(d) % 24; const y = ymdFmt.format(d); return h < 4 ? addDays(y, -1) : y; };
const addDays = (ymd, n) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const compact = s => s.replace(/-/g, '');
const erf = x => { const s = Math.sign(x); x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x); return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)); };
const Phi = z => 0.5 * (1 + erf(z / Math.SQRT2));
const API = L => ESPN.site + L.path, API2 = L => ESPN.v2 + L.path;
const readJson = (p, d) => existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : d;
const writeJson = (p, v) => { mkdirSync(p.split('/').slice(0, -1).join('/'), { recursive: true }); writeFileSync(p, JSON.stringify(v)); };

/* ---------- parsing (mirrors js/core.js, trimmed) ---------- */
function side(x) { const t = x.team || {}; const r = x.curatedRank && x.curatedRank.current; return { id: String(t.id), abbr: t.abbreviation || '', name: t.displayName || '', short: t.shortDisplayName || t.name || '', score: x.score != null && x.score !== '' ? +x.score : null, rank: r && r <= 25 ? r : null, rec: x.records && x.records[0] && x.records[0].summary || '', leaders: (x.leaders || []).map(l => ({ name: l.name, who: l.leaders && l.leaders[0] && l.leaders[0].athlete && l.leaders[0].athlete.displayName, val: l.leaders && l.leaders[0] && l.leaders[0].displayValue })) }; }
function parseEvent(e) { const c = e.competitions[0]; const st = (c.status || e.status || {}).type || {}; const comp = c.competitors || []; return { id: String(e.id), date: e.date, name: e.name, state: st.state, detail: st.shortDetail, home: side(comp.find(x => x.homeAway === 'home') || comp[0] || {}), away: side(comp.find(x => x.homeAway === 'away') || comp[1] || {}), neutral: !!c.neutralSite, venue: c.venue && c.venue.fullName, tv: (c.broadcasts || []).flatMap(b => b.names || []).join(', '), note: c.notes && c.notes[0] && c.notes[0].headline || '' }; }
async function scoreboard(L, ymd) { const d = await get(`${API(L)}/scoreboard?dates=${compact(ymd)}${L.sbParams}`); return (d.events || []).map(parseEvent); }
/* football and baseball standings carry season totals; the model works in per-game terms */
function perGame(L, val, v, always = false) { if (val == null || !(L.diffIsTotal || always)) return val; const gp = (v('wins') || 0) + (v('losses') || 0) + (v('ties') || 0) || v('gamesPlayed'); return gp ? +(val / gp).toFixed(2) : val; }
/* the year ESPN labels a league's current season with (end year for seasons that span New Year) */
function seasonLabel(L) { const y = +L.seasonStart.slice(0, 4), m = +L.seasonStart.slice(5, 7); return m >= 7 && L.sport === 'basketball' ? y + 1 : y; }
function statMap(stats) { const s = {}; (stats || []).forEach(x => { if (x.name) s[x.name] = x; if (x.displayName) s[x.displayName] = s[x.displayName] || x; }); return s; }
async function standings(L, season) {
  const d = await soft(`${API2(L)}/standings${season ? '?season=' + season : ''}${L.standingsMode === 'conferences' ? (season ? '&' : '?') + `group=${L.standingsGroup || 50}&level=3` : ''}`);
  const rows = {}; const walk = (node, grp) => { if (!node) return; if (node.standings && node.standings.entries) node.standings.entries.forEach(en => { const s = statMap(en.stats); const v = k => s[k] ? (s[k].value ?? parseFloat(s[k].displayValue)) : null; const dv = k => s[k] ? s[k].displayValue : ''; const t = en.team; rows[String(t.id)] = { id: String(t.id), abbr: t.abbreviation, name: t.displayName, short: t.shortDisplayName || t.name, group: node.name || grp, w: v('wins') || 0, l: v('losses') || 0, t: v('ties') || 0, diff: perGame(L, v('differential') ?? v('pointDifferential') ?? ((v('avgPointsFor') != null && v('avgPointsAgainst') != null) ? v('avgPointsFor') - v('avgPointsAgainst') : null), v), ppg: v('avgPointsFor') ?? perGame(L, v('pointsFor'), v, true), opp: v('avgPointsAgainst') ?? perGame(L, v('pointsAgainst'), v, true), streak: dv('streak'), l10: dv('Last Ten Games'), home: dv('Home'), road: dv('Road'), conf: dv('vs. Conf.') }; }); (node.children || []).forEach(c => walk(c, node.name)); }; walk(d, L.label);
  return rows;
}
async function rankings(L) { if (!L.hasRankings) return {}; const d = await soft(`${API(L)}/rankings`); const ap = d && d.rankings && (d.rankings.find(r => /AP/i.test(r.name)) || d.rankings[0]); const m = {}; (ap && ap.ranks || []).forEach(r => m[String(r.team.id)] = r.current); return m; }

/* ---------- tuned parameters ---------- */
const DEFAULTS = L => ({ hca: L.hca, b2b: L.b2b, sd: L.sd, k: L.k });
function paramsOf(L) { const P = readJson(`data/${L.key}/params.json`, null); const D = DEFAULTS(L); return P ? { hca: P.hca ?? D.hca, b2b: P.b2b ?? D.b2b, sd: P.sd ?? D.sd, k: P.k ?? D.k, calib: P.calib || null } : { ...D, calib: null }; }
const logit = p => Math.log(p / (1 - p)), sigm = z => 1 / (1 + Math.exp(-z));
const calibrate = (p, c) => { if (!c) return p; const q = Math.min(.995, Math.max(.005, p)); return sigm(c.a * logit(q) + c.b); };

/* ---------- Elo ---------- */
const POWER = /\b(ACC|Big 12|Big Ten|SEC|Big East|Southeastern|Atlantic Coast)\b/i, MID = /\b(American|Mountain West|Atlantic 10|West Coast|Missouri Valley|Conference USA|Sun Belt|MAC|Mid-American|WAC|Ivy|Big West|Horizon|CAA|Coastal)\b/i;
async function initElo(L) {
  const elo = {};
  if (L.standingsMode === 'conferences') {
    const [cur, rk] = await Promise.all([standings(L), rankings(L)]);
    for (const r of Object.values(cur)) { const base = POWER.test(r.group) ? 1700 : MID.test(r.group) ? 1520 : 1380; const boost = rk[r.id] ? 400 + (25 - rk[r.id]) * 6 : 0; elo[r.id] = { elo: Math.max(base, 1500 + boost), gp: 0, name: r.name, short: r.short, abbr: r.abbr, prior: rk[r.id] ? `preseason #${rk[r.id]}` : r.group }; }
  } else {
    const prev = await standings(L, seasonLabel(L) - 1);
    for (const r of Object.values(prev)) elo[r.id] = { elo: 1500 + (r.diff || 0) * 0.65 * L.eloPerPoint, gp: 0, name: r.name, short: r.short, abbr: r.abbr, prior: `last season ${r.diff > 0 ? '+' : ''}${(r.diff || 0).toFixed(1)}` };
  }
  return elo;
}
function pregame(L, st, g, b2b, P = paramsOf(L)) {
  const H = st.elo[g.home.id] || { elo: 1500 }, A = st.elo[g.away.id] || { elo: 1500 };
  const hca = g.neutral ? 0 : P.hca;
  const rest = (b2b.has(g.home.id) ? -P.b2b : 0) - (b2b.has(g.away.id) ? -P.b2b : 0);
  const margin = (H.elo - A.elo) / L.eloPerPoint + hca + rest;
  return { p: calibrate(Phi(margin / P.sd), P.calib), raw: Phi(margin / P.sd), margin };
}
function update(L, st, g, P = paramsOf(L)) {
  const ensure = s => st.elo[s.id] = st.elo[s.id] || { elo: 1500, gp: 0, name: s.name, short: s.short, abbr: s.abbr, prior: 'unrated' };
  const H = ensure(g.home), A = ensure(g.away);
  H.name = g.home.name || H.name; A.name = g.away.name || A.name; H.abbr = g.home.abbr || H.abbr; A.abbr = g.away.abbr || A.abbr; H.short = g.home.short || H.short; A.short = g.away.short || A.short;
  const hcaElo = (g.neutral ? 0 : P.hca) * L.eloPerPoint;
  const eH = 1 / (1 + 10 ** (-((H.elo + hcaElo) - A.elo) / 400));
  const margin = g.home.score - g.away.score; const aH = margin > 0 ? 1 : 0;
  const winnerDiff = margin > 0 ? (H.elo + hcaElo - A.elo) : (A.elo - H.elo - hcaElo);
  const mov = Math.log(Math.abs(margin) + 1) * (2.2 / (winnerDiff * 0.001 + 2.2));
  const early = L.sport === 'football' ? 4 : L.sport === 'baseball' ? 30 : 10;
  const k = P.k * (H.gp < early || A.gp < early ? 1.4 : 1);   // settle faster early in the season
  const delta = k * mov * (aH - eH);
  H.elo += delta; A.elo -= delta; H.gp++; A.gp++;
}

async function runRatings() {
  const today = todayCT(), yday = addDays(today, -1);
  for (const lk of ORDER) {
    const L = LEAGUES[lk];
    if (yday < L.seasonStart) { console.log(lk, 'season not started'); continue; }
    const sp = `data/${lk}/state.json`;
    let st = readJson(sp, null);
    if (!st || st.season !== L.seasonStart) { const init = await initElo(L); st = { season: L.seasonStart, elo: init, init: JSON.parse(JSON.stringify(init)), processed: {}, lastDate: addDays(L.seasonStart, -1), record: [], history: {} }; console.log(lk, 'initialized', Object.keys(st.elo).length, 'teams'); }
    if (!st.init) { try { st.init = await initElo(L); } catch { } }   // older state files: keep the season's starting ratings for replays
    st.history = st.history || {};
    const P = paramsOf(L);
    let from = addDays(st.lastDate, -1); if (from < addDays(L.seasonStart, -1)) from = addDays(L.seasonStart, -1);
    let prev = new Set(); try { prev = new Set((await scoreboard(L, addDays(from, -1))).filter(g => g.state === 'post').flatMap(g => [g.home.id, g.away.id])); } catch { }
    let n = 0, espnN = 0;
    for (let d = from; d <= yday; d = addDays(d, 1)) {
      let games; try { games = await scoreboard(L, d); } catch (e) { console.log(lk, d, 'scoreboard failed', e.message); break; }
      const finals = games.filter(g => g.state === 'post' && g.home.score != null && g.away.score != null && !st.processed[g.id] && !/all-star|pro bowl|exhibition/i.test(g.name || ''));
      // pregame forecasts for the whole day first (ratings as they stood that morning), then update
      const pre = finals.map(g => ({ g, f: pregame(L, st, g, prev, P) }));
      let budget = d < addDays(yday, -45) ? 0 : L.standingsMode === 'conferences' ? 60 : 40;   // deep backfills (a league added mid-season) skip ESPN's pregame numbers
      for (const { g, f } of pre) {
        let ep = null, line = null;
        if (budget > 0) { budget--; const s = await soft(`${API(L)}/summary?event=${g.id}`); // after a final, ESPN drops `predictor` but keeps the win-probability trace; its first point is the pregame number
          const gp = s && s.predictor && s.predictor.homeTeam && s.predictor.homeTeam.gameProjection;
          const wp0 = s && Array.isArray(s.winprobability) && s.winprobability.length ? s.winprobability[0].homeWinPercentage : null;
          if (gp != null && gp !== '') { ep = parseFloat(gp) / 100; espnN++; } else if (wp0 != null) { ep = +wp0; espnN++; }
          const pc = s && Array.isArray(s.pickcenter) && s.pickcenter[0]; if (pc && pc.details) line = pc.details;
          await sleep(120); }
        st.record.push({ id: g.id, date: d, h: g.home.abbr, a: g.away.abbr, hid: g.home.id, aid: g.away.id, hs: g.home.score, as: g.away.score, p: +f.p.toFixed(4), ep: ep != null ? +ep.toFixed(4) : null, line, n: g.neutral ? 1 : 0, rh: prev.has(g.home.id) ? 1 : 0, ra: prev.has(g.away.id) ? 1 : 0 });
        update(L, st, g, P); st.processed[g.id] = 1; n++;
      }
      prev = new Set(games.filter(g => g.state !== 'pre').flatMap(g => [g.home.id, g.away.id]));
      if (games.every(g => g.state === 'post') || d < yday) st.lastDate = d;
      await sleep(150);
    }
    if (st.record.length > 8000) st.record = st.record.slice(-8000);
    writeJson(sp, st);
    writeRatings(L, st);
    writeJson(`data/${lk}/record.json`, { generated: new Date().toISOString(), games: st.record });
    console.log(lk, `+${n} games (${espnN} with ESPN BPI), ${st.record.length} on record, through ${st.lastDate}`);
  }
}

function writeRatings(L, st) {
  const lk = L.key, today = todayCT();
  // nightly snapshot of every rating, kept for 14 days, for the 7-day movers
  const snap = {}; Object.entries(st.elo).forEach(([id, v]) => snap[id] = Math.round(v.elo));
  st.history = st.history || {}; st.history[today] = snap;
  Object.keys(st.history).filter(d => d < addDays(today, -14)).forEach(d => delete st.history[d]);
  const back = Object.keys(st.history).filter(d => d <= addDays(today, -7)).sort().pop() || Object.keys(st.history).sort()[0];
  const old = back && back !== today ? st.history[back] : null;
  // teams that never appeared in standings and barely played (All-Star squads) stay out of the published ratings
  const teams = {}; Object.entries(st.elo).filter(([, v]) => !(v.prior === 'unrated' && v.gp <= 2)).forEach(([id, v]) => teams[id] = { elo: Math.round(v.elo * 10) / 10, gp: v.gp, name: v.name, short: v.short, abbr: v.abbr, prior: v.prior, d7: old && old[id] != null ? Math.round(v.elo - old[id]) : null });
  const P = paramsOf(L);
  writeJson(`data/${lk}/ratings.json`, { generated: new Date().toISOString(), season: L.seasonStart, teams, since: back && back !== today ? back : null, params: { hca: P.hca, b2b: P.b2b, sd: P.sd, k: P.k, eloPerPoint: L.eloPerPoint } });
  writeJson(`data/${lk}/record.json`, { generated: new Date().toISOString(), games: st.record });
}

/* ---------- self-tuning: replay the season under candidate parameters ---------- */
function replay(L, init, games, P) {
  const st = { elo: {} }; Object.entries(init).forEach(([id, v]) => st.elo[id] = { elo: v.elo, gp: 0, name: v.name, abbr: v.abbr, short: v.short });
  const played = {}; const out = [];
  let i = 0;
  while (i < games.length) {
    const d = games[i].date; const day = []; while (i < games.length && games[i].date === d) day.push(games[i++]);
    const prev = new Set(Object.keys(played).filter(id => played[id] === addDays(d, -1)));
    const fs = day.map(g => pregame(L, st, g, prev, { ...P, calib: null }));
    day.forEach((g, j) => { out.push({ p: fs[j].p, y: g.hs > g.as ? 1 : 0 }); update(L, st, g, P); played[g.hid] = d; played[g.aid] = d; });
  }
  return { st, out, brier: out.reduce((s, x) => s + (x.y - x.p) ** 2, 0) / Math.max(1, out.length) };
}
function fitCalib(out) {   // logistic fit of outcome on logit(p): a (slope) and b (intercept); a=1,b=0 is "already calibrated"
  let a = 1, b = 0;
  const X = out.map(x => logit(Math.min(.995, Math.max(.005, x.p))));
  for (let it = 0; it < 30; it++) {
    let g0 = 0, g1 = 0, h00 = 0, h01 = 0, h11 = 0;
    out.forEach((x, k) => { const q = sigm(a * X[k] + b); const e = x.y - q; g0 += e * X[k]; g1 += e; const w = q * (1 - q); h00 += w * X[k] * X[k]; h01 += w * X[k]; h11 += w; });
    const lam = 2; g0 -= lam * (a - 1); g1 -= lam * b; h00 += lam; h11 += lam;   // mild ridge toward (1,0)
    const det = h00 * h11 - h01 * h01; if (!det) break;
    const da = (g0 * h11 - g1 * h01) / det, db = (g1 * h00 - g0 * h01) / det;
    a += da; b += db; if (Math.abs(da) + Math.abs(db) < 1e-6) break;
  }
  return { a: +Math.min(1.6, Math.max(.6, a)).toFixed(3), b: +Math.min(.5, Math.max(-.5, b)).toFixed(3) };
}
async function runTune() {
  const today = todayCT();
  for (const lk of ORDER) {
    const L = LEAGUES[lk];
    const st = readJson(`data/${lk}/state.json`, null); if (!st || !st.init || !st.record || !st.record.length) { console.log(lk, 'nothing to tune'); continue; }
    const games = st.record.map(g => ({ id: g.id, date: g.date, hid: g.hid, aid: g.aid, hs: g.hs, as: g.as, neutral: !!g.n, home: { id: g.hid, abbr: g.h, name: g.h }, away: { id: g.aid, abbr: g.a, name: g.a } })).sort((a, b) => a.date.localeCompare(b.date));
    // the replay has to score games in order with the scores on them; mimic parseEvent shape for pregame/update
    games.forEach(g => { g.home.score = g.hs; g.away.score = g.as; });
    const prevP = readJson(`data/${lk}/params.json`, null);
    const D = DEFAULTS(L); const cur = { hca: prevP ? prevP.hca : D.hca, b2b: prevP ? prevP.b2b : D.b2b, sd: prevP ? prevP.sd : D.sd, k: prevP ? prevP.k : D.k };
    const n = games.length; const minN = L.tuneAt || (lk === 'nba' ? 60 : lk === 'wnba' ? 40 : 150);
    const hist = (prevP && prevP.history) || [];
    if (n < minN) { const out = { ...cur, calib: prevP ? prevP.calib || null : null, tunedAt: new Date().toISOString(), n, tuneAt: minN, note: `waiting for ${minN} games before tuning`, history: hist }; writeJson(`data/${lk}/params.json`, out); console.log(lk, `${n} games, tuning starts at ${minN}`); continue; }
    const base = replay(L, st.init, games, cur).brier;
    const bb = L.sport === 'baseball';
    const steps = { hca: bb ? [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.7, 0.9] : [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5], b2b: L.sport === 'basketball' ? [0, 0.5, 1, 1.5, 2, 2.5] : [0], sd: (bb ? [0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3].map(m => +(L.sd * m).toFixed(1)) : [L.sd - 3, L.sd - 2, L.sd - 1, L.sd, L.sd + 1, L.sd + 2, L.sd + 3]), k: [D.k * 0.6, D.k * 0.8, D.k, D.k * 1.25, D.k * 1.5].map(v => Math.max(1, Math.round(v))) };
    let best = { P: cur, brier: base };
    for (const hca of steps.hca) for (const b2b of steps.b2b) for (const k of steps.k) {
      const r = replay(L, st.init, games, { hca, b2b, sd: cur.sd, k });
      if (r.brier < best.brier - 1e-6) best = { P: { hca, b2b, sd: cur.sd, k }, brier: r.brier };
    }
    for (const sd of steps.sd) { const r = replay(L, st.init, games, { ...best.P, sd }); if (r.brier < best.brier - 1e-6) best = { P: { ...best.P, sd }, brier: r.brier }; }
    // learn gradually: move part of the way toward the best mix, more as the sample grows; cap the move per night
    const w = Math.min(1, n / (minN * 6));
    const stepTo = (from, to, cap, dp) => +Math.max(from - cap, Math.min(from + cap, from + (to - from) * w)).toFixed(dp);
    const next = { hca: stepTo(cur.hca, best.P.hca, bb ? 0.1 : 0.5, bb ? 2 : 1), b2b: stepTo(cur.b2b, best.P.b2b, 0.5, 1), sd: stepTo(cur.sd, best.P.sd, bb ? 0.3 : 1, 1), k: Math.round(stepTo(cur.k, best.P.k, bb ? 1 : 4, 0)) };
    const final = replay(L, st.init, games, next);
    const calib = n >= minN * 2 ? fitCalib(final.out) : null;
    const brierCal = calib ? final.out.reduce((s, x) => s + (x.y - calibrate(x.p, calib)) ** 2, 0) / final.out.length : final.brier;
    // rebuild the live ratings with the mix we are going to use from now on
    Object.entries(final.st.elo).forEach(([id, v]) => { if (st.elo[id]) { st.elo[id].elo = v.elo; } });
    const changed = next.hca !== cur.hca || next.b2b !== cur.b2b || next.sd !== cur.sd || next.k !== cur.k;
    hist.push({ date: today, hca: next.hca, b2b: next.b2b, sd: next.sd, k: next.k, calib, brier: +brierCal.toFixed(4), base: +base.toFixed(4), n });
    writeJson(`data/${lk}/params.json`, { ...next, calib, tunedAt: new Date().toISOString(), n, tuneAt: minN, brier: +brierCal.toFixed(4), best: { ...best.P, brier: +best.brier.toFixed(4) }, history: hist.slice(-60) });
    writeJson(`data/${lk}/state.json`, st);
    writeRatings(L, st);
    console.log(lk, `${n} games · Brier ${base.toFixed(4)} → ${brierCal.toFixed(4)} · hca ${cur.hca}→${next.hca} b2b ${cur.b2b}→${next.b2b} sd ${cur.sd}→${next.sd} k ${cur.k}→${next.k}${calib ? ` calib a=${calib.a} b=${calib.b}` : ''}${changed ? '' : ' (no change)'}`);
  }
}

/* ---------- the season schedule, compact, for the playoff-odds simulation ---------- */
const SEASON_END = { nba: '-04-20', wnba: '-09-20' };
function compactEvent(e) {
  const c = e.competitions && e.competitions[0]; if (!c) return null;
  const home = (c.competitors || []).find(x => x.homeAway === 'home'), away = (c.competitors || []).find(x => x.homeAway === 'away');
  if (!home || !away || !home.team || !away.team) return null;
  const st = (c.status || e.status || {}).type || {}; const sc = x => x.score != null && x.score !== '' ? +(typeof x.score === 'object' ? x.score.displayValue : x.score) : null;
  const note = c.notes && c.notes[0] && c.notes[0].headline || '';
  return { id: String(e.id), d: e.date ? ymdFmt.format(new Date(e.date)) : '' /* the game's date in Central time, as RIVL counts days */, h: String(home.team.id), a: String(away.team.id), hs: sc(home), as: sc(away), st: st.state || 'pre', n: c.neutralSite ? 1 : 0, t: e.season && e.season.type != null ? +e.season.type : 2, x: /championship/i.test(note) && /cup|tournament/i.test(note) ? 1 : 0 };
}
async function runSchedule() {
  for (const lk of Object.keys(SEASON_END)) {
    const L = LEAGUES[lk]; if (!L) continue;
    const y = +L.seasonStart.slice(0, 4); const end = (lk === 'nba' ? y + 1 : y) + SEASON_END[lk];
    if (todayCT() < addDays(L.seasonStart, -7)) { console.log(lk, 'season not yet scheduled'); continue; }
    const params = (L.sbParams || '').replace(/&limit=\d+/, '');
    const span = async (a, b, lim) => { const d = await soft(`${API(L)}/scoreboard?dates=${compact(a)}-${compact(b)}${params}&limit=${lim}`); return d && Array.isArray(d.events) ? d.events : null; };
    // last night's copy: finished games older than three days are kept as they are, everything from there on is read again
    const prev = readJson(`data/${lk}/schedule.json`, null); const keepBefore = addDays(todayCT(), -3);
    const games = []; const seen = new Set();
    if (prev && prev.season === L.seasonStart) (prev.games || []).forEach(g => { if (g.st === 'post' && g.hs != null && g.as != null && g.d < keepBefore) { seen.add(g.id); games.push(g); } });   // a postponed game is filed as post with no score: never keep it, it comes back on its new date
    let d = games.length ? keepBefore : L.seasonStart; if (d < addDays(todayCT(), -200)) d = addDays(todayCT(), -200);
    let got = 0, missed = 0, calls = 0;
    const take = evs => evs.forEach(e => { const g = compactEvent(e); if (g && !seen.has(g.id)) { seen.add(g.id); games.push(g); got++; } });
    while (d <= end) {
      const [yy, mm] = d.split('-').map(Number); const last = `${d.slice(0, 7)}-${String(new Date(Date.UTC(yy, mm, 0)).getUTCDate()).padStart(2, '0')}`; const b = last > end ? end : last;
      let evs = await span(d, b, 1000); calls++;
      if (evs && evs.length < 1000) take(evs);
      else {   // the month in one go didn't work: the same way the ratings job reads the season, a day at a time
        for (let x = d; x <= b; x = addDays(x, 1)) { const day = await soft(`${API(L)}/scoreboard?dates=${compact(x)}${L.sbParams || ''}`); calls++; if (day && Array.isArray(day.events)) take(day.events); else missed++; await sleep(120); }
      }
      d = addDays(last, 1); await sleep(200);
    }
    if (!games.length) { console.log(lk, `schedule: nothing came back (${calls} calls)`); continue; }
    games.sort((a, b) => a.d.localeCompare(b.d) || a.id.localeCompare(b.id));
    writeJson(`data/${lk}/schedule.json`, { generated: new Date().toISOString(), season: L.seasonStart, through: end, games, missedDays: missed });
    console.log(lk, `schedule: ${games.length} games (${got} read tonight, ${calls} calls, ${missed} days missed), ${games.filter(g => g.st === 'post').length} final, ${games.filter(g => g.st !== 'post').length} to play`);
  }
}

/* ---------- team season stats: the four factors, pace and ratings for every team, ranked ---------- */
function flatStats(block) {
  const m = {}; const cats = block && (block.categories || (block.splits && block.splits.categories) || []) || [];
  cats.forEach(c => (c.stats || []).forEach(st => { if (st && st.name && st.value != null && isFinite(+st.value)) m[st.name] = +st.value; }));
  return m;
}
function describe(d) {   // the shape of one answer, kept in the file so the client's assumptions can be checked against the feed
  const out = { keys: Object.keys(d || {}) }; const r = d && d.results || {};
  out.results = Object.keys(r); const cats = b => (b && (b.categories || (b.splits && b.splits.categories)) || []).map(c => ({ name: c.name, stats: (c.stats || []).map(s => s.name).slice(0, 60) }));
  out.stats = cats(r.stats); out.opponent = cats(r.opponent); return out;
}
function derive(own, opp) {
  const g = own.gamesPlayed || own.games || 0; if (!g) return null;
  const per = (m, avg, tot) => m[avg] != null ? m[avg] : m[tot] != null ? m[tot] / g : null;
  const T = m => ({ pts: per(m, 'avgPoints', 'points'), fga: per(m, 'avgFieldGoalsAttempted', 'fieldGoalsAttempted'), fgm: per(m, 'avgFieldGoalsMade', 'fieldGoalsMade'), tpm: per(m, 'avgThreePointFieldGoalsMade', 'threePointFieldGoalsMade'), tpa: per(m, 'avgThreePointFieldGoalsAttempted', 'threePointFieldGoalsAttempted'), fta: per(m, 'avgFreeThrowsAttempted', 'freeThrowsAttempted'), ftm: per(m, 'avgFreeThrowsMade', 'freeThrowsMade'), orb: per(m, 'avgOffensiveRebounds', 'offensiveRebounds'), drb: per(m, 'avgDefensiveRebounds', 'defensiveRebounds'), tov: per(m, 'avgTurnovers', 'turnovers'), ast: per(m, 'avgAssists', 'assists'), stl: per(m, 'avgSteals', 'steals'), blk: per(m, 'avgBlocks', 'blocks'), pf: per(m, 'avgFouls', 'fouls') });
  const a = T(own), b = T(opp || {});
  const poss = x => x.fga != null && x.orb != null && x.tov != null && x.fta != null ? x.fga - x.orb + x.tov + 0.44 * x.fta : null;
  const pa = poss(a), pb = poss(b);
  const r = { gp: g, pts: a.pts, oppPts: b.pts, pace: pa != null && pb != null ? (pa + pb) / 2 : pa, ortg: pa ? 100 * a.pts / pa : null, drtg: pb && b.pts != null ? 100 * b.pts / pb : null,
    efg: a.fga ? (a.fgm + 0.5 * (a.tpm || 0)) / a.fga : null, tovr: pa ? a.tov / pa : null, orbr: a.orb != null && b.drb != null && (a.orb + b.drb) ? a.orb / (a.orb + b.drb) : null, ftr: a.fga ? a.fta / a.fga : null,
    oefg: b.fga ? (b.fgm + 0.5 * (b.tpm || 0)) / b.fga : null, otovr: pb ? b.tov / pb : null, drbr: a.drb != null && b.orb != null && (a.drb + b.orb) ? a.drb / (a.drb + b.orb) : null, oftr: b.fga ? b.fta / b.fga : null,
    tpr: a.fga && a.tpa != null ? a.tpa / a.fga : null, ast: a.ast, tov: a.tov, stl: a.stl, blk: a.blk, fg: a.fga ? a.fgm / a.fga : null, tp: a.tpa ? a.tpm / a.tpa : null, ft: a.fta ? a.ftm / a.fta : null };
  r.net = r.ortg != null && r.drtg != null ? r.ortg - r.drtg : null;
  Object.keys(r).forEach(k => { if (r[k] != null && isFinite(r[k])) r[k] = +r[k].toFixed(4); else if (r[k] == null || !isFinite(r[k])) r[k] = null; });
  return r;
}
const LOWER_BETTER = new Set(['drtg', 'tovr', 'oefg', 'oftr', 'oppPts', 'tov']);
/* both sides of every final, from the box score: the only way to get what a team allows */
const BOX_KEYS = ['pts', 'fga', 'fgm', 'tpa', 'tpm', 'fta', 'ftm', 'orb', 'drb', 'tov', 'ast', 'stl', 'blk', 'pf'];
function boxTotals(summary, g) {
  const teams = summary && summary.boxscore && summary.boxscore.teams || []; if (teams.length !== 2) return null;
  const read = t => { const m = {}; (t.statistics || []).forEach(x => { if (x && x.name) m[x.name] = String(x.displayValue ?? ''); }); const pair = k => { const v = (m[k] || '').split('-').map(Number); return v.length === 2 && v.every(isFinite) ? v : [null, null]; }; const num = k => { const v = parseFloat(m[k]); return isFinite(v) ? v : null; };
    const [fgm, fga] = pair('fieldGoalsMade-fieldGoalsAttempted'), [tpm, tpa] = pair('threePointFieldGoalsMade-threePointFieldGoalsAttempted'), [ftm, fta] = pair('freeThrowsMade-freeThrowsAttempted');
    return { id: String(t.team && t.team.id), fga, fgm, tpa, tpm, fta, ftm, orb: num('offensiveRebounds'), drb: num('defensiveRebounds'), tov: num('turnovers') ?? num('totalTurnovers'), ast: num('assists'), stl: num('steals'), blk: num('blocks'), pf: num('fouls') }; };
  const a = read(teams[0]), b = read(teams[1]); if (!a.id || !b.id || a.fga == null || b.fga == null) return null;
  a.pts = a.id === g.h ? g.hs : g.as; b.pts = b.id === g.h ? g.hs : g.as;
  return [a, b];
}
function perGameFromBox(t) { const g = t.gp || 0; if (!g) return {}; const m = { gamesPlayed: g }; const avg = { pts: 'avgPoints', fga: 'avgFieldGoalsAttempted', fgm: 'avgFieldGoalsMade', tpa: 'avgThreePointFieldGoalsAttempted', tpm: 'avgThreePointFieldGoalsMade', fta: 'avgFreeThrowsAttempted', ftm: 'avgFreeThrowsMade', orb: 'avgOffensiveRebounds', drb: 'avgDefensiveRebounds', tov: 'avgTurnovers', ast: 'avgAssists', stl: 'avgSteals', blk: 'avgBlocks', pf: 'avgFouls' }; BOX_KEYS.forEach(k => { if (t[k] != null) m[avg[k]] = t[k] / g; }); return m; }
async function runTeamStats() {
  for (const lk of ['nba', 'wnba']) {
    const L = LEAGUES[lk]; if (!L) continue;
    const R = readJson(`data/${lk}/ratings.json`, null); const ids = R && R.teams ? Object.keys(R.teams) : [];
    if (!ids.length) { console.log(lk, 'teamstats: no teams yet'); continue; }
    if (todayCT() < L.seasonStart) { console.log(lk, 'teamstats: season not started'); continue; }
    // the season's box scores, accumulated game by game and kept in the state file
    const sp = `data/${lk}/state.json`; const st = readJson(sp, null) || {}; if (!st.box || st.box.season !== L.seasonStart) st.box = { season: L.seasonStart, games: {}, teams: {} };
    const sched = readJson(`data/${lk}/schedule.json`, null); const finals = sched && sched.season === L.seasonStart ? sched.games.filter(g => g.t === 2 && !g.x && g.st === 'post' && g.hs != null && g.as != null && !st.box.games[g.id]) : [];
    let added = 0;
    for (const g of finals.slice(0, 150)) {
      const sm = await soft(`${API(L)}/summary?event=${g.id}`); const tot = sm && boxTotals(sm, g); await sleep(120);
      if (!tot) { st.box.games[g.id] = 0; continue; }   // no box score: noted so it isn't asked for again
      tot.forEach((t, i) => { const o = tot[1 - i]; const T = st.box.teams[t.id] = st.box.teams[t.id] || { gp: 0, opp: {} }; T.gp++; BOX_KEYS.forEach(k => { if (t[k] != null) T[k] = (T[k] || 0) + t[k]; if (o[k] != null) T.opp[k] = (T.opp[k] || 0) + o[k]; }); });
      st.box.games[g.id] = 1; added++;
    }
    writeJson(sp, st);
    const teams = {}; let shape = null, got = 0, fromFeed = 0;
    for (const id of ids) {
      const B = st.box.teams[id];
      let own = B && B.gp ? perGameFromBox(B) : null, opp = B && B.gp ? perGameFromBox({ ...B.opp, gp: B.gp }) : null;
      if (!own) {   // nothing in the box yet: the feed's own-side averages, without what the team allows
        const d = await soft(`${API(L)}/teams/${id}/statistics`); if (!d) continue; if (!shape) shape = describe(d);
        const r = d.results || d; own = flatStats(r.stats || r); opp = flatStats(r.opponent); fromFeed++; await sleep(150);
      }
      const v = derive(own, opp); if (!v) continue;
      teams[id] = { ...v, abbr: R.teams[id].abbr, short: R.teams[id].short, box: !!(B && B.gp) }; got++;
    }
    if (!got) { console.log(lk, 'teamstats: nothing came back', JSON.stringify(shape || {}).slice(0, 300)); continue; }
    console.log(lk, `teamstats: ${added} box scores added (${Object.keys(st.box.games).length} on file), ${fromFeed} teams from the feed's averages`);
    // ranks: 1 is best
    const keys = ['pts', 'oppPts', 'pace', 'ortg', 'drtg', 'net', 'efg', 'tovr', 'orbr', 'ftr', 'oefg', 'otovr', 'drbr', 'oftr', 'tpr', 'ast', 'tov', 'stl', 'blk', 'fg', 'tp', 'ft'];
    const ranks = {}; keys.forEach(k => { const list = Object.entries(teams).filter(([, t]) => t[k] != null).sort((x, y) => LOWER_BETTER.has(k) ? x[1][k] - y[1][k] : y[1][k] - x[1][k]); list.forEach(([id], i) => { (ranks[id] = ranks[id] || {})[k] = i + 1; }); });
    Object.keys(teams).forEach(id => teams[id].rank = ranks[id] || {});
    writeJson(`data/${lk}/teamstats.json`, { generated: new Date().toISOString(), season: L.seasonStart, n: got, teams, shape });
    console.log(lk, `teamstats: ${got} teams`);
  }
}

if (mode === 'tune') await runTune(); else if (mode === 'schedule') await runSchedule(); else if (mode === 'teamstats') await runTeamStats(); else await runRatings();
