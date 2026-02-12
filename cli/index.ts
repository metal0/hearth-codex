import { createInterface } from 'readline';
import { readFileSync, existsSync, statSync } from 'fs';
import {
  initExpansions,
  getStandardExpansions,
  getAllExpansions,
  getYears,
  getExpansionsByYear,
  getCardDb,
  buildCollectionState,
  emptyCollectionState,
  manualCollectionState,
  parseHsReplayCollection,
  type Expansion,
  type ExpansionCollectionState,
  type CardDb,
} from '../server/data.ts';
import { simulate, type SimulationResult } from '../server/simulator.ts';
import { syncCollection } from './sync-collection.ts';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COLLECTION_PATH = join(__dirname, '..', 'data', 'my-collection.json');

const rl = createInterface({ input: process.stdin, output: process.stdout });

function ask(question: string): Promise<string> {
  return new Promise(resolve => rl.question(question, resolve));
}

function askInt(question: string, min: number, max: number): Promise<number> {
  return new Promise(resolve => {
    const tryAsk = () => {
      rl.question(question, answer => {
        const n = parseInt(answer.trim(), 10);
        if (isNaN(n) || n < min || n > max) {
          console.log(`  Please enter a number between ${min} and ${max}.`);
          tryAsk();
        } else {
          resolve(n);
        }
      });
    };
    tryAsk();
  });
}

function printHeader(): void {
  console.log('');
  console.log('='.repeat(70));
  console.log('  Hearthstone Collection Completion Calculator');
  console.log('  Simulates pack openings to estimate packs needed');
  console.log('='.repeat(70));
  console.log('');
}

function collectionFileAge(): string | null {
  if (!existsSync(COLLECTION_PATH)) return null;
  const stat = statSync(COLLECTION_PATH);
  const ageMs = Date.now() - stat.mtimeMs;
  const hours = Math.floor(ageMs / 3600000);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  return 'just now';
}

async function selectExpansions(): Promise<Expansion[]> {
  console.log('Select which expansions to calculate:\n');
  const stdExps = getStandardExpansions();
  const stdYears = [...new Set(stdExps.map(e => e.year))].join(' + ');
  console.log(`  [1] Standard only (${stdYears})`);
  console.log('  [2] All expansions (Wild)');
  console.log('  [3] Pick by year');
  console.log('  [4] Pick individual expansions');
  console.log('');

  const choice = await askInt('Choice: ', 1, 4);

  if (choice === 1) return getStandardExpansions();
  if (choice === 2) return getAllExpansions();

  if (choice === 3) {
    const years = getYears();
    console.log('\nAvailable years:\n');
    years.forEach((y, i) => {
      const exps = getExpansionsByYear(y);
      console.log(`  [${i + 1}] ${y} (${exps.map(e => e.name).join(', ')})`);
    });
    console.log(`\nEnter year numbers separated by commas (e.g. 1,2):`);
    const input = await ask('Years: ');
    const indices = input.split(',').map(s => parseInt(s.trim(), 10) - 1).filter(i => i >= 0 && i < years.length);
    const selected: Expansion[] = [];
    for (const i of indices) selected.push(...getExpansionsByYear(years[i]));
    if (selected.length === 0) {
      console.log('No valid selections. Defaulting to Standard.');
      return getStandardExpansions();
    }
    return selected;
  }

  const allExps = getAllExpansions();
  console.log('\nAvailable expansions:\n');
  let currentYear = '';
  allExps.forEach((e, i) => {
    if (e.year !== currentYear) {
      currentYear = e.year;
      console.log(`\n  --- ${currentYear} ---`);
    }
    const tag = e.standard ? ' [Standard]' : '';
    console.log(`  [${String(i + 1).padStart(2)}] ${e.name}${tag}`);
  });
  console.log(`\nEnter expansion numbers separated by commas (e.g. 1,2,5):`);
  const input = await ask('Expansions: ');
  const indices = input.split(',').map(s => parseInt(s.trim(), 10) - 1).filter(i => i >= 0 && i < allExps.length);
  const selected = indices.map(i => allExps[i]);
  if (selected.length === 0) {
    console.log('No valid selections. Defaulting to Standard.');
    return getStandardExpansions();
  }
  return selected;
}

