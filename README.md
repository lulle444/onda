# Basewatch

Live at https://usebasewatch.vercel.app (Telegram alerts: @useBasewatchBot). The old address onda-plum.vercel.app still serves the same site.

Yield comparison for stablecoins, ETH and everything else on Base.

- Static pages, no build step: `index.html` (home), `yields.html`, `calculator.html`, `new.html`, `risk.html`, `learn.html`, `about.html`, sharing `styles.css`, `app.js`, `chart.js` (the SVG line chart) and `tide.js`. `vercel.json` turns on clean URLs (`/yields`, `/calculator`, ...).
- Data is fetched live in the browser from DefiLlama: `yields.llama.fi/pools` (filtered to `chain == "Base"`) and `api.llama.fi/protocols` (audits, protocol age).
- If data can't be loaded, clearly labelled sample data is shown instead.

Data: `api/pools.js` is a Vercel function that fetches DefiLlama, keeps only Base pools above $25k TVL and caches the result at the CDN for 10 minutes. The page calls `/api/pools` first and falls back to DefiLlama directly, then to sample data.

Pool history: tapping a pool's asset opens its APY chart. `api/pool-history.js` proxies DefiLlama's daily `yields.llama.fi/chart/<pool>` (cached for an hour); the page falls back to DefiLlama directly.

Pool pages: `/pool/<symbol>-<protocol>-<first 8 of the DefiLlama id>` (links from the table's history panel and the home page's top list). `vercel.json` rewrites them to `api/pool-page.js`, which serves `pool.html` with that pool's title, description and share image (`/api/og?p=pool&id=…`) filled in; `app.js` renders the page when `<body data-page="pool">`.

Risk breakdown: `score()` in `app.js` also returns each part of the sum. Clicking a risk badge opens it in a dialog; pool pages show it inline.

Watchlist: the ☆ on each pool saves its id in `localStorage` (`bw-watchlist`), so it's per browser with no account. `/yields?kind=watch` (the "★ Watchlist" chip) shows every starred pool regardless of the other filters.

Compare: `compare.html` (`<body data-page="compare">`) puts up to three pools side by side: APY, 30-day average, 7-day change, share paid in reward tokens, TVL, impermanent loss and every part of the risk score, with the best value per row highlighted and their APY history in one chart (only days all of them have data, so the tooltip compares like with like). The selection lives in the URL as `/compare/<id8>,<id8>,<id8>` (old `?p=` links still work). `vercel.json` rewrites those to `api/compare-page.js`, which fills in the title, description and a side-by-side share image (`/api/og?p=compare&ids=…`) so shared comparisons preview on X. `lib/page.js` holds the tag-filling both page functions use. Pool pages link to it with "Compare", and the watchlist with "Compare starred".

Token page: `token.html` + `token.js`. Everything about a token lives in `window.BW_TOKEN` at the top of `token.js`. While `address` is empty the page says the token is coming soon and that only this page will carry the address (so look-alikes can't borrow the name). At launch, fill in the address, ticker, launchpad, date and every team wallet, then commit, and the page shows the official contract, Basescan link and holdings. The commitments on the page (no effect on rankings, no promises, holdings disclosed) apply either way.

New on the chain: `new.html` (rendered by `app.js` when `<body data-page="new">`) lists pools first seen in the last 7/30/90 days and the protocols they belong to. `api/new.js` returns each pool's first-seen date: the first day in DefiLlama's history for that pool, looked up once and kept in Redis (`tw:firstseen`).

Weekly recap: `api/weekly.js` (text built in `lib/weekly.js`) previews this week's X-sized recap on GET. On Mondays the `weekly.yml` workflow (plus a Vercel cron as backup) calls it with `?send=1`, and it sends once per ISO week to chats that turned on `/weekly`, with a "Post on X" button that opens X's composer with the text.

Alerts: a Telegram bot. `api/telegram.js` is its webhook, `api/check-alerts.js` compares live APYs with saved alerts (run every 15 minutes by `.github/workflows/alerts.yml`, daily by Vercel cron as a backup) and `api/telegram-setup.js` registers the webhook once. Needs Upstash Redis connected in Vercel and a `TELEGRAM_BOT_TOKEN` env var; set `TG_BOT` in `app.js` to show the bell buttons.

Run locally: `npx serve .` (pages use absolute paths, so opening the files directly won't load styles).

Brand assets live in `assets/` (logo, favicon, share image) and `assets/brand/` (imagery, WebP).

Sharing and search: `api/og.js` draws each main page's share preview (1200×630 PNG via `@vercel/og`) with live numbers, e.g. `/api/og?p=new`; pages point `og:image` at it (other pages keep `assets/og.jpg`). `sitemap.xml` and `robots.txt` list the pages for search engines.

## Renaming this copy

Everything that names the site lives in `brand.json`: name, wordmark, address, X account, Telegram bot and the
database key prefix. Change it, then run `python3 rebrand.py` (needs Pillow for the two pictures with the name in them)
and commit. The copy refuses to run with @Usetidewatch_bot or Tidewatch's `tw` key prefix, and `/api/telegram-setup`
refuses any bot token that isn't the one named in `brand.json`.
