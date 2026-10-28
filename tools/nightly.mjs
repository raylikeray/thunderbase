// Hardwood nightly jobs. Runs in GitHub Actions (Node 20+).
//   node tools/nightly.mjs ratings   → data/<league>/{ratings,record,state}.json (margin Elo + forecast record vs ESPN BPI)
//   node tools/nightly.mjs context   → ai/context-<date>.json (featured games for the daily AI reads)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
const { LEAGUES, ORDER, ESPN, TZ } = createRequire(import.meta.url)('../js/config.js');

const mode = process.argv[2] || 'ratings';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(u, tries = 2) { for (let i = 0; ; i++) { try { const r = await fetch(u, { headers: { 'user-agent': 'hardwood-nightly' } }); if (!r.ok) throw new Error(u + ' ' + r.status); return await r.json(); } catch (e) { if (i >= tries) throw e; await sleep(800 * (i + 1)); } } }
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
function statMap(stats) { const s = {}; (stats || []).forEach(x => { if (x.name) s[x.name] = x; if (x.displayName) s[x.displayName] = s[x.displayName] || x; }); return s; }
async function standings(L, season) {
  const d = await soft(`${API2(L)}/standings${season ? '?season=' + season : ''}${L.standingsMode === 'conferences' ? (season ? '&' : '?') + 'group=50&level=3' : ''}`);
  const rows = {}; const walk = (node, grp) => { if (!node) return; if (node.standings && node.standings.entries) node.standings.entries.forEach(en => { const s = statMap(en.stats); const v = k => s[k] ? (s[k].value ?? parseFloat(s[k].displayValue)) : null; const dv = k => s[k] ? s[k].displayValue : ''; const t = en.team; rows[String(t.id)] = { id: String(t.id), abbr: t.abbreviation, name: t.displayName, group: node.name || grp, w: v('wins') || 0, l: v('losses') || 0, diff: v('differential') ?? v('pointDifferential') ?? ((v('avgPointsFor') != null && v('avgPointsAgainst') != null) ? v('avgPointsFor') - v('avgPointsAgainst') : null), ppg: v('avgPointsFor'), opp: v('avgPointsAgainst'), streak: dv('streak'), l10: dv('Last Ten Games'), home: dv('Home'), road: dv('Road'), conf: dv('vs. Conf.') }; }); (node.children || []).forEach(c => walk(c, node.name)); }; walk(d, L.label);
  return rows;
}
async function rankings(L) { if (!L.hasRankings) return {}; const d = await soft(`${API(L)}/rankings`); const ap = d && d.rankings && (d.rankings.find(r => /AP/i.test(r.name)) || d.rankings[0]); const m = {}; (ap && ap.ranks || []).forEach(r => m[String(r.team.id)] = r.current); return m; }

