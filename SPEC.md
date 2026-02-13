# Hearth Codex — Hearthstone Collection Tracker

## Overview

A multi-user web application that tracks Hearthstone card collections with proper card renders, rich filtering, meta-aware craft/pack prioritization, a pack completion calculator with strategy comparison, and a card art caching proxy. Users authenticate via HSReplay session cookie; all user data is stored server-side with automatic cleanup after 90 days of inactivity.

## Architecture

### Stack
- **Frontend**: React 19 + Vite 6 (TypeScript), Tailwind CSS 4, Zustand 5 state management, Recharts 2 for charts
- **Backend**: Node.js 22 with Express 5 — API server for data fetching, caching, simulation, and serving the SPA
- **Storage**: Filesystem (`data/` folder) — shared data + per-user directories
- **Auth**: Token-based (64-char hex), no passwords — HSReplay sessionId as registration key

### Data Sources
| Data | Source | Refresh Strategy |
|------|--------|-----------------|
| Card database (names, stats) | HearthstoneJSON API (`api.hearthstonejson.com`) | Auto on startup if >24h stale |
| Card art (normal) | HearthstoneJSON CDN (`art.hearthstonejson.com`) | Proxied and cached server-side |
| Card art (golden/signature/diamond) | `hearthstone.wiki.gg` Premium1/2/3 images | Proxied and cached server-side |
| User collection | HSReplay API via saved session cookie + Cloudflare bypass | Manual trigger + server auto-sync every 12h for active users |
| Meta/usage stats (standard + wild) | HSReplay `card_list_free` endpoint | Auto on startup if >24h stale, manual refresh |

### Server Responsibilities
- Serve the React SPA (production build from `dist/`)
- Proxy HSReplay API calls via puppeteer-stealth Cloudflare bypass
- Serve card art as static files with CDN-ready cache headers
- Background prefetch all card art on startup
- Cache card DB + meta stats + art to filesystem (`data/`)
- Run Monte Carlo pack simulations (offloaded to server to avoid blocking UI)
- Manage per-user data (collection, snapshots, settings) with token auth
- Auto-sync collections every 12h for users active within 48h
- Purge inactive user data after 90 days of no activity
- Expose REST endpoints for the frontend

### API Endpoints

**Public (no auth required):**
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Server status and uptime |
| `/api/cards` | GET | Full card database |
| `/api/cards/refresh` | POST | Re-fetch card DB from HearthstoneJSON, clear art cache |
| `/api/expansions` | GET | Dynamic expansion list derived from card DB |
| `/api/meta` | GET | Card meta stats (standard + wild), auto-refreshes if >4h stale |
| `/api/meta/refresh` | POST | Force refresh meta stats |
| `/api/calculator` | POST | Run pack simulation with strategy comparison |
| `/api/data-status` | GET | Card DB age, meta age, CF clearance status |
| `/api/prefetch-status` | GET | Background prefetch progress |
| `/api/variant-availability` | GET | Lists cards confirmed missing signature/diamond variants |
| `/api/card-art/cache-stats` | GET | Per-variant cache statistics (cached/missed counts) |
| `/api/card-art/clear-cache` | POST | Clear all cached card art |
| `/api/cf/solve` | POST | Trigger Cloudflare challenge solve |
| `/api/cf/status` | GET | Cloudflare clearance status |
| `/art/{cardId}_{variant}.png` | GET | Static card art (express.static + fallback fetch) |

**Auth endpoints:**
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/register` | POST | Validate HSReplay sessionId, create/find user, return token |
| `/api/auth/me` | GET | Current user info (battletag, accountLo, region) |

**Authenticated (requires `X-User-Token` header):**
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/collection` | GET | User's collection data |
| `/api/collection/sync` | POST | Trigger HSReplay sync using user's stored session |
| `/api/snapshots` | GET | User's collection history snapshots |
| `/api/snapshots` | POST | Save a new collection snapshot (365 cap per user) |
| `/api/snapshots` | DELETE | Clear all user snapshots |
| `/api/settings` | GET/PUT | Per-user settings |

## Card Art System

