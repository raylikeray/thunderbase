/* RIVL v5 — shell: routing, nav, polling, delegated actions. Views live in v5/views.js, data in js/core.js. */
(() => {
  'use strict';
  const { LEAGUES, ORDER, store, scoreboard, isLive, todayCT, S, esc } = HW;
  const V = HW.v5;
  const $main = document.getElementById('main'), $pills = document.getElementById('pills'), $tabs = document.getElementById('tabs'), $fresh = document.getElementById('fresh'), $toast = document.getElementById('toast');
  S.today = S.today || {}; ORDER.forEach(k => { S.today[k] = S.today[k] || []; });

  /* ---------- routes ----------
     #home #scores #standings #players #teams          league screens (league from the pills, remembered)
     #player/<lk>/<id> #team/<lk>/<id> #game/<lk>/<id>  entity screens
     #nba #wnba …                                       switch league, stay on the current league screen */
  const SCREENS = ['home', 'scores', 'standings', 'players', 'teams'];
  const lkOf = k => LEAGUES[k] ? k : 'nba';
  function route() {
    const h = (location.hash || '#home').slice(1);
    let m;
    if ((m = h.match(/^(player|team|game|article)\/([a-z]+)\/([A-Za-z0-9]+)$/))) return { name: m[1], lk: lkOf(m[2]), args: [lkOf(m[2]), m[3]] };
    if (LEAGUES[h]) { store.set('v5:lk', h); return { name: store.get('v5:screen', 'home'), lk: h, args: [h] }; }
    if (h === 'search') return { name: 'search', lk: lkOf(store.get('v5:lk', 'nba')), args: [] };
    const name = SCREENS.includes(h) ? h : 'home';
    const lk = lkOf(store.get('v5:lk', 'nba'));
    return { name, lk, args: [lk] };
  }

  /* ---------- nav ---------- */
  function paintPills(lk, show) {
    $pills.hidden = !show;
    if (!show) return;
    $pills.innerHTML = ORDER.map(k => { const n = S.today[k].filter(isLive).length; return `<a class="pill${k === lk ? ' on' : ''}" href="#${k}"${k === lk ? ' aria-current="page"' : ''}>${esc(LEAGUES[k].label)}${n ? `<span class="ct live">${n}</span>` : ''}</a>`; }).join('');
  }
  function paintTabs(name) {
    $tabs.querySelectorAll('.tab').forEach(t => { const on = t.dataset.tab === name; t.classList.toggle('on', on); if (on) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current'); });
  }
  const TITLES = { home: 'Home', scores: 'Scores', standings: 'Standings', players: 'Players', teams: 'Teams', search: 'Search' };

  /* ---------- render ---------- */
  let seq = 0, current = null;
  async function render() {
    const r = route(); const my = ++seq; current = r; V.refresh = null; closeSheet();
    const leagueScreen = SCREENS.includes(r.name);
    if (leagueScreen) store.set('v5:screen', r.name);
    if (r.name !== 'scores') store.set('v5:date', todayCT());
    document.getElementById('top').hidden = !leagueScreen;
    paintPills(r.lk, leagueScreen);
    paintTabs(leagueScreen ? r.name : (r.name === 'player' ? 'players' : r.name === 'team' ? 'teams' : r.name === 'game' ? 'scores' : r.name === 'article' ? 'home' : ''));
    document.title = leagueScreen ? `${TITLES[r.name]} · ${LEAGUES[r.lk].label} · RIVL` : 'RIVL';
    window.scrollTo(0, 0);
    try { await (V[r.name] || V.home)(...r.args); }
    catch (err) { if (my === seq) $main.innerHTML = `<div class="empty"><b>Something went wrong</b><p style="margin:6px 0 0">${esc(err && err.message || 'Try again in a moment.')}</p></div>`; console.error(err); }
    if (my !== seq) return;
    paintPills(r.lk, leagueScreen);   // live counts may have arrived while the view loaded
  }
  window.addEventListener('hashchange', render);

  /* ---------- polling: today's slate for every league, faster while something is live ---------- */
  let pollT = null, lastOk = 0;
  async function poll() {
    clearTimeout(pollT);
    const today = todayCT(); const r = current || route();
    const order = [r.lk, ...ORDER.filter(k => k !== r.lk)];
    let anyLive = false, failed = false;
    for (const k of order) {
      try { const g = await scoreboard(LEAGUES[k], today, k === r.lk ? 20000 : 60000); S.today[k] = g; if (g.some(isLive)) anyLive = true; }
      catch { failed = true; }
    }
    if (!failed) lastOk = Date.now();
    $fresh.classList.toggle('is-live', anyLive); $fresh.classList.toggle('is-err', failed && !lastOk); $fresh.classList.toggle('is-stale', failed && !!lastOk); $fresh.title = anyLive ? 'Games in progress' : failed ? 'Feed slow, showing the last good data' : 'Up to date';
    if (SCREENS.includes((current || route()).name)) paintPills((current || route()).lk, true);
    if (anyLive && current && (current.name === 'home' || current.name === 'scores')) refreshCards();
    if (V.refresh) { try { await V.refresh(); } catch { } }
    pollT = setTimeout(poll, anyLive || V.refresh ? 25000 : 90000);
  }
  /* swap live scores into the cards on screen without repainting the whole page */
  function refreshCards() {
    const r = current; if (!r) return; const L = LEAGUES[r.lk];
    const byId = new Map(S.today[r.lk].map(g => [g.id, g]));
    $main.querySelectorAll('[data-gid]').forEach(el => {
      const g = byId.get(el.dataset.gid); if (!g) return;
      const scores = el.querySelectorAll('.sc');
      if (el.classList.contains('hero')) { const sc = el.querySelector('.mid .sc'); const st = el.querySelector('.mid .st'); if (sc) { const txt = `${g.away.score ?? ''}–${g.home.score ?? ''}`; if (sc.textContent !== txt) { sc.innerHTML = `${g.away.score ?? ''}<i>–</i>${g.home.score ?? ''}`; sc.classList.remove('bump'); void sc.offsetWidth; sc.classList.add('bump'); } } if (st) st.textContent = g.state === 'in' ? g.detail : g.state === 'post' ? 'Final' : st.textContent; return; }
      if (scores.length === 2) { [g.away.score, g.home.score].forEach((v, i) => { const t = v == null ? '' : String(v); if (scores[i].textContent !== t) { scores[i].textContent = t; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); } }); }
      const live = el.querySelector('.status .live'); if (live && g.state === 'in') live.textContent = g.detail;
      if (g.state === 'post' && el.querySelector('.status .live')) render();   // a game just ended: let the view re-sort it into finals
    });
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });

  /* ---------- delegated actions ---------- */
  function toast(msg) { $toast.textContent = msg; $toast.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => $toast.classList.remove('on'), 1800); }
  document.addEventListener('click', e => {
    const back = e.target.closest('[data-act="back"]');
    if (back) { if (history.length > 1) { e.preventDefault(); history.back(); } return; }
    const row = e.target.closest('tr.click[data-href]');
    if (row && !e.target.closest('a')) { location.hash = row.dataset.href; return; }
    const act = e.target.closest('[data-act]'); if (!act) return;
    const a = act.dataset.act;
    if (a === 'follow-player') {
      e.preventDefault();
      let snap = null; try { snap = JSON.parse(act.dataset.snap); } catch { }
      if (!snap) return;
      const on = V.fplayers.toggle(snap);
      act.setAttribute('aria-pressed', String(on)); act.classList.toggle('on', on);
      if (act.classList.contains('star')) { act.innerHTML = on ? `<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 2.8 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.7l-5.9 3.1 1.2-6.5L2.5 9.7l6.6-.9z"/></svg>` : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="m12 2.8 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.7l-5.9 3.1 1.2-6.5L2.5 9.7l6.6-.9z"/></svg>`; act.setAttribute('aria-label', (on ? 'Unfollow ' : 'Follow ') + (snap.name || '')); }
      else act.innerHTML = (on ? `<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 2.8 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.7l-5.9 3.1 1.2-6.5L2.5 9.7l6.6-.9z"/></svg>` : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="m12 2.8 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.7l-5.9 3.1 1.2-6.5L2.5 9.7l6.6-.9z"/></svg>`) + (on ? 'Following' : 'Follow');
      toast(on ? `Following ${snap.short || snap.name}` : `Unfollowed ${snap.short || snap.name}`);
      $main.dispatchEvent(new CustomEvent('rivl:follow'));
    }
    if (a === 'mix') {
      e.preventDefault();
      const want = act.dataset.mix;
      $main.querySelectorAll('[data-act="mix"]').forEach(b => { const on = b.dataset.mix === want; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
      $main.querySelectorAll('[data-mix-panel]').forEach(p => { p.hidden = p.dataset.mixPanel !== want; });
    }
    if (a === 'share') {
      e.preventDefault();
      const url = location.href, title = act.dataset.title || 'RIVL';
      if (navigator.share) navigator.share({ title, url }).catch(() => { });
      else if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => toast('Link copied')).catch(() => toast(url));
    }
    if (a === 'updates') { e.preventDefault(); toast('Alerts come after launch'); }
    if (a === 'fav') {
      e.preventDefault();
      const on = HW.favs.toggle(act.dataset.lk, act.dataset.id);
      act.setAttribute('aria-pressed', String(on)); act.classList.toggle('on', on);
      const star = on ? `<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 2.8 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.7l-5.9 3.1 1.2-6.5L2.5 9.7l6.6-.9z"/></svg>` : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="m12 2.8 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.7l-5.9 3.1 1.2-6.5L2.5 9.7l6.6-.9z"/></svg>`;
      act.innerHTML = act.classList.contains('star') ? star : star + (on ? 'Following' : 'Follow');
      toast(on ? `Following ${act.dataset.name || 'team'}` : `Unfollowed ${act.dataset.name || 'team'}`);
      $main.dispatchEvent(new CustomEvent('rivl:fav'));
    }
    if (a === 'expand') { e.preventDefault(); $main.querySelectorAll(`[data-more="${act.dataset.more}"]`).forEach(el => { el.hidden = false; }); act.remove(); }
    if (a === 'stab') { e.preventDefault(); store.set('v5:stab:' + (current ? current.lk : 'nba'), act.dataset.tab); render(); }
    if (a === 'play') { e.preventDefault(); openSheet(act.dataset.vid); }
    if (a === 'date') { e.preventDefault(); store.set('v5:date', act.dataset.ymd); render(); }
  });

  /* ---------- video sheet: ESPN's own clip files, played here; the ESPN page is the fallback ---------- */
  const $sheet = document.getElementById('sheet');
  function closeSheet() { if (!$sheet || $sheet.hidden) return; const v = $sheet.querySelector('video'); if (v) { v.pause(); v.removeAttribute('src'); v.innerHTML = ''; v.load(); } $sheet.hidden = true; document.body.classList.remove('noscroll'); }
  function openSheet(vid) {
    const v = S.videos && S.videos[vid]; if (!v) { toast('That clip is not available'); return; }
    const L = v.links || {}; const src = L.source || {}; const web = L.web && L.web.href || (L.mobile && L.mobile.href) || '';
    const files = [];
    if (src.HLS && src.HLS.href) files.push([src.HLS.href, 'application/vnd.apple.mpegurl']);
    ['mezzanine', 'full', 'hds'].forEach(k => { if (src[k] && src[k].href && /\.mp4/i.test(src[k].href)) files.push([src[k].href, 'video/mp4']); });
    if (src.href && /\.mp4/i.test(src.href)) files.push([src.href, 'video/mp4']);
    if (L.mobile && L.mobile.source && L.mobile.source.href) files.push([L.mobile.source.href, 'video/mp4']);
    const seen = new Set(); const uniq = files.filter(([u]) => !seen.has(u) && seen.add(u));
    $sheet.querySelector('h3').textContent = v.headline || v.title || '';
    $sheet.querySelector('p').textContent = v.description || '';
    const out = $sheet.querySelector('#sheetOut'); out.href = web || '#'; out.hidden = !web;
    const fb = $sheet.querySelector('.fallback'); fb.hidden = true;
    const el = $sheet.querySelector('video'); el.innerHTML = uniq.map(([u, ty]) => `<source src="${esc(u)}" type="${ty}">`).join('');
    el.poster = v.thumbnail || (v.posterImages && v.posterImages.default && v.posterImages.default.href) || '';
    el.onerror = null; const lastSrc = el.querySelector('source:last-child'); if (lastSrc) lastSrc.addEventListener('error', () => { fb.hidden = false; }, { once: true });
    if (!uniq.length) fb.hidden = false;
    $sheet.hidden = false; document.body.classList.add('noscroll'); el.load(); const p = el.play(); if (p && p.catch) p.catch(() => { });
  }
  $sheet.addEventListener('click', e => { if (e.target === $sheet || e.target.closest('[data-act="close"]')) closeSheet(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });

  /* ---------- boot ---------- */
  render().then(poll);
})();
