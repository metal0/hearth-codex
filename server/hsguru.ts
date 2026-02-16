import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import WsWebSocket from 'ws';
import { type ArchetypeInfo, type DeckInfo, decodeDeckstring, HERO_DBFIDS } from './decks.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, '..', 'data', 'deck-cache');
const CACHE_TTL = 4 * 60 * 60 * 1000;
const BASE_URL = 'https://www.hsguru.com';
const WS_URL = 'wss://www.hsguru.com/live/websocket';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const WS_TIMEOUT_MS = 30_000;
const WS_PAGE_DELAY_MS = 500;

const CLASS_MAP: Record<string, string> = {
  deathknight: 'DEATHKNIGHT',
  demonhunter: 'DEMONHUNTER',
  druid: 'DRUID',
  hunter: 'HUNTER',
  mage: 'MAGE',
  paladin: 'PALADIN',
  priest: 'PRIEST',
  rogue: 'ROGUE',
  shaman: 'SHAMAN',
  warlock: 'WARLOCK',
  warrior: 'WARRIOR',
};

export interface HsguruMatchup {
  opponentClass: string;
  winRate: number;
  totalGames: number;
}

function hashName(name: string, cls: string): number {
  let h = 0;
  const s = `${cls}:${name}`;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function readCache<T>(key: string): T | null {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  const path = join(CACHE_DIR, `hsguru_${key}.json`);
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8'));
    if (Date.now() - raw.fetchedAt < CACHE_TTL) return raw.data as T;
  } catch {}
  return null;
}

function writeCache<T>(key: string, data: T): void {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  const path = join(CACHE_DIR, `hsguru_${key}.json`);
  writeFileSync(path, JSON.stringify({ fetchedAt: Date.now(), data }));
}

async function fetchPage(url: string): Promise<string> {
  const resp = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!resp.ok) throw new Error(`HSGuru fetch failed: ${resp.status} ${url}`);
  return resp.text();
}

async function fetchPageWithCookies(url: string): Promise<{ html: string; cookies: string }> {
  const resp = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!resp.ok) throw new Error(`HSGuru fetch failed: ${resp.status} ${url}`);
  const html = await resp.text();
  const setCookies = resp.headers.getSetCookie?.() ?? [];
  const cookies = setCookies.map(c => c.split(';')[0]).join('; ');
  return { html, cookies };
}

const DECK_BLOCK_RE = /id="deck_stats-(\d+)"[\s\S]*?<div class="decklist-info (\w+)"[\s\S]*?data-clipboard-text="(AAE[A-Za-z0-9+/=]+)"[\s\S]*?href="\/deck\/\d+">([\s\S]*?)<\/a>[\s\S]*?dust-bar[\s\S]*?(\d[\d,]*)\s*<span[\s\S]*?<span>([0-9.]+)<\/span>[\s\S]*?Games:\s*(\d[\d,]*)/g;

function parseDecksFromHtml(html: string): DeckInfo[] {
  const decks: DeckInfo[] = [];
  const re = new RegExp(DECK_BLOCK_RE.source, 'g');
  let match;
  while ((match = re.exec(html)) !== null) {
    const deckId = match[1];
    const cssClass = match[2];
    const deckstring = match[3];
    const archetypeName = match[4].trim();
    const winRate = parseFloat(match[6]);
    const totalGames = parseInt(match[7].replace(/,/g, ''));
    const playerClass = CLASS_MAP[cssClass] || cssClass.toUpperCase();

    let cards: [number, number][] = [];
    try {
      cards = decodeDeckstring(deckstring).cards;
    } catch {
      continue;
    }

    decks.push({
      deckId: `hsguru-${deckId}`,
      archetypeId: hashName(archetypeName, playerClass),
      playerClass,
      winRate,
      totalGames,
      cards,
      deckstring,
    });
  }
  return decks;
}

function findDArrays(obj: unknown): unknown[][] {
  const results: unknown[][] = [];
  function walk(node: unknown): void {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    const rec = node as Record<string, unknown>;
    if (Array.isArray(rec.d)) results.push(rec.d as unknown[]);
    for (const val of Object.values(rec)) walk(val);
  }
  walk(obj);
  return results;
}

