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
| `/api/data-status` | GET | Card DB age, meta age, CF clearance status, art version |
| `/api/prefetch-status` | GET | Background prefetch progress |
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
- `express.static(data/card-art-cache/)` at `/art/` with `Cache-Control: public, max-age=31536000, immutable` (1 year)
- Fallback route `/art/:filename` parses `{cardId}_{variant}.png`, fetches from upstream on cache miss
- Frontend requests art at `/art/{cardId}_{variant}.png?v={artVersion}` (version param for cache busting)

### Art Version Cache-Busting
Server maintains an `artVersion` counter in `data/art-version.txt` (starts at 1). All client-side art URLs include `?v={artVersion}` as a query parameter.

- **200 responses**: `Cache-Control: public, max-age=31536000, immutable` — cached permanently by browsers and CDNs
- **404 (confirmed `.miss`)**: `Cache-Control: no-cache` — re-checked each time
- **404 (fetch failed)**: `Cache-Control: no-store` — never cached
- **Version bump triggers**: art cache clear (`/api/card-art/clear-cache`), card DB refresh with changes (`/api/cards/refresh`)
- **Client propagation**: `artVersion` returned in `/api/data-status`, `/api/cards/refresh`, and `/api/card-art/clear-cache` responses; stored in Zustand state; threaded into all art URL construction (store enrichment, CardTile, CardHover, CardModal)
- **Cloudflare CDN**: works out of the box when Caching Level is "Standard" (default) — query strings are part of the cache key

### Caching
- All art cached in `data/card-art-cache/` as `{cardId}_{variant}.png`
- Confirmed 404s recorded as `.miss` files (prevents re-fetching known-missing variants)
- `.miss` files only created on confirmed 404 (not rate limits or timeouts)
- Deduplication: concurrent requests for the same art share a single fetch promise

### Background Prefetcher
Runs on server startup after card DB loads. Uses DB-driven `hasSignature`/`hasDiamond` flags to skip cards without variants. Prefetches in priority order:

**Phase 1 — Owned cards** (prioritize what user actually has):
1. `owned-normal` — HearthstoneJSON, 10 workers, 50ms
2. `owned-diamond` — wiki.gg, hasDiamond + owned diamond
3. `owned-signature` — wiki.gg, hasSignature + owned signature
4. `owned-golden` — wiki.gg, all owned cards

**Phase 2 — All normals:**
5. `unowned-normal` — HearthstoneJSON, 10 workers, 50ms

**Phase 3 — All premium (not golden):**
6. `all-diamond` — wiki.gg, hasDiamond (skips cached)
7. `all-signature` — wiki.gg, hasSignature (skips cached)

**Phase 4 — Golden LAST:**
8. `all-golden` — wiki.gg, all cards (skips cached)

- Rate limit handling: 429 responses trigger pause using Retry-After header (default 30s)
- Already-cached or already-missed files are skipped
- Progress exposed via `/api/prefetch-status`, displayed in frontend PrefetchBanner

### Variant Availability (DB-Driven)
Variant availability is determined by `hasSignature` and `hasDiamond` boolean fields in `CardDbEntry`, populated from HearthstoneJSON data:
- `hasSignature`: derived from `HAS_SIGNATURE_QUALITY` tag (enumID 2589) in CardDefs.xml (~299 collectible cards)
- `hasDiamond`: derived from `hasDiamondSkin` field in JSON API (~102 cards)
- Cards without these flags are excluded from signature/diamond collection modes
- Fields flow through `EnrichedCard` for UI consumption

### Background Retries
When art fetch fails with non-404 status (rate limits, timeouts), background retries are scheduled with exponential backoff (up to 5 attempts). 429s respect the Retry-After header.

## Collection Modes

The app supports 4 collection tracking modes, toggled globally via `CollectionModeToggle`:

| Mode | What Counts as "Owned" | Image Shown | Visible Cards |
|------|----------------------|-------------|---------------|
| **Normal** | normal + golden + diamond + signature | Best owned variant (diamond > sig > golden > normal) | All cards |
| **Golden** | golden + diamond + signature | Golden variant | All cards |
| **Signature** | signature + diamond (only if `hasSignature` or owned) | Signature variant | Cards with `hasSignature` flag or existing signature count |
| **Diamond** | diamond only (only if `hasDiamond` or owned) | Diamond variant | Cards with `hasDiamond` flag or existing diamond count |

Cards without a variant in the selected mode show the normal art (greyed out if unowned). In signature/diamond modes, cards without the variant are auto-marked as "complete" to avoid polluting the collection view.

