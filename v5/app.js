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
    if (h === 'settings') return { name: 'settings', lk: lkOf(store.get('v5:lk', 'nba')), args: [] };
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
  const TITLES = { home: 'Home', scores: 'Scores', standings: 'Standings', players: 'Players', teams: 'Teams', search: 'Search', settings: 'Settings' };

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
    document.title = leagueScreen ? `${TITLES[r.name]} · ${LEAGUES[r.lk].label} · RIVL` : `${TITLES[r.name] || ''} RIVL`.trim();
    window.scrollTo(0, 0);
    try { await (V[r.name] || V.home)(...r.args); }
    catch (err) { if (my === seq) $main.innerHTML = `<div class="empty"><b>Something went wrong</b><p style="margin:6px 0 0">${esc(err && err.message || 'Try again in a moment.')}</p></div>`; console.error(err); }
    if (my !== seq) return;
    paintPills(r.lk, leagueScreen);   // live counts may have arrived while the view loaded
    $main.classList.remove('enter'); void $main.offsetWidth; $main.classList.add('enter');
    document.dispatchEvent(new CustomEvent('rivl:rendered'));
  }
  window.addEventListener('hashchange', render);

  /* ---------- polling: today's slate for every league, faster while something is live ---------- */
  let pollT = null, lastOk = 0;
  async function poll() {
    clearTimeout(pollT);
    const today = todayCT(); const r = current || route();
    poll.n = (poll.n || 0) + 1;
    const order = [r.lk, ...(poll.n % 4 === 1 ? ORDER.filter(k => k !== r.lk) : [])];   // the other leagues every fourth pass: fewer bursts at the feed
    let anyLive = ORDER.some(k => k !== r.lk && S.today[k].some(isLive)), failed = false;
    for (const k of order) {
      try { const g = await scoreboard(LEAGUES[k], today, k === r.lk ? 20000 : 120000); S.today[k] = g; if (g.some(isLive)) anyLive = true; }
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
      if (scores.length === 2) {
        [g.away.score, g.home.score].forEach((v, i) => { const t = v == null ? '' : String(v); if (scores[i].textContent !== t) { scores[i].textContent = t; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); } });
        const sides = el.querySelectorAll('.side'); const has = g.state !== 'pre' && g.away.score != null && g.home.score != null;
        [[g.away, g.home], [g.home, g.away]].forEach(([t, o], i) => { const lead = has && t.score > o.score; sides[i].classList.toggle('lo', has && t.score < o.score); scores[i].classList.toggle('on', lead); scores[i].classList.toggle('won', lead && g.state === 'post'); });
      }
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
      $main.dispatchEvent(new CustomEvent('rivl:follow')); $panel.dispatchEvent(new CustomEvent('rivl:follow'));
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
    if (a === 'pref') { e.preventDefault(); const on = act.getAttribute('aria-checked') !== 'true'; V.prefs.set(act.dataset.pref, on); act.setAttribute('aria-checked', String(on)); }
    if (a === 'theme') { e.preventDefault(); store.set('v5:theme', act.dataset.theme); applyTheme(); $main.querySelectorAll('[data-act="theme"]').forEach(b => { const on = b.dataset.theme === act.dataset.theme; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); }); }
    if (a === 'onb-restart') { e.preventDefault(); onbStep(0); }
    if (a === 'fav') {
      e.preventDefault();
      const on = HW.favs.toggle(act.dataset.lk, act.dataset.id);
      act.setAttribute('aria-pressed', String(on)); act.classList.toggle('on', on);
      const star = on ? `<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 2.8 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.7l-5.9 3.1 1.2-6.5L2.5 9.7l6.6-.9z"/></svg>` : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="m12 2.8 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.7l-5.9 3.1 1.2-6.5L2.5 9.7l6.6-.9z"/></svg>`;
      // a setup tile keeps its logo, name and record; only its check changes. Stars and the hero button redraw.
      if (!act.classList.contains('onb-team')) act.innerHTML = act.classList.contains('star') ? star : star + (on ? 'Following' : 'Follow');
      toast(on ? `Following ${act.dataset.name || 'team'}` : `Unfollowed ${act.dataset.name || 'team'}`);
      $main.dispatchEvent(new CustomEvent('rivl:fav')); $panel.dispatchEvent(new CustomEvent('rivl:fav'));
    }
    if (a === 'expand') { e.preventDefault(); $main.querySelectorAll(`[data-more="${act.dataset.more}"]`).forEach(el => { el.hidden = false; }); act.remove(); }
    if (a === 'stab') { e.preventDefault(); store.set('v5:stab:' + (current ? current.lk : 'nba'), act.dataset.tab); render(); }
    if (a === 'play') { e.preventDefault(); openSheet(act.dataset.vid); }
    if (a === 'injury') { e.preventDefault(); openInjury(act.dataset.key); }
    if (a === 'reload') { e.preventDefault(); render(); }
    if (a === 'onb-next') { e.preventDefault(); onbStep(+act.dataset.step); }
    if (a === 'onb-lk') { e.preventDefault(); store.set('v5:lk', act.dataset.lk); onbStep(+(act.dataset.step || 0)); }
    if (a === 'onb-done') { e.preventDefault(); store.set('v5:onboarded', true); closePanel(); render(); }
    if (a === 'install') { e.preventDefault(); install(); }
    if (a === 'install-later') { e.preventDefault(); store.set('v5:installDismissed', Date.now()); const b = document.getElementById('installBar'); if (b) b.remove(); }
    if (a === 'panel-close') { e.preventDefault(); closePanel(); const to = act.getAttribute('href'); if (to && to.startsWith('#')) location.hash = to; }
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

  /* ---------- panel: a sheet for anything that isn't a video (injury notes, first-run setup) ---------- */
  const $panel = document.getElementById('panel');
  function openPanel(html, { full = false } = {}) { $panel.querySelector('.panel-in').innerHTML = html; $panel.classList.toggle('full', full); $panel.hidden = false; document.body.classList.add('noscroll'); $panel.querySelector('.panel-in').scrollTop = 0; }
  function closePanel() { if ($panel.hidden) return; $panel.hidden = true; $panel.classList.remove('full'); document.body.classList.remove('noscroll'); }
  $panel.addEventListener('click', e => { if (e.target === $panel && !$panel.classList.contains('full')) closePanel(); });

  function openInjury(key) {
    const rec = S.injuries && S.injuries[key]; if (!rec) return;
    const { x, team } = rec; const at = x.athlete || {}; const det = x.details || {}; const st = x.status || '';
    const lk = current ? current.lk : 'nba'; const L = LEAGUES[lk];
    const id = rec.id || V._.athId(at);
    const cls = /out/i.test(st) ? 'out' : /day|quest|doubt/i.test(st) ? 'q' : /prob|avail/i.test(st) ? 'ok' : '';
    const what = [det.type, det.detail && det.detail !== det.type ? det.detail : '', det.side && det.side !== 'Not Specified' ? det.side.toLowerCase() : '', det.location && det.location !== det.type ? det.location : ''].filter(Boolean).join(', ');
    const ret = V._.retInfo(L, det.returnDate);
    const rows = [['Status', `<span class="tag ${cls}">${esc(st)}</span>`], ['Injury', esc(what || '—')], ['Reported', x.date ? esc(new Date(x.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: HW.TZ })) : ''], ['Expected back', ret ? esc(ret.long) : (/out/i.test(st) ? 'No date given' : '')], ['Fantasy', det.fantasyStatus && det.fantasyStatus.description ? esc(det.fantasyStatus.description) : '']].filter(([, v]) => v);
    const note = x.longComment || x.shortComment || '';
    openPanel(`<button class="ib close" data-act="panel-close" aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      <div class="inj-head">${V._.headshot(V._.hsUrl(at), team.color, 64, at.displayName)}<div><h3>${esc(at.displayName || '')}</h3><p>${esc(team.short || '')}${at.position && at.position.abbreviation ? `, ${esc(at.position.abbreviation)}` : ''}</p></div></div>
      <table class="tbl kv"><tbody>${rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</tbody></table>
      ${note ? `<p class="inj-note">${esc(note)}</p>` : ''}
      <p class="foot" style="padding:10px 0 0">Status, dates and the note are ESPN's, word for word.</p>
      <div style="display:flex;gap:8px;margin-top:14px">${id ? `<a class="btn" href="#player/${lk}/${esc(id)}" data-act="panel-close">Open profile</a>` : ''}${team.id ? `<a class="btn ghost" href="#team/${lk}/${esc(team.id)}" data-act="panel-close">${esc(team.short || 'Team')}</a>` : ''}</div>`);
  }

  /* ---------- theme: match the phone, or force dark or light ---------- */
  function applyTheme() {
    const t = store.get('v5:theme', 'system'); const root = document.documentElement;
    if (t === 'dark' || t === 'light') root.setAttribute('data-theme', t); else root.removeAttribute('data-theme');
    const light = t === 'light' || (t !== 'dark' && window.matchMedia('(prefers-color-scheme: light)').matches);
    const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.setAttribute('content', light ? '#E6E8ED' : '#000000');
  }
  applyTheme(); window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', applyTheme);

  /* ---------- first run: pick teams, pick players, choose what Home shows, add to the home screen ---------- */
  let deferredInstall = null;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; const b = document.getElementById('installBtn'); if (b) b.hidden = false; });
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  V.standalone = standalone;
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) && !window.MSStream;
  async function install() { if (deferredInstall) { deferredInstall.prompt(); const r = await deferredInstall.userChoice.catch(() => null); deferredInstall = null; if (r && r.outcome === 'accepted') { toast('Installed'); const b = document.getElementById('installBar'); if (b) b.remove(); } } else toast(isIOS ? 'Tap Share, then Add to Home Screen' : 'Use your browser menu: Add to Home screen'); }
  function needsOnboarding() { return !store.get('v5:onboarded', false); }
  const STEPS = 4;
  const onbMark = `<svg viewBox="0 0 250 123.41" fill="currentColor"><path d="M0 0H88.8A11.2 11.2 0 0 1 100 11.2V50.5A11.2 11.2 0 0 1 88.8 61.7H62.3L0 25.61ZM0 47.02L100 104.96V123.41H0ZM108 0H132V123.41H108ZM140 0H164.5L168.0 96L171.5 0H196L192 123.41H144ZM204 0H228V99.41H250V123.41H204Z"/></svg>`;
  async function onbStep(n) {
    const lk = lkOf(store.get('v5:lk', 'nba')); const L = LEAGUES[lk];
    const dots = `<div class="onb-dots">${Array.from({ length: STEPS }, (_, i) => `<i class="${i === n ? 'on' : ''}"></i>`).join('')}</div>`;
    const leaguePills = `<div class="pills" style="padding:0 0 14px">${ORDER.map(k => `<button class="pill${k === lk ? ' on' : ''}" data-act="onb-lk" data-lk="${k}" data-step="${n}">${esc(LEAGUES[k].label)}</button>`).join('')}</div>`;
    const frame = (title, body, inner, foot) => openPanel(`<div class="onb"><div class="onb-logo">${onbMark}</div>${dots}<h2>${title}</h2><p>${body}</p>${inner}<div class="onb-foot">${foot}</div></div>`, { full: true });
    if (n === 0 || n === 1) {
      const nn = n === 0 ? ORDER.reduce((c, k) => c + (HW.favs.all()[k] || []).length, 0) : V.fplayers.all().length;
      frame(n === 0 ? 'Pick your teams' : 'Follow some players', n === 0 ? 'They lead Home and are the only ones you get updates about.' : 'Their lines, clips and profiles sit on Home next to your teams.',
        `${leaguePills}<div class="search" style="margin:0 0 12px"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.8-3.8"/></svg><input id="onbq" type="search" placeholder="${n === 0 ? 'Search teams' : 'Search players'}" autocomplete="off"></div><div id="onbList" class="onb-list">${Array.from({ length: 6 }, () => '<div class="skel row" style="margin:0 0 8px"></div>').join('')}</div>`,
        `<button class="btn ghost" data-act="onb-next" data-step="${n + 1}">Skip</button><button class="btn" data-act="onb-next" data-step="${n + 1}" id="onbNext">${nn ? `Continue with ${nn}` : 'Continue'}</button>`);
      const list = document.getElementById('onbList'); const inp = document.getElementById('onbq');
      if (n === 0) {
        /* every team in the league. Pro leagues are one alphabetical grid; college is the AP Top 25 first, then each
           conference A to Z with its teams alphabetical, because 360 tiles in one wall is not a list anyone can use. */
        const [idx, st, R] = await Promise.all([V.teamsIndex(L), HW.standings(L).catch(() => null), HW.rankings(L).catch(() => null)]);
        const byShort = (a, b) => (a.short || a.name || '').localeCompare(b.short || b.name || '');
        const tile = (id, rank) => { const t = idx[id] || {}; const r = st && st.byId && st.byId[id]; return { id, short: t.short || (r && r.short) || t.name || (r && r.name) || '', name: t.name || (r && r.name) || '', abbr: t.abbr || (r && r.abbr) || '', logo: t.logo || (r && r.logo) || '', rec: r ? `${r.w}-${r.l}` : '', rank: rank || 0 }; };
        const seen = new Set(); const groups = [];
        if (L.standingsMode === 'conferences' && st && st.groups.length) {
          if (R && R.ranks && R.ranks.length) groups.push({ name: R.name || 'Top 25', rows: R.ranks.map(x => tile(String(x.team.id), x.rank)) });
          st.groups.slice().sort((a, b) => V._.confName(a.name, a.abbr).localeCompare(V._.confName(b.name, b.abbr))).forEach(g => { const rows = g.rows.map(r => { seen.add(r.id); return tile(r.id); }).sort(byShort); if (rows.length) groups.push({ name: V._.confName(g.name, g.abbr), rows }); });
          const rest = Object.keys(idx).filter(id => !seen.has(id)).map(id => tile(id)).sort(byShort); if (rest.length) groups.push({ name: 'Other', rows: rest });
        } else groups.push({ name: '', rows: Object.keys(idx).map(id => tile(id)).sort(byShort) });
        const paint = () => {
          const q = inp.value.trim().toLowerCase();
          const html = groups.map(g => { const rows = g.rows.filter(tm => !q || `${tm.name} ${tm.short} ${tm.abbr} ${g.name}`.toLowerCase().includes(q)); if (!rows.length) return ''; return `${g.name ? `<div class="onb-sec"><b>${esc(g.name)}</b><span>${rows.length}</span></div>` : ''}<div class="onb-grid">${rows.map(tm => { const on = HW.favs.has(lk, tm.id); return `<button class="onb-team${on ? ' on' : ''}" data-act="fav" data-lk="${lk}" data-id="${esc(tm.id)}" data-name="${esc(tm.short)}" aria-pressed="${on}"><span class="logo"><img src="${esc(tm.logo || '')}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"></span><b>${esc(tm.short)}</b><span>${tm.rank ? `<em>No. ${tm.rank}</em>` : ''}${esc(tm.rec)}</span><i></i></button>`; }).join('')}</div>`; }).join('');
          list.innerHTML = html || `<div class="empty"><b>No team matches</b><p style="margin:6px 0 0">Try the school, the nickname or the conference.</p></div>`;
        };
        paint(); inp.addEventListener('input', paint);
      } else {
        const [lp, idx] = await Promise.all([L.sport === 'basketball' ? HW.leaguePlayers(L).catch(() => null) : null, V.teamsIndex(L)]);
        const rows0 = lp ? lp.rows.slice().sort((a, b) => b.pts - a.pts) : [];
        const paint = () => { const q = inp.value.trim().toLowerCase(); const rows = rows0.filter(p => !q || `${p.name} ${p.team}`.toLowerCase().includes(q)).slice(0, q ? 60 : 30); list.innerHTML = rows.length ? `<div class="rows">${rows.map(p => { const tm = idx[p.teamId] || {}; const on = V.fplayers.has(lk, p.id); const snap = { lk, id: p.id, name: p.name, short: p.short || p.name, img: p.img, team: p.team, color: tm.color || '#2A2D33' }; return `<div class="row prow">${V._.headshot(p.img, tm.color, 46, p.name)}<span class="t"><b>${esc(p.name)}</b><span>${esc(tm.short || p.team)}, ${p.pts.toFixed(1)} ppg</span></span><button class="star${on ? ' on' : ''}" data-act="follow-player" data-snap='${esc(JSON.stringify(snap))}' aria-pressed="${on}" aria-label="Follow ${esc(p.name)}">${on ? '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 2.8 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.7l-5.9 3.1 1.2-6.5L2.5 9.7l6.6-.9z"/></svg>' : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="m12 2.8 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.7l-5.9 3.1 1.2-6.5L2.5 9.7l6.6-.9z"/></svg>'}</button></div>`; }).join('')}</div>` : `<div class="empty"><b>No player stats yet</b><p style="margin:6px 0 0">${esc(L.label)} stats start once the season has games. You can follow players from any team page later.</p></div>`; };
        paint(); inp.addEventListener('input', paint);
      }
    } else if (n === 2) {
      const P = V.prefs.all();
      const items = [['live', 'Live now', 'A big card when one of your teams is playing'], ['teams', 'My teams', 'Record, next game and the chance to win'], ['games', 'Your games', 'The next game for each team you follow'], ['players', 'My players', 'Scoring lines, one tap to the profile'], ['injuries', 'Injuries', 'Reports on your teams and players'], ['news', 'News', 'Stories about your teams and players'], ['forecast', 'Win chances', "RIVL's own estimate on each game card"]];
      frame('What do you want to see?', 'Home is yours. Switch off anything you don\'t care about; you can change it later in Settings.',
        `<div class="rows onb-prefs">${items.map(([k, t, b]) => `<button class="row sw" data-act="pref" data-pref="${k}" role="switch" aria-checked="${P[k] !== false}"><span class="t"><b>${esc(t)}</b><span class="wrap">${esc(b)}</span></span><span class="switch"></span></button>`).join('')}</div>`,
        `<button class="btn ghost" data-act="onb-next" data-step="1">Back</button><button class="btn" data-act="onb-next" data-step="3">Continue</button>`);
    } else {
      const done = standalone();
      frame(done ? "You're set" : 'Put RIVL on your home screen', done ? 'RIVL is on your home screen. Your teams and players are waiting on Home.' : 'It opens full screen like an app, with no browser bar, and your teams load first.',
        done ? '' : `<div class="onb-install"><img src="img/icon-192.png" alt="" width="64" height="64"><div>${deferredInstall ? `<button class="btn" data-act="install" id="installBtn">Install RIVL</button>` : isIOS ? `<b>In Safari</b><ol><li>Tap the Share button</li><li>Choose <b>Add to Home Screen</b></li><li>Tap <b>Add</b></li></ol>` : `<b>In your browser menu</b><p style="margin:4px 0 0">Choose <b>Add to Home screen</b> (or <b>Install app</b>).</p>`}</div></div>`,
        `<button class="btn ghost" data-act="onb-next" data-step="2">Back</button><button class="btn" data-act="onb-done">${done ? 'Open Home' : 'Done'}</button>`);
    }
  }
  V.onbStep = onbStep;
  /* the Continue button counts what has been picked so far; a team in the Top 25 and in its conference is one tile drawn twice, so every tile re-syncs */
  const onbCount = () => { const b = document.getElementById('onbNext'); if (!b || $panel.hidden) return;
    $panel.querySelectorAll('.onb-team').forEach(t => { const on = HW.favs.has(t.dataset.lk, t.dataset.id); t.classList.toggle('on', on); t.setAttribute('aria-pressed', String(on)); });
    const step = +(b.dataset.step || 1) - 1; const nn = step === 0 ? ORDER.reduce((c, k) => c + (HW.favs.all()[k] || []).length, 0) : V.fplayers.all().length; b.textContent = nn ? `Continue with ${nn}` : 'Continue'; };
  $panel.addEventListener('rivl:fav', onbCount); $panel.addEventListener('rivl:follow', onbCount);

  /* ---------- boot ---------- */
  render().then(() => { poll(); if (needsOnboarding()) onbStep(0); });
  /* install bar on Home while the app isn't on the home screen yet */
  const origRender = render;
  document.addEventListener('rivl:rendered', () => {
    if (!current || current.name !== 'home' || standalone() || store.get('v5:installDismissed', 0) || !store.get('v5:onboarded', false)) return;
    if (document.getElementById('installBar')) return;
    const bar = document.createElement('div'); bar.id = 'installBar'; bar.className = 'installbar';
    bar.innerHTML = `<img src="img/icon-192.png" alt="" width="36" height="36"><div><b>Add RIVL to your home screen</b><span>Opens full screen, your teams first.</span></div><button class="btn" data-act="install">${deferredInstall ? 'Install' : 'How'}</button><button class="ib" data-act="install-later" aria-label="Not now"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>`;
    $main.prepend(bar);
  });
})();
