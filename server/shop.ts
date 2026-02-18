import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { CardDb, Expansion } from './data.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const SHOP_CACHE_PATH = join(DATA_DIR, 'shop-bundles.json');
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

const WIKI_API = 'https://hearthstone.wiki.gg/api.php';

// ── Types ──────────────────────────────────────────────

export type BundleCategory =
  | 'collection' | 'prepurchase' | 'miniset' | 'ladderready'
  | 'pass' | 'cosmetic' | 'runestone' | 'battlegrounds' | 'mercenaries';

export type DealRating = 'buy' | 'consider' | 'skip';
export type Confidence = 'high' | 'medium' | 'low';

export interface ShopBundleItem {
  type: 'pack' | 'card' | 'dust' | 'gold' | 'ticket' | 'cosmetic' | 'unknown';
  name: string;
  quantity: number;
  expansion: string | null;
  rarity: string | null;
  variant: 'normal' | 'golden' | 'signature' | 'diamond' | null;
  resolved: boolean;
  cardId: string | null;
  metaInclusionRate: number | null;
  owned: boolean | null;
  craftCost: number | null;
}

export interface PassRewardSummary {
  paidGold: number;
  paidPacks: number;
  paidCards: number;
  paidTavernTickets: number;
  paidXpBoosts: number;
  paidCosmetics: number;
  hasDiamond: boolean;
  trackName: string;
}

export interface ShopBundle {
  pmtProductId: number;
  title: string;
  description: string;
  category: BundleCategory;
  pricing: {
    usd: number | null;
    gold: number | null;
    runestones: number | null;
  };
  startDate: string;
  endDate: string;
  isPrePurchase: boolean;
  items: ShopBundleItem[];
  eligibilityTag: string | null;
  chainRank: number | null;
  chainTotal: number | null;
  isBonusReward: boolean;
  isConditional: boolean;
  passRewards: PassRewardSummary | null;
  valuation: {
    dealRating: DealRating;
    dealReason: string;
    personalRating: DealRating | 'estimated';
    personalReason: string;
    confidence: Confidence;
    confidenceReason: string;
    effectiveCostPerPack: number | null;
    baselineCostPerPack: number;
    savingsPercent: number | null;
    expectedDust: number | null;
    collectionDelta: number | null;
    packAdvisorMatch: boolean;
  };
}

interface CargoRow {
  title: Record<string, string>;
}

interface WikiBundleInfo {
  pmtProductId: string;
  title: string;
  description: string;
  startTimeUtc: string;
  endTimeUtc: string;
  tags: string;
}

interface WikiBundle {
  pmtProductId: string;
  rawCost: string;
  goldCost: string;
  virtualCurrencyCost: string;
  isPrePurchase: string;
}

interface WikiBundleItem {
  pmtProductId: string;
  itemTypeId: string;
  productData: string;
  quantity: string;
  tags: string;
}

interface WikiRewardTrack {
  id: string;
  name: string;
  seasonPassProductId: string;
}

interface WikiRewardLevel {
  rewardTrackId: string;
  level: string;
  paidRewardListId: string;
}

interface WikiRewardItem {
  rewardListId: string;
  rewardType: string;
  quantity: string;
}

interface ShopCache {
  fetchedAt: number;
  bundles: ShopBundle[];
}

// ── Cargo API helpers ──────────────────────────────────