/* ---------- Elo ---------- */
const POWER = /\b(ACC|Big 12|Big Ten|SEC|Big East|Southeastern|Atlantic Coast)\b/i, MID = /\b(American|Mountain West|Atlantic 10|West Coast|Missouri Valley|Conference USA|Sun Belt|MAC|Mid-American|WAC|Ivy|Big West|Horizon|CAA|Coastal)\b/i;
async function initElo(L) {
  const elo = {};
  if (L.standingsMode === 'conferences') {
    const [cur, rk] = await Promise.all([standings(L), rankings(L)]);
    for (const r of Object.values(cur)) { const base = POWER.test(r.group) ? 1700 : MID.test(r.group) ? 1520 : 1380; const boost = rk[r.id] ? 400 + (25 - rk[r.id]) * 6 : 0; elo[r.id] = { elo: Math.max(base, 1500 + boost), gp: 0, name: r.name, abbr: r.abbr, prior: rk[r.id] ? `preseason #${rk[r.id]}` : r.group }; }
  } else {
    const yr = new Date().getUTCMonth() >= 6 ? new Date().getUTCFullYear() + 1 : new Date().getUTCFullYear();
    const prev = await standings(L, L.key === 'wnba' ? yr - 1 : yr - 1);
    for (const r of Object.values(prev)) elo[r.id] = { elo: 1500 + (r.diff || 0) * 0.65 * L.eloPerPoint, gp: 0, name: r.name, abbr: r.abbr, prior: `last season ${r.diff > 0 ? '+' : ''}${(r.diff || 0).toFixed(1)}` };
  }
  return elo;
}
function pregame(L, st, g, b2b) {
  const H = st.elo[g.home.id] || { elo: 1500 }, A = st.elo[g.away.id] || { elo: 1500 };
  const hca = g.neutral ? 0 : L.hca;
  const rest = (b2b.has(g.home.id) ? -L.b2b : 0) - (b2b.has(g.away.id) ? -L.b2b : 0);
  const margin = (H.elo - A.elo) / L.eloPerPoint + hca + rest;
  return { p: Phi(margin / L.sd), margin };
}
function update(L, st, g) {
  const ensure = s => st.elo[s.id] = st.elo[s.id] || { elo: 1500, gp: 0, name: s.name, abbr: s.abbr, prior: 'unrated' };
  const H = ensure(g.home), A = ensure(g.away);
  H.name = g.home.name || H.name; A.name = g.away.name || A.name; H.abbr = g.home.abbr || H.abbr; A.abbr = g.away.abbr || A.abbr;
  const hcaElo = (g.neutral ? 0 : L.hca) * L.eloPerPoint;
  const eH = 1 / (1 + 10 ** (-((H.elo + hcaElo) - A.elo) / 400));
  const margin = g.home.score - g.away.score; const aH = margin > 0 ? 1 : 0;
  const winnerDiff = margin > 0 ? (H.elo + hcaElo - A.elo) : (A.elo - H.elo - hcaElo);
  const mov = Math.log(Math.abs(margin) + 1) * (2.2 / (winnerDiff * 0.001 + 2.2));
  const k = L.k * (H.gp < 10 || A.gp < 10 ? 1.4 : 1);   // settle faster early in the season
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
    if (!st || st.season !== L.seasonStart) { st = { season: L.seasonStart, elo: await initElo(L), processed: {}, lastDate: addDays(L.seasonStart, -1), record: [] }; console.log(lk, 'initialized', Object.keys(st.elo).length, 'teams'); }
    let from = addDays(st.lastDate, -1); if (from < addDays(L.seasonStart, -1)) from = addDays(L.seasonStart, -1);
    let prev = new Set(); try { prev = new Set((await scoreboard(L, addDays(from, -1))).filter(g => g.state === 'post').flatMap(g => [g.home.id, g.away.id])); } catch { }
    let n = 0, espnN = 0;
    for (let d = from; d <= yday; d = addDays(d, 1)) {
      let games; try { games = await scoreboard(L, d); } catch (e) { console.log(lk, d, 'scoreboard failed', e.message); break; }
      const finals = games.filter(g => g.state === 'post' && g.home.score != null && g.away.score != null && !st.processed[g.id]);
      // pregame forecasts for the whole day first (ratings as they stood that morning), then update
      const pre = finals.map(g => ({ g, f: pregame(L, st, g, prev) }));
      let budget = L.standingsMode === 'conferences' ? 60 : 40;
      for (const { g, f } of pre) {
        let ep = null;
        if (budget > 0) { budget--; const s = await soft(`${API(L)}/summary?event=${g.id}`); const gp = s && s.predictor && s.predictor.homeTeam && s.predictor.homeTeam.gameProjection; if (gp != null && gp !== '') { ep = parseFloat(gp) / 100; espnN++; } await sleep(120); }
        st.record.push({ id: g.id, date: d, h: g.home.abbr, a: g.away.abbr, hid: g.home.id, aid: g.away.id, hs: g.home.score, as: g.away.score, p: +f.p.toFixed(4), ep: ep != null ? +ep.toFixed(4) : null, n: g.neutral ? 1 : 0 });
        update(L, st, g); st.processed[g.id] = 1; n++;
      }
      prev = new Set(games.filter(g => g.state !== 'pre').flatMap(g => [g.home.id, g.away.id]));
      if (games.every(g => g.state === 'post') || d < yday) st.lastDate = d;
      await sleep(150);
    }
    if (st.record.length > 6000) st.record = st.record.slice(-6000);
    const teams = {}; Object.entries(st.elo).forEach(([id, v]) => teams[id] = { elo: Math.round(v.elo * 10) / 10, gp: v.gp, name: v.name, abbr: v.abbr, prior: v.prior });
    writeJson(sp, st);
    writeJson(`data/${lk}/ratings.json`, { generated: new Date().toISOString(), season: L.seasonStart, teams, params: { hca: L.hca, b2b: L.b2b, sd: L.sd, k: L.k, eloPerPoint: L.eloPerPoint } });
    writeJson(`data/${lk}/record.json`, { generated: new Date().toISOString(), games: st.record });
    console.log(lk, `+${n} games (${espnN} with ESPN BPI), ${st.record.length} on record, through ${st.lastDate}`);
  }
}

