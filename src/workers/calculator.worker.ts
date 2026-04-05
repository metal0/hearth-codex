import type { Expansion, CardDb, CollectionData, CalculatorResponse, MetaEntry } from '../types.ts';
import { buildCollectionState, emptyCollectionState, computeMetaMissing } from '../lib/collection.ts';
import { simulate, simulateMeta, simulateMultiExpansion, calcGoldenPackAnalysis } from '../lib/simulator.ts';

interface CalculatorMessage {
  expansionCodes: string[];
  expansions: Expansion[];
  cardDb: CardDb;
  collection: CollectionData | null;
  dust: number;
  runs?: number;
  metaOnly?: boolean;
  metaStandard?: Record<string, MetaEntry>;
  metaWild?: Record<string, MetaEntry>;
}

self.onmessage = (e: MessageEvent<CalculatorMessage>) => {
  const {
    expansionCodes, expansions: allExpansions, cardDb, collection, dust, runs = 200,
    metaOnly, metaStandard = {}, metaWild = {},
  } = e.data;
  const selectedCodes = new Set(expansionCodes);
  const expansions = allExpansions
    .filter(exp => selectedCodes.has(exp.code))
    .sort((a, b) => a.code.localeCompare(b.code));

  const rawCollection = collection?.collection ?? null

  const collectionStates = [];
  const isNewFlags: boolean[] = [];
  const results = [];

  for (const exp of expansions) {
    const state = rawCollection
      ? buildCollectionState(exp, rawCollection, cardDb)
      : emptyCollectionState(exp);
    collectionStates.push(state);
    isNewFlags.push(state.legendaries.owned === 0);

    if (metaOnly) {
      const metaMissing = computeMetaMissing(exp, cardDb, rawCollection, metaStandard, metaWild);
      results.push(simulateMeta(state, dust, metaMissing, runs, state.legendaries.owned === 0));
    } else {
      results.push(simulate(state, dust, runs, state.legendaries.owned === 0));
    }
  }

  const perSetTotal = results.filter(r => !r.alreadyComplete).reduce((s, r) => s + r.mean, 0);
  const multiPackStats = metaOnly
    ? { mean: 0, median: 0, min: 0, max: 0, p25: 0, p75: 0 }
    : simulateMultiExpansion(collectionStates, dust, isNewFlags, runs);
  const goldenAnalysis = calcGoldenPackAnalysis(collectionStates, dust);

  const response: CalculatorResponse = {
    perExpansion: results,
    comparison: { perSetTotal, multiPackStats, goldenAnalysis },
  };

  self.postMessage(response);
};