function parseDecksFromDiff(payload: unknown): DeckInfo[] {
  const decks: DeckInfo[] = [];
  const dArrays = findDArrays(payload);

  for (const dArr of dArrays) {
    for (const entry of dArr) {
      if (!Array.isArray(entry) || entry.length < 2) continue;
      const idStr = typeof entry[0] === 'string' ? entry[0] : '';
      const idMatch = idStr.match(/deck_stats-(\d+)/);
      if (!idMatch) continue;

      const str = JSON.stringify(entry[1]);

      const classMatch = str.match(/decklist-info (\w+)/);
      if (!classMatch) continue;

      const dsMatch = str.match(/(AAE[A-Za-z0-9+/=]{20,})/);
      if (!dsMatch) continue;

      const nameMatch = str.match(/\/deck\/\d+\\"","3":"([^"]+)"/);
      if (!nameMatch) continue;

      const wrMatch = str.match(/tag column.*?"0":"(\d+\.\d+)"/);
      if (!wrMatch) continue;

      const tagIdx = str.lastIndexOf('tag column');
      const gamesMatch = tagIdx >= 0 ? str.slice(tagIdx).match(/"1":\{"0":"(\d{3,})"/) : null;
      if (!gamesMatch) continue;

      const deckId = idMatch[1];
      const cssClass = classMatch[1];
      const deckstring = dsMatch[1];
      const archetypeName = nameMatch[1];
      const winRate = parseFloat(wrMatch[1]);
      const totalGames = parseInt(gamesMatch[1]);
      const playerClass = CLASS_MAP[cssClass] || cssClass.toUpperCase();

      let cards: [number, number][] = [];
      try {
        cards = decodeDeckstring(deckstring).cards;
      } catch {
        continue;
      }

      decks.push({
        deckId: `hsguru-${deckId}`,
        archetypeId: hashName(archetypeName, playerClass),
        playerClass,
        winRate,
        totalGames,
        cards,
        deckstring,
      });
    }
  }

  return decks;
}

interface LiveViewTokens {
  csrf: string;
  phxId: string;
  session: string;
  staticToken: string;
}

function extractTokens(html: string): LiveViewTokens | null {
  const csrf = html.match(/content="([^"]+)"\s+name="csrf-token"/)?.[1];
  const phxId = html.match(/id="(phx-[^"]+)"\s+data-phx-main/)?.[1];
  const session = html.match(/data-phx-session="([^"]+)"/)?.[1];
  const staticToken = html.match(/data-phx-static="([^"]+)"/)?.[1];
  if (!csrf || !phxId || !session || !staticToken) return null;
  return { csrf, phxId, session, staticToken };
}

function fetchExtraDecksViaWs(
  pageUrl: string,
  tokens: LiveViewTokens,
  cookies: string,
): Promise<DeckInfo[]> {
  return new Promise((resolve) => {
    const { csrf, phxId, session, staticToken } = tokens;
    const topic = `lv:${phxId}`;
    const wsUrl = `${WS_URL}?_csrf_token=${encodeURIComponent(csrf)}&vsn=2.0.0`;
    let msgRef = 1;
    let joined = false;
    let pendingEvent = false;
    let stableChecks = 0;
    let lastDeckCount = 0;
    const allDecks = new Map<string, DeckInfo>();
    let timeout: ReturnType<typeof setTimeout>;
    let finished = false;

    const ws = new WsWebSocket(wsUrl, {
      headers: { 'User-Agent': UA, 'Cookie': cookies, 'Origin': BASE_URL },
    });

    function finish() {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      try { ws.close(); } catch {}
      resolve([...allDecks.values()]);
    }

    timeout = setTimeout(() => {
      console.log(`[HSGuru WS] Timeout after ${WS_TIMEOUT_MS}ms, got ${allDecks.size} extra decks`);
      finish();
    }, WS_TIMEOUT_MS);

    function sendNextPage() {
      if (pendingEvent) return;
      pendingEvent = true;
      setTimeout(() => {
        ws.send(JSON.stringify([
          null, String(msgRef++), topic, "event", {
            type: "viewport",
            event: "next-decks-page",
            value: {},
            cid: 1,
          },
        ]));
      }, WS_PAGE_DELAY_MS);
    }

    ws.on('open', () => {
      ws.send(JSON.stringify([
        "1", String(msgRef++), topic, "phx_join", {
          url: pageUrl,
          params: { _csrf_token: csrf, _mounts: 0 },
          session,
          static: staticToken,
        },
      ]));
    });

    ws.on('message', (data) => {
      try {
        const raw = String(data);
        const msg = JSON.parse(raw);
        if (!Array.isArray(msg) || msg.length < 5) return;
        const [, , , eventName, payload] = msg;

        if (eventName === 'phx_reply' && payload?.status === 'ok') {
          const newDecks = parseDecksFromDiff(payload.response);

          for (const d of newDecks) {
            allDecks.set(d.deckId, d);
          }

          pendingEvent = false;

          if (!joined) {
            joined = true;
            sendNextPage();
            return;
          }

          if (allDecks.size === lastDeckCount) {
            stableChecks++;
            if (stableChecks >= 2) {
              console.log(`[HSGuru WS] No new decks after 2 attempts, total: ${allDecks.size}`);
              finish();
              return;
            }
          } else {
            stableChecks = 0;
            lastDeckCount = allDecks.size;
          }

          sendNextPage();
        }

        if (eventName === 'phx_close' || eventName === 'phx_error') {
          console.log(`[HSGuru WS] Server sent ${eventName}`);
          finish();
        }
      } catch {}
    });

    ws.on('error', () => {
      console.log('[HSGuru WS] Connection error');
      finish();
    });

    ws.on('close', () => {
      finish();
    });
  });
}