function loadCollectionFromFile(
  path: string,
  expansions: Expansion[],
  cardDb: CardDb,
): { states: ExpansionCollectionState[]; dust: number } | null {
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8'));
    const { normalOwned, dust } = parseHsReplayCollection(raw, cardDb);
    if (normalOwned.size === 0) return null;
    const states = expansions.map(e => buildCollectionState(e, normalOwned, cardDb));
    return { states, dust };
  } catch {
    return null;
  }
}

async function getCollectionStates(
  expansions: Expansion[],
  cardDb: CardDb,
): Promise<{ states: ExpansionCollectionState[]; dust: number }> {
  const age = collectionFileAge();
  const hasFile = age !== null;

  console.log('\nHow do you want to input your collection?\n');
  if (hasFile) {
    console.log(`  [1] Use saved collection (synced ${age})`);
    console.log('  [2] Sync from HSReplay.net (opens Chrome)');
    console.log('  [3] Import from a different JSON file');
    console.log('  [4] Enter manually per expansion');
    console.log('  [5] Start from empty collection');
  } else {
    console.log('  [1] Sync from HSReplay.net (opens Chrome, one-time login)');
    console.log('  [2] Import from JSON file');
    console.log('  [3] Enter manually per expansion');
    console.log('  [4] Start from empty collection');
  }
  console.log('');

  if (hasFile) {
    const choice = await askInt('Choice: ', 1, 5);

    if (choice === 1) {
      const result = loadCollectionFromFile(COLLECTION_PATH, expansions, cardDb);
      if (result) {
        console.log(`\nLoaded collection: ${result.states.reduce((s, st) => s + st.legendaries.owned, 0)} legendaries owned. Dust: ${result.dust}`);
        return result;
      }
      console.log('Failed to load saved collection. Starting from empty.');
      const dust = await askInt('\nYour current dust: ', 0, 999999);
      return { states: expansions.map(e => emptyCollectionState(e)), dust };
    }

    if (choice === 2) {
      rl.close();
      const path = await syncCollection();
      const newRl = createInterface({ input: process.stdin, output: process.stdout });
      Object.assign(rl, newRl);
      if (path) {
        const result = loadCollectionFromFile(path, expansions, cardDb);
        if (result) {
          console.log(`\nLoaded: ${result.states.reduce((s, st) => s + st.legendaries.owned, 0)} legendaries owned. Dust: ${result.dust}`);
          return result;
        }
      }
      console.log('Sync failed. Starting from empty.');
      const dust = await askInt('\nYour current dust: ', 0, 999999);
      return { states: expansions.map(e => emptyCollectionState(e)), dust };
    }

    if (choice === 3) return await importFromFile(expansions, cardDb);
    if (choice === 4) return await manualInput(expansions);

    const dust = await askInt('\nYour current dust: ', 0, 999999);
    return { states: expansions.map(e => emptyCollectionState(e)), dust };
  }

  const choice = await askInt('Choice: ', 1, 4);

  if (choice === 1) {
    rl.close();
    const path = await syncCollection();
    const newRl = createInterface({ input: process.stdin, output: process.stdout });
    Object.assign(rl, newRl);
    if (path) {
      const result = loadCollectionFromFile(path, expansions, cardDb);
      if (result) {
        console.log(`\nLoaded: ${result.states.reduce((s, st) => s + st.legendaries.owned, 0)} legendaries owned. Dust: ${result.dust}`);
        return result;
      }
    }
    console.log('Sync failed. Starting from empty.');
    const dust = await askInt('\nYour current dust: ', 0, 999999);
    return { states: expansions.map(e => emptyCollectionState(e)), dust };
  }

  if (choice === 2) return await importFromFile(expansions, cardDb);
  if (choice === 3) return await manualInput(expansions);

  const dust = await askInt('\nYour current dust: ', 0, 999999);
  return { states: expansions.map(e => emptyCollectionState(e)), dust };
}

