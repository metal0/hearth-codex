import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync, readdirSync, unlinkSync } from 'fs';
import sharp from 'sharp';
import {
  getCardDb,
  loadCardDb,
  fetchAndCacheCardDb,
  initExpansions,
  getAllExpansions,
  type CardDb,
} from './data.ts';
import { ensureCfReady, fetchThroughBrowser, setSessionCookie, clearSessionCookie, getCfStatus, clearCfSession, acquireSessionLock } from './cloudflare.ts';
import { initAuth, resolveUserByToken, createUser, updateSessionId, getAllUsers, purgeInactiveUsers, type TokenData } from './auth.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const CARD_DB_PATH = join(DATA_DIR, 'card-db.json');
const META_PATH = join(DATA_DIR, 'meta-stats.json');
const META_DIR = join(DATA_DIR, 'meta-brackets');
const META_MANIFEST_PATH = join(META_DIR, '_manifest.json');
const PORT = parseInt(process.env.PORT || '4000');
const HOSTED_MODE = !!process.env.HOSTED_MODE;
const FREE_BRACKET = 'BRONZE_THROUGH_GOLD__CURRENT_PATCH';
const PREMIUM_EXPIRY_MS = 24 * 60 * 60 * 1000;

interface BracketConfig {
  key: string;
  rankRange: string;
  timeRange: string;
  premium: boolean;
  requiresSession: boolean;
}

const ALL_BRACKETS: BracketConfig[] = [
  // card_list_free endpoint — no session needed
  { key: 'BRONZE_THROUGH_GOLD__CURRENT_PATCH', rankRange: 'BRONZE_THROUGH_GOLD', timeRange: 'CURRENT_PATCH', premium: false, requiresSession: false },
  { key: 'BRONZE_THROUGH_GOLD__CURRENT_EXPANSION', rankRange: 'BRONZE_THROUGH_GOLD', timeRange: 'CURRENT_EXPANSION', premium: false, requiresSession: false },
  // card_list_free endpoint — premium session needed
  { key: 'DIAMOND_THROUGH_LEGEND__CURRENT_PATCH', rankRange: 'DIAMOND_THROUGH_LEGEND', timeRange: 'CURRENT_PATCH', premium: true, requiresSession: true },
  { key: 'DIAMOND_THROUGH_LEGEND__CURRENT_EXPANSION', rankRange: 'DIAMOND_THROUGH_LEGEND', timeRange: 'CURRENT_EXPANSION', premium: true, requiresSession: true },
  // card_included_popularity_report endpoint — any session needed
  { key: 'ALL__LAST_7_DAYS', rankRange: 'ALL', timeRange: 'LAST_7_DAYS', premium: false, requiresSession: true },
  { key: 'ALL__LAST_14_DAYS', rankRange: 'ALL', timeRange: 'LAST_14_DAYS', premium: false, requiresSession: true },
];

interface BracketEntry {
  key: string;
  rankRange: string;
  timeRange: string;
  premium: boolean;
  fetchedAt: number;
  cardCount: number;
}

interface BracketManifest {
  brackets: Record<string, BracketEntry>;
  lastPremiumFetchAt: number | null;
  premiumFetchedBy: string | null;
}

function loadManifest(): BracketManifest {
  if (existsSync(META_MANIFEST_PATH)) {
    try { return JSON.parse(readFileSync(META_MANIFEST_PATH, 'utf-8')); }
    catch { /* corrupted */ }
  }
  return { brackets: {}, lastPremiumFetchAt: null, premiumFetchedBy: null };
}

function saveManifest(manifest: BracketManifest): void {
  mkdirSync(META_DIR, { recursive: true });
  writeFileSync(META_MANIFEST_PATH, JSON.stringify(manifest, null, 2));
}

function loadUserSettings(userDir: string): Record<string, unknown> {
  const settingsPath = join(userDir, 'settings.json');
  if (!existsSync(settingsPath)) return {};
  try { return JSON.parse(readFileSync(settingsPath, 'utf-8')); }
  catch { return {}; }
}

function saveUserSetting(userDir: string, key: string, value: unknown): void {
  const settingsPath = join(userDir, 'settings.json');
  let current: Record<string, unknown> = {};
  if (existsSync(settingsPath)) {
    try { current = JSON.parse(readFileSync(settingsPath, 'utf-8')); } catch { /* empty */ }
  }
  current[key] = value;
  writeFileSync(settingsPath, JSON.stringify(current, null, 2));
}

function migrateMetaStats(): void {
  if (existsSync(META_PATH) && !existsSync(META_DIR)) {
    mkdirSync(META_DIR, { recursive: true });
    const raw = readFileSync(META_PATH, 'utf-8');
    const data = JSON.parse(raw);
    writeFileSync(join(META_DIR, `${FREE_BRACKET}.json`), raw);
    const stdCount = Object.keys(data.standard || data).length;
    const wildCount = Object.keys(data.wild || {}).length;
    const manifest: BracketManifest = {
      brackets: {
        [FREE_BRACKET]: {
          key: FREE_BRACKET,
          rankRange: 'BRONZE_THROUGH_GOLD',
          timeRange: 'CURRENT_PATCH',
          premium: false,
          fetchedAt: statSync(META_PATH).mtimeMs,
          cardCount: stdCount + wildCount,
        },
      },
      lastPremiumFetchAt: null,
      premiumFetchedBy: null,
    };
    saveManifest(manifest);
    console.log('[Meta] Migrated meta-stats.json to meta-brackets/ directory');
  }
}

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
initAuth(DATA_DIR);
migrateMetaStats();

const CARD_ART_CACHE = join(DATA_DIR, 'card-art-cache');
mkdirSync(CARD_ART_CACHE, { recursive: true });

const ART_VERSION_PATH = join(DATA_DIR, 'art-version.txt');
let artVersion = 1;
try { artVersion = parseInt(readFileSync(ART_VERSION_PATH, 'utf-8').trim(), 10) || 1; } catch {}
function bumpArtVersion(): number {
  artVersion++;
  writeFileSync(ART_VERSION_PATH, String(artVersion));
  return artVersion;
}

const ART_SOURCES: Record<string, (id: string) => string> = {
  normal: (id) => `https://hearthstone.wiki.gg/images/${id}.png`,
  'normal-lg': (id) => `https://art.hearthstonejson.com/v1/render/latest/enUS/512x/${id}.png`,
  golden: (id) => `https://hearthstone.wiki.gg/images/${id}_Premium1.png`,
  signature: (id) => `https://hearthstone.wiki.gg/images/${id}_Premium3.png`,
  diamond: (id) => `https://hearthstone.wiki.gg/images/${id}_Premium2.png`,
};

const ART_FALLBACKS: Record<string, (id: string) => string> = {
  normal: (id) => `https://art.hearthstonejson.com/v1/render/latest/enUS/256x/${id}.png`,
};

const ART_W = 256;
const ART_H = 341;
const TRANSPARENT_BG = { r: 0, g: 0, b: 0, alpha: 0 };

function variantFromCacheKey(cacheKey: string): string {
  const lastUnderscore = cacheKey.lastIndexOf('_');
  return lastUnderscore >= 0 ? cacheKey.slice(lastUnderscore + 1) : '';
}

async function centerPad(img: Buffer): Promise<Buffer> {
  const meta = await sharp(img).metadata();
  if (!meta.width || !meta.height) return img;
  if (meta.width > ART_W || meta.height > ART_H) {
    img = await sharp(img).resize(ART_W, ART_H, { fit: 'inside' }).toBuffer();
    const m2 = await sharp(img).metadata();
    if (!m2.width || !m2.height) return img;
    meta.width = m2.width;
    meta.height = m2.height;
  }
  const padLeft = Math.floor((ART_W - meta.width) / 2);
  const padTop = Math.floor((ART_H - meta.height) / 2);
  return sharp(img)
    .extend({
      top: padTop,
      bottom: ART_H - meta.height - padTop,
      left: padLeft,
      right: ART_W - meta.width - padLeft,
      background: TRANSPARENT_BG,
    })
    .png()
    .toBuffer();
}

async function normalizeArt(buffer: Buffer): Promise<Buffer> {
  try {
    return centerPad(buffer);
  } catch {
    return buffer;
  }
}

async function cacheNormalized(cacheFile: string, buffer: Buffer): Promise<Buffer> {
  const normalized = await normalizeArt(buffer);
  writeFileSync(cacheFile, normalized);
  return normalized;
}

async function migrateArtCache(): Promise<void> {
  const flagFile = join(CARD_ART_CACHE, '.art-v7');
  if (existsSync(flagFile)) return;

  const allFiles = readdirSync(CARD_ART_CACHE);
  let deleted = 0;
  for (const f of allFiles) {
    if (f.startsWith('.')) continue;
    const fp = join(CARD_ART_CACHE, f);
    if (f.endsWith('.png') || f.endsWith('_normal.miss') || f.endsWith('_normal-lg.miss')) {
      unlinkSync(fp);
      deleted++;
    }
  }

  writeFileSync(flagFile, '');
  console.log(`[ArtCache] v7: cleared ${deleted} files (normal source → wiki.gg, removed trim)`);
  if (deleted > 0) bumpArtVersion();
}

const startedAt = Date.now();
const app = express();
app.use(express.json());

interface RateBucket { count: number; resetAt: number }
const ipBuckets = new Map<string, RateBucket>();
const userBuckets = new Map<string, RateBucket>();
const IP_LIMIT = 120;
const USER_LIMIT = 200;
const RATE_WINDOW = 60_000;

function getIp(req: express.Request): string {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';
}

function checkRate(buckets: Map<string, RateBucket>, key: string, limit: number): boolean {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + RATE_WINDOW };
    buckets.set(key, bucket);
  }
  bucket.count++;
  return bucket.count <= limit;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of ipBuckets) { if (now >= v.resetAt) ipBuckets.delete(k); }
  for (const [k, v] of userBuckets) { if (now >= v.resetAt) userBuckets.delete(k); }
}, 60_000);

if (HOSTED_MODE) {
  app.use('/api', (req, res, next) => {
    if (!checkRate(ipBuckets, getIp(req), IP_LIMIT)) {
      res.status(429).json({ error: 'Too many requests' });
      return;
    }
    const token = req.headers['x-user-token'] as string | undefined;
    if (token) {
      const user = resolveUserByToken(token);
      if (user && !checkRate(userBuckets, user.accountLo, USER_LIMIT)) {
        res.status(429).json({ error: 'Too many requests' });
        return;
      }
    }
    next();
  });

  const HOSTED_BLOCKED = new Set(['/cards/refresh', '/card-art/clear-cache', '/cf/solve', '/meta/refresh']);
  const AUTH_EXEMPT = new Set(['/auth/register', '/auth/collection-login', '/collection/public-sync', '/health']);
  app.use('/api', (req: AuthRequest, res, next) => {
    if (HOSTED_BLOCKED.has(req.path)) { res.status(403).json({ error: 'This action is disabled in hosted mode' }); return; }
    if (AUTH_EXEMPT.has(req.path)) { next(); return; }
    const token = req.headers['x-user-token'] as string | undefined;
    if (!token) { res.status(401).json({ error: 'Authentication required' }); return; }
    const user = resolveUserByToken(token);
    if (!user) { res.status(401).json({ error: 'Invalid or expired token' }); return; }
    req.userId = user.accountLo;
    req.userDir = user.userDir;
    next();
  });
}

app.use('/art', express.static(CARD_ART_CACHE, {
  maxAge: '365d',
  immutable: true,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  },
}));

