/* Tipoff push server. A single Cloudflare Worker, no dependencies.
   - POST /subscribe   {sub, teams:["nba:25", ...], prefs:{pre,close,final,inj,moves,score}}   → stores the browser's push subscription
   - POST /unsubscribe {endpoint}
   - cron every minute: checks ESPN for the subscribed teams' games and sends Web Push notifications (VAPID + aes128gcm, done with WebCrypto).
   Bindings: KV (KV namespace). Variables: VAPID_PUBLIC, VAPID_PRIVATE_JWK (secret, JSON), VAPID_SUBJECT (mailto:…), ALLOWED_ORIGINS (comma list), SELF_URL (this worker's URL). */

const LEAGUES = {
  nba:   { path: 'nba', label: 'NBA', sb: '&limit=50', reg: 4, injuries: true, moves: true },
  wnba:  { path: 'wnba', label: 'WNBA', sb: '&limit=50', reg: 4, injuries: true, moves: true },
  ncaam: { path: 'mens-college-basketball', label: 'NCAA M', sb: '&groups=50&limit=400', reg: 2, injuries: false, moves: false },
  ncaaw: { path: 'womens-college-basketball', label: 'NCAA W', sb: '&groups=50&limit=400', reg: 2, injuries: false, moves: false },
  nfl:   { path: 'football/nfl', label: 'NFL', sb: '', reg: 4, injuries: true, moves: true, sport: 'football' },
  ncaaf: { path: 'football/college-football', label: 'NCAA F', sb: '&groups=80&limit=200', reg: 4, injuries: false, moves: false, sport: 'football' },
  mlb:   { path: 'baseball/mlb', label: 'MLB', sb: '', reg: 9, injuries: true, moves: true, sport: 'baseball' },
  ncaab: { path: 'baseball/college-baseball', label: 'NCAA B', sb: '&groups=26&limit=200', reg: 9, injuries: false, moves: false, sport: 'baseball' }
};
const API = L => `https://site.api.espn.com/apis/site/v2/sports/${L.sport ? L.path : 'basketball/' + L.path}`;
const TZ = 'America/Chicago';

