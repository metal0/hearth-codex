# Hearth Codex — Hearthstone Collection Tracker

## Overview

A multi-user web application that tracks Hearthstone card collections with proper card renders, rich filtering, meta-aware craft/pack prioritization, a pack completion calculator with strategy comparison, configurable meta stats brackets (free + premium), and a card art caching proxy with normalization. CORE set cards are included as standalone entries with name-based deduplication in the UI. All expansion sets are included with per-card dedup (name-based), and alias dbfIds track collection ownership across duplicate versions. Two-tier authentication: **Tier 1** (default) via public HSReplay collection URL with localStorage-only data, **Tier 2** via HSReplay session cookie for persistent server-side user data with automatic cleanup after 90 days of inactivity.

## Architecture

### Stack
- **Frontend**: React 19 + Vite 6 (TypeScript), Tailwind CSS 4, Zustand 5 state management, Recharts 2 for charts
- **Backend**: Node.js 22 with Express 5, sharp (image processing) — API server for data fetching, caching, simulation, and serving the SPA
- **Storage**: Filesystem (`data/` folder) — shared data + per-user directories
- **Auth**: Two-tier — Tier 1: public collection URL (localStorage-only, no server account), Tier 2: token-based (64-char hex) via HSReplay sessionId

### Data Sources
| Data | Source | Refresh Strategy |
|------|--------|-----------------|
| Card database (names, stats) | HearthstoneJSON API (`api.hearthstonejson.com`) | Auto on startup if >24h stale |
| Card art (normal) | `hearthstone.wiki.gg` card renders (fallback: HearthstoneJSON CDN) | Proxied and cached server-side |
| Card art (golden/signature/diamond) | `hearthstone.wiki.gg` Premium1/2/3 images | Proxied and cached server-side |
| User collection | HSReplay API via saved session cookie + Cloudflare bypass | Manual trigger + server auto-sync every 12h for active users |
| Meta/usage stats (standard + wild) | HSReplay `card_list_free` endpoint | Multi-bracket system: free brackets auto-refresh 12h, premium brackets via consenting premium users (24h expiry) |
| Deck archetypes + stats | HSGuru (hsguru.com) HTML scraping with LiveView WebSocket pagination | Cached in `data/deck-cache/` with 4h TTL, per-class wild scraping |

### Server Responsibilities
- Serve the React SPA (production build from `dist/`)
- Proxy HSReplay API calls via puppeteer-stealth Cloudflare bypass
- Serve card art as static files with CDN-ready cache headers
- Normalize all card art to 3:4 aspect ratio at cache time via `sharp`
- Background prefetch all card art on startup
- Cache card DB + meta brackets + art to filesystem (`data/`)
- Run Monte Carlo pack simulations (offloaded to server to avoid blocking UI)
- Scrape HSGuru for deck archetype data, card stats, and per-class wild decks
- Auto-refresh shared deck data (Standard + Wild) periodically
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
| `/api/meta?bracket=KEY` | GET | Card meta stats for given bracket (default: free bracket), falls back to free if unavailable |
| `/api/meta/brackets` | GET | Available brackets with freshness info |
| `/api/meta/refresh` | POST | Force refresh all brackets (free + premium if available) |
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
| `/api/auth/collection-login` | POST | Parse public collection URL, fetch collection via Cloudflare bypass, return collection data (no token, no server account) |
| `/api/auth/register` | POST | Validate HSReplay sessionId, create/find user, return token |
| `/api/auth/me` | GET | Current user info (battletag, accountLo, region, isPremium, premiumConsent) |

**Public collection sync (no auth required):**
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/collection/public-sync` | POST | Re-fetch public collection by region + accountLo (rate-limited: 5min per account) |

**Authenticated (requires `X-User-Token` header):**
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/collection` | GET | User's collection data |
| `/api/collection/sync` | POST | Trigger HSReplay sync using user's stored session |
| `/api/snapshots` | GET | User's collection history snapshots |
| `/api/snapshots` | POST | Save a new collection snapshot (365 cap per user) |
| `/api/snapshots` | DELETE | Clear all user snapshots |
| `/api/settings` | GET/PUT | Per-user settings |

