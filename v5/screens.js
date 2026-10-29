/* RIVL v5 — the rest of the screens: standings, teams, team, game, article reader, search.
   Loaded after views.js; shares its helpers through HW.v5. */
(() => {
  'use strict';
  const { LEAGUES, ORDER, esc, j, jSoft, todayCT, addDays, dayLabel, relDay, tip, dateShort, ago, pct, ordinal, sign, hx, store, API, WEB,
    favs, parseEvent, isLive, isFav, interest, scoreboard, standings, rankings, injuries, forecast, forecastCtx, leaguePlayers, watchFor, S, ymdOf } = HW;
  const V = HW.v5;
  const { h: H, logo, headshot, chev, sec, empty, skeleton, href, safeF, gameCard, heroCard, teamInfo, teamsIndex, fplayers, prefs, starSvg, starLine, tvLabel, confName, dayUTC, athId, hsUrl, retInfo } = V._;
  /* a story's tags: ESPN marks each article with the teams and athletes it is about */
  const cats = a => a && a.categories || [];
  const taggedTeam = (a, id) => cats(a).some(c => c.type === 'team' && String(c.teamId || (c.team && c.team.id) || '') === String(id));
  const $main = document.getElementById('main');
  S.news = S.news || {}; S.videos = S.videos || {};
  const hide = `onerror="this.style.visibility='hidden'"`;
  const topbar = (title, backHref = '#home', extra = '') => `<div class="topbar"><a class="ib" href="${backHref}" data-act="back" aria-label="Back"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m14 6-6 6 6 6"/></svg></a><span class="ttl">${title}</span><div class="sp">${extra}<button class="ib" data-act="share" data-title="${esc(title.replace(/<[^>]+>/g, ''))}" aria-label="Share"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg></button></div></div>`;
  const chips = (items, on, act, key) => `<div class="chips" role="tablist">${items.map(([k, l]) => `<button class="chip${k === on ? ' on' : ''}" data-act="${act}" data-${key}="${esc(k)}" aria-pressed="${k === on}">${esc(l)}</button>`).join('')}</div>`;
  const standingLine = (r, L) => !r ? '' : L.standingsMode === 'conferences' ? `${r.w}-${r.l}${r.conf ? `, ${r.conf} in the ${confName(r.group, r.groupAbbr)}` : ''}` : `${r.w}-${r.l}, ${ordinal(r.pos)} in the ${confName(r.group, r.groupAbbr)}`;

  /* news items, shared by every list: cache the object so the reader can open it without a second list fetch */
  function newsRow(lk, a, { thumb = true } = {}) {
    const id = String(a.id || (a.links && a.links.api && a.links.api.news && a.links.api.news.href || '').split('/').pop() || '');
    if (id) S.news[id] = a;
    const vids = (a.video || a.videos || []).filter(v => v && v.links); vids.forEach(v => { if (v.id != null) S.videos[String(v.id)] = v; });
    const im = a.images && a.images[0] && a.images[0].url;
    const isVideo = vids.length && (/media|video/i.test(a.type || '') || !a.description);
    const meta = [a.byline, a.published ? ago(a.published) : ''].filter(Boolean).join(', ');
    if (isVideo) return `<button class="row" data-act="play" data-vid="${esc(String(vids[0].id))}">${thumb ? `<span class="thumb vid">${im ? `<img src="${esc(im)}" alt="" loading="lazy">` : ''}<i></i></span>` : ''}<span class="t"><b class="wrap">${esc(a.headline)}</b><span>${esc(meta || 'Video')}</span></span></button>`;
    return `<a class="row" href="${id ? `#article/${lk}/${id}` : esc(a.links && a.links.web && a.links.web.href || '#')}">${thumb && im ? `<img class="thumb" src="${esc(im)}" alt="" loading="lazy">` : ''}<span class="t"><b class="wrap">${esc(a.headline)}</b><span>${esc(meta)}</span></span></a>`;
  }
  V.newsRow = newsRow;

  /* ================= STANDINGS ================= */
  async function standingsV(lk) {
    const L = LEAGUES[lk];
    $main.innerHTML = skeleton(10, 'row');
    const [st, R] = await Promise.all([standings(L).catch(() => null), rankings(L)]);
    if (!st || !st.groups.length) { $main.innerHTML = empty('Standings unavailable', '<p style="margin:6px 0 0">The feed didn\'t answer. It usually comes back within a minute.</p>'); return; }
    const conf = L.standingsMode === 'conferences';
    const groups = st.groups;
    let tab = store.get('v5:stab:' + lk, groups[0].abbr || groups[0].name);
    const items = conf ? groups.map(g => [g.abbr || g.name, confName(g.name, g.abbr)]) : [...groups.map(g => [g.abbr || g.name, confName(g.name, g.abbr)]), ['league', 'League']];
    if (!items.some(([k]) => k === tab)) tab = items[0][0];
    let rows, title;
    if (tab === 'league') { rows = groups.flatMap(g => g.rows).sort((a, b) => (b.w - b.l) - (a.w - a.l) || (b.pct || 0) - (a.pct || 0) || (b.diff || 0) - (a.diff || 0)).map((r, i) => ({ ...r, pos: i + 1 })); title = L.label; }
    else { const g = groups.find(x => (x.abbr || x.name) === tab); rows = g.rows; title = g.name; }
    const cuts = tab === 'league' ? [] : (L.playoffLine || []);
    const rk = R ? Object.fromEntries(R.ranks.map(r => [r.team.id, r.rank])) : null;
    const cols = conf ? ['Conf', 'W', 'L', 'Strk'] : ['W', 'L', 'Pct', 'GB', 'Strk'];
    const cell = (r, c) => c === 'W' ? r.w : c === 'L' ? r.l : c === 'Pct' ? esc(r.pct || '') : c === 'GB' ? esc(r.gb === '0' || !r.gb ? '–' : r.gb) : c === 'Conf' ? esc(r.conf || '') : `<span class="res ${/^W/.test(r.strk || '') ? 'w' : 'l'}">${esc(r.strk || '')}</span>`;
    const trs = rows.map((r, i) => `<tr class="click${favs.has(lk, r.id) ? ' me' : ''}${cuts.includes(i + 1) ? ' cut' : ''}" data-href="${href.team(lk, r.id)}"><td><span class="tm"><span class="rk">${r.pos}</span>${logo(r.logo, 's')}<a href="${href.team(lk, r.id)}">${rk && rk[r.id] ? `<i class="ap">${rk[r.id]}</i>` : ''}${esc(r.short || r.name)}</a></span></td>${cols.map(c => `<td>${cell(r, c)}</td>`).join('')}</tr>`).join('');
    const legend = tab === 'league' ? '' : cuts.length === 2 ? `<p class="legend">Top ${cuts[0]} go straight to the playoffs; ${cuts[0] + 1} through ${cuts[1]} play in. Your teams are marked.</p>` : cuts.length === 1 ? `<p class="legend">Top ${cuts[0]} make the playoffs. Your teams are marked.</p>` : '<p class="legend">Your teams are marked.</p>';
    $main.innerHTML = chips(items, tab, 'stab', 'tab') + `<div class="tw"><table class="tbl stand"><thead><tr><th>${esc(title)}</th>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${trs}</tbody></table></div>` + legend;
    const on = $main.querySelector('.chip.on'); if (on) on.scrollIntoView({ inline: 'center', block: 'nearest' });
  }

  /* ================= TEAMS ================= */
  async function teamsV(lk) {
    const L = LEAGUES[lk];
    $main.innerHTML = skeleton(10, 'row');
    const [st, idx] = await Promise.all([standings(L).catch(() => null), teamsIndex(L)]);
    const q0 = store.get('v5:tq', '') || '', tab0 = store.get('v5:ttab', 'all');
    const groups = st && st.groups.length ? st.groups.map(g => ({ name: confName(g.name, g.abbr), full: g.name, rows: g.rows.map(r => ({ ...r, logo: r.logo || (idx[r.id] || {}).logo })) })) : [{ name: L.label, full: L.label, rows: Object.values(idx).map(t => ({ id: t.id, short: t.short, name: t.name, logo: t.logo })) }];
    const paint = () => {
      const q = (store.get('v5:tq', '') || '').trim().toLowerCase(), tab = store.get('v5:ttab', 'all');
      const blocks = groups.map(g => {
        let rows = g.rows.slice().sort((a, b) => (a.name || a.short).localeCompare(b.name || b.short));
        if (tab === 'following') rows = rows.filter(r => favs.has(lk, r.id));
        if (q) rows = rows.filter(r => `${r.name} ${r.short} ${r.abbr || ''}`.toLowerCase().includes(q));
        if (!rows.length) return '';
        return sec(g.name, '') + `<div class="rows">${rows.map(r => { const on = favs.has(lk, r.id); return `<div class="row prow"><a class="go" href="${href.team(lk, r.id)}" aria-label="${esc(r.name)}">${logo(r.logo)}</a><a class="t" href="${href.team(lk, r.id)}"><b>${esc(r.name || r.short)}</b><span>${esc(standingLine(r, L) || '')}</span></a><button class="star${on ? ' on' : ''}" data-act="fav" data-lk="${lk}" data-id="${esc(r.id)}" aria-pressed="${on}" aria-label="${on ? 'Unfollow' : 'Follow'} ${esc(r.name)}">${on ? starSvg : starLine}</button></div>`; }).join('')}</div>`;
      }).filter(Boolean).join('');
      const el = $main.querySelector('#tlist'); if (el) el.innerHTML = blocks || empty(tab === 'following' ? 'No followed teams yet' : 'No team matches', tab === 'following' ? '<p style="margin:6px 0 0">Tap the star on any team to follow it.</p>' : '');
    };
    $main.innerHTML = `<div class="search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.8-3.8"/></svg><input id="tq" type="search" placeholder="Search teams" value="${esc(q0)}" autocomplete="off" aria-label="Search teams"></div>` + chips([['all', 'All'], ['following', 'Following']], tab0, 'ttab', 'tab') + `<div id="tlist"></div>`;
    paint();
    const inp = $main.querySelector('#tq'); let t = null;
    inp.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { store.set('v5:tq', inp.value); paint(); }, 120); });
    $main.addEventListener('click', e => { const b = e.target.closest('[data-act="ttab"]'); if (!b) return; store.set('v5:ttab', b.dataset.tab); $main.querySelectorAll('[data-act="ttab"]').forEach(x => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); }); paint(); });
    $main.addEventListener('rivl:fav', paint);
  }

  /* ================= TEAM ================= */
  async function teamV(lk, id) {
    const L = LEAGUES[lk]; if (!L || !id) { $main.innerHTML = empty('Team not found'); return; }
    $main.innerHTML = topbar('') + skeleton(1, 'card') + skeleton(6, 'row');
    const [roster, sched, st, inj, lp, news, R] = await Promise.all([jSoft(`${API(L)}/teams/${id}/roster`, 900000), jSoft(`${API(L)}/teams/${id}/schedule`, 300000), standings(L).catch(() => null), injuries(L), L.sport === 'basketball' ? leaguePlayers(L).catch(() => null) : null, jSoft(`${API(L)}/news?limit=10&team=${id}`, 600000), rankings(L)]);
    const t0 = (roster && roster.team) || (sched && sched.team);
    if (!t0) { $main.innerHTML = topbar('Team') + empty("Couldn't load this team", '<p style="margin:6px 0 0">The feed didn\'t answer. Pull down to try again.</p>'); return; }
    const color = hx(t0.color) || '#2A2D33';
    const lg = t0.logo || (t0.logos && t0.logos[0] && t0.logos[0].href) || HW.logoUrl(L, t0.abbreviation);
    const r = st && st.byId[String(id)];
    const rank = R && (R.ranks.find(x => x.team.id === String(id)) || {}).rank;
    const on = favs.has(lk, id);
    const evs = (sched && sched.events || []).map(e => { try { return parseEvent(e, L); } catch { return null; } }).filter(Boolean);
    const next = evs.find(g => g.state !== 'post');
    const ctx = next ? await forecastCtx(L, ymdOf(next.date)).catch(() => null) : null;
    const facts = [r ? `${r.w}-${r.l}` : (t0.recordSummary || ''), rank ? `Ranked No. ${rank}` : '', r && L.standingsMode !== 'conferences' ? `${ordinal(r.pos)} in the ${confName(r.group, r.groupAbbr)}` : (t0.standingSummary || ''), r && r.strk ? (/^W/.test(r.strk) ? `Won ${r.strk.slice(1)} straight` : `Lost ${r.strk.slice(1)} straight`) : ''].filter(Boolean);
    const hero = `<div class="ehero team" style="--a:${esc(color)}"><div class="wm">${esc(t0.abbreviation || '')}</div><img class="biglogo" src="${esc(lg)}" alt="" ${hide}>
      <div class="in"><div class="sub">${esc(r && r.group && L.standingsMode === 'conferences' ? r.group : (t0.standingSummary && /Division/.test(t0.standingSummary) ? '' : L.label))}</div><h1>${esc(t0.location || '')}<br>${esc(t0.name || t0.displayName)}</h1>
        <div class="facts">${facts.map(f => `<span>${esc(f)}</span>`).join('')}</div>
        <div class="acts"><button class="${on ? 'on' : ''}" data-act="fav" data-lk="${lk}" data-id="${esc(id)}" data-name="${esc(t0.shortDisplayName || t0.name)}" aria-pressed="${on}">${on ? starSvg : starLine}${on ? 'Following' : 'Follow'}</button></div>
      </div></div>`;
    const strip = r ? `<div class="stats four"><div><b>${r.ppg != null ? (+r.ppg).toFixed(1) : '—'}</b><span>PPG</span></div><div><b>${r.opp != null ? (+r.opp).toFixed(1) : '—'}</b><span>OPP</span></div><div><b>${r.diff != null ? sign(+r.diff) : '—'}</b><span>NET</span></div><div><b>${esc(L.standingsMode === 'conferences' ? (r.conf || '—') : (r.l10 || r.home || '—'))}</b><span>${L.standingsMode === 'conferences' ? 'CONF' : r.l10 ? 'LAST 10' : 'HOME'}</span></div></div>` : '';
    const nextHtml = next ? sec(next.state === 'in' ? 'Live now' : 'Next up') + `<div class="games">${gameCard(L, next, ctx)}</div>` : '';
    // roster, by scoring when we have it
    const ath = (roster && roster.athletes || []).flatMap(a => a.items ? a.items : [a]);
    const ppg = {}; if (lp) lp.rows.forEach(p => { if (p.teamId === String(id)) ppg[p.id] = p; });
    const sorted = ath.slice().sort((a, b) => ((ppg[b.id] || {}).pts || 0) - ((ppg[a.id] || {}).pts || 0) || (a.displayName || '').localeCompare(b.displayName || ''));
    const posWord = p => ({ G: 'Guard', F: 'Forward', C: 'Center', 'G-F': 'Guard/forward', 'F-G': 'Forward/guard', 'F-C': 'Forward/center', 'C-F': 'Center/forward', PG: 'Point guard', SG: 'Shooting guard', SF: 'Small forward', PF: 'Power forward' }[p] || p || '');
    const rRow = (a, extra) => { const p = ppg[a.id]; const injd = a.injuries && a.injuries[0]; return `<a class="row${extra ? ' more' : ''}" href="${href.player(lk, a.id)}"${extra ? ' hidden data-more="roster"' : ''}>${headshot(hsUrl(a), color, 46, a.displayName)}<span class="t"><b>${esc(a.displayName)}</b><span>${esc([posWord(a.position && a.position.abbreviation), a.jersey ? `No. ${a.jersey}` : ''].filter(Boolean).join(', '))}${injd ? ` <span class="tag ${/out/i.test(injd.status) ? 'out' : 'q'}" style="margin-left:6px">${esc(injd.status)}</span>` : ''}</span></span>${p ? `<span class="r"><b>${p.pts.toFixed(1)}</b><span>ppg</span></span>` : chev}</a>`; };
    const rosterHtml = sorted.length ? sec('Roster', `${sorted.length}`, sorted.length > 6 ? `<button data-act="expand" data-more="roster">Everyone</button>` : '') + `<div class="rows">${sorted.slice(0, 6).map(a => rRow(a, false)).join('')}${sorted.slice(6).map(a => rRow(a, true)).join('')}</div>` : '';
    // schedule: next five and last five, expandable to the season
    const sRow = (g, extra) => { const homeSide = g.home.id === String(id); const me = homeSide ? g.home : g.away, op = homeSide ? g.away : g.home; const d = new Date(g.date); const res = g.state === 'post' ? `<span class="res ${me.score > op.score ? 'w' : 'l'}" style="font-size:15px">${me.score > op.score ? 'W' : 'L'} ${me.score}-${op.score}</span>` : g.state === 'in' ? `<span class="live">${esc(g.detail)}</span>` : chev; return `<a class="row" href="${href.game(lk, g.id)}"${extra ? ' hidden data-more="sched"' : ''}><span class="d">${esc(d.toLocaleDateString('en-US', { month: 'short', timeZone: HW.TZ }))}<b>${esc(d.toLocaleDateString('en-US', { day: 'numeric', timeZone: HW.TZ }))}</b></span>${logo(op.logo, 'm')}<span class="t"><b>${g.neutral ? 'vs' : homeSide ? 'vs' : 'at'} ${esc(op.short)}</b><span>${g.state === 'post' ? 'Final' : g.state === 'in' ? 'Live' : esc([tip(g.date), tvLabel(g)].filter(Boolean).join(', '))}</span></span>${res}</a>`; };
    const done = evs.filter(g => g.state === 'post'), up = evs.filter(g => g.state !== 'post');
    const recent = done.slice(-3).reverse(), soon = up.slice(0, 4); const restUp = up.slice(4), restDone = done.slice(0, -3).reverse();
    const schedHtml = evs.length ? sec('Schedule', `${evs.length} games`, (restUp.length || restDone.length) ? `<button data-act="expand" data-more="sched">Full season</button>` : '') + `<div class="rows sched">${soon.map(g => sRow(g, false)).join('')}${restUp.map(g => sRow(g, true)).join('')}${recent.map(g => sRow(g, false)).join('')}${restDone.map(g => sRow(g, true)).join('')}</div>` : '';
    // injuries, news
    const il = inj && inj.byTeam[String(id)] && inj.byTeam[String(id)].list || [];
    S.injuries = S.injuries || {};
    const injHtml = il.length ? sec('Injuries') + `<div class="rows">${il.map((x, i) => { const a = x.athlete || {}; const aid = athId(a); const key = `t:${id}:${aid}:${x.id || i}`; S.injuries[key] = { x, id: aid, team: { id: String(id), short: t0.shortDisplayName || t0.name, color } }; const stt = x.status || ''; const cls = /out/i.test(stt) ? 'out' : /day|quest|doubt/i.test(stt) ? 'q' : 'ok'; const det = x.details || {}; const ret = retInfo(L, det.returnDate); const why = [det.type || det.detail, ret ? ret.short : ''].filter(Boolean).join(', '); return `<button class="row" data-act="injury" data-key="${esc(key)}">${headshot(hsUrl(a), color, 44, a.displayName)}<span class="t"><b>${esc(a.displayName || '')}</b><span>${esc(why || (x.shortComment || '').slice(0, 80))}</span></span><span class="tag ${cls}">${esc(stt)}</span></button>`; }).join('')}</div>` : '';
    // news about this team only: ESPN's team tag first, the team's own name as the fallback; college feeds are league-wide, so nothing shows unless it matches
    const college = /^ncaa/.test(lk);
    const tn = [t0.displayName, t0.location, t0.shortDisplayName, college ? '' : t0.name].filter(n => n && n.length > 3);
    const about = a => taggedTeam(a, id) || tn.some(n => `${a.headline || ''} ${a.description || ''}`.includes(n));
    const arts = news && news.articles ? news.articles.filter(a => a.headline && (about(a) || (!college && !cats(a).length))).slice(0, 6) : [];
    const newsHtml = arts.length ? sec('News') + `<div class="rows">${arts.map(a => newsRow(lk, a)).join('')}</div>` : '';
    $main.innerHTML = topbar(esc(r && r.group ? r.group : L.label), '#teams') + hero + strip + nextHtml + rosterHtml + schedHtml + injHtml + newsHtml;
    document.title = `${t0.displayName} · RIVL`;
  }

  /* ================= GAME ================= */
  const WANT = ['fieldGoalPct', 'threePointFieldGoalPct', 'freeThrowPct', 'totalRebounds', 'assists', 'turnovers', 'steals', 'blocks', 'pointsInPaint', 'fastBreakPoints', 'largestLead'];
  const LOW = { turnovers: 1 };
  const NICE = { fieldGoalPct: 'Field goals', threePointFieldGoalPct: 'Threes', freeThrowPct: 'Free throws', totalRebounds: 'Rebounds', assists: 'Assists', turnovers: 'Turnovers', steals: 'Steals', blocks: 'Blocks', pointsInPaint: 'Points in the paint', fastBreakPoints: 'Fast-break points', largestLead: 'Largest lead' };
  async function gameV(lk, id) {
    const L = LEAGUES[lk]; if (!L || !id) { $main.innerHTML = empty('Game not found'); return; }
    $main.innerHTML = topbar('', '#scores') + skeleton(1, 'card') + skeleton(6, 'row');
    let ctx = null;
    const paint = async (ttl) => {
      const d = await jSoft(`${API(L)}/summary?event=${encodeURIComponent(id)}`, ttl);
      const hc = d && d.header && d.header.competitions && d.header.competitions[0];
      if (!hc) { $main.innerHTML = topbar('Game', '#scores') + empty("Couldn't load this game", '<p style="margin:6px 0 0">The feed didn\'t answer. Pull down to try again.</p>'); return null; }
      const ev = { id, competitions: [{ ...hc, venue: d.gameInfo && d.gameInfo.venue, status: hc.status, broadcasts: hc.broadcasts, geoBroadcasts: hc.geoBroadcasts }], date: hc.date, status: hc.status, season: d.header.season };
      const g = parseEvent(ev, L); if (!g.date || isNaN(new Date(g.date))) g.date = new Date().toISOString();
      if (!ctx) ctx = await forecastCtx(L, ymdOf(g.date)).catch(() => null);
      const f = safeF(L, g, ctx);
      const tab = store.get('v5:gtab', 'summary');
      const title = `${esc(g.away.short)} ${g.neutral ? 'vs' : 'at'} ${esc(g.home.short)}`;
      const hero = heroCard(L, g, ctx, { page: true });
      const tabs = chips([['summary', 'Summary'], ['box', 'Box score'], ['plays', 'Plays'], ['stats', 'Team stats']].filter(([k]) => g.state !== 'pre' || k === 'summary' || k === 'stats'), tab, 'gtab', 'tab');
      // box score helpers
      const bx = d.boxscore && d.boxscore.players || [];
      const boxOf = side => bx.find(x => String(x.team.id) === side.id);
      const statOf = (p, label) => { const s = p && p.statistics && p.statistics[0]; if (!s) return null; const i = (s.labels || s.names || []).indexOf(label); return i < 0 ? null : { i, s }; };
      const topFor = side => { const p = boxOf(side); const st = statOf(p, 'PTS'); if (!st) return null; const ath = (st.s.athletes || []).filter(a => a.stats && a.stats.length && !a.didNotPlay); if (!ath.length) return null; const best = ath.slice().sort((a, b) => (+b.stats[st.i] || 0) - (+a.stats[st.i] || 0))[0]; const get = l => { const k = (st.s.labels || []).indexOf(l); return k >= 0 ? best.stats[k] : ''; }; return { a: best.athlete, pts: get('PTS'), reb: get('REB'), ast: get('AST') }; };
      const tms = d.boxscore && d.boxscore.teams || [];
      const ta = tms.find(t => String(t.team.id) === g.away.id), th = tms.find(t => String(t.team.id) === g.home.id);
      const flat = t => (t && t.statistics || []).flatMap(x => x && x.displayValue != null ? [x] : (x && (x.stats || x.statistics) || []));
      const get = (t, n) => flat(t).find(x => x.name === n);
      const cmpRows = (names) => names.map(n => { const a = get(ta, n), h = get(th, n); if (!a || !h) return ''; const av = parseFloat(String(a.displayValue).split('-')[0]) || 0, hv = parseFloat(String(h.displayValue).split('-')[0]) || 0; const mx = Math.max(av, hv) || 1; const lowGood = !!LOW[n]; const aw = lowGood ? av <= hv : av >= hv, hw = lowGood ? hv <= av : hv >= av; return `<div><span class="lab">${esc(NICE[n] || a.label || n)}</span><b class="${aw ? 'lead' : ''}">${esc(a.displayValue)}</b><em class="l"><i style="width:${av / mx * 100}%;background:${esc(V._.teamColor(g.away))}"></i></em><em class="r"><i style="width:${hv / mx * 100}%;background:${esc(V._.teamColor(g.home))}"></i></em><b class="${hw ? 'lead' : ''}">${esc(h.displayValue)}</b></div>`; }).join('');
      const plays = (d.plays || []);
      const playRow = p => `<div class="row"><span class="q">${esc(p.period && p.period.displayValue ? p.period.displayValue.replace('Quarter', 'Q').replace(/(\d)(st|nd|rd|th) Q/, 'Q$1') : '')} ${esc(p.clock && p.clock.displayValue || '')}</span><span class="t"><b class="wrap">${esc(p.text || '')}</b><span>${p.awayScore != null ? `${esc(g.away.abbr)} ${p.awayScore}, ${esc(g.home.abbr)} ${p.homeScore}` : ''}</span></span>${p.scoringPlay ? `<span class="tag ok">+${esc(p.scoreValue || '')}</span>` : ''}</div>`;
      let body = '';
      if (tab === 'summary') {
        const tp = g.state !== 'pre' ? [topFor(g.away), topFor(g.home)] : [null, null];
        if (tp[0] || tp[1]) body += sec(g.state === 'post' ? 'Top performers' : 'Leading the way') + `<div class="perf">${tp.map((x, i) => x ? `<a href="${href.player(lk, x.a.id)}">${headshot(hsUrl(x.a), V._.teamColor(i ? g.home : g.away), 56, x.a.displayName || x.a.shortName)}<b>${esc(x.a.shortName || x.a.displayName)}</b><span class="line">${esc(x.pts)}</span><span>pts, ${esc(x.ast)} ast, ${esc(x.reb)} reb</span></a>` : '<div></div>').join('')}</div>`;
        else if (d.leaders && d.leaders.length) { const items = []; d.leaders.forEach(t => (t.leaders || []).slice(0, 1).forEach(cat => { const Ld = cat.leaders && cat.leaders[0]; if (Ld) items.push({ team: t.team, cat, Ld }); })); if (items.length) body += sec('Season leaders') + `<div class="perf">${items.map(({ team, cat, Ld }) => `<a href="${href.player(lk, Ld.athlete.id)}">${headshot(hsUrl(Ld.athlete), hx(team.color), 56, Ld.athlete.displayName || Ld.athlete.shortName)}<b>${esc(Ld.athlete.shortName || Ld.athlete.displayName)}</b><span class="line">${esc((Ld.displayValue || '').split(' ')[0])}</span><span>${esc(cat.displayName.toLowerCase())}</span></a>`).join('')}</div>`; }
        if (f && prefs.get('forecast')) {
          const fav = f.pHome >= .5 ? g.home : g.away; const p = Math.max(f.pHome, 1 - f.pHome);
          const gap = f.H.rating - f.A.rating; const lead = gap >= 0 ? g.home : g.away;
          const wp = (d.winprobability || []).filter(x => x.homeWinPercentage != null);
          const bpi = d.predictor && d.predictor.homeTeam && d.predictor.homeTeam.gameProjection != null ? parseFloat(d.predictor.homeTeam.gameProjection) / 100 : null;
          const kv = [];
          if (g.state === 'in') kv.push(['Score and time', `${esc((g.home.score > g.away.score ? g.home : g.away).short)} up ${Math.abs(g.home.score - g.away.score)}, ${esc(g.detail)}`]);
          kv.push(['Ratings', Math.abs(gap) < 1.5 ? 'Even' : `${esc(lead.short)} +${Math.abs(gap).toFixed(1)}`]);
          if (!g.neutral) kv.push(['Home court', `${esc(g.home.short)} +${f.hca.toFixed(1)}`]);
          if (f.restH || f.restA) kv.push(['Rest', f.restH && f.restA ? 'Both on a back-to-back' : `${esc((f.restH ? g.home : g.away).short)} played last night, ${f.restH ? f.restH.toFixed(1) : f.restA.toFixed(1)}`]);
          if (f.soH || f.soA) kv.push(['Injuries', [f.soH ? `${esc(g.home.short)} without ${esc(f.soH.name)}` : '', f.soA ? `${esc(g.away.short)} without ${esc(f.soA.name)}` : ''].filter(Boolean).join('; ')]);
          kv.push([g.state === 'pre' ? 'Projected margin' : 'Pregame margin', `${esc((f.margin >= 0 ? g.home : g.away).short)} by ${Math.abs(f.margin).toFixed(1)}`]);
          if (g.state === 'in' && wp.length) kv.push(['ESPN live', `${esc(g.home.short)} ${pct(wp[wp.length - 1].homeWinPercentage)}`]); else if (g.state === 'pre' && bpi != null) kv.push(['ESPN', `${esc(g.home.short)} ${pct(bpi)}`]);
          body += sec(g.state === 'post' ? `Had ${esc(fav.short)} ${pct(p)}` : `Why ${esc(fav.short)} ${pct(p)}`) + `<table class="tbl kv"><tbody>${kv.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</tbody></table>`;
        }
        if (ta && th && g.state !== 'pre') { const rows = cmpRows(WANT.slice(0, 6)); if (rows) body += sec('Team stats', '', `<button data-act="gtab" data-tab="stats">All</button>`) + `<div class="cmp">${rows}</div>`; }
        if (plays.length && g.state !== 'pre') body += sec(g.state === 'in' ? 'Last plays' : 'Final plays', '', `<button data-act="gtab" data-tab="plays">All plays</button>`) + `<div class="rows plays">${plays.slice(-5).reverse().map(playRow).join('')}</div>`;
        if (g.state !== 'post') { const ws = watchFor(g, L); const list = ws.length ? ws.map(w => `<a class="row" href="${esc(w.href)}" target="_blank" rel="noopener"><span class="t"><b>${esc(w.label || w.short)}</b><span>${esc(w.bundle ? `Through ${w.bundle}` : tvLabel(g) || 'Opens in the app')}</span></span>${chev}</a>`).join('') : (tvLabel(g) ? `<div class="row"><span class="t"><b>${esc(tvLabel(g))}</b><span>Pick your services on the old site\'s updates screen to get a direct link here.</span></span></div>` : ''); if (list) body += sec('Where to watch') + `<div class="rows">${list}</div>`; }
        if (d.gameInfo && d.gameInfo.venue) body += `<p class="foot">${esc(d.gameInfo.venue.fullName || '')}${d.gameInfo.venue.address ? `, ${esc([d.gameInfo.venue.address.city, d.gameInfo.venue.address.state].filter(Boolean).join(', '))}` : ''}${d.gameInfo.attendance ? ` · ${d.gameInfo.attendance.toLocaleString()} attendance`.replace(' · ', ', ') : ''}</p>`;
      } else if (tab === 'box') {
        const table = side => { const p = boxOf(side); const s = p && p.statistics && p.statistics[0]; if (!s) return ''; const labels = s.labels || []; const ath = s.athletes || []; const rowOf = a => { const nm = `<a href="${href.player(lk, a.athlete.id)}">${esc(a.athlete.shortName || a.athlete.displayName)}</a>`; if (a.didNotPlay || !a.stats || !a.stats.length) return `<tr><td class="l">${nm}</td><td class="l mut" colspan="${labels.length}">${esc(a.reason || 'Did not play')}</td></tr>`; return `<tr><td class="l">${nm}</td>${a.stats.map(v => `<td>${esc(v)}</td>`).join('')}</tr>`; }; const st = ath.filter(a => a.starter), bn = ath.filter(a => !a.starter); const tot = s.totals && s.totals.length ? `<tr class="tot"><td class="l">Team</td>${s.totals.map(v => `<td><b>${esc(v)}</b></td>`).join('')}</tr>` : ''; return sec(side.short) + `<div class="tw"><table class="tbl box"><thead><tr><th>Player</th>${labels.map(l => `<th>${esc(l)}</th>`).join('')}</tr></thead><tbody>${st.length ? `<tr class="sub"><td colspan="${labels.length + 1}">Starters</td></tr>${st.map(rowOf).join('')}` : ''}${bn.length ? `<tr class="sub"><td colspan="${labels.length + 1}">Bench</td></tr>${bn.map(rowOf).join('')}` : ''}${tot}</tbody></table></div>`; };
        body = (table(g.away) + table(g.home)) || empty('No box score yet');
      } else if (tab === 'plays') {
        if (!plays.length) body = empty('No plays yet');
        else { const groups = []; plays.slice().reverse().forEach(p => { const k = p.period && p.period.number; const grp = groups[groups.length - 1]; if (!grp || grp.k !== k) groups.push({ k, label: p.period && p.period.displayValue || '', list: [p] }); else grp.list.push(p); }); body = groups.map(gr => sec(gr.label.replace(/(\d)(st|nd|rd|th) Quarter/, 'Quarter $1')) + `<div class="rows plays">${gr.list.map(playRow).join('')}</div>`).join(''); }
      } else if (tab === 'stats') {
        const rows = ta && th ? cmpRows(flat(ta).map(x => x.name).filter(n => get(th, n))) : '';
        body = rows ? `<div class="cmp" style="padding-top:6px">${rows}</div>` : empty(g.state === 'pre' ? 'Stats arrive at tip-off' : 'No team stats yet');
      }
      const scrollY = window.scrollY;
      $main.innerHTML = topbar(title, '#scores') + hero + tabs + body;
      if (ttl) window.scrollTo(0, scrollY);
      document.title = `${g.away.short} at ${g.home.short} · RIVL`;
      return g;
    };
    const g = await paint();
    V.refresh = async () => { if (!g || g.state === 'post') return; await paint(15000); };
    $main.addEventListener('click', e => { const b = e.target.closest('[data-act="gtab"]'); if (!b) return; store.set('v5:gtab', b.dataset.tab); paint(); });
  }

  /* ================= ARTICLE READER ================= */
  const ALLOW = new Set(['P', 'H2', 'H3', 'H4', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'STRONG', 'B', 'EM', 'I', 'A', 'BR', 'FIGURE', 'FIGCAPTION', 'IMG']);
  const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'ASIDE', 'NAV', 'FORM', 'OBJECT', 'EMBED', 'VIDEO', 'AUDIO', 'SVG', 'BUTTON', 'INPUT']);
  /* ESPN links inside a story that have a screen here: players, teams, games and other stories stay in the app */
  const LG = { nba: 'nba', wnba: 'wnba', 'mens-college-basketball': 'ncaam', 'womens-college-basketball': 'ncaaw' };
  const ESPN_LINK = /^https?:\/\/(?:www\.)?espn\.com\/(nba|wnba|mens-college-basketball|womens-college-basketball)\/(player|team|game|recap|boxscore|story)\/_\/(id|name|gameId)\/([A-Za-z0-9]+)/i;
  function inApp(u, idxs) {
    const m = String(u || '').match(ESPN_LINK); if (!m) return null;
    const lk = LG[m[1].toLowerCase()], kind = m[2].toLowerCase(), key = m[3].toLowerCase(), v = m[4];
    if (kind === 'player' && key === 'id') return href.player(lk, v);
    if (kind === 'team') { if (key === 'id') return href.team(lk, v); const idx = idxs[lk] || {}; const t = Object.values(idx).find(t => (t.abbr || '').toLowerCase() === v.toLowerCase()); return t ? href.team(lk, t.id) : null; }
    if ((kind === 'game' || kind === 'recap' || kind === 'boxscore') && key === 'gameid') return href.game(lk, v);
    if (kind === 'story' && key === 'id') return `#article/${lk}/${v}`;
    return null;
  }
  function clean(html, idxs = {}) {
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html'); const root = doc.body.firstChild;
    const walk = node => {
      [...node.childNodes].forEach(n => {
        if (n.nodeType !== 1) return;
        if (DROP.has(n.tagName) || /inline-?video|video-?container|ad-|promo/i.test(n.className || '')) { n.remove(); return; }
        walk(n);
        if (!ALLOW.has(n.tagName)) { n.replaceWith(...n.childNodes); return; }
        [...n.attributes].forEach(a => { if (!((n.tagName === 'A' && a.name === 'href') || (n.tagName === 'IMG' && a.name === 'src'))) n.removeAttribute(a.name); });
        if (n.tagName === 'A') { const u = n.getAttribute('href') || ''; const here = inApp(u, idxs); if (here) n.setAttribute('href', here); else if (!/^https?:/i.test(u)) n.replaceWith(...n.childNodes); else { n.setAttribute('target', '_blank'); n.setAttribute('rel', 'noopener'); } }
        if (n.tagName === 'IMG') { const u = n.getAttribute('src') || ''; if (!/^https:/i.test(u)) n.remove(); else { n.setAttribute('loading', 'lazy'); n.setAttribute('alt', ''); } }
      });
    };
    walk(root);
    return root.innerHTML.trim();
  }
  async function articleV(lk, id) {
    const cached = S.news[id] || null;
    const webOf = a => a && a.links && a.links.web && a.links.web.href || `https://www.espn.com/${LEAGUES[lk].path.split('/')[1]}/story/_/id/${id}`;
    const head = (a) => { const im = a && a.images && a.images[0]; return `<article class="reader">${im && im.url ? `<img class="lead" src="${esc(im.url)}" alt="${esc(im.caption || '')}" onerror="this.remove()">` : ''}<h1>${esc(a && a.headline || '')}</h1><p class="by">${esc([a && a.byline, a && a.published ? new Date(a.published).toLocaleString('en-US', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: HW.TZ }) : ''].filter(Boolean).join(', '))}</p>`; };
    $main.innerHTML = topbar('', '#home') + (cached ? head(cached) + `<p class="dek">${esc(cached.description || '')}</p>` + skeleton(6, 'row') + '</article>' : skeleton(8, 'row'));
    const api = cached && cached.links && cached.links.api && cached.links.api.news && cached.links.api.news.href || `https://now.core.api.espn.com/v1/sports/news/${encodeURIComponent(id)}`;
    const full = await jSoft(api, 3600000);
    const h = full && (full.headlines && full.headlines[0] || full.article || full);
    const a = h && h.headline ? h : cached;
    if (!a) { $main.innerHTML = topbar('Story', '#home') + empty("Couldn't load this story", `<p style="margin:6px 0 0">The feed didn't answer.</p>`, `<a class="btn" href="${esc(webOf(cached))}" target="_blank" rel="noopener">Open on ESPN</a>`); return; }
    // team links in ESPN stories use the abbreviation, so load the index for any league the story links to
    const raw = h && h.story || '';
    const idxs = {}; await Promise.all([...new Set([...raw.matchAll(/espn\.com\/(nba|wnba|mens-college-basketball|womens-college-basketball)\/team\/_\/name\//gi)].map(x => LG[x[1].toLowerCase()]))].map(async k => { idxs[k] = await teamsIndex(LEAGUES[k]).catch(() => ({})); }));
    const story = raw ? clean(raw, idxs) : '';
    const vids = (h && (h.video || h.videos) || cached && (cached.video || cached.videos) || []).filter(v => v && v.links); vids.forEach(v => { if (v.id != null) S.videos[String(v.id)] = v; });
    const clips = vids.length ? sec('Clips') + `<div class="media">${vids.map(v => `<button class="clip" data-act="play" data-vid="${esc(String(v.id))}"><div class="th">${v.thumbnail ? `<img src="${esc(v.thumbnail)}" alt="" loading="lazy">` : ''}<i><svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l12-7.5z"/></svg></i>${v.duration ? `<em>${Math.floor(v.duration / 60)}:${String(v.duration % 60).padStart(2, '0')}</em>` : ''}</div><b>${esc(v.headline || v.title || '')}</b></button>`).join('')}</div>` : '';
    const premium = !story || (h && h.premium);
    const bodyHtml = story ? `<div class="body">${story}</div>` : `<p class="dek">${esc(a.description || cached && cached.description || '')}</p>`;
    // the whole story is here, so nothing points back to ESPN; only a paywalled or summary-only piece gets a way out
    const tail = premium ? `<div class="empty" style="margin-top:18px"><b>${story ? 'This is an ESPN+ story' : 'Full story is on ESPN'}</b><p style="margin:6px 0 0">${story ? 'The rest is behind their paywall.' : 'ESPN only shares the summary for this one.'}</p><a class="btn" style="margin-top:12px" href="${esc(webOf(a))}" target="_blank" rel="noopener">Continue on ESPN</a></div>` : '';
    $main.innerHTML = topbar('Story', '#home', '') + head(a) + bodyHtml + '</article>' + clips + tail;
    document.title = `${a.headline} · RIVL`;
  }

  /* ================= SEARCH ================= */
  async function searchV() {
    const lk = store.get('v5:lk', 'nba'); const L = LEAGUES[lk];
    $main.innerHTML = `<div class="search" style="margin-top:4px"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.8-3.8"/></svg><input id="sq" type="search" placeholder="Players and teams in the ${esc(L.label)}" autocomplete="off" aria-label="Search"></div><div id="sres"><p class="foot">Type a name. Players and teams from the league you're on.</p></div>`;
    const inp = $main.querySelector('#sq'); inp.focus();
    const [lp, idx] = await Promise.all([L.sport === 'basketball' ? leaguePlayers(L).catch(() => null) : null, teamsIndex(L)]);
    const paint = () => {
      const q = inp.value.trim().toLowerCase(); const out = $main.querySelector('#sres'); if (!q) { out.innerHTML = ''; return; }
      const teams = Object.values(idx).filter(t => `${t.name} ${t.abbr}`.toLowerCase().includes(q)).slice(0, 5);
      const players = lp ? lp.rows.filter(p => (p.name || '').toLowerCase().includes(q)).slice(0, 12) : [];
      out.innerHTML = (teams.length ? sec('Teams') + `<div class="rows">${teams.map(t => `<a class="row" href="${href.team(lk, t.id)}">${logo(t.logo)}<span class="t"><b>${esc(t.name)}</b></span>${chev}</a>`).join('')}</div>` : '') + (players.length ? sec('Players') + `<div class="rows">${players.map(p => { const t = idx[p.teamId] || {}; return `<a class="row" href="${href.player(lk, p.id)}">${headshot(p.img, t.color, 46, p.name)}<span class="t"><b>${esc(p.name)}</b><span>${esc(t.short || p.team)}</span></span><span class="r"><b>${p.pts.toFixed(1)}</b><span>ppg</span></span></a>`; }).join('')}</div>` : '') || empty('No matches');
    };
    let t = null; inp.addEventListener('input', () => { clearTimeout(t); t = setTimeout(paint, 100); });
  }

  /* ================= SETTINGS: what you follow, what Home shows, how it looks ================= */
  const PREFS = [
    ['live', 'Live now', 'A big card when one of your teams is playing'],
    ['teams', 'My teams', 'Record, next game and the chance to win'],
    ['games', 'Your games', 'The next game for each team you follow'],
    ['players', 'My players', 'Scoring lines, one tap to the profile'],
    ['injuries', 'Injuries', 'Reports on your teams and players'],
    ['news', 'News', 'Stories about your teams and players']
  ];
  const sw = (k, on, title, body) => `<button class="row sw" data-act="pref" data-pref="${k}" role="switch" aria-checked="${on}"><span class="t"><b>${esc(title)}</b><span class="wrap">${esc(body)}</span></span><span class="switch"></span></button>`;
  async function settingsV() {
    const P = prefs.all(); const theme = store.get('v5:theme', 'system');
    const F = favs.all(); const fp = fplayers.all();
    const back = `<div class="topbar"><a class="ib" href="#home" data-act="back" aria-label="Back"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m14 6-6 6 6 6"/></svg></a><span class="ttl">Settings</span></div>`;
    $main.innerHTML = back + skeleton(6, 'row');
    const leagues = ORDER.filter(k => (F[k] || []).length);
    const idxs = {}; await Promise.all(leagues.map(async k => { idxs[k] = await teamsIndex(LEAGUES[k]).catch(() => ({})); }));
    const teamRows = leagues.flatMap(k => (F[k] || []).map(id => { const t = idxs[k][String(id)] || { id: String(id), name: 'Team', logo: '' }; return `<div class="row prow"><a class="go" href="${href.team(k, t.id)}">${logo(t.logo)}</a><a class="t" href="${href.team(k, t.id)}"><b>${esc(t.name || t.short)}</b><span>${esc(LEAGUES[k].label)}</span></a><button class="star on" data-act="fav" data-lk="${k}" data-id="${esc(t.id)}" data-name="${esc(t.short || t.name)}" aria-pressed="true" aria-label="Unfollow ${esc(t.name || '')}">${starSvg}</button></div>`; }));
    const playerRows = fp.map(p => `<div class="row prow"><a class="go" href="${href.player(p.lk, p.id)}">${headshot(p.img, p.color, 46, p.name)}</a><a class="t" href="${href.player(p.lk, p.id)}"><b>${esc(p.name)}</b><span>${esc([p.team, LEAGUES[p.lk] && LEAGUES[p.lk].label].filter(Boolean).join(', '))}</span></a><button class="star on" data-act="follow-player" data-snap='${esc(JSON.stringify(p))}' aria-pressed="true" aria-label="Unfollow ${esc(p.name)}">${starSvg}</button></div>`);
    const standalone = V.standalone ? V.standalone() : false;
    $main.innerHTML = back +
      sec('My teams', `${teamRows.length}`, `<a href="#teams">Add</a>`) + (teamRows.length ? `<div class="rows">${teamRows.join('')}</div>` : empty('No teams yet', '', `<a class="btn" href="#teams">Choose teams</a>`)) +
      sec('My players', `${playerRows.length}`, `<a href="#players">Add</a>`) + (playerRows.length ? `<div class="rows">${playerRows.join('')}</div>` : empty('No players yet', '', `<a class="btn" href="#players">Find players</a>`)) +
      sec('Home shows') + `<div class="rows">${PREFS.map(([k, t, b]) => sw(k, P[k] !== false, t, b)).join('')}</div>` +
      sec('Game cards') + `<div class="rows">${sw('forecast', P.forecast !== false, 'Win chances', "RIVL's own estimate on each game card and game page")}</div>` +
      sec('Appearance') + `<div class="chips" role="radiogroup" aria-label="Theme">${[['system', 'Match my phone'], ['dark', 'Dark'], ['light', 'Light']].map(([k, l]) => `<button class="chip${theme === k ? ' on' : ''}" data-act="theme" data-theme="${k}" role="radio" aria-checked="${theme === k}">${l}</button>`).join('')}</div>` +
      sec('App') + `<div class="rows">${standalone ? '' : `<button class="row" data-act="install"><span class="t"><b>Add to home screen</b><span class="wrap">Opens full screen like an app, your teams first</span></span>${chev}</button>`}<button class="row" data-act="onb-restart"><span class="t"><b>Run setup again</b><span class="wrap">Pick teams and players from the start</span></span>${chev}</button></div>` +
      `<p class="foot">Scores, stats, injuries and news are ESPN's, straight from their public feeds. Win chances are RIVL's own estimate and not betting advice.</p>`;
    if (V._settingsL) { $main.removeEventListener('rivl:fav', V._settingsL); $main.removeEventListener('rivl:follow', V._settingsL); }
    V._settingsL = () => { if ((location.hash || '') === '#settings') settingsV(); };
    $main.addEventListener('rivl:fav', V._settingsL); $main.addEventListener('rivl:follow', V._settingsL);
  }

  Object.assign(V, { standings: standingsV, teams: teamsV, team: teamV, game: gameV, article: articleV, search: searchV, settings: settingsV });
})();
