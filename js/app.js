/* Hardwood — shell: header, live strip, polling, router, delegated actions. */
(function () {
'use strict';
const HW = window.HW;
const { LEAGUES, ORDER, esc, todayCT, addDays, compact, dayLabel, relDay, timeCT, scoreboard, isLive, isFav, interest, S, allToday, cache, favs } = HW;
const { tileHTML } = HW.render;
const $main = document.getElementById('main');
const $fresh = document.getElementById('fresh'), $freshText = document.getElementById('freshText');
const $strip = document.getElementById('strip'), $stripDate = document.getElementById('stripDate'), $stripCount = document.getElementById('stripCount'), $stripWrap = document.getElementById('stripWrap');
const $sub = document.getElementById('subnav');

/* ---------- freshness ---------- */
function paintFresh() {
  const live = allToday().filter(isLive).length;
  const age = Date.now() - S.lastOk;
  $fresh.classList.toggle('live', live > 0 && !S.err && age < 120000);
  $fresh.classList.toggle('stale', !S.err && S.lastOk > 0 && age >= 120000 && live > 0);
  $fresh.classList.toggle('err', S.err);
  if (S.err) $freshText.textContent = S.lastOk ? `Feed not responding · last ${new Date(S.lastOk).toLocaleTimeString('en-US', { timeZone: HW.TZ, hour: 'numeric', minute: '2-digit' })}` : 'Feed not responding · retrying';
  else if (!S.lastOk) $freshText.textContent = 'Loading…';
  else $freshText.textContent = `${live ? live + ' live · ' : ''}updated ${timeCT(new Date(S.lastOk))} CT`;
}
setInterval(paintFresh, 5000);

/* ---------- strip ---------- */
let stripFallback = null;
async function paintStrip() {
  const lk = S.league; const L = lk && LEAGUES[lk];
  let games = L ? S.today[lk] : allToday();
  const scope = L ? L.label : 'All basketball';
  if (games.length) {
    const sorted = [...games].sort((a, b) => (a.state === 'post') - (b.state === 'post') || interest(b) - interest(a) || new Date(a.date) - new Date(b.date));
    const cap = L ? 60 : 40;
    $stripDate.textContent = `${relDay(S.todayYmd) === 'Tonight' ? 'Tonight' : dayLabel(S.todayYmd)} · ${scope}`;
    const live = games.filter(isLive).length, fin = games.filter(g => g.state === 'post').length;
    $stripCount.textContent = `${games.length} game${games.length > 1 ? 's' : ''}${live ? ` · ${live} live` : ''}${fin && fin < games.length ? ` · ${fin} final` : ''}`;
    $strip.innerHTML = sorted.slice(0, cap).map(g => tileHTML(g, !L)).join('') + (sorted.length > cap ? `<a class="tile more" href="#${lk || 'nba'}/games">+${sorted.length - cap} more</a>` : '');
  } else {
    const key = lk || 'all';
    if (!stripFallback || stripFallback.key !== key) {
      const Ls = L ? [L] : ORDER.map(k => LEAGUES[k]);
      let y = (await Promise.all(Ls.map(x => scoreboard(x, addDays(S.todayYmd, -1)).catch(() => [])))).flat();
      let next = null;
      for (let i = 1; i <= 10 && !next; i++) { const d = addDays(S.todayYmd, i); const gs = (await Promise.all(Ls.map(x => scoreboard(x, d).catch(() => [])))).flat(); if (gs.length) next = { d, n: gs.length }; }
      stripFallback = { key, y: y.sort((a, b) => interest(b) - interest(a)), next };
    }
    const { y, next } = stripFallback;
    $stripDate.textContent = L ? `No ${L.noun} games today` : 'No games today';
    $stripCount.textContent = next ? `Next: ${dayLabel(next.d, { weekday: 'short', month: 'short', day: 'numeric' })} · ${next.n} games` : (L && L.key === 'wnba' ? 'Off-season until May' : '');
    $strip.innerHTML = y.length ? `<div class="tile-empty">Last night</div>` + y.slice(0, 40).map(g => tileHTML(g, !L)).join('') : `<div class="tile-empty">${L && L.key === 'wnba' ? 'The WNBA is in its off-season.' : 'Off day.'}</div>`;
  }
  games.forEach(g => [g.home, g.away].forEach(s => { const k = `${g.id}-${s.id}`, prev = S.prevScores[k]; if (prev != null && s.score != null && s.score !== prev) $strip.querySelector(`[data-k="${k}"]`)?.classList.add('bump'); S.prevScores[k] = s.score; }));
}

/* ---------- polling ---------- */
async function tick() {
  clearTimeout(S.timer);
  const ymd = todayCT();
  if (ymd !== S.todayYmd) { S.todayYmd = ymd; stripFallback = null; }
  const results = await Promise.all(ORDER.map(k => scoreboard(LEAGUES[k], ymd, 0).then(v => ({ k, v })).catch(() => ({ k, err: true }))));
  const anyOk = results.some(r => !r.err);
  results.forEach(r => { if (!r.err) S.today[r.k] = r.v; });
  if (anyOk) { S.lastOk = Date.now(); S.err = false; } else S.err = true;
  paintFresh();
  await paintStrip();
  if (S.route && S.route.live) { try { await S.route.live(); } catch (e) { console.error(e); } }
  const all = allToday();
  const anyLive = all.some(isLive);
  const soon = all.some(g => g.state === 'pre' && new Date(g.date) - Date.now() < 30 * 60000);
  const delay = S.err ? 30000 : anyLive ? 30000 : soon ? 60000 : 300000;
  if (!document.hidden) S.timer = setTimeout(tick, delay);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); else clearTimeout(S.timer); });