/* ---------- AI context ---------- */
async function runContext() {
  const today = todayCT();
  const featured = [];
  for (const lk of ORDER) {
    const L = LEAGUES[lk];
    let games; try { games = (await scoreboard(L, today)).filter(g => g.state === 'pre'); } catch { continue; }
    if (!games.length) continue;
    const [cur, rk, rt, inj, yday] = await Promise.all([standings(L), rankings(L), Promise.resolve(readJson(`data/${lk}/ratings.json`, null)), L.hasInjuries ? soft(`${API(L)}/injuries`) : null, soft(`${API(L)}/scoreboard?dates=${compact(addDays(today, -1))}${L.sbParams}`)]);
    const b2b = new Set(((yday && yday.events) || []).flatMap(e => e.competitions[0].competitors.map(c => String(c.team.id))));
    const injBy = {}; ((inj && inj.injuries) || []).forEach(t => (t.injuries || []).forEach(x => { const ab = x.athlete && x.athlete.team && String(x.athlete.team.id); if (ab) (injBy[ab] ||= []).push({ player: x.athlete.displayName, pos: x.athlete.position && x.athlete.position.abbreviation, status: x.status, note: (x.shortComment || '').slice(0, 200) }); }));
    const st = { elo: (rt && rt.teams) || {} };
    const score = g => { let s = 0; const fav = id => L.favs.includes(id); if (fav(g.home.id) || fav(g.away.id)) s += 100; if (lk === 'nba') s += 50; if (g.home.rank && g.away.rank) s += 40 + (50 - g.home.rank - g.away.rank); else if (g.home.rank || g.away.rank) { const r = g.home.rank || g.away.rank; s += lk === 'ncaaw' && r <= 10 ? 25 : 10; } return s; };
    for (const g of games) {
      const f = pregame(L, st, g, b2b);
      const team = s => ({ homeAway: s === g.home ? 'home' : 'away', abbr: s.abbr, name: s.name, record: s.rec, apRank: s.rank, elo: st.elo[s.id] ? Math.round(st.elo[s.id].elo) : null, standing: cur[s.id] ? { conference: cur[s.id].group, record: `${cur[s.id].w}-${cur[s.id].l}`, confRecord: cur[s.id].conf, ppg: cur[s.id].ppg, oppPpg: cur[s.id].opp, margin: cur[s.id].diff, streak: cur[s.id].streak, last10: cur[s.id].l10, home: cur[s.id].home, road: cur[s.id].road } : null, playedYesterday: b2b.has(s.id), seasonLeaders: s.leaders.map(l => `${l.name}: ${l.who} ${l.val}`), injuries: injBy[s.id] || [] });
      featured.push({ league: lk, leagueLabel: L.label, id: g.id, key: `${lk}:${g.id}`, name: g.name, tipCT: new Date(g.date).toLocaleString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }), venue: g.venue, neutralSite: g.neutral, tv: g.tv, note: g.note, modelHomeWinPct: Math.round(f.p * 100), modelHomeMargin: +f.margin.toFixed(1), interest: score(g), teams: [team(g.away), team(g.home)] });
    }
  }
  featured.sort((a, b) => b.interest - a.interest);
  const pick = featured.slice(0, 15);
  writeJson(`ai/context-${today}.json`, { date: today, built: new Date().toISOString(), totalGamesToday: featured.length, games: pick });
  console.log(`ai/context-${today}.json: ${pick.length} of ${featured.length} games`);
}

if (mode === 'context') await runContext(); else await runRatings();
