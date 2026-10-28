# Tipoff push server

One Cloudflare Worker (free plan) that watches the subscribed teams' games once a minute and sends Web Push
notifications: pregame, score updates that replace themselves on the lock screen, close games, finals, injury-report
changes and transactions. `worker.js` has no dependencies; the VAPID signing and payload encryption are done with WebCrypto.

## Setup (about five minutes, all in the Cloudflare dashboard)

1. **Account.** cloudflare.com → Sign up (free). No domain needed.
2. **Worker.** Workers & Pages → Create → Create Worker → name it `tipoff-push` → Deploy. Then Edit code: delete the sample,
   paste the whole of `push/worker.js`, Deploy.
3. **KV.** Storage & Databases → KV → Create namespace → name `tipoff`. Back in the worker: Settings → Bindings → Add → KV namespace →
   variable name `KV`, namespace `tipoff`.
4. **Variables.** Worker → Settings → Variables and Secrets → add:
   - `VAPID_PUBLIC` = the public key in `js/config.js` (`PUSH.key`)
   - `VAPID_PRIVATE_JWK` = the private key JSON (sent separately; mark it as a Secret)
   - `VAPID_SUBJECT` = `mailto:your@email`
   - `ALLOWED_ORIGINS` = `https://raylikeray.github.io`
   - `SELF_URL` = the worker's own URL, e.g. `https://tipoff-push.<your-subdomain>.workers.dev`
   - `CRON_TOKEN` = any random word
5. **Cron.** Worker → Settings → Triggers → Cron Triggers → Add → `* * * * *` (every minute).
6. **Tell the site.** Put the worker URL into `js/config.js` → `PUSH.url`. Visitors who turn on updates are then registered
   with the server and get pushes even with Tipoff closed (iPhone: from the home-screen app).

## Free-plan budget
Every minute the cron fans out one request per league that has subscribers (so each stays inside the 10 ms CPU limit).
KV writes happen only when something is sent or changes, well under the 1,000/day free limit for a group of friends.

## Endpoints
- `GET /health` → `{ ok, publicKey }`
- `POST /subscribe` `{ sub, teams: ["nba:25", "ncaam:150"], prefs: { pre, close, final, inj, moves, score: "quarters|often|off" } }`
- `POST /unsubscribe` `{ endpoint }`
- `POST /test` `{ endpoint }` → sends a test notification
