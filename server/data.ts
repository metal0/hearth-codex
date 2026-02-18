import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const CARD_DB_PATH = join(DATA_DIR, 'card-db.json');

export interface Expansion {
  name: string;
  code: string;
  year: string;
  yearNum: number;
  standard: boolean;
  noPacks: boolean;
  commons: number;
  rares: number;
  epics: number;
  legendaries: number;
}

export interface CardDbEntry {
  id: string;
  set: string;
  rarity: 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
  name: string;
  type: string;
  cardClass: string;
  cost: number;
  attack?: number;
  health?: number;
  text?: string;
  freeNormal?: boolean;
  freeGolden?: boolean;
  hasSignature?: boolean;
  hasDiamond?: boolean;
  aliasDbfIds?: string[];
}

export type CardDb = Record<string, CardDbEntry>;

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

export interface HsReplayCollection {
  collection: Record<string, number[]>;
  dust?: number;
  gold?: number;
}

interface ExpansionMetadata {
  name: string;
  year: string;
  yearNum: number;
}

const EXPANSION_METADATA: Record<string, ExpansionMetadata> = {
  // Year of the Scarab (2026)
  CATACLYSM: { name: 'Cataclysm', year: 'Year of the Scarab', yearNum: 2026 },
  // Year of the Raptor (2025)
  TIME_TRAVEL: { name: 'Across the Timeways', year: 'Year of the Raptor', yearNum: 2025 },
  WONDERS: { name: 'Caverns of Time', year: 'Year of the Raptor', yearNum: 2025 },
  THE_LOST_CITY: { name: "The Lost City of Un'Goro", year: 'Year of the Raptor', yearNum: 2025 },
  EMERALD_DREAM: { name: 'Into the Emerald Dream', year: 'Year of the Raptor', yearNum: 2025 },
  // Year of the Pegasus (2024)
  SPACE: { name: 'The Great Dark Beyond', year: 'Year of the Pegasus', yearNum: 2024 },
  ISLAND_VACATION: { name: 'Perils in Paradise', year: 'Year of the Pegasus', yearNum: 2024 },
  WHIZBANGS_WORKSHOP: { name: "Whizbang's Workshop", year: 'Year of the Pegasus', yearNum: 2024 },
  // Year of the Wolf (2023)
  WILD_WEST: { name: 'Showdown in the Badlands', year: 'Year of the Wolf', yearNum: 2023 },
  TITANS: { name: 'TITANS', year: 'Year of the Wolf', yearNum: 2023 },
  BATTLE_OF_THE_BANDS: { name: 'Festival of Legends', year: 'Year of the Wolf', yearNum: 2023 },
  // Year of the Hydra (2022)
  RETURN_OF_THE_LICH_KING: { name: 'March of the Lich King', year: 'Year of the Hydra', yearNum: 2022 },
  PATH_OF_ARTHAS: { name: 'Path of Arthas', year: 'Year of the Hydra', yearNum: 2022 },
  REVENDRETH: { name: 'Murder at Castle Nathria', year: 'Year of the Hydra', yearNum: 2022 },
  THE_SUNKEN_CITY: { name: 'Voyage to the Sunken City', year: 'Year of the Hydra', yearNum: 2022 },
  // Year of the Gryphon (2021)
  ALTERAC_VALLEY: { name: 'Fractured in Alterac Valley', year: 'Year of the Gryphon', yearNum: 2021 },
  STORMWIND: { name: 'United in Stormwind', year: 'Year of the Gryphon', yearNum: 2021 },
  THE_BARRENS: { name: 'Forged in the Barrens', year: 'Year of the Gryphon', yearNum: 2021 },
  // Year of the Phoenix (2020)
  DARKMOON_FAIRE: { name: 'Madness at the Darkmoon Faire', year: 'Year of the Phoenix', yearNum: 2020 },
  SCHOLOMANCE: { name: 'Scholomance Academy', year: 'Year of the Phoenix', yearNum: 2020 },
  BLACK_TEMPLE: { name: 'Ashes of Outland', year: 'Year of the Phoenix', yearNum: 2020 },
  DEMON_HUNTER_INITIATE: { name: 'Demon Hunter Initiate', year: 'Year of the Phoenix', yearNum: 2020 },
  // Year of the Dragon (2019)
  DRAGONS: { name: 'Descent of Dragons', year: 'Year of the Dragon', yearNum: 2019 },
  YEAR_OF_THE_DRAGON: { name: "Galakrond's Awakening", year: 'Year of the Dragon', yearNum: 2019 },
  ULDUM: { name: 'Saviors of Uldum', year: 'Year of the Dragon', yearNum: 2019 },
  DALARAN: { name: 'Rise of Shadows', year: 'Year of the Dragon', yearNum: 2019 },
  // Year of the Raven (2018)
  TROLL: { name: "Rastakhan's Rumble", year: 'Year of the Raven', yearNum: 2018 },
  BOOMSDAY: { name: 'The Boomsday Project', year: 'Year of the Raven', yearNum: 2018 },
  GILNEAS: { name: 'The Witchwood', year: 'Year of the Raven', yearNum: 2018 },
  // Year of the Mammoth (2017)
  LOOTAPALOOZA: { name: 'Kobolds & Catacombs', year: 'Year of the Mammoth', yearNum: 2017 },
  ICECROWN: { name: 'Knights of the Frozen Throne', year: 'Year of the Mammoth', yearNum: 2017 },
  UNGORO: { name: "Journey to Un'Goro", year: 'Year of the Mammoth', yearNum: 2017 },
  // Year of the Kraken (2016)
  GANGS: { name: 'Mean Streets of Gadgetzan', year: 'Year of the Kraken', yearNum: 2016 },
  KARA: { name: 'One Night in Karazhan', year: 'Year of the Kraken', yearNum: 2016 },
  OG: { name: 'Whispers of the Old Gods', year: 'Year of the Kraken', yearNum: 2016 },
  // Pre-year sets (2015)
  LOE: { name: 'The League of Explorers', year: 'Classic', yearNum: 2015 },
  TGT: { name: 'The Grand Tournament', year: 'Classic', yearNum: 2015 },
  BRM: { name: 'Blackrock Mountain', year: 'Classic', yearNum: 2015 },
  // Pre-year sets (2014)
  GVG: { name: 'Goblins vs Gnomes', year: 'Classic', yearNum: 2014 },
  NAXX: { name: 'Curse of Naxxramas', year: 'Classic', yearNum: 2014 },
  EXPERT1: { name: 'Classic', year: 'Classic', yearNum: 2014 },
  EVENT: { name: 'Event', year: 'Classic', yearNum: 2014 },
  // Special sets
  CORE: { name: 'Core', year: 'Rotating', yearNum: new Date().getFullYear() },
};

