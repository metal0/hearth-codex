import type { ExpansionCollectionState, RarityState } from './data.ts';

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let rng = Math.random;

function seedFromState(c: ExpansionCollectionState, dust: number): number {
  return (c.commons.at0 * 7 + c.commons.at1 * 13 + c.commons.at2 * 17
    + c.rares.at0 * 31 + c.rares.at1 * 37 + c.rares.at2 * 41
    + c.epics.at0 * 61 + c.epics.at1 * 67 + c.epics.at2 * 71
    + c.legendaries.unowned * 127 + c.legendaries.owned * 131
    + dust * 3) | 0;
}

const DUST_DISENCHANT = { common: 5, rare: 20, epic: 100, legendary: 400 } as const;
const DUST_DISENCHANT_GOLDEN = { common: 50, rare: 100, epic: 400, legendary: 1600 } as const;
const DUST_CRAFT = { common: 40, rare: 100, epic: 400, legendary: 1600 } as const;

const RARITY_WEIGHTS = [
  { rarity: 'common' as const, weight: 76.14, golden: false },
  { rarity: 'rare' as const, weight: 15.51, golden: false },
  { rarity: 'epic' as const, weight: 4.29, golden: false },
  { rarity: 'legendary' as const, weight: 1.00, golden: false },
  { rarity: 'common' as const, weight: 1.49, golden: true },
  { rarity: 'rare' as const, weight: 1.23, golden: true },
  { rarity: 'epic' as const, weight: 0.25, golden: true },
  { rarity: 'legendary' as const, weight: 0.09, golden: true },
];

const TOTAL_WEIGHT = RARITY_WEIGHTS.reduce((sum, w) => sum + w.weight, 0);
const CDF: number[] = (() => {
  const cdf: number[] = [];
  let cumulative = 0;
  for (const w of RARITY_WEIGHTS) {
    cumulative += w.weight / TOTAL_WEIGHT;
    cdf.push(cumulative);
  }
  return cdf;
})();

type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
type Card = { rarity: Rarity; golden: boolean };

const LEGENDARY_HARD_CAP = 40;
const LEGENDARY_SOFT_START = 30;
const EPIC_HARD_CAP = 10;
const EPIC_SOFT_START = 7;
const FIRST_LEGENDARY_CAP = 10;

interface PityState {
  packsSinceEpic: number;
  packsSinceLegendary: number;
  isFirstLegendary: boolean;
}

function newPityState(isNewExpansion: boolean): PityState {
  return { packsSinceEpic: 0, packsSinceLegendary: 0, isFirstLegendary: isNewExpansion };
}

function softPityChance(packsSince: number, softStart: number, hardCap: number): number {
  if (packsSince < softStart) return 0;
  if (packsSince >= hardCap) return 1;
  const progress = (packsSince - softStart + 1) / (hardCap - softStart + 1);
  return progress * progress;
}

function rollCard(): Card {
  const r = rng();
  for (let i = 0; i < CDF.length; i++) {
    if (r < CDF[i]) return { rarity: RARITY_WEIGHTS[i].rarity, golden: RARITY_WEIGHTS[i].golden };
  }
  return { rarity: 'common', golden: false };
}

const RARITY_RANK: Record<Rarity, number> = { common: 0, rare: 1, epic: 2, legendary: 3 };

function upgradeLowestCard(cards: Card[], targetRarity: Rarity): void {
  let lowestIdx = -1;
  let lowestRank = 999;
  for (let i = 0; i < cards.length; i++) {
    if (cards[i].golden) continue;
    const rank = RARITY_RANK[cards[i].rarity];
    if (rank < RARITY_RANK[targetRarity] && rank < lowestRank) {
      lowestRank = rank;
      lowestIdx = i;
    }
  }
  if (lowestIdx >= 0) {
    cards[lowestIdx] = { rarity: targetRarity, golden: false };
  }
}

