import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync, readdirSync, unlinkSync } from 'fs';
import {
  getCardDb,
  fetchAndCacheCardDb,
  initExpansions,
  getAllExpansions,
  type CardDb,
} from './data.ts';
import { ensureCfReady, fetchThroughBrowser, setSessionCookie, getCfStatus, clearCfSession } from './cloudflare.ts';
import { initAuth, resolveUserByToken, createUser, updateSessionId, getAllUsers, purgeInactiveUsers, type TokenData } from './auth.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const CARD_DB_PATH = join(DATA_DIR, 'card-db.json');
const META_PATH = join(DATA_DIR, 'meta-stats.json');
const PORT = parseInt(process.env.PORT || '4000');
const HOSTED_MODE = !!process.env.HOSTED_MODE;

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
initAuth(DATA_DIR);

const CARD_ART_CACHE = join(DATA_DIR, 'card-art-cache');
mkdirSync(CARD_ART_CACHE, { recursive: true });

const ART_SOURCES: Record<string, (id: string) => string> = {
  normal: (id) => `https://art.hearthstonejson.com/v1/render/latest/enUS/256x/${id}.png`,
  'normal-lg': (id) => `https://art.hearthstonejson.com/v1/render/latest/enUS/512x/${id}.png`,
  golden: (id) => `https://hearthstone.wiki.gg/images/${id}_Premium1.png`,
  signature: (id) => `https://hearthstone.wiki.gg/images/${id}_Premium3.png`,
  diamond: (id) => `https://hearthstone.wiki.gg/images/${id}_Premium2.png`,
};

const startedAt = Date.now();
const app = express();
app.use(express.json());

