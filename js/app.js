/* Hardwood — shell: freshness, polling, router, delegated actions. */
(function () {
'use strict';
const HW = window.HW;
const { LEAGUES, ORDER, todayCT, timeCT, scoreboard, isLive, S, allToday, cache, favs } = HW;
const $main = document.getElementById('main');
const $fresh = document.getElementById('fresh'), $freshText = document.getElementById('freshText');

/* ---------- freshness ---------- */
function paintFresh() {
  const live = allToday().filter(isLive).length;
  const age = Date.now() - S.lastOk;
  $fresh.classList.toggle('live', live > 0 && !S.err && age < 120000);
  $fresh.classList.toggle('stale', !S.err && S.lastOk > 0 && age >= 120000 && live > 0);
  $fresh.classList.toggle('err', S.err);
  if (S.err) $freshText.textContent = S.lastOk ? `Feed not responding · last ${new Date(S.lastOk).toLocaleTimeString('en-US', { timeZone: HW.TZ, hour: 'numeric', minute: '2-digit' })}` : 'Feed not responding · retrying';
  else if (!S.lastOk) $freshText.textContent = 'Loading…';
  else $freshText.textContent = `${live ? live + ' live · ' : ''}${timeCT(new Date(S.lastOk))} CT`;
}
setInterval(paintFresh, 5000);

/* ---------- polling ---------- */
async function tick() {
  clearTimeout(S.timer);
  const ymd = todayCT();
  if (ymd !== S.todayYmd) S.todayYmd = ymd;
  const results = await Promise.all(ORDER.map(k => scoreboard(LEAGUES[k], ymd, 0).then(v => ({ k, v })).catch(() => ({ k, err: true }))));
  const anyOk = results.some(r => !r.err);
  results.forEach(r => { if (!r.err) S.today[r.k] = r.v; });
  if (anyOk) { S.lastOk = Date.now(); S.err = false; } else S.err = true;
  paintFresh();
  if (S.route && S.route.live) { try { await S.route.live(); } catch (e) { console.error(e); } }
  const all = allToday();
  const anyLive = all.some(isLive);
  const soon = all.some(g => g.state === 'pre' && new Date(g.date) - Date.now() < 30 * 60000);
  const delay = S.err ? 30000 : anyLive ? 30000 : soon ? 60000 : 300000;
  if (!document.hidden) S.timer = setTimeout(tick, delay);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); else clearTimeout(S.timer); });

/* ---------- router ----------
   #scores[/<league|all>[/<yyyymmdd>]]   #game/<league>/<id>   #standings[/<league>]   #rankings[/<league>]
   #teams[/<league>]   #team/<league>/<id>   #players[/<league>]   #player/<league>/<id>
   #forecasts[/<league|all>]   #news[/<league>[/<tab>]]   #record
   Older links (#tonight, #nba/game-123, #game-123 …) are mapped onto these. */
function parseHash() {
  let h = decodeURIComponent((location.hash || '#scores').slice(1)).replace(/^\/+|\/+$/g, '');
  if (!h || h === 'home' || h === 'tonight') return { name: 'scores', args: [] };
  // legacy v2: nba, nba/games-20261024, nba/game-123, nba/team-25, nba/players, nba/wire-injuries …
  let m = h.match(/^(nba|wnba|ncaam|ncaaw)(?:\/([a-z]+)(?:-([A-Za-z0-9]+))?)?$/);
  if (m) { const lk = m[1], v = m[2] || 'scores', a = m[3]; const map = { tonight: 'scores', games: 'scores', game: 'game', standings: 'standings', rankings: 'rankings', teams: 'teams', team: 'team', players: 'players', player: 'player', forecasts: 'forecasts', wire: 'news' }; const n = map[v] || 'scores'; return { name: n, args: ['game', 'team', 'player'].includes(n) ? [lk, a] : [lk, a] }; }
  // legacy v1: game-123, team-25, games-20261024, wire-injuries …
  m = h.match(/^(games|game|standings|teams|team|players|player|forecasts|wire)(?:-([A-Za-z0-9]+))?$/);
  if (m) { const map = { games: 'scores', wire: 'news' }; return { name: map[m[1]] || m[1], args: ['nba', m[2]] }; }
  const parts = h.split('/');
  const name = parts[0];
  if (!HW.views[name]) return { name: 'scores', args: [] };
  return { name, args: parts.slice(1) };
}
function paintNav(name) {
  const sec = name === 'game' ? 'scores' : name === 'team' ? 'teams' : name === 'player' ? 'players' : name;
  document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === sec));
}
let navSeq = 0;
async function route() {
  const r = parseHash();
  const seq = ++navSeq;
  paintNav(r.name);
  S.route = null;
  if (!S.lastOk && !S.err) await tick();
  try {
    const res = await HW.views[r.name](...r.args);
    if (seq === navSeq) S.route = res || null;
  } catch (e) { console.error(e); if (seq === navSeq) $main.innerHTML = HW.render.failMsg('this page'); }
  const names = { scores: 'Scores', game: 'Game', standings: 'Standings', rankings: 'Rankings', teams: 'Teams', team: 'Team', players: 'Players', player: 'Player', forecasts: 'Forecasts', news: 'News', record: 'Our record' };
  document.title = r.name === 'scores' && !r.args.length ? 'Hardwood' : `${names[r.name] || ''} · Hardwood`;
}
window.addEventListener('hashchange', () => { window.scrollTo({ top: 0 }); $main.focus({ preventScroll: true }); route(); });

/* ---------- delegated actions ---------- */
document.addEventListener('click', e => {
  const act = e.target.closest('[data-act]');
  if (act) {
    const a = act.dataset.act;
    if (a === 'ai') { const k = 'ai-' + act.dataset.id; S.open.has(k) ? S.open.delete(k) : S.open.add(k); const on = S.open.has(k); const box = document.getElementById(k); if (box) box.hidden = !on; act.textContent = on ? 'Hide AI read' : 'AI read'; act.setAttribute('aria-expanded', on); return; }
    if (a === 'fc') { const k = 'fc-' + act.dataset.id; S.open.has(k) ? S.open.delete(k) : S.open.add(k); const on = S.open.has(k); document.querySelectorAll('#fcd-' + CSS.escape(act.dataset.id)).forEach(el => el.hidden = !on); act.setAttribute('aria-expanded', on); act.textContent = on ? 'Hide' : (act.dataset.ai ? 'AI read' : 'Why'); return; }
    if (a === 'stmode') { HW.views.standings.render(act.dataset.m); return; }
    if (a === 'psort') { HW.views.players.st.sort = act.dataset.k; HW.views.players.paint ? HW.views.players.paint() : route(); return; }
    if (a === 'pmore') { HW.views.players.st.limit += 100; HW.views.players.paint(); return; }
    if (a === 'fav') { const on = favs.toggle(act.dataset.lk, act.dataset.id); act.textContent = on ? '★ In my teams' : '☆ Add to my teams'; act.setAttribute('aria-pressed', on); return; }
    if (a === 'reload') { e.preventDefault(); cache.clear(); tick().then(route); return; }
  }
  const tr = e.target.closest('tr[data-href]');
  if (tr && !e.target.closest('a,button,input,select')) { location.hash = tr.dataset.href.slice(1); }
});
document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('th[data-act="psort"]')) { e.preventDefault(); e.target.click(); } });

/* ---------- boot ---------- */
S.todayYmd = todayCT();
tick().then(route);
})();
