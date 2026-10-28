/* Hardwood — shell: freshness, polling, router, delegated actions. */
(function () {
'use strict';
const HW = window.HW;
const { LEAGUES, ORDER, todayCT, timeCT, scoreboard, isLive, S, allToday, cache, favs, store, params } = HW;
HW.route = () => route();
const $main = document.getElementById('main');
const $fresh = document.getElementById('fresh'), $freshText = document.getElementById('freshText');
const $ltabs = document.getElementById('ltabs'), $subnav = document.getElementById('subnav');

/* ---------- freshness ---------- */
function paintFresh() {
  const live = allToday().filter(isLive).length;
  const age = Date.now() - S.lastOk;
  $fresh.classList.toggle('live', live > 0 && !S.err && age < 120000);
  $fresh.classList.toggle('stale', !S.err && S.lastOk > 0 && age >= 120000 && live > 0);
  $fresh.classList.toggle('err', S.err);
  if (S.err) $freshText.textContent = S.lastOk ? `Feed down · last ${new Date(S.lastOk).toLocaleTimeString('en-US', { timeZone: HW.TZ, hour: 'numeric', minute: '2-digit' })}` : 'Feed down · retrying';
  else if (!S.lastOk) $freshText.textContent = 'Loading…';
  else $freshText.textContent = `${live ? live + ' live · ' : ''}${timeCT(new Date(S.lastOk))} CT`;
  const short = document.getElementById('freshShort'); if (short) short.textContent = S.err ? 'feed down' : !S.lastOk ? '…' : live ? `${live} live` : new Date(S.lastOk).toLocaleTimeString('en-US', { timeZone: HW.TZ, hour: 'numeric', minute: '2-digit' });
  ORDER.forEach(k => { const n = S.today[k].filter(isLive).length; const a = $ltabs.querySelector(`[data-lk="${k}"]`); if (a) { a.classList.toggle('live', n > 0); a.setAttribute('data-live', n || ''); } });
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
   #<league>                       the league's command center
   #<league>/scores[/yyyymmdd]     #<league>/game/<id>
   #<league>/standings             #<league>/rankings (college)
   #<league>/teams                 #<league>/team/<id>
   #<league>/players               #<league>/player/<id>
   #<league>/forecasts             #<league>/injuries (NBA, WNBA)
   #<league>/news[/moves]          #record
   Older links (#scores/nba/…, #game/nba/123, #nba/game-123, #game-123 …) are mapped onto these. */
const SECTIONS = ['center', 'scores', 'game', 'standings', 'rankings', 'teams', 'team', 'players', 'player', 'forecasts', 'injuries', 'news'];
const { lkOf, remember } = HW.render;
function parseHash() {
  let h = decodeURIComponent((location.hash || '').slice(1)).replace(/^\/+|\/+$/g, '');
  const LK = '(nba|wnba|ncaam|ncaaw)';
  if (!h || h === 'home' || h === 'tonight' || h === 'scores' || h === 'forecasts') { const lk = lkOf(store.get('lk', 'nba')); return { lk, name: h === 'scores' || h === 'forecasts' ? h : 'center', args: [lk] }; }
  if (h === 'record') return { lk: lkOf(store.get('lk', 'nba')), name: 'record', args: [] };
  let m;
  // v4: nba, nba/scores/20261028, nba/game/401…, ncaam/rankings …
  if ((m = h.match(new RegExp(`^${LK}(?:/([a-z]+)(?:/([^/]+))?)?$`)))) { const lk = m[1], v = m[2] || 'center', a = m[3]; if (SECTIONS.includes(v)) return { lk, name: v, args: a ? [lk, a] : [lk] }; }
  // v3: scores/nba/20261028, game/nba/401…, standings/nba, news/nba/injuries …
  if ((m = h.match(new RegExp(`^(scores|game|standings|rankings|teams|team|players|player|forecasts|news)(?:/${LK}|/all)?(?:/([^/]+))?$`)))) { const name = m[1], lk = m[2] || lkOf(store.get('lk', 'nba')), a = m[3]; if (name === 'news' && a === 'injuries') return { lk, name: 'injuries', args: [lk] }; return { lk, name, args: a ? [lk, a] : [lk] }; }
  // v2: nba/games-20261024, nba/game-123, nba/team-25, nba/wire-injuries …
  if ((m = h.match(new RegExp(`^${LK}/([a-z]+)-([A-Za-z0-9]+)$`)))) { const lk = m[1]; const map = { games: 'scores', game: 'game', team: 'team', player: 'player', wire: m[3] === 'injuries' ? 'injuries' : 'news' }; const name = map[m[2]] || 'center'; return { lk, name, args: name === 'injuries' || name === 'center' ? [lk] : [lk, m[2] === 'wire' ? (m[3] === 'transactions' ? 'moves' : null) : m[3]].filter(Boolean) }; }
  // v1: game-123, team-25, games-20261024 (NBA only)
  if ((m = h.match(/^(games|game|standings|teams|team|players|player|forecasts|wire)(?:-([A-Za-z0-9]+))?$/))) { const map = { games: 'scores', wire: 'news' }; const name = map[m[1]] || m[1]; return { lk: 'nba', name, args: m[2] ? ['nba', m[2]] : ['nba'] }; }
  { const lk = lkOf(store.get('lk', 'nba')); return { lk, name: 'center', args: [lk] }; }
}
function paintNav(lk, name) {
  const L = LEAGUES[lk];
  $ltabs.querySelectorAll('a').forEach(a => { const on = a.dataset.lk === lk; a.classList.toggle('on', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  const sec = name === 'game' ? 'scores' : name === 'team' ? 'teams' : name === 'player' ? 'players' : name;
  const items = [['center', 'Center', `#${lk}`], ['scores', 'Scores', `#${lk}/scores`], L.hasRankings ? ['rankings', 'Rankings', `#${lk}/rankings`] : null, ['standings', 'Standings', `#${lk}/standings`], ['teams', 'Teams', `#${lk}/teams`], ['players', 'Players', `#${lk}/players`], ['forecasts', 'Forecasts', `#${lk}/forecasts`], L.hasInjuries ? ['injuries', 'Injuries', `#${lk}/injuries`] : null, ['news', 'News', `#${lk}/news`], ['record', 'Record', '#record']].filter(Boolean);
  $subnav.innerHTML = items.map(([k, l, h]) => `<a href="${h}" class="${k === sec ? 'on' : ''}"${k === sec ? ' aria-current="page"' : ''}>${l}</a>`).join('') + `<span class="d" id="subd"></span>`;
  params(L).then(P => { const d = document.getElementById('subd'); if (d && P) d.textContent = HW.render.tuneLine(P); }).catch(() => { });
  // keep the active section in view on narrow screens
  const on = $subnav.querySelector('a.on'); if (on) { const L = on.offsetLeft, W = on.offsetWidth, sl = $subnav.scrollLeft, JW = $subnav.clientWidth; if (L < sl || L + W > sl + JW) $subnav.scrollLeft = Math.max(0, L - (JW - W) / 2); }
}
let navSeq = 0;
async function route() {
  const r = parseHash();
  const seq = ++navSeq;
  remember(r.lk); S.league = r.lk;
  paintNav(r.lk, r.name);
  S.route = null;
  if (!S.lastOk && !S.err) await tick();
  try {
    const res = await HW.views[r.name](...r.args);
    if (seq === navSeq) S.route = res || null;
  } catch (e) { console.error(e); if (seq === navSeq) $main.innerHTML = HW.render.failMsg('this page'); }
  const names = { center: '', scores: 'Scores', game: 'Game', standings: 'Standings', rankings: 'Rankings', teams: 'Teams', team: 'Team', players: 'Players', player: 'Player', forecasts: 'Forecasts', injuries: 'Injuries', news: 'News', record: 'The record' };
  document.title = r.name === 'center' ? `${LEAGUES[r.lk].label} · Hardwood` : r.name === 'record' ? 'The record · Hardwood' : `${LEAGUES[r.lk].label} ${names[r.name] || ''} · Hardwood`;
  // in-page jump bar: highlight the module at the top of the screen
  const jump = document.querySelector('.jump');
  if (jump) {
    const links = [...jump.querySelectorAll('a')]; const els = links.map(a => document.getElementById(a.getAttribute('href').slice(1)));
    const reveal = a => { const L = a.offsetLeft, W = a.offsetWidth, sl = jump.scrollLeft, JW = jump.clientWidth; if (L < sl) jump.scrollLeft = Math.max(0, L - 8); else if (L + W > sl + JW) jump.scrollLeft = L + W - JW + 8; };
    let raf = 0; S.jumpOn = -1;
    const paint = () => { raf = 0; let best = 0; els.forEach((el, i) => { if (el && el.getBoundingClientRect().top <= 72) best = i; }); if (best === S.jumpOn) return; S.jumpOn = best; links.forEach((a, i) => a.classList.toggle('on', i === best)); reveal(links[best]); };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(paint); };
    window.removeEventListener('scroll', S.jumpScroll); S.jumpScroll = onScroll; window.addEventListener('scroll', onScroll, { passive: true }); paint();
  } else if (S.jumpScroll) { window.removeEventListener('scroll', S.jumpScroll); S.jumpScroll = null; }
}
window.addEventListener('hashchange', () => {
  const h = location.hash;
  if (/^#m-/.test(h)) { const el = document.getElementById(h.slice(1)); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } history.replaceState(null, '', '#' + (S.league || 'nba')); return; }
  window.scrollTo({ top: 0 }); $main.focus({ preventScroll: true }); route();
});

/* ---------- delegated actions ---------- */
document.addEventListener('click', e => {
  const act = e.target.closest('[data-act]');
  if (act) {
    const a = act.dataset.act;
    if (a === 'ai') { const k = 'ai-' + act.dataset.id; S.open.has(k) ? S.open.delete(k) : S.open.add(k); const on = S.open.has(k); const box = document.getElementById(k); if (box) box.hidden = !on; act.textContent = on ? 'Hide prediction' : 'Prediction'; act.setAttribute('aria-expanded', on); return; }
    if (a === 'fc') { const k = 'fc-' + act.dataset.id; S.open.has(k) ? S.open.delete(k) : S.open.add(k); const on = S.open.has(k); document.querySelectorAll('#fcd-' + CSS.escape(act.dataset.id)).forEach(el => el.hidden = !on); act.setAttribute('aria-expanded', on); act.textContent = on ? 'Hide' : (act.dataset.ai ? 'Prediction' : 'Why'); return; }
    if (a === 'stmode') { HW.views.standings.render(act.dataset.m); return; }
    if (a === 'psort') { HW.views.players.st.sort = act.dataset.k; HW.views.players.paint ? HW.views.players.paint() : route(); return; }
    if (a === 'pmore') { HW.views.players.st.limit += 100; HW.views.players.paint(); return; }
    if (a === 'fav') { const on = favs.toggle(act.dataset.lk, act.dataset.id); act.textContent = on ? '★ In my teams' : '☆ Add to my teams'; act.setAttribute('aria-pressed', on); return; }
    if (a === 'reload') { e.preventDefault(); cache.clear(); tick().then(route); return; }
    if (a === 'pick') { e.preventDefault(); HW.render.pickerOpen(act.dataset.lk); return; }
    if (a === 'pickt') { const on = favs.toggle(act.dataset.lk, act.dataset.id); act.classList.toggle('on', on); act.setAttribute('aria-pressed', on); return; }
    if (a === 'pickdone') { const d = document.getElementById('pick'); if (d) d.close(); return; }
    if (a === 'nofavs') { store.set('nofavs:' + act.dataset.lk, true); const el = document.getElementById('m-my'); if (el) el.remove(); return; }
    if (a === 'install') { e.preventDefault(); if (S.installEvt) { S.installEvt.prompt(); S.installEvt.userChoice.then(() => { S.installEvt = null; paintInstall(); }); } return; }
    if (a === 'install-later') { e.preventDefault(); store.set('installSnooze', Date.now()); paintInstall(); return; }
  }
  const jl = e.target.closest('.jump a[href^="#m-"]');
  if (jl) { e.preventDefault(); const el = document.getElementById(jl.getAttribute('href').slice(1)); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  const tr = e.target.closest('tr[data-href]');
  if (tr && !e.target.closest('a,button,input,select')) { location.hash = tr.dataset.href.slice(1); }
});
document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('th[data-act="psort"]')) { e.preventDefault(); e.target.click(); } });

/* ---------- install (home-screen app) ---------- */
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) && !window.MSStream;
function paintInstall() {
  const old = document.getElementById('install'); if (old) old.remove();
  if (standalone()) return;
  const snoozed = Date.now() - (store.get('installSnooze', 0) || 0) < 14 * 86400000; if (snoozed) return;
  const canPrompt = !!S.installEvt, ios = isIOS() && /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS/.test(navigator.userAgent);
  if (!canPrompt && !ios) return;
  const el = document.createElement('div'); el.id = 'install'; el.className = 'install';
  el.innerHTML = `<img src="img/mark.svg" alt="" width="34" height="34"><div><b>Put Hardwood on your home screen.</b> ${ios ? 'Tap <span class="kbd">Share</span> then <span class="kbd">Add to Home Screen</span>. It opens full screen like an app.' : 'It opens full screen like an app, no browser bar.'}</div>${canPrompt ? '<button class="btn sm" data-act="install">Install</button>' : ''}<button class="btn sm ghost" data-act="install-later" aria-label="Not now">Not now</button>`;
  document.body.appendChild(el);
}
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); S.installEvt = e; paintInstall(); });
window.addEventListener('appinstalled', () => { S.installEvt = null; paintInstall(); });
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
setTimeout(paintInstall, 2500);

/* ---------- boot ---------- */
S.todayYmd = todayCT();
tick().then(route);
})();
