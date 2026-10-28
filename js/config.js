/* Tipoff — league configuration. Shared by the site (browser) and tools/nightly.mjs (Node). */
(function (root) {
  'use strict';
  /* Per league:
     sport        basketball | football | baseball   (box scores, clocks, wording and the model's spread follow the sport)
     path         ESPN path under /sports/
     weekly       true for football: the "today" slate is the current week's games
     diffIsTotal  standings "differential" is a season total (NFL, MLB) rather than a per-game average (NBA)
     sd           spread of the margin in points/runs; hca home advantage; b2b rest penalty (played yesterday); k Elo speed; eloPerPoint Elo per point of margin
     tuneAt       games on record before the nightly self-tuning starts
     verb         what the start of a game is called */
  const LEAGUES = {
    nba: {
      key: 'nba', tuneAt: 60, sport: 'basketball', path: 'basketball/nba', logo: 'nba', label: 'NBA', short: 'NBA', tag: 'NBA', noun: 'NBA',
      sbParams: '&limit=50', standingsMode: 'conference', hasRankings: false, hasInjuries: true, hasTransactions: true,
      minutes: 48, periods: 4, sd: 12, hca: 2.4, b2b: 1.8, k: 20, eloPerPoint: 28,
      seasonStart: '2026-10-20', playoffLine: [6, 10], verb: 'tips', favs: [], home: null
    },
    wnba: {
      key: 'wnba', tuneAt: 40, sport: 'basketball', path: 'basketball/wnba', logo: 'wnba', label: 'WNBA', short: 'WNBA', tag: 'WNBA', noun: 'WNBA',
      sbParams: '&limit=50', standingsMode: 'league', hasRankings: false, hasInjuries: true, hasTransactions: true,
      minutes: 40, periods: 4, sd: 11, hca: 2.0, b2b: 1.5, k: 22, eloPerPoint: 26,
      seasonStart: '2026-05-01', playoffLine: [8], verb: 'tips', favs: [], home: null, offseason: 'The WNBA is in its off-season; the schedule returns in May.'
    },
    ncaam: {
      key: 'ncaam', tuneAt: 150, sport: 'basketball', path: 'basketball/mens-college-basketball', logo: 'ncaa', label: 'NCAA M', short: 'NCAA M', tag: 'NCAAM', noun: "men's college basketball",
      sbParams: '&groups=50&limit=400', standingsMode: 'conferences', standingsGroup: 50, hasRankings: true, hasInjuries: false, hasTransactions: false,
      minutes: 40, periods: 2, sd: 11, hca: 3.2, b2b: 0.8, k: 24, eloPerPoint: 26,
      seasonStart: '2026-11-01', playoffLine: [], verb: 'tips', favs: [], home: null
    },
    ncaaw: {
      key: 'ncaaw', tuneAt: 150, sport: 'basketball', path: 'basketball/womens-college-basketball', logo: 'ncaa', label: 'NCAA W', short: 'NCAA W', tag: 'NCAAW', noun: "women's college basketball",
      sbParams: '&groups=50&limit=400', standingsMode: 'conferences', standingsGroup: 50, hasRankings: true, hasInjuries: false, hasTransactions: false,
      minutes: 40, periods: 4, sd: 12, hca: 3.4, b2b: 0.8, k: 24, eloPerPoint: 26,
      seasonStart: '2026-11-01', playoffLine: [], verb: 'tips', favs: [], home: null
    },
    nfl: {
      key: 'nfl', tuneAt: 100, sport: 'football', path: 'football/nfl', logo: 'nfl', label: 'NFL', short: 'NFL', tag: 'NFL', noun: 'NFL',
      sbParams: '', weekly: true, standingsMode: 'conference', diffIsTotal: true, hasRankings: false, hasInjuries: true, hasTransactions: true,
      minutes: 60, periods: 4, sd: 13.5, hca: 2.2, b2b: 0, k: 20, eloPerPoint: 25,
      seasonStart: '2026-09-10', playoffLine: [7], verb: 'kicks off', favs: [], home: null
    },
    ncaaf: {
      key: 'ncaaf', tuneAt: 150, sport: 'football', path: 'football/college-football', logo: 'ncaa', label: 'NCAA F', short: 'NCAA F', tag: 'NCAAF', noun: 'college football',
      sbParams: '&groups=80&limit=200', weekly: true, standingsMode: 'conferences', standingsGroup: 80, diffIsTotal: true, hasRankings: true, hasInjuries: false, hasTransactions: false,
      minutes: 60, periods: 4, sd: 17, hca: 3.0, b2b: 0, k: 20, eloPerPoint: 25,
      seasonStart: '2026-08-29', playoffLine: [], verb: 'kicks off', favs: [], home: null
    },
    mlb: {
      key: 'mlb', tuneAt: 300, sport: 'baseball', path: 'baseball/mlb', logo: 'mlb', label: 'MLB', short: 'MLB', tag: 'MLB', noun: 'MLB',
      sbParams: '', standingsMode: 'conference', diffIsTotal: true, hasRankings: false, hasInjuries: true, hasTransactions: true,
      minutes: 0, periods: 9, sd: 4.3, hca: 0.25, b2b: 0, k: 4, eloPerPoint: 65,
      seasonStart: '2026-03-26', playoffLine: [6], verb: 'starts', favs: [], home: null
    },
    ncaab: {
      key: 'ncaab', tuneAt: 300, sport: 'baseball', path: 'baseball/college-baseball', logo: 'ncaa', label: 'NCAA B', short: 'NCAA B', tag: 'NCAAB', noun: 'college baseball',
      sbParams: '&limit=300', standingsMode: 'conferences', standingsGroup: 26, diffIsTotal: true, hasRankings: true, hasInjuries: false, hasTransactions: false,
      minutes: 0, periods: 9, sd: 4.6, hca: 0.3, b2b: 0, k: 6, eloPerPoint: 60,
      seasonStart: '2027-02-12', playoffLine: [], verb: 'starts', favs: [], home: null, offseason: 'College baseball starts in mid-February.'
    }
  };
  const SPORTS = [
    { key: 'basketball', label: 'Basketball', leagues: ['nba', 'wnba', 'ncaam', 'ncaaw'] },
    { key: 'football', label: 'Football', leagues: ['nfl', 'ncaaf'] },
    { key: 'baseball', label: 'Baseball', leagues: ['mlb', 'ncaab'] }
  ];
  const ORDER = SPORTS.flatMap(s => s.leagues);
  // Push server (push/worker.js on Cloudflare). url stays empty until the worker is deployed; the site then falls back to in-app alerts.
  const PUSH = { url: '', key: 'BDUH0aH26afiBJtMQeD2pB3ktBXjdQ8YBENhlZ-7LuZVrpMoS9_EMhhcYV9ivNXZLG80AuyhT3a7ETH8c8AlJAU' };
  const ESPN = {
    site: 'https://site.api.espn.com/apis/site/v2/sports/',
    v2: 'https://site.api.espn.com/apis/v2/sports/',
    web: 'https://site.web.api.espn.com/apis/common/v3/sports/'
  };
  const out = { LEAGUES, SPORTS, ORDER, ESPN, PUSH, TZ: 'America/Chicago', SITE: 'Tipoff' };
  if (typeof module !== 'undefined' && module.exports) module.exports = out; else root.HW = Object.assign(root.HW || {}, out);
})(typeof globalThis !== 'undefined' ? globalThis : this);
