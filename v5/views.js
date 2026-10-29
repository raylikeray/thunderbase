/* RIVL v5 — views. Pure render functions over the data layer in js/core.js. Each view returns a promise that
   resolves once the screen is painted; app.js owns routing, polling and delegated clicks. */
(() => {
  'use strict';
  const { LEAGUES, ORDER, esc, j, jSoft, todayCT, addDays, dayLabel, relDay, tip, dateShort, ago, pct, ordinal, hx, store, API, WEB,
    favs, parseEvent, isLive, isFav, interest, scoreboard, standings, injuries, forecast, forecastCtx, leaguePlayers, S } = HW;
  const $main = document.getElementById('main');

  /* ---------- small helpers ---------- */
  const H = (strings, ...vals) => strings.reduce((out, s, i) => out + s + (i < vals.length ? vals[i] : ''), '');
  const dark = c => c && HW.darkOf(c, c) || '#1d2633';
  const teamColor = t => hx(t && t.color) || '#2A2D33';
  /* team colour on the two grounds: lifted toward white on black, deepened toward black on white */
  const rgbOf = c => { const h = String(c || '').replace('#', ''); return h.length >= 6 ? [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)) : null; };
  const lumOf = c => { const v = rgbOf(c); return v ? (0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]) / 255 : .5; };
  const mixTo = (c, to, k) => { const v = rgbOf(c); if (!v) return c; const m = x => Math.round(x + (to - x) * k); return `rgb(${m(v[0])},${m(v[1])},${m(v[2])})`; };
  const V_lift = c => { const l = lumOf(c); return l > 0.45 ? c : mixTo(c, 255, l < 0.15 ? 0.6 : 0.4); };
  const V_deep = c => { const l = lumOf(c); return l < 0.5 ? c : mixTo(c, 0, l > 0.75 ? 0.5 : 0.32); };
  /* teams whose signature colour is their secondary: their score takes that one so the Lakers read gold, not Jazz purple */
  const SIG_ALT = { nba: { LAL: 1, IND: 1, DEN: 1, MIN: 1 }, wnba: { LA: 1, LAS: 1 } };
  const scoreColor = (L, t) => { const alt = hx(t && t.alt); return alt && SIG_ALT[L.key] && SIG_ALT[L.key][t.abbr] ? alt : teamColor(t); };
  const scVars = (t, L) => { const c = L ? scoreColor(L, t) : teamColor(t); return `--tc:${esc(c)};--tcd:${esc(V_lift(c))};--tcl:${esc(V_deep(c))}`; };
  const href = { player: (lk, id) => `#player/${lk}/${id}`, team: (lk, id) => `#team/${lk}/${id}`, game: (lk, id) => `#game/${lk}/${id}` };
  const hide = `onerror="this.style.visibility='hidden'"`;
  const logo = (src, size = '') => `<span class="logo ${size}"><img src="${esc(src || '')}" alt="" loading="lazy" ${hide}></span>`;
  /* a player's id from whatever the feed gave us: the id field, the uid, the headshot file name or a link */
  const athId = a => { if (!a) return ''; if (a.id != null && a.id !== '') return String(a.id); let m = String(a.uid || '').match(/~a:(\d+)/); if (m) return m[1]; const hs = typeof a.headshot === 'string' ? a.headshot : a.headshot && a.headshot.href || ''; m = hs.match(/\/(\d+)\.png/); if (m) return m[1]; m = (a.links || []).map(l => l && l.href || '').join(' ').match(/\/id\/(\d+)/); return m ? m[1] : ''; };
  const hsUrl = a => { const h = a && a.headshot; return typeof h === 'string' ? h : h && h.href || ''; };
  const initials = name => String(name || '').replace(/[^A-Za-z\s'-]/g, '').trim().split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  /* headshot disc: the photo when the feed has one, the player's initials on the team colour when it doesn't */
  const headshot = (src, color, size = 64, name = '') => `<span class="hs${src ? '' : ' noimg'}" style="--tc:${esc(color || '#2A2D33')};width:${size}px;height:${size}px;font-size:${Math.round(size * .34)}px"><i>${esc(initials(name))}</i>${src ? `<img src="${esc(src)}" alt="" loading="lazy" onerror="this.parentNode.classList.add('noimg');this.remove()">` : ''}</span>`;
  /* what a return date means: ESPN pencils in the next season's opener for anyone out for the year */
  const retInfo = (L, iso) => { if (!iso) return null; const d = new Date(iso); if (isNaN(d)) return null; const exact = dayUTC(iso); const ss = String(L && L.seasonStart || '2026-10-01').slice(5); const now = new Date(); let next = new Date(`${now.getUTCFullYear()}-${ss}T00:00:00Z`); if (next - now < 30 * 864e5) next = new Date(`${now.getUTCFullYear() + 1}-${ss}T00:00:00Z`); const far = d >= next - 14 * 864e5; return far ? { short: 'no return date this season', long: `Not before next season (ESPN lists ${exact})`, far: true } : { short: `back around ${exact}`, long: exact, far: false }; };
  /* what Home shows: every section on by default */
  const PREF_KEYS = ['live', 'teams', 'games', 'players', 'injuries', 'news', 'forecast'];
  const prefs = { all() { const d = {}; PREF_KEYS.forEach(k => d[k] = true); return Object.assign(d, store.get('v5:prefs', {}) || {}); }, get(k) { return this.all()[k] !== false; }, set(k, v) { const a = store.get('v5:prefs', {}) || {}; a[k] = !!v; store.set('v5:prefs', a); } };
  const chev = `<span class="chev"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg></span>`;
  const sec = (title, small, action) => `<div class="sec"><h2>${esc(title)}${small ? `<small>${esc(small)}</small>` : ''}</h2>${action || ''}</div>`;
  const empty = (title, body, cta) => `<div class="empty"><b>${esc(title)}</b>${body || ''}${cta || ''}</div>`;
  const skeleton = (n = 3, kind = 'row') => Array.from({ length: n }, () => `<div class="skel ${kind}"></div>`).join('');
  const recOf = t => t && t.rec ? t.rec : '';
  /* group names the way people say them: "Eastern Conference" is the East, "Southeast Division" is the Southeast,
     and a college conference loses the word Conference (the two everyone abbreviates get their initials) */
  const CONF_SHORT = { 'Atlantic Coast': 'ACC', 'Southeastern': 'SEC', 'American Athletic': 'American', 'Western Athletic': 'WAC', 'Mid-American': 'MAC', 'Mid-Eastern Athletic': 'MEAC', 'Southwestern Athletic': 'SWAC', 'Atlantic Sun': 'ASUN', 'Coastal Athletic Association': 'CAA' };
  const confName = (name, abbr) => { const n = String(name || ''); let m = n.match(/^(East|West)(ern)? Conference$/i); if (m) return m[1][0].toUpperCase() + m[1].slice(1).toLowerCase(); m = n.match(/^(\w+) Division$/i); if (m) return m[1]; if (/ Conference$/i.test(n)) { const base = n.replace(/ Conference$/i, ''); return CONF_SHORT[base] || base; } if (CONF_SHORT[n]) return CONF_SHORT[n]; if (abbr && String(abbr).length > 3) return String(abbr); return n || String(abbr || ''); };
  const dayUTC = iso => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const standingLine = (r, L) => !r ? '' : L.standingsMode === 'conferences' ? `${r.w}-${r.l}` : `${r.w}-${r.l}, ${ordinal(r.pos)} in the ${confName(r.group, r.groupAbbr)}`;
  const starSvg = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 2.8 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.7l-5.9 3.1 1.2-6.5L2.5 9.7l6.6-.9z"/></svg>`;
  const starLine = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="m12 2.8 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.7l-5.9 3.1 1.2-6.5L2.5 9.7l6.6-.9z"/></svg>`;
  const tvLabel = g => (g.tv && g.tv.label) || '';
  const safeF = (L, g, ctx) => { try { return ctx ? forecast(L, g, ctx) : null; } catch { return null; } };

  /* followed players: a small snapshot per player so the rail paints before any fetch */
  const fplayers = {
    all() { return store.get('v5:players', []) || []; },
    has(lk, id) { return this.all().some(p => p.lk === lk && p.id === String(id)); },
    toggle(p) { const a = this.all(); const i = a.findIndex(x => x.lk === p.lk && x.id === String(p.id)); if (i >= 0) a.splice(i, 1); else a.push({ ...p, id: String(p.id) }); store.set('v5:players', a); return i < 0; }
  };

  /* ---------- game cards ---------- */
  function statusLine(L, g, timeOnly) {
    if (g.state === 'in') return `<span class="live">${esc(g.detail || 'Live')}</span>`;
    if (timeOnly && g.state === 'pre') return `<span>${esc(tip(g.date))}</span>`;
    if (g.state === 'post') return `<span>${esc(g.detail && /final/i.test(g.detail) ? g.detail.replace(/^Final\/?/, 'Final ').trim() : 'Final')}</span>`;
    return `<span>${esc(relDay(HW.ymdOf(g.date)))}, ${esc(tip(g.date))}</span>`;
  }
  function forecastRow(L, g, f) {
    if (!f) return '';
    const homeFav = f.pHome >= .5; const p = homeFav ? f.pHome : 1 - f.pHome; const fav = homeFav ? g.home : g.away;
    const note = g.state === 'post' ? '' : f.soH ? `${esc(f.soH.name)} out` : f.soA ? `${esc(f.soA.name)} out` : (f.restH && !f.restA) ? `${esc(g.home.short)} on a back-to-back` : (f.restA && !f.restH) ? `${esc(g.away.short)} on a back-to-back` : '';
    const label = g.state === 'post' ? `Had ${esc(fav.short)} ${pct(p)}` : `${esc(fav.short)} ${pct(p)}`;
    return `<div class="fc"><div class="bar"><i style="width:${(f.pHome * 100).toFixed(1)}%;background:${esc(teamColor(g.home))}"></i><i style="width:${((1 - f.pHome) * 100).toFixed(1)}%;background:${esc(teamColor(g.away))}"></i></div><b>${label}${note ? `<small>${note}</small>` : ''}</b></div>`;
  }
  /* one team's line on a card: the side that is ahead (leading live, or the winner) gets its score in the team colour */
  function side(L, g, t, other) {
    const has = g.state !== 'pre' && t.score != null && other.score != null;
    const lo = has && t.score < other.score, lead = has && t.score > other.score;
    const sc = g.state === 'pre' ? '' : `<span class="sc${lead ? ' on' : ''}${lead && g.state === 'post' ? ' won' : ''}">${t.score == null ? '' : t.score}</span>`;
    return `<div class="side${lo ? ' lo' : ''}" data-tid="${esc(t.id)}" style="${scVars(t, L)}">${logo(t.logo)}<span class="nm"><b>${t.rank ? `<i>${t.rank}</i>` : ''}${esc(t.short || t.name)}</b><span>${esc(recOf(t))}</span></span>${sc}</div>`;
  }
  function gameCard(L, g, ctx, withForecast = true, timeOnly = false) {
    const f = withForecast && prefs.get('forecast') ? safeF(L, g, ctx) : null;
    return `<a class="game" href="${href.game(L.key, g.id)}" data-gid="${esc(g.id)}">
      ${side(L, g, g.away, g.home)}
      <div class="status">${statusLine(L, g, timeOnly)}<span class="ln"></span><span class="tv">${esc(tvLabel(g) || g.venue || '')}</span></div>
      ${side(L, g, g.home, g.away)}
      ${forecastRow(L, g, f)}</a>`;
  }
  /* the hero: on Home it is one link to the game; on the game page each team is a link to its own page */
  function heroCard(L, g, ctx, { page = false } = {}) {
    const f = prefs.get('forecast') ? safeF(L, g, ctx) : null;
    const a = teamColor(g.away), b = teamColor(g.home);
    const fav = f ? (f.pHome >= .5 ? g.home : g.away) : null; const p = f ? Math.max(f.pHome, 1 - f.pHome) : 0;
    const tm = t => page ? `<a class="tm" href="${href.team(L.key, t.id)}" aria-label="${esc(t.name || t.short)} team page">${logo(t.logo)}<b>${esc(t.short || t.name)}</b><span>${esc(recOf(t))}</span></a>` : `<div class="tm">${logo(t.logo)}<b>${esc(t.short || t.name)}</b><span>${esc(recOf(t))}</span></div>`;
    const inner = `<div class="in">
      <div class="vs">${tm(g.away)}<div class="mid"><span class="st${g.state === 'in' ? ' on' : ''}">${esc(g.state === 'in' ? g.detail : g.state === 'post' ? 'Final' : tip(g.date))}</span><div class="sc">${g.away.score ?? ''}<i>–</i>${g.home.score ?? ''}</div><span class="tv">${esc(tvLabel(g) || g.venue || '')}</span></div>${tm(g.home)}</div>
      ${f ? `<div class="fc"><div class="bar"><i style="width:${(p * 100).toFixed(1)}%"></i></div><b>${esc(fav.short)} ${pct(p)}</b></div>` : ''}
    </div>`;
    return page ? `<div class="hero page" data-gid="${esc(g.id)}" style="--a:${esc(a)};--b:${esc(b)}">${inner}</div>`
      : `<a class="hero" href="${href.game(L.key, g.id)}" data-gid="${esc(g.id)}" style="--a:${esc(a)};--b:${esc(b)}">${inner}</a>`;
  }

  /* ---------- team info: logo/colour from the league list, record from standings, next game from the schedule ----------
     (the bare /teams/{id} endpoint is used only as an extra; the row renders without it) ---------- */
  async function teamInfo(L, id, pre) {
    id = String(id);
    const [idx, st, sched, extra] = await Promise.all([pre && pre.idx ? pre.idx : teamsIndex(L), pre && pre.st !== undefined ? pre.st : standings(L).catch(() => null), jSoft(`${API(L)}/teams/${id}/schedule`, 300000), jSoft(`${API(L)}/teams/${id}`, 600000)]);
    const r = st && st.byId && st.byId[id]; const x = extra && extra.team;
    const t = idx[id] || (r ? { id: r.id, abbr: r.abbr, name: r.name, short: r.short, loc: r.loc, color: '', logo: r.logo } : {});
    if (!t.id && !x) return { id, abbr: '', name: 'Team', short: 'Team', color: '', logo: '', rec: '', standing: 'Feed is slow, pull to refresh', row: null, next: null, last: null };
    const evs = (sched && sched.events || []).map(e => { try { return parseEvent(e, L); } catch { return null; } }).filter(Boolean);
    const next = evs.find(g => g.state !== 'post') || (x && x.nextEvent && x.nextEvent[0] ? (() => { try { return parseEvent(x.nextEvent[0], L); } catch { return null; } })() : null);
    const last = evs.filter(g => g.state === 'post').slice(-1)[0] || null;
    const recItem = x && x.record && x.record.items && (x.record.items.find(i => i.type === 'total') || x.record.items[0]);
    return { id, abbr: t.abbr || (x && x.abbreviation), name: t.name || (x && x.displayName), short: t.short || (x && x.shortDisplayName), loc: t.loc, color: t.color || hx(x && x.color), alt: t.alt,
      logo: t.logo || (x && x.logos && x.logos[0] && x.logos[0].href) || HW.logoUrl(L, t.abbr || (x && x.abbreviation)),
      rec: r ? `${r.w}-${r.l}` : (recItem && recItem.summary) || '', standing: r && L.standingsMode !== 'conferences' ? `${ordinal(r.pos)} in the ${confName(r.group, r.groupAbbr)}` : (x && x.standingSummary) || '', row: r, next, last };
  }

  /* every team in the league, keyed by id: colour and logo for discs and rails */
  const teamIdx = {};
  async function teamsIndex(L) {
    if (teamIdx[L.key]) return teamIdx[L.key];
    let d = await jSoft(`${API(L)}/teams?limit=500`, 3600000);
    if (!d) d = await jSoft(`${API(L)}/teams?limit=500`, 0);   // one retry: the feed drops bursts of requests on busy nights
    const list = d && d.sports && d.sports[0] && d.sports[0].leagues && d.sports[0].leagues[0] && d.sports[0].leagues[0].teams || [];
    const idx = {}; list.forEach(x => { const t = x.team || x; idx[String(t.id)] = { id: String(t.id), abbr: t.abbreviation, name: t.displayName, short: t.shortDisplayName || t.name, loc: t.location, color: hx(t.color), alt: hx(t.alternateColor), logo: t.logos && t.logos[0] && t.logos[0].href }; });
    if (!list.length) {   // nothing came back: fill from standings so rows still have a name and logo, and try the list again next time
      const st = await standings(L).catch(() => null);
      if (st && st.byId) Object.values(st.byId).forEach(r => { idx[r.id] = { id: r.id, abbr: r.abbr, name: r.name, short: r.short, loc: r.loc, color: '', alt: '', logo: r.logo }; });
      return idx;
    }
    return (teamIdx[L.key] = idx);
  }

  /* ================= HOME: your teams, your players, nothing else ================= */
  const rankGame = g => (isFav(g) ? 1000 : 0) + (g.tv.national.length ? 100 : 0) + interest(g) / 1000;
  async function home(lk) {
    const L = LEAGUES[lk]; const today = todayCT();
    const mine = favs.all()[lk] || [];
    const fp = fplayers.all().filter(p => p.lk === lk);
    if (!mine.length && !fp.length) {
      $main.innerHTML = `<div class="page-h"><h1>Make it yours</h1><p>Home shows only the teams and players you follow.</p></div>` + empty('Nothing followed yet', '<p style="margin:6px 0 0">Pick a few teams and players and this screen fills with their games, lines, injuries and news.</p>', `<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><a class="btn" href="#teams">Choose teams</a><a class="btn ghost" href="#players">Find players</a></div>`);
      return;
    }
    $main.innerHTML = skeleton(1, 'card') + skeleton(4, 'row');
    const [games, ctx, inj, news, lp, teams] = await Promise.all([
      S.today[lk] && S.today[lk].length ? S.today[lk] : scoreboard(L, today).catch(() => []),
      forecastCtx(L, today).catch(() => null), mine.length ? injuries(L) : null, jSoft(`${API(L)}/news?limit=25`, 600000),
      fp.length && L.sport === 'basketball' ? leaguePlayers(L).catch(() => null) : null,
      (async () => { const idx = await teamsIndex(L); const st = await standings(L).catch(() => null); return Promise.all(mine.map(id => teamInfo(L, id, { idx, st }).catch(() => null))); })()
    ]);
    S.today[lk] = games;
    const P = prefs.all();
    const parts = [];
    const byTeam = new Map(); games.forEach(g => { byTeam.set(g.home.id, g); byTeam.set(g.away.id, g); });

    // your teams playing right now: the hero
    const live = games.filter(g => isLive(g) && isFav(g)).sort((a, b) => rankGame(b) - rankGame(a));
    if (live.length && P.live) parts.push(sec('Live now') + `<div class="heroes">${live.map(g => heroCard(L, g, ctx)).join('')}</div>`);

    // my teams: record, what's next or how it's going, win chance
    const rows = teams.filter(Boolean).map(t => {
      const g = byTeam.get(t.id) || t.next || t.last; const f = g ? safeF(L, g, ctx) : null;
      const us = g ? (g.home.id === t.id ? g.home : g.away) : null, them = g ? (g.home.id === t.id ? g.away : g.home) : null;
      let line = t.standing || 'No game scheduled', right = '';
      if (g) {
        const home = g.home.id === t.id; const vs = `${home ? 'vs' : 'at'} ${esc(them.short)}`;
        if (g.state === 'in') { const lead = us.score - them.score; line = `${lead > 0 ? `Leading ${esc(them.short)} by ${lead}` : lead < 0 ? `Trailing ${esc(them.short)} by ${-lead}` : `Tied with ${esc(them.short)}`}, ${esc(g.detail)}`; }
        else if (g.state === 'post') line = `${us.score > them.score ? 'Won' : 'Lost'} ${esc(String(us.score))}-${esc(String(them.score))} ${vs}`;
        else line = `${esc(relDay(HW.ymdOf(g.date)))} ${vs}, ${esc(tip(g.date))}${tvLabel(g) ? ` on ${esc(tvLabel(g))}` : ''}`;
        if (f && g.state !== 'post') { const p = home ? f.pHome : 1 - f.pHome; right = `<span class="r"><b>${pct(p)}</b><span>to win</span></span>`; }
        else if (g.state === 'post') right = `<span class="r"><b class="${us.score > them.score ? 'res w' : 'res l'}" style="font-size:22px">${us.score > them.score ? 'W' : 'L'}</b></span>`;
      }
      return `<a class="row" href="${href.team(lk, t.id)}">${logo(t.logo)}<span class="t"><b>${esc(t.short)}<small>${esc(t.rec)}</small></b><span>${line}</span></span>${right || chev}</a>`;
    });
    if (P.teams) parts.push(sec('My teams', '', `<a href="#teams">Edit</a>`) + (rows.length ? `<div class="rows">${rows.join('')}</div>` : empty('No teams yet', '', `<a class="btn" href="#teams">Choose teams</a>`)));

    // next games for my teams that aren't live: the ticket with the forecast
    const upcoming = teams.filter(Boolean).map(t => byTeam.get(t.id) || t.next).filter(g => g && g.state !== 'in');
    const seen = new Set(); const up = upcoming.filter(g => { if (seen.has(g.id)) return false; seen.add(g.id); return true; }).sort((a, b) => (a.state === 'post') - (b.state === 'post') || new Date(a.date) - new Date(b.date));
    if (up.length && P.games) parts.push(sec('Your games', '', `<a href="#scores">All scores</a>`) + `<div class="games">${up.slice(0, 4).map(g => gameCard(L, g, ctx, true)).join('')}</div>`);

    // my players
    const ppgOf = id => { const r = lp && lp.rows.find(x => x.id === String(id)); return r ? `${r.pts.toFixed(1)} ppg` : ''; };
    if (P.players) parts.push(sec('My players', '', `<a href="#players">${fp.length ? 'Edit' : 'Find players'}</a>`) + (fp.length
      ? `<div class="rail">${fp.map(p => `<a class="pl" href="${href.player(lk, p.id)}" style="--tc:${esc(p.color || '#2A2D33')}">${headshot(p.img, p.color, 64, p.name)}<b>${esc(p.short || p.name)}</b><span>${esc(ppgOf(p.id) || p.team || '')}</span></a>`).join('')}</div>`
      : empty('Follow the players you watch', '<p style="margin:6px 0 0">They show up here with their scoring line, and their profile is one tap away.</p>', `<a class="btn" href="#players">Find players</a>`)));

    // injuries: one row per injury report, keyed by the report itself so two reports on one player never collide
    if (inj && P.injuries) {
      S.injuries = S.injuries || {};
      const row = (x, i, t, p) => { const a = x.athlete || {}; const id = athId(a) || (p && p.id) || ''; const key = `h:${t.id}:${id}:${x.id || i}`; S.injuries[key] = { x, id, team: t }; const st = x.status || ''; const cls = /out/i.test(st) ? 'out' : /day|quest|doubt/i.test(st) ? 'q' : /prob|avail/i.test(st) ? 'ok' : ''; const det = x.details || {}; const ret = retInfo(L, det.returnDate); const why = [det.type || det.detail, ret ? ret.short : ''].filter(Boolean).join(', '); const name = a.displayName || (p && p.name) || ''; return `<button class="row" data-act="injury" data-key="${esc(key)}">${headshot(hsUrl(a) || (p && p.img) || '', t.color, 44, name)}<span class="t"><b>${esc(name)}${p && p.team ? `<small>${esc(p.team)}</small>` : ''}</b><span>${esc(why || (x.shortComment || '').slice(0, 80))}</span></span><span class="tag ${cls}">${esc(st)}</span></button>`; };
      if (mine.length) {
        const blocks = teams.filter(Boolean).map(t => {
          const b = inj.byTeam[t.id]; if (!b || !b.list.length) return '';
          return `<div class="injgrp"><div class="injhd">${logo(t.logo, 's')}<b>${esc(t.short)}</b><span>${b.list.length}</span></div>${b.list.map((x, i) => row(x, i, t, null)).join('')}</div>`;
        }).filter(Boolean);
        if (blocks.length) parts.push(sec('Injuries', 'your teams') + `<div class="rows">${blocks.join('')}</div>`);
      }
      if (fp.length) {
        const want = new Map(fp.map(p => [p.id, p])); const hits = [];
        (inj.teams || []).forEach(tt => (tt.injuries || []).forEach((x, i) => { const id = athId(x.athlete); if (want.has(id)) hits.push({ x, i, tt, p: want.get(id) }); }));
        if (hits.length) parts.push(sec('Injuries', 'your players') + `<div class="rows">${hits.map(({ x, i, tt, p }) => row(x, i, { id: String(tt.id || ''), short: tt.displayName || p.team || '', color: p.color || '' }, p)).join('')}</div>`);
      }
    }

    // news about my teams and players: ESPN tags every story with the teams and athletes it covers; full names are the fallback
    if (P.news) {
      const tIds = new Set(mine.map(String)), pIds = new Set(fp.map(p => p.id));
      const tNames = teams.filter(Boolean).flatMap(t => [t.name, t.short, t.loc]).filter(n => n && n.length > 3);
      const pNames = fp.map(p => p.name).filter(n => n && n.length > 3);
      const tagged = a => (a.categories || []).some(c => (c.type === 'team' && tIds.has(String(c.teamId || (c.team && c.team.id) || ''))) || (c.type === 'athlete' && pIds.has(String(c.athleteId || (c.athlete && c.athlete.id) || ''))));
      const named = a => { const txt = `${a.headline || ''} ${a.description || ''}`; return pNames.some(n => txt.includes(n)) || tNames.some(n => txt.includes(n)); };
      const arts = news && news.articles ? news.articles.filter(a => a.headline && (tagged(a) || named(a))).slice(0, 6) : [];
      if (arts.length) parts.push(sec('News', 'your teams and players') + `<div class="rows">${arts.map(a => HW.v5.newsRow(lk, a)).join('')}</div>`);
    }

    if (!parts.length) parts.push(empty('Everything is switched off', '<p style="margin:6px 0 0">Turn some sections back on and Home fills up again.</p>', `<a class="btn" href="#settings">Settings</a>`));
    $main.innerHTML = parts.join('');
  }

  /* ================= SCORES: every game, compact ================= */
  async function scores(lk) {
    const L = LEAGUES[lk]; const today = todayCT();
    let ymd = store.get('v5:date', today); if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd) || Math.abs(new Date(ymd) - new Date(today)) > 200 * 864e5) ymd = today;
    const far = Math.abs(new Date(ymd) - new Date(today)) > 4 * 864e5; const center = far ? ymd : today;
    const days = Array.from({ length: 9 }, (_, i) => addDays(center, i - 4));
    const dayBtn = (d, lab) => `<button class="day${d === ymd ? ' on' : ''}" data-act="date" data-ymd="${d}" aria-pressed="${d === ymd}"><em>${esc(lab)}</em><b>${+d.slice(8)}</b></button>`;
    const strip = `<div class="dates" id="dates"><button class="day cal" data-act="calendar" data-ymd="${esc(ymd)}" aria-label="Open the calendar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/></svg><em>${esc(dayLabel(ymd, { month: 'short' }))}</em></button>${far ? dayBtn(today, 'Today') + '<span class="gap"></span>' : ''}${days.map(d => dayBtn(d, d === today ? 'Today' : dayLabel(d, { weekday: 'short' }))).join('')}</div>`;
    const head = strip;
    $main.innerHTML = head + skeleton(4, 'card');
    const [games, ctx, meta] = await Promise.all([ymd === today && S.today[lk] && S.today[lk].length ? S.today[lk] : scoreboard(L, ymd).catch(() => null), forecastCtx(L, ymd).catch(() => null), sbMeta(L, ymd)]);
    if (ymd === today && games) S.today[lk] = games;
    const el = $main.querySelector('#dates .on'); if (el) el.scrollIntoView({ inline: 'center', block: 'nearest' });
    const phase = meta.phase ? `<p class="phase">${esc(L.label)} ${esc(meta.phase)}</p>` : '';
    if (!games) { $main.innerHTML = head + phase + empty("Couldn't load the scoreboard", '<p style="margin:6px 0 0">The feed didn\'t answer. It usually comes back within a minute.</p>'); return; }
    if (!games.length) {
      // say when the next games are, and let the strip jump there; the season's calendar comes with the scoreboard
      const next = meta.cal.find(d => d > ymd), last = meta.cal.filter(d => d < ymd).slice(-1)[0];
      const when = next ? (next === addDays(today, 1) ? 'tomorrow' : next === today ? 'today' : `on ${dayLabel(next, { weekday: 'long', month: 'short', day: 'numeric' })}`) : '';
      const body = next ? `<p style="margin:6px 0 0">Next ${esc(L.label)} games are ${esc(when)}.</p>` : meta.cal.length ? `<p style="margin:6px 0 0">The season is over${last ? `; the last games were ${esc(dayLabel(last, { month: 'long', day: 'numeric' }))}` : ''}. Next season shows here once the schedule is posted.</p>` : '';
      $main.innerHTML = head + phase + empty(`No ${L.label} games ${ymd === today ? 'today' : 'on ' + dayLabel(ymd, { weekday: 'long', month: 'short', day: 'numeric' })}`, body, next ? `<button class="btn" data-act="date" data-ymd="${esc(next)}">Jump to ${esc(dayLabel(next, { weekday: 'short', month: 'short', day: 'numeric' }))}</button>` : '');
      return;
    }
    const by = st => games.filter(g => g.state === st).sort((a, b) => rankGame(b) - rankGame(a) || new Date(a.date) - new Date(b.date));
    const live = by('in'), pre = by('pre'), post = by('post');
    const block = (title, list) => list.length ? sec(title, `${list.length}`) + `<div class="games">${list.map(g => gameCard(L, g, ctx, false, true)).join('')}</div>` : '';
    $main.innerHTML = head + phase + block('Live', live) + block(ymd === today ? 'Upcoming' : 'Scheduled', pre) + block('Final', post);
    const el2 = $main.querySelector('#dates .on'); if (el2) el2.scrollIntoView({ inline: 'center', block: 'nearest' });
  }
  /* a month of games at a glance: how many each day, and whether one of your teams plays. The pros fit in one
     request; college gets a request per week because a single day can have a hundred games. */
  const monthCache = {};
  async function monthGames(L, ym) {
    const key = `${L.key}:${ym}`; if (monthCache[key] && Date.now() - monthCache[key].t < 1800000) return monthCache[key].v;
    const [y, m] = ym.split('-').map(Number); const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const d0 = `${ym}-01`, d1 = `${ym}-${String(last).padStart(2, '0')}`;
    const spans = /^ncaa/.test(L.key) ? Array.from({ length: Math.ceil(last / 7) }, (_, i) => [`${ym}-${String(i * 7 + 1).padStart(2, '0')}`, `${ym}-${String(Math.min(last, i * 7 + 7)).padStart(2, '0')}`]) : [[d0, d1]];
    const params = L.sbParams.replace(/&limit=\d+/, '');
    const pages = await Promise.all(spans.map(([a, b]) => jSoft(`${API(L)}/scoreboard?dates=${HW.compact(addDays(a, -1))}-${HW.compact(addDays(b, 1))}${params}&limit=1000`, 1800000)));
    const mine = new Set((favs.all()[L.key] || []).map(String)); const days = {}; let truncated = false;
    pages.forEach(pg => { const evs = pg && pg.events || []; if (evs.length >= 1000) truncated = true; evs.forEach(e => { let ymd; try { ymd = HW.ymdOf(e.date); } catch { return; } if (!ymd || ymd.slice(0, 7) !== ym) return; const d = days[ymd] || (days[ymd] = { n: 0, mine: false }); d.n++; const comp = e.competitions && e.competitions[0]; if (comp && (comp.competitors || []).some(c => c.team && mine.has(String(c.team.id)))) d.mine = true; }); });
    const v = { days, truncated }; if (Object.keys(days).length || pages.some(Boolean)) monthCache[key] = { t: Date.now(), v }; return v;
  }
  /* what else the scoreboard says: the league's game-day calendar and the part of the season it is (regular season, playoffs) */
  async function sbMeta(L, ymd) {
    const t = todayCT(); const d = await jSoft(`${API(L)}/scoreboard?dates=${HW.compact(ymd)}${L.sbParams}`, ymd === t ? 25000 : (ymd < t ? 3600000 : 300000));
    const lg = d && d.leagues && d.leagues[0] || {};
    const cal = (lg.calendar || []).map(x => typeof x === 'string' ? x : x && (x.startDate || x.date) || '').filter(Boolean).map(x => String(x).slice(0, 10)).sort();
    const name = lg.season && lg.season.type && lg.season.type.name || '';
    const phase = /post/i.test(name) ? 'Playoffs' : /pre/i.test(name) ? 'Preseason' : /off/i.test(name) ? 'Off-season' : '';
    return { cal, phase };
  }

  /* ================= PLAYER ================= */
  async function player(lk, id) {
    const L = LEAGUES[lk]; if (!L || !id) { $main.innerHTML = empty('Player not found'); return; }
    $main.innerHTML = `<div class="topbar"><a class="ib" href="#home" data-act="back" aria-label="Back"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m14 6-6 6 6 6"/></svg></a></div>` + skeleton(1, 'card') + skeleton(6, 'row');
    const bioUrl = `${WEB(L)}/athletes/${id}`;
    const coreUrl = `https://sports.core.api.espn.com/v2/sports/basketball/leagues/${L.path.split('/')[1]}/athletes/${id}`;
    // two sources for the bio: the site feed (team, headshot, injuries) and the core record (birthplace, hand, class, debut), merged field by field
    let [bio, ov, gl, career, core] = await Promise.all([jSoft(bioUrl, 3600000), jSoft(`${WEB(L)}/athletes/${id}/overview`, 600000), jSoft(`${WEB(L)}/athletes/${id}/gamelog`, 600000), jSoft(`${WEB(L)}/athletes/${id}/stats`, 3600000), jSoft(coreUrl, 3600000)]);
    if (!bio) bio = await jSoft(bioUrl, 0);   // one retry: the bio endpoint drops requests now and then
    let a = bio && (bio.athlete || bio);
    if (!a || !a.displayName) {   // second source: the core API, then at least a name and headshot from the league list
      if (!core) core = await jSoft(coreUrl, 0);
      if (core && core.displayName) a = { ...core, team: core.team && core.team.$ref ? null : core.team, headshot: core.headshot, position: core.position && core.position.$ref ? null : core.position, college: core.college && core.college.$ref ? null : core.college, injuries: [] };
      else { const lp0 = await leaguePlayers(L).catch(() => null); const p = lp0 && lp0.rows.find(x => x.id === String(id)); if (p) a = { id, displayName: p.name, shortName: p.short, headshot: p.img ? { href: p.img } : null, position: { displayName: p.pos }, team: { id: p.teamId } }; }
    }
    if (!a || !a.displayName) { $main.innerHTML = `<div class="topbar"><a class="ib" href="#home" data-act="back" aria-label="Back"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m14 6-6 6 6 6"/></svg></a></div>` + empty("Couldn't load this player", '<p style="margin:6px 0 0">ESPN\'s feed didn\'t answer for this player. <a href="#" data-act="reload">Try again</a>.</p>'); return; }
    if (core && core.displayName) {   // fill what the site feed left blank from the core record (never a $ref, those are links not values)
      const plain = v => v && typeof v === 'object' && v.$ref ? null : v;
      ['fullName', 'firstName', 'lastName', 'dateOfBirth', 'age', 'displayHeight', 'displayWeight', 'birthPlace', 'hand', 'experience', 'debutYear', 'draft', 'status', 'citizenship', 'jersey', 'displayDraft', 'highSchool'].forEach(k => { const v = plain(core[k]); if (v != null && v !== '' && (a[k] == null || a[k] === '' || (typeof a[k] === 'object' && !Object.keys(a[k]).length))) a[k] = v; });
      if (!a.injuries || !a.injuries.length) a.injuries = (core.injuries || []).filter(x => x && !x.$ref && x.status);
    }
    if (a.team && !a.team.color) { const idx0 = await teamsIndex(L); const t0 = idx0[String(a.team.id)]; if (t0) a.team = { ...a.team, ...{ color: (t0.color || '').replace('#', ''), displayName: a.team.displayName || t0.name, shortDisplayName: a.team.shortDisplayName || t0.short, logos: a.team.logos || [{ href: t0.logo }], abbreviation: a.team.abbreviation || t0.abbr } }; }
    const tm = a.team || {}; const color = hx(tm.color) || '#2A2D33'; const alt = hx(tm.alternateColor);
    const teamLogo = tm.logos && tm.logos[0] && tm.logos[0].href;
    const college = /^ncaa/.test(lk);
    const st = ov && ov.statistics; const labels = st && st.labels || [];
    const split = st && st.splits && (st.splits.find(s => /regular/i.test(s.displayName)) || st.splits[0]);
    const val = l => { const i = labels.indexOf(l); return split && i >= 0 ? split.stats[i] : ''; };
    const cat = career && career.categories && (career.categories.find(c => /average/i.test(c.name)) || career.categories[0]);
    const cl = cat && (cat.labels || cat.names) || []; const ci = l => cl.indexOf(l);
    const cur = cat && cat.statistics && cat.statistics.length ? cat.statistics[cat.statistics.length - 1] : null;   // the latest season on record
    const following = fplayers.has(lk, id);
    const injury = a.injuries && a.injuries.find(x => x && !x.$ref && x.status) || null;
    const subLine = `${tm.id ? `<a href="${href.team(lk, tm.id)}">${esc(tm.shortDisplayName || tm.name || tm.displayName)}</a> ` : ''}${esc((a.position && a.position.displayName || '').toLowerCase())}${a.jersey ? `, No. ${esc(a.jersey)}` : ''}`;
    const country = a.citizenship || (a.birthPlace && a.birthPlace.country && !/^(USA|United States)$/i.test(a.birthPlace.country) ? a.birthPlace.country : '');
    const hometown = a.birthPlace ? [a.birthPlace.city, a.birthPlace.state || (country ? '' : a.birthPlace.country)].filter(Boolean).join(', ') : '';
    const classWord = college && a.experience && (a.experience.displayValue || ({ 1: 'Freshman', 2: 'Sophomore', 3: 'Junior', 4: 'Senior' })[a.experience.years]) || '';
    const classIdx = { freshman: 1, sophomore: 2, junior: 3, senior: 4 }[String(classWord).toLowerCase().replace(/^redshirt\s+/, '')] || 0;
    const gradYear = classIdx ? HW.seasonYear() + (4 - classIdx) : 0;
    const facts = [a.displayHeight, a.displayWeight, college ? classWord : (a.age ? `Age ${a.age}` : ''), country, !college && a.college && a.college.name, hometown].filter(Boolean);
    const snap = { lk, id: String(id), name: a.displayName, short: a.shortName || a.displayName, img: a.headshot && a.headshot.href, team: tm.abbreviation || '', color };
    const hero = `<div class="ehero" style="--a:${esc(color)}">
      <div class="wm">${esc(a.jersey || '')}</div>
      <div class="in"><div class="sub">${subLine}</div><h1>${esc(a.firstName || '')}<br>${esc(a.lastName || a.displayName)}</h1>
        <div class="facts">${facts.map(f => `<span>${esc(f)}</span>`).join('')}</div>
        <div class="acts"><button class="${following ? 'on' : ''}" data-act="follow-player" data-snap='${esc(JSON.stringify(snap))}' aria-pressed="${following}">${following ? starSvg : starLine}${following ? 'Following' : 'Follow'}</button>${tm.id ? `<a href="${href.team(lk, tm.id)}">${esc(tm.shortDisplayName || tm.name || 'Team')}</a>` : ''}</div>
      </div>
      <div class="shot">${a.headshot && a.headshot.href ? `<img src="${esc(a.headshot.href)}" alt="" ${hide}>` : ''}</div>
    </div>`;
    let injStrip = '';
    if (injury) {
      S.injuries = S.injuries || {}; const key = `p:${id}:${injury.id || 0}`; S.injuries[key] = { x: { ...injury, athlete: { id: String(id), displayName: a.displayName, headshot: a.headshot && a.headshot.href, position: a.position } }, id: String(id), team: { id: tm.id, short: tm.shortDisplayName || tm.name || '', color } };
      const st0 = injury.status || ''; const cls = /out/i.test(st0) ? 'out' : /day|quest|doubt/i.test(st0) ? 'q' : 'ok'; const det = injury.details || {}; const ret = retInfo(L, det.returnDate);
      injStrip = `<button class="injstrip ${cls}" data-act="injury" data-key="${esc(key)}"><span class="tag ${cls}">${esc(st0)}</span><span class="t"><b>${esc(det.type || det.detail || 'Injury')}${det.detail && det.detail !== det.type ? `, ${esc(det.detail.toLowerCase())}` : ''}</b><span>${ret ? (ret.far ? 'No return date this season' : `Expected back around ${esc(ret.long)}`) : esc((injury.shortComment || injury.longComment || 'Tap for the note').slice(0, 70))}</span></span>${chev}</button>`;
    }
    // the game log: regular-season games, newest first
    let evRows = [];
    if (gl && gl.events && gl.seasonTypes) { const types = gl.seasonTypes.filter(t => /regular/i.test(t.displayName || '')).length ? gl.seasonTypes.filter(t => /regular/i.test(t.displayName || '')) : gl.seasonTypes; types.forEach(stp => (stp.categories || []).forEach(c => (c.events || []).forEach(e => { const meta = gl.events[e.eventId]; if (meta) evRows.push({ meta, stats: e.stats || [], id: e.eventId }); }))); evRows.sort((x, y) => new Date(y.meta.gameDate) - new Date(x.meta.gameDate)); }
    const gLabels = gl && gl.labels || [];
    const gi = l => gLabels.indexOf(l);
    const made = (r, l) => { const i = gi(l); const v = i >= 0 ? String(r.stats[i] || '') : ''; const m = v.match(/^(\d+)-(\d+)$/); return m ? [+m[1], +m[2]] : [0, 0]; };

    /* season averages: every per-game number the feed gives, and a ring for how the big ones break down.
       This season's split when it has games; otherwise the latest season on record, labelled as such. */
    const num = v => { const n = parseFloat(v); return isNaN(n) ? null : n; };
    const liveSeason = !!(split && num(val('GP')));
    const stat = l => liveSeason ? num(val(l)) : (cur && ci(l) >= 0 ? num(cur.stats[ci(l)]) : null);
    const crow = l => cur && ci(l) >= 0 ? num(cur.stats[ci(l)]) : null;
    const seasonName = liveSeason ? (split.displayName || 'This season') : cur && cur.season ? `${cur.season.displayName || cur.season.year} season` : '';
    const fmt = (v, l) => v == null ? '—' : /%/.test(l) ? v.toFixed(1) : (Number.isInteger(v) && /^(GP|GS)$/.test(l) ? String(v) : v.toFixed(1));
    const G = [['PTS', 'Points'], ['REB', 'Rebounds'], ['AST', 'Assists'], ['STL', 'Steals'], ['BLK', 'Blocks'], ['TO', 'Turnovers'], ['MIN', 'Minutes'], ['FG%', 'Field goal %'], ['3P%', 'Three %'], ['FT%', 'Free throw %'], ['PF', 'Fouls'], ['GP', 'Games']];
    const grid = G.map(([k, l]) => ({ k, l, v: stat(k) })).filter(x => x.v != null);
    const ring = (segs, center, label, title) => {
      const live = segs.filter(x => x.v > 0); const total = live.reduce((a, x) => a + x.v, 0); const R = 54, C = 2 * Math.PI * R, gap = live.length > 1 ? 17 : 0; let off = 0;
      const arcs = live.map(x => { const share = x.v / total * C; const len = Math.max(1, share - gap); const a = `<circle cx="70" cy="70" r="${R}" stroke="${x.c}" stroke-width="13" stroke-linecap="${len > 6 ? 'round' : 'butt'}" stroke-dasharray="${len.toFixed(1)} ${(C - len).toFixed(1)}" stroke-dashoffset="${(-(off + (gap ? gap / 2 : 0))).toFixed(1)}" opacity="${x.o || 1}"/>`; off += share; return a; }).join('');
      return `<div class="ring"><svg width="150" height="150" viewBox="0 0 140 140" role="img" aria-label="${esc(title)}"><circle cx="70" cy="70" r="${R}" fill="none" stroke="var(--surf-3)" stroke-width="13"/><g fill="none" transform="rotate(-90 70 70)">${arcs}</g><text x="70" y="73" text-anchor="middle" fill="var(--ink)" style="font:800 34px var(--num)">${esc(center)}</text><text x="70" y="91" text-anchor="middle" fill="var(--ink-3)" style="font:700 11px var(--ui);letter-spacing:.06em">${esc(label)}</text></svg><div class="key">${segs.map(x => `<div><i style="background:${x.c};opacity:${x.o || 1}"></i><span>${esc(x.l)}</span><b>${x.v == null ? '—' : x.v.toFixed(1)}</b><em>${total && x.v > 0 ? Math.round(x.v / total * 100) + '%' : ''}</em></div>`).join('')}</div></div>`;
    };
    const tones = [{ c: color, o: 1 }, { c: color, o: .62 }, { c: color, o: .3 }];
    const views = [];
    // points: twos, threes and free throws per game, from the game log when it has games
    if (evRows.length && gi('FG') >= 0 && gi('3PT') >= 0 && gi('FT') >= 0) {
      const n = evRows.length; let fg = 0, tp = 0, ft = 0; evRows.forEach(r => { fg += made(r, 'FG')[0]; tp += made(r, '3PT')[0]; ft += made(r, 'FT')[0]; });
      const twos = (fg - tp) * 2 / n, threes = tp * 3 / n, fts = ft / n;
      views.push(['pts', 'Points', ring([{ l: 'Twos', v: twos, ...tones[0] }, { l: 'Threes', v: threes, ...tones[1] }, { l: 'Free throws', v: fts, ...tones[2] }], (twos + threes + fts).toFixed(1), 'PPG', 'points a game')]);
    } else if (stat('PTS') != null) views.push(['pts', 'Points', ring([{ l: 'Points', v: stat('PTS'), ...tones[0] }], stat('PTS').toFixed(1), 'PPG', 'points a game')]);
    if (crow('OR') != null && crow('DR') != null && (crow('OR') + crow('DR')) > 0) views.push(['reb', 'Rebounds', ring([{ l: 'Defensive', v: crow('DR'), ...tones[0] }, { l: 'Offensive', v: crow('OR'), ...tones[1] }], (crow('OR') + crow('DR')).toFixed(1), 'RPG', 'rebounds a game')]);
    else if (stat('REB') != null) views.push(['reb', 'Rebounds', ring([{ l: 'Rebounds', v: stat('REB'), ...tones[0] }], stat('REB').toFixed(1), 'RPG', 'rebounds a game')]);
    if (stat('AST') != null) views.push(['ast', 'Assists', ring([{ l: 'Assists', v: stat('AST'), ...tones[0] }, { l: 'Turnovers', v: stat('TO'), ...tones[2] }], stat('AST').toFixed(1), 'APG', 'assists a game') + (stat('TO') ? `<p class="ringnote">${(stat('AST') / stat('TO')).toFixed(1)} assists for every turnover</p>` : '')]);
    if (stat('STL') != null || stat('BLK') != null) views.push(['def', 'Defense', ring([{ l: 'Steals', v: stat('STL') || 0, ...tones[0] }, { l: 'Blocks', v: stat('BLK') || 0, ...tones[1] }], ((stat('STL') || 0) + (stat('BLK') || 0)).toFixed(1), 'STL + BLK', 'steals and blocks a game')]);
    if (stat('FG%') != null) {
      const bar = (l, v, sub) => `<div><span>${l}</span><em><i style="width:${Math.max(0, Math.min(100, v || 0))}%"></i></em><b>${v == null ? '—' : v.toFixed(1)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div>`;
      const att = (k) => { const v = crow(k); return v; };
      views.push(['sh', 'Shooting', `<div class="bars" style="--tc:${esc(color)}">${bar('Field goals', stat('FG%'), crow('FG') != null ? '' : '')}${bar('Threes', stat('3P%'))}${bar('Free throws', stat('FT%'))}</div>` + (cur && ci('FG') >= 0 ? `<p class="ringnote">Per game: ${esc(String(cur.stats[ci('FG')]))} FG, ${esc(String(cur.stats[ci('3PT')] || ''))} 3PT, ${esc(String(cur.stats[ci('FT')] || ''))} FT (made-attempted)</p>` : '')]);
    }
    const avgCard = (views.length || grid.length) ? `<section class="card avg"><div class="card-h"><h2>Season averages</h2><small>${esc(seasonName)}</small></div>
      ${views.length ? `<div class="chips" role="tablist">${views.map(([k, l], i) => `<button class="chip${i === 0 ? ' on' : ''}" data-act="mix" data-mix="${k}" aria-pressed="${i === 0}">${l}</button>`).join('')}</div>${views.map(([k, , html], i) => `<div data-mix-panel="${k}"${i === 0 ? '' : ' hidden'}>${html}</div>`).join('')}` : ''}
      ${grid.length ? `<div class="sgrid">${grid.map(x => `<div><b>${esc(fmt(x.v, x.k))}</b><span>${esc(x.l)}</span></div>`).join('')}</div>` : ''}
      <div class="card-f"><button data-act="ptab" data-tab="stats">All stats, game log and career</button></div></section>` : '';

    // next game for the team
    let next = '';
    if (tm.id) { const t = await teamInfo(L, tm.id); if (t && t.next) { const ctx = await forecastCtx(L, todayCT()).catch(() => null); next = sec('Next up') + `<div class="games">${gameCard(L, t.next, ctx)}</div>`; } }

    // game log
    let log = '';
    if (evRows.length) {
      const cols = ['MIN', 'PTS', 'REB', 'AST'].filter(l => gi(l) >= 0);
      log = sec('Last five', '', `<button data-act="ptab" data-tab="stats">Full log</button>`) + `<div class="tw"><table class="tbl"><thead><tr><th>Game</th>${cols.map(c => `<th>${c === 'MIN' ? 'Min' : c[0] + c.slice(1).toLowerCase()}</th>`).join('')}<th>Result</th></tr></thead><tbody>${evRows.slice(0, 5).map(r => { const m = r.meta; const op = m.opponent || {}; return `<tr class="click" data-href="${href.game(lk, r.id)}"><td><span class="opp"><em>${esc(dateShort(m.gameDate))}</em>${logo(op.logo, 's')}${esc(m.atVs || '')} ${esc(op.abbreviation || '')}</span></td>${cols.map(c => `<td>${c === 'PTS' ? `<b>${esc(r.stats[gi(c)])}</b>` : esc(r.stats[gi(c)])}</td>`).join('')}<td><span class="res ${m.gameResult === 'W' ? 'w' : 'l'}">${esc(m.gameResult || '')}</span> <span class="mut">${esc(m.score || '')}</span></td></tr>`; }).join('')}</tbody></table></div>`;
    }

    // latest stories and clips
    const items = ov && ov.news ? ov.news.filter(n => n.headline) : [];
    const isClip = n => (n.video || n.videos || []).length && (/media|video/i.test(n.type || '') || !n.description);
    const clips = items.filter(isClip).slice(0, 10), stories = items.filter(n => !isClip(n)).slice(0, 6);
    clips.forEach(n => (n.video || n.videos || []).forEach(v => { if (v && v.id != null) S.videos[String(v.id)] = v; }));
    const moments = clips.length ? sec('Top moments') + `<div class="media">${clips.map(n => { const v = (n.video || n.videos)[0]; const im = (n.images && n.images[0] && n.images[0].url) || v.thumbnail; return `<button class="clip" data-act="play" data-vid="${esc(String(v.id))}"><div class="th">${im ? `<img src="${esc(im)}" alt="" loading="lazy">` : ''}<i><svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l12-7.5z"/></svg></i>${v.duration ? `<em>${Math.floor(v.duration / 60)}:${String(v.duration % 60).padStart(2, '0')}</em>` : ''}</div><b>${esc(n.headline)}</b><span>${esc(n.published ? ago(n.published) : '')}</span></button>`; }).join('')}</div>` : '';
    const latest = moments + (stories.length ? sec('Stories') + `<div class="rows">${stories.map(n => HW.v5.newsRow(lk, n)).join('')}</div>` : '');

    // career, by season
    let careerT = '';
    if (cat && cat.statistics && cat.statistics.length) {
      const want = [['GP', 'GP'], ['PTS', 'PPG'], ['REB', 'RPG'], ['AST', 'APG'], ['FG%', 'FG%']].filter(([k]) => ci(k) >= 0);
      const rows = cat.statistics.slice().reverse();
      careerT = sec('Career', 'per game') + `<div class="tw"><table class="tbl"><thead><tr><th>Season</th>${want.map(([, l]) => `<th>${l}</th>`).join('')}</tr></thead><tbody>${rows.map((r, i) => `<tr${i === 0 ? ' class="hi"' : ''}><td>${esc(r.season && (r.season.displayName || r.season.year) || '')} <span class="mut" style="color:var(--ink-3)">${esc((r.teamSlug || '').toUpperCase().slice(0, 3))}</span></td>${want.map(([k]) => `<td>${k === 'PTS' ? `<b>${esc(r.stats[ci(k)])}</b>` : esc(r.stats[ci(k)])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    }

    // about: everything the two feeds say about the person, one row each
    const born = a.dateOfBirth ? new Date(a.dateOfBirth).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '';
    const exp = a.experience || {}; const seasons = !college && exp.years != null ? (exp.years === 0 ? 'Rookie' : `${ordinal(exp.years + 1)} season`) : (!college && exp.displayValue) || '';
    const about = [
      ['Full name', a.fullName && a.fullName !== a.displayName ? a.fullName : ''],
      ['Born', [born, a.age ? `age ${a.age}` : ''].filter(Boolean).join(', ')],
      ['Hometown', hometown],
      ['Country', country || (a.birthPlace && a.birthPlace.country) || ''],
      ['Height', a.displayHeight || ''], ['Weight', a.displayWeight || ''],
      ['Position', a.position && a.position.displayName || ''],
      ['Jersey', a.jersey ? `No. ${a.jersey}` : ''],
      ['Shoots', a.hand && (a.hand.displayValue || a.hand.type) ? `${a.hand.displayValue || a.hand.type}-handed`.replace(/^(\w)/, c => c.toUpperCase()) : ''],
      ['Class', college && classWord ? `${classWord}, ${HW.seasonYear() - 1}-${String(HW.seasonYear()).slice(2)}${gradYear ? ` (class of ${gradYear} on a four-year track)` : ''}` : ''],
      ['Drafted', a.displayDraft || (a.draft && a.draft.displayText) || (a.draft && a.draft.year ? `${a.draft.year}, round ${a.draft.round}, pick ${a.draft.selection}` : '') || ''],
      ['Debut', a.debutYear ? String(a.debutYear) : ''],
      ['Experience', seasons],
      ['College', !college && a.college && a.college.name || ''],
      ['High school', a.highSchool && (a.highSchool.name || a.highSchool) || ''],
      ['Status', a.status && a.status.name || '']
    ].filter(([, v]) => v);
    const aboutT = about.length ? sec('About') + `<table class="tbl kv"><tbody>${about.map(([k, v]) => `<tr><td>${k}</td><td>${esc(String(v))}</td></tr>`).join('')}</tbody></table>` : '';

    // season splits: every column the feed gives, per split (regular season, postseason)
    const splitsT = st && st.splits && st.splits.length && labels.length ? sec('Season averages') + `<div class="tw"><table class="tbl"><thead><tr><th>Split</th>${labels.map(l => `<th>${esc(l)}</th>`).join('')}</tr></thead><tbody>${st.splits.map(sp => `<tr><td class="l">${esc(sp.displayName)}</td>${sp.stats.map(x => `<td>${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '';
    const fullLog = evRows.length ? sec('Game log', `${evRows.length} games`) + `<div class="tw"><table class="tbl"><thead><tr><th>Game</th>${gLabels.map(l => `<th>${esc(l)}</th>`).join('')}</tr></thead><tbody>${evRows.map(r => { const m = r.meta; const op = m.opponent || {}; return `<tr class="click" data-href="${href.game(lk, r.id)}"><td><span class="opp"><em>${esc(dateShort(m.gameDate))}</em>${esc(m.atVs || '')} ${esc(op.abbreviation || '')} <span class="res ${m.gameResult === 'W' ? 'w' : 'l'}">${esc(m.gameResult || '')}</span></span></td>${r.stats.map(x => `<td>${esc(x)}</td>`).join('')}</tr>`; }).join('')}</tbody></table></div>` : '';
    const injT = injury ? (() => { const det = injury.details || {}; const ret = retInfo(L, det.returnDate); const what = [det.type, det.detail && det.detail !== det.type ? det.detail : '', det.side && det.side !== 'Not Specified' ? det.side.toLowerCase() : '', det.location && det.location !== det.type ? det.location : ''].filter(Boolean).join(', '); return `<table class="tbl kv"><tbody><tr><td>Status</td><td><span class="tag ${/out/i.test(injury.status) ? 'out' : 'q'}">${esc(injury.status)}</span></td></tr>${what ? `<tr><td>Injury</td><td>${esc(what)}</td></tr>` : ''}${injury.date ? `<tr><td>Reported</td><td>${esc(new Date(injury.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: HW.TZ }))}</td></tr>` : ''}${ret ? `<tr><td>Expected back</td><td>${esc(ret.long)}</td></tr>` : ''}${injury.longComment || injury.shortComment ? `<tr class="note"><td colspan="2">${esc(injury.longComment || injury.shortComment)}</td></tr>` : ''}</tbody></table>`; })() : '';
    const panels = {
      summary: avgCard + next + log + moments,
      stats: (splitsT + fullLog + careerT) || empty('No stats yet', '<p style="margin:6px 0 0">Stats start with the first game of the season.</p>'),
      bio: (injury ? sec('Injury') + injT : '') + (aboutT || sec('About') + empty('Nothing on file', '<p style="margin:6px 0 0">The feed has no bio for this player yet.</p>')),
      news: (moments + (stories.length ? sec('Stories') + `<div class="rows">${stories.map(n => HW.v5.newsRow(lk, n)).join('')}</div>` : '')) || empty('Nothing recent', '<p style="margin:6px 0 0">No stories or clips on this player in the feed right now.</p>')
    };
    let ptab = store.get('v5:ptab2', 'summary'); if (!panels[ptab]) ptab = 'summary';
    const ptabs = `<div class="chips ptabs" role="tablist" style="padding-top:14px">${[['summary', 'Summary'], ['stats', 'Stats'], ['bio', 'Bio'], ['news', 'News']].map(([k, l]) => `<button class="chip${k === ptab ? ' on' : ''}" data-act="ptab" data-tab="${k}" aria-pressed="${k === ptab}">${l}</button>`).join('')}</div>`;
    $main.innerHTML = `<div class="topbar"><a class="ib" href="#home" data-act="back" aria-label="Back"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m14 6-6 6 6 6"/></svg></a>${tm.id ? `<a class="ttl" href="${href.team(lk, tm.id)}">${esc(tm.displayName || '')}</a>` : ''}<div class="sp"><button class="ib" data-act="share" data-title="${esc(a.displayName)}" aria-label="Share"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg></button></div></div>` + hero + injStrip + ptabs + Object.entries(panels).map(([k, html]) => `<div data-ptab-panel="${k}"${k === ptab ? '' : ' hidden'}>${html}</div>`).join('');
    $main.addEventListener('click', e => { const b = e.target.closest('[data-act="ptab"]'); if (!b) return; e.preventDefault(); const k = b.dataset.tab; store.set('v5:ptab2', k); $main.querySelectorAll('[data-act="ptab"]').forEach(x => { const on = x.dataset.tab === k; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); }); $main.querySelectorAll('[data-ptab-panel]').forEach(p => { p.hidden = p.dataset.ptabPanel !== k; }); });
    document.title = `${a.displayName} · RIVL`;
  }


  /* ================= PLAYERS: picked from the rosters of the teams you follow =================
     ESPN's season leaders are the wrong list for this (stale for college before tip-off, and nobody wants 360 schools of
     names), so the picker starts from your teams' rosters, lets you pull in any other team's roster by name, and for
     the pros adds the league's top scorers underneath. Setup and the Players tab share it. */
  const POS = { G: 'Guard', F: 'Forward', C: 'Center', 'G-F': 'Guard/forward', 'F-G': 'Forward/guard', 'F-C': 'Forward/center', 'C-F': 'Center/forward', PG: 'Point guard', SG: 'Shooting guard', SF: 'Small forward', PF: 'Power forward' };
  const posWord = p => POS[p] || p || '';
  async function rosterOf(L, id, idx) {
    id = String(id);
    const d = await jSoft(`${API(L)}/teams/${id}/roster`, 900000); if (!d || !d.athletes) return null;
    const t = d.team || {}, tt = idx[id] || {};
    const color = hx(t.color) || tt.color || '#2A2D33', abbr = t.abbreviation || tt.abbr || '';
    const team = { id, short: t.shortDisplayName || tt.short || t.name || '', name: t.displayName || tt.name || '', color, abbr, logo: tt.logo || (t.logos && t.logos[0] && t.logos[0].href) || '' };
    const players = (d.athletes || []).flatMap(a => a.items ? a.items : [a]).filter(a => a && a.id).map(a => ({ lk: L.key, id: String(a.id), name: a.displayName, short: a.shortName || a.displayName, img: hsUrl(a), team: abbr, teamId: id, color, pos: a.position && a.position.abbreviation || '', jersey: a.jersey || '' }));
    return { team, players };
  }
  /* a player row: in setup the whole row is the follow toggle; on the Players tab the row opens the profile and the star follows */
  function playerRow(p, { sub, on, select = false } = {}) {
    const snap = { lk: p.lk, id: p.id, name: p.name, short: p.short || p.name, img: p.img || '', team: p.team || '', color: p.color || '#2A2D33' };
    const star = `<span class="star${on ? ' on' : ''}">${on ? starSvg : starLine}</span>`;
    if (select) return `<button class="row prow sel${on ? ' on' : ''}" data-act="follow-player" data-snap='${esc(JSON.stringify(snap))}' aria-pressed="${on}">${headshot(p.img, p.color, 46, p.name)}<span class="t"><b>${esc(p.name)}</b><span>${esc(sub || '')}</span></span>${star}</button>`;
    return `<div class="row prow"><a class="go" href="${href.player(p.lk, p.id)}" aria-label="${esc(p.name)}">${headshot(p.img, p.color, 46, p.name)}</a><a class="t" href="${href.player(p.lk, p.id)}"><b>${esc(p.name)}</b><span>${esc(sub || '')}</span></a><button class="star${on ? ' on' : ''}" data-act="follow-player" data-snap='${esc(JSON.stringify(snap))}' aria-pressed="${on}" aria-label="${on ? 'Unfollow' : 'Follow'} ${esc(p.name)}">${on ? starSvg : starLine}</button></div>`;
  }
  const lastName = n => { const w = String(n || '').replace(/\s+(Jr\.?|Sr\.?|II|III|IV)$/i, '').trim().split(/\s+/); return w[w.length - 1] || ''; };
  async function playerPicker(el, L, { following = false, leaders = true, select = false } = {}) {
    const lk = L.key, pro = !/^ncaa/.test(lk);
    el.classList.add('pp');
    el.innerHTML = `<div class="search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.8-3.8"/></svg><input type="search" placeholder="Search players, or a team to see its roster" autocomplete="off" aria-label="Search players"></div><div class="pp-list">${skeleton(6, 'row')}</div>`;
    const inp = el.querySelector('input'), list = el.querySelector('.pp-list');
    const idx = await teamsIndex(L);
    const mine = favs.all()[lk] || [];
    const [lp, rosters] = await Promise.all([pro && leaders ? leaguePlayers(L).catch(() => null) : null, Promise.all(mine.map(id => rosterOf(L, id, idx).catch(() => null)))]);
    const ppg = {}; if (lp) lp.rows.forEach(r => { ppg[r.id] = r; });
    const line = p => { const r = ppg[p.id]; return r && r.gp ? `${r.pts.toFixed(1)} ppg` : ''; };
    const byLine = (a, b) => ((ppg[b.id] || {}).pts || 0) - ((ppg[a.id] || {}).pts || 0) || lastName(a.name).localeCompare(lastName(b.name)) || (a.name || '').localeCompare(b.name || '');
    const sections = rosters.filter(Boolean).map(r => ({ key: r.team.id, team: r.team, rows: r.players.slice().sort(byLine), open: false }));
    const missing = mine.filter((id, i) => !rosters[i]);
    const shown = () => new Set(sections.flatMap(s => s.rows.map(p => p.id)));
    const paint = () => {
      const q = inp.value.trim().toLowerCase();
      const fset = new Set(fplayers.all().filter(p => p.lk === lk).map(p => p.id));
      const rowOf = (p, s) => playerRow(p, { sub: [posWord(p.pos), p.jersey ? `No. ${p.jersey}` : '', line(p)].filter(Boolean).join(', '), on: fset.has(p.id), select });
      const parts = [];
      if (q) {
        const teams = Object.values(idx).filter(t => `${t.name} ${t.short} ${t.abbr}`.toLowerCase().includes(q) && !sections.some(s => s.key === t.id)).sort((a, b) => (a.short || '').localeCompare(b.short || '')).slice(0, 5);
        if (teams.length) parts.push(sec('Teams', 'tap to see the roster') + `<div class="rows">${teams.map(t => `<button class="row" data-pp="browse" data-id="${esc(t.id)}">${logo(t.logo)}<span class="t"><b>${esc(t.name)}</b><span>Show the roster</span></span>${chev}</button>`).join('')}</div>`);
      }
      if (following && !q) { const fl = fplayers.all().filter(p => p.lk === lk); if (fl.length) parts.push(sec('Following', `${fl.length}`) + `<div class="rows">${fl.map(p => playerRow(p, { sub: p.team || '', on: true, select })).join('')}</div>`); }
      sections.forEach(s => {
        const rows = q ? s.rows.filter(p => `${p.name} ${s.team.name} ${s.team.abbr}`.toLowerCase().includes(q)) : s.rows; if (!rows.length) return;
        parts.push(`<div class="sec pp-team"><h2>${logo(s.team.logo, 's')}${esc(s.team.short)}<small>${rows.length}</small></h2></div><div class="rows">${rows.map(p => rowOf(p, s)).join('')}</div>`);
      });
      if (lp && leaders) {
        const have = shown(); const top = lp.rows.filter(p => !have.has(p.id) && (!q || `${p.name} ${p.team}`.toLowerCase().includes(q))).sort((a, b) => b.pts - a.pts);
        const cut = q || paint.topOpen ? Math.min(top.length, 100) : Math.min(top.length, 15);
        if (top.length) parts.push(sec('Top scorers', 'this season', cut < top.length ? `<button data-pp="top">More</button>` : '') + `<div class="rows">${top.slice(0, cut).map(p => { const t = idx[p.teamId] || {}; return playerRow({ ...p, lk, color: t.color || '#2A2D33', team: t.short || p.team }, { sub: [t.short || p.team, posWord(p.pos).toLowerCase(), `${p.pts.toFixed(1)} ppg`].filter(Boolean).join(', '), on: fset.has(p.id), select }); }).join('')}</div>`);
      }
      if (!parts.length) parts.push(q ? empty('No one matches', '<p style="margin:6px 0 0">Try a last name, or a team to see its whole roster.</p>')
        : mine.length ? empty("Couldn't load your teams' rosters", '<p style="margin:6px 0 0">The feed didn\'t answer. Search a team to try again.</p>')
        : empty(pro ? 'Follow a team first' : 'Players come from the teams you follow', `<p style="margin:6px 0 0">${pro ? 'Your teams\' rosters show here, with the league\'s top scorers below.' : 'Follow a school and its roster shows here, or search any school above.'}</p>`));
      if (missing.length && !q) parts.push(`<p class="foot">${missing.length} of your teams didn't answer; search for the team to load its roster.</p>`);
      list.innerHTML = parts.join('');
    };
    paint();
    let t = null; inp.addEventListener('input', () => { clearTimeout(t); t = setTimeout(paint, 120); });
    el.addEventListener('click', async e => {
      const b = e.target.closest('[data-pp]'); if (!b) return; e.preventDefault();
      if (b.dataset.pp === 'top') { paint.topOpen = true; paint(); }
      else if (b.dataset.pp === 'browse') { b.querySelector('.t span').textContent = 'Loading…'; const r = await rosterOf(L, b.dataset.id, idx).catch(() => null); if (r) { sections.push({ key: r.team.id, team: r.team, rows: r.players.slice().sort(byLine), open: true }); inp.value = ''; } paint(); }
    });
    const sync = () => { if (!el.isConnected) { document.removeEventListener('rivl:follow', sync); return; } const fset = new Set(fplayers.all().filter(p => p.lk === lk).map(p => p.id)); el.querySelectorAll('[data-act="follow-player"]').forEach(b => { let id = ''; try { id = JSON.parse(b.dataset.snap).id; } catch { } const on = fset.has(String(id)); b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); const st = b.classList.contains('star') ? b : b.querySelector('.star'); if (st) { st.classList.toggle('on', on); st.innerHTML = on ? starSvg : starLine; } }); if (following && !inp.value) paint(); };
    document.addEventListener('rivl:follow', sync);
  }
  async function players(lk) {
    const L = LEAGUES[lk];
    $main.innerHTML = `<div class="page-h"><h1>Players</h1><p>From the teams you follow. Search any team to see its roster.</p></div><div id="ppick"></div>`;
    await playerPicker($main.querySelector('#ppick'), L, { following: true, leaders: true });
  }

  HW.v5 = Object.assign(HW.v5 || {}, { home, scores, player, players, playerPicker, rosterOf, monthGames, fplayers, prefs, teamInfo, teamsIndex, gameCard, heroCard,
    _: { h: H, logo, headshot, chev, sec, empty, skeleton, href, safeF, gameCard, heroCard, teamInfo, teamsIndex, fplayers, prefs, starSvg, starLine, tvLabel, teamColor, confName, dayUTC, athId, hsUrl, initials, retInfo, scVars } });
})();