function humanizeSetCode(code: string): string {
  return code.split('_').map(w => w[0] + w.slice(1).toLowerCase()).join(' ');
}

const RELEASE_ORDER = new Map(Object.keys(EXPANSION_METADATA).map((k, i) => [k, i]));

function sortExpansions(a: Expansion, b: Expansion): number {
  if (a.code === 'CORE' && b.code !== 'CORE') return 1;
  if (b.code === 'CORE' && a.code !== 'CORE') return -1;
  if (b.yearNum !== a.yearNum) return b.yearNum - a.yearNum;
  const ai = RELEASE_ORDER.get(a.code) ?? 999;
  const bi = RELEASE_ORDER.get(b.code) ?? 999;
  return ai - bi;
}

const EXCLUDED_SETS = new Set(['HERO_SKINS', 'VANILLA', 'LEGACY', 'PLACEHOLDER_202204']);

const NON_PACK_SETS = new Set([
  'NAXX', 'BRM', 'LOE', 'KARA',
  'PATH_OF_ARTHAS', 'DEMON_HUNTER_INITIATE', 'YEAR_OF_THE_DRAGON',
  'WONDERS', 'EVENT',
]);

const DEDUP_LOW_PRIORITY = new Set(['EVENT']);

function deriveExpansionsFromDb(cardDb: CardDb): Expansion[] {
  const counts = new Map<string, { commons: number; rares: number; epics: number; legendaries: number }>();

  for (const card of Object.values(cardDb)) {
    if (EXCLUDED_SETS.has(card.set)) continue;
    let entry = counts.get(card.set);
    if (!entry) {
      entry = { commons: 0, rares: 0, epics: 0, legendaries: 0 };
      counts.set(card.set, entry);
    }
    switch (card.rarity) {
      case 'COMMON': entry.commons++; break;
      case 'RARE': entry.rares++; break;
      case 'EPIC': entry.epics++; break;
      case 'LEGENDARY': entry.legendaries++; break;
    }
  }

  const currentYear = new Date().getFullYear();
  const expansions: Expansion[] = [];

  for (const [code, entry] of counts) {
    const meta = EXPANSION_METADATA[code];
    expansions.push({
      name: meta?.name ?? humanizeSetCode(code),
      code,
      year: meta?.year ?? 'Unknown Year',
      yearNum: meta?.yearNum ?? currentYear,
      standard: false,
      noPacks: NON_PACK_SETS.has(code),
      ...entry,
    });
  }

  return expansions;
}