function generatePack(pity: PityState): Card[] {
  const cards: Card[] = [];
  for (let i = 0; i < 5; i++) cards.push(rollCard());

  const hasRareOrBetter = cards.some(c => !c.golden && c.rarity !== 'common');
  if (!hasRareOrBetter) {
    const idx = cards.findIndex(c => !c.golden && c.rarity === 'common');
    if (idx >= 0) cards[idx] = { rarity: 'rare', golden: false };
  }

  const nextEpicCount = pity.packsSinceEpic + 1;
  const legendaryHardCap = pity.isFirstLegendary ? FIRST_LEGENDARY_CAP : LEGENDARY_HARD_CAP;
  const legendarySoftStart = pity.isFirstLegendary
    ? Math.floor(FIRST_LEGENDARY_CAP * 0.7)
    : LEGENDARY_SOFT_START;
  const nextLegCount = pity.packsSinceLegendary + 1;

  const hasNormalLegendary = cards.some(c => !c.golden && c.rarity === 'legendary');

  if (!hasNormalLegendary) {
    const pityChance = softPityChance(nextLegCount, legendarySoftStart, legendaryHardCap);
    if (pityChance >= 1 || (pityChance > 0 && rng() < pityChance)) {
      upgradeLowestCard(cards, 'legendary');
    }
  }

  const hasEpicAfterLegPity = cards.some(
    c => !c.golden && (c.rarity === 'epic' || c.rarity === 'legendary'),
  );
  if (!hasEpicAfterLegPity) {
    const pityChance = softPityChance(nextEpicCount, EPIC_SOFT_START, EPIC_HARD_CAP);
    if (pityChance >= 1 || (pityChance > 0 && rng() < pityChance)) {
      upgradeLowestCard(cards, 'epic');
    }
  }

  const finalHasLegendary = cards.some(c => !c.golden && c.rarity === 'legendary');
  const finalHasEpic = cards.some(c => !c.golden && (c.rarity === 'epic' || c.rarity === 'legendary'));

  if (finalHasLegendary) {
    pity.packsSinceLegendary = 0;
    pity.isFirstLegendary = false;
  } else {
    pity.packsSinceLegendary = nextLegCount;
  }

  if (finalHasEpic) {
    pity.packsSinceEpic = 0;
  } else {
    pity.packsSinceEpic = nextEpicCount;
  }

  return cards;
}

interface SimState {
  commons: RarityState;
  rares: RarityState;
  epics: RarityState;
  legendaries: { unowned: number; owned: number };
  dust: number;
}

function cloneState(s: ExpansionCollectionState, dust: number): SimState {
  return {
    commons: { ...s.commons },
    rares: { ...s.rares },
    epics: { ...s.epics },
    legendaries: { ...s.legendaries },
    dust,
  };
}

function isComplete(s: SimState): boolean {
  return s.commons.at0 === 0 && s.commons.at1 === 0
    && s.rares.at0 === 0 && s.rares.at1 === 0
    && s.epics.at0 === 0 && s.epics.at1 === 0
    && s.legendaries.unowned === 0;
}

function addNormalCard(s: SimState, rarity: Rarity): void {
  if (rarity === 'legendary') {
    if (s.legendaries.unowned > 0) {
      s.legendaries.unowned--;
      s.legendaries.owned++;
    } else {
      s.dust += DUST_DISENCHANT.legendary;
    }
    return;
  }

  const pool = rarity === 'common' ? s.commons : rarity === 'rare' ? s.rares : s.epics;
  const incomplete = pool.at0 + pool.at1;

  if (incomplete === 0) {
    s.dust += DUST_DISENCHANT[rarity];
    return;
  }

  const roll = rng() * incomplete;
  if (roll < pool.at0) {
    pool.at0--;
    pool.at1++;
  } else {
    pool.at1--;
    pool.at2++;
  }
}

function tryCraft(s: SimState): number {
  let spent = 0;
  while (true) {
    if (s.legendaries.unowned > 0 && s.dust >= DUST_CRAFT.legendary) {
      s.dust -= DUST_CRAFT.legendary;
      s.legendaries.unowned--;
      s.legendaries.owned++;
      spent += DUST_CRAFT.legendary;
    } else if (s.legendaries.unowned === 0 && (s.epics.at0 + s.epics.at1) > 0 && s.dust >= DUST_CRAFT.epic) {
      s.dust -= DUST_CRAFT.epic;
      if (s.epics.at0 > 0) { s.epics.at0--; s.epics.at2++; }
      else { s.epics.at1--; s.epics.at2++; }
      spent += DUST_CRAFT.epic;
    } else if (
      s.legendaries.unowned === 0
      && (s.epics.at0 + s.epics.at1) === 0
      && (s.rares.at0 + s.rares.at1) > 0
      && s.dust >= DUST_CRAFT.rare
    ) {
      s.dust -= DUST_CRAFT.rare;
      if (s.rares.at0 > 0) { s.rares.at0--; s.rares.at2++; }
      else { s.rares.at1--; s.rares.at2++; }
      spent += DUST_CRAFT.rare;
    } else if (
      s.legendaries.unowned === 0
      && (s.epics.at0 + s.epics.at1) === 0
      && (s.rares.at0 + s.rares.at1) === 0
      && (s.commons.at0 + s.commons.at1) > 0
      && s.dust >= DUST_CRAFT.common
    ) {
      s.dust -= DUST_CRAFT.common;
      if (s.commons.at0 > 0) { s.commons.at0--; s.commons.at2++; }
      else { s.commons.at1--; s.commons.at2++; }
      spent += DUST_CRAFT.common;
    } else {
      break;
    }
  }
  return spent;
}

interface RunResult {
  packs: number;
  dustLeft: number;
  dustGenerated: number;
  dustSpentCrafting: number;
}

