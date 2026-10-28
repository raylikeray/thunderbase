// Tipoff nightly jobs. Runs in GitHub Actions (Node 20+).
//   node tools/nightly.mjs ratings   → data/<league>/{ratings,record,state}.json (margin Elo + forecast record vs ESPN BPI)
//   node tools/nightly.mjs tune      → data/<league>/params.json (re-fits home court, rest, spread, rating speed and a calibration layer
//                                      by replaying the season; the ratings are rebuilt with the winning mix)
//   node tools/nightly.mjs context   → ai/context-<date>.json (featured games for the daily AI reads) + grades yesterday's reads into ai/record.json
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
const { LEAGUES, ORDER, ESPN, TZ } = createRequire(import.meta.url)('../js/config.js');

const mode = process.argv[2] || 'ratings';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(u, tries = 2) { for (let i = 0; ; i++) { try { const r = await fetch(u, { headers: { 'user-agent': 'tipoff-nightly' } }); if (!r.ok) throw new Error(u + ' ' + r.status); return await r.json(); } catch (e) { if (i >= tries) throw e; await sleep(800 * (i + 1)); } } }
const soft = async u => { try { return await get(u); } catch { return null; } };
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

/* ---------- AI self-grading ---------- */
async function gradeReads(today) {
  const yday = addDays(today, -1);
  const reads = readJson(`ai/${yday}.json`, null);
  const rec = readJson('ai/record.json', { games: [] });
  const done = new Set(rec.games.map(g => `${g.date}|${g.lk}:${g.id}`));
  const ctxY = readJson(`ai/context-${yday}.json`, null); const ctxBy = {}; ((ctxY && ctxY.games) || []).forEach(g => ctxBy[g.key] = g);
  let graded = 0;
  if (reads && reads.games) {
    const byLk = {}; Object.keys(reads.games).forEach(k => { const [lk, id] = k.split(':'); if (LEAGUES[lk]) (byLk[lk] ||= []).push(id); });
    for (const lk of Object.keys(byLk)) {
      const L = LEAGUES[lk]; let games; try { games = await scoreboard(L, yday); } catch { continue; }
      for (const id of byLk[lk]) {
        if (done.has(`${yday}|${lk}:${id}`)) continue;
        const g = games.find(x => x.id === id); const r = reads.games[`${lk}:${id}`]; if (!g || g.state !== 'post' || !r) continue;
        const pick = String(r.pick || '').trim(); if (!pick || /^(none|pass|no lean|toss-?up)$/i.test(pick)) continue;
        const norm = s => String(s || '').toLowerCase();
        const side = [g.home, g.away].find(s => norm(pick) === norm(s.abbr) || norm(pick).includes(norm(s.abbr)) || norm(pick).includes(norm(s.short)) || norm(pick).includes(norm(s.name)));
        if (!side) continue;
        const winner = g.home.score > g.away.score ? g.home : g.away;
        const c = ctxBy[`${lk}:${id}`]; const modelPick = c ? (c.modelHomeWinPct >= 50 ? g.home : g.away) : null;
        rec.games.push({ date: yday, lk, id, game: `${g.away.abbr} at ${g.home.abbr}`, pick: side.abbr, confidence: (r.confidence || '').toLowerCase() || null, hit: side.id === winner.id, final: `${g.away.score}-${g.home.score}`, modelPick: modelPick ? modelPick.abbr : null, modelHit: modelPick ? modelPick.id === winner.id : null, modelPct: c ? c.modelHomeWinPct : null, headline: r.headline || '' });
        graded++;
      }
    }
  }
  rec.games = rec.games.slice(-2000);
  const agg = list => ({ n: list.length, hit: list.filter(g => g.hit).length });
  const since7 = addDays(today, -7);
  const byLeague = {}; ORDER.forEach(lk => { const l = rec.games.filter(g => g.lk === lk); if (l.length) byLeague[lk] = { ...agg(l), last7: agg(l.filter(g => g.date >= since7)) }; });
  const byConfidence = {}; ['high', 'medium', 'low'].forEach(c => { const l = rec.games.filter(g => g.confidence === c); if (l.length) byConfidence[c] = agg(l); });
  const dis = rec.games.filter(g => g.modelPick && g.modelPick !== g.pick);
  const out = { generated: new Date().toISOString(), ...agg(rec.games), last7: agg(rec.games.filter(g => g.date >= since7)), byLeague, byConfidence, vsModel: dis.length ? { n: dis.length, aiHit: dis.filter(g => g.hit).length, modelHit: dis.filter(g => g.modelHit).length } : null, recent: [...rec.games].reverse().slice(0, 30), games: rec.games };
  writeJson('ai/record.json', out);
  console.log(`ai/record.json: graded ${graded} from ${yday}; ${out.hit} of ${out.n} all-time`);
  return out;
}