**Optional auth (`X-User-Token` optional):**
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/decks?bracket=KEY` | GET | HSReplay archetype deck data for bracket (cached 4h) |

## Card Art System

Card art is served as static files at `/art/{cardId}_{variant}.png` via `express.static` with CDN-ready cache headers. A fallback handler fetches missing art on-demand from upstream sources.

### Art Sources
| Variant | Primary Source | Fallback | URL Pattern |
|---------|---------------|----------|-------------|
| `normal` | wiki.gg | HearthstoneJSON 256x | `hearthstone.wiki.gg/images/{id}.png` |
| `normal-lg` | HearthstoneJSON 512x | — | `art.hearthstonejson.com/v1/render/latest/enUS/512x/{id}.png` |
| `golden` | wiki.gg | — | `hearthstone.wiki.gg/images/{id}_Premium1.png` |
| `diamond` | wiki.gg | — | `hearthstone.wiki.gg/images/{id}_Premium2.png` |
| `signature` | wiki.gg | — | `hearthstone.wiki.gg/images/{id}_Premium3.png` |

Normal art uses wiki.gg as primary source (higher quality, transparent backgrounds) with HearthstoneJSON as fallback for cards not yet on wiki.gg.

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

### Art Normalization
All card art is normalized to 3:4 aspect ratio at cache time using `sharp`. Source images vary widely (HearthstoneJSON normals: 256×388 at 0.660 aspect, wiki.gg goldens: 500×650 at 0.769 aspect). Without normalization, `object-cover` CSS renders them with drastically different cropping.

- **Too-tall images** (normals): cropped from the bottom (card text area removed), top-aligned
- **Too-wide images** (goldens): cropped from sides (center-aligned horizontally)
- Tolerance: images within 0.01 of 3:4 are left unchanged
- One-time migration normalizes existing cached images on startup (`.art-normalized` flag file)
- Art version bumped after migration so browsers refetch normalized images

### Two-Tier Caching
- All art cached in `data/card-art-cache/` with two tiers:
  - **Full quality**: `{cardId}_{variant}.png` — normalized 256×341 at 3:4 aspect
  - **Low quality**: `{cardId}_{variant}.low.png` — JPEG 60% quality, ~10KB, served while full version downloads
- Static serving prefers `.png`, falls back to `.low.png` for faster initial loads
- Confirmed 404s recorded as `.miss` files (prevents re-fetching known-missing variants)
- `.miss` files only created on confirmed 404 (not rate limits or timeouts)
- Deduplication: concurrent requests for the same art share a single fetch promise

### Background Prefetcher
Runs on server startup after card DB loads. Uses DB-driven `hasSignature`/`hasDiamond` flags to skip cards without variants. Prefetches in priority order:

**Phase 1 — Owned cards** (prioritize what user actually has):
1. `owned-normal` — wiki.gg (fallback: HearthstoneJSON), 10 workers, 50ms
2. `owned-diamond` — wiki.gg, hasDiamond + owned diamond
3. `owned-signature` — wiki.gg, hasSignature + owned signature
4. `owned-golden` — wiki.gg, all owned cards

**Phase 2 — All normals:**
5. `unowned-normal` — wiki.gg (fallback: HearthstoneJSON), 10 workers, 50ms

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
| **Normal** | normal + golden + diamond + signature (across all alias dbfIds) | Best owned variant (diamond > sig > golden > normal) | All cards |
| **Golden** | golden + diamond + signature | Golden variant | All cards |
| **Signature** | signature + diamond (only if `hasSignature` or owned) | Signature variant | Cards with `hasSignature` flag or existing signature count |
| **Diamond** | diamond only (only if `hasDiamond` or owned) | Diamond variant | Cards with `hasDiamond` flag or existing diamond count |

Cards without a variant in the selected mode show the normal art (greyed out if unowned). In signature/diamond modes, cards without the variant are auto-marked as "complete" to avoid polluting the collection view.

### Obtainability Filter
In signature and diamond modes, an additional filter appears: **All / Obtainable / Unobtainable**. This filters cards based on their acquisition method's `obtainable` flag from the variant acquisition system (see below). Resets to "All" when switching to normal or golden mode.

## Views & Navigation

Persistent **sidebar** navigation with 8 views. Sidebar shows Standard + Wild completion bars with per-rarity breakdown tooltips. Four bar modes cycle on click: **Normal** (dust-weighted), **Golden** (golden craft cost weighted), **Signature** (copy counts), **Meta** (weighted by `craftCost × max(played%, 0.1% baseline)` using alias-aware meta resolution — prioritizes meta-relevant cards over unplayed ones). All meta lookups resolve across alias dbfIds (e.g., CORE Brawl dbfId 69640 maps to canonical Classic Brawl dbfId 75).

### 1. Collection View (default `/`)

Card grid showing every collectible card with ownership overlay.

**Card Tiles:**
- Card renders from server art proxy
- Unowned cards displayed greyscale/dimmed
- Partial ownership badge (yellow): shows `X/Y` count (e.g. "1/2")
- Excess copies badge (green): shows total count when more than max copies owned (e.g. "5")
- Default grouping by rarity (Legendary > Epic > Rare > Common), then mana cost, then name
- Client-side 5s timeout with fallback to normal art and background probe retries at 10s, 30s

**Filter Bar (collapsible):**

Always visible: search bar (animated width), Standard/Wild format toggle, Filters expand/collapse button.

Collapsed section (default closed): collection mode, rarity, ownership, obtainability, set, class, heatmap toggle, sort controls.

| Filter | Type | Options |
|--------|------|---------|
| Set/Expansion | Dropdown (multi-select) | All expansions |
| Class | Class picker with WoW-style icons | 11 classes + Neutral |
| Rarity | Icon-only gems with hover-expand text | Common, Rare, Epic, Legendary |
| Collection Mode | SVG icons with hover-expand text | Normal, Golden, Signature, Diamond |
| Ownership | Toggle chips | All, Owned, Incomplete |
| Obtainability | Toggle chips (sig/diamond modes only) | All, Obtainable, Unobtainable |
| Format | Toggle with HS icons (always visible) | Standard / Wild |
| Text Search | Input with animated width + clear button | Searches card name + text; auto-toggles matching filter UI |
| Heatmap | Toggle button (in collapsed section) | On/Off |
| Sort | Dropdown (default: Set ascending) | Name, Cost, Rarity, Set, Inclusion Rate, Winrate |

**Search Keyword Auto-Toggle:** Typing filter keywords (legendary, epic, missing, owned, golden, signature, diamond) automatically activates corresponding UI filter toggles. Clearing the search reverts only search-induced changes; manually-set filters are preserved. Uses delta-based tracking with pre-search state snapshots for ownership/mode.

**Card Interactions:**
- Hover: enlarged card render + stats tooltip (inclusion rate, winrate, dust cost)
- Click: detail modal with full card info, meta stats, ownership counts, art variant toggle buttons

### 2. Cost Calculator (`/calculator`)

Estimates packs/gold/dollars needed to complete collection for selected expansions.

**Controls:**
- Mode selector: Standard / All (Wild) / Custom (CORE excluded from all modes)
- Custom mode: checkbox grid for individual expansion selection
- Standard mode: optional "Hide Rotating (Xd)" toggle to exclude sets rotating out of Standard soon, with days-until-rotation countdown
- Rotation warning: orange triangle icon next to expansion names in results table for sets about to rotate, with tooltip showing rotation month and days remaining
- Current dust input (auto-filled from collection sync)
- Calculate button runs Monte Carlo simulation (200 runs)
- Meta Only toggle: switches simulation to terminate when accumulated dust >= craft cost of remaining unpulled meta cards (instead of full collection completion). Meta-relevant = inclusion rate >2% OR (winrate >50% with 100+ games). Uses both standard and wild meta stats (max popularity per card).
- Auto-recalculates on any filter/toggle/input change (300ms debounce)

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
- Meta-only simulation: probabilistic tracking of meta card pulls within rarity pools. When a card is added to collection, P(meta) = metaMissing/totalIncomplete at that rarity. Termination when dust >= remaining meta craft cost.

### 3. Craft Advisor (`/craft`)

Ranked list of all missing cards sorted by meta impact.

**Features:**
- Same filter bar as Collection View (set, class, rarity, format, search)
- Sortable columns: card name, rarity, dust cost, set, class, inclusion rate, winrate
- Winrate only shown for cards with 100+ games played
- Golden art hover preview
- Mode-aware: respects current collection mode for "missing" calculation
- Format-aware: uses format-specific meta fields (inclusionRateStd/Wild) based on local format filter, independent of store-level format

### 4. Pack Advisor (`/packs`)

Per-expansion pack value analysis using meta stats to prioritize which packs to buy.

**Features:**
- Per-expansion breakdown: cards missing, meta-relevant missing, pull chances per rarity
- Column sorting
- Rarity gem icons
- Dust-per-pack estimates
- Class and rarity filters
- Mode-aware ownership calculation
- Format-aware: uses format-specific meta fields based on local format filter
- First-10 legendary guarantee detection (2.5x legendary pull boost for sets with 0 owned legendaries)
- Collapsible FAQ explaining all calculation methods

**Scoring Model:**
- `computePullChance(rarity, missing, legendaryBoost)`: per-pack probability of pulling a specific card = 1−(1−weight/pool)^5 across 5 card slots, with duplicate protection (only missing cards in pool)
- `metaDustPerPack`: sum of pullChance × played% × craftCost × rotationDecay for each missing meta card
- `dustPerPack`: expected dust value per pack = 5 × weight × (missingRatio × craftCost + (1−missingRatio) × DEvalue) per rarity
- First-10 boost: `PACK_WEIGHT.LEGENDARY × 2.5` when user owns 0 legendaries from expansion (shown with FIRST-10 badge)
- Rotation decay: meta value × `min(daysLeft/100, 1)` for sets rotating out of Standard
- Aggregate packs (Standard/Wild): pool all missing cards across all eligible expansions, no first-10 boost (per-expansion pity timers don't apply)

### 5. Decks (`/decks`)

HSReplay archetype deck explorer with two view modes: individual decks and archetype tiers. Supports Standard and Wild (toggled via Settings game mode). Wild data scraped per-class from HSGuru for broader coverage.

**Data Sources:**
- HSReplay `/api/v1/archetypes/` (public) — archetype definitions
- `archetype_popularity_distribution_stats` — per-archetype WR, games, meta%
- `list_decks_by_win_rate` — individual decklists with stats
- HSGuru (hsguru.com) — augments HSReplay decks with card inclusion rates, drawn/played/kept WR, and per-class wild deck scraping via LiveView WebSocket pagination
- All analytics endpoints use `fetchWithPoll()` with session auth
- Cached in `data/deck-cache/` with 4h TTL (archetypes: 24h)

**Scoring:**
- Dust to craft: sum of craft cost for missing cards (using collection data)
- Dust value: `starsPerHour × 100 / (1 + adjustedCraftCost / 5000)` — balances climb efficiency against cost
- Ladder climb rate (stars/hr): `60 / (avgGameMinutes / (2 × WR/100 - 1))` (only for WR > 50%)
- Rotation-adjusted craft cost: cards in sets rotating within 90 days get `daysLeft/90` weight multiplier
- Rotation warning on decks with missing epic/legendary cards rotating soon

**View Modes:**
- **Deck view** (default): individual decklists ranked by scoring
- **Archetype view**: tier-based grouping (S/A/B/C/D) by win rate, showing best deck per archetype with core/flex card breakdown and card stats (inclusion %, drawn/played/kept WR)

**Filters:**
- Search bar (archetype name, or card name with "has:" prefix)
- Class filter (reuses ClassPicker)
- Archetype dropdown (populated per selected class)
- Buildable toggle (craftCost === 0)
- Max dust slider (0–50000)
- Min games threshold (default: 200 Standard, 50 Wild)
- Sort by: Dust Value, Win Rate, Games, Dust Cost, Stars/hr (ascending/descending toggle)

**Collapsed Deck Row:**
- Class icon, archetype name (links to HSReplay deck page), WR%, games, meta%, avg duration, stars/hr
- Dust to craft (red if exceeds user's dust, "Ready" badge if 0), dust value score, rotation ⚠
- Card circles: 28px art miniatures (shared CardCircle component) with class-colored borders, count badges, greyed-out unowned, hover for full card preview
- Sideboard/companion cards: resolved from deckstring sideboard data, shown as visual subcards grouped under their parent card with rarity-colored left borders
- Copy button: deckstring to clipboard

**Expanded Card List:**
- Vertical table with dynamic row heights (28–56px, scaled to fit viewport)
- Rarity-colored mana gem, card name with inline art preview (HearthstoneJSON 256x, 4-way fade mask, hover for full card), quantity, owned status, missing dust cost
- Card art: absolutely positioned with `backgroundSize: 130%`, intersecting horizontal + vertical gradient masks, 0.6 opacity
- Rarity bleed: subtle rarity-colored gradient on legendary/epic/rare rows
- Sortable by mana cost or dust cost
- Rotation warning ⚠ on missing epic/legendary cards from rotating sets

**Deckstring Encoder/Decoder:**
- Server-side `encodeDeckstring()` and `decodeDeckstring()` in `server/decks.ts`
- Varint + base64 format matching Hearthstone deckstring spec
- Hero dbfId map for all 11 classes
- Decoder extracts hero, cards, and sideboard pairs from deckstrings

### 6. Collection History (`/history`)

Timeline chart of collection completion over time. Snapshots saved server-side per user (365 max). **Tier 2 only** — Tier 1 users see an upgrade prompt; History nav hidden in sidebar for Tier 1.

- Dust-weighted completion percentage per snapshot
- Recharts line chart visualization
- Clear history button (deletes all snapshots)
- Snapshots auto-saved on each collection sync (skipped for Tier 1)

### 7. Disenchant Advisor (`/disenchant`)

Identifies safe-to-disenchant extras with composite safety scoring that factors in both meta play rate and winrate.

**Safety Formula** (`computeSafety(played, wr, decks)`):
- Base safety from play rate: 100% if played ≤ 0.5%, then exponential decay `100 × e^(-0.1 × (played - 0.5))`
- Winrate multiplier (requires ≥ 100 games): WR ≥ 50% degrades safety exponentially `e^(-0.12 × (wr - 50))`, WR < 45% boosts safety up to 1.5×
- Final safety clamped to 0–99%

**Controls:**
- Format filter: Standard / Wild (uses format-specific meta stats via alias-aware resolution)
- Max Winrate slider (30–60%, default 55%): cards with reliable WR above threshold are excluded
- Hide No WR toggle (default off): hides cards without reliable winrate data (< 100 games)

**Variant-Aware Extras Detection:**
- Total playable = normal + golden + diamond + signature counts
- Extras = totalPlayable − maxCopies (2 for non-legendary, 1 for legendary)
- Only normal and golden copies are disenchantable
- Premium upgrade labels: when extras exist due to signature/diamond variants, suggests "Signature upgrade" or "Diamond upgrade" as the disenchant reason
- Golden upgrade/redundant only suggested when 3+ total playable copies exist (never with exactly 2 copies of an epic)

**CORE-Backed Cards:**
- CORE cards sharing names with expansion originals have their meta stats resolved via alias dbfIds
- CORE safety uses the same composite formula (play rate + winrate multiplier)
- Cards with safety ≥ 90% are suggested for disenchant

**Categories:**
- Safe extras (safety ≥ 90%, based on composite formula)
- Risky extras (safety < 90%, sorted by safety descending)
- CORE-backed extras (expansion cards with free CORE versions)
- Free card extras (cards with free normal/golden versions from achievements)

**FAQ:** Collapsible section explaining safety scoring, play rate factor, winrate modifier, extra copy logic, CORE-backed cards, free card handling, and threshold controls.

### 8. Settings (`/settings`)

**Account:**
- Logged-in battletag display with premium badge if applicable
- Tier 1: "Upgrade to Full Account" section with sessionId input and benefits list
- Tier 2: Update HSReplay session (for expired cookies)
- Logout button

**Card Database:**
- Refresh from HearthstoneJSON (also clears art cache)

**Meta Stats Bracket (Tier 2 only):**
- Hidden for Tier 1 users (bracket changes require session ID auth, enforced at API level)
- Two dropdowns: Rank Range + Time Range (compose into bracket key)
- Available brackets highlighted, unavailable greyed with "(unavailable)"
- Last premium fetch timestamp
- Premium consent toggle (hosted mode only, visible for premium users)

**Card Art Cache:**
- Per-variant breakdown (normal/golden/signature/diamond) showing cached and missed counts
- Clear cache button

**Cloudflare Clearance:**
- Status indicator (active/expired with expiry time)
- Manual solve button

## Dynamic Expansion System

Expansions are derived dynamically from the card database — no hardcoded card counts. The system is fully future-proof: new expansions are auto-detected without code changes.

### Set Classification
- `EXCLUDED_SETS`: 4 non-playable sets excluded entirely: `HERO_SKINS`, `VANILLA`, `LEGACY`, `PLACEHOLDER_202204`
- `NON_PACK_SETS`: supplementary sets that can't be opened in packs (adventures, initiates, mini-sets, events): `NAXX`, `BRM`, `LOE`, `KARA`, `PATH_OF_ARTHAS`, `DEMON_HUNTER_INITIATE`, `YEAR_OF_THE_DRAGON`, `WONDERS`, `EVENT`
- `DEDUP_LOW_PRIORITY`: sets processed last during name-based dedup so expansion versions take priority: `EVENT`
- All other sets are included, including CORE

### Expansion Derivation
- `EXPANSION_METADATA` map provides display names and year info (fully optional — unknown sets get humanized code name, current year, and 'Unknown Year')
- `deriveExpansionsFromDb()`: counts cards per rarity from the card DB
- `sortExpansions()`: sorts by yearNum descending, then release order; CORE always sorted to bottom
- New expansions auto-detected after "Refresh Card Database" or on startup if card DB is >24h stale

### Name-Based Card Deduplication
Many cards appear in multiple sets (e.g., Classic + Core, expansion + event). Instead of excluding entire sets, cards are deduped by name:
1. Cards sorted with `DEDUP_LOW_PRIORITY` sets last (so expansion versions win)
2. First occurrence of each name becomes the canonical entry
3. Subsequent duplicates are skipped, but their dbfIds are stored as `aliasDbfIds` on the canonical entry
4. Collection ownership checks all alias dbfIds via `Math.max()` across all versions

### Standard Rotation
`applyStandardRotation()` dynamically determines which sets are Standard:
- Collects unique yearNums from all non-CORE expansions
- Estimates rotation date as March 15 of the newest yearNum (actual dates range March 17–25)
- **Pre-rotation** (before March 15): top 3 yearNums are Standard
- **Post-rotation** (after March 15): top 2 yearNums are Standard
- CORE is always Standard regardless of yearNum
- No hardcoded years or dates — fully adapts to new expansions

## CORE Set Integration

The CORE set (~288 cards, free to all players, updated multiple times per year) is included as standalone entries in the card database.

### DB Builder (Two-Pass)
1. First pass: builds all non-CORE cards with name-based dedup
2. Second pass: creates standalone entries for every CORE card. For each CORE card that shares a name with an expansion card, the CORE card's dbfId is added as an `aliasDbfId` on the expansion card (so collection ownership flows through)

### CORE Deduplication in UI
Since many CORE cards duplicate expansion originals (e.g., Ragnaros appears in both Classic and CORE), the store's `getFilteredCards()` hides CORE cards whose names match non-CORE cards — unless the user explicitly selects the CORE set in the filter dropdown. This prevents double-counting while preserving access to CORE-only cards.

### Ownership via Alias DbfIds
CORE card ownership counts toward the expansion original via the alias system. When checking ownership, the enrichment logic takes `Math.max()` across the canonical dbfId and all alias dbfIds (including the CORE version).

### CORE Sorting
CORE is always sorted to the bottom of the expansion list in the sidebar and filter dropdowns, regardless of its yearNum.

### CORE Exclusion from Advisors
CORE cards cannot be crafted, disenchanted, or pulled from packs. They are filtered out of:
- **Craft Advisor**: CORE cards excluded from missing card list and set dropdown
- **Disenchant Advisor**: CORE cards skipped in the disenchant loop and set dropdown
- **Pack Advisor**: CORE cards excluded from missing counts and expansion scoring
- **Calculator**: CORE excluded from standard, wild, and custom expansion lists

### CORE Auto-Update
CORE set composition is derived entirely from HearthstoneJSON data — no hardcoded card lists. When Blizzard updates the CORE set (additions, removals, swaps), a card DB refresh picks up all changes automatically.

## Meta Stats Brackets

Multi-bracket system supporting free and premium HSReplay stat tiers. Ten bracket combinations across rank ranges and time periods.

### Bracket Keys
Each bracket = `{RankRange}__{TimeRange}`:
- **Free**: `BRONZE_THROUGH_GOLD__CURRENT_PATCH` (default), `BRONZE_THROUGH_GOLD__CURRENT_EXPANSION`
- **Premium** (8 brackets): `LEGEND_THROUGH_TWENTY` and `ALL` rank ranges × `CURRENT_PATCH`, `LAST_7_DAYS`, `LAST_14_DAYS`, `LAST_30_DAYS` time ranges

### Storage
`data/meta-brackets/` directory with per-bracket JSON files and `_manifest.json` tracking fetch times, card counts, and premium status. Legacy `meta-stats.json` auto-migrated on startup.

### Premium Session Handling
- Premium brackets fetched using a consenting premium user's HSReplay session
- `probePremium(sessionId)` tests if a session has premium access
- Premium brackets expire after 24h if no premium sessions available
- Self-hosted mode: all premium users auto-eligible (no consent toggle needed)

### Settings Integration
Users select their preferred bracket via Settings dropdowns (rank range + time range). Selected bracket persisted in user settings. If selected bracket unavailable, falls back to free bracket with toast notification.

## Multi-User System

### Two-Tier Authentication

**Tier 1 — Collection URL (default):**
- User pastes their public HSReplay collection URL (e.g. `https://hsreplay.net/collection/2/12345678/`)
- Server parses region + accountLo from URL, clears puppeteer session cookie, fetches collection via Cloudflare bypass
- No server-side user created, no token issued
- Collection data, settings, and meta stored in `localStorage`
- Battletag extracted from collection page HTML title (fallback: `Player#accountLo`)
- Features: collection view, calculator, craft/DE advisor, pack advisor, decks (free brackets only), card art
- Unavailable: collection history/snapshots, persistent settings, meta bracket selection, premium brackets