export async function fetchHsguruMeta(
  format: 1 | 2,
  rank = 'diamond_to_legend',
  period = 'past_week',
): Promise<ArchetypeInfo[]> {
  const cacheKey = `meta_${format}_${rank}_${period}`;
  const cached = readCache<ArchetypeInfo[]>(cacheKey);
  if (cached) return cached;

  const url = `${BASE_URL}/meta?format=${format}&rank=${rank}&period=${period}`;
  const html = await fetchPage(url);

  const archetypes: ArchetypeInfo[] = [];
  const rowRe = /<tr>\s*<td class="decklist-info (\w+)">\s*<a[^>]*href="\/archetype\/([^"?]+)\?[^"]*"[^>]*>\s*([\s\S]*?)<\/a>\s*<\/td>\s*<td>\s*<span[^>]*class="tag">\s*<span[^>]*>\s*<span>([0-9.]+)<\/span>/g;
  const statsRe = /<\/span>\s*<\/td>\s*<td>([0-9.]+)%\s*\(([0-9,]+)\)<\/td>\s*<td[^>]*>([0-9.]+)<\/td>\s*<td[^>]*>([0-9.]+)<\/td>\s*<td[^>]*>([0-9.]+)⭐\/h<\/td>/g;

  let rowMatch;
  while ((rowMatch = rowRe.exec(html)) !== null) {
    const cssClass = rowMatch[1];
    const slug = rowMatch[2];
    const name = rowMatch[3].trim();
    const winRate = parseFloat(rowMatch[4]);
    const playerClass = CLASS_MAP[cssClass] || cssClass.toUpperCase();

    statsRe.lastIndex = rowMatch.index;
    const statsMatch = statsRe.exec(html);
    if (!statsMatch) continue;

    const pctOfTotal = parseFloat(statsMatch[1]);
    const totalGames = parseInt(statsMatch[2].replace(/,/g, ''));
    const avgTurns = parseFloat(statsMatch[3]);
    const avgDuration = parseFloat(statsMatch[4]);
    const climbingSpeed = parseFloat(statsMatch[5]);

    archetypes.push({
      id: hashName(name, playerClass),
      name,
      playerClass,
      url: `${BASE_URL}/archetype/${encodeURIComponent(slug)}?format=${format}`,
      pctOfTotal,
      winRate,
      totalGames,
      avgTurns,
      avgDuration,
      climbingSpeed,
    });
  }

  if (archetypes.length > 0) writeCache(cacheKey, archetypes);
  return archetypes;
}

async function scrapeDecksPage(pageUrl: string, label = ''): Promise<DeckInfo[]> {
  const { html, cookies } = await fetchPageWithCookies(pageUrl);
  const httpDecks = parseDecksFromHtml(html);
  if (label) console.log(`[HSGuru] ${label} HTTP: ${httpDecks.length} decks`);

  const tokens = extractTokens(html);
  if (!tokens) {
    if (label) console.log(`[HSGuru] ${label} no LiveView tokens, HTTP-only`);
    return httpDecks;
  }

  try {
    const wsDecks = await fetchExtraDecksViaWs(pageUrl, tokens, cookies);
    if (label && wsDecks.length > 0) console.log(`[HSGuru] ${label} WS: +${wsDecks.length} decks`);

    const seenIds = new Set(httpDecks.map(d => d.deckId));
    for (const deck of wsDecks) {
      if (!seenIds.has(deck.deckId)) {
        httpDecks.push(deck);
        seenIds.add(deck.deckId);
      }
    }
  } catch (err) {
    if (label) console.log(`[HSGuru] ${label} WS failed:`, err instanceof Error ? err.message : err);
  }

  return httpDecks;
}