/* ---------- AI context ---------- */
async function runContext() {
  const today = todayCT();
  let graded = null; try { graded = await gradeReads(today); } catch (e) { console.log('grading failed', e.message); }
  const featured = [];
  for (const lk of ORDER) {
    const L = LEAGUES[lk];
    let games; try { games = (await scoreboard(L, today)).filter(g => g.state === 'pre'); } catch { continue; }
    if (!games.length) continue;
    const [cur, rk, rt, inj, yday] = await Promise.all([standings(L), rankings(L), Promise.resolve(readJson(`data/${lk}/ratings.json`, null)), L.hasInjuries ? soft(`${API(L)}/injuries`) : null, soft(`${API(L)}/scoreboard?dates=${compact(addDays(today, -1))}${L.sbParams}`)]);
    const b2b = new Set(((yday && yday.events) || []).flatMap(e => e.competitions[0].competitors.map(c => String(c.team.id))));
    const injBy = {}; ((inj && inj.injuries) || []).forEach(t => (t.injuries || []).forEach(x => { const ab = x.athlete && x.athlete.team && String(x.athlete.team.id); if (ab) (injBy[ab] ||= []).push({ player: x.athlete.displayName, pos: x.athlete.position && x.athlete.position.abbreviation, status: x.status, note: (x.shortComment || '').slice(0, 200) }); }));
    const st = { elo: (rt && rt.teams) || {} }; const P = paramsOf(L);
    const score = g => { let s = 0; const fav = id => L.favs.includes(id); if (fav(g.home.id) || fav(g.away.id)) s += 100; s += ({ nba: 50, nfl: 60, mlb: 30, wnba: 30, ncaaf: 15, ncaam: 10, ncaaw: 5, ncaab: 0 })[lk] || 0; if (/playoff|world series|championship|bowl|final/i.test(g.note || '')) s += 40; if (g.home.rank && g.away.rank) s += 40 + (50 - g.home.rank - g.away.rank); else if (g.home.rank || g.away.rank) { const r = g.home.rank || g.away.rank; s += lk === 'ncaaw' && r <= 10 ? 25 : 10; } return s; };
    for (const g of games) {
      const f = pregame(L, st, g, b2b, P);
      const team = s => ({ homeAway: s === g.home ? 'home' : 'away', abbr: s.abbr, name: s.name, record: s.rec, apRank: s.rank, elo: st.elo[s.id] ? Math.round(st.elo[s.id].elo) : null, standing: cur[s.id] ? { conference: cur[s.id].group, record: `${cur[s.id].w}-${cur[s.id].l}`, confRecord: cur[s.id].conf, ppg: cur[s.id].ppg, oppPpg: cur[s.id].opp, margin: cur[s.id].diff, streak: cur[s.id].streak, last10: cur[s.id].l10, home: cur[s.id].home, road: cur[s.id].road } : null, playedYesterday: b2b.has(s.id), seasonLeaders: s.leaders.map(l => `${l.name}: ${l.who} ${l.val}`), injuries: injBy[s.id] || [] });
      featured.push({ league: lk, leagueLabel: L.label, id: g.id, key: `${lk}:${g.id}`, name: g.name, tipCT: new Date(g.date).toLocaleString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }), venue: g.venue, neutralSite: g.neutral, tv: g.tv, note: g.note, modelHomeWinPct: Math.round(f.p * 100), modelHomeMargin: +f.margin.toFixed(1), interest: score(g), teams: [team(g.away), team(g.home)] });
    }
  }
  featured.sort((a, b) => b.interest - a.interest);
  const pick = featured.slice(0, 15);
  let yourRecord = null;
  if (graded && graded.n) {
    const yday = addDays(today, -1);
    const y = graded.games.filter(g => g.date === yday);
    const misses = [...graded.games].reverse().filter(g => !g.hit).slice(0, 8);
    yourRecord = { note: 'Your own past reads, graded against results. Use them: notice where you have been over- or under-confident, which leagues you read well, and whether disagreeing with the model has paid off.', allTime: `${graded.hit} of ${graded.n} leans right`, last7Days: `${graded.last7.hit} of ${graded.last7.n}`, byLeague: Object.fromEntries(Object.entries(graded.byLeague).map(([k, v]) => [k, `${v.hit} of ${v.n}`])), byConfidence: Object.fromEntries(Object.entries(graded.byConfidence).map(([k, v]) => [k, `${v.hit} of ${v.n}`])), whenYouDisagreedWithTheModel: graded.vsModel ? `you ${graded.vsModel.aiHit}, model ${graded.vsModel.modelHit}, of ${graded.vsModel.n}` : 'no disagreements yet', yesterday: y.map(g => ({ game: g.game, league: g.lk, yourLean: g.pick, confidence: g.confidence, final: g.final, result: g.hit ? 'hit' : 'miss', yourHeadline: g.headline })), recentMisses: misses.map(g => ({ date: g.date, game: g.game, league: g.lk, yourLean: g.pick, confidence: g.confidence, final: g.final, yourHeadline: g.headline })) };
  }
  writeJson(`ai/context-${today}.json`, { date: today, built: new Date().toISOString(), totalGamesToday: featured.length, yourRecord, games: pick });
  console.log(`ai/context-${today}.json: ${pick.length} of ${featured.length} games`);
}

if (mode === 'context') await runContext(); else if (mode === 'tune') await runTune(); else await runRatings();
