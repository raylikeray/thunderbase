# ThunderBase

Ray's NBA home base, built around the Thunder. Live at **https://raylikeray.github.io/thunderbase/**

- **Live data:** ESPN's public site API, fetched in the browser. Scores refresh every 30 s while games are live.
- **Forecasts:** rating model in `js/app.js` (point margin blended with last season, +2.4 home court, −1.8 back-to-back, last-10 form; live games update from score and time left).
- **AI reads:** `.github/workflows/slate-context.yml` writes `ai/context-<date>.json` at ~8:17 AM CT; a scheduled Claude task writes `ai/<date>.json` at 9:13 AM CT.
- No build step. Edit `index.html`, `css/app.css`, `js/app.js` and push; bump the `?v=` on the asset links in `index.html` so browsers pick up changes.

## Design: Home Court
The floor is the interface. Maple stripe ground with grain, court-line white rules, the Thunder feature block as the painted key (#007AC1) with a navy (#002D62) forecast band, decal gold (#FDBB30) for emphasis, baseline orange (#EF3B24) under the header. Tables sit on white scorer's-table sheets (navy sheets on a stained floor in dark mode). Type: Anton for scores and headings, Archivo for everything read. All colors are tokens at the top of `css/app.css`.