Card art is served as static files at `/art/{cardId}_{variant}.png` via `express.static` with CDN-ready cache headers. A fallback handler fetches missing art on-demand from upstream sources.

### Art Sources
| Variant | Source | URL Pattern |
|---------|--------|-------------|
| `normal` | HearthstoneJSON | `art.hearthstonejson.com/v1/render/latest/enUS/256x/{id}.png` |
| `normal-lg` | HearthstoneJSON | `art.hearthstonejson.com/v1/render/latest/enUS/512x/{id}.png` |
| `golden` | wiki.gg | `hearthstone.wiki.gg/images/{id}_Premium1.png` |
| `diamond` | wiki.gg | `hearthstone.wiki.gg/images/{id}_Premium2.png` |
| `signature` | wiki.gg | `hearthstone.wiki.gg/images/{id}_Premium3.png` |

### Static Serving
- `express.static(data/card-art-cache/)` at `/art/` with `Cache-Control: public, max-age=604800, immutable`
- Fallback route `/art/:filename` parses `{cardId}_{variant}.png`, fetches from upstream on cache miss
- Frontend requests art at `/art/{cardId}_{variant}.png` (no API proxy overhead)

### Caching
- All art cached in `data/card-art-cache/` as `{cardId}_{variant}.png`
- Confirmed 404s recorded as `.miss` files (prevents re-fetching known-missing variants)
- `.miss` files only created on confirmed 404 (not rate limits or timeouts)
- Deduplication: concurrent requests for the same art share a single fetch promise

### Background Prefetcher
Runs on server startup after card DB loads. Prefetches ALL cards in ALL 4 variants:
- **Normal**: 10 concurrent workers, 50ms delay (HearthstoneJSON)
- **Golden/Signature/Diamond**: 5 concurrent workers, 200ms delay (wiki.gg)
- Rate limit handling: 429 responses trigger pause using Retry-After header (default 30s)
- Already-cached or already-missed files are skipped
- Progress exposed via `/api/prefetch-status`, displayed in frontend PrefetchBanner

### Variant Availability
wiki.gg coverage is inconsistent for Premium2 (diamond) and Premium3 (signature). The system determines actual variant availability by checking for `.miss` files in the art cache:
- `/api/variant-availability` scans for `*_signature.miss` and `*_diamond.miss` files
- Frontend stores missing variant sets in `variantMissing` state
- Cards with confirmed-missing variants are excluded from signature/diamond collection modes
- Cards not yet checked (no cache hit or miss) are shown optimistically

### Background Retries
When art fetch fails with non-404 status (rate limits, timeouts), background retries are scheduled with exponential backoff (up to 5 attempts). 429s respect the Retry-After header.

## Collection Modes

The app supports 4 collection tracking modes, toggled globally via `CollectionModeToggle`:

| Mode | What Counts as "Owned" | Image Shown | Visible Cards |
|------|----------------------|-------------|---------------|
| **Normal** | normal + golden + diamond + signature | Best owned variant (diamond > sig > golden > normal) | All cards |
| **Golden** | golden + diamond + signature | Golden variant | All cards |
| **Signature** | signature + diamond (only if variant exists) | Signature variant | Cards from yearNum >= 2022 with confirmed sig art |
| **Diamond** | diamond only (only if variant exists) | Diamond variant | Legendaries with confirmed diamond art |

Cards without a variant in the selected mode show the normal art (greyed out if unowned). In signature/diamond modes, cards without the variant are auto-marked as "complete" to avoid polluting the collection view.

## Views & Navigation

Persistent **sidebar** navigation with 8 views. Sidebar shows per-expansion completion bars (dust-weighted) with per-rarity breakdown tooltips.

### 1. Collection View (default `/`)

Card grid showing every collectible card with ownership overlay.

**Card Tiles:**
- Card renders from server art proxy
- Unowned cards displayed greyscale/dimmed
- Default grouping by rarity (Legendary > Epic > Rare > Common), then mana cost, then name
- Client-side 1.5s timeout with fallback to normal art and background probe retries at 10s, 30s

