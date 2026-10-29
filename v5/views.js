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
  const href = { player: (lk, id) => `#player/${lk}/${id}`, team: (lk, id) => `#team/${lk}/${id}`, game: (lk, id) => `#game/${lk}/${id}` };
  const hide = `onerror="this.style.visibility='hidden'"`;
  const logo = (src, size = '') => `<span class="logo ${size}"><img src="${esc(src || '')}" alt="" loading="lazy" ${hide}></span>`;
  const headshot = (src, color, size = 64) => `<span class="hs" style="--tc:${esc(color || '#2A2D33')};width:${size}px;height:${size}px">${src ? `<img src="${esc(src)}" alt="" loading="lazy" ${hide}>` : ''}</span>`;
  const chev = `<span class="chev"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg></span>`;
  const sec = (title, small, action) => `<div class="sec"><h2>${esc(title)}${small ? `<small>${esc(small)}</small>` : ''}</h2>${action || ''}</div>`;
  const empty = (title, body, cta) => `<div class="empty"><b>${esc(title)}</b>${body || ''}${cta || ''}</div>`;
  const skeleton = (n = 3, kind = 'row') => Array.from({ length: n }, () => `<div class="skel ${kind}"></div>`).join('');
  const recOf = t => t && t.rec ? t.rec : '';
  const standingLine = (r, L) => !r ? '' : L.standingsMode === 'conferences' ? `${r.w}-${r.l}` : `${r.w}-${r.l}, ${ordinal(r.pos)} in the ${(r.groupAbbr || r.group || '').replace(/ern Conference$/, '')}`;
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
  function side(L, g, t, other) {
    const lo = g.state !== 'pre' && t.score != null && other.score != null && t.score < other.score;
    const sc = g.state === 'pre' ? '' : `<span class="sc">${t.score == null ? '' : t.score}</span>`;
    return `<div class="side${lo ? ' lo' : ''}">${logo(t.logo)}<span class="nm"><b>${t.rank ? `<i>${t.rank}</i>` : ''}${esc(t.short || t.name)}</b><span>${esc(recOf(t))}</span></span>${sc}</div>`;
  }
  function gameCard(L, g, ctx, withForecast = true, timeOnly = false) {
    const f = withForecast ? safeF(L, g, ctx) : null;
    return `<a class="game" href="${href.game(L.key, g.id)}" data-gid="${esc(g.id)}">
      ${side(L, g, g.away, g.home)}
      <div class="status">${statusLine(L, g, timeOnly)}<span class="ln"></span><span class="tv">${esc(tvLabel(g) || g.venue || '')}</span></div>
      ${side(L, g, g.home, g.away)}
      ${forecastRow(L, g, f)}</a>`;
  }
  function heroCard(L, g, ctx) {
    const f = safeF(L, g, ctx);
    const a = teamColor(g.away), b = teamColor(g.home);
    const fav = f ? (f.pHome >= .5 ? g.home : g.away) : null; const p = f ? Math.max(f.pHome, 1 - f.pHome) : 0;
    const tm = t => `<div class="tm">${logo(t.logo)}<b>${esc(t.short || t.name)}</b><span>${esc(recOf(t))}</span></div>`;
    return `<a class="hero" href="${href.game(L.key, g.id)}" data-gid="${esc(g.id)}" style="--a:${esc(a)};--b:${esc(b)}"><div class="in">
      <div class="vs">${tm(g.away)}<div class="mid"><span class="st${g.state === 'in' ? ' on' : ''}">${esc(g.state === 'in' ? g.detail : g.state === 'post' ? 'Final' : tip(g.date))}</span><div class="sc">${g.away.score ?? ''}<i>–</i>${g.home.score ?? ''}</div><span class="tv">${esc(tvLabel(g) || g.venue || '')}</span></div>${tm(g.home)}</div>
      ${f ? `<div class="fc"><div class="bar"><i style="width:${(p * 100).toFixed(1)}%"></i></div><b>${esc(fav.short)} ${pct(p)}</b></div>` : ''}
    </div></a>`;
  }

  /* ---------- team info (site API team endpoint: record, standing, next game, logo, colour) ---------- */
  async function teamInfo(L, id) {
    const d = await jSoft(`${API(L)}/teams/${id}`, 600000); const t = d && d.team; if (!t) return null;
    const rec = t.record && t.record.items && t.record.items.find(i => i.type === 'total' || i.description === 'Overall') || (t.record && t.record.items && t.record.items[0]);
    const next = t.nextEvent && t.nextEvent[0] ? (() => { try { return parseEvent(t.nextEvent[0], L); } catch { return null; } })() : null;
    return { id: String(t.id), abbr: t.abbreviation, name: t.displayName, short: t.shortDisplayName || t.name, loc: t.location, color: hx(t.color), alt: hx(t.alternateColor),
      logo: t.logos && t.logos[0] && t.logos[0].href, rec: rec && rec.summary || '', standing: t.standingSummary || '', next };
  }


  /* every team in the league, keyed by id: colour and logo for discs and rails */
  const teamIdx = {};
  async function teamsIndex(L) {
    if (teamIdx[L.key]) return teamIdx[L.key];
    const d = await jSoft(`${API(L)}/teams?limit=500`, 3600000);
    const list = d && d.sports && d.sports[0] && d.sports[0].leagues && d.sports[0].leagues[0] && d.sports[0].leagues[0].teams || [];
    const idx = {}; list.forEach(x => { const t = x.team || x; idx[String(t.id)] = { id: String(t.id), abbr: t.abbreviation, name: t.displayName, short: t.shortDisplayName || t.name, color: hx(t.color), alt: hx(t.alternateColor), logo: t.logos && t.logos[0] && t.logos[0].href }; });
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
      Promise.all(mine.map(id => teamInfo(L, id)))
    ]);
    S.today[lk] = games;
    const parts = [];
    const byTeam = new Map(); games.forEach(g => { byTeam.set(g.home.id, g); byTeam.set(g.away.id, g); });

    // your teams playing right now: the hero
    const live = games.filter(g => isLive(g) && isFav(g)).sort((a, b) => rankGame(b) - rankGame(a));
    if (live.length) parts.push(sec('Live now') + `<div class="heroes">${live.map(g => heroCard(L, g, ctx)).join('')}</div>`);

    // my teams: record, what's next or how it's going, win chance
    const rows = teams.filter(Boolean).map(t => {
      const g = byTeam.get(t.id) || t.next; const f = g ? safeF(L, g, ctx) : null;
      const us = g ? (g.home.id === t.id ? g.home : g.away) : null, them = g ? (g.home.id === t.id ? g.away : g.home) : null;
      let line = 'No game scheduled', right = '';
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
    parts.push(sec('My teams', '', `<a href="#teams">Edit</a>`) + (rows.length ? `<div class="rows">${rows.join('')}</div>` : empty('No teams yet', '', `<a class="btn" href="#teams">Choose teams</a>`)));

    // next games for my teams that aren't live: the ticket with the forecast
    const upcoming = teams.filter(Boolean).map(t => byTeam.get(t.id) || t.next).filter(g => g && g.state !== 'in');
    const seen = new Set(); const up = upcoming.filter(g => { if (seen.has(g.id)) return false; seen.add(g.id); return true; }).sort((a, b) => (a.state === 'post') - (b.state === 'post') || new Date(a.date) - new Date(b.date));
    if (up.length) parts.push(sec('Your games', '', `<a href="#scores">All scores</a>`) + `<div class="games">${up.slice(0, 4).map(g => gameCard(L, g, ctx, true)).join('')}</div>`);

    // my players
    const ppgOf = id => { const r = lp && lp.rows.find(x => x.id === String(id)); return r ? `${r.pts.toFixed(1)} ppg` : ''; };
    parts.push(sec('My players', '', `<a href="#players">${fp.length ? 'Edit' : 'Find players'}</a>`) + (fp.length
      ? `<div class="rail">${fp.map(p => `<a class="pl" href="${href.player(lk, p.id)}" style="--tc:${esc(p.color || '#2A2D33')}">${headshot(p.img, p.color)}<b>${esc(p.short || p.name)}</b><span>${esc(ppgOf(p.id) || p.team || '')}</span></a>`).join('')}</div>`
      : empty('Follow the players you watch', '<p style="margin:6px 0 0">They show up here with their scoring line, and their profile is one tap away.</p>', `<a class="btn" href="#players">Find players</a>`)));

    // injuries on my teams
    if (inj && mine.length) {
      const list = [];
      mine.forEach(id => { const t = teams.find(x => x && x.id === id); const b = inj.byTeam[id]; if (!b) return; b.list.forEach(x => list.push({ t, x })); });
      if (list.length) parts.push(sec('Injuries', 'your teams') + `<div class="rows">${list.slice(0, 8).map(({ t, x }) => { const a = x.athlete || {}; const st = x.status || ''; const cls = /out/i.test(st) ? 'out' : /day|quest|doubt/i.test(st) ? 'q' : /prob|avail/i.test(st) ? 'ok' : ''; const det = x.details || {}; const why = [det.type, det.returnDate ? 'back around ' + dateShort(det.returnDate) : (x.shortComment || '').replace(/\s+/g, ' ')].filter(Boolean).join(', '); return `<a class="row" href="${href.player(lk, a.id)}">${t ? logo(t.logo, 'm') : ''}<span class="t"><b>${esc(a.displayName || '')}</b><span>${esc(why)}</span></span><span class="tag ${cls}">${esc(st)}</span></a>`; }).join('')}</div>`);
    }

    // news that mentions my teams or players
    const names = [...teams.filter(Boolean).flatMap(t => [t.short, t.loc].filter(Boolean)), ...fp.map(p => p.name.split(' ').slice(-1)[0])].filter(n => n && n.length > 2);
    const hit = a => { const txt = `${a.headline || ''} ${a.description || ''}`; return names.some(n => txt.includes(n)); };
    const arts = news && news.articles ? news.articles.filter(a => a.headline && hit(a)).slice(0, 6) : [];
    if (arts.length) parts.push(sec('News', 'your teams and players') + `<div class="rows">${arts.map(a => HW.v5.newsRow(lk, a)).join('')}</div>`);

    $main.innerHTML = parts.join('');
  }

  /* ================= SCORES: every game, compact ================= */
  async function scores(lk) {
    const L = LEAGUES[lk]; const today = todayCT();
    let ymd = store.get('v5:date', today); if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd) || Math.abs(new Date(ymd) - new Date(today)) > 8 * 864e5) ymd = today;
    const days = Array.from({ length: 9 }, (_, i) => addDays(today, i - 4));
    const strip = `<div class="dates" id="dates">${days.map(d => { const lab = d === today ? 'Today' : dayLabel(d, { weekday: 'short' }); return `<button class="day${d === ymd ? ' on' : ''}" data-act="date" data-ymd="${d}" aria-pressed="${d === ymd}"><em>${esc(lab)}</em><b>${+d.slice(8)}</b></button>`; }).join('')}</div>`;
    const head = strip;
    $main.innerHTML = head + skeleton(4, 'card');
    const [games, ctx] = await Promise.all([ymd === today && S.today[lk] && S.today[lk].length ? S.today[lk] : scoreboard(L, ymd).catch(() => null), forecastCtx(L, ymd).catch(() => null)]);
    if (ymd === today && games) S.today[lk] = games;
    const el = $main.querySelector('#dates .on'); if (el) el.scrollIntoView({ inline: 'center', block: 'nearest' });
    if (!games) { $main.innerHTML = head + empty("Couldn't load the scoreboard", '<p style="margin:6px 0 0">The feed didn\'t answer. It usually comes back within a minute.</p>'); return; }
    if (!games.length) { $main.innerHTML = head + empty(`No ${L.label} games ${ymd === today ? 'today' : 'on ' + dayLabel(ymd, { weekday: 'long', month: 'short', day: 'numeric' })}`, L.offseason ? `<p style="margin:6px 0 0">${esc(L.offseason)}</p>` : ''); return; }
    const by = st => games.filter(g => g.state === st).sort((a, b) => rankGame(b) - rankGame(a) || new Date(a.date) - new Date(b.date));
    const live = by('in'), pre = by('pre'), post = by('post');
    const block = (title, list) => list.length ? sec(title, `${list.length}`) + `<div class="games">${list.map(g => gameCard(L, g, ctx, false, true)).join('')}</div>` : '';
    $main.innerHTML = head + block('Live', live) + block(ymd === today ? 'Upcoming' : 'Scheduled', pre) + block('Final', post);
    const el2 = $main.querySelector('#dates .on'); if (el2) el2.scrollIntoView({ inline: 'center', block: 'nearest' });
  }

  /* ================= PLAYER ================= */
  async function player(lk, id) {
    const L = LEAGUES[lk]; if (!L || !id) { $main.innerHTML = empty('Player not found'); return; }
    $main.innerHTML = `<div class="topbar"><a class="ib" href="#home" data-act="back" aria-label="Back"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m14 6-6 6 6 6"/></svg></a></div>` + skeleton(1, 'card') + skeleton(6, 'row');
    const [bio, ov, gl, career] = await Promise.all([jSoft(`${WEB(L)}/athletes/${id}`, 3600000), jSoft(`${WEB(L)}/athletes/${id}/overview`, 600000), jSoft(`${WEB(L)}/athletes/${id}/gamelog`, 600000), jSoft(`${WEB(L)}/athletes/${id}/stats`, 3600000)]);
    const a = bio && (bio.athlete || bio);
    if (!a || !a.displayName) { $main.innerHTML = empty("Couldn't load this player", '<p style="margin:6px 0 0">The feed didn\'t answer. Pull down to try again.</p>'); return; }
    const tm = a.team || {}; const color = hx(tm.color) || '#2A2D33'; const alt = hx(tm.alternateColor);
    const teamLogo = tm.logos && tm.logos[0] && tm.logos[0].href;
    const college = /^ncaa/.test(lk);
    const st = ov && ov.statistics; const labels = st && st.labels || [];
    const split = st && st.splits && (st.splits.find(s => /regular/i.test(s.displayName)) || st.splits[0]);
    const val = l => { const i = labels.indexOf(l); return split && i >= 0 ? split.stats[i] : ''; };
    const following = fplayers.has(lk, id);
    const injury = a.injuries && a.injuries[0];
    const subLine = `${tm.id ? `<a href="${href.team(lk, tm.id)}">${esc(tm.shortDisplayName || tm.name || tm.displayName)}</a> ` : ''}${esc((a.position && a.position.displayName || '').toLowerCase())}${a.jersey ? `, No. ${esc(a.jersey)}` : ''}`;
    const facts = [a.displayHeight, a.displayWeight, college ? (a.experience && a.experience.displayValue) : (a.age ? `Age ${a.age}` : ''), a.college && a.college.name, college && a.birthPlace ? [a.birthPlace.city, a.birthPlace.state].filter(Boolean).join(', ') : ''].filter(Boolean);
    const snap = { lk, id: String(id), name: a.displayName, short: a.shortName || a.displayName, img: a.headshot && a.headshot.href, team: tm.abbreviation || '', color };
    const hero = `<div class="ehero" style="--a:${esc(color)}">
      <div class="wm">${esc(a.jersey || '')}</div>
      <div class="in"><div class="sub">${subLine}</div><h1>${esc(a.firstName || '')}<br>${esc(a.lastName || a.displayName)}</h1>
        <div class="facts">${facts.map(f => `<span>${esc(f)}</span>`).join('')}</div>
        ${injury ? `<div class="inj"><span class="tag ${/out/i.test(injury.status) ? 'out' : 'q'}">${esc(injury.status)}</span>${esc(injury.details && injury.details.type || '')}${injury.details && injury.details.returnDate ? `, back around ${esc(dateShort(injury.details.returnDate))}` : ''}</div>` : ''}
        <div class="acts"><button class="${following ? 'on' : ''}" data-act="follow-player" data-snap='${esc(JSON.stringify(snap))}' aria-pressed="${following}">${following ? starSvg : starLine}${following ? 'Following' : 'Follow'}</button>${tm.id ? `<a href="${href.team(lk, tm.id)}">${esc(tm.shortDisplayName || tm.name || 'Team')}</a>` : ''}</div>
      </div>
      <div class="shot">${a.headshot && a.headshot.href ? `<img src="${esc(a.headshot.href)}" alt="" ${hide}>` : ''}</div>
    </div>`;
    const stats = L.sport === 'basketball' ? [['PTS', 'PPG'], ['REB', 'RPG'], ['AST', 'APG'], ['FG%', 'FG%'], ['3P%', '3P%'], ['MIN', 'MIN']] : labels.slice(0, 6).map(l => [l, l]);
    const strip = split ? `<div class="stats">${stats.map(([k, l]) => `<div><b>${esc(val(k) || '—')}</b><span>${esc(l)}</span></div>`).join('')}</div>` : '';

    // scoring mix from the game log: twos, threes, free throws per game
    let evRows = [];
    if (gl && gl.events && gl.seasonTypes) { gl.seasonTypes.forEach(stp => (stp.categories || []).forEach(c => (c.events || []).forEach(e => { const meta = gl.events[e.eventId]; if (meta) evRows.push({ meta, stats: e.stats || [], id: e.eventId }); }))); evRows.sort((x, y) => new Date(y.meta.gameDate) - new Date(x.meta.gameDate)); }
    const gLabels = gl && gl.labels || [];
    const gi = l => gLabels.indexOf(l);
    const made = (r, l) => { const i = gi(l); const v = i >= 0 ? String(r.stats[i] || '') : ''; const m = v.match(/^(\d+)-(\d+)$/); return m ? [+m[1], +m[2]] : [0, 0]; };
    let mix = '';
    if (evRows.length && gi('FG') >= 0 && gi('3PT') >= 0 && gi('FT') >= 0) {
      const n = evRows.length; let fg = 0, tp = 0, ft = 0, fga = 0, tpa = 0, fta = 0;
      evRows.forEach(r => { const [a1, b1] = made(r, 'FG'); const [a2, b2] = made(r, '3PT'); const [a3, b3] = made(r, 'FT'); fg += a1; fga += b1; tp += a2; tpa += b2; ft += a3; fta += b3; });
      const twos = (fg - tp) * 2 / n, threes = tp * 3 / n, fts = ft / n, total = twos + threes + fts;
      const segs = [['Twos', twos, color], ['Threes', threes, HW.darkOf(color, color) === color ? '#8FB3E8' : (alt || '#8FB3E8')], ['Free throws', fts, 'rgba(255,255,255,.35)']];
      const C = 2 * Math.PI * 46; let off = 0;
      const arcs = segs.map(([, v, c]) => { const len = total ? v / total * C : 0; const s = `<circle cx="60" cy="60" r="46" stroke="${c}" stroke-dasharray="${len.toFixed(1)} ${(C - len).toFixed(1)}" stroke-dashoffset="${(-off).toFixed(1)}"/>`; off += len; return s; }).join('');
      const pctOf = (m, a) => a ? (m / a * 100).toFixed(1) : '0.0';
      mix = sec('Where the points come from', `${n} game${n === 1 ? '' : 's'}`) +
        `<div class="chips" role="tablist"><button class="chip on" data-act="mix" data-mix="scoring" aria-pressed="true">Scoring</button><button class="chip" data-act="mix" data-mix="shooting" aria-pressed="false">Shooting</button></div>
        <div class="donut" data-mix-panel="scoring"><svg width="138" height="138" viewBox="0 0 120 120" role="img" aria-label="${total.toFixed(1)} points a game"><circle cx="60" cy="60" r="46" fill="none" stroke="var(--surf-3)" stroke-width="16"/><g fill="none" stroke-width="16" transform="rotate(-90 60 60)">${arcs}</g><text x="60" y="58" text-anchor="middle" fill="var(--ink)" style="font:800 34px var(--num)">${total.toFixed(1)}</text><text x="60" y="74" text-anchor="middle" fill="var(--ink-3)" style="font:700 10.5px var(--ui)">points a game</text></svg>
          <div class="key">${segs.map(([l, v, c]) => `<div><i style="background:${c}"></i><span>${l}</span><b>${v.toFixed(1)}</b></div>`).join('')}</div></div>
        <div class="bars" data-mix-panel="shooting" hidden style="--tc:${esc(color)}"><div><span>Field goals</span><em><i style="width:${pctOf(fg, fga)}%"></i></em><b>${pctOf(fg, fga)}</b></div><div><span>Threes</span><em><i style="width:${pctOf(tp, tpa)}%"></i></em><b>${pctOf(tp, tpa)}</b></div><div><span>Free throws</span><em><i style="width:${pctOf(ft, fta)}%"></i></em><b>${pctOf(ft, fta)}</b></div><div><span>Per game</span><em style="background:none"></em><b style="font:600 13px var(--ui);color:var(--ink-2)">${(fga / n).toFixed(1)} FGA, ${(tpa / n).toFixed(1)} 3PA, ${(fta / n).toFixed(1)} FTA</b></div></div>`;
    }

    // next game for the team
    let next = '';
    if (tm.id) { const t = await teamInfo(L, tm.id); if (t && t.next) { const ctx = await forecastCtx(L, todayCT()).catch(() => null); next = sec('Next up') + `<div class="games">${gameCard(L, t.next, ctx)}</div>`; } }

    // game log
    let log = '';
    if (evRows.length) {
      const cols = ['MIN', 'PTS', 'REB', 'AST'].filter(l => gi(l) >= 0);
      log = sec('Game log', '', `<a href="#" data-act="log-more" hidden>All</a>`) + `<div class="tw"><table class="tbl"><thead><tr><th>Game</th>${cols.map(c => `<th>${c === 'MIN' ? 'Min' : c[0] + c.slice(1).toLowerCase()}</th>`).join('')}<th>Result</th></tr></thead><tbody>${evRows.slice(0, 10).map(r => { const m = r.meta; const op = m.opponent || {}; return `<tr class="click" data-href="${href.game(lk, r.id)}"><td><span class="opp"><em>${esc(dateShort(m.gameDate))}</em>${logo(op.logo, 's')}${esc(m.atVs || '')} ${esc(op.abbreviation || '')}</span></td>${cols.map(c => `<td>${c === 'PTS' ? `<b>${esc(r.stats[gi(c)])}</b>` : esc(r.stats[gi(c)])}</td>`).join('')}<td><span class="res ${m.gameResult === 'W' ? 'w' : 'l'}">${esc(m.gameResult || '')}</span> <span class="mut">${esc(m.score || '')}</span></td></tr>`; }).join('')}</tbody></table></div>`;
    }

    // latest stories and clips
    const items = ov && ov.news ? ov.news.filter(n => n.headline).slice(0, 8) : [];
    const latest = items.length ? sec('Latest') + `<div class="rows">${items.map(n => HW.v5.newsRow(lk, n)).join('')}</div>` : '';

    // career, by season
    let careerT = '';
    const cat = career && career.categories && (career.categories.find(c => /average/i.test(c.name)) || career.categories[0]);
    if (cat && cat.statistics && cat.statistics.length) {
      const cl = cat.labels || cat.names || []; const ci = l => cl.indexOf(l);
      const want = [['GP', 'GP'], ['PTS', 'PPG'], ['REB', 'RPG'], ['AST', 'APG'], ['FG%', 'FG%']].filter(([k]) => ci(k) >= 0);
      const rows = cat.statistics.slice().reverse();
      careerT = sec('Career', 'per game') + `<div class="tw"><table class="tbl"><thead><tr><th>Season</th>${want.map(([, l]) => `<th>${l}</th>`).join('')}</tr></thead><tbody>${rows.map((r, i) => `<tr${i === 0 ? ' class="hi"' : ''}><td>${esc(r.season && (r.season.displayName || r.season.year) || '')} <span class="mut" style="color:var(--ink-3)">${esc((r.teamSlug || '').toUpperCase().slice(0, 3))}</span></td>${want.map(([k]) => `<td>${k === 'PTS' ? `<b>${esc(r.stats[ci(k)])}</b>` : esc(r.stats[ci(k)])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    }

    // about
    const born = [a.dateOfBirth ? new Date(a.dateOfBirth).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '', a.birthPlace ? [a.birthPlace.city, a.birthPlace.state || a.birthPlace.country].filter(Boolean).join(', ') : ''].filter(Boolean).join(', ');
    const about = [['Born', born], ['Drafted', a.displayDraft || (a.draft && a.draft.displayText) || ''], ['Experience', a.experience && a.experience.displayValue || (a.experience && a.experience.years != null ? `${a.experience.years} seasons` : '')], ['College', a.college && a.college.name || ''], ['Status', a.status && a.status.name || '']].filter(([, v]) => v);
    const aboutT = about.length ? sec('About') + `<table class="tbl kv"><tbody>${about.map(([k, v]) => `<tr><td>${k}</td><td>${esc(v)}</td></tr>`).join('')}</tbody></table>` : '';

    $main.innerHTML = `<div class="topbar"><a class="ib" href="#home" data-act="back" aria-label="Back"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m14 6-6 6 6 6"/></svg></a>${tm.id ? `<a class="ttl" href="${href.team(lk, tm.id)}">${esc(tm.displayName || '')}</a>` : ''}<div class="sp"><button class="ib" data-act="share" data-title="${esc(a.displayName)}" aria-label="Share"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg></button></div></div>` + hero + strip + mix + next + log + latest + careerT + aboutT;
    document.title = `${a.displayName} · RIVL`;
  }


  /* ================= PLAYERS ================= */
  async function players(lk) {
    const L = LEAGUES[lk];
    const q0 = store.get('v5:pq', ''), tab0 = store.get('v5:ptab', 'all');
    $main.innerHTML = `<div class="page-h"><h1>Players</h1></div>` + skeleton(8, 'row');
    const [lp, idx] = await Promise.all([leaguePlayers(L).catch(() => null), teamsIndex(L)]);
    if (!lp || !lp.rows.length) { $main.innerHTML = `<div class="page-h"><h1>Players</h1></div>` + empty(`No ${L.label} player stats yet`, '<p style="margin:6px 0 0">Stats start once the season has games.</p>'); return; }
    const rows = lp.rows.slice().sort((a, b) => b.pts - a.pts);
    const paint = () => {
      const q = (store.get('v5:pq', '') || '').trim().toLowerCase(), tab = store.get('v5:ptab', 'all');
      const fset = new Set(fplayers.all().filter(p => p.lk === lk).map(p => p.id));
      let list = rows;
      if (tab === 'following') list = list.filter(p => fset.has(p.id));
      if (q) list = list.filter(p => (p.name || '').toLowerCase().includes(q) || (p.team || '').toLowerCase().includes(q));
      const body = list.length ? `<div class="rows">${list.slice(0, 150).map((p, i) => { const t = idx[p.teamId] || {}; const on = fset.has(p.id); const snap = { lk, id: p.id, name: p.name, short: p.short || p.name, img: p.img, team: p.team, color: t.color || '#2A2D33' }; return `<div class="row prow"><a class="go" href="${href.player(lk, p.id)}" aria-label="${esc(p.name)}">${headshot(p.img, t.color, 46)}</a><a class="t" href="${href.player(lk, p.id)}" style="text-decoration:none"><b>${esc(p.name)}</b><span>${esc([t.short || p.team, p.pos ? { G: 'guard', F: 'forward', C: 'center', 'G-F': 'guard/forward', 'F-G': 'forward/guard', 'F-C': 'forward/center', 'C-F': 'center/forward' }[p.pos] || p.pos : ''].filter(Boolean).join(' '))}</span></a><span class="r num"><b>${p.pts.toFixed(1)}</b><span>${p.reb.toFixed(1)} reb, ${p.ast.toFixed(1)} ast</span></span><button class="star${on ? ' on' : ''}" data-act="follow-player" data-snap='${esc(JSON.stringify(snap))}' aria-pressed="${on}" aria-label="${on ? 'Unfollow' : 'Follow'} ${esc(p.name)}">${on ? starSvg : starLine}</button></div>`; }).join('')}</div>${list.length > 150 ? `<p class="foot">Showing the top 150. Search to find anyone else.</p>` : ''}`
        : empty(tab === 'following' ? 'No followed players yet' : 'No one matches', tab === 'following' ? '<p style="margin:6px 0 0">Tap the star on any player to follow them.</p>' : '<p style="margin:6px 0 0">Try a last name or a team.</p>');
      const el = $main.querySelector('#plist'); if (el) el.innerHTML = body;
    };
    $main.innerHTML = `<div class="page-h"><h1>Players<small style="font-weight:500;font-size:14px;color:var(--ink-3);margin-left:8px">${esc(lp.label)}</small></h1></div>
      <div class="search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.8-3.8"/></svg><input id="pq" type="search" placeholder="Search players or teams" value="${esc(q0)}" autocomplete="off" aria-label="Search players"></div>
      <div class="chips" role="tablist"><button class="chip${tab0 === 'all' ? ' on' : ''}" data-act="ptab" data-tab="all" aria-pressed="${tab0 === 'all'}">Points</button><button class="chip${tab0 === 'following' ? ' on' : ''}" data-act="ptab" data-tab="following" aria-pressed="${tab0 === 'following'}">Following</button></div>
      <div id="plist"></div>`;
    paint();
    const inp = $main.querySelector('#pq'); let t = null;
    inp.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { store.set('v5:pq', inp.value); paint(); }, 120); });
    $main.addEventListener('click', e => { const b = e.target.closest('[data-act="ptab"]'); if (!b) return; store.set('v5:ptab', b.dataset.tab); $main.querySelectorAll('[data-act="ptab"]').forEach(x => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); }); paint(); });
    $main.addEventListener('rivl:follow', paint);
  }

  HW.v5 = Object.assign(HW.v5 || {}, { home, scores, player, players, fplayers, teamInfo, teamsIndex, gameCard, heroCard,
    _: { h: H, logo, headshot, chev, sec, empty, skeleton, href, safeF, gameCard, heroCard, teamInfo, teamsIndex, fplayers, starSvg, starLine, tvLabel, teamColor } });
})();
