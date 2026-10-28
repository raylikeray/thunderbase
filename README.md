# Hardwood

Every basketball game in one place: NBA, WNBA, NCAA M and NCAA W. Live at **https://raylikeray.github.io/hardwood/**

- **Layout:** sections first (Scores, Standings, Rankings, Teams, Players, Forecasts, News, Record) with a league filter inside each. Scores is the home page; one featured game a day is picked by the model (closest call among the biggest games). No team is favored by default; viewers can star teams on any team page.
- **Live data:** ESPN's public site API, fetched in the browser. Scores refresh every 30 s while games are live.
- **Forecasts:** margin-based Elo per league, rebuilt nightly by `tools/nightly.mjs` (GitHub Action `nightly.yml`) into `data/<league>/ratings.json`; the browser adds home court, rest and an injury adjustment weighted by scoring (`js/core.js`). Every pregame call is scored against the result and ESPN's own pregame win probability in `data/<league>/record.json`, shown on the Record page.
- **AI reads:** `context.yml` builds `ai/context-<date>.json` (up to 15 featured games) at ~8:17 AM CT; a scheduled Claude task writes `ai/<date>.json` at ~9:13 AM CT.
- No build step. Edit `index.html`, `css/app.css`, `js/*.js` and push; bump the `?v=` on the asset links in `index.html` so browsers pick up changes.

## Design: Press Box
Warm white ground, hairline rules, ink type, gold only on actions, team color as a 4px tab beside a name. One dark block per page (the featured game or the page's hero). The hardwood survives as a 5px baseline under the header. Type: Archivo for everything, Barlow Condensed only for scores and big percentages. Dark mode is the same system on charcoal. All tokens are at the top of `css/app.css`.