**Filter Bar:**
| Filter | Type | Options |
|--------|------|---------|
| Set/Expansion | Dropdown (multi-select) | All expansions |
| Class | Class picker with WoW-style icons | 11 classes + Neutral |
| Rarity | Toggle chips with gem icons | Common, Rare, Epic, Legendary |
| Ownership | Toggle chips | All, Owned, Incomplete |
| Format | Toggle with HS icons | Standard / Wild |
| Text Search | Input | Searches card name + text |
| Sort | Dropdown | Name, Cost, Rarity, Set, Inclusion Rate, Winrate |

**Card Interactions:**
- Hover: enlarged card render + stats tooltip (inclusion rate, winrate, dust cost)
- Click: detail modal with full card info, meta stats, ownership counts, art variant toggle buttons

### 2. Cost Calculator (`/calculator`)

Estimates packs/gold/dollars needed to complete collection for selected expansions.

**Controls:**
- Mode selector: Standard / All (Wild) / Custom
- Custom mode: checkbox grid for individual expansion selection
- Current dust input (auto-filled from collection sync)
- Calculate button runs Monte Carlo simulation (200 runs)

**Results:**
- Per-expansion breakdown table: avg packs, median, best-worst range, 25th-75th percentile
- Strategy Comparison table comparing 3 approaches:
  1. **Per-set packs** (100 gold each): buy expansion-specific packs
  2. **Standard/Wild packs** (100 gold each): random expansion per pack, simulated via `simulateMultiExpansion()`
  3. **Golden packs + craft** (400 gold each): buy golden packs, disenchant all, craft missing normals analytically
- Each strategy shows: packs needed, total gold, USD estimate ($0.01167/gold)
- Best strategy highlighted with savings percentage vs worst
- Bar chart of packs per expansion
- Debug toggle for intermediate simulation values

**Simulation Engine:**
- Pity timer tracking: legendary hard cap 40, epic hard cap 10, soft pity quadratic escalation
- First-10 legendary guarantee for new expansions
- Duplicate protection matching real game mechanics
- Multi-expansion simulation: random expansion selection per pack, per-expansion pity timers, shared dust pool with cross-expansion crafting
- Golden pack analysis: analytical calculation (~434 dust/pack conservative floor)

### 3. Craft Advisor (`/craft`)

Ranked list of all missing cards sorted by meta impact.

**Features:**
- Same filter bar as Collection View (set, class, rarity, format, search)
- Sortable columns: card name, rarity, dust cost, set, class, inclusion rate, winrate
- Winrate only shown for cards with 100+ games played
- Golden art hover preview
- Mode-aware: respects current collection mode for "missing" calculation

### 4. Pack Advisor (`/packs`)

Per-expansion pack value analysis using meta stats to prioritize which packs to buy.

**Features:**
- Per-expansion breakdown: cards missing, meta-relevant missing, pull chances per rarity
- Column sorting
- Rarity gem icons
- Dust-per-pack estimates
- Class and rarity filters
- Mode-aware ownership calculation

### 6. Collection History (`/history`)

Timeline chart of collection completion over time. Snapshots saved server-side per user (365 max).

- Dust-weighted completion percentage per snapshot
- Recharts line chart visualization
- Clear history button (deletes all snapshots)
- Snapshots auto-saved on each collection sync

### 7. Disenchant Advisor (`/disenchant`)

Identifies safe-to-disenchant extras, accounting for free/uncraftable cards.

### 8. Settings (`/settings`)

**Account:**
- Logged-in battletag display
- Update HSReplay session (for expired cookies)
- Logout button

**Card Database:**
- Refresh from HearthstoneJSON (also clears art cache)

**Meta Stats:**
- Manual refresh with auto-refresh every 4 hours

**Card Art Cache:**
- Per-variant breakdown (normal/golden/signature/diamond) showing cached and missed counts
- Clear cache button

**Cloudflare Clearance:**
- Status indicator (active/expired with expiry time)
- Manual solve button

## Dynamic Expansion System

Expansions are derived dynamically from the card database — no hardcoded card counts.

- `EXPANSION_METADATA` map provides display names and year info (cosmetic only)
- `EXCLUDED_SETS`: 15 non-pack sets excluded (CORE, VANILLA, LEGACY, etc.)
- `deriveExpansionsFromDb()`: counts cards per rarity from API data
- `applyStandardRotation()`: 2 most recent yearNums = Standard
- New expansions auto-detected after "Refresh Card Database"