**Tier 2 — Session ID (full):**
- HSReplay `sessionid` cookie serves as registration key (no passwords)
- Server validates by calling HSReplay account API, extracts Blizzard `account_lo` as user identity
- Server issues a long-lived token (64-char hex via `crypto.randomBytes(32)`)
- Client stores token in `localStorage`, sends `X-User-Token` header on every request
- On 401 response (except `/auth/*` endpoints and only if token exists): client clears token and reloads → onboarding
- Features: everything in Tier 1 plus collection history, persistent server-side settings, premium bracket access

**Auth Tier State:**
- Stored in `localStorage` as `hc-auth-tier` (`'collection'` or `'full'`)
- Zustand store exposes `authTier` for UI branching
- Tier 1 users can upgrade to Tier 2 via Settings page without re-entering collection URL

### Onboarding
First-time visitors see a mandatory full-screen modal (collection URL only — no session ID option during onboarding):

1. Explains HSReplay.net account requirement and Hearthstone Deck Tracker installation
2. Instructions: enable public collection in HSReplay account settings, open collection page and copy URL
3. Direct link to `https://hsreplay.net/collection/mine/` for easy URL copying
4. Paste collection URL input + "View Collection" button
5. On success: stores collection + meta in localStorage, sets authTier to 'collection', loads app
6. Session ID upgrade available later via Settings page (Tier 1 → Tier 2)

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

