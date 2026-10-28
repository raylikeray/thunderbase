# Hardwood

Everything basketball, live: NBA, WNBA, men's and women's D1. Built around Ray's teams. Live at **https://raylikeray.github.io/hardwood/**

- **Live data:** ESPN's public site API, fetched in the browser. Scores refresh every 30 s while games are live.
- **Forecasts:** margin-based Elo per league, rebuilt nightly by `tools/nightly.mjs` (GitHub Action `nightly.yml`) into `data/<league>/ratings.json`; the browser adds home court, rest and a star-out adjustment (`js/core.js`). Every pregame call is scored against the result and ESPN's BPI in `data/<league>/record.json`, shown on the Record page.
- **AI reads:** `context.yml` builds `ai/context-<date>.json` (up to 15 featured games) at ~8:17 AM CT; a scheduled Claude task writes `ai/<date>.json` at ~9:13 AM CT.
- **Favorites:** defaults in `js/config.js`; viewers can star teams on any team page (stored in their browser).
- No build step. Edit `index.html`, `css/app.css`, `js/*.js` and push; bump the `?v=` on the asset links in `index.html` so browsers pick up changes.

## Design: Home Court
The floor is the interface. Maple stripe ground with grain, court-line white rules, the featured block as the painted key (#007AC1 for the Thunder, the favorite team's color elsewhere) with a navy (#002D62) forecast band, decal gold (#FDBB30) for emphasis, baseline orange (#EF3B24) under the header. Tables sit on white scorer's-table sheets (navy sheets on a stained floor in dark mode). Type: Anton for scores and headings, Archivo for everything read. All colors are tokens at the top of `css/app.css`.
