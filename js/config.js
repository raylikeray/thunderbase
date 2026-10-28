/* Tipoff — league configuration. Shared by the site (browser) and tools/nightly.mjs (Node). */
(function (root) {
  'use strict';
  const LEAGUES = {
    nba: {
      key: 'nba', path: 'nba', label: 'NBA', short: 'NBA', tag: 'NBA', noun: 'NBA',
      sbParams: '&limit=50', standingsMode: 'conference', hasRankings: false, hasInjuries: true, hasTransactions: true,
      minutes: 48, sd: 12, hca: 2.4, b2b: 1.8, k: 20, eloPerPoint: 28,
      seasonStart: '2026-10-20', playoffLine: [6, 10],
      favs: [], home: null
    },
    wnba: {
      key: 'wnba', path: 'wnba', label: 'WNBA', short: 'WNBA', tag: 'WNBA', noun: 'WNBA',
      sbParams: '&limit=50', standingsMode: 'league', hasRankings: false, hasInjuries: true, hasTransactions: true,
      minutes: 40, sd: 11, hca: 2.0, b2b: 1.5, k: 22, eloPerPoint: 26,
      seasonStart: '2026-05-01', playoffLine: [8],
      favs: [], home: null
    },
    ncaam: {
      key: 'ncaam', path: 'mens-college-basketball', label: 'NCAA M', short: 'NCAA M', tag: 'NCAAM', noun: "men's college",
      sbParams: '&groups=50&limit=400', standingsMode: 'conferences', hasRankings: true, hasInjuries: false, hasTransactions: false,
      minutes: 40, sd: 11, hca: 3.2, b2b: 0.8, k: 24, eloPerPoint: 26,
      seasonStart: '2026-11-01', playoffLine: [],
      favs: [], home: null
    },
    ncaaw: {
      key: 'ncaaw', path: 'womens-college-basketball', label: 'NCAA W', short: 'NCAA W', tag: 'NCAAW', noun: "women's college",
      sbParams: '&groups=50&limit=400', standingsMode: 'conferences', hasRankings: true, hasInjuries: false, hasTransactions: false,
      minutes: 40, sd: 12, hca: 3.4, b2b: 0.8, k: 24, eloPerPoint: 26,
      seasonStart: '2026-11-01', playoffLine: [],
      favs: [], home: null
    }
  };
  const ORDER = ['nba', 'wnba', 'ncaam', 'ncaaw'];
  // Push server (push/worker.js on Cloudflare). url stays empty until the worker is deployed; the site then falls back to in-app alerts.
  const PUSH = { url: '', key: 'BDUH0aH26afiBJtMQeD2pB3ktBXjdQ8YBENhlZ-7LuZVrpMoS9_EMhhcYV9ivNXZLG80AuyhT3a7ETH8c8AlJAU' };
  const ESPN = {
    site: 'https://site.api.espn.com/apis/site/v2/sports/basketball/',
    v2: 'https://site.api.espn.com/apis/v2/sports/basketball/',
    web: 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/'
  };
  const out = { LEAGUES, ORDER, ESPN, PUSH, TZ: 'America/Chicago', SITE: 'Tipoff' };
  if (typeof module !== 'undefined' && module.exports) module.exports = out; else root.HW = Object.assign(root.HW || {}, out);
})(typeof globalThis !== 'undefined' ? globalThis : this);
