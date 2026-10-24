// Builds ai/context-YYYY-MM-DD.json: the facts the daily AI reads are written from.
// Runs in GitHub Actions (Node 20+, global fetch). Usage: node tools/slate-context.mjs [YYYY-MM-DD]
import { writeFileSync, mkdirSync } from 'node:fs';
const API = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
const API2 = 'https://site.api.espn.com/apis/v2/sports/basketball/nba';
const ymd = process.argv[2] || new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const get = async u => { const r = await fetch(u); if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); };
const prev = (d, n) => { const [y, m, dd] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10); };
const sb = await get(`${API}/scoreboard?dates=${ymd.replace(/-/g, '')}&limit=50`);
const yday = await get(`${API}/scoreboard?dates=${prev(ymd, -1).replace(/-/g, '')}&limit=50`);
const st = await get(`${API2}/standings`);
const inj = await get(`${API}/injuries`).catch(() => ({ injuries: [] }));
const b2b = new Set(yday.events.flatMap(e => e.competitions[0].competitors.map(c => c.team.abbreviation)));
const table = {};
for (const conf of st.children) for (const en of conf.standings.entries) {
  const s = Object.fromEntries(en.stats.map(x => [x.name || x.type, x.displayValue]));
  table[en.team.abbreviation] = { conf: conf.abbreviation || conf.name, seed: s.playoffSeed, record: s.overall || `${s.wins}-${s.losses}`, ppg: s.avgPointsFor, opp: s.avgPointsAgainst, diff: s.differential, streak: s.streak, l10: s['Last Ten Games'], home: s.Home, road: s.Road };
}
const injBy = {};
for (const t of inj.injuries || []) for (const x of t.injuries || []) {
  const ab = x.athlete?.team?.abbreviation; if (!ab) continue;
  (injBy[ab] ||= []).push({ player: x.athlete.displayName, pos: x.athlete.position?.abbreviation, status: x.status, note: (x.shortComment || '').slice(0, 220) });
}
const games = [];
for (const e of sb.events) {
  const c = e.competitions[0];
  const side = c.competitors.map(x => {
    const ab = x.team.abbreviation;
    const leaders = (x.leaders || []).map(l => `${l.name}: ${l.leaders?.[0]?.athlete?.displayName} ${l.leaders?.[0]?.displayValue}`);
    return { homeAway: x.homeAway, abbr: ab, name: x.team.displayName, record: x.records?.[0]?.summary, standing: table[ab], backToBack: b2b.has(ab), seasonLeaders: leaders, injuries: injBy[ab] || [] };
  });
  games.push({ id: e.id, name: e.name, tipCT: new Date(e.date).toLocaleString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' }), state: c.status.type.state, venue: c.venue?.fullName, teams: side });
}
mkdirSync('ai', { recursive: true });
writeFileSync(`ai/context-${ymd}.json`, JSON.stringify({ date: ymd, built: new Date().toISOString(), season: st.seasonDisplayName, games }, null, 1));
console.log(`ai/context-${ymd}.json: ${games.length} games`);
