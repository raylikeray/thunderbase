/* probe: fetch one feed URL and print its shape — top-level keys, and for a list of articles the distinct types, a few
   samples with the fields that matter, and one whole item — so the client's assumptions can be checked against the feed. */
const url = process.argv[2]; if (!url) { console.error('usage: node tools/probe.mjs <url>'); process.exit(1); }
const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (tipoff probe)' } });
console.log('status', r.status, r.headers.get('content-type'));
const d = await r.json();
console.log('keys', Object.keys(d));
const arts = d.articles || d.items || d.headlines || d.feed || [];
if (Array.isArray(arts) && arts.length) {
  const types = {}; arts.forEach(a => { const k = `${a.type || '?'}${a.premium ? ' premium' : ''}`; types[k] = (types[k] || 0) + 1; });
  console.log('count', arts.length, 'types', types);
  console.log('item keys', [...new Set(arts.flatMap(a => Object.keys(a)))]);
  for (const a of arts.slice(0, 40)) console.log(JSON.stringify({ type: a.type, dataSourceIdentifier: a.dataSourceIdentifier, headline: a.headline, published: a.published, lastModified: a.lastModified, byline: a.byline, premium: a.premium, nowId: a.nowId, cats: (a.categories || []).map(c => `${c.type}:${c.description || c.sportId || c.teamId || c.athleteId || ''}`), video: !!(a.video || a.videos), flags: Object.keys(a).filter(k => /break|alert|urgent|priority|flag|now|story|label/i.test(k)).map(k => `${k}=${JSON.stringify(a[k]).slice(0, 80)}`) }));
  const hn = arts.find(a => /headline/i.test(a.type || '')) || arts[0];
  console.log('one whole item', JSON.stringify(hn).slice(0, 6000));
} else console.log('body', JSON.stringify(d).slice(0, 6000));