function simulateSingleRun(
  collection: ExpansionCollectionState,
  startingDust: number,
  isNewExpansion: boolean,
): RunResult {
  const state = cloneState(collection, startingDust);
  const pity = newPityState(isNewExpansion);

  let dustGenerated = 0;
  let dustSpentCrafting = 0;

  dustSpentCrafting += tryCraft(state);
  if (isComplete(state)) return { packs: 0, dustLeft: state.dust, dustGenerated, dustSpentCrafting };

  let packs = 0;
  const MAX_PACKS = 10000;

  while (!isComplete(state) && packs < MAX_PACKS) {
    const pack = generatePack(pity);
    packs++;
    const dustBefore = state.dust;

    for (const card of pack) {
      if (card.golden) {
        state.dust += DUST_DISENCHANT_GOLDEN[card.rarity];
      } else {
        addNormalCard(state, card.rarity);
      }
    }

    dustGenerated += state.dust - dustBefore;
    dustSpentCrafting += tryCraft(state);
  }

  return { packs, dustLeft: state.dust, dustGenerated, dustSpentCrafting };
}

export interface SimulationResult {
  expansion: string;
  runs: number;
  mean: number;
  median: number;
  min: number;
  max: number;
  p25: number;
  p75: number;
  avgDustLeft: number;
  avgDustGenerated: number;
  avgDustSpentCrafting: number;
  alreadyComplete: boolean;
}

function addNormalCardReturnDust(s: SimState, rarity: Rarity): number {
  if (rarity === 'legendary') {
    if (s.legendaries.unowned > 0) {
      s.legendaries.unowned--;
      s.legendaries.owned++;
      return 0;
    }
    return DUST_DISENCHANT.legendary;
  }

  const pool = rarity === 'common' ? s.commons : rarity === 'rare' ? s.rares : s.epics;
  const incomplete = pool.at0 + pool.at1;

  if (incomplete === 0) return DUST_DISENCHANT[rarity];

  const roll = rng() * incomplete;
  if (roll < pool.at0) {
    pool.at0--;
    pool.at1++;
  } else {
    pool.at1--;
    pool.at2++;
  }
  return 0;
}

function tryCraftShared(states: SimState[], dustRef: { dust: number }): number {
  let spent = 0;
  while (true) {
    let crafted = false;

    for (const s of states) {
      if (s.legendaries.unowned > 0 && dustRef.dust >= DUST_CRAFT.legendary) {
        dustRef.dust -= DUST_CRAFT.legendary;
        s.legendaries.unowned--;
        s.legendaries.owned++;
        spent += DUST_CRAFT.legendary;
        crafted = true;
        break;
      }
    }
    if (crafted) continue;

    const allLegsDone = states.every(s => s.legendaries.unowned === 0);
    if (allLegsDone) {
      const allEpicsDone = states.every(s => (s.epics.at0 + s.epics.at1) === 0);
      if (!allEpicsDone) {
        for (const s of states) {
          if ((s.epics.at0 + s.epics.at1) > 0 && dustRef.dust >= DUST_CRAFT.epic) {
            dustRef.dust -= DUST_CRAFT.epic;
            if (s.epics.at0 > 0) { s.epics.at0--; s.epics.at2++; }
            else { s.epics.at1--; s.epics.at2++; }
            spent += DUST_CRAFT.epic;
            crafted = true;
            break;
          }
        }
        if (crafted) continue;
      }

      const allRaresDone = states.every(s => (s.rares.at0 + s.rares.at1) === 0);
      if (allEpicsDone && !allRaresDone) {
        for (const s of states) {
          if ((s.rares.at0 + s.rares.at1) > 0 && dustRef.dust >= DUST_CRAFT.rare) {
            dustRef.dust -= DUST_CRAFT.rare;
            if (s.rares.at0 > 0) { s.rares.at0--; s.rares.at2++; }
            else { s.rares.at1--; s.rares.at2++; }
            spent += DUST_CRAFT.rare;
            crafted = true;
            break;
          }
        }
        if (crafted) continue;
      }

      if (allEpicsDone && allRaresDone) {
        for (const s of states) {
          if ((s.commons.at0 + s.commons.at1) > 0 && dustRef.dust >= DUST_CRAFT.common) {
            dustRef.dust -= DUST_CRAFT.common;
            if (s.commons.at0 > 0) { s.commons.at0--; s.commons.at2++; }
            else { s.commons.at1--; s.commons.at2++; }
            spent += DUST_CRAFT.common;
            crafted = true;
            break;
          }
        }
        if (crafted) continue;
      }
    }
    break;
  }
  return spent;
}

function allComplete(states: SimState[]): boolean {
  return states.every(isComplete);
}