export async function fetchHsguruDecks(
  format: 1 | 2,
  rank = 'diamond_to_legend',
  period = 'past_week',
  archetypeNames?: string[],
): Promise<DeckInfo[]> {
  const cacheKey = archetypeNames
    ? `decks_${format}_${rank}_${period}_full`
    : `decks_${format}_${rank}_${period}`;
  const cached = readCache<DeckInfo[]>(cacheKey);
  if (cached) return cached;

  const baseParams = `format=${format}&rank=${rank}&period=${period}&order_by=winrate&min_games=10`;
  const allDecks: DeckInfo[] = [];
  const seenIds = new Set<string>();

  function addDecks(decks: DeckInfo[]) {
    for (const d of decks) {
      if (!seenIds.has(d.deckId)) {
        allDecks.push(d);
        seenIds.add(d.deckId);
      }
    }
  }

  const classes = Object.keys(CLASS_MAP);
  const CLASS_CONCURRENCY = 3;

  for (let i = 0; i < classes.length; i += CLASS_CONCURRENCY) {
    const batch = classes.slice(i, i + CLASS_CONCURRENCY);
    const results = await Promise.all(
      batch.map(cls => {
        const url = `${BASE_URL}/decks?${baseParams}&player_class[]=${cls}`;
        return scrapeDecksPage(url, cls).catch(() => [] as DeckInfo[]);
      }),
    );
    for (const decks of results) addDecks(decks);
  }

  console.log(`[HSGuru] Per-class scrape: ${allDecks.length} decks`);

  if (archetypeNames && archetypeNames.length > 0) {
    const coveredNames = new Set<string>();
    for (const d of allDecks) {
      for (const name of archetypeNames) {
        if (d.archetypeId === hashName(name, d.playerClass)) {
          coveredNames.add(name);
        }
      }
    }

    const missing = archetypeNames.filter(n => !coveredNames.has(n));
    if (missing.length > 0) {
      console.log(`[HSGuru] ${missing.length} archetypes need per-archetype fetch`);
      const CONCURRENCY = 3;

      for (let i = 0; i < missing.length; i += CONCURRENCY) {
        const batch = missing.slice(i, i + CONCURRENCY);
        const results = await Promise.all(
          batch.map(name => {
            const archUrl = `${BASE_URL}/decks?${baseParams}&player_deck_archetype[]=${name.replace(/ /g, '+')}`;
            return scrapeDecksPage(archUrl, name).catch(() => [] as DeckInfo[]);
          }),
        );
        for (const decks of results) addDecks(decks);
      }

      console.log(`[HSGuru] Total after per-archetype backfill: ${allDecks.length} decks`);
    }
  }

  if (allDecks.length > 0) writeCache(cacheKey, allDecks);
  return allDecks;
}

export async function fetchHsguruMatchups(
  archetypeSlug: string,
  format: 1 | 2,
  rank = 'diamond_to_legend',
  period = 'past_week',
): Promise<HsguruMatchup[]> {
  const cacheKey = `matchup_${archetypeSlug}_${format}_${rank}_${period}`;
  const cached = readCache<HsguruMatchup[]>(cacheKey);
  if (cached) return cached;

  const url = `${BASE_URL}/archetype/${encodeURIComponent(archetypeSlug)}?format=${format}&rank=${rank}&period=${period}`;
  const html = await fetchPage(url);

  const matchups: HsguruMatchup[] = [];
  const matchupRe = /player-name (\w+)"[^>]*><span[^>]*>([^<]+)<\/span><\/span><\/td>\s*<td>\s*<span[^>]*class="tag">\s*<span[^>]*>\s*<span>([0-9.]+)<\/span>[\s\S]*?<td>(\d[\d,]*)\s*\(/g;

  let m;
  while ((m = matchupRe.exec(html)) !== null) {
    const cssClass = m[1];
    const winRate = parseFloat(m[3]);
    const totalGames = parseInt(m[4].replace(/,/g, ''));
    const opponentClass = CLASS_MAP[cssClass] || cssClass.toUpperCase();

    matchups.push({ opponentClass, winRate, totalGames });
  }

  if (matchups.length > 0) writeCache(cacheKey, matchups);
  return matchups;
}