function applyStandardRotation(expansions: Expansion[]): Expansion[] {
  const yearNums = [...new Set(
    expansions.filter(e => e.code !== 'CORE').map(e => e.yearNum)
  )].sort((a, b) => b - a);

  if (yearNums.length < 2) {
    return expansions.map(e => ({ ...e, standard: true }));
  }

  const maxYear = yearNums[0];
  const rotationDate = new Date(maxYear, 2, 15).getTime();
  const preRotation = Date.now() < rotationDate;
  const standardYears = new Set(yearNums.slice(0, preRotation ? 3 : 2));

  return expansions.map(e => ({
    ...e,
    standard: e.code === 'CORE' || standardYears.has(e.yearNum),
  }));
}

let cachedExpansions: Expansion[] | null = null;

export async function initExpansions(): Promise<Expansion[]> {
  const cardDb = await getCardDb();
  let expansions = deriveExpansionsFromDb(cardDb);
  expansions = applyStandardRotation(expansions);
  expansions.sort(sortExpansions);
  cachedExpansions = expansions;
  return expansions;
}

function ensureCache(): Expansion[] {
  if (!cachedExpansions) {
    const cardDb = loadCardDb();
    if (!cardDb) throw new Error('Card database not loaded. Call initExpansions() first.');
    let expansions = deriveExpansionsFromDb(cardDb);
    expansions = applyStandardRotation(expansions);
    expansions.sort(sortExpansions);
    cachedExpansions = expansions;
  }
  return cachedExpansions;
}

export function getExpansionByCode(code: string): Expansion | undefined {
  return ensureCache().find(e => e.code === code);
}

export function getStandardExpansions(): Expansion[] {
  return ensureCache().filter(e => e.standard);
}

export function getWildExpansions(): Expansion[] {
  return ensureCache().filter(e => !e.standard);
}

export function getAllExpansions(): Expansion[] {
  return [...ensureCache()];
}

export function getYears(): string[] {
  const seen = new Set<string>();
  return ensureCache().map(e => e.year).filter(y => {
    if (seen.has(y)) return false;
    seen.add(y);
    return true;
  });
}

export function getExpansionsByYear(year: string): Expansion[] {
  return ensureCache().filter(e => e.year === year);
}

export interface CardDbRefreshResult {
  db: CardDb;
  changedCardIds: string[];
}