/* ---------- router ---------- */
const LEGACY = { tonight: 'nba', games: 'nba/games', standings: 'nba/standings', teams: 'nba/teams', players: 'nba/players', forecasts: 'nba/forecasts', wire: 'nba/wire' };
function parseHash() {
  let h = (location.hash || '#home').slice(1);
  // legacy ThunderBase links: #tonight, #game-123, #team-25, #games-20261024 …
  const lm = h.match(/^(tonight|games|game|standings|teams|team|players|player|forecasts|wire)(?:-([A-Za-z0-9]+))?$/);
  if (lm && !LEAGUES[lm[1]]) h = `nba/${lm[1] === 'tonight' ? '' : lm[1]}${lm[2] ? '-' + lm[2] : ''}`.replace(/\/$/, '');
  if (h === 'home' || h === '') return { name: 'home', L: null, arg: null };
  if (h === 'record') return { name: 'record', L: null, arg: null };
  const m = h.match(/^([a-z]+)(?:\/([a-z]+)(?:-([A-Za-z0-9]+))?)?$/);
  if (!m || !LEAGUES[m[1]]) return { name: 'home', L: null, arg: null };
  const L = LEAGUES[m[1]]; const view = m[2] || 'tonight';
  if (!HW.views[view] || view === 'home' || view === 'record') return { name: 'tonight', L, arg: null };
  if (view === 'rankings' && !L.hasRankings) return { name: 'tonight', L, arg: null };
  return { name: view, L, arg: m[3] || null };
}
const SUB = [['', 'Tonight'], ['games', 'Games'], ['standings', 'Standings'], ['rankings', 'Rankings'], ['teams', 'Teams'], ['players', 'Players'], ['forecasts', 'Forecasts'], ['wire', 'Wire']];
function paintNav(r) {
  const lk = r.L ? r.L.key : null;
  document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === (lk || r.name)));
  if (r.L) {
    const L = r.L; const cur = r.name === 'game' ? 'games' : r.name === 'team' ? 'teams' : r.name === 'player' ? 'players' : r.name === 'tonight' ? '' : r.name;
    $sub.innerHTML = SUB.filter(([v]) => v !== 'rankings' || L.hasRankings).map(([v, l]) => `<a href="#${L.key}${v ? '/' + v : ''}" class="${v === cur ? 'on' : ''}">${l}</a>`).join('');
    $sub.hidden = false;
  } else { $sub.hidden = true; $sub.innerHTML = ''; }
}
let navSeq = 0;
async function route() {
  const r = parseHash();
  const seq = ++navSeq;
  S.league = r.L ? r.L.key : null;
  paintNav(r);
  S.route = null;
  if (!S.lastOk && !S.err) await tick(); else paintStrip();
  try {
    const res = r.L ? await HW.views[r.name](r.L, r.arg) : await HW.views[r.name](r.arg);
    if (seq === navSeq) S.route = res || null;
  } catch (e) { console.error(e); if (seq === navSeq) $main.innerHTML = HW.render.failMsg('this page'); }
  const names = { home: 'Hardwood', record: 'Our record', tonight: 'Tonight', games: 'Games', game: 'Game', standings: 'Standings', rankings: 'Rankings', teams: 'Teams', team: 'Team', players: 'Players', player: 'Player', forecasts: 'Forecasts', wire: 'The wire' };
  document.title = r.name === 'home' ? 'Hardwood' : `${names[r.name] || ''}${r.L ? ' · ' + r.L.short : ''} · Hardwood`;
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
    if (a === 'fav') { const on = favs.toggle(act.dataset.lk, act.dataset.id); act.textContent = on ? '★ Favorite' : '☆ Add to my teams'; act.setAttribute('aria-pressed', on); return; }
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