async function importFromFile(
  expansions: Expansion[],
  cardDb: CardDb,
): Promise<{ states: ExpansionCollectionState[]; dust: number }> {
  const path = (await ask('Path to collection JSON file: ')).trim().replace(/"/g, '');
  if (!existsSync(path)) {
    console.log(`File not found: ${path}. Starting from empty collection.`);
    const dust = await askInt('\nYour current dust: ', 0, 999999);
    return { states: expansions.map(e => emptyCollectionState(e)), dust };
  }
  const result = loadCollectionFromFile(path, expansions, cardDb);
  if (result) {
    console.log(`\nLoaded collection with ${result.dust} dust.`);
    return result;
  }
  console.log('Failed to parse file. Starting from empty.');
  const dust = await askInt('\nYour current dust: ', 0, 999999);
  return { states: expansions.map(e => emptyCollectionState(e)), dust };
}

async function manualInput(
  expansions: Expansion[],
): Promise<{ states: ExpansionCollectionState[]; dust: number }> {
  const dust = await askInt('\nYour current dust: ', 0, 999999);
  const states: ExpansionCollectionState[] = [];

  console.log('\n  (Enter unique cards owned, i.e. distinct card names you have at least 1 copy of.)');
  console.log('  (The simulator assumes ~50% have 2 copies for non-legendaries.)\n');

  for (const exp of expansions) {
    console.log(`\n--- ${exp.name} (${exp.year}) ---`);
    const c = await askInt(`  Unique commons owned (max ${exp.commons}): `, 0, exp.commons);
    const r = await askInt(`  Unique rares owned (max ${exp.rares}): `, 0, exp.rares);
    const e = await askInt(`  Unique epics owned (max ${exp.epics}): `, 0, exp.epics);
    const l = await askInt(`  Unique legendaries owned (max ${exp.legendaries}): `, 0, exp.legendaries);
    states.push(manualCollectionState(exp, c, r, e, l));
  }

  return { states, dust };
}

function printResults(results: SimulationResult[]): void {
  console.log('\n' + '='.repeat(70));
  console.log('  RESULTS');
  console.log('='.repeat(70));

  let totalMean = 0;
  let totalMin = 0;
  let totalMax = 0;

  for (const r of results) {
    console.log('');
    if (r.alreadyComplete) {
      console.log(`  ${r.expansion}: ALREADY COMPLETE`);
      continue;
    }
    console.log(`  ${r.expansion}`);
    console.log(`    Average packs needed: ${r.mean}`);
    console.log(`    Range: ${r.min} - ${r.max} (25th-75th: ${r.p25} - ${r.p75})`);
    console.log(`    Median: ${r.median}`);
    totalMean += r.mean;
    totalMin += r.min;
    totalMax += r.max;
  }

  console.log('\n' + '-'.repeat(70));
  console.log(`\n  TOTAL packs needed (average): ${totalMean}`);
  console.log(`  TOTAL range: ${totalMin} - ${totalMax}`);

  const goldCost = totalMean * 100;
  const dollarCost = totalMean * 1.167;
  console.log(`\n  Estimated gold cost: ${goldCost.toLocaleString()}`);
  console.log(`  Estimated dollar cost: $${dollarCost.toFixed(2)}`);
  console.log('');
}

async function main(): Promise<void> {
  printHeader();

  console.log('Loading card database...');
  const cardDb = await getCardDb();
  const allExpansions = await initExpansions();
  console.log(`Card database loaded (${Object.keys(cardDb).length} cards, ${allExpansions.length} expansions)\n`);

  const expansions = await selectExpansions();
  console.log(`\nSelected ${expansions.length} expansion(s): ${expansions.map(e => e.name).join(', ')}`);

  const { states, dust } = await getCollectionStates(expansions, cardDb);

  const simRuns = 200;
  console.log(`\nRunning ${simRuns} simulations per expansion...`);

  const results: SimulationResult[] = [];
  for (const state of states) {
    process.stdout.write(`  Simulating ${state.expansion.name}...`);
    const isNew = state.legendaries.owned === 0;
    const result = simulate(state, dust, simRuns, isNew);
    console.log(` ${result.alreadyComplete ? 'complete!' : result.mean + ' packs (avg)'}`);
    results.push(result);
  }

  printResults(results);

  rl.close();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