## Multi-User System

### Authentication
- HSReplay `sessionid` cookie serves as registration key (no passwords)
- Server validates by calling HSReplay account API, extracts Blizzard `account_lo` as user identity
- Server issues a long-lived token (64-char hex via `crypto.randomBytes(32)`)
- Client stores token in `localStorage`, sends `X-User-Token` header on every request
- On 401 response (except `/auth/*` endpoints): client clears token and reloads → onboarding

### Onboarding
First-time visitors see a mandatory full-screen modal (no close button):
1. Explains HSReplay.net account requirement and Hearthstone Deck Tracker
2. Step-by-step instructions for getting sessionId from browser DevTools
3. Paste input + "Connect" button
4. On success: stores token + accountLo in localStorage, loads app
5. On failure: shows server error message inline

### Per-User Data
```
data/users/{account_lo}/
  token.json          # { token, accountLo, battletag, region, sessionId, createdAt, lastSeenAt }
  collection.json     # HSReplay collection data
  snapshots.json      # Collection history (365 cap)
  settings.json       # User preferences
```

### Data Lifecycle
- **`lastSeenAt`** updated on every authenticated API request
- **Auto-sync**: Server syncs collections every 12h for users active within the last 48h
- **Auto-purge**: On startup, users with no activity for 90 days have their entire directory deleted (including collection, snapshots, settings, and token)
- **Snapshots cap**: Maximum 365 snapshots per user; oldest deleted when limit exceeded

### Session Management
- Users can update expired HSReplay sessions via Settings → "Update Session"
- Logout clears client token and reloads (server data preserved until 90-day purge)

## HSReplay Integration

### Collection Sync
- User provides `sessionid` during registration (validated server-side)
- Server stores sessionId in user's `token.json`, uses it for all subsequent syncs
- Server fetches `/api/v1/account/` to get Blizzard account params, then `/api/v1/collection/`
- Collection format: `{ collection: { dbfId: [normal, golden, diamond, sig] }, dust: N }`
- Auto-sync: server-side every 12h for active users (active = any API request within 48h)

### Meta Stats
- Fetches `card_list_free` endpoint for RANKED_STANDARD and RANKED_WILD
- Polls for 202 (query processing) up to 12 times with 10s delay
- Stores per-card: popularity (inclusion rate), winrate, decks played, dominant class

### Cloudflare Bypass
- Uses puppeteer-stealth to solve Cloudflare challenges
- Browser instance idles with 5-minute timeout
- All HSReplay requests proxied through the browser context
- Status tracked and exposed via API

## Data Models

### CardDbEntry
```typescript
interface CardDbEntry {
  id: string;        // e.g. "CS2_029"
  set: string;       // e.g. "TIME_TRAVEL"
  rarity: 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
  name: string;
  type: string;      // MINION, SPELL, WEAPON, HERO, LOCATION
  cardClass: string; // e.g. "MAGE"
  cost: number;
  attack?: number;
  health?: number;
  text?: string;
}
```

### CollectionData
```typescript
interface CollectionData {
  collection: Record<string, number[]>; // dbfId -> [normal, golden, diamond, signature]
  dust?: number;
  gold?: number;
  syncedAt?: number | null;
}
```

### EnrichedCard (frontend)
```typescript
interface EnrichedCard extends CardDbEntry {
  dbfId: string;
  normalCount: number;
  goldenCount: number;
  diamondCount: number;
  signatureCount: number;
  totalOwned: number;    // mode-aware ownership count
  maxCopies: number;     // 1 for legendary, 2 otherwise
  imageUrl: string;      // /art/{id}_{variant}.png
  inclusionRate: number;
  winrate: number;
  decks: number;
}
```

### ComparisonResult (calculator)
```typescript
interface ComparisonResult {
  perSetTotal: number;           // sum of per-set simulation means
  multiPackStats: SimStats;      // Standard/Wild pack simulation stats
  goldenAnalysis: {
    avgDustPerPack: number;      // ~434 dust conservative
    packsToComplete: number;     // totalCraftCost / avgDustPerPack
    totalCraftCost: number;      // dust needed to craft all missing
  };
}
```