app.get('/art/:filename', async (req, res) => {
  const match = req.params.filename.match(/^(.+)_([a-z]+(?:-lg)?)\.png$/);
  if (!match) { res.status(400).end(); return; }
  const [, cardId, variant] = match;
  const sourceFn = ART_SOURCES[variant];
  if (!sourceFn) { res.status(400).end(); return; }

  const cacheKey = `${cardId}_${variant}`;
  const missFile = join(CARD_ART_CACHE, `${cacheKey}.miss`);
  if (existsSync(missFile)) {
    res.set('Cache-Control', 'no-cache');
    res.status(404).end();
    return;
  }

  const buffer = await fetchAndCacheArt(cacheKey, sourceFn(cardId));
  if (buffer) {
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(buffer);
  } else {
    res.set('Cache-Control', 'no-store');
    res.status(404).end();
  }
});

let cardDb: CardDb | null = null;

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', uptime: Math.round((Date.now() - startedAt) / 1000), cardDbLoaded: !!cardDb });
});

interface AuthRequest extends express.Request {
  userId?: string;
  userDir?: string;
}

function authenticateUser(req: AuthRequest, res: express.Response, next: express.NextFunction): void {
  const token = req.headers['x-user-token'] as string | undefined;
  if (!token) { res.status(401).json({ error: 'Authentication required' }); return; }
  const user = resolveUserByToken(token);
  if (!user) { res.status(401).json({ error: 'Invalid or expired token' }); return; }
  req.userId = user.accountLo;
  req.userDir = user.userDir;
  next();
}

function optionalAuth(req: AuthRequest, _res: express.Response, next: express.NextFunction): void {
  const token = req.headers['x-user-token'] as string | undefined;
  if (token) {
    const user = resolveUserByToken(token);
    if (user) { req.userId = user.accountLo; req.userDir = user.userDir; }
  }
  next();
}

function rejectInHostedMode(_req: express.Request, res: express.Response, next: express.NextFunction): void {
  if (HOSTED_MODE) { res.status(403).json({ error: 'This action is disabled in hosted mode' }); return; }
  next();
}

const COLLECTION_URL_RE = /hsreplay\.net\/collection\/(\d+)\/(\d+)/;
function parseCollectionUrl(url: string): { region: number; accountLo: string } | null {
  const m = url.match(COLLECTION_URL_RE);
  return m ? { region: parseInt(m[1], 10), accountLo: m[2] } : null;
}

async function fetchPublicCollection(region: number, accountLo: string): Promise<{ collection: Record<string, number[]>; dust: number }> {
  const release = await acquireSessionLock();
  try {
    await clearSessionCookie();
    await ensureCfReady();
    const url = `https://hsreplay.net/api/v1/collection/?account_lo=${accountLo}&region=${region}`;
    const result = await fetchThroughBrowser(url);
    if (result.status === 401 || result.status === 403) {
      throw new Error('Collection is private. Enable public sharing at hsreplay.net → My Account → Collection visibility.');
    }
    if (result.status !== 200) {
      throw new Error(`HSReplay returned ${result.status}`);
    }
    const data = JSON.parse(result.body);
    return { collection: data.collection ?? {}, dust: data.dust ?? 0 };
  } finally {
    release();
  }
}