async function cargoQuery<T>(params: Record<string, string>): Promise<T[]> {
  const qs = new URLSearchParams({
    action: 'cargoquery',
    format: 'json',
    ...params,
  });
  const url = `${WIKI_API}?${qs}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`Wiki API error: ${res.status}`);
    const json = await res.json() as { cargoquery?: CargoRow[] };
    return (json.cargoquery ?? []).map(r => r.title as unknown as T);
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Wiki API request timed out (15s)');
    }
    throw err;
  }
}

async function fetchActiveBundleInfo(): Promise<WikiBundleInfo[]> {
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  return cargoQuery<WikiBundleInfo>({
    tables: 'BundleInfo',
    fields: 'BundleInfo.pmtProductId,BundleInfo.title,BundleInfo.description,BundleInfo.startTimeUtc,BundleInfo.endTimeUtc,BundleInfo.tags',
    where: `BundleInfo.endTimeUtc>'${now}' AND BundleInfo.startTimeUtc<'${now}'`,
    limit: '500',
  });
}

async function fetchBundlePricing(ids: string[]): Promise<Map<string, WikiBundle>> {
  if (ids.length === 0) return new Map();
  const map = new Map<string, WikiBundle>();
  const chunks = [];
  for (let i = 0; i < ids.length; i += 50) {
    chunks.push(ids.slice(i, i + 50));
  }
  for (const chunk of chunks) {
    const where = chunk.map(id => `Bundle.pmtProductId=${id}`).join(' OR ');
    const rows = await cargoQuery<WikiBundle>({
      tables: 'Bundle',
      fields: 'Bundle.pmtProductId,Bundle.rawCost,Bundle.goldCost,Bundle.virtualCurrencyCost,Bundle.isPrePurchase',
      where,
      limit: '500',
    });
    for (const r of rows) map.set(r.pmtProductId, r);
  }
  return map;
}

async function fetchBundleItems(ids: string[]): Promise<Map<string, WikiBundleItem[]>> {
  if (ids.length === 0) return new Map();
  const map = new Map<string, WikiBundleItem[]>();
  const chunks = [];
  for (let i = 0; i < ids.length; i += 50) {
    chunks.push(ids.slice(i, i + 50));
  }
  for (const chunk of chunks) {
    const where = chunk.map(id => `BundleItem.pmtProductId=${id}`).join(' OR ');
    const rows = await cargoQuery<WikiBundleItem>({
      tables: 'BundleItem',
      fields: 'BundleItem.pmtProductId,BundleItem.itemTypeId,BundleItem.productData,BundleItem.quantity,BundleItem.tags',
      where,
      limit: '500',
    });
    for (const r of rows) {
      if (!map.has(r.pmtProductId)) map.set(r.pmtProductId, []);
      map.get(r.pmtProductId)!.push(r);
    }
  }
  return map;
}

// ── Description parsing (fallback) ─────────────────────

const PACK_REGEX = /(\d+)\s+(?:([\w\s']+?)\s+)?Packs?/gi;
const LEGENDARY_REGEX = /(\d+)\s+Random\s+([\w\s']*?)Legendary\s+Cards?/gi;
const SIGNATURE_REGEX = /(\d+)\s+(?:Random\s+)?Signature\s+([\w\s']*?)Legendary/gi;
const GOLDEN_PACK_REGEX = /(\d+)\s+Golden\s+([\w\s']+?)\s+Packs?/gi;
const TAVERN_TICKET_REGEX = /(\d+)\s+Tavern\s+Tickets?/gi;

function parseDescription(desc: string, expansions: Expansion[]): ShopBundleItem[] {
  const items: ShopBundleItem[] = [];
  if (!desc) return items;

  const expansionByName = new Map<string, string>();
  for (const exp of expansions) {
    expansionByName.set(exp.name.toLowerCase(), exp.code);
  }

  function matchExpansion(name: string): string | null {
    const lower = name.trim().toLowerCase();
    for (const [expName, code] of expansionByName) {
      if (lower.includes(expName) || expName.includes(lower)) return code;
    }
    if (lower === 'standard') return 'STANDARD_AGGREGATE';
    if (lower === 'wild') return 'WILD_AGGREGATE';
    return null;
  }

  let m: RegExpExecArray | null;

  const goldenRegex = new RegExp(GOLDEN_PACK_REGEX.source, 'gi');
  while ((m = goldenRegex.exec(desc)) !== null) {
    items.push({
      type: 'pack', name: `Golden ${m[2].trim()} Pack`, quantity: parseInt(m[1]),
      expansion: matchExpansion(m[2]), rarity: null, variant: 'golden',
      resolved: true, cardId: null, metaInclusionRate: null, owned: null, craftCost: null,
    });
  }

  const packRegex = new RegExp(PACK_REGEX.source, 'gi');
  while ((m = packRegex.exec(desc)) !== null) {
    const full = m[0];
    if (/golden/i.test(full)) continue;
    const expName = m[2]?.trim();
    items.push({
      type: 'pack', name: expName ? `${expName} Pack` : 'Card Pack', quantity: parseInt(m[1]),
      expansion: expName ? matchExpansion(expName) : null, rarity: null, variant: 'normal',
      resolved: true, cardId: null, metaInclusionRate: null, owned: null, craftCost: null,
    });
  }

  const sigRegex = new RegExp(SIGNATURE_REGEX.source, 'gi');
  while ((m = sigRegex.exec(desc)) !== null) {
    const expName = m[2]?.trim();
    const expMatch = expName ? matchExpansion(expName) : null;
    items.push({
      type: 'card', name: `Random Signature${expName ? ' ' + expName : ''} Legendary`, quantity: parseInt(m[1]),
      expansion: expMatch, rarity: 'LEGENDARY', variant: 'signature',
      resolved: false, cardId: null, metaInclusionRate: null, owned: null, craftCost: 1600,
    });
  }

  const legRegex = new RegExp(LEGENDARY_REGEX.source, 'gi');
  while ((m = legRegex.exec(desc)) !== null) {
    if (/signature/i.test(m[0])) continue;
    const expName = m[2]?.trim();
    const expMatch = expName ? matchExpansion(expName) : null;
    items.push({
      type: 'card', name: `Random${expName ? ' ' + expName : ''} Legendary`, quantity: parseInt(m[1]),
      expansion: expMatch, rarity: 'LEGENDARY', variant: 'normal',
      resolved: false, cardId: null, metaInclusionRate: null, owned: null, craftCost: 1600,
    });
  }

  const ticketRegex = new RegExp(TAVERN_TICKET_REGEX.source, 'gi');
  while ((m = ticketRegex.exec(desc)) !== null) {
    items.push({
      type: 'ticket', name: 'Tavern Ticket', quantity: parseInt(m[1]),
      expansion: null, rarity: null, variant: null,
      resolved: true, cardId: null, metaInclusionRate: null, owned: null, craftCost: null,
    });
  }

  if (/hero skin/i.test(desc) && items.every(i => i.type !== 'cosmetic')) {
    items.push({
      type: 'cosmetic', name: 'Hero Skin', quantity: 1,
      expansion: null, rarity: null, variant: null,
      resolved: true, cardId: null, metaInclusionRate: null, owned: null, craftCost: null,
    });
  }

  if (/diamond/i.test(desc) && /legendary/i.test(desc) && items.every(i => i.variant !== 'diamond')) {
    items.push({
      type: 'card', name: 'Diamond Legendary', quantity: 1,
      expansion: null, rarity: 'LEGENDARY', variant: 'diamond',
      resolved: false, cardId: null, metaInclusionRate: null, owned: null, craftCost: 1600,
    });
  }

  return items;
}

// ── Category detection ─────────────────────────────────

function classifyBundle(title: string, desc: string, isPrePurchase: boolean, items: ShopBundleItem[]): BundleCategory {
  const t = title.toLowerCase();

  if (/^\d+\s+runestones?$/i.test(title)) return 'runestone';
  if (isPrePurchase) return 'prepurchase';
  if (/mini[- ]?set/i.test(t)) return 'miniset';
  if (/ladder ready/i.test(t)) return 'ladderready';
  if (/battlegrounds|bartender|strike/i.test(t)) return 'battlegrounds';
  if (/mercenaries?/i.test(t)) return 'mercenaries';
  if (/pass/i.test(t)) return 'pass';

  const hasPacks = items.some(i => i.type === 'pack');
  const hasCards = items.some(i => i.type === 'card');
  if (hasPacks || hasCards) return 'collection';

  if (/hero skin|card back|emote|portrait/i.test(t) || /hero skin|card back|emote/i.test(desc)) {
    return 'cosmetic';
  }

  return 'collection';
}

// ── Eligibility tagging ────────────────────────────────

function detectEligibility(title: string): string | null {
  const t = title.toLowerCase();
  if (/welcome back/i.test(t)) return 'Returning players only';
  if (/welcome bundle/i.test(t)) return 'New players';
  if (/bronze special/i.test(t)) return 'Bronze rank';
  if (/silver special/i.test(t)) return 'Silver rank';
  if (/gold special/i.test(t)) return 'Gold rank';
  if (/platinum special/i.test(t)) return 'Platinum rank';
  if (/diamond special/i.test(t)) return 'Diamond rank';
  if (/legend special/i.test(t)) return 'Legend rank';
  return null;
}

// ── Chain/tiered bundle detection ─────────────────────

function detectChainInfo(
  title: string,
  description: string,
  pricing: { usd: number | null; gold: number | null; runestones: number | null },
): { chainRank: number | null; chainTotal: number | null; isBonusReward: boolean; isConditional: boolean } {
  const rankMatch = title.match(/\(Rank\s+(\d+)\s+of\s+(\d+)\)/i);
  const chainRank = rankMatch ? parseInt(rankMatch[1]) : null;
  const chainTotal = rankMatch ? parseInt(rankMatch[2]) : null;

  const isFree = pricing.usd === null && pricing.gold === null && pricing.runestones === null;
  const isBonusReward = isFree && /reward\s+for\s+purchasing/i.test(description);
  const isConditional = /available\s+(?:only\s+)?after\s+purchasing/i.test(description);

  return { chainRank, chainTotal, isBonusReward, isConditional };
}

// ── Reward track scraping (tavern pass) ───────────────

const RT_GOLD = 1;
const RT_PACK = 4;
const RT_CARD = 6;
const RT_TAVERN_TICKET = 7;
const RT_HERO_SKIN = 10;
const RT_DIAMOND = 11;
const RT_XP_BOOST = 12;

async function fetchPassRewardsForIds(pmtProductIds: number[]): Promise<Map<number, PassRewardSummary>> {
  const result = new Map<number, PassRewardSummary>();
  if (pmtProductIds.length === 0) return result;

  try {
    const trackWhere = pmtProductIds.map(id => `RewardTrack.seasonPassProductId=${id}`).join(' OR ');
    const tracks = await cargoQuery<WikiRewardTrack>({
      tables: 'RewardTrack',
      fields: 'RewardTrack.id,RewardTrack.name,RewardTrack.seasonPassProductId',
      where: trackWhere,
      limit: '50',
    });
    if (tracks.length === 0) return result;

    const trackById = new Map<string, WikiRewardTrack>();
    const productToTrackId = new Map<number, string>();
    for (const t of tracks) {
      trackById.set(t.id, t);
      productToTrackId.set(parseInt(t.seasonPassProductId), t.id);
    }

    const trackIds = [...trackById.keys()];
    const levelWhere = trackIds.map(id => `RewardTrackLevel.rewardTrackId=${id}`).join(' OR ');
    const levels = await cargoQuery<WikiRewardLevel>({
      tables: 'RewardTrackLevel',
      fields: 'RewardTrackLevel.rewardTrackId,RewardTrackLevel.level,RewardTrackLevel.paidRewardListId',
      where: `(${levelWhere}) AND RewardTrackLevel.paidRewardListId>0`,
      limit: '500',
    });

    const trackListCounts = new Map<string, Map<string, number>>();
    for (const lv of levels) {
      if (!trackListCounts.has(lv.rewardTrackId)) trackListCounts.set(lv.rewardTrackId, new Map());
      const m = trackListCounts.get(lv.rewardTrackId)!;
      const lid = lv.paidRewardListId;
      if (lid && lid !== '0') m.set(lid, (m.get(lid) ?? 0) + 1);
    }

    const allListIds = new Set<string>();
    for (const m of trackListCounts.values()) for (const id of m.keys()) allListIds.add(id);
    if (allListIds.size === 0) return result;

    const itemChunks: string[][] = [];
    const allIds = [...allListIds];
    for (let i = 0; i < allIds.length; i += 50) itemChunks.push(allIds.slice(i, i + 50));

    const allItems: WikiRewardItem[] = [];
    for (const chunk of itemChunks) {
      const itemWhere = chunk.map(id => `RewardItem.rewardListId=${id}`).join(' OR ');
      const rows = await cargoQuery<WikiRewardItem>({
        tables: 'RewardItem',
        fields: 'RewardItem.rewardListId,RewardItem.rewardType,RewardItem.quantity',
        where: itemWhere,
        limit: '500',
      });
      allItems.push(...rows);
    }

    const itemsByList = new Map<string, WikiRewardItem[]>();
    for (const item of allItems) {
      if (!itemsByList.has(item.rewardListId)) itemsByList.set(item.rewardListId, []);
      itemsByList.get(item.rewardListId)!.push(item);
    }

    for (const [pmtId, trackId] of productToTrackId) {
      const listCounts = trackListCounts.get(trackId);
      if (!listCounts) continue;

      let paidGold = 0, paidPacks = 0, paidCards = 0;
      let paidTavernTickets = 0, paidXpBoosts = 0, paidCosmetics = 0, hasDiamond = false;

      for (const [listId, levelCount] of listCounts) {
        for (const item of itemsByList.get(listId) ?? []) {
          const type = parseInt(item.rewardType);
          const qty = parseInt(item.quantity) || 1;
          switch (type) {
            case RT_GOLD: paidGold += qty * levelCount; break;
            case RT_PACK: paidPacks += qty * levelCount; break;
            case RT_CARD: paidCards += qty * levelCount; break;
            case RT_TAVERN_TICKET: paidTavernTickets += qty * levelCount; break;
            case RT_HERO_SKIN: paidCosmetics += levelCount; break;
            case RT_DIAMOND: hasDiamond = true; break;
            case RT_XP_BOOST: paidXpBoosts += levelCount; break;
            default: paidCosmetics += levelCount; break;
          }
        }
      }

      result.set(pmtId, {
        paidGold, paidPacks, paidCards,
        paidTavernTickets, paidXpBoosts, paidCosmetics, hasDiamond,
        trackName: trackById.get(trackId)!.name,
      });
    }

    console.log(`[Shop] Fetched reward track data for ${result.size} pass(es)`);
  } catch (err) {
    console.warn('[Shop] Failed to fetch reward track data:', err instanceof Error ? err.message : err);
  }

  return result;
}

// ── Valuation ──────────────────────────────────────────

const BASELINE_COST_PER_PACK = 1.17;
const DUST_PER_PACK_AVG = 102;
const LEGENDARY_PITY_AVG = 20;

const DUST_CRAFT: Record<string, number> = {
  COMMON: 40, RARE: 100, EPIC: 400, LEGENDARY: 1600,
};

function computeValuation(
  bundle: Omit<ShopBundle, 'valuation'>,
  collection: Record<string, number[]> | null,
  metaStandard: Record<string, { popularity: number; winrate: number }> | null,
  _metaWild: Record<string, { popularity: number; winrate: number }> | null,
  _cardDb: CardDb | null,
  expansions: Expansion[],
  _packAdvisorRec: string | null,
): ShopBundle['valuation'] {
  const usd = bundle.pricing.usd;
  const totalPacks = bundle.items.filter(i => i.type === 'pack').reduce((s, i) => s + i.quantity, 0);
  const guaranteedLegendaries = bundle.items
    .filter(i => i.type === 'card' && i.rarity === 'LEGENDARY')
    .reduce((s, i) => s + i.quantity, 0);

  const legendaryPackValue = guaranteedLegendaries * LEGENDARY_PITY_AVG;
  const effectivePacks = totalPacks + legendaryPackValue;

  let effectiveCostPerPack: number | null = null;
  let savingsPercent: number | null = null;
  let dealRating: DealRating = 'skip';
  let dealReason = '';

  const isMiniset = bundle.category === 'miniset';
  const isPass = bundle.category === 'pass';

  if (isPass && bundle.passRewards && usd) {
    const r = bundle.passRewards;
    const goldPacks = r.paidGold / 100;
    const cardPackEquiv = r.paidCards * (1600 / DUST_PER_PACK_AVG);
    const ticketPackEquiv = r.paidTavernTickets * 1.5;
    const totalEquivPacks = r.paidPacks + goldPacks + cardPackEquiv + ticketPackEquiv;

    if (totalEquivPacks > 0) {
      effectiveCostPerPack = Math.round((usd / totalEquivPacks) * 100) / 100;
      savingsPercent = Math.round((1 - effectiveCostPerPack / BASELINE_COST_PER_PACK) * 100);
      dealRating = savingsPercent >= 30 ? 'buy' : savingsPercent >= 10 ? 'consider' : 'skip';

      const parts: string[] = [];
      if (r.paidPacks > 0) parts.push(`${r.paidPacks} packs`);
      if (r.paidGold > 0) parts.push(`${r.paidGold.toLocaleString()} gold`);
      if (r.paidCards > 0) parts.push(`${r.paidCards} golden/sig cards`);
      if (r.paidTavernTickets > 0) parts.push(`${r.paidTavernTickets} tavern tickets`);
      if (r.paidXpBoosts > 0) parts.push(`${r.paidXpBoosts} XP boosts`);
      if (r.hasDiamond) parts.push('diamond card');
      if (r.paidCosmetics > 0) parts.push(`${r.paidCosmetics} cosmetics`);
      dealReason = `Paid track: ${parts.join(', ')} — $${effectiveCostPerPack.toFixed(2)}/pack equiv`;
    } else {
      dealRating = 'skip';
      dealReason = 'Pass with no evaluable paid-track rewards';
    }
  } else if (isMiniset && usd) {
    const minisetName = bundle.title.replace(/\s*(Golden\s+)?Mini[- ]?Set\s*$/i, '').trim().toLowerCase();
    const matchedExp = expansions.find(e => {
      const eName = e.name.toLowerCase();
      return eName === minisetName || eName.includes(minisetName) || minisetName.includes(eName);
    });
    const isWildMiniset = matchedExp ? !matchedExp.standard : false;

    let totalCraftCost = 0;
    let totalUniqueCards = 0;
    let totalCardCount = 0;
    const minisetCardInfo: { rarity: string; dbfId: string }[] = [];

    if (matchedExp && _cardDb) {
      for (const [dbfId, card] of Object.entries(_cardDb)) {
        if (card.set !== matchedExp.code) continue;
        totalUniqueCards++;
        const maxCopies = card.rarity === 'LEGENDARY' ? 1 : 2;
        totalCardCount += maxCopies;
        totalCraftCost += (DUST_CRAFT[card.rarity] ?? 40) * maxCopies;
        minisetCardInfo.push({ rarity: card.rarity, dbfId });
      }
    }

    const isGoldenMiniset = /golden/i.test(bundle.title);
    if (totalCraftCost > 0) {
      const equivalentPacks = totalCraftCost / DUST_PER_PACK_AVG;
      effectiveCostPerPack = Math.round((usd / equivalentPacks) * 100) / 100;
      savingsPercent = Math.round((1 - effectiveCostPerPack / BASELINE_COST_PER_PACK) * 100);
      dealRating = savingsPercent >= 30 ? 'buy' : savingsPercent >= 10 ? 'consider' : 'skip';
      dealReason = `${totalUniqueCards} cards (${totalCardCount} copies) worth ${totalCraftCost.toLocaleString()} dust — $${effectiveCostPerPack.toFixed(2)}/pack equivalent`;
    } else {
      const estUniqueCards = isGoldenMiniset ? 38 : 38;
      const estCraftCost = isGoldenMiniset
        ? 4 * 3200 + 2 * 1600 + 14 * 800 + 18 * 400 // golden craft costs
        : 4 * 1600 + 2 * 400 + 14 * 100 + 18 * 40;  // normal craft costs
      const equivalentPacks = estCraftCost / DUST_PER_PACK_AVG;
      effectiveCostPerPack = Math.round((usd / equivalentPacks) * 100) / 100;
      savingsPercent = Math.round((1 - effectiveCostPerPack / BASELINE_COST_PER_PACK) * 100);
      totalCraftCost = estCraftCost;
      totalUniqueCards = estUniqueCards;
      dealRating = savingsPercent >= 30 ? 'buy' : savingsPercent >= 10 ? 'consider' : 'skip';
      const formatTag = isWildMiniset ? ' (Wild only)' : '';
      dealReason = `~${estUniqueCards} cards worth ~${estCraftCost.toLocaleString()} dust — $${effectiveCostPerPack.toFixed(2)}/pack equivalent${formatTag}`;
    }
  } else if (usd && effectivePacks > 0) {
    effectiveCostPerPack = Math.round((usd / effectivePacks) * 100) / 100;
    savingsPercent = Math.round((1 - effectiveCostPerPack / BASELINE_COST_PER_PACK) * 100);

    if (savingsPercent >= 30) {
      dealRating = 'buy';
      dealReason = `$${effectiveCostPerPack.toFixed(2)}/pack effective — ${savingsPercent}% below baseline`;
    } else if (savingsPercent >= 10) {
      dealRating = 'consider';
      dealReason = `$${effectiveCostPerPack.toFixed(2)}/pack effective — ${savingsPercent}% below baseline`;
    } else {
      dealRating = 'skip';
      dealReason = effectiveCostPerPack <= BASELINE_COST_PER_PACK
        ? `$${effectiveCostPerPack.toFixed(2)}/pack — marginal ${savingsPercent}% discount`
        : `$${effectiveCostPerPack.toFixed(2)}/pack — above $${BASELINE_COST_PER_PACK} baseline`;
    }
  } else if (!usd || effectivePacks === 0) {
    dealRating = 'skip';
    dealReason = 'No pack value to evaluate';
  }

  let personalRating: DealRating | 'estimated' = 'estimated';
  let personalReason = '';
  let expectedDust: number | null = null;
  let collectionDelta: number | null = null;

  if (isPass && bundle.passRewards) {
    const r = bundle.passRewards;
    const cardDust = r.paidCards * 1600;
    const goldEquiv = Math.round(r.paidGold * DUST_PER_PACK_AVG / 100);
    const packDust = r.paidPacks * DUST_PER_PACK_AVG;
    expectedDust = Math.round(cardDust + goldEquiv + packDust);
    personalRating = 'estimated';
    personalReason = collection
      ? `Paid track: ~${expectedDust.toLocaleString()} dust in gameplay value`
      : 'Sync collection for personal value rating';
  } else if (bundle.isPrePurchase) {
    expectedDust = totalPacks * DUST_PER_PACK_AVG + guaranteedLegendaries * 1600;
    personalRating = 'estimated';
    personalReason = `Pre-purchase — estimated ${expectedDust.toLocaleString()} dust based on ${totalPacks} packs + ${guaranteedLegendaries} legendaries`;
  } else if (isMiniset) {
    const isGoldenMs = /golden/i.test(bundle.title);
    const estCraft = isGoldenMs
      ? 4 * 3200 + 2 * 1600 + 14 * 800 + 18 * 400
      : 4 * 1600 + 2 * 400 + 14 * 100 + 18 * 40;
    expectedDust = estCraft;
    personalRating = 'estimated';
    personalReason = collection
      ? `~38 unique cards, ~${estCraft.toLocaleString()} dust craft value (exact overlap unavailable)`
      : 'Sync collection for personal value rating';
  } else if (collection && totalPacks > 0) {
    const packExpansions = bundle.items
      .filter(i => i.type === 'pack' && i.expansion)
      .map(i => ({ expansion: i.expansion!, quantity: i.quantity }));

    let totalCompletionGain = 0;
    let totalExpected = 0;

    for (const pe of packExpansions) {
      const exp = expansions.find(e => e.code === pe.expansion);
      if (!exp) continue;
      const totalCards = exp.commons + exp.rares + exp.epics + exp.legendaries;
      if (totalCards === 0) continue;

      let owned = 0;
      if (_cardDb) {
        for (const [dbfId, card] of Object.entries(_cardDb)) {
          if (card.set !== pe.expansion) continue;
          const counts = collection[dbfId];
          if (!counts) continue;
          const n = counts[0] || 0;
          const maxCopies = card.rarity === 'LEGENDARY' ? 1 : 2;
          if (n >= maxCopies) owned++;
        }
      }

      const pctOwned = totalCards > 0 ? owned / totalCards : 0;
      const dupRate = pctOwned;
      const expectedNew = pe.quantity * 5 * (1 - dupRate);
      const expectedDupe = pe.quantity * 5 * dupRate;
      totalExpected += expectedNew * 40 + expectedDupe * DUST_PER_PACK_AVG / 5;
      totalCompletionGain += expectedNew / totalCards * 100;
    }

    expectedDust = Math.round(totalExpected + guaranteedLegendaries * 1600);
    collectionDelta = Math.round(totalCompletionGain * 10) / 10;

    if (collectionDelta >= 5 || (guaranteedLegendaries >= 2 && collectionDelta > 0)) {
      personalRating = 'buy';
      personalReason = `+${collectionDelta}% collection completion, ~${expectedDust.toLocaleString()} dust value`;
    } else if (collectionDelta >= 1) {
      personalRating = 'consider';
      personalReason = `+${collectionDelta}% collection gain — moderate overlap with owned cards`;
    } else {
      personalRating = 'skip';
      personalReason = collectionDelta > 0
        ? `Marginal +${collectionDelta}% gain — you own most of these cards`
        : 'No collection impact — you likely own these cards';
    }
  } else {
    personalRating = 'skip';
    personalReason = collection ? 'No evaluable pack content' : 'Sync collection for personal value rating';
  }

  let confidence: Confidence = 'high';
  let confidenceReason = '';
  const unresolvedItems = bundle.items.filter(i => !i.resolved);

  if (bundle.isPrePurchase) {
    confidence = 'medium';
    confidenceReason = 'Pre-purchase — historical estimate only';
  } else if (unresolvedItems.length > bundle.items.length / 2) {
    confidence = 'low';
    confidenceReason = `${unresolvedItems.length} of ${bundle.items.length} items unresolved`;
  } else if (unresolvedItems.length > 0) {
    confidence = 'medium';
    confidenceReason = `${unresolvedItems.length} item(s) partially resolved`;
  } else {
    confidence = 'high';
    confidenceReason = 'All items resolved with pricing data';
  }

  if (isPass && bundle.passRewards) {
    confidence = 'high';
    confidenceReason = `Reward track: ${bundle.passRewards.trackName}`;
  } else if (isPass) {
    confidence = 'low';
    confidenceReason = 'Reward track data unavailable';
  }

  if (!usd && confidence === 'high') {
    confidence = 'medium';
    confidenceReason = 'Missing USD pricing data';
  }

  const packAdvisorMatch = false; // wired by caller if needed

  return {
    dealRating, dealReason, personalRating, personalReason,
    confidence, confidenceReason,
    effectiveCostPerPack, baselineCostPerPack: BASELINE_COST_PER_PACK,
    savingsPercent, expectedDust, collectionDelta, packAdvisorMatch,
  };
}

// ── Main fetch + assemble ──────────────────────────────

export async function fetchShopBundles(
  collection: Record<string, number[]> | null,
  metaStandard: Record<string, { popularity: number; winrate: number }> | null,
  metaWild: Record<string, { popularity: number; winrate: number }> | null,
  cardDb: CardDb | null,
  expansions: Expansion[],
  packAdvisorRec: string | null,
  forceRefresh = false,
): Promise<ShopBundle[]> {
  if (!forceRefresh) {
    const cached = loadCache();
    if (cached) {
      return recomputePersonalValues(cached, collection, metaStandard, metaWild, cardDb, expansions, packAdvisorRec);
    }
  }

  console.log('[Shop] Fetching bundle data from wiki.gg...');
  const bundleInfos = await fetchActiveBundleInfo();
  console.log(`[Shop] Found ${bundleInfos.length} active bundles`);

  const ids = bundleInfos.map(b => b.pmtProductId);
  const [pricing, bundleItems] = await Promise.all([
    fetchBundlePricing(ids),
    fetchBundleItems(ids),
  ]);

  const partials: (Omit<ShopBundle, 'valuation'>)[] = [];

  for (const info of bundleInfos) {
    const price = pricing.get(info.pmtProductId);
    const rawItems = bundleItems.get(info.pmtProductId) ?? [];

    const items = parseDescription(info.description, expansions);

    if (items.length === 0 && rawItems.length > 0) {
      for (const raw of rawItems) {
        const typeId = parseInt(raw.itemTypeId);
        if (typeId === 1) {
          items.push({
            type: 'pack', name: `Pack (ID: ${raw.productData})`, quantity: parseInt(raw.quantity) || 1,
            expansion: null, rarity: null, variant: raw.tags?.includes('premium=1') ? 'golden' : 'normal',
            resolved: false, cardId: null, metaInclusionRate: null, owned: null, craftCost: null,
          });
        } else if (typeId === 9) {
          items.push({
            type: 'card', name: 'Random Card', quantity: parseInt(raw.quantity) || 1,
            expansion: null, rarity: 'LEGENDARY', variant: raw.tags?.includes('premium=1') ? 'golden' : 'normal',
            resolved: false, cardId: null, metaInclusionRate: null, owned: null, craftCost: 1600,
          });
        }
      }
    }

    const rawCost = price?.rawCost ? parseInt(price.rawCost) : 0;
    const goldCost = price?.goldCost ? parseInt(price.goldCost) : 0;
    const virtualCost = price?.virtualCurrencyCost ? parseInt(price.virtualCurrencyCost) : 0;
    const isPrePurchase = price?.isPrePurchase === '1';

    const category = classifyBundle(info.title, info.description, isPrePurchase, items);
    const eligibilityTag = detectEligibility(info.title);
    const bundlePricing = {
      usd: rawCost > 0 ? rawCost / 100 : null,
      gold: goldCost > 0 ? goldCost : null,
      runestones: virtualCost > 0 ? virtualCost : null,
    };
    const chain = detectChainInfo(info.title, info.description, bundlePricing);

    partials.push({
      pmtProductId: parseInt(info.pmtProductId),
      title: info.title,
      description: info.description,
      category,
      pricing: bundlePricing,
      startDate: info.startTimeUtc ? new Date(info.startTimeUtc + ' UTC').toISOString() : '',
      endDate: info.endTimeUtc ? new Date(info.endTimeUtc + ' UTC').toISOString() : '',
      isPrePurchase,
      items,
      eligibilityTag,
      chainRank: chain.chainRank,
      chainTotal: chain.chainTotal,
      isBonusReward: chain.isBonusReward,
      isConditional: chain.isConditional,
      passRewards: null,
    });
  }

  const passPartials = partials.filter(p => p.category === 'pass');
  if (passPartials.length > 0) {
    const passProductIds = passPartials.map(p => p.pmtProductId);
    const rewardsMap = await fetchPassRewardsForIds(passProductIds);
    for (const p of partials) {
      if (rewardsMap.has(p.pmtProductId)) {
        p.passRewards = rewardsMap.get(p.pmtProductId)!;
      }
    }
  }

  const bundles: ShopBundle[] = partials.map(partial => {
    const valuation = computeValuation(partial, collection, metaStandard, metaWild, cardDb, expansions, packAdvisorRec);
    return { ...partial, valuation };
  });

  saveCache(bundles);
  console.log(`[Shop] Cached ${bundles.length} bundles`);
  return bundles;
}

function recomputePersonalValues(
  bundles: ShopBundle[],
  collection: Record<string, number[]> | null,
  metaStandard: Record<string, { popularity: number; winrate: number }> | null,
  metaWild: Record<string, { popularity: number; winrate: number }> | null,
  cardDb: CardDb | null,
  expansions: Expansion[],
  packAdvisorRec: string | null,
): ShopBundle[] {
  return bundles.map(bundle => {
    const valuation = computeValuation(bundle, collection, metaStandard, metaWild, cardDb, expansions, packAdvisorRec);
    return { ...bundle, valuation };
  });
}

function loadCache(): ShopBundle[] | null {
  if (!existsSync(SHOP_CACHE_PATH)) return null;
  try {
    const raw = JSON.parse(readFileSync(SHOP_CACHE_PATH, 'utf-8')) as ShopCache;
    if (Date.now() - raw.fetchedAt > CACHE_TTL_MS) return null;
    return raw.bundles;
  } catch {
    return null;
  }
}

function saveCache(bundles: ShopBundle[]): void {
  mkdirSync(DATA_DIR, { recursive: true });
  const cache: ShopCache = { fetchedAt: Date.now(), bundles };
  writeFileSync(SHOP_CACHE_PATH, JSON.stringify(cache));
}

export function getCacheAge(): number | null {
  if (!existsSync(SHOP_CACHE_PATH)) return null;
  try {
    const raw = JSON.parse(readFileSync(SHOP_CACHE_PATH, 'utf-8')) as ShopCache;
    return Date.now() - raw.fetchedAt;
  } catch {
    return null;
  }
}