## UI Design

- **Dark theme**, Hearthstone-inspired palette:
  - Background: deep navy (#0a0a14)
  - Accents: warm gold (#d4a843), mana blue (#4fc3f7)
  - Rarity colors: grey (common), blue (rare), purple (epic), orange (legendary)
- **Desktop-first** — optimized for 1920x1080+
- Card grid uses CSS Grid with responsive columns
- Filter bar is compact, horizontal, sticky
- Sidebar: narrow with Hearthstone-style icons, per-expansion completion bars
- Banners: error (red), sync warning (amber), prefetch progress (blue)
- Toast notifications for sync success/failure

## File Structure
```
hearthstone/
├── package.json
├── vite.config.ts
├── index.html                 # SPA entry with SEO meta tags
├── public/favicon.svg         # SVG favicon (gold hexagonal gem)
├── SPEC.md
├── data/                      # Persistent storage (git-ignored)
│   ├── card-db.json           # HearthstoneJSON card database (shared)
│   ├── meta-stats.json        # Standard + Wild meta stats (shared)
│   ├── card-art-cache/        # Cached card art (shared, png + miss files)
│   └── users/                 # Per-user data directories
│       └── {account_lo}/
│           ├── token.json     # Auth token + HSReplay session
│           ├── collection.json
│           ├── snapshots.json # Collection history (365 cap)
│           └── settings.json
├── server/
│   ├── index.ts               # Express server, API routes, art serving, prefetcher, auto-sync
│   ├── auth.ts                # Token generation, user management, 90-day purge
│   ├── data.ts                # Card data, expansions, collection parsing
│   ├── simulator.ts           # Monte Carlo pack simulation + strategy comparison
│   └── cloudflare.ts          # Puppeteer-stealth CF bypass + browser-based fetch
├── src/
│   ├── main.tsx               # Entry point
│   ├── App.tsx                # Root component + auth gate + routing
│   ├── types.ts               # Shared TypeScript types
│   ├── components/
│   │   ├── Layout.tsx         # Shell with banners (error, sync, prefetch, toast)
│   │   ├── Sidebar.tsx        # Navigation + completion bars
│   │   ├── OnboardingPopup.tsx# Mandatory auth modal for first-time visitors
│   │   ├── CardGrid.tsx       # Responsive card grid
│   │   ├── CardTile.tsx       # Individual card with fallback/retry logic
│   │   ├── CardHover.tsx      # Enlarged hover preview
│   │   ├── CardModal.tsx      # Detail modal with art variant toggles
│   │   ├── FilterBar.tsx      # Filter controls
│   │   ├── ClassPicker.tsx    # WoW-style class icons
│   │   ├── RarityFilter.tsx   # Rarity gem toggle chips
│   │   ├── CollectionModeToggle.tsx  # N/G/S/D mode toggle
│   │   └── Icons.tsx          # Dust, gold, pack SVG icons
│   ├── views/
│   │   ├── CollectionView.tsx
│   │   ├── CalculatorView.tsx # Cost Calculator with strategy comparison
│   │   ├── CraftAdvisorView.tsx
│   │   ├── PackAdvisorView.tsx
│   │   ├── DisenchantAdvisorView.tsx
│   │   ├── HistoryView.tsx    # Collection history timeline
│   │   └── SettingsView.tsx
│   ├── stores/
│   │   └── store.ts           # Zustand store (state, actions, enrichment, filtering)
│   ├── hooks/
│   │   └── useCollectionSnapshots.ts  # Server-side snapshot management
│   ├── utils/
│   │   ├── searchParser.ts    # Hearthstone keyword search parser
│   │   └── localStorageMigration.ts   # Per-user localStorage key migration
│   └── services/
│       └── api.ts             # API client with token auth
└── cli/                       # Original CLI calculator (preserved)
```

## Non-Goals
- **No deck builder** — data layer supports future addition
- **No mobile-optimized layouts** — desktop-first
- **No real-time Hearthstone game integration** — collection sync is manual/server-scheduled