function normalizeCardText(text?: string): string {
  if (!text) return '';
  return text.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function cardEntryChanged(a: CardDbEntry, b: CardDbEntry): boolean {
  return a.name !== b.name || a.set !== b.set || a.rarity !== b.rarity
    || a.type !== b.type || a.cardClass !== b.cardClass || a.cost !== b.cost
    || a.attack !== b.attack || a.health !== b.health
    || normalizeCardText(a.text) !== normalizeCardText(b.text)
    || a.freeNormal !== b.freeNormal || a.freeGolden !== b.freeGolden
    || a.hasSignature !== b.hasSignature || a.hasDiamond !== b.hasDiamond;
}

async function fetchSignatureFlags(): Promise<Set<string>> {
  console.log('Fetching signature flags from HearthstoneJSON XML...');
  const res = await fetch('https://api.hearthstonejson.com/v1/latest/CardDefs.xml');
  const xml = await res.text();

  const sigCardIds = new Set<string>();
  const SIG_TAG = 'enumID="2589"';
  let pos = 0;
  while ((pos = xml.indexOf(SIG_TAG, pos)) !== -1) {
    const entityStart = xml.lastIndexOf('<Entity CardID="', pos);
    if (entityStart !== -1) {
      const idStart = entityStart + 16;
      const idEnd = xml.indexOf('"', idStart);
      if (idEnd !== -1) sigCardIds.add(xml.substring(idStart, idEnd));
    }
    pos += SIG_TAG.length;
  }
  console.log(`Found ${sigCardIds.size} cards with HAS_SIGNATURE_QUALITY`);
  return sigCardIds;
}

export async function fetchAndCacheCardDb(): Promise<CardDbRefreshResult> {
  console.log('Fetching card database from HearthstoneJSON...');
  const oldDb = loadCardDb();

  const [jsonRes, signatureIds] = await Promise.all([
    fetch('https://api.hearthstonejson.com/v1/latest/enUS/cards.collectible.json'),
    fetchSignatureFlags().catch(err => {
      console.error('Failed to fetch signature flags:', err.message);
      return new Set<string>();
    }),
  ]);
  const cards: Record<string, unknown>[] = await jsonRes.json() as Record<string, unknown>[];

  const db: CardDb = {};
  const validRarities = new Set(['COMMON', 'RARE', 'EPIC', 'LEGENDARY']);

  const coreCards: Record<string, unknown>[] = [];
  const idToDbfId = new Map<string, string>();
  const seenNames = new Map<string, string>();

  const sortedCards = [...cards].sort((a, b) => {
    const pa = DEDUP_LOW_PRIORITY.has(a.set as string) ? 1 : 0;
    const pb = DEDUP_LOW_PRIORITY.has(b.set as string) ? 1 : 0;
    return pa - pb;
  });

  for (const card of sortedCards) {
    if (EXCLUDED_SETS.has(card.set as string)) continue;
    if (!validRarities.has(card.rarity as string)) continue;
    if (card.set === 'CORE') { coreCards.push(card); continue; }
    const name = card.name as string;
    const dbfId = String(card.dbfId);

    if (seenNames.has(name)) {
      const canonicalDbfId = seenNames.get(name)!;
      if (db[canonicalDbfId]) {
        if (!db[canonicalDbfId].aliasDbfIds) db[canonicalDbfId].aliasDbfIds = [];
        db[canonicalDbfId].aliasDbfIds.push(dbfId);
      }
      continue;
    }

    const entry: CardDbEntry = {
      id: card.id as string,
      set: card.set as string,
      rarity: card.rarity as CardDbEntry['rarity'],
      name,
      type: (card.type as string) || 'MINION',
      cardClass: (card.cardClass as string) || ((card.classes as string[])?.[0]) || 'NEUTRAL',
      cost: (card.cost as number) ?? 0,
      attack: card.attack as number | undefined,
      health: card.health as number | undefined,
      text: card.text as string | undefined,
    };
    if (card.howToEarn) entry.freeNormal = true;
    if (card.howToEarnGolden) entry.freeGolden = true;
    if (card.hasDiamondSkin) entry.hasDiamond = true;
    if (signatureIds.has(entry.id)) entry.hasSignature = true;
    seenNames.set(name, dbfId);
    db[dbfId] = entry;
    idToDbfId.set(entry.id, dbfId);
  }

  for (const card of coreCards) {
    const name = card.name as string;
    const coreDbfId = String(card.dbfId);
    const entry: CardDbEntry = {
      id: card.id as string,
      set: 'CORE',
      rarity: card.rarity as CardDbEntry['rarity'],
      name,
      type: (card.type as string) || 'MINION',
      cardClass: (card.cardClass as string) || ((card.classes as string[])?.[0]) || 'NEUTRAL',
      cost: (card.cost as number) ?? 0,
      attack: card.attack as number | undefined,
      health: card.health as number | undefined,
      text: card.text as string | undefined,
    };
    if (card.howToEarn) entry.freeNormal = true;
    if (card.howToEarnGolden) entry.freeGolden = true;
    if (card.hasDiamondSkin) entry.hasDiamond = true;
    if (signatureIds.has(entry.id)) entry.hasSignature = true;
    db[coreDbfId] = entry;

    const expansionDbfId = seenNames.get(name);
    if (expansionDbfId && db[expansionDbfId]) {
      if (!db[expansionDbfId].aliasDbfIds) db[expansionDbfId].aliasDbfIds = [];
      db[expansionDbfId].aliasDbfIds.push(coreDbfId);
    }
  }

  const changedCardIds: string[] = [];
  if (oldDb) {
    for (const [dbfId, newEntry] of Object.entries(db)) {
      const oldEntry = oldDb[dbfId];
      if (!oldEntry || cardEntryChanged(oldEntry, newEntry)) {
        changedCardIds.push(newEntry.id);
      }
    }
  }

  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(CARD_DB_PATH, JSON.stringify(db));
  console.log(`Cached ${Object.keys(db).length} cards to ${CARD_DB_PATH}`);
  if (changedCardIds.length > 0) {
    console.log(`Detected ${changedCardIds.length} changed/new cards`);
  }

  cachedExpansions = null;
  return { db, changedCardIds };
}

export function loadCardDb(): CardDb | null {
  if (!existsSync(CARD_DB_PATH)) return null;
  return JSON.parse(readFileSync(CARD_DB_PATH, 'utf-8'));
}

export async function getCardDb(): Promise<CardDb> {
  const cached = loadCardDb();
  if (cached && Object.keys(cached).length > 0) return cached;
  return fetchAndCacheCardDb();
}

export function buildCollectionState(
  expansion: Expansion,
  ownedNormal: Map<string, number>,
  cardDb: CardDb,
): ExpansionCollectionState {
  let c0 = expansion.commons, c1 = 0, c2 = 0;
  let r0 = expansion.rares, r1 = 0, r2 = 0;
  let e0 = expansion.epics, e1 = 0, e2 = 0;
  let lOwned = 0;

  for (const [dbfId, count] of ownedNormal) {
    const card = cardDb[dbfId];
    if (!card || card.set !== expansion.code) continue;

    const clamped = Math.min(count, card.rarity === 'LEGENDARY' ? 1 : 2);

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

export function manualCollectionState(
  expansion: Expansion,
  ownedCommons: number,
  ownedRares: number,
  ownedEpics: number,
  ownedLegendaries: number,
): ExpansionCollectionState {
  const cOwned = Math.min(ownedCommons, expansion.commons);
  const rOwned = Math.min(ownedRares, expansion.rares);
  const eOwned = Math.min(ownedEpics, expansion.epics);
  const lOwned = Math.min(ownedLegendaries, expansion.legendaries);

  const cAt2 = Math.floor(cOwned * 0.5);
  const cAt1 = cOwned - cAt2;
  const rAt2 = Math.floor(rOwned * 0.4);
  const rAt1 = rOwned - rAt2;
  const eAt2 = Math.floor(eOwned * 0.3);
  const eAt1 = eOwned - eAt2;

  return {
    expansion,
    commons: { at0: expansion.commons - cOwned, at1: cAt1, at2: cAt2 },
    rares: { at0: expansion.rares - rOwned, at1: rAt1, at2: rAt2 },
    epics: { at0: expansion.epics - eOwned, at1: eAt1, at2: eAt2 },
    legendaries: { unowned: expansion.legendaries - lOwned, owned: lOwned },
  };
}

export function parseHsReplayCollection(
  json: HsReplayCollection,
  cardDb: CardDb,
): { normalOwned: Map<string, number>; dust: number } {
  const normalOwned = new Map<string, number>();
  for (const [dbfId, counts] of Object.entries(json.collection)) {
    const normalCount = counts[0] ?? 0;
    if (normalCount > 0) normalOwned.set(dbfId, normalCount);
  }
  return { normalOwned, dust: json.dust ?? 0 };
}