/* ---------- helpers ---------- */
const enc = new TextEncoder();
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), c => c.charCodeAt(0)); };
const concat = (...arrs) => { const n = arrs.reduce((s, a) => s + a.byteLength, 0); const out = new Uint8Array(n); let o = 0; arrs.forEach(a => { out.set(new Uint8Array(a), o); o += a.byteLength; }); return out; };
async function sha(s) { return b64u(await crypto.subtle.digest('SHA-256', enc.encode(s))).slice(0, 24); }
const todayCT = () => { const d = new Date(); const h = +new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hour12: false }).format(d) % 24; const y = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d); if (h >= 4) return y; const [Y, M, D] = y.split('-').map(Number); return new Date(Date.UTC(Y, M - 1, D - 1)).toISOString().slice(0, 10); };
const tipCT = iso => new Date(iso).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
const cors = (env, req) => { const o = req.headers.get('Origin') || ''; const ok = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean); const allow = ok.includes(o) ? o : ok[0] || '*'; return { 'Access-Control-Allow-Origin': allow, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Vary': 'Origin' }; };
const json = (o, status = 200, h = {}) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', ...h } });

/* ---------- Web Push (RFC 8291 / 8188 / 8292) ---------- */
async function vapidJwt(env, audience) {
  const key = await crypto.subtle.importKey('jwk', JSON.parse(env.VAPID_PRIVATE_JWK), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const head = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64u(enc.encode(JSON.stringify({ aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT || 'mailto:tipoff@example.com' })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${head}.${body}`));
  return `${head}.${body}.${b64u(sig)}`;
}
async function hkdf(salt, ikm, info, len) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, len * 8));
}
async function encryptPayload(sub, text) {
  const uaPub = unb64u(sub.keys.p256dh), auth = unb64u(sub.keys.auth);
  const local = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256));
  const ikm = await hkdf(auth, shared, concat(enc.encode('WebPush: info\0'), uaPub, asPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const record = concat(enc.encode(text), new Uint8Array([2]));
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, record));
  const rs = new Uint8Array([0, 0, 16, 0]); // record size 4096
  return concat(salt, rs, new Uint8Array([asPub.length]), asPub, ct);
}
async function sendPush(env, sub, payload) {
  const url = new URL(sub.endpoint);
  const jwt = await vapidJwt(env, url.origin);
  const body = await encryptPayload(sub, JSON.stringify(payload));
  const r = await fetch(sub.endpoint, { method: 'POST', headers: { 'Authorization': `vapid t=${jwt}, k=${env.VAPID_PUBLIC}`, 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', 'TTL': String(payload.ttl || 3600), 'Urgency': payload.urgency || 'normal' }, body });
  return r.status;
}

/* ---------- ESPN parsing ---------- */
function parseGame(e) {
  const c = e.competitions[0]; const st = (c.status || e.status || {}); const t = st.type || {};
  const side = x => { const tm = x.team || {}; return { id: String(tm.id), abbr: tm.abbreviation || '', short: tm.shortDisplayName || tm.name || '', score: x.score != null && x.score !== '' ? +x.score : null, rank: x.curatedRank && x.curatedRank.current <= 25 ? x.curatedRank.current : null }; };
  const comp = c.competitors || [];
  return { id: String(e.id), date: e.date, state: t.state || 'pre', detail: t.shortDetail || '', period: st.period || 0, clock: st.displayClock || '', home: side(comp.find(x => x.homeAway === 'home') || comp[0] || {}), away: side(comp.find(x => x.homeAway === 'away') || comp[1] || {}), tv: (c.broadcasts || []).flatMap(b => b.names || []).slice(0, 2).join(' · ') };
}
async function getJson(u) { const r = await fetch(u, { headers: { 'user-agent': 'tipoff-push' }, cf: { cacheTtl: 20 } }); if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); }

/* ---------- subscriptions ---------- */
async function loadSubs(env) {
  const subs = []; let cursor;
  do { const l = await env.KV.list({ prefix: 'sub:', cursor }); for (const k of l.keys) { const v = await env.KV.get(k.name, 'json'); if (v && v.sub) subs.push({ key: k.name, ...v }); } cursor = l.list_complete ? null : l.cursor; } while (cursor);
  return subs;
}
async function deliver(env, subs, teamKey, kind, payload) {
  const targets = subs.filter(s => s.teams.includes(teamKey) && (s.prefs || {})[kind] !== false && (kind !== 'score' || (s.prefs && s.prefs.score && s.prefs.score !== 'off')));
  let n = 0;
  for (const s of targets) {
    try { const st = await sendPush(env, s.sub, payload); if (st === 404 || st === 410) await env.KV.delete(s.key); else if (st < 300) n++; } catch (e) { console.log('push failed', e.message); }
  }
  return n;
}
const sentKey = k => 'sent:' + k;
async function once(env, k, fn) { if (await env.KV.get(sentKey(k))) return false; await env.KV.put(sentKey(k), '1', { expirationTtl: 172800 }); await fn(); return true; }

/* ---------- the minute check for one league ---------- */
async function runLeague(env, lk, subs) {
  const L = LEAGUES[lk]; if (!L) return;
  const teams = new Set(subs.flatMap(s => s.teams.filter(t => t.startsWith(lk + ':')).map(t => t.slice(lk.length + 1))));
  if (!teams.size) return;
  const ymd = todayCT();
  let games; try { games = ((await getJson(`${API(L)}/scoreboard?dates=${ymd.replace(/-/g, '')}${L.sb}`)).events || []).map(parseGame); } catch (e) { console.log(lk, 'scoreboard', e.message); return; }
  const now = Date.now();
  for (const g of games) {
    const mineH = teams.has(g.home.id), mineA = teams.has(g.away.id); if (!mineH && !mineA) continue;
    const both = [mineH ? `${lk}:${g.home.id}` : null, mineA ? `${lk}:${g.away.id}` : null].filter(Boolean);
    const gk = `${lk}:${g.id}`; const url = `#${lk}/game/${g.id}`; const name = `${g.away.abbr} at ${g.home.abbr}`;
    const send = (kind, payload, dedupe) => once(env, dedupe, async () => { for (const tk of both) await deliver(env, subs, tk, kind, { ...payload, url, league: lk }); });
    const mins = (new Date(g.date) - now) / 60000;
    if (g.state === 'pre' && mins > 0 && mins <= 30) await send('pre', { title: `${name} tips in ${Math.round(mins)} min`, body: `${tipCT(g.date)} CT${g.tv ? ' · ' + g.tv : ''}`, tag: `pre:${gk}` }, `${gk}:pre`);
    if (g.state === 'in') {
      const snap = await env.KV.get('st:' + gk, 'json') || {};
      const hs = g.home.score || 0, as = g.away.score || 0; const leader = hs === as ? 'tie' : hs > as ? 'home' : 'away';
      const score = `${g.away.abbr} ${as}, ${g.home.abbr} ${hs}`;
      const last = g.period >= L.reg;
      const [mm] = String(g.clock || '0:00').split(':').map(Number);
      // end of a period: the period counter moved past what we last saw
      if (snap.period && g.period > snap.period) await send('score', { title: `${L.sport === 'baseball' ? 'Mid-game' : 'End of ' + ordinal(snap.period)}: ${score}`, body: name, tag: `game:${gk}`, renotify: true }, `${gk}:p${snap.period}`);
      // lead change in the final period
      if (last && snap.leader && snap.leader !== leader && leader !== 'tie') await send('score', { title: `${leader === 'home' ? g.home.abbr : g.away.abbr} take the lead: ${score}`, body: `${g.detail}`, tag: `game:${gk}`, renotify: true }, `${gk}:lead${Math.floor(now / 180000)}`);
      // steady updates for people who asked for them
      if (!snap.oftenAt || now - snap.oftenAt > 3 * 60000) { const t = subs.filter(s => both.some(tk => s.teams.includes(tk)) && s.prefs && s.prefs.score === 'often'); if (t.length) { for (const tk of both) await deliver(env, t, tk, 'score', { title: score, body: `${g.detail} · ${name}`, tag: `game:${gk}`, url, league: lk, silent: true }); snap.oftenAt = now; } }
      if (last && Math.abs(hs - as) <= (L.sport === 'football' ? 8 : L.sport === 'baseball' ? 1 : 5) && (L.sport === 'baseball' ? g.period >= 8 : (mm || 0) < 3)) await send('close', { title: `Close one: ${score}`, body: `${g.detail} · ${name}`, tag: `close:${gk}` }, `${gk}:close`);
      const next = { period: g.period, leader, hs, as, oftenAt: snap.oftenAt || 0, live: 1 };
      if (JSON.stringify(next) !== JSON.stringify(snap)) await env.KV.put('st:' + gk, JSON.stringify(next), { expirationTtl: 172800 });
    }
    if (g.state === 'post') {
      const snap = await env.KV.get('st:' + gk, 'json');
      if (snap && snap.live) { const w = (g.home.score || 0) > (g.away.score || 0) ? g.home : g.away, l = w === g.home ? g.away : g.home; await send('final', { title: `Final: ${w.abbr} ${w.score}, ${l.abbr} ${l.score}`, body: `${w.short} ${teams.has(w.id) ? 'win' : 'beat ' + l.short}`, tag: `game:${gk}`, renotify: true }, `${gk}:final`); }
    }
  }
}
const ordinal = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : n % 10 < 4 ? n % 10 : 0]);

async function runInjuriesAndMoves(env, lk, subs) {
  const L = LEAGUES[lk]; if (!L) return;
  const teams = [...new Set(subs.flatMap(s => s.teams.filter(t => t.startsWith(lk + ':')).map(t => t.slice(lk.length + 1))))];
  if (!teams.length) return;
  if (L.injuries) {
    try {
      const d = await getJson(`${API(L)}/injuries`);
      for (const t of (d.injuries || [])) {
        const id = String(t.id || ''); if (!teams.includes(id)) continue;
        const cur = {}; (t.injuries || []).forEach(x => { if (/out|suspen/i.test(x.status || '')) cur[x.athlete.id] = { n: x.athlete.displayName, s: x.status, d: x.details && x.details.type || '' }; });
        const prev = await env.KV.get(`inj:${lk}:${id}`, 'json');
        if (prev) {
          const team = (t.displayName || '').split(' ').pop();
          for (const [pid, x] of Object.entries(cur)) if (!prev[pid]) await deliver(env, subs, `${lk}:${id}`, 'inj', { title: `${team}: ${x.n} out`, body: `${x.d || x.s}${x.d ? ' · ' + x.s : ''}`, tag: `inj:${pid}`, url: `#${lk}/injuries`, league: lk });
          for (const [pid, x] of Object.entries(prev)) if (!cur[pid]) await deliver(env, subs, `${lk}:${id}`, 'inj', { title: `${team}: ${x.n} off the injury report`, body: 'No longer listed out', tag: `inj:${pid}`, url: `#${lk}/injuries`, league: lk });
        }
        if (JSON.stringify(cur) !== JSON.stringify(prev || null)) await env.KV.put(`inj:${lk}:${id}`, JSON.stringify(cur));
      }
    } catch (e) { console.log(lk, 'injuries', e.message); }
  }
  if (L.moves) {
    try {
      const d = await getJson(`${API(L)}/transactions?limit=40`);
      const newest = {};
      for (const x of (d.transactions || [])) {
        const tid = x.team && String(x.team.id); if (!tid || !teams.includes(tid)) continue;
        const date = x.date || ''; const last = await env.KV.get(`mv:${lk}:${tid}`);
        if (last && date > last) await deliver(env, subs, `${lk}:${tid}`, 'moves', { title: `${x.team.displayName}: transaction`, body: x.description, tag: `mv:${tid}:${date}`, url: `#${lk}/news/moves`, league: lk });
        if (!newest[tid] || date > newest[tid]) newest[tid] = date;
      }
      for (const [tid, date] of Object.entries(newest)) { const last = await env.KV.get(`mv:${lk}:${tid}`); if (date !== last) await env.KV.put(`mv:${lk}:${tid}`, date); }
    } catch (e) { console.log(lk, 'moves', e.message); }
  }
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url); const h = cors(env, req);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    if (url.pathname === '/health') return json({ ok: true, publicKey: env.VAPID_PUBLIC }, 200, h);
    if (url.pathname === '/subscribe' && req.method === 'POST') {
      let b; try { b = await req.json(); } catch { return json({ error: 'bad json' }, 400, h); }
      if (!b.sub || !b.sub.endpoint || !b.sub.keys) return json({ error: 'no subscription' }, 400, h);
      const teams = (b.teams || []).filter(t => /^[a-z]+:\d+$/.test(t)).slice(0, 40);
      const id = await sha(b.sub.endpoint);
      if (!teams.length) { await env.KV.delete('sub:' + id); return json({ ok: true, teams: 0 }, 200, h); }
      await env.KV.put('sub:' + id, JSON.stringify({ sub: b.sub, teams, prefs: b.prefs || {}, t: Date.now() }));
      return json({ ok: true, teams: teams.length }, 200, h);
    }
    if (url.pathname === '/unsubscribe' && req.method === 'POST') {
      let b; try { b = await req.json(); } catch { return json({ error: 'bad json' }, 400, h); }
      if (b.endpoint) await env.KV.delete('sub:' + await sha(b.endpoint));
      return json({ ok: true }, 200, h);
    }
    if (url.pathname === '/test' && req.method === 'POST') {   // sends a test notification to one subscription
      let b; try { b = await req.json(); } catch { return json({ error: 'bad json' }, 400, h); }
      const v = await env.KV.get('sub:' + await sha(b.endpoint || ''), 'json'); if (!v) return json({ error: 'not subscribed' }, 404, h);
      const st = await sendPush(env, v.sub, { title: 'Tipoff updates are on', body: 'Your teams: pregame, score updates, close games, finals, injuries, trades.', tag: 'welcome', url: '#' });
      return json({ ok: st < 300, status: st }, 200, h);
    }
    // internal fan-out: one league per request so each stays inside the free CPU budget
    if (url.pathname === '/run' && req.headers.get('x-tipoff-cron') === (env.CRON_TOKEN || 'tipoff')) {
      const lk = url.searchParams.get('lk'); const what = url.searchParams.get('what') || 'games';
      const subs = await loadSubs(env);
      if (what === 'games') await runLeague(env, lk, subs); else await runInjuriesAndMoves(env, lk, subs);
      return json({ ok: true });
    }
    return json({ error: 'not found' }, 404, h);
  },
  async scheduled(event, env, ctx) {
    const self = env.SELF_URL || ''; if (!self) { console.log('set SELF_URL'); return; }
    const minute = new Date().getUTCMinutes();
    const subs = await loadSubs(env);
    const leagues = [...new Set(subs.flatMap(s => s.teams.map(t => t.split(':')[0])))].filter(lk => LEAGUES[lk]);
    const calls = leagues.map(lk => fetch(`${self}/run?lk=${lk}&what=games`, { headers: { 'x-tipoff-cron': env.CRON_TOKEN || 'tipoff' } }).catch(() => null));
    if (minute % 30 === 7) leagues.forEach(lk => calls.push(fetch(`${self}/run?lk=${lk}&what=moves`, { headers: { 'x-tipoff-cron': env.CRON_TOKEN || 'tipoff' } }).catch(() => null)));
    ctx.waitUntil(Promise.all(calls));
  }
};