function simulateMultiExpansionRun(
  collections: ExpansionCollectionState[],
  startingDust: number,
  isNewPerExpansion: boolean[],
): number {
  const N = collections.length;
  const states = collections.map((c, i) => cloneState(c, 0));
  const dustRef = { dust: startingDust };
  const pities = collections.map((_, i) => newPityState(isNewPerExpansion[i]));

  tryCraftShared(states, dustRef);
  if (allComplete(states)) return 0;

  let packs = 0;
  const MAX_PACKS = 20000;

  while (!allComplete(states) && packs < MAX_PACKS) {
    const idx = Math.floor(rng() * N);
    const pack = generatePack(pities[idx]);
    packs++;

    for (const card of pack) {
      if (card.golden) {
        dustRef.dust += DUST_DISENCHANT_GOLDEN[card.rarity];
      } else {
        dustRef.dust += addNormalCardReturnDust(states[idx], card.rarity);
      }
    }

    tryCraftShared(states, dustRef);
  }

  return packs;
}

export interface SimStats {
  mean: number;
  median: number;
  min: number;
  max: number;
  p25: number;
  p75: number;
}

export interface GoldenAnalysis {
  avgDustPerPack: number;
  packsToComplete: number;
  totalCraftCost: number;
}

export interface ComparisonResult {
  perSetTotal: number;
  multiPackStats: SimStats;
  goldenAnalysis: GoldenAnalysis;
}

export function simulateMultiExpansion(
  collections: ExpansionCollectionState[],
  dust: number,
  isNewPerExpansion: boolean[],
  runs: number = 200,
): SimStats {
  let seed = dust * 3;
  for (const c of collections) seed = (seed + seedFromState(c, 0)) | 0;
  rng = mulberry32(seed);
  const results: number[] = [];

  for (let i = 0; i < runs; i++) {
    results.push(simulateMultiExpansionRun(collections, dust, isNewPerExpansion));
  }

  results.sort((a, b) => a - b);

  return {
    mean: Math.round(results.reduce((s, v) => s + v, 0) / runs),
    median: results[Math.floor(runs / 2)],
    min: results[0],
    max: results[runs - 1],
    p25: results[Math.floor(runs * 0.25)],
    p75: results[Math.floor(runs * 0.75)],
  };
}

export function calcGoldenPackAnalysis(
  collections: ExpansionCollectionState[],
  startingDust: number,
): GoldenAnalysis {
  let totalCraftCost = 0;
  for (const c of collections) {
    totalCraftCost += c.legendaries.unowned * DUST_CRAFT.legendary;
    totalCraftCost += (c.epics.at0 * 2 + c.epics.at1) * DUST_CRAFT.epic;
    totalCraftCost += (c.rares.at0 * 2 + c.rares.at1) * DUST_CRAFT.rare;
    totalCraftCost += (c.commons.at0 * 2 + c.commons.at1) * DUST_CRAFT.common;
  }

  totalCraftCost = Math.max(0, totalCraftCost - startingDust);

  const avgDustPerPack = 434;
  const packsToComplete = totalCraftCost > 0 ? Math.ceil(totalCraftCost / avgDustPerPack) : 0;

  return { avgDustPerPack, packsToComplete, totalCraftCost };
}

export function simulate(
  collection: ExpansionCollectionState,
  dust: number,
  runs: number = 200,
  isNewExpansion: boolean = false,
): SimulationResult {
  rng = mulberry32(seedFromState(collection, dust));
  if (isComplete(cloneState(collection, 0))) {
    return {
      expansion: collection.expansion.name,
      runs, mean: 0, median: 0, min: 0, max: 0, p25: 0, p75: 0,
      avgDustLeft: dust, avgDustGenerated: 0, avgDustSpentCrafting: 0,
      alreadyComplete: true,
    };
  }

  const results: number[] = [];
  const dustLefts: number[] = [];
  const dustGens: number[] = [];
  const dustCrafts: number[] = [];

  for (let i = 0; i < runs; i++) {
    const run = simulateSingleRun(collection, dust, isNewExpansion);
    results.push(run.packs);
    dustLefts.push(run.dustLeft);
    dustGens.push(run.dustGenerated);
    dustCrafts.push(run.dustSpentCrafting);
  }

  results.sort((a, b) => a - b);
  const avg = (arr: number[]) => Math.round(arr.reduce((s, v) => s + v, 0) / runs);

  return {
    expansion: collection.expansion.name,
    runs,
    mean: Math.round(results.reduce((s, v) => s + v, 0) / runs),
    median: results[Math.floor(runs / 2)],
    min: results[0],
    max: results[runs - 1],
    p25: results[Math.floor(runs * 0.25)],
    p75: results[Math.floor(runs * 0.75)],
    avgDustLeft: avg(dustLefts),
    avgDustGenerated: avg(dustGens),
    avgDustSpentCrafting: avg(dustCrafts),
    alreadyComplete: false,
  };
}
