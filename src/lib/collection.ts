import type { Expansion, CardDb, MetaEntry, CardDbEntry } from '../types.ts';
import type { MetaMissing } from './simulator.ts';

export interface RarityState {
  at0: number;
  at1: number;
  at2: number;
}

export interface ExpansionCollectionState {
  expansion: Expansion;
  commons: RarityState;
  rares: RarityState;
  epics: RarityState;
  legendaries: { unowned: number; owned: number };
}

function getEffectiveCounts(
  dbfId: string,
  card: CardDbEntry,
  collection: Record<string, number[]> | null | undefined,
  cardDb: CardDb,
): { normal: number; golden: number; diamond: number; signature: number } {
  let normal = card.freeNormal ? 1 : 0
  let golden = card.freeGolden ? 1 : 0
  let diamond = 0
  let signature = 0

  const mergeCounts = (counts?: number[]) => {
    if (!counts) return
    normal = Math.max(normal, counts[0] ?? 0)
    golden = Math.max(golden, counts[1] ?? 0)
    diamond = Math.max(diamond, counts[2] ?? 0)
    signature = Math.max(signature, counts[3] ?? 0)
  }

  mergeCounts(collection?.[dbfId])

  if (card.aliasDbfIds) {
    for (const alias of card.aliasDbfIds) {
      mergeCounts(collection?.[alias])
      const aliasCard = cardDb[alias]
      if (aliasCard?.freeNormal) normal = Math.max(normal, 1)
      if (aliasCard?.freeGolden) golden = Math.max(golden, 1)
    }
  }

  return { normal, golden, diamond, signature }
}

function getEffectiveOwnedCopies(
  dbfId: string,
  card: CardDbEntry,
  collection: Record<string, number[]> | null | undefined,
  cardDb: CardDb,
): number {
  const { normal, golden, diamond, signature } = getEffectiveCounts(dbfId, card, collection, cardDb)
  const maxCopies = card.rarity === 'LEGENDARY' ? 1 : 2
  return Math.min(normal + golden + diamond + signature, maxCopies)
}

export function buildCollectionState(
  expansion: Expansion,
  collection: Record<string, number[]> | null | undefined,
  cardDb: CardDb,
): ExpansionCollectionState {
  let c0 = expansion.commons, c1 = 0, c2 = 0;
  let r0 = expansion.rares, r1 = 0, r2 = 0;
  let e0 = expansion.epics, e1 = 0, e2 = 0;
  let lOwned = 0;

  for (const [dbfId, card] of Object.entries(cardDb)) {
    if (!card || card.set !== expansion.code) continue;

    const clamped = getEffectiveOwnedCopies(dbfId, card, collection, cardDb)

    if (card.rarity === 'COMMON') {
      if (clamped >= 2) { c0--; c2++; }
      else if (clamped === 1) { c0--; c1++; }
    } else if (card.rarity === 'RARE') {
      if (clamped >= 2) { r0--; r2++; }
      else if (clamped === 1) { r0--; r1++; }
    } else if (card.rarity === 'EPIC') {
      if (clamped >= 2) { e0--; e2++; }
      else if (clamped === 1) { e0--; e1++; }
    } else if (card.rarity === 'LEGENDARY') {
      if (clamped >= 1) { lOwned++; }
    }
  }

  return {
    expansion,
    commons: { at0: Math.max(0, c0), at1: c1, at2: c2 },
    rares: { at0: Math.max(0, r0), at1: r1, at2: r2 },
    epics: { at0: Math.max(0, e0), at1: e1, at2: e2 },
    legendaries: { unowned: Math.max(0, expansion.legendaries - lOwned), owned: lOwned },
  };
}

export function emptyCollectionState(expansion: Expansion): ExpansionCollectionState {
  return {
    expansion,
    commons: { at0: expansion.commons, at1: 0, at2: 0 },
    rares: { at0: expansion.rares, at1: 0, at2: 0 },
    epics: { at0: expansion.epics, at1: 0, at2: 0 },
    legendaries: { unowned: expansion.legendaries, owned: 0 },
  };
}

export function computeMetaMissing(
  expansion: Expansion,
  cardDb: CardDb,
  collection: Record<string, number[]> | null | undefined,
  metaStd: Record<string, MetaEntry>,
  metaWild: Record<string, MetaEntry>,
): MetaMissing {
  const result: MetaMissing = {
    common: { at0: 0, at1: 0 },
    rare: { at0: 0, at1: 0 },
    epic: { at0: 0, at1: 0 },
    legendary: 0,
  };

  for (const [dbfId, card] of Object.entries(cardDb)) {
    if (card.set !== expansion.code) continue;

    let best: MetaEntry | undefined;
    for (const source of [metaStd, metaWild]) {
      let entry = source[dbfId];
      if (card.aliasDbfIds) {
        for (const alias of card.aliasDbfIds) {
          const ae = source[alias];
          if (ae && (!entry || ae.popularity > entry.popularity)) entry = ae;
        }
      }
      if (entry && (!best || entry.popularity > best.popularity)) best = entry;
    }

    if (!best) continue;
    const isMetaRelevant = best.popularity > 2 || (best.winrate > 50 && best.decks >= 100);
    if (!isMetaRelevant) continue;

    const clamped = getEffectiveOwnedCopies(dbfId, card, collection, cardDb)
    const maxCopies = card.rarity === 'LEGENDARY' ? 1 : 2;
    if (clamped >= maxCopies) continue;

    const rarity = card.rarity.toLowerCase();
    if (rarity === 'legendary') {
      result.legendary++;
    } else {
      const slot = rarity === 'common' ? result.common : rarity === 'rare' ? result.rare : result.epic;
      if (clamped === 0) slot.at0++;
      else slot.at1++;
    }
  }

  return result;
}