app.post('/api/auth/collection-login', async (req, res) => {
  const collectionUrl = req.body?.collectionUrl as string | undefined;
  if (!collectionUrl) {
    res.status(400).json({ error: 'collectionUrl is required' });
    return;
  }

  const parsed = parseCollectionUrl(collectionUrl);
  if (!parsed) {
    res.status(400).json({ error: 'Invalid collection URL. Expected format: hsreplay.net/collection/{region}/{accountLo}/' });
    return;
  }

  try {
    const { collection, dust } = await fetchPublicCollection(parsed.region, parsed.accountLo);
    const cards = Object.keys(collection).length;

    let battletag = `Player#${parsed.accountLo}`;
    try {
      const release = await acquireSessionLock();
      try {
        await clearSessionCookie();
        await ensureCfReady();
        const pageResult = await fetchThroughBrowser(`https://hsreplay.net/collection/${parsed.region}/${parsed.accountLo}/`);
        if (pageResult.status === 200) {
          const titleMatch = pageResult.body.match(/<title>([^<]+)<\/title>/);
          if (titleMatch) {
            const decoded = titleMatch[1].replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
            const cleaned = decoded.replace(/'s [Cc]ollection.*$/, '').replace(/ - HSReplay\.net$/, '').trim();
            if (cleaned && cleaned !== 'HSReplay.net') battletag = cleaned;
          }
        }
      } finally {
        release();
      }
    } catch {}

    res.json({
      success: true,
      collection,
      dust,
      battletag,
      accountLo: parsed.accountLo,
      region: parsed.region,
      cards,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(400).json({ error: message });
  }
});

const publicSyncCooldowns = new Map<string, number>();

app.post('/api/collection/public-sync', async (req, res) => {
  const region = req.body?.region as number | undefined;
  const accountLo = req.body?.accountLo as string | undefined;
  if (!region || !accountLo) {
    res.status(400).json({ error: 'region and accountLo are required' });
    return;
  }

  const cooldownKey = `${region}:${accountLo}`;
  const lastSync = publicSyncCooldowns.get(cooldownKey) ?? 0;
  if (Date.now() - lastSync < SYNC_COOLDOWN) {
    const remaining = Math.ceil((SYNC_COOLDOWN - (Date.now() - lastSync)) / 1000);
    res.status(429).json({ error: `Sync cooldown: try again in ${remaining}s` });
    return;
  }

  try {
    const { collection, dust } = await fetchPublicCollection(region, accountLo);
    const syncedAt = Date.now();
    publicSyncCooldowns.set(cooldownKey, syncedAt);
    res.json({
      success: true,
      collection,
      dust,
      cards: Object.keys(collection).length,
      syncedAt,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(400).json({ error: message });
  }
});

app.post('/api/auth/register', async (req, res) => {
  const sessionId = req.body?.sessionId;
  if (!sessionId) {
    res.status(400).json({ error: 'sessionId is required' });
    return;
  }

  const releaseReg = await acquireSessionLock();
  try {
    await setSessionCookie(sessionId);
    const acctResult = await fetchThroughBrowser('https://hsreplay.net/api/v1/account/');
    if (acctResult.status === 401) {
      releaseReg();
      res.status(400).json({ error: 'Invalid or expired HSReplay session cookie. Please get a fresh sessionid.' });
      return;
    }
    if (acctResult.status !== 200) {
      releaseReg();
      res.status(502).json({ error: `HSReplay returned ${acctResult.status}` });
      return;
    }

    const acctData = JSON.parse(acctResult.body);
    const blizzAccounts = acctData?.blizzard_accounts;
    if (!Array.isArray(blizzAccounts) || blizzAccounts.length === 0) {
      releaseReg();
      res.status(400).json({ error: 'No Blizzard account linked to HSReplay' });
      return;
    }

    const acct = blizzAccounts[0];
    const accountLo = String(acct.account_lo);
    const battletag = acct.battletag || `Player#${accountLo}`;
    const region = acct.region || 0;

    const user = createUser(accountLo, battletag, region, sessionId);

    let collectionUrl = 'https://hsreplay.net/api/v1/collection/';
    const params = new URLSearchParams();
    if (acct.account_lo) params.set('account_lo', accountLo);
    if (acct.region) params.set('region', String(region));
    collectionUrl += `?${params.toString()}`;

    const collResult = await fetchThroughBrowser(collectionUrl);
    releaseReg();

    let cards = 0;
    let dust = 0;
    if (collResult.status === 200) {
      const data = JSON.parse(collResult.body);
      writeFileSync(join(user.userDir, 'collection.json'), JSON.stringify(data, null, 2));
      cards = Object.keys(data.collection || {}).length;
      dust = data.dust || 0;
    }

    let isPremium: boolean | null = null;
    try {
      isPremium = await probePremium(sessionId);
      saveUserSetting(user.userDir, 'isPremium', isPremium);
      saveUserSetting(user.userDir, 'premiumProbedAt', Date.now());
      if (isPremium) console.log(`[Auth] ${battletag} detected as HSReplay premium`);
    } catch {
      console.log(`[Auth] Premium probe failed for ${battletag}`);
    }

    res.json({ success: true, token: user.tokenData.token, battletag, accountLo, cards, dust, isPremium });
  } catch (err: unknown) {
    releaseReg();
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

app.get('/api/auth/me', authenticateUser, (req: AuthRequest, res) => {
  const tokenPath = join(req.userDir!, 'token.json');
  if (!existsSync(tokenPath)) { res.status(404).json({ error: 'User not found' }); return; }
  const data: TokenData = JSON.parse(readFileSync(tokenPath, 'utf-8'));
  const settings = loadUserSettings(req.userDir!);

  if (settings.isPremium == null && data.sessionId) {
    probePremium(data.sessionId).then(premium => {
      saveUserSetting(req.userDir!, 'isPremium', premium);
      saveUserSetting(req.userDir!, 'premiumProbedAt', Date.now());
      if (premium) console.log(`[Auth] ${data.battletag} detected as HSReplay premium (lazy probe)`);
    }).catch(() => {});
  }

  res.json({
    battletag: data.battletag,
    accountLo: data.accountLo,
    region: data.region,
    isPremium: settings.isPremium ?? null,
    premiumConsent: settings.premiumConsent ?? false,
  });
});

app.get('/api/data-status', (_req, res) => {
  const cardDbAge = existsSync(CARD_DB_PATH) ? statSync(CARD_DB_PATH).mtimeMs : 0;
  const manifest = loadManifest();
  const freeBracket = manifest.brackets[FREE_BRACKET];
  const metaAge = freeBracket?.fetchedAt ?? (existsSync(META_PATH) ? statSync(META_PATH).mtimeMs : 0);
  const cf = getCfStatus();
  res.json({
    cardDb: { updatedAt: cardDbAge },
    meta: {
      updatedAt: metaAge,
      availableBrackets: Object.keys(manifest.brackets),
      lastPremiumFetchAt: manifest.lastPremiumFetchAt,
    },
    cf,
    hostedMode: HOSTED_MODE,
    artVersion,
  });
});

app.get('/api/cards', async (_req, res) => {
  if (!cardDb) cardDb = await getCardDb();
  res.json(cardDb);
});

app.post('/api/cards/refresh', rejectInHostedMode, async (_req, res) => {
  const { db, changedCardIds } = await fetchAndCacheCardDb();
  cardDb = db;
  const invalidated = invalidateArtForCards(changedCardIds);
  const exps = await initExpansions();
  if (changedCardIds.length > 0) {
    prefetchCardsById(db, changedCardIds).catch(err => console.error('[Prefetch] Re-fetch error:', err));
  }
  if (changedCardIds.length > 0) bumpArtVersion();
  res.json({ count: Object.keys(db).length, expansions: exps.length, changed: changedCardIds.length, invalidated, artVersion });
});

app.post('/api/card-art/clear-cache', rejectInHostedMode, (_req, res) => {
  if (!existsSync(CARD_ART_CACHE)) {
    mkdirSync(CARD_ART_CACHE, { recursive: true });
    res.json({ queued: 0 });
    return;
  }

  const files = readdirSync(CARD_ART_CACHE);
  let missRemoved = 0;
  let pngQueued = 0;
  for (const file of files) {
    if (file.endsWith('.miss')) {
      unlinkSync(join(CARD_ART_CACHE, file));
      missRemoved++;
    } else if (file.endsWith('.png')) {
      pngQueued++;
    }
  }

  if (cardDb && pngQueued > 0 && !process.env.DISABLE_ART_PREFETCH) {
    prefetchCardArt(cardDb).catch(err => console.error('[Prefetch] Error:', err));
  }

  const newVersion = bumpArtVersion();
  res.json({ queued: pngQueued, missCleared: missRemoved, artVersion: newVersion });
});

app.get('/api/expansions', (_req, res) => {
  res.json(getAllExpansions());
});

app.get('/api/collection', authenticateUser, (req: AuthRequest, res) => {
  const collPath = join(req.userDir!, 'collection.json');
  if (!existsSync(collPath)) {
    res.json({ collection: {}, dust: 0, syncedAt: null });
    return;
  }
  const data = JSON.parse(readFileSync(collPath, 'utf-8'));
  const { mtimeMs } = statSync(collPath);
  res.json({ ...data, syncedAt: mtimeMs });
});

app.post('/api/cf/solve', rejectInHostedMode, async (_req, res) => {
  try {
    const success = await ensureCfReady();
    if (success) {
      const status = getCfStatus();
      res.json({ success: true, expiresIn: status.expiresIn });
    } else {
      res.status(500).json({ error: 'Failed to solve Cloudflare challenge' });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

app.get('/api/cf/status', (_req, res) => {
  res.json(getCfStatus());
});

const SYNC_COOLDOWN = 5 * 60 * 1000;
const userSyncTimes = new Map<string, number>();

app.post('/api/collection/sync', authenticateUser, async (req: AuthRequest, res) => {
  if (HOSTED_MODE) {
    const lastSync = userSyncTimes.get(req.userId!) ?? 0;
    if (Date.now() - lastSync < SYNC_COOLDOWN) {
      const remaining = Math.ceil((SYNC_COOLDOWN - (Date.now() - lastSync)) / 1000);
      res.status(429).json({ error: `Sync cooldown: try again in ${remaining}s` });
      return;
    }
  }

  const tokenPath = join(req.userDir!, 'token.json');
  const tokenData: TokenData = JSON.parse(readFileSync(tokenPath, 'utf-8'));
  const sessionId = req.body?.sessionId || tokenData.sessionId;

  if (!sessionId) {
    res.status(400).json({ error: 'No HSReplay session cookie available. Re-authenticate in Settings.' });
    return;
  }

  const releaseSession = await acquireSessionLock();
  try {
    await setSessionCookie(sessionId);

    const acctResult = await fetchThroughBrowser('https://hsreplay.net/api/v1/account/');
    if (acctResult.status === 401) {
      releaseSession();
      res.status(401).json({ error: 'HSReplay session expired. Please update it in Settings.', sessionExpired: true });
      return;
    }

    let collectionUrl = 'https://hsreplay.net/api/v1/collection/';
    if (acctResult.status === 200) {
      const acctData = JSON.parse(acctResult.body);
      const blizzAccounts = acctData?.blizzard_accounts;
      if (Array.isArray(blizzAccounts) && blizzAccounts.length > 0) {
        const acct = blizzAccounts[0];
        const params = new URLSearchParams();
        if (acct.account_lo) params.set('account_lo', String(acct.account_lo));
        if (acct.region) params.set('region', String(acct.region));
        collectionUrl += `?${params.toString()}`;
      }
    }

    const result = await fetchThroughBrowser(collectionUrl);
    releaseSession();

    if (req.body?.sessionId && req.body.sessionId !== tokenData.sessionId) {
      updateSessionId(req.userId!, req.body.sessionId);
      probePremium(req.body.sessionId).then(isPremium => {
        saveUserSetting(req.userDir!, 'isPremium', isPremium);
        saveUserSetting(req.userDir!, 'premiumProbedAt', Date.now());
      }).catch(() => {});
    }

    if (result.status !== 200) {
      res.status(result.status).json({ error: `HSReplay returned ${result.status}` });
      return;
    }

    const collPath = join(req.userDir!, 'collection.json');
    const data = JSON.parse(result.body);
    writeFileSync(collPath, JSON.stringify(data, null, 2));
    const collection = data.collection as Record<string, unknown> | undefined;
    const dust = data.dust as number | undefined;

    const syncedAt = Date.now();
    if (HOSTED_MODE) userSyncTimes.set(req.userId!, syncedAt);
    res.json({
      success: true,
      cards: Object.keys(collection || {}).length,
      dust: dust || 0,
      syncedAt,
    });
  } catch (err: unknown) {
    releaseSession();
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

interface MetaCardStats {
  dbfId: number;
  popularity: number;
  winrate: number;
  decks: number;
  class: string;
}

type MetaDb = Record<string, MetaCardStats>;

const META_STALE_MS = 4 * 60 * 60 * 1000;

function isMetaStale(): boolean {
  const manifest = loadManifest();
  const freeBracket = manifest.brackets[FREE_BRACKET];
  if (!freeBracket) {
    if (!existsSync(META_PATH)) return true;
    return Date.now() - statSync(META_PATH).mtimeMs > META_STALE_MS;
  }
  if (Date.now() - freeBracket.fetchedAt > META_STALE_MS) return true;
  const fetched = new Set(Object.keys(manifest.brackets));
  return ALL_BRACKETS.some(b => !fetched.has(b.key));
}

async function fetchWithPoll(url: string, sessionId?: string, maxRetries = 12, delayMs = 10000): Promise<{ status: number; body: string } | null> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    let release: (() => void) | undefined;
    try {
      if (sessionId) {
        release = await acquireSessionLock();
        await setSessionCookie(sessionId);
      }
      const res = await fetchThroughBrowser(url);
      if (release) { release(); release = undefined; }

      if (res.status === 200) return res;
      if (res.status === 202) {
        console.log(`HSReplay query processing (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(r => setTimeout(r, delayMs));
        continue;
      }
      if (res.status === 403 && attempt === 0) {
        console.log('Meta fetch got 403, re-solving Cloudflare...');
        clearCfSession();
        continue;
      }
      console.log(`HSReplay returned ${res.status} for ${url}: ${res.body.slice(0, 200)}`);
      return null;
    } finally {
      if (release) release();
    }
  }
  return null;
}

interface SplitMeta { standard: MetaDb; wild: MetaDb }

const LEAGUE_RANK_RANGES = new Set(['BRONZE_THROUGH_GOLD', 'DIAMOND_THROUGH_LEGEND']);

async function fetchMetaBracket(rankRange: string, timeRange: string, sessionId?: string): Promise<SplitMeta> {
  const result: SplitMeta = { standard: {}, wild: {} };
  const useCardListFree = LEAGUE_RANK_RANGES.has(rankRange);

  for (const gameType of ['RANKED_STANDARD', 'RANKED_WILD'] as const) {
    const target = gameType === 'RANKED_STANDARD' ? result.standard : result.wild;
    try {
      const url = useCardListFree
        ? `https://hsreplay.net/analytics/query/card_list_free/?GameType=${gameType}&TimeRange=${timeRange}&LeagueRankRange=${rankRange}`
        : `https://hsreplay.net/analytics/query/card_included_popularity_report/?GameType=${gameType}&TimeRange=${timeRange}&RankRange=${rankRange}`;
      const res = await fetchWithPoll(url, sessionId);
      if (!res) continue;

      const data = JSON.parse(res.body) as {
        series: { data: Record<string, Array<{
          dbf_id: number;
          included_popularity: number;
          included_winrate: number;
          times_played: number;
          winrate_when_played: number;
        }>> }
      };

      const allClasses = data?.series?.data;
      if (!allClasses) continue;

      for (const [className, cards] of Object.entries(allClasses)) {
        if (!Array.isArray(cards)) continue;
        for (const card of cards) {
          const key = String(card.dbf_id);
          const existing = target[key];
          if (!existing || card.included_popularity > existing.popularity) {
            target[key] = {
              dbfId: card.dbf_id,
              popularity: card.included_popularity,
              winrate: card.included_winrate,
              decks: card.times_played,
              class: className,
            };
          }
        }
      }
    } catch {
      // silently skip failed fetches
    }
  }

  return result;
}

let bracketFetchRunning = false;

async function fetchAllBrackets(): Promise<void> {
  if (bracketFetchRunning) {
    console.log('[Meta] Bracket fetch already running, skipping');
    return;
  }
  bracketFetchRunning = true;
  try {
    mkdirSync(META_DIR, { recursive: true });
    const manifest = loadManifest();

    const isFresh = (key: string) => {
      const entry = manifest.brackets[key];
      return entry && Date.now() - entry.fetchedAt < META_STALE_MS;
    };

    const freeBrackets = ALL_BRACKETS.filter(b => !b.requiresSession && !isFresh(b.key));
    const sessionBrackets = ALL_BRACKETS.filter(b => b.requiresSession && !b.premium && !isFresh(b.key));
    const premiumBrackets = ALL_BRACKETS.filter(b => b.premium && !isFresh(b.key));

    for (const bracket of freeBrackets) {
      try {
        const data = await fetchMetaBracket(bracket.rankRange, bracket.timeRange);
        const totalCards = Object.keys(data.standard).length + Object.keys(data.wild).length;
        if (totalCards > 0) {
          writeFileSync(join(META_DIR, `${bracket.key}.json`), JSON.stringify(data));
          manifest.brackets[bracket.key] = {
            key: bracket.key, rankRange: bracket.rankRange, timeRange: bracket.timeRange,
            premium: false, fetchedAt: Date.now(), cardCount: totalCards,
          };
          console.log(`[Meta] ${bracket.key}: ${totalCards} cards`);
        }
      } catch (err) {
        console.error(`[Meta] Failed to fetch ${bracket.key}:`, err);
      }
    }

    const premiumUser = pickPremiumUser();
    if (premiumUser) {
      console.log(`[Meta] Using premium session from ${premiumUser.tokenData.battletag}`);
      for (const bracket of [...sessionBrackets, ...premiumBrackets]) {
        try {
          const data = await fetchMetaBracket(bracket.rankRange, bracket.timeRange, premiumUser.tokenData.sessionId);
          const totalCards = Object.keys(data.standard).length + Object.keys(data.wild).length;
          if (totalCards > 0) {
            writeFileSync(join(META_DIR, `${bracket.key}.json`), JSON.stringify(data));
            manifest.brackets[bracket.key] = {
              key: bracket.key, rankRange: bracket.rankRange, timeRange: bracket.timeRange,
              premium: bracket.premium, fetchedAt: Date.now(), cardCount: totalCards,
            };
            console.log(`[Meta] ${bracket.key}: ${totalCards} cards${bracket.premium ? ' (premium)' : ''}`);
          }
        } catch (err) {
          console.error(`[Meta] Failed to fetch ${bracket.key}:`, err);
        }
      }
      manifest.lastPremiumFetchAt = Date.now();
      manifest.premiumFetchedBy = premiumUser.accountLo;
    } else {
      const anyUser = pickAnyUser();
      if (anyUser) {
        console.log(`[Meta] Using session from ${anyUser.tokenData.battletag} for authenticated brackets`);
        for (const bracket of sessionBrackets) {
          try {
            const data = await fetchMetaBracket(bracket.rankRange, bracket.timeRange, anyUser.tokenData.sessionId);
            const totalCards = Object.keys(data.standard).length + Object.keys(data.wild).length;
            if (totalCards > 0) {
              writeFileSync(join(META_DIR, `${bracket.key}.json`), JSON.stringify(data));
              manifest.brackets[bracket.key] = {
                key: bracket.key, rankRange: bracket.rankRange, timeRange: bracket.timeRange,
                premium: false, fetchedAt: Date.now(), cardCount: totalCards,
              };
              console.log(`[Meta] ${bracket.key}: ${totalCards} cards`);
            }
          } catch (err) {
            console.error(`[Meta] Failed to fetch ${bracket.key}:`, err);
          }
        }
      } else {
        console.log('[Meta] No users available for authenticated brackets');
      }
      console.log('[Meta] No premium user available for premium brackets');
    }

    expireStalePremiumBrackets(manifest);
    saveManifest(manifest);
  } finally {
    bracketFetchRunning = false;
  }
}

function expireStalePremiumBrackets(manifest: BracketManifest): void {
  const now = Date.now();
  for (const [key, info] of Object.entries(manifest.brackets)) {
    if (info.premium && now - info.fetchedAt > PREMIUM_EXPIRY_MS) {
      const filePath = join(META_DIR, `${key}.json`);
      if (existsSync(filePath)) unlinkSync(filePath);
      delete manifest.brackets[key];
      console.log(`[Meta] Expired premium bracket: ${key}`);
    }
  }
}

function pickPremiumUser(): import('./auth.ts').ResolvedUser | null {
  const users = getAllUsers();
  const candidates = users.filter(user => {
    const settings = loadUserSettings(user.userDir);
    if (settings.isPremium !== true) return false;
    if (HOSTED_MODE && settings.premiumConsent !== true) return false;
    return true;
  });
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function pickAnyUser(): import('./auth.ts').ResolvedUser | null {
  const users = getAllUsers();
  if (users.length === 0) return null;
  return users[Math.floor(Math.random() * users.length)];
}

async function probePremium(sessionId: string): Promise<boolean> {
  const release = await acquireSessionLock();
  try {
    await ensureCfReady();
    await setSessionCookie(sessionId);
    const url = 'https://hsreplay.net/analytics/query/card_list_free/?GameType=RANKED_STANDARD&TimeRange=CURRENT_PATCH&LeagueRankRange=DIAMOND_THROUGH_LEGEND';
    const res = await fetchThroughBrowser(url);
    return res.status === 200 || res.status === 202;
  } catch (err) {
    console.log(`[Premium] Probe error:`, err);
    return false;
  } finally {
    release();
  }
}

function loadBracketData(bracketKey: string): SplitMeta | null {
  const bracketPath = join(META_DIR, `${bracketKey}.json`);
  if (existsSync(bracketPath)) {
    try {
      const raw = JSON.parse(readFileSync(bracketPath, 'utf-8'));
      if (raw.standard && raw.wild) return raw as SplitMeta;
    } catch { /* corrupted */ }
  }
  return null;
}

function loadMetaCache(): SplitMeta {
  const fromBracket = loadBracketData(FREE_BRACKET);
  if (fromBracket) return fromBracket;
  if (!existsSync(META_PATH)) return { standard: {}, wild: {} };
  const raw = JSON.parse(readFileSync(META_PATH, 'utf-8'));
  if (raw.standard && raw.wild) return raw as SplitMeta;
  return { standard: raw as MetaDb, wild: {} };
}

app.get('/api/meta', (_req, res) => {
  const requestedBracket = (_req.query.bracket as string) || FREE_BRACKET;
  const validKey = ALL_BRACKETS.some(b => b.key === requestedBracket);
  const bracketKey = validKey ? requestedBracket : FREE_BRACKET;

  const data = loadBracketData(bracketKey);
  if (data) {
    res.json({ ...data, bracket: bracketKey });
    return;
  }

  if (bracketKey !== FREE_BRACKET) {
    const freeData = loadBracketData(FREE_BRACKET);
    if (freeData) {
      res.json({ ...freeData, bracket: FREE_BRACKET, fallback: true });
      return;
    }
  }

  const legacy = loadMetaCache();
  res.json({ ...legacy, bracket: FREE_BRACKET });
});

app.get('/api/meta/brackets', (_req, res) => {
  const manifest = loadManifest();
  const now = Date.now();
  const available = Object.values(manifest.brackets).map(b => ({
    key: b.key,
    rankRange: b.rankRange,
    timeRange: b.timeRange,
    premium: b.premium,
    fetchedAt: b.fetchedAt,
    cardCount: b.cardCount,
    fresh: now - b.fetchedAt < (b.premium ? PREMIUM_EXPIRY_MS : META_STALE_MS * 6),
  }));
  res.json({
    brackets: available,
    allBrackets: ALL_BRACKETS.map(b => ({ key: b.key, rankRange: b.rankRange, timeRange: b.timeRange, premium: b.premium, requiresSession: b.requiresSession })),
    lastPremiumFetchAt: manifest.lastPremiumFetchAt,
  });
});

app.post('/api/meta/refresh', rejectInHostedMode, async (_req, res) => {
  try {
    await fetchAllBrackets();
    const manifest = loadManifest();
    const totalBrackets = Object.keys(manifest.brackets).length;
    const totalCards = Object.values(manifest.brackets).reduce((s, b) => s + b.cardCount, 0);
    res.json({ count: totalCards, brackets: totalBrackets });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// ─── Deck endpoints ───────────────────────────────────────────

import {
  HERO_DBFIDS, encodeDeckstring, decodeDeckstring,
  type HsrArchetype, type HsrDeckEntry, type HsrArchetypeStats,
  type ArchetypeInfo, type DeckInfo, type CompanionCard, type DecksResponse,
} from './decks.ts';
import { fetchHsguruMeta, fetchHsguruDecks, fetchHsguruMatchups } from './hsguru.ts';

const DECK_CACHE_DIR = join(DATA_DIR, 'deck-cache');
mkdirSync(DECK_CACHE_DIR, { recursive: true });

const DECK_STALE_MS = 4 * 60 * 60 * 1000;
const ARCHETYPE_STALE_MS = 24 * 60 * 60 * 1000;
const MIN_DECK_GAMES = 100;

const CLASS_NUM_TO_NAME: Record<number, string> = {
  2: 'DRUID', 3: 'HUNTER', 4: 'MAGE', 5: 'PALADIN',
  6: 'PRIEST', 7: 'ROGUE', 8: 'SHAMAN', 9: 'WARLOCK',
  10: 'WARRIOR', 14: 'DEMONHUNTER', 15: 'DEATHKNIGHT',
};

interface FullCardEntry {
  dbfId: number;
  id: string;
  name: string;
  cost: number;
  type: string;
  set: string;
  rarity: string;
  cardClass: string;
  collectible?: boolean;
}

const FULL_CARDS_PATH = join(DATA_DIR, 'cards-full.json');
const FULL_CARDS_STALE_MS = 24 * 60 * 60 * 1000;

async function getFullCardSet(): Promise<Map<number, FullCardEntry>> {
  if (existsSync(FULL_CARDS_PATH)) {
    try {
      const stat = statSync(FULL_CARDS_PATH);
      if (Date.now() - stat.mtimeMs < FULL_CARDS_STALE_MS) {
        const entries = JSON.parse(readFileSync(FULL_CARDS_PATH, 'utf-8')) as FullCardEntry[];
        return new Map(entries.map(e => [e.dbfId, e]));
      }
    } catch { /* refetch */ }
  }
  console.log('[Decks] Fetching full card set from HearthstoneJSON...');
  const res = await fetch('https://api.hearthstonejson.com/v1/latest/enUS/cards.json');
  const raw = await res.json() as Record<string, unknown>[];
  const entries: FullCardEntry[] = raw.map(c => ({
    dbfId: c.dbfId as number,
    id: c.id as string,
    name: c.name as string,
    cost: (c.cost as number) ?? 0,
    type: (c.type as string) || 'MINION',
    set: (c.set as string) || '',
    rarity: (c.rarity as string) || 'COMMON',
    cardClass: (c.cardClass as string) || 'NEUTRAL',
    collectible: c.collectible as boolean | undefined,
  }));
  writeFileSync(FULL_CARDS_PATH, JSON.stringify(entries));
  console.log(`[Decks] Cached ${entries.length} full card entries`);
  return new Map(entries.map(e => [e.dbfId, e]));
}

function resolveAllCompanionCards(
  cardDb: CardDb,
  fullSet: Map<number, FullCardEntry> | null,
  rawDecks: { cards: [number, number][]; sideboard: [number, ...[number, number][]][] }[],
): Record<string, CompanionCard> {
  const unknownDbfIds = new Set<number>();
  for (const d of rawDecks) {
    for (const [id] of d.cards) {
      if (!cardDb[String(id)]) unknownDbfIds.add(id);
    }
    for (const group of d.sideboard) {
      for (let i = 1; i < group.length; i++) {
        const pair = group[i] as [number, number];
        if (!cardDb[String(pair[0])]) unknownDbfIds.add(pair[0]);
      }
    }
  }
  if (unknownDbfIds.size === 0 || !fullSet) return {};

  const companions: Record<string, CompanionCard> = {};
  for (const dbfId of unknownDbfIds) {
    const full = fullSet.get(dbfId);
    if (full) {
      companions[String(dbfId)] = {
        id: full.id,
        name: full.name,
        cost: full.cost,
        type: full.type,
        set: full.set,
        rarity: full.rarity,
        cardClass: full.cardClass,
      };
    }
  }

  for (const d of rawDecks) {
    for (const group of d.sideboard) {
      const ownerDbfId = group[0] as number;
      for (let i = 1; i < group.length; i++) {
        const pair = group[i] as [number, number];
        const key = String(pair[0]);
        if (!companions[key] && !cardDb[key] && fullSet) {
          const full = fullSet.get(pair[0]);
          if (full) {
            companions[key] = { id: full.id, name: full.name, cost: full.cost, type: full.type, set: full.set, rarity: full.rarity, cardClass: full.cardClass };
          }
        }
        const comp = companions[key];
        if (comp) {
          comp.ownerDbfId = ownerDbfId;
        }
      }
    }
  }

  const needsOwner = Object.entries(companions).filter(([, c]) => !c.ownerDbfId);
  if (needsOwner.length > 0) {
    const subset = Object.fromEntries(needsOwner) as Record<string, CompanionCard>;
    const ownerMap = buildOwnerMap(subset, fullSet);
    for (const [dbfIdStr] of needsOwner) {
      const owner = ownerMap.get(Number(dbfIdStr));
      if (owner) companions[dbfIdStr].ownerDbfId = owner;
    }
  }

  for (const [dbfIdStr, comp] of Object.entries(companions)) {
    if (!comp.ownerDbfId) continue;
    const ownerName = cardDb[String(comp.ownerDbfId)]?.name ?? fullSet?.get(comp.ownerDbfId)?.name;
    if (ownerName && comp.name === ownerName) delete companions[dbfIdStr];
  }

  console.log(`[Decks] Resolved ${Object.keys(companions).length} companion cards`);
  return companions;
}

function buildOwnerMap(
  companions: Record<string, CompanionCard>,
  fullSet: Map<number, FullCardEntry>,
): Map<number, number> {
  const ownerMap = new Map<number, number>();
  const idToDbfId = new Map<string, number>();
  for (const entry of fullSet.values()) {
    if (entry.collectible) idToDbfId.set(entry.id, entry.dbfId);
  }
  for (const [dbfIdStr, comp] of Object.entries(companions)) {
    const baseId = comp.id.replace(/t\d*$/, '');
    const ownerDbfId = idToDbfId.get(baseId);
    if (ownerDbfId) ownerMap.set(Number(dbfIdStr), ownerDbfId);
  }
  return ownerMap;
}

interface DeckCacheEntry {
  archetypes: ArchetypeInfo[];
  decks: DeckInfo[];
  companionCards: Record<string, CompanionCard>;
  fetchedAt: number;
  source: 'hsreplay' | 'hsguru';
}

function loadDeckCache(bracketKey: string): DeckCacheEntry | null {
  const cachePath = join(DECK_CACHE_DIR, `decks_${bracketKey}.json`);
  if (!existsSync(cachePath)) return null;
  try {
    const data = JSON.parse(readFileSync(cachePath, 'utf-8')) as DeckCacheEntry;
    if (Date.now() - data.fetchedAt < DECK_STALE_MS) return data;
  } catch { /* corrupted */ }
  return null;
}

function saveDeckCache(bracketKey: string, data: DeckCacheEntry): void {
  writeFileSync(join(DECK_CACHE_DIR, `decks_${bracketKey}.json`), JSON.stringify(data));
}

async function fetchArchetypes(): Promise<HsrArchetype[]> {
  const cachePath = join(DECK_CACHE_DIR, 'archetypes.json');
  if (existsSync(cachePath)) {
    try {
      const cached = JSON.parse(readFileSync(cachePath, 'utf-8')) as { data: HsrArchetype[]; fetchedAt: number };
      if (Date.now() - cached.fetchedAt < ARCHETYPE_STALE_MS) return cached.data;
    } catch { /* corrupted */ }
  }

  const release = await acquireSessionLock();
  try {
    await ensureCfReady();
    const res = await fetchThroughBrowser('https://hsreplay.net/api/v1/archetypes/');
    if (res.status === 200) {
      const data = JSON.parse(res.body) as HsrArchetype[];
      writeFileSync(cachePath, JSON.stringify({ data, fetchedAt: Date.now() }));
      return data;
    }
  } catch (err) {
    console.error('[Decks] Failed to fetch archetypes:', err);
  } finally {
    release();
  }

  if (existsSync(cachePath)) {
    try { return (JSON.parse(readFileSync(cachePath, 'utf-8')) as { data: HsrArchetype[] }).data; }
    catch { /* give up */ }
  }
  return [];
}

const HSGURU_RANK_MAP: Record<string, string> = {
  BRONZE_THROUGH_GOLD: 'all',
  DIAMOND_THROUGH_LEGEND: 'diamond_to_legend',
  ALL: 'all',
};

const HSGURU_PERIOD_MAP: Record<string, string> = {
  CURRENT_PATCH: 'past_week',
  CURRENT_EXPANSION: 'past_30_days',
  LAST_7_DAYS: 'past_week',
  LAST_14_DAYS: 'past_2_weeks',
};

function bracketToHsguru(bracketKey: string): { rank: string; period: string } {
  const parts = bracketKey.split('__');
  return {
    rank: HSGURU_RANK_MAP[parts[0]] ?? 'diamond_to_legend',
    period: HSGURU_PERIOD_MAP[parts[1]] ?? 'past_week',
  };
}

function deckRankParam(rankRange: string): string {
  return LEAGUE_RANK_RANGES.has(rankRange)
    ? `LeagueRankRange=${rankRange}`
    : `RankRange=${rankRange}`;
}

async function fetchDeckData(rankRange: string, timeRange: string, sessionId?: string, minGames = MIN_DECK_GAMES): Promise<DeckCacheEntry> {
  const archetypes = await fetchArchetypes();
  const archMap = new Map(archetypes.map(a => [a.id, a]));

  const rp = deckRankParam(rankRange);
  const useV2 = LEAGUE_RANK_RANGES.has(rankRange);
  const statsUrl = useV2
    ? `https://hsreplay.net/analytics/query/archetype_popularity_distribution_stats_v2/?GameType=RANKED_STANDARD&${rp}&TimeRange=${timeRange}`
    : `https://hsreplay.net/analytics/query/archetype_popularity_distribution_stats/?GameType=RANKED_STANDARD&${rp}&TimeRange=${timeRange}`;
  const decksUrl = `https://hsreplay.net/analytics/query/list_decks_by_win_rate_v2/?GameType=RANKED_STANDARD&${rp}&TimeRange=${timeRange}`;

  console.log(`[Decks] Fetching stats: ${statsUrl}`);
  console.log(`[Decks] Fetching decks: ${decksUrl}`);

  const [statsRes, decksRes] = await Promise.all([
    fetchWithPoll(statsUrl, sessionId),
    fetchWithPoll(decksUrl, sessionId),
  ]);

  console.log(`[Decks] Stats response: ${statsRes ? statsRes.status : 'null'}, Decks response: ${decksRes ? decksRes.status : 'null'}`);

  const archStats = new Map<number, HsrArchetypeStats>();
  if (statsRes) {
    try {
      const parsed = JSON.parse(statsRes.body) as { series: { data: Record<string, HsrArchetypeStats[]> } };
      for (const entries of Object.values(parsed.series?.data ?? {})) {
        for (const entry of entries) {
          archStats.set(entry.archetype_id, entry);
        }
      }
    } catch (err) {
      console.error('[Decks] Failed to parse archetype stats:', err);
    }
  }

  const cardDb = loadCardDb() ?? {};
  let fullSet: Map<number, FullCardEntry> | null = null;

  type SideboardGroup = [number, ...[number, number][]];
  interface RawDeck {
    entry: HsrDeckEntry;
    className: string;
    heroDbfId: number;
    cards: [number, number][];
    sideboard: SideboardGroup[];
  }
  const rawDecks: RawDeck[] = [];
  if (decksRes) {
    try {
      const parsed = JSON.parse(decksRes.body) as { series: { data: Record<string, HsrDeckEntry[]> } };
      for (const entries of Object.values(parsed.series?.data ?? {})) {
        for (const entry of entries) {
          if (entry.total_games < minGames) continue;
          const arch = archMap.get(entry.archetype_id);
          if (!arch) continue;

          const className = CLASS_NUM_TO_NAME[arch.player_class] ?? arch.player_class_name;
          const heroDbfId = HERO_DBFIDS[className];
          if (!heroDbfId) continue;

          let cards: [number, number][];
          try {
            cards = JSON.parse(entry.deck_list) as [number, number][];
          } catch {
            continue;
          }

          let sideboard: SideboardGroup[] = [];
          if (entry.deck_sideboard) {
            try {
              sideboard = JSON.parse(entry.deck_sideboard) as SideboardGroup[];
            } catch { /* malformed sideboard */ }
          }

          rawDecks.push({ entry, className, heroDbfId, cards, sideboard });
        }
      }
    } catch (err) {
      console.error('[Decks] Failed to parse deck list:', err);
    }
  }

  const allUnknownDbfIds = new Set<number>();
  for (const d of rawDecks) {
    for (const [id] of d.cards) {
      if (!cardDb[String(id)]) allUnknownDbfIds.add(id);
    }
    for (const group of d.sideboard) {
      for (let i = 1; i < group.length; i++) {
        const pair = group[i] as [number, number];
        if (!cardDb[String(pair[0])]) allUnknownDbfIds.add(pair[0]);
      }
    }
  }
  if (allUnknownDbfIds.size > 0) {
    try {
      fullSet = await getFullCardSet();
    } catch (err) {
      console.error('[Decks] Failed to fetch full card set:', err);
    }
  }

  const companionCards = resolveAllCompanionCards(cardDb, fullSet, rawDecks);

  const decks: DeckInfo[] = [];
  for (const { entry, className, heroDbfId, cards, sideboard } of rawDecks) {
    const sideboardPairs: [number, number][] = [];

    for (const group of sideboard) {
      const ownerDbfId = group[0] as number;
      for (let i = 1; i < group.length; i++) {
        const pair = group[i] as [number, number];
        sideboardPairs.push([pair[0], ownerDbfId]);
      }
    }

    decks.push({
      deckId: entry.deck_id,
      archetypeId: entry.archetype_id,
      playerClass: className,
      winRate: entry.win_rate,
      totalGames: entry.total_games,
      cards,
      deckstring: encodeDeckstring(heroDbfId, cards, 2, sideboardPairs.length > 0 ? sideboardPairs : undefined),
      duration: entry.avg_game_length_seconds,
      sideboardPairs: sideboardPairs.length > 0 ? sideboardPairs : undefined,
    });
  }

  const archetypeInfos: ArchetypeInfo[] = [];
  const seenArchetypes = new Set<number>();
  for (const deck of decks) {
    if (seenArchetypes.has(deck.archetypeId)) continue;
    seenArchetypes.add(deck.archetypeId);
    const arch = archMap.get(deck.archetypeId);
    if (!arch) continue;
    const stats = archStats.get(deck.archetypeId);
    archetypeInfos.push({
      id: arch.id,
      name: arch.name,
      playerClass: deck.playerClass,
      url: arch.url,
      ...(stats ? {
        pctOfTotal: stats.pct_of_total,
        winRate: stats.win_rate,
        totalGames: stats.total_games,
      } : {}),
    });
  }

  return { archetypes: archetypeInfos, decks, companionCards, fetchedAt: Date.now(), source: 'hsreplay' as const };
}

function loadDeckData(bracketKey: string): DeckCacheEntry | null {
  const cachePath = join(DECK_CACHE_DIR, `decks_${bracketKey}.json`);
  if (!existsSync(cachePath)) return null;
  try {
    const data = JSON.parse(readFileSync(cachePath, 'utf-8')) as DeckCacheEntry;
    if (!data.source) data.source = 'hsreplay';
    return data;
  } catch { return null; }
}

let deckFetchRunning = false;

async function fetchAllDeckBrackets(): Promise<void> {
  if (deckFetchRunning) {
    console.log('[Decks] Bracket fetch already running, skipping');
    return;
  }
  deckFetchRunning = true;
  try {
    const staleBrackets = ALL_BRACKETS.filter(b => !loadDeckCache(b.key));
    if (staleBrackets.length === 0) {
      console.log('[Decks] All brackets fresh');
      return;
    }

    const premiumUser = pickPremiumUser();
    if (premiumUser) {
      console.log(`[Decks] Using premium session from ${premiumUser.tokenData.battletag}`);
      for (const bracket of staleBrackets) {
        try {
          const data = await fetchDeckData(bracket.rankRange, bracket.timeRange, premiumUser.tokenData.sessionId);
          saveDeckCache(bracket.key, data);
          console.log(`[Decks] ${bracket.key}: ${data.decks.length} decks`);
        } catch (err) {
          console.error(`[Decks] Failed to fetch ${bracket.key}:`, err);
        }
      }
    } else {
      const anyUser = pickAnyUser();
      if (!anyUser) {
        console.log('[Decks] No users available for deck fetching');
        return;
      }
      console.log(`[Decks] Using session from ${anyUser.tokenData.battletag}`);
      const nonPremium = staleBrackets.filter(b => !b.premium);
      for (const bracket of nonPremium) {
        try {
          const data = await fetchDeckData(bracket.rankRange, bracket.timeRange, anyUser.tokenData.sessionId);
          saveDeckCache(bracket.key, data);
          console.log(`[Decks] ${bracket.key}: ${data.decks.length} decks`);
        } catch (err) {
          console.error(`[Decks] Failed to fetch ${bracket.key}:`, err);
        }
      }
    }
  } finally {
    deckFetchRunning = false;
  }
}

async function fetchWildDeckData(
  rank = 'diamond_to_legend',
  period = 'past_week',
  fullBackfill = false,
): Promise<DeckCacheEntry> {
  const archetypes = await fetchHsguruMeta(1, rank, period);
  const archetypeNames = fullBackfill ? archetypes.map(a => a.name) : undefined;
  const decks = await fetchHsguruDecks(1, rank, period, archetypeNames);

  const cardDb = loadCardDb() ?? {};
  const unknownDbfIds = new Set<number>();
  for (const d of decks) {
    for (const [id] of d.cards) {
      if (!cardDb[String(id)]) unknownDbfIds.add(id);
    }
    try {
      const decoded = decodeDeckstring(d.deckstring);
      d.sideboardPairs = decoded.sideboard;
      for (const [compDbfId] of decoded.sideboard) {
        if (!cardDb[String(compDbfId)]) unknownDbfIds.add(compDbfId);
      }
    } catch {}
  }

  let fullSet: Map<number, FullCardEntry> | null = null;
  if (unknownDbfIds.size > 0) {
    try { fullSet = await getFullCardSet(); } catch {}
  }

  const companionCards: Record<string, CompanionCard> = {};
  if (fullSet) {
    for (const id of unknownDbfIds) {
      const full = fullSet.get(id);
      if (full) {
        companionCards[String(id)] = {
          id: full.id,
          name: full.name,
          cost: full.cost,
          type: full.type,
          set: full.set,
          rarity: full.rarity,
          cardClass: full.cardClass,
        };
      }
    }
  }

  for (const d of decks) {
    for (const [compDbfId, ownerDbfId] of d.sideboardPairs ?? []) {
      const comp = companionCards[String(compDbfId)];
      if (comp) comp.ownerDbfId = ownerDbfId;
    }
  }

  return { archetypes, decks, companionCards, fetchedAt: Date.now(), source: 'hsguru' };
}

function augmentWithHsguru(data: DeckCacheEntry, hsguruArchetypes: ArchetypeInfo[]): DeckCacheEntry {
  const guruMap = new Map<string, ArchetypeInfo>();
  for (const a of hsguruArchetypes) {
    guruMap.set(`${a.playerClass}:${a.name.toLowerCase()}`, a);
  }

  const augmented = data.archetypes.map(arch => {
    const key = `${arch.playerClass}:${arch.name.toLowerCase()}`;
    const guru = guruMap.get(key);
    if (!guru) return arch;
    return {
      ...arch,
      avgTurns: guru.avgTurns,
      avgDuration: guru.avgDuration,
      climbingSpeed: guru.climbingSpeed,
      pctOfTotal: arch.pctOfTotal ?? guru.pctOfTotal,
    };
  });

  return { ...data, archetypes: augmented };
}

app.get('/api/decks', optionalAuth, async (req: AuthRequest, res) => {
  const gameType = (req.query.gameType as string) || 'standard';
  const minGames = req.query.minGames ? parseInt(req.query.minGames as string) : undefined;

  if (gameType === 'wild') {
    let rank = (req.query.rank as string) || '';
    let period = (req.query.period as string) || '';
    const bracket = req.query.bracket as string | undefined;
    if (bracket && !rank) {
      const mapped = bracketToHsguru(bracket);
      rank = mapped.rank;
      period = mapped.period;
    }
    if (!rank) rank = 'diamond_to_legend';
    if (!period) period = 'past_week';
    const cacheKey = `wild_${rank}_${period}`;
    const cached = loadDeckCache(cacheKey);
    if (cached) {
      const effectiveMin = minGames ?? 50;
      const filtered = cached.decks.filter((d: DeckInfo) => d.totalGames >= effectiveMin);
      res.json({ ...cached, decks: filtered });
      return;
    }
    try {
      const data = await fetchWildDeckData(rank, period, true);
      saveDeckCache(cacheKey, data);
      const effectiveMin = minGames ?? 50;
      res.json({ ...data, decks: data.decks.filter(d => d.totalGames >= effectiveMin) });
    } catch (err) {
      console.error('[Decks] Wild fetch failed:', err);
      res.json({ archetypes: [], decks: [], companionCards: {}, fetchedAt: 0, source: 'hsguru' });
    }
    return;
  }

  const bracketKey = (req.query.bracket as string) || FREE_BRACKET;
  const validKey = ALL_BRACKETS.some(b => b.key === bracketKey);
  const effectiveKey = validKey ? bracketKey : FREE_BRACKET;

  let data = loadDeckData(effectiveKey);
  if (!data) {
    if (effectiveKey !== FREE_BRACKET) {
      data = loadDeckData(FREE_BRACKET);
    }
  }

  if (!data) {
    res.json({ archetypes: [], decks: [], companionCards: {}, fetchedAt: 0, source: 'hsreplay' });
    return;
  }

  if (minGames && minGames !== MIN_DECK_GAMES) {
    data = { ...data, decks: data.decks.filter(d => d.totalGames >= minGames) };
  }

  try {
    const hsguruStandard = await fetchHsguruMeta(2);
    data = augmentWithHsguru(data, hsguruStandard);
  } catch {
    // HSGuru augmentation is best-effort
  }

  res.json(data);
});

app.get('/api/decks/matchups/:slug', optionalAuth, async (req: AuthRequest, res) => {
  const slug = req.params.slug;
  const format = (req.query.format as string) === '1' ? 1 : 2;
  let rank = (req.query.rank as string) || '';
  let period = (req.query.period as string) || '';
  const bracket = req.query.bracket as string | undefined;
  if (bracket && !rank) {
    const mapped = bracketToHsguru(bracket);
    rank = mapped.rank;
    period = mapped.period;
  }
  if (!rank) rank = 'diamond_to_legend';
  if (!period) period = 'past_week';

  try {
    const matchups = await fetchHsguruMatchups(slug, format as 1 | 2, rank, period);
    res.json({ matchups });
  } catch (err) {
    console.error(`[Decks] Matchup fetch failed for ${slug}:`, err);
    res.json({ matchups: [] });
  }
});

app.get('/api/settings', authenticateUser, (req: AuthRequest, res) => {
  const settingsPath = join(req.userDir!, 'settings.json');
  if (!existsSync(settingsPath)) { res.json({}); return; }
  try { res.json(JSON.parse(readFileSync(settingsPath, 'utf-8'))); }
  catch { res.json({}); }
});

app.put('/api/settings', authenticateUser, (req: AuthRequest, res) => {
  const settingsPath = join(req.userDir!, 'settings.json');
  let current: Record<string, unknown> = {};
  if (existsSync(settingsPath)) {
    try { current = JSON.parse(readFileSync(settingsPath, 'utf-8')); } catch { /* empty */ }
  }
  const updated = { ...current, ...req.body };
  writeFileSync(settingsPath, JSON.stringify(updated, null, 2));
  res.json(updated);
});

const MAX_SNAPSHOTS = 365;

app.get('/api/snapshots', authenticateUser, (req: AuthRequest, res) => {
  const snapshotsPath = join(req.userDir!, 'snapshots.json');
  if (!existsSync(snapshotsPath)) { res.json([]); return; }
  try { res.json(JSON.parse(readFileSync(snapshotsPath, 'utf-8'))); }
  catch { res.json([]); }
});

app.post('/api/snapshots', authenticateUser, (req: AuthRequest, res) => {
  const snapshotsPath = join(req.userDir!, 'snapshots.json');
  let existing: unknown[] = [];
  if (existsSync(snapshotsPath)) {
    try { existing = JSON.parse(readFileSync(snapshotsPath, 'utf-8')); } catch { /* empty */ }
  }
  const snapshot = req.body;
  const deduped = (existing as Array<{ timestamp: number }>).filter(s => s.timestamp !== snapshot.timestamp);
  const updated = [...deduped, snapshot]
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-MAX_SNAPSHOTS);
  writeFileSync(snapshotsPath, JSON.stringify(updated));
  res.json({ saved: true, count: updated.length });
});

app.delete('/api/snapshots', authenticateUser, (req: AuthRequest, res) => {
  const snapshotsPath = join(req.userDir!, 'snapshots.json');
  if (existsSync(snapshotsPath)) unlinkSync(snapshotsPath);
  res.json({ cleared: true });
});

const pendingArtFetches = new Map<string, Promise<Buffer | null>>();

interface FetchResult { buffer: Buffer | null; status: number; retryAfter: number }

async function tryFetchArt(url: string, timeoutMs = 8000): Promise<FetchResult> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (response.ok) return { buffer: Buffer.from(await response.arrayBuffer()), status: 200, retryAfter: 0 };
    const ra = parseInt(response.headers.get('retry-after') || '0', 10);
    const retryAfter = (ra > 0 ? ra : 30) * 1000;
    return { buffer: null, status: response.status, retryAfter };
  } catch {
    return { buffer: null, status: 0, retryAfter: 5000 };
  }
}

async function tryFetchWithFallback(
  url: string, cacheKey: string, timeoutMs?: number,
): Promise<{ buffer: Buffer | null; status: number; retryAfter: number }> {
  const result = await tryFetchArt(url, timeoutMs);
  if (result.buffer || result.status !== 404) return result;
  const variant = variantFromCacheKey(cacheKey);
  const fallbackFn = ART_FALLBACKS[variant];
  if (!fallbackFn) return result;
  const cardId = cacheKey.slice(0, cacheKey.lastIndexOf('_'));
  return tryFetchArt(fallbackFn(cardId), timeoutMs);
}

function scheduleArtRetries(cacheKey: string, url: string, initialRetryAfter = 0) {
  const cacheFile = join(CARD_ART_CACHE, `${cacheKey}.png`);
  const lowFile = join(CARD_ART_CACHE, `${cacheKey}.low.png`);
  const missFile = join(CARD_ART_CACHE, `${cacheKey}.miss`);
  const delays = [3000, 10000, 30000];
  let attempt = 0;

  function retry(delay: number) {
    if (attempt >= 5) return;
    if (existsSync(cacheFile)) return;

    setTimeout(async () => {
      const result = await tryFetchArt(url, 12000);
      if (result.buffer) {
        await cacheNormalized(cacheFile, result.buffer);
        if (existsSync(lowFile)) unlinkSync(lowFile);
      } else if (result.status === 404) {
        writeFileSync(missFile, '');
      } else if (result.status === 429) {
        attempt++;
        retry(result.retryAfter);
      } else {
        attempt++;
        retry(delays[Math.min(attempt, delays.length - 1)]);
      }
    }, delay);
  }

  retry(initialRetryAfter || delays[0]);
}

async function fetchAndCacheArt(cacheKey: string, url: string): Promise<Buffer | null> {
  const cacheFile = join(CARD_ART_CACHE, `${cacheKey}.png`);
  const lowFile = join(CARD_ART_CACHE, `${cacheKey}.low.png`);
  const missFile = join(CARD_ART_CACHE, `${cacheKey}.miss`);

  if (existsSync(cacheFile)) return readFileSync(cacheFile);
  if (existsSync(lowFile)) return readFileSync(lowFile);
  if (existsSync(missFile)) return null;

  const existing = pendingArtFetches.get(cacheKey);
  if (existing) return existing;

  const promise = (async (): Promise<Buffer | null> => {
    const result = await tryFetchArt(url);
    if (result.buffer) {
      if (existsSync(lowFile)) unlinkSync(lowFile);
      return await cacheNormalized(cacheFile, result.buffer);
    }
    if (result.status === 404) {
      const variant = variantFromCacheKey(cacheKey);
      const fallbackFn = ART_FALLBACKS[variant];
      if (fallbackFn) {
        const cardId = cacheKey.slice(0, cacheKey.lastIndexOf('_'));
        const fbResult = await tryFetchArt(fallbackFn(cardId));
        if (fbResult.buffer) return await cacheNormalized(cacheFile, fbResult.buffer);
      }
      writeFileSync(missFile, '');
      return null;
    }
    const variant = variantFromCacheKey(cacheKey);
    const fallbackFn = ART_FALLBACKS[variant];
    if (fallbackFn) {
      const cardId = cacheKey.slice(0, cacheKey.lastIndexOf('_'));
      const fbResult = await tryFetchArt(fallbackFn(cardId));
      if (fbResult.buffer) await cacheNormalized(lowFile, fbResult.buffer);
    }
    scheduleArtRetries(cacheKey, url, result.retryAfter);
    return existsSync(lowFile) ? readFileSync(lowFile) : null;
  })();

  pendingArtFetches.set(cacheKey, promise);
  promise.finally(() => pendingArtFetches.delete(cacheKey));
  return promise;
}

app.get('/api/card-art/:cardId/:variant', async (req, res) => {
  const { cardId, variant } = req.params;
  const sourceFn = ART_SOURCES[variant];
  if (!sourceFn) { res.status(400).end(); return; }

  const cacheKey = `${cardId}_${variant}`;
  const cacheFile = join(CARD_ART_CACHE, `${cacheKey}.png`);
  const lowFile = join(CARD_ART_CACHE, `${cacheKey}.low.png`);
  const missFile = join(CARD_ART_CACHE, `${cacheKey}.miss`);

  if (existsSync(cacheFile)) {
    res.sendFile(cacheFile, { headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } });
    return;
  }
  if (existsSync(lowFile)) {
    res.sendFile(lowFile, { headers: { 'Cache-Control': 'public, max-age=60' } });
    return;
  }

  if (existsSync(missFile)) {
    res.set('Cache-Control', 'no-cache');
    res.status(404).end();
    return;
  }

  const buffer = await fetchAndCacheArt(cacheKey, sourceFn(cardId));
  if (buffer) {
    res.set('Content-Type', 'image/png');
    const isHq = existsSync(cacheFile);
    res.set('Cache-Control', isHq ? 'public, max-age=31536000, immutable' : 'public, max-age=60');
    res.send(buffer);
  } else {
    res.set('Cache-Control', 'no-store');
    res.status(404).end();
  }
});

const prefetchProgress = { running: false, variant: '', done: 0, total: 0 };

app.get('/api/prefetch-status', (_req, res) => {
  res.json(prefetchProgress);
});

app.get('/api/card-art/cache-stats', (_req, res) => {
  const totalCards = cardDb ? Object.keys(cardDb).length : 0;

  let sigTotal = 0, diaTotal = 0;
  if (cardDb) {
    for (const card of Object.values(cardDb)) {
      if (card.hasSignature) sigTotal++;
      if (card.hasDiamond) diaTotal++;
    }
  }

  const empty = (total: number) => ({ cached: 0, missed: 0, total });
  if (!existsSync(CARD_ART_CACHE)) {
    res.json({ cached: 0, missed: 0, totalCards, variants: { normal: empty(totalCards), golden: empty(totalCards), signature: empty(sigTotal), diamond: empty(diaTotal) } });
    return;
  }
  const files = readdirSync(CARD_ART_CACHE);
  const variants: Record<string, { cached: number; missed: number; total: number }> = {
    normal: { cached: 0, missed: 0, total: totalCards },
    golden: { cached: 0, missed: 0, total: totalCards },
    signature: { cached: 0, missed: 0, total: sigTotal },
    diamond: { cached: 0, missed: 0, total: diaTotal },
  };
  let cached = 0, missed = 0;
  for (const f of files) {
    const isPng = f.endsWith('.png');
    const isMiss = f.endsWith('.miss');
    if (!isPng && !isMiss) continue;
    if (isPng) cached++;
    if (isMiss) missed++;
    const m = f.match(/_([a-z]+(?:-lg)?)\.(png|miss)$/);
    if (!m) continue;
    const v = m[1];
    if (v === 'normal-lg') continue;
    if (variants[v]) {
      if (isPng) variants[v].cached++;
      if (isMiss) variants[v].missed++;
    }
  }
  res.json({ cached, missed, totalCards, variants });
});

const distDir = join(__dirname, '..', 'dist');
if (existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('{*path}', (_req, res) => {
    res.sendFile(join(distDir, 'index.html'));
  });
}

const ART_VARIANTS = ['normal', 'normal-lg', 'golden', 'signature', 'diamond'];

function invalidateArtForCards(cardIds: string[]): number {
  if (cardIds.length === 0 || !existsSync(CARD_ART_CACHE)) return 0;
  let removed = 0;
  for (const cardId of cardIds) {
    for (const variant of ART_VARIANTS) {
      const missFile = join(CARD_ART_CACHE, `${cardId}_${variant}.miss`);
      if (existsSync(missFile)) {
        unlinkSync(missFile);
        removed++;
      }
    }
  }
  if (removed > 0) console.log(`[ArtCache] Cleared ${removed} miss markers for ${cardIds.length} changed cards`);
  return removed;
}

async function prefetchCardsById(db: CardDb, cardIds: string[]): Promise<void> {
  const idSet = new Set(cardIds);
  const cards = Object.values(db).filter(c => idSet.has(c.id));

  console.log(`[Prefetch] Re-fetching art for ${cards.length} changed cards`);

  for (const variant of ['normal', 'golden', 'signature', 'diamond'] as const) {
    const sourceFn = ART_SOURCES[variant];
    if (!sourceFn) continue;
    const tasks: PrefetchTask[] = [];
    for (const card of cards) {
      if (variant === 'signature' && !card.hasSignature) continue;
      if (variant === 'diamond' && !card.hasDiamond) continue;
      const cacheKey = `${card.id}_${variant}`;
      if (existsSync(join(CARD_ART_CACHE, `${cacheKey}.png`))) continue;
      tasks.push({ cacheKey, url: sourceFn(card.id) });
    }
    if (tasks.length > 0) {
      const stats = await prefetchBatch(tasks, 3, 500);
      console.log(`[Prefetch] ${variant}: re-fetched ${stats.fetched}/${tasks.length} for changed cards`);
      for (const task of stats.notFound) {
        writeFileSync(join(CARD_ART_CACHE, `${task.cacheKey}.miss`), '');
      }
    }
  }
}

interface PrefetchTask { cacheKey: string; url: string; lowQuality?: boolean }

async function prefetchBatch(
  tasks: PrefetchTask[],
  concurrency: number,
  delayMs: number,
): Promise<{ fetched: number; notFound: PrefetchTask[]; rateLimited: number }> {
  let fetched = 0, rateLimited = 0;
  const notFound: PrefetchTask[] = [];
  let i = 0;
  let rateLimitPauseUntil = 0;

  async function worker() {
    while (i < tasks.length) {
      const now = Date.now();
      if (rateLimitPauseUntil > now) {
        await new Promise(r => setTimeout(r, rateLimitPauseUntil - now));
      }

      const idx = i++;
      if (idx >= tasks.length) break;
      const task = tasks[idx];
      const ext = task.lowQuality ? '.low.png' : '.png';
      const cacheFile = join(CARD_ART_CACHE, `${task.cacheKey}${ext}`);

      const result = await tryFetchArt(task.url);
      if (result.buffer) {
        await cacheNormalized(cacheFile, result.buffer);
        if (!task.lowQuality) {
          const lowFile = join(CARD_ART_CACHE, `${task.cacheKey}.low.png`);
          if (existsSync(lowFile)) unlinkSync(lowFile);
        }
        fetched++;
      } else if (result.status === 404) {
        notFound.push(task);
      } else if (result.status === 429) {
        rateLimited++;
        const pause = result.retryAfter || 60000;
        rateLimitPauseUntil = Date.now() + pause;
        console.log(`[Prefetch] 429 rate limited, all workers pausing ${pause / 1000}s`);
        i = idx;
        continue;
      }
      prefetchProgress.done++;
      if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs));
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
  return { fetched, notFound, rateLimited };
}

async function prefetchCardArt(db: CardDb): Promise<void> {
  const cards = Object.values(db);

  let collectionData: Record<string, number[]> = {};
  const usersPath = join(DATA_DIR, 'users');
  if (existsSync(usersPath)) {
    for (const dir of readdirSync(usersPath, { withFileTypes: true })) {
      if (!dir.isDirectory()) continue;
      const collPath = join(usersPath, dir.name, 'collection.json');
      if (!existsSync(collPath)) continue;
      try {
        const raw = JSON.parse(readFileSync(collPath, 'utf-8'));
        const coll = raw.collection ?? {};
        for (const [id, counts] of Object.entries(coll) as [string, number[]][]) {
          if (!collectionData[id]) { collectionData[id] = [...counts]; continue; }
          for (let i = 0; i < counts.length; i++) {
            collectionData[id][i] = Math.max(collectionData[id][i] || 0, counts[i] || 0);
          }
        }
      } catch { /* skip */ }
    }
  }

  const ownedCardIds = new Set<string>();
  const ownedDiamondIds = new Set<string>();
  const ownedSignatureIds = new Set<string>();
  for (const [dbfId, card] of Object.entries(db)) {
    const counts = collectionData[dbfId];
    if (!counts) continue;
    if ((counts[0] || 0) + (counts[1] || 0) + (counts[2] || 0) + (counts[3] || 0) > 0)
      ownedCardIds.add(card.id);
    if ((counts[2] || 0) > 0) ownedDiamondIds.add(card.id);
    if ((counts[3] || 0) > 0) ownedSignatureIds.add(card.id);
  }

  console.log(`[Prefetch] Collection: ${ownedCardIds.size} owned, ${ownedDiamondIds.size} diamond, ${ownedSignatureIds.size} signature`);

  const hasSig = (c: CardDbEntry) => c.hasSignature === true;
  const hasDia = (c: CardDbEntry) => c.hasDiamond === true;
  const isOwned = (c: CardDbEntry) => ownedCardIds.has(c.id);
  const isNotOwned = (c: CardDbEntry) => !ownedCardIds.has(c.id);

  interface PassConfig {
    label: string
    variant: string
    concurrency: number
    delayMs: number
    maxRetries: number
    filter: (card: CardDbEntry) => boolean
    lowQuality?: boolean
    sourceOverride?: (id: string) => string
  }

  const normalFallback = ART_FALLBACKS.normal;
  const passes: PassConfig[] = [
    // Phase 0: Quick low-quality normals from HearthstoneJSON (fast, no rate limits)
    ...(normalFallback ? [
      { label: 'quick-owned-normal', variant: 'normal', concurrency: 10, delayMs: 50, maxRetries: 1,
        filter: isOwned, lowQuality: true, sourceOverride: normalFallback } as PassConfig,
      { label: 'quick-all-normal', variant: 'normal', concurrency: 10, delayMs: 50, maxRetries: 1,
        filter: isNotOwned, lowQuality: true, sourceOverride: normalFallback } as PassConfig,
    ] : []),
    // Phase 1: High-quality owned cards from wiki.gg
    { label: 'owned-normal', variant: 'normal', concurrency: 5, delayMs: 200, maxRetries: 3,
      filter: isOwned },
    { label: 'owned-diamond', variant: 'diamond', concurrency: 3, delayMs: 500, maxRetries: 3,
      filter: (c) => hasDia(c) && ownedDiamondIds.has(c.id) },
    { label: 'owned-signature', variant: 'signature', concurrency: 3, delayMs: 500, maxRetries: 3,
      filter: (c) => hasSig(c) && ownedSignatureIds.has(c.id) },
    { label: 'owned-golden', variant: 'golden', concurrency: 3, delayMs: 500, maxRetries: 5,
      filter: isOwned },
    // Phase 2: All HQ normals from wiki.gg
    { label: 'unowned-normal', variant: 'normal', concurrency: 5, delayMs: 200, maxRetries: 3,
      filter: isNotOwned },
    // Phase 3: All premium (not golden)
    { label: 'all-diamond', variant: 'diamond', concurrency: 3, delayMs: 500, maxRetries: 3,
      filter: hasDia },
    { label: 'all-signature', variant: 'signature', concurrency: 3, delayMs: 500, maxRetries: 3,
      filter: hasSig },
    // Phase 4: Golden LAST
    { label: 'all-golden', variant: 'golden', concurrency: 3, delayMs: 500, maxRetries: 5,
      filter: () => true },
  ];

  const eligibleCounts = passes.map(p => cards.filter(p.filter).length);
  const totalAll = eligibleCounts.reduce((s, n) => s + n, 0);

  prefetchProgress.running = true;
  prefetchProgress.total = totalAll;
  prefetchProgress.done = 0;

  for (const pass of passes) {
    const { label, variant, concurrency, delayMs, maxRetries, filter, lowQuality, sourceOverride } = pass;
    prefetchProgress.variant = label;
    const sourceFn = sourceOverride ?? ART_SOURCES[variant];
    if (!sourceFn) continue;

    const eligible = cards.filter(filter);

    const tasks: PrefetchTask[] = [];
    for (const card of eligible) {
      const cacheKey = `${card.id}_${variant}`;
      const hqExists = existsSync(join(CARD_ART_CACHE, `${cacheKey}.png`));
      const lowExists = existsSync(join(CARD_ART_CACHE, `${cacheKey}.low.png`));
      const missExists = existsSync(join(CARD_ART_CACHE, `${cacheKey}.miss`));
      if (lowQuality ? (hqExists || lowExists || missExists) : (hqExists || missExists)) {
        prefetchProgress.done++;
        continue;
      }
      tasks.push({ cacheKey, url: sourceFn(card.id), lowQuality });
    }

    if (tasks.length > 0) {
      let remaining = tasks;
      let totalFetched = 0;

      for (let round = 0; round < maxRetries && remaining.length > 0; round++) {
        const isRetry = round > 0;
        if (isRetry) {
          const backoff = 15000 * round;
          console.log(`[Prefetch] ${label}: retry round ${round}, ${remaining.length} items, waiting ${backoff / 1000}s`);
          await new Promise(r => setTimeout(r, backoff));
        }
        const stats = await prefetchBatch(remaining, isRetry ? 2 : concurrency, isRetry ? delayMs * 2 : delayMs);
        totalFetched += stats.fetched;
        remaining = stats.notFound;

        if (!isRetry) {
          console.log(`[Prefetch] ${label}: ${stats.fetched} fetched, ${stats.notFound.length} not found, ${stats.rateLimited} rate-limited, ${eligible.length - tasks.length} cached`);
        } else {
          console.log(`[Prefetch] ${label} retry ${round}: ${stats.fetched} fetched, ${stats.notFound.length} still missing`);
        }
      }

      if (remaining.length > 0 && !lowQuality) {
        for (const task of remaining) {
          writeFileSync(join(CARD_ART_CACHE, `${task.cacheKey}.miss`), '');
        }
        console.log(`[Prefetch] ${label}: marked ${remaining.length} as missing after ${maxRetries} attempts`);
      }
    } else {
      console.log(`[Prefetch] ${label}: all ${eligible.length} already cached`);
    }
  }

  prefetchProgress.running = false;
  console.log('[Prefetch] Card art prefetching complete');
}

const SYNC_INTERVAL = 12 * 60 * 60 * 1000;
const PURGE_INTERVAL = 24 * 60 * 60 * 1000;

async function syncUserCollection(userDir: string, sessionId: string): Promise<{ success: boolean; cards: number; dust: number; collection: Record<string, number[]> }> {
  await setSessionCookie(sessionId);
  const acctResult = await fetchThroughBrowser('https://hsreplay.net/api/v1/account/');
  if (acctResult.status !== 200) return { success: false, cards: 0, dust: 0, collection: {} };

  let collectionUrl = 'https://hsreplay.net/api/v1/collection/';
  const acctData = JSON.parse(acctResult.body);
  const blizzAccounts = acctData?.blizzard_accounts;
  if (Array.isArray(blizzAccounts) && blizzAccounts.length > 0) {
    const acct = blizzAccounts[0];
    const params = new URLSearchParams();
    if (acct.account_lo) params.set('account_lo', String(acct.account_lo));
    if (acct.region) params.set('region', String(acct.region));
    collectionUrl += `?${params.toString()}`;
  }

  const result = await fetchThroughBrowser(collectionUrl);
  if (result.status !== 200) return { success: false, cards: 0, dust: 0, collection: {} };

  const data = JSON.parse(result.body);
  writeFileSync(join(userDir, 'collection.json'), JSON.stringify(data, null, 2));
  return { success: true, cards: Object.keys(data.collection || {}).length, dust: data.dust ?? 0, collection: data.collection ?? {} };
}

function buildSnapshot(collection: Record<string, number[]>, dust: number, db: CardDb): object {
  const expansions = getAllExpansions();
  const standardCodes = new Set(expansions.filter(e => e.standard).map(e => e.code));

  let overallOwned = 0, overallTotal = 0;
  let standardOwned = 0, standardTotal = 0;
  let wildOwned = 0, wildTotal = 0;
  const expMap = new Map<string, { owned: number; total: number }>();

  for (const [dbfId, card] of Object.entries(db)) {
    const maxCopies = card.rarity === 'LEGENDARY' ? 1 : 2;
    const counts = collection[dbfId] ?? [0, 0, 0, 0];
    const owned = Math.min(counts[0] + counts[1] + (counts[2] ?? 0) + (counts[3] ?? 0), maxCopies);

    overallOwned += owned;
    overallTotal += maxCopies;

    if (standardCodes.has(card.set)) {
      standardOwned += owned;
      standardTotal += maxCopies;
    }

    wildOwned += owned;
    wildTotal += maxCopies;

    const exp = expMap.get(card.set) || { owned: 0, total: 0 };
    exp.owned += owned;
    exp.total += maxCopies;
    expMap.set(card.set, exp);
  }

  return {
    timestamp: Date.now(),
    dust,
    overall: { owned: overallOwned, total: overallTotal },
    standard: { owned: standardOwned, total: standardTotal },
    wild: { owned: wildOwned, total: wildTotal },
    expansions: Array.from(expMap.entries()).map(([code, stats]) => ({ code, ...stats })),
  };
}

function saveSnapshotForUser(userDir: string, snapshot: object): boolean {
  const snapshotsPath = join(userDir, 'snapshots.json');
  let existing: unknown[] = [];
  if (existsSync(snapshotsPath)) {
    try { existing = JSON.parse(readFileSync(snapshotsPath, 'utf-8')); } catch { /* empty */ }
  }
  if (existing.length > 0) {
    const prev = existing[existing.length - 1] as any;
    const snap = snapshot as any;
    if (prev.overall?.owned === snap.overall?.owned && prev.dust === snap.dust) return false;
  }
  const updated = [...existing, snapshot]
    .sort((a: any, b: any) => a.timestamp - b.timestamp)
    .slice(-MAX_SNAPSHOTS);
  writeFileSync(snapshotsPath, JSON.stringify(updated));
  return true;
}

async function autoSyncAllUsers(): Promise<void> {
  const users = getAllUsers();
  if (users.length === 0) return;

  console.log(`[AutoSync] Checking ${users.length} user(s)`);
  for (const user of users) {
    const collPath = join(user.userDir, 'collection.json');
    if (existsSync(collPath)) {
      const { mtimeMs } = statSync(collPath);
      if (Date.now() - mtimeMs < SYNC_INTERVAL) continue;
    }

    try {
      const result = await syncUserCollection(user.userDir, user.tokenData.sessionId);
      if (result.success) {
        console.log(`[AutoSync] ${user.tokenData.battletag}: synced ${result.cards} cards`);
        if (cardDb) {
          const snapshot = buildSnapshot(result.collection, result.dust, cardDb);
          const saved = saveSnapshotForUser(user.userDir, snapshot);
          console.log(`[AutoSync] ${user.tokenData.battletag}: ${saved ? 'snapshot saved' : 'no changes, skipped snapshot'}`);
        }
      } else {
        console.log(`[AutoSync] ${user.tokenData.battletag}: sync failed (session may be expired)`);
      }
    } catch (err) {
      console.error(`[AutoSync] ${user.tokenData.battletag}: error`, err);
    }
  }
}

async function autoRefreshSharedData(force = false): Promise<void> {
  try {
    const cardDbAge = existsSync(CARD_DB_PATH) ? Date.now() - statSync(CARD_DB_PATH).mtimeMs : Infinity;
    if (force || cardDbAge > SYNC_INTERVAL) {
      console.log(`[AutoRefresh] Card DB ${force ? 'startup' : 'stale'}, refreshing...`);
      const { db } = await fetchAndCacheCardDb();
      cardDb = db;
      await initExpansions();
      console.log(`[AutoRefresh] Card DB refreshed: ${Object.keys(db).length} cards`);
    }
  } catch (err) {
    console.error('[AutoRefresh] Card DB refresh failed:', err);
  }

  try {
    await fetchAllDeckBrackets();
  } catch (err) {
    console.error('[AutoRefresh] Deck refresh failed:', err);
  }

  const wildCombos: [string, string][] = [
    ['diamond_to_legend', 'past_week'],
    ['all', 'past_week'],
    ['diamond_to_legend', 'past_2_weeks'],
    ['all', 'past_2_weeks'],
    ['diamond_to_legend', 'past_30_days'],
    ['all', 'past_30_days'],
  ];
  for (const [rank, period] of wildCombos) {
    const wildCacheKey = `wild_${rank}_${period}`;
    const existing = loadDeckCache(wildCacheKey);
    if (!existing) {
      try {
        console.log(`[AutoRefresh] Wild ${rank}/${period} missing, refreshing with full backfill...`);
        const wildData = await fetchWildDeckData(rank, period, true);
        saveDeckCache(wildCacheKey, wildData);
        console.log(`[AutoRefresh] Wild ${rank}/${period} refreshed: ${wildData.decks.length} decks`);
      } catch (err) {
        console.error(`[AutoRefresh] Wild ${rank}/${period} refresh failed:`, err);
      }
    }
  }

  try {
    if (isMetaStale()) {
      console.log('[AutoRefresh] Meta brackets stale, refreshing...');
      await fetchAllBrackets();
      console.log('[AutoRefresh] Meta brackets refreshed');
    }
  } catch (err) {
    console.error('[AutoRefresh] Meta bracket refresh failed:', err);
  }
}

initExpansions().then(async exps => {
  console.log(`Loaded ${exps.length} expansions (${exps.filter(e => e.standard).length} Standard)`);
  app.listen(PORT, () => {
    console.log(`Hearth Codex API: http://localhost:${PORT}`);
  });

  setInterval(() => { autoSyncAllUsers().catch(err => console.error('[AutoSync] Error:', err)); }, SYNC_INTERVAL);
  setInterval(() => { purgeInactiveUsers(); }, PURGE_INTERVAL);
  setInterval(() => { autoRefreshSharedData().catch(err => console.error('[AutoRefresh] Error:', err)); }, SYNC_INTERVAL);
  autoRefreshSharedData(true).catch(err => console.error('[AutoRefresh] Startup error:', err));

  if (!cardDb) cardDb = await getCardDb();
  migrateArtCache().catch(err => console.error('[ArtCache] Migration error:', err));
  if (!process.env.DISABLE_ART_PREFETCH) {
    prefetchCardArt(cardDb).catch(err => console.error('[Prefetch] Error:', err));
  } else {
    console.log('[Prefetch] Art prefetching disabled (DISABLE_ART_PREFETCH)');
  }
});