### Obtainability Filter
In signature and diamond modes, an additional filter appears: **All / Obtainable / Unobtainable**. This filters cards based on their acquisition method's `obtainable` flag from the variant acquisition system (see below). Resets to "All" when switching to normal or golden mode.

## Views & Navigation

Persistent **sidebar** navigation with 8 views. Sidebar shows Standard + Wild completion bars with per-rarity breakdown tooltips. Four bar modes cycle on click: **Normal** (dust-weighted), **Golden** (golden craft cost weighted), **Signature** (copy counts), **Meta** (weighted by `craftCost × max(played%, 0.1% baseline)` using meta stats — prioritizes meta-relevant cards over unplayed ones).

### 1. Collection View (default `/`)

Card grid showing every collectible card with ownership overlay.

**Card Tiles:**
- Card renders from server art proxy
- Unowned cards displayed greyscale/dimmed
- Partial ownership badge (yellow): shows `X/Y` count (e.g. "1/2")
- Excess copies badge (green): shows total count when more than max copies owned (e.g. "5")
- Default grouping by rarity (Legendary > Epic > Rare > Common), then mana cost, then name
- Client-side 1.5s timeout with fallback to normal art and background probe retries at 10s, 30s

**Filter Bar:**
| Filter | Type | Options |
|--------|------|---------|
| Set/Expansion | Dropdown (multi-select) | All expansions |
| Class | Class picker with WoW-style icons | 11 classes + Neutral |
| Rarity | Toggle chips with gem icons | Common, Rare, Epic, Legendary |
| Ownership | Toggle chips | All, Owned, Incomplete |
| Obtainability | Toggle chips (sig/diamond modes only) | All, Obtainable, Unobtainable |
| Format | Toggle with HS icons | Standard / Wild |
| Text Search | Input with clear button | Searches card name + text (X button appears when text entered) |
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
  id: string;          // e.g. "CS2_029"
  set: string;         // e.g. "TIME_TRAVEL"
  rarity: 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
  name: string;
  type: string;        // MINION, SPELL, WEAPON, HERO, LOCATION
  cardClass: string;   // e.g. "MAGE"
  cost: number;
  attack?: number;
  health?: number;
  text?: string;
  freeNormal: boolean;   // true if normal version is free (from howToEarn)
  freeGolden: boolean;   // true if golden version is free (from howToEarnGolden)
  hasSignature: boolean; // true if card has a signature variant (from HAS_SIGNATURE_QUALITY)
  hasDiamond: boolean;   // true if card has a diamond variant (from hasDiamondSkin)
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
  imageUrl: string;      // /art/{id}_{variant}.png?v={artVersion}
  inclusionRate: number;
  winrate: number;
  decks: number;
  freeNormal: boolean;
  freeGolden: boolean;
  hasSignature: boolean;
  hasDiamond: boolean;
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
│   ├── art-version.txt        # Art cache-busting version counter
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
│   │   ├── useCollectionSnapshots.ts  # Server-side snapshot management
│   │   └── useRotationInfo.ts         # Shared rotation date/sets hook
│   ├── utils/
│   │   ├── searchParser.ts    # Hearthstone keyword search parser
│   │   └── localStorageMigration.ts   # Per-user localStorage key migration
│   └── services/
│       └── api.ts             # API client with token auth
└── cli/                       # Original CLI calculator (preserved)
```

## Variant Acquisition System

Hardcoded maps in `src/types.ts` track how each diamond and signature card is obtained. This enables rich tooltips in CardModal, obtainability filtering, and achievement progress tracking.

### Diamond Acquisition

`DIAMOND_ACQUISITION: Record<string, DiamondAcquisitionInfo>` maps ~86 diamond card IDs to:

```typescript
interface DiamondAcquisitionInfo {
  method: 'achievement' | 'miniset' | 'tavern-pass' | 'preorder' | 'shop' | 'darkmoon' | 'event' | 'unknown';
  description: string;        // Human-readable source (e.g. "Whizbang's Workshop Tavern Pass")
  obtainable: boolean;        // Can still be obtained today?
  achievementSet?: string;    // For 'achievement': set code whose legendaries must be collected
}
```

| Method | Count | Obtainable | Example |
|--------|-------|------------|---------|
| `achievement` | 10 | Yes | Collect all legendaries from a set (e.g. EX1_298 Ragnaros → EXPERT1) |
| `miniset` | 10 | Last 6 yes, older 4 no | Golden miniset purchase reward (e.g. FIR_959 Fyrakk) |
| `tavern-pass` | 15 | No | Expansion Tavern Pass reward (time-limited) |
| `preorder` | 1 | No | Pre-order bundle exclusive |
| `shop` | ~37 | No | Shop-only promotional diamonds |
| `darkmoon` | 7 | Yes | Darkmoon Faire prize rotation |
| `event` | 2 | No | Limited-time event rewards (e.g. Alterac Valley Honor) |

Cards with `method === 'achievement'` show a progress bar in CardModal tracking how many legendaries the user owns from the target set.

### Signature Acquisition

`SIGNATURE_ACQUISITION: Record<string, SignatureAcquisitionInfo>` maps ~62 explicitly-tracked signature card IDs, with fallback logic for the remaining ~237 pack-obtainable legendaries.

```typescript
interface SignatureAcquisitionInfo {
  method: 'pack' | 'shop' | 'achievement' | 'tavern-pass' | 'event' | 'darkmoon' | 'unknown';
  description: string;
  obtainable: boolean;
  achievementSet?: string;
}
```

**Lookup logic** (`getSignatureAcquisition(cardId, setCode, rarity)`):
1. Check `SIGNATURE_ACQUISITION` map for explicit entry → return it
2. If card is in a `REVIEWED_SIGNATURE_SETS` set and is LEGENDARY → `pack` (obtainable from golden packs)
3. If card is in a reviewed set but not LEGENDARY → `event` (Tavern Pass/promotion only, unobtainable)
4. Otherwise → `unknown` (unreviewed set, assumed obtainable)

**Pack-obtainable signatures**: Only LEGENDARY cards from golden packs. 5% per expansion golden pack (40 pity), 0.6% per standard/wild golden pack (361 pity). Non-legendary signatures are never from packs.

**Achievement signatures** (from Whizbang's Workshop onward): 2 per expansion, earned by collecting all legendaries from that expansion. Show progress bars identical to diamond achievements.

### CardModal Tooltips

The CardModal shows enriched acquisition info for diamond and signature variants:
- **Achievement**: Progress bar with X/Y legendaries owned, percentage, colored bar (gold for sig, cyan for diamond)
- **Pack**: Pull chance calculation (existing signature pull chance display)
- **Shop/Tavern Pass/Preorder/Event**: Description + "No longer available" in red
- **Darkmoon**: Description noting Darkmoon Faire prize status
- **Unknown**: "Acquisition method unknown"

### Pack Advisor Integration

Signature mode in Pack Advisor uses `getSignatureAcquisition` to identify pack-obtainable legendaries for scoring. Only `method === 'pack'` signatures contribute to pack value calculations. Craft cost column is hidden in signature mode (signatures cannot be crafted).

## Maintaining Variant Acquisition Data

When new Hearthstone content releases (expansions, minisets, Tavern Pass, shop bundles), the acquisition maps in `src/types.ts` need manual updates.

### Adding New Diamond Cards

1. Find the card's `id` (e.g. "NEW_123") in the card database
2. Determine acquisition method from patch notes, shop announcements, or in-game
3. Add entry to `DIAMOND_ACQUISITION` in `src/types.ts`:
   ```typescript
   NEW_123: { method: 'achievement', description: 'Collect all New Expansion legendaries', obtainable: true, achievementSet: 'NEW_EXPANSION' },
   ```
4. For achievement diamonds: ensure the `achievementSet` matches the expansion code in the card DB

### Adding New Signature Cards

1. For **achievement** signatures (2 per expansion from Whizbang's Workshop onward): find card IDs and add to `SIGNATURE_ACQUISITION`
2. For **tavern pass** signatures: add with `method: 'tavern-pass'`, `obtainable: false`
3. For **shop-only** signatures: add with `method: 'shop'`, `obtainable: false`
4. Add the new expansion's set code to `REVIEWED_SIGNATURE_SETS` once all non-pack signatures are catalogued

### Updating Miniset Obtainability

When a new miniset releases, the oldest obtainable miniset may need to be marked `obtainable: false`. Currently, the last 6 minisets are considered obtainable.

### Updating Darkmoon Faire Rotation

Darkmoon Faire prizes rotate. When new rotation is announced, update existing entries and add new diamond card IDs with `method: 'darkmoon'`.

## Non-Goals
- **No deck builder** — data layer supports future addition
- **No mobile-optimized layouts** — desktop-first
- **No real-time Hearthstone game integration** — collection sync is manual/server-scheduled
