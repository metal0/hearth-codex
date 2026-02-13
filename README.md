# Hearth Codex

Track your Hearthstone collection, calculate pack costs, and optimize your crafting strategy.

**Hosted version available at [codex.i0.tf](https://codex.i0.tf)**

## Features

- **Collection Browser** — View your entire collection with card art across all variants (normal, golden, signature, diamond). Filter by expansion, rarity, mana cost, class, and ownership. Hearthstone-style search syntax (`attack:5`, `health:3`, `mana:7`).
- **Pack Cost Calculator** — Monte Carlo simulation of pack openings with accurate pity timers, duplicate protection, and golden/signature pack modeling. Runs entirely in-browser via WebWorker.
- **Craft Advisor** — Prioritized crafting suggestions based on competitive meta data from HSReplay. Integrated crafting queue with dust cost tracking.
- **Pack Advisor** — Compare packs across expansions to find the best value per gold spent based on your collection gaps and meta relevance.
- **Disenchant Advisor** — Identifies safe-to-dust extras accounting for free/uncraftable cards, with dust value breakdown by rarity.
- **Collection History** — Track collection progress over time with snapshot diffs and charts.
- **HSReplay Sync** — Import your collection from HSReplay.net via session cookie. Server-side proxy handles Cloudflare protection.
- **Card Art Proxy** — Server caches card art from HearthstoneJSON and wiki.gg with background prefetching and retry logic.

## Deploy

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/template/TEMPLATE?referralCode=CODE)

Or run with Docker:

```bash
docker build -t hearth-codex .
docker run -p 4000:4000 hearth-codex
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4000` | Server port |
| `NODE_ENV` | — | Set to `production` for production mode |
| `DISABLE_ART_PREFETCH` | — | Set to `true` to skip background art prefetching |

### Persistent Storage

Card data and art cache are stored in `data/`. On Railway, attach a volume at `/app/data` to persist the cache across deploys. Without a volume the cache rebuilds on demand.

## Self-Hosting Locally

### Prerequisites

- [Node.js 22](https://nodejs.org/) or newer
- [Google Chrome](https://www.google.com/chrome/) or Chromium (used for HSReplay sync)

### Setup

```bash
git clone https://github.com/metal0/hearth-codex.git
cd hearth-codex
npm install
```

### Run (Development)

```bash
npm run dev
```

Opens the app at `http://localhost:5173` with hot reload. The Express API runs on port 4000.

### Run (Production)

```bash
npm run build
npm run preview
```

Serves the app at `http://localhost:4000`. Everything in one process — no separate frontend server needed.

## Connecting HSReplay

1. Open [hsreplay.net](https://hsreplay.net) and log in
2. Open DevTools (`F12`) → Application → Cookies → `hsreplay.net`
3. Copy the `sessionid` cookie value
4. In Hearth Codex, go to **Settings** → paste the session ID → **Save**
5. Click **Sync Collection**

Your session cookie is stored locally in your browser and never sent to any third party. No HSReplay premium required.

## Tech Stack

React 19, Vite 6, Express 5, Tailwind CSS 4, Zustand 5, Recharts 2, TypeScript 5, Puppeteer (Cloudflare bypass)

## License

MIT

---

Not affiliated with or endorsed by Blizzard Entertainment. Hearthstone is a trademark of Blizzard Entertainment.