app.use('/art', express.static(CARD_ART_CACHE, {
  maxAge: '7d',
  immutable: true,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
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
    res.set('Cache-Control', 'public, max-age=604800');
    res.status(404).end();
    return;
  }

  const buffer = await fetchAndCacheArt(cacheKey, sourceFn(cardId));
  if (buffer) {
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=604800, immutable');
    res.send(buffer);
  } else {
    res.set('Cache-Control', 'public, max-age=86400');
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

function rejectInHostedMode(_req: express.Request, res: express.Response, next: express.NextFunction): void {
  if (HOSTED_MODE) { res.status(403).json({ error: 'This action is disabled in hosted mode' }); return; }
  next();
}

app.post('/api/auth/register', async (req, res) => {
  const sessionId = req.body?.sessionId;
  if (!sessionId) {
    res.status(400).json({ error: 'sessionId is required' });
    return;
  }

  try {
    await setSessionCookie(sessionId);
    const acctResult = await fetchThroughBrowser('https://hsreplay.net/api/v1/account/');
    if (acctResult.status === 401) {
      res.status(400).json({ error: 'Invalid or expired HSReplay session cookie. Please get a fresh sessionid.' });
      return;
    }
    if (acctResult.status !== 200) {
      res.status(502).json({ error: `HSReplay returned ${acctResult.status}` });
      return;
    }

    const acctData = JSON.parse(acctResult.body);
    const blizzAccounts = acctData?.blizzard_accounts;
    if (!Array.isArray(blizzAccounts) || blizzAccounts.length === 0) {
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
    let cards = 0;
    let dust = 0;
    if (collResult.status === 200) {
      const data = JSON.parse(collResult.body);
      writeFileSync(join(user.userDir, 'collection.json'), JSON.stringify(data, null, 2));
      cards = Object.keys(data.collection || {}).length;
      dust = data.dust || 0;
    }

    res.json({ success: true, token: user.tokenData.token, battletag, accountLo, cards, dust });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

app.get('/api/auth/me', authenticateUser, (req: AuthRequest, res) => {
  const tokenPath = join(req.userDir!, 'token.json');
  if (!existsSync(tokenPath)) { res.status(404).json({ error: 'User not found' }); return; }
  const data: TokenData = JSON.parse(readFileSync(tokenPath, 'utf-8'));
  res.json({ battletag: data.battletag, accountLo: data.accountLo, region: data.region });
});

app.get('/api/data-status', (_req, res) => {
  const cardDbAge = existsSync(CARD_DB_PATH) ? statSync(CARD_DB_PATH).mtimeMs : 0;
  const metaAge = existsSync(META_PATH) ? statSync(META_PATH).mtimeMs : 0;
  const cf = getCfStatus();
  res.json({
    cardDb: { updatedAt: cardDbAge },
    meta: { updatedAt: metaAge },
    cf,
    hostedMode: HOSTED_MODE,
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
  res.json({ count: Object.keys(db).length, expansions: exps.length, changed: changedCardIds.length, invalidated });
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

  res.json({ queued: pngQueued, missCleared: missRemoved });
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

app.post('/api/collection/sync', authenticateUser, async (req: AuthRequest, res) => {
  const tokenPath = join(req.userDir!, 'token.json');
  const tokenData: TokenData = JSON.parse(readFileSync(tokenPath, 'utf-8'));
  const sessionId = req.body?.sessionId || tokenData.sessionId;

  if (!sessionId) {
    res.status(400).json({ error: 'No HSReplay session cookie available. Re-authenticate in Settings.' });
    return;
  }

  try {
    await setSessionCookie(sessionId);

    const acctResult = await fetchThroughBrowser('https://hsreplay.net/api/v1/account/');
    if (acctResult.status === 401) {
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

    if (req.body?.sessionId && req.body.sessionId !== tokenData.sessionId) {
      updateSessionId(req.userId!, req.body.sessionId);
    }

    const result = await fetchThroughBrowser(collectionUrl);

    if (result.status !== 200) {
      res.status(result.status).json({ error: `HSReplay returned ${result.status}` });
      return;
    }

    const collPath = join(req.userDir!, 'collection.json');
    const data = JSON.parse(result.body);
    writeFileSync(collPath, JSON.stringify(data, null, 2));
    const collection = data.collection as Record<string, unknown> | undefined;
    const dust = data.dust as number | undefined;

    let dbRefreshed = false;
    if (collection && cardDb) {
      const unknownIds = Object.keys(collection).filter(id => !cardDb![id]);
      if (unknownIds.length > 10) {
        console.log(`[Sync] ${unknownIds.length} unknown dbfIds — refreshing card DB`);
        try {
          const { db } = await fetchAndCacheCardDb();
          cardDb = db;
          await initExpansions();
          dbRefreshed = true;
        } catch (e) {
          console.error('[Sync] Auto-refresh card DB failed:', e);
        }
      }
    }

    res.json({
      success: true,
      cards: Object.keys(collection || {}).length,
      dust: dust || 0,
      syncedAt: Date.now(),
      dbRefreshed,
    });
  } catch (err: unknown) {
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
  if (!existsSync(META_PATH)) return true;
  const { mtimeMs } = statSync(META_PATH);
  return Date.now() - mtimeMs > META_STALE_MS;
}

async function fetchWithPoll(url: string, maxRetries = 12, delayMs = 10000): Promise<{ status: number; body: string } | null> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const res = await fetchThroughBrowser(url);
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
    console.log(`HSReplay returned ${res.status} for ${url}`);
    return null;
  }
  return null;
}

interface SplitMeta { standard: MetaDb; wild: MetaDb }

async function fetchMetaStats(): Promise<SplitMeta> {
  const result: SplitMeta = { standard: {}, wild: {} };

  for (const gameType of ['RANKED_STANDARD', 'RANKED_WILD'] as const) {
    const target = gameType === 'RANKED_STANDARD' ? result.standard : result.wild;
    try {
      const url = `https://hsreplay.net/analytics/query/card_list_free/?GameType=${gameType}&TimeRange=CURRENT_PATCH&LeagueRankRange=BRONZE_THROUGH_GOLD`;
      const res = await fetchWithPoll(url);
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

  const totalCards = Object.keys(result.standard).length + Object.keys(result.wild).length;
  if (totalCards > 0) {
    writeFileSync(META_PATH, JSON.stringify(result));
    console.log(`Meta stats cached: ${Object.keys(result.standard).length} standard, ${Object.keys(result.wild).length} wild`);
  }

  return result;
}

function loadMetaCache(): SplitMeta {
  if (!existsSync(META_PATH)) return { standard: {}, wild: {} };
  const raw = JSON.parse(readFileSync(META_PATH, 'utf-8'));
  if (raw.standard && raw.wild) return raw as SplitMeta;
  return { standard: raw as MetaDb, wild: {} };
}

app.get('/api/meta', async (_req, res) => {
  if (existsSync(META_PATH) && !isMetaStale()) {
    res.json(loadMetaCache());
    return;
  }
  try {
    const meta = await fetchMetaStats();
    res.json(meta);
  } catch {
    res.json(loadMetaCache());
  }
});

app.post('/api/meta/refresh', rejectInHostedMode, async (_req, res) => {
  try {
    const meta = await fetchMetaStats();
    res.json({ count: Object.keys(meta.standard).length + Object.keys(meta.wild).length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
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

function scheduleArtRetries(cacheKey: string, url: string, initialRetryAfter = 0) {
  const cacheFile = join(CARD_ART_CACHE, `${cacheKey}.png`);
  const missFile = join(CARD_ART_CACHE, `${cacheKey}.miss`);
  const delays = [3000, 10000, 30000];
  let attempt = 0;

  function retry(delay: number) {
    if (attempt >= 5) return;
    if (existsSync(cacheFile)) return;

    setTimeout(async () => {
      const result = await tryFetchArt(url, 12000);
      if (result.buffer) {
        writeFileSync(cacheFile, result.buffer);
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
  const missFile = join(CARD_ART_CACHE, `${cacheKey}.miss`);

  if (existsSync(cacheFile)) return readFileSync(cacheFile);
  if (existsSync(missFile)) return null;

  const existing = pendingArtFetches.get(cacheKey);
  if (existing) return existing;

  const promise = (async (): Promise<Buffer | null> => {
    const result = await tryFetchArt(url);
    if (result.buffer) {
      writeFileSync(cacheFile, result.buffer);
      return result.buffer;
    }
    if (result.status === 404) {
      writeFileSync(missFile, '');
      return null;
    }
    scheduleArtRetries(cacheKey, url, result.retryAfter);
    return null;
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
  const missFile = join(CARD_ART_CACHE, `${cacheKey}.miss`);

  if (existsSync(cacheFile)) {
    res.sendFile(cacheFile, { headers: { 'Cache-Control': 'public, max-age=604800' } });
    return;
  }

  if (existsSync(missFile)) {
    res.set('Cache-Control', 'public, max-age=604800');
    res.status(404).end();
    return;
  }

  const buffer = await fetchAndCacheArt(cacheKey, sourceFn(cardId));
  if (buffer) {
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=604800');
    res.send(buffer);
  } else {
    res.set('Cache-Control', 'public, max-age=86400');
    res.status(404).end();
  }
});

const prefetchProgress = { running: false, variant: '', done: 0, total: 0 };

app.get('/api/prefetch-status', (_req, res) => {
  res.json(prefetchProgress);
});

app.get('/api/card-art/cache-stats', (_req, res) => {
  const totalCards = cardDb ? Object.keys(cardDb).length : 0;

  const expansions = getAllExpansions();
  const sigEligibleSets = new Set(expansions.filter(e => e.yearNum >= 2022).map(e => e.code));
  let sigEligible = 0, diaEligible = 0;
  if (cardDb) {
    for (const card of Object.values(cardDb)) {
      if (sigEligibleSets.has(card.set)) sigEligible++;
      if (card.rarity === 'LEGENDARY') diaEligible++;
    }
  }

  const empty = (total: number) => ({ cached: 0, missed: 0, total });
  if (!existsSync(CARD_ART_CACHE)) {
    res.json({ cached: 0, missed: 0, totalCards, variants: { normal: empty(totalCards), golden: empty(totalCards), signature: empty(sigEligible), diamond: empty(diaEligible) } });
    return;
  }
  const files = readdirSync(CARD_ART_CACHE);
  const variants: Record<string, { cached: number; missed: number; total: number }> = {
    normal: { cached: 0, missed: 0, total: totalCards },
    golden: { cached: 0, missed: 0, total: totalCards },
    signature: { cached: 0, missed: 0, total: sigEligible },
    diamond: { cached: 0, missed: 0, total: diaEligible },
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
    const v = m[1] === 'normal-lg' ? 'normal' : m[1];
    if (variants[v]) {
      if (isPng) variants[v].cached++;
      if (isMiss) variants[v].missed++;
    }
  }
  res.json({ cached, missed, totalCards, variants });
});

app.get('/api/variant-availability', (_req, res) => {
  if (!existsSync(CARD_ART_CACHE)) {
    res.json({ signatureConfirmed: [], diamondConfirmed: [] });
    return;
  }
  const files = readdirSync(CARD_ART_CACHE);
  const signatureConfirmed: string[] = [];
  const diamondConfirmed: string[] = [];

  for (const file of files) {
    if (!file.endsWith('.png')) continue;
    if (file.endsWith('_signature.png')) {
      signatureConfirmed.push(file.replace('_signature.png', ''));
    } else if (file.endsWith('_diamond.png')) {
      diamondConfirmed.push(file.replace('_diamond.png', ''));
    }
  }

  res.json({ signatureConfirmed, diamondConfirmed });
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
  const expansions = getAllExpansions();
  const sigEligibleSets = new Set(expansions.filter(e => e.yearNum >= 2022).map(e => e.code));

  console.log(`[Prefetch] Re-fetching art for ${cards.length} changed cards`);

  for (const variant of ['normal', 'golden', 'signature', 'diamond'] as const) {
    const sourceFn = ART_SOURCES[variant];
    if (!sourceFn) continue;
    const tasks: PrefetchTask[] = [];
    for (const card of cards) {
      if (variant === 'signature' && !sigEligibleSets.has(card.set)) continue;
      if (variant === 'diamond' && card.rarity !== 'LEGENDARY') continue;
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

interface PrefetchTask { cacheKey: string; url: string }

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
      const cacheFile = join(CARD_ART_CACHE, `${task.cacheKey}.png`);

      const result = await tryFetchArt(task.url);
      if (result.buffer) {
        writeFileSync(cacheFile, result.buffer);
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
  const expansions = getAllExpansions();
  const sigEligibleSets = new Set(expansions.filter(e => e.yearNum >= 2022).map(e => e.code));

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

  const isOwned = (c: { id: string }) => ownedCardIds.has(c.id);
  const isNotOwned = (c: { id: string }) => !ownedCardIds.has(c.id);
  const isSigEligible = (c: { set: string }) => sigEligibleSets.has(c.set);

  interface PassConfig {
    label: string
    variant: string
    concurrency: number
    delayMs: number
    maxRetries: number
    filter: (card: { id: string; set: string; rarity: string }) => boolean
  }

  const passes: PassConfig[] = [
    // Phase 1: Premium variants we OWN
    { label: 'owned-diamond', variant: 'diamond', concurrency: 3, delayMs: 500, maxRetries: 3,
      filter: (c) => ownedDiamondIds.has(c.id) },
    { label: 'owned-signature', variant: 'signature', concurrency: 3, delayMs: 500, maxRetries: 3,
      filter: (c) => ownedSignatureIds.has(c.id) },
    // Phase 2: All other variants of owned cards
    { label: 'owned-normal', variant: 'normal', concurrency: 10, delayMs: 50, maxRetries: 1,
      filter: isOwned },
    { label: 'owned-golden', variant: 'golden', concurrency: 3, delayMs: 500, maxRetries: 5,
      filter: isOwned },
    { label: 'owned-sig-eligible', variant: 'signature', concurrency: 3, delayMs: 500, maxRetries: 3,
      filter: (c) => isOwned(c) && !ownedSignatureIds.has(c.id) && isSigEligible(c) },
    { label: 'owned-diamond-eligible', variant: 'diamond', concurrency: 3, delayMs: 500, maxRetries: 3,
      filter: (c) => isOwned(c) && !ownedDiamondIds.has(c.id) && c.rarity === 'LEGENDARY' },
    // Phase 3: Unowned cards
    { label: 'unowned-normal', variant: 'normal', concurrency: 10, delayMs: 50, maxRetries: 1,
      filter: isNotOwned },
    { label: 'unowned-golden', variant: 'golden', concurrency: 3, delayMs: 500, maxRetries: 5,
      filter: isNotOwned },
    { label: 'unowned-signature', variant: 'signature', concurrency: 3, delayMs: 500, maxRetries: 3,
      filter: (c) => isNotOwned(c) && isSigEligible(c) },
    { label: 'unowned-diamond', variant: 'diamond', concurrency: 3, delayMs: 500, maxRetries: 3,
      filter: (c) => isNotOwned(c) && c.rarity === 'LEGENDARY' },
  ];

  const eligibleCounts = passes.map(p => cards.filter(p.filter).length);
  const totalAll = eligibleCounts.reduce((s, n) => s + n, 0);

  prefetchProgress.running = true;
  prefetchProgress.total = totalAll;
  prefetchProgress.done = 0;

  for (const pass of passes) {
    const { label, variant, concurrency, delayMs, maxRetries, filter } = pass;
    prefetchProgress.variant = label;
    const sourceFn = ART_SOURCES[variant];
    if (!sourceFn) continue;

    const eligible = cards.filter(filter);

    const tasks: PrefetchTask[] = [];
    for (const card of eligible) {
      const cacheKey = `${card.id}_${variant}`;
      if (existsSync(join(CARD_ART_CACHE, `${cacheKey}.png`)) || existsSync(join(CARD_ART_CACHE, `${cacheKey}.miss`))) {
        prefetchProgress.done++;
        continue;
      }
      tasks.push({ cacheKey, url: sourceFn(card.id) });
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

      if (remaining.length > 0) {
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

function saveSnapshotForUser(userDir: string, snapshot: object): void {
  const snapshotsPath = join(userDir, 'snapshots.json');
  let existing: unknown[] = [];
  if (existsSync(snapshotsPath)) {
    try { existing = JSON.parse(readFileSync(snapshotsPath, 'utf-8')); } catch { /* empty */ }
  }
  const updated = [...existing, snapshot]
    .sort((a: any, b: any) => a.timestamp - b.timestamp)
    .slice(-MAX_SNAPSHOTS);
  writeFileSync(snapshotsPath, JSON.stringify(updated));
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
          saveSnapshotForUser(user.userDir, snapshot);
          console.log(`[AutoSync] ${user.tokenData.battletag}: snapshot saved`);
        }
      } else {
        console.log(`[AutoSync] ${user.tokenData.battletag}: sync failed (session may be expired)`);
      }
    } catch (err) {
      console.error(`[AutoSync] ${user.tokenData.battletag}: error`, err);
    }
  }
}

async function autoRefreshSharedData(): Promise<void> {
  try {
    const cardDbAge = existsSync(CARD_DB_PATH) ? Date.now() - statSync(CARD_DB_PATH).mtimeMs : Infinity;
    if (cardDbAge > SYNC_INTERVAL) {
      console.log('[AutoRefresh] Card DB stale, refreshing...');
      const { db } = await fetchAndCacheCardDb();
      cardDb = db;
      await initExpansions();
      console.log(`[AutoRefresh] Card DB refreshed: ${Object.keys(db).length} cards`);
    }
  } catch (err) {
    console.error('[AutoRefresh] Card DB refresh failed:', err);
  }

  try {
    if (isMetaStale()) {
      console.log('[AutoRefresh] Meta stats stale, refreshing...');
      await fetchMetaStats();
      console.log('[AutoRefresh] Meta stats refreshed');
    }
  } catch (err) {
    console.error('[AutoRefresh] Meta stats refresh failed:', err);
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

  if (!cardDb) cardDb = await getCardDb();
  if (!process.env.DISABLE_ART_PREFETCH) {
    prefetchCardArt(cardDb).catch(err => console.error('[Prefetch] Error:', err));
  } else {
    console.log('[Prefetch] Art prefetching disabled (DISABLE_ART_PREFETCH)');
  }
});
