import type { Expansion, CardDb, CollectionData, CalculatorResponse } from '../types.ts';
import { buildCollectionState, parseHsReplayCollection, emptyCollectionState } from '../lib/collection.ts';
import { simulate, simulateMultiExpansion, calcGoldenPackAnalysis } from '../lib/simulator.ts';

interface CalculatorMessage {
  expansionCodes: string[];
  expansions: Expansion[];
  cardDb: CardDb;
  collection: CollectionData | null;
  dust: number;
  runs?: number;
}

self.onmessage = (e: MessageEvent<CalculatorMessage>) => {
  const { expansionCodes, expansions: allExpansions, cardDb, collection, dust, runs = 200 } = e.data;
  const expansions = allExpansions.filter(exp => expansionCodes.includes(exp.code));

  let normalOwned: Map<string, number> | null = null;
  if (collection?.collection) {
    normalOwned = parseHsReplayCollection(collection.collection);
  }

  const collectionStates = [];
  const isNewFlags: boolean[] = [];
  const results = [];

  for (const exp of expansions) {
    const state = normalOwned
      ? buildCollectionState(exp, normalOwned, cardDb)
      : emptyCollectionState(exp);
    collectionStates.push(state);
    isNewFlags.push(state.legendaries.owned === 0);
    results.push(simulate(state, dust, runs, state.legendaries.owned === 0));
  }

  const perSetTotal = results.filter(r => !r.alreadyComplete).reduce((s, r) => s + r.mean, 0);
  const multiPackStats = simulateMultiExpansion(collectionStates, dust, isNewFlags, runs);
  const goldenAnalysis = calcGoldenPackAnalysis(collectionStates, dust);

  const response: CalculatorResponse = {
    perExpansion: results,
    comparison: { perSetTotal, multiPackStats, goldenAnalysis },
  };

  self.postMessage(response);
};