**Tier 1 (public URL):**
- Fetches collection via `POST /api/collection/public-sync` with region + accountLo
- Server clears puppeteer session cookie before fetch (prevents cross-user contamination)
- Rate-limited: 5-minute cooldown per region:accountLo key
- Collection stored in `localStorage` (`hc-collection` key)

**Tier 2 (session ID):**
- User provides `sessionid` during registration (validated server-side)
- Server stores sessionId in user's `token.json`, uses it for all subsequent syncs
- Server fetches `/api/v1/account/` to get Blizzard account params, then `/api/v1/collection/`
- Auto-sync: server-side every 12h for active users (active = any API request within 48h)

**Common:**
- Collection format: `{ collection: { dbfId: [normal, golden, diamond, sig] }, dust: N }`
- Client auto-syncs on app load if collection is >2 hours stale

### Meta Stats
- Fetches `card_list_free` endpoint for RANKED_STANDARD and RANKED_WILD per bracket
- Parameterized by rank range (`GameType` variants) and time range (`TimeRange` param)
- Polls for 202 (query processing) up to 12 times with 10s delay
- Stores per-card: popularity (inclusion rate), winrate, decks played, dominant class
- `bracketLabel()` utility formats bracket keys for display across views

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
  set: string;         // e.g. "TIME_TRAVEL" or "CORE"
  rarity: 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
  name: string;
  type: string;        // MINION, SPELL, WEAPON, HERO, LOCATION
  cardClass: string;   // e.g. "MAGE"
  cost: number;
  attack?: number;
  health?: number;
  text?: string;
  freeNormal?: boolean;   // true if normal version is free (from howToEarn)
  freeGolden?: boolean;   // true if golden version is free (from howToEarnGolden)
  hasSignature?: boolean; // true if card has a signature variant (from HAS_SIGNATURE_QUALITY)
  hasDiamond?: boolean;   // true if card has a diamond variant (from hasDiamondSkin)
  aliasDbfIds?: string[]; // dbfIds of duplicate cards (CORE versions, cross-set dupes) — ownership checked via Math.max()
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
interface EnrichedCard {
  dbfId: string;
  id: string;
  name: string;
  set: string;
  rarity: Rarity;
  type: string;
  cardClass: string;
  cost: number;
  attack?: number;
  health?: number;
  text?: string;
  normalCount: number;
  goldenCount: number;
  diamondCount: number;
  signatureCount: number;
  totalOwned: number;    // mode-aware ownership count (includes alias dbfId ownership)
  maxCopies: number;     // 1 for legendary, 2 otherwise
  imageUrl: string;      // /art/{id}_{variant}.png?v={artVersion}
  inclusionRate: number;   // from user's selected meta bracket
  winrate: number;
  decks: number;
  inclusionRateStd: number; // always Standard meta (for views with local format filter)
  winrateStd: number;
  decksStd: number;
  inclusionRateWild: number; // always Wild meta
  winrateWild: number;
  decksWild: number;
  aliasDbfIds?: string[];   // for alias-aware meta resolution (CORE dbfIds etc.)
  freeNormal?: boolean;
  freeGolden?: boolean;
  hasSignature?: boolean;
  hasDiamond?: boolean;
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
│   ├── meta-stats.json        # Legacy single-bracket meta stats (migrated to meta-brackets/)
│   ├── meta-brackets/         # Multi-bracket meta stats
│   │   ├── _manifest.json     # Bracket metadata (fetchedAt, cardCount, premium status)
│   │   └── {BRACKET_KEY}.json # Per-bracket stats { standard: MetaDb, wild: MetaDb }
│   ├── art-version.txt        # Art cache-busting version counter
│   ├── card-art-cache/        # Cached card art (shared, normalized to 3:4, png + miss files)
│   ├── deck-cache/            # Cached HSReplay deck data (archetypes, decks per bracket)
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
│   ├── decks.ts               # Deckstring encoder/decoder, hero dbfIds, HSReplay deck response types
│   ├── hsguru.ts              # HSGuru HTML scraper with LiveView WebSocket pagination + card stats
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
│   │   ├── FilterBar.tsx      # Collapsible filter controls with search auto-toggle
│   │   ├── ClassPicker.tsx    # WoW-style class icons
│   │   ├── RarityFilter.tsx   # Rarity gem toggle chips
│   │   ├── CollectionModeToggle.tsx  # N/G/S/D mode toggle
│   │   ├── CardCircle.tsx     # Shared 28px card art miniature with rarity border + ownership
│   │   └── Icons.tsx          # Dust, gold, pack SVG icons
│   ├── views/
│   │   ├── CollectionView.tsx
│   │   ├── CalculatorView.tsx # Cost Calculator with strategy comparison
│   │   ├── CraftAdvisorView.tsx
│   │   ├── PackAdvisorView.tsx
│   │   ├── DecksView.tsx       # HSReplay archetype deck explorer with scoring
│   │   ├── DisenchantAdvisorView.tsx
│   │   ├── HistoryView.tsx    # Collection history timeline
│   │   └── SettingsView.tsx
│   ├── stores/
│   │   └── store.ts           # Zustand store (state, actions, enrichment, filtering)
│   ├── hooks/
│   │   ├── useCollectionSnapshots.ts  # Server-side snapshot management
│   │   └── useRotationInfo.ts         # Shared rotation date/sets hook
│   ├── lib/
│   │   ├── simulator.ts       # Client-side pack simulation (Web Worker bridge)
│   │   └── collection.ts      # Collection data helpers
│   ├── workers/
│   │   └── calculator.worker.ts  # Web Worker for calculator simulations
│   ├── utils/
│   │   ├── searchParser.ts    # Hearthstone keyword search parser
│   │   └── localStorageMigration.ts   # Per-user localStorage key migration
│   └── services/
│       └── api.ts             # API client with token auth + auth tier helpers
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
