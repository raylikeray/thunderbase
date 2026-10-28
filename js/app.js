/* Tipoff — shell: freshness, polling, router, delegated actions. */
(function () {
'use strict';
const HW = window.HW;
const { LEAGUES, ORDER, SPORTS, sportOf, todayCT, timeCT, scoreboard, isLive, S, allToday, cache, favs, store, params } = HW;
HW.route = () => route();
const $main = document.getElementById('main');
const $fresh = document.getElementById('fresh'), $freshText = document.getElementById('freshText');
const $ltabs = document.getElementById('ltabs'), $subnav = document.getElementById('subnav'), $sports = document.getElementById('sports');
const sportKey = lk => (LEAGUES[lk] || LEAGUES.nba).sport;
const sportDef = key => SPORTS.find(s => s.key === key) || SPORTS[0];
/* which league a sport opens on: the one last viewed in that sport, else its first */
const sportHome = key => { const d = sportDef(key); const last = store.get('lk:' + key, ''); return d.leagues.includes(last) ? last : d.leagues[0]; };

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
  SPORTS.forEach(sp => { const n = sp.leagues.reduce((t, k) => t + S.today[k].filter(isLive).length, 0); const a = $sports.querySelector(`[data-sport="${sp.key}"]`); if (a) { a.classList.toggle('live', n > 0); a.setAttribute('data-live', n || ''); } });
}
setInterval(paintFresh, 5000);

/* ---------- polling ---------- */
async function tick() {
  clearTimeout(S.timer);
  const ymd = todayCT();
  if (ymd !== S.todayYmd) S.todayYmd = ymd;
  S.polled = S.polled || {}; const F = favs.all(); const cur = sportKey(S.league || 'nba'); const now = Date.now();
  const due = ORDER.filter(k => sportKey(k) === cur || (F[k] || []).length || !S.polled[k] || now - S.polled[k] > 300000);
  const results = await Promise.all(due.map(k => scoreboard(LEAGUES[k], ymd, 0).then(v => ({ k, v })).catch(() => ({ k, err: true }))));
  const anyOk = results.some(r => !r.err);
  results.forEach(r => { if (!r.err) { S.today[r.k] = r.v; S.polled[r.k] = now; } });
  if (anyOk) { S.lastOk = Date.now(); S.err = false; } else S.err = true;
  paintFresh();
  try { checkAlerts(); } catch (e) { console.error(e); }
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
const anyFavs = () => Object.values(favs.all()).some(a => a.length);
const SECTIONS = ['center', 'scores', 'game', 'standings', 'rankings', 'teams', 'team', 'players', 'player', 'forecasts', 'injuries', 'news'];
const { lkOf, remember } = HW.render;
function parseHash() {
  let h = decodeURIComponent((location.hash || '').slice(1)).replace(/^\/+|\/+$/g, '');
  const LK = `(${ORDER.join('|')})`;
  if (h === 'my' || ((!h || h === 'home' || h === 'tonight') && anyFavs())) return { lk: lkOf(store.get('lk', 'nba')), name: 'my', args: [] };
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
  const L = LEAGUES[lk]; const sp = sportKey(lk); const onMy = name === 'my'; if (!onMy) store.set('lk:' + sp, lk);
  const F = favs.all(); const favLks = ORDER.filter(k => (F[k] || []).length);
  const key = `${sp}|${onMy ? 'my' : ''}|${favLks.join(',')}`;
  if ($sports.dataset.on !== key) {
    $sports.dataset.on = key;
    $sports.innerHTML = `<a href="#my" data-sport="my" class="star${onMy ? ' on' : ''}" aria-label="My teams" title="My teams">★</a>` + SPORTS.map(x => `<a href="#${sportHome(x.key)}" data-sport="${x.key}" class="${!onMy && x.key === sp ? 'on' : ''}"${!onMy && x.key === sp ? ' aria-current="true"' : ''}>${x.label}</a>`).join('');
    $ltabs.innerHTML = sportDef(sp).leagues.map(k => `<a href="#${k}" data-lk="${k}">${favLks.includes(k) ? '<i class="fv" aria-label="has my teams">★</i>' : ''}${LEAGUES[k].label}</a>`).join('');
    paintFresh();
  } else $sports.querySelectorAll('a[data-sport]').forEach(a => { if (a.dataset.sport !== 'my') a.href = '#' + sportHome(a.dataset.sport); });
  $ltabs.querySelectorAll('a').forEach(a => { const on = !onMy && a.dataset.lk === lk; a.classList.toggle('on', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  const sec = name === 'game' ? 'scores' : name === 'team' ? 'teams' : name === 'player' ? 'players' : name;
  const items = onMy ? [['my', 'My teams', '#my']] : [['center', 'Center', `#${lk}`], ['scores', 'Scores', `#${lk}/scores`], L.hasRankings ? ['rankings', 'Rankings', `#${lk}/rankings`] : null, ['standings', 'Standings', `#${lk}/standings`], ['teams', 'Teams', `#${lk}/teams`], ['players', 'Players', `#${lk}/players`], ['forecasts', 'Forecasts', `#${lk}/forecasts`], L.hasInjuries ? ['injuries', 'Injuries', `#${lk}/injuries`] : null, ['news', 'News', `#${lk}/news`]].filter(Boolean);
  $subnav.innerHTML = items.map(([k, l, h]) => `<a href="${h}" class="${k === sec ? 'on' : ''}"${k === sec ? ' aria-current="page"' : ''}>${l}</a>`).join('') + `<span class="d" id="subd"></span>`;
  if (!onMy) params(L).then(P => { const d = document.getElementById('subd'); if (d && P) d.textContent = HW.render.tuneLine(P, L); }).catch(() => { });
  // keep the active section in view on narrow screens
  const on = $subnav.querySelector('a.on'); if (on) { const L = on.offsetLeft, W = on.offsetWidth, sl = $subnav.scrollLeft, JW = $subnav.clientWidth; if (L < sl || L + W > sl + JW) $subnav.scrollLeft = Math.max(0, L - (JW - W) / 2); }
}
let navSeq = 0;
async function route() {
  const r = parseHash();
  const seq = ++navSeq;
  const sportChanged = S.lastOk && sportKey(r.lk) !== sportKey(S.league || r.lk);
  remember(r.lk); S.league = r.lk;
  paintNav(r.lk, r.name);
  S.route = null;
  if ((!S.lastOk && !S.err) || sportChanged) await tick();
  try {
    const res = await HW.views[r.name](...r.args);
    if (seq === navSeq) S.route = res || null;
  } catch (e) { console.error(e); if (seq === navSeq) $main.innerHTML = HW.render.failMsg('this page'); }
  const names = { my: 'My teams', center: '', scores: 'Scores', game: 'Game', standings: 'Standings', rankings: 'Rankings', teams: 'Teams', team: 'Team', players: 'Players', player: 'Player', forecasts: 'Forecasts', injuries: 'Injuries', news: 'News', record: 'The record' };
  S.baseHash = location.hash && !/^#m-/.test(location.hash) ? location.hash : (S.baseHash || '#');
  document.title = r.name === 'my' ? 'My teams · Tipoff' : r.name === 'center' ? `${LEAGUES[r.lk].label} · Tipoff` : r.name === 'record' ? 'The record · Tipoff' : `${LEAGUES[r.lk].label} ${names[r.name] || ''} · Tipoff`;
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
  if (/^#m-/.test(h)) { const el = document.getElementById(h.slice(1)); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } history.replaceState(null, '', S.baseHash || '#' + (S.league || 'nba')); return; }
  window.scrollTo({ top: 0 }); $main.focus({ preventScroll: true }); route();
});

/* ---------- delegated actions ---------- */
/* Android: try to open the service's app, then fall back to its web page. Chrome ignores an intent no installed app
   claims, so each attempt is followed by the next unless the page loses focus (the app came up). */
function launchApp(id, web, mine) {
  const tries = HW.launchTries(id); if (!tries.length) { location.href = web; return; }
  const list = (mine ? tries : tries.slice(0, 2)).slice(0, 5);
  let i = 0, done = false, timer = 0;
  const stop = () => { done = true; clearTimeout(timer); document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', onHide); window.removeEventListener('blur', onHide); };
  const onHide = () => stop();
  document.addEventListener('visibilitychange', onHide); window.addEventListener('pagehide', onHide); window.addEventListener('blur', onHide);
  toast(`Opening ${HW.SERVICES[id] ? HW.SERVICES[id].short : 'the app'}…`);
  const step = () => { if (done) return; if (i >= list.length) { stop(); toast(''); location.href = web; return; } location.href = list[i++]; timer = setTimeout(step, 900); };
  step();
}
function toast(msg) { let t = document.getElementById('toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); } t.textContent = msg; t.classList.toggle('on', !!msg); clearTimeout(toast.t); if (msg) toast.t = setTimeout(() => t.classList.remove('on'), 6000); }
document.addEventListener('click', e => {
  const la = e.target.closest('a[data-launch]');
  if (la) { e.preventDefault(); launchApp(la.dataset.launch, la.getAttribute('href'), la.dataset.mine === '1'); return; }
  const act = e.target.closest('[data-act]');
  if (act) {
    const a = act.dataset.act;
    if (a === 'fc') { const k = 'fc-' + act.dataset.id; S.open.has(k) ? S.open.delete(k) : S.open.add(k); const on = S.open.has(k); document.querySelectorAll('#fcd-' + CSS.escape(act.dataset.id)).forEach(el => el.hidden = !on); act.setAttribute('aria-expanded', on); act.textContent = on ? 'Hide' : 'Why'; return; }
    if (a === 'stmode') { HW.views.standings.render(act.dataset.m); return; }
    if (a === 'psort') { HW.views.players.st.sort = act.dataset.k; HW.views.players.paint ? HW.views.players.paint() : route(); return; }
    if (a === 'pmore') { HW.views.players.st.limit += 100; HW.views.players.paint(); return; }
    if (a === 'pcat') { e.preventDefault(); if (HW.views.players.setCat) HW.views.players.setCat(act.dataset.k); return; }
    if (a === 'fav') { const on = favs.toggle(act.dataset.lk, act.dataset.id); act.textContent = on ? '★ In my teams' : '☆ Add to my teams'; act.setAttribute('aria-pressed', on); return; }
    if (a === 'reload') { e.preventDefault(); cache.clear(); tick().then(route); return; }
    if (a === 'pick') { e.preventDefault(); HW.render.pickerOpen(act.dataset.lk, { section: act.dataset.section }); return; }
    if (a === 'watchsvc') { const cur = HW.myServices(); const id = act.dataset.id; store.set('watch', cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]); HW.render.pickerRefreshServices(); return; }
    if (a === 'picklk') { HW.render.pickerOpen(act.dataset.lk); return; }
    if (a === 'updates') { e.preventDefault(); HW.render.pickerOpen(S.league || 'nba', { updates: 'only' }); return; }
    if (a === 'nkind') { const P = HW.render.notifyPrefs(); P[act.dataset.k] = act.checked; store.set('notify', P); syncPushSoon(); return; }
    if (a === 'noff') { e.preventDefault(); const P = HW.render.notifyPrefs(); P.on = false; store.set('notify', P); unsubscribePush(); HW.render.pickerRefreshUpdates(); paintBell(); return; }
    if (a === 'non') { e.preventDefault(); enableNotify(); return; }
    if (a === 'pickt') { const on = favs.toggle(act.dataset.lk, act.dataset.id); act.classList.toggle('on', on); act.setAttribute('aria-pressed', on); syncPushSoon(); return; }
    if (a === 'pickdone') { const d = document.getElementById('pick'); if (d) d.close(); return; }
    if (a === 'nofavs') { store.set('nofavs:' + act.dataset.lk, true); const el = document.getElementById('m-my'); if (el) el.remove(); return; }
    if (a === 'install') { e.preventDefault(); if (S.installEvt) { S.installEvt.prompt(); S.installEvt.userChoice.then(() => { S.installEvt = null; paintInstall(); }); } return; }
    if (a === 'install-later') { e.preventDefault(); store.set('installSnooze', Date.now()); paintInstall(); return; }
  }
  const jl = e.target.closest('.jump a[href^="#m-"]');
  if (jl) { e.preventDefault(); const el = document.getElementById(jl.getAttribute('href').slice(1)); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  const tr = e.target.closest('[data-href]');
  if (tr && !e.target.closest('a,button,input,select')) { location.hash = tr.dataset.href.slice(1); }
});
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('[data-href][tabindex]')) { e.preventDefault(); location.hash = e.target.dataset.href.slice(1); } });
document.addEventListener('change', e => { const el = e.target.closest('[data-act="nscore"]'); if (el) { const P = HW.render.notifyPrefs(); P.score = el.value; store.set('notify', P); syncPushSoon(); } });
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
  el.innerHTML = `<img src="img/mark.svg" alt="" width="34" height="34"><div><b>Put Tipoff on your home screen.</b> ${ios ? 'Tap <span class="kbd">Share</span> then <span class="kbd">Add to Home Screen</span>. It opens full screen like an app.' : 'It opens full screen like an app, no browser bar.'}</div>${canPrompt ? '<button class="btn sm" data-act="install">Install</button>' : ''}<button class="btn sm ghost" data-act="install-later" aria-label="Not now">Not now</button>`;
  document.body.appendChild(el);
}
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); S.installEvt = e; paintInstall(); });
window.addEventListener('appinstalled', () => { S.installEvt = null; paintInstall(); });
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
setTimeout(paintInstall, 2500);

/* ---------- updates for my teams (while Tipoff is open or installed) ---------- */
const { notifyPrefs, notifySupport } = HW.render;
function paintBell() { const b = document.getElementById('bell'); if (!b) return; const P = notifyPrefs(); b.classList.toggle('on', !!(P.on && 'Notification' in window && Notification.permission === 'granted')); }
async function enableNotify() {
  const sup = notifySupport(); if (!sup.ok) { HW.render.pickerRefreshUpdates(); return; }
  let perm = Notification.permission; if (perm !== 'granted') { try { perm = await Notification.requestPermission(); } catch { } }
  const P = notifyPrefs(); P.on = perm === 'granted'; store.set('notify', P); HW.render.pickerRefreshUpdates(); paintBell();
  if (P.on) { const pushed = await syncPush(); if (!pushed) notify('Tipoff updates are on', 'You will hear about your teams: pregame, close games, finals, injuries, trades.', { tag: 'welcome' }); HW.render.pickerRefreshUpdates(); }
}
/* push subscription: registered with the Tipoff push server (push/worker.js) when one is configured */
const favTeams = () => { const F = favs.all(); return ORDER.flatMap(lk => (F[lk] || []).map(id => `${lk}:${id}`)); };
let syncT = 0; function syncPushSoon() { clearTimeout(syncT); syncT = setTimeout(() => syncPush().catch(() => { }), 800); }
async function syncPush() {
  const cfg = HW.PUSH; const P = notifyPrefs();
  if (!cfg || !cfg.url || !P.on || !('PushManager' in window) || !('Notification' in window) || Notification.permission !== 'granted') return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64(cfg.key) });
    const r = await fetch(cfg.url.replace(/\/$/, '') + '/subscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sub: sub.toJSON(), teams: favTeams(), prefs: { pre: P.pre, close: P.close, final: P.final, inj: P.inj, moves: P.moves, score: P.score } }) });
    const ok = r.ok; store.set('push:active', ok); if (ok && !store.get('push:welcomed', false)) { store.set('push:welcomed', true); fetch(cfg.url.replace(/\/$/, '') + '/test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => { }); }
    return ok;
  } catch (e) { console.warn('push subscribe failed', e); store.set('push:active', false); return false; }
}
async function unsubscribePush() {
  const cfg = HW.PUSH; store.set('push:active', false);
  try { const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription(); if (sub) { if (cfg && cfg.url) fetch(cfg.url.replace(/\/$/, '') + '/unsubscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => { }); await sub.unsubscribe(); } } catch { }
}
const urlB64 = s => { const p = '='.repeat((4 - s.length % 4) % 4); const b = (s + p).replace(/-/g, '+').replace(/_/g, '/'); const raw = atob(b); return Uint8Array.from(raw, c => c.charCodeAt(0)); };
async function notify(title, body, opts = {}) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const o = { body, icon: 'img/icon-192.png', badge: 'img/icon-192.png', tag: opts.tag, renotify: false, data: { url: opts.url || location.href } };
  try { const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration(); if (reg && reg.showNotification) return reg.showNotification(title, o); } catch { }
  try { const n = new Notification(title, o); n.onclick = () => { window.focus(); if (opts.url) location.hash = opts.url.replace(/^.*#/, ''); n.close(); }; } catch { }
}
const seenAlert = (k) => { const s = store.get('alerts:seen', {}); return s[k]; };
const markAlert = (k) => { const s = store.get('alerts:seen', {}); s[k] = Date.now(); const keys = Object.keys(s); if (keys.length > 400) keys.slice(0, keys.length - 400).forEach(x => delete s[x]); store.set('alerts:seen', s); };
function lateAndClose(L, g) {
  if (g.state !== 'in') return false;
  const margin = Math.abs((g.home.score || 0) - (g.away.score || 0));
  const reg = L.periods || 4; const last = g.period >= reg;
  if (L.sport === 'baseball') return last && margin <= 2;                       // 9th inning or later, within two runs
  const [mm] = String(g.clock || '0:00').split(':').map(Number);
  if (L.sport === 'football') return last && margin <= 8 && (mm || 0) < 5;      // one-score game, under five minutes
  return last && margin <= 5 && (mm || 0) < 3;
}
function checkAlerts() {
  const P = notifyPrefs(); if (!P.on || !('Notification' in window) || Notification.permission !== 'granted') return;
  if (store.get('push:active', false)) return;   // the push server handles it, even with Tipoff closed
  const F = favs.all();
  ORDER.forEach(lk => {
    const L = LEAGUES[lk]; const mine = F[lk] || []; if (!mine.length) return;
    S.today[lk].forEach(g => {
      if (!mine.includes(g.home.id) && !mine.includes(g.away.id)) return;
      const key = `${lk}:${g.id}`; const url = `#${lk}/game/${g.id}`; const name = `${g.away.abbr} at ${g.home.abbr}`;
      const mins = (new Date(g.date) - Date.now()) / 60000;
      if (P.pre && g.state === 'pre' && mins > 0 && mins <= 30 && !seenAlert(key + ':pre')) { markAlert(key + ':pre'); HW.forecastCtx(L, S.todayYmd).catch(() => null).then(ctx => { let fc = ''; try { if (ctx) { const f = HW.forecast(L, g, ctx); const fav = f.pHome >= .5 ? g.home : g.away; fc = ` · model ${fav.abbr} ${Math.round(Math.max(f.pHome, 1 - f.pHome) * 100)}%`; const so = (f.soH && mine.includes(g.home.id)) ? f.soH : (f.soA && mine.includes(g.away.id)) ? f.soA : null; if (so) fc += ` · ${so.names.length > 1 ? so.names.length + ' out' : so.name + ' out'}`; } } catch { } notify(`${name} ${L.verb || 'starts'} in ${Math.round(mins)} min`, `${HW.tip(g.date)} CT${g.tv.label ? ' · ' + g.tv.label : ''}${fc}`, { tag: key + ':pre', url }); }); }
      if (P.close && lateAndClose(L, g) && !seenAlert(key + ':close')) { markAlert(key + ':close'); notify(`Close one: ${g.away.abbr} ${g.away.score}, ${g.home.abbr} ${g.home.score}`, `${g.detail} · open Tipoff`, { tag: key + ':close', url }); }
      if (P.final && g.state === 'post' && seenAlert(key + ':live') && !seenAlert(key + ':final')) { markAlert(key + ':final'); const w = g.home.score > g.away.score ? g.home : g.away, l = w === g.home ? g.away : g.home; notify(`Final: ${w.abbr} ${w.score}, ${l.abbr} ${l.score}`, `${w.short} ${mine.includes(w.id) ? 'win' : 'beat ' + l.short}`, { tag: key + ':final', url }); }
      if (g.state === 'in' && !seenAlert(key + ':live')) markAlert(key + ':live');
    });
  });
  const now = Date.now();
  if (P.inj && now - (S.injCheck || 0) > 15 * 60000) { S.injCheck = now; checkInjuryChanges(F); }
  if (P.moves && now - (S.moveCheck || 0) > 30 * 60000) { S.moveCheck = now; checkMoves(F); }
}
async function checkInjuryChanges(F) {
  for (const lk of ORDER) {
    const L = LEAGUES[lk]; const mine = F[lk] || []; if (!mine.length || !L.hasInjuries) continue;
    const inj = await HW.injuries(L).catch(() => null); if (!inj) continue;
    const prev = store.get('inj:' + lk, null); const cur = {};
    mine.forEach(id => { const t = inj.byTeam[id]; if (t) t.list.forEach(x => { if (/out|suspen/i.test(x.status || '')) cur[x.athlete.id] = { n: x.athlete.displayName, t: (t.name || '').split(' ').pop(), s: x.status, d: x.details && x.details.type || '' }; }); });
    if (prev) {
      Object.entries(cur).forEach(([id, x]) => { if (!prev[id]) notify(`${x.t}: ${x.n} out`, `${x.d || x.s}${x.d ? ' · ' + x.s : ''}`, { tag: 'inj:' + id, url: `#${lk}/injuries` }); });
      Object.entries(prev).forEach(([id, x]) => { if (!cur[id]) notify(`${x.t}: ${x.n} off the injury report`, 'No longer listed out', { tag: 'inj:' + id + ':back', url: `#${lk}/injuries` }); });
    }
    store.set('inj:' + lk, cur);
  }
}
async function checkMoves(F) {
  for (const lk of ORDER) {
    const L = LEAGUES[lk]; const mine = F[lk] || []; if (!mine.length || !L.hasTransactions) continue;
    const d = await HW.jSoft(`${HW.API(L)}/transactions?limit=40`, 600000); if (!d || !d.transactions) continue;
    const last = store.get('moves:' + lk, null); let newest = last;
    d.transactions.forEach(x => { const tid = x.team && String(x.team.id); const t = x.date || ''; if (!tid || !mine.includes(tid)) return; if (!newest || t > newest) newest = t; if (last && t > last) notify(`${x.team.displayName}: transaction`, x.description, { tag: 'mv:' + t + tid, url: `#${lk}/news/moves` }); });
    if (newest) store.set('moves:' + lk, newest);
  }
}
if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.url) location.hash = e.data.url.replace(/^.*#/, ''); if (e.data && e.data.resync) syncPushSoon(); });

/* ---------- boot ---------- */
S.todayYmd = todayCT();
tick().then(route).then(() => { paintBell(); if (notifyPrefs().on) syncPushSoon(); if (!store.get('onboarded', false) && !Object.values(favs.all()).some(a => a.length)) HW.render.pickerOpen(S.league || 'nba', { welcome: true }); });
})();
