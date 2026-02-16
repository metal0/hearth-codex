export interface CardDbEntry {
  id: string;
  set: string;
  rarity: Rarity;
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

export interface CollectionData {
  collection: Record<string, number[]>;
  dust?: number;
  gold?: number;
  syncedAt?: number | null;
}

export interface MetaEntry {
  dbfId: number;
  popularity: number;
  winrate: number;
  decks: number;
  class: string;
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

export interface CalculatorResponse {
  perExpansion: SimulationResult[];
  comparison: ComparisonResult;
}

export type Rarity = 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';

export interface EnrichedCard {
  dbfId: string;
  id: string;
  name: string;
  set: string;
  rarity: Rarity;
  type: string;
  cardClass: string;
  cost: number;
  attack?: number;
  health?: number;
  text?: string;
  normalCount: number;
  goldenCount: number;
  diamondCount: number;
  signatureCount: number;
  totalOwned: number;
  maxCopies: number;
  imageUrl: string;
  inclusionRate: number;
  winrate: number;
  decks: number;
  inclusionRateStd: number;
  winrateStd: number;
  decksStd: number;
  inclusionRateWild: number;
  winrateWild: number;
  decksWild: number;
  freeNormal?: boolean;
  freeGolden?: boolean;
  hasSignature?: boolean;
  hasDiamond?: boolean;
  inCore?: boolean;
  aliasDbfIds?: string[];
}

export interface CollectionSnapshot {
  timestamp: number
  dust: number
  overall: { owned: number; total: number }
  standard: { owned: number; total: number }
  wild: { owned: number; total: number }
  expansions: Array<{ code: string; owned: number; total: number }>
}

export type CollectionMode = 'normal' | 'golden' | 'signature' | 'diamond';
export type OwnershipFilter = 'all' | 'owned' | 'incomplete';
export type FormatFilter = 'standard' | 'wild';
export type SortOption = 'name' | 'cost' | 'rarity' | 'set' | 'class' | 'inclusion' | 'winrate';

export const RARITY_ORDER: Record<Rarity, number> = {
  LEGENDARY: 0,
  EPIC: 1,
  RARE: 2,
  COMMON: 3,
};

export const RARITY_COLORS: Record<Rarity, string> = {
  LEGENDARY: '#ff8000',
  EPIC: '#a335ee',
  RARE: '#0070dd',
  COMMON: '#9d9d9d',
};

export const DUST_COST: Record<Rarity, number> = {
  COMMON: 40,
  RARE: 100,
  EPIC: 400,
  LEGENDARY: 1600,
};

export const DUST_DISENCHANT: Record<Rarity, number> = {
  COMMON: 5,
  RARE: 20,
  EPIC: 100,
  LEGENDARY: 400,
};

export const DUST_DISENCHANT_GOLDEN: Record<Rarity, number> = {
  COMMON: 50,
  RARE: 100,
  EPIC: 400,
  LEGENDARY: 1600,
};

export const HS_CLASSES = [
  'NEUTRAL', 'DEATHKNIGHT', 'DEMONHUNTER', 'DRUID', 'HUNTER',
  'MAGE', 'PALADIN', 'PRIEST', 'ROGUE', 'SHAMAN', 'WARLOCK', 'WARRIOR',
] as const;

export type ObtainabilityFilter = 'all' | 'obtainable' | 'unobtainable';

export type DiamondAcquisitionMethod = 'achievement' | 'miniset' | 'tavern-pass' | 'preorder' | 'shop' | 'darkmoon' | 'event' | 'unknown';
export type SignatureAcquisitionMethod = 'pack' | 'shop' | 'achievement' | 'tavern-pass' | 'event' | 'darkmoon' | 'unknown';

export interface DiamondAcquisitionInfo {
  method: DiamondAcquisitionMethod;
  description: string;
  obtainable: boolean;
  achievementSet?: string;
}

export interface SignatureAcquisitionInfo {
  method: SignatureAcquisitionMethod;
  description: string;
  obtainable: boolean;
  achievementSet?: string;
}

const DIAMOND_ACQUISITION: Record<string, DiamondAcquisitionInfo> = {
  // --- Achievement: collect all legendaries from a set ---
  EX1_298:  { method: 'achievement', description: 'Collect all Classic legendaries', obtainable: true, achievementSet: 'EXPERT1' },
  BAR_048:  { method: 'achievement', description: 'Collect all Forged in the Barrens legendaries', obtainable: true, achievementSet: 'THE_BARRENS' },
  SW_448:   { method: 'achievement', description: 'Collect all United in Stormwind legendaries', obtainable: true, achievementSet: 'STORMWIND' },
  AV_284:   { method: 'achievement', description: 'Collect all Alterac Valley legendaries', obtainable: true, achievementSet: 'ALTERAC_VALLEY' },
  TSC_087:  { method: 'achievement', description: 'Collect all Sunken City legendaries', obtainable: true, achievementSet: 'THE_SUNKEN_CITY' },
  REV_934:  { method: 'achievement', description: 'Collect all Castle Nathria legendaries', obtainable: true, achievementSet: 'REVENDRETH' },
  RLK_924:  { method: 'achievement', description: 'Collect all March of the Lich King legendaries', obtainable: true, achievementSet: 'RETURN_OF_THE_LICH_KING' },
  ETC_399:  { method: 'achievement', description: 'Collect all Festival of Legends legendaries', obtainable: true, achievementSet: 'BATTLE_OF_THE_BANDS' },
  TTN_903:  { method: 'achievement', description: 'Collect all TITANS legendaries', obtainable: true, achievementSet: 'TITANS' },
  WW_392:   { method: 'achievement', description: 'Collect all Showdown in the Badlands legendaries', obtainable: true, achievementSet: 'WILD_WEST' },
  CFM_637:  { method: 'achievement', description: 'Collect all Mean Streets of Gadgetzan legendaries', obtainable: true, achievementSet: 'GANGS' },
  LOOT_516: { method: 'achievement', description: 'Collect all Kobolds & Catacombs legendaries', obtainable: true, achievementSet: 'LOOTAPALOOZA' },
  ULD_003:  { method: 'achievement', description: 'Collect all Saviors of Uldum legendaries', obtainable: true, achievementSet: 'ULDUM' },
  SCH_351:  { method: 'achievement', description: 'Collect all Scholomance Academy legendaries', obtainable: true, achievementSet: 'SCHOLOMANCE' },

  // --- Miniset: golden miniset purchase reward ---
  NX2_033:  { method: 'miniset', description: 'Return to Naxxramas golden miniset', obtainable: false },
  JAM_036:  { method: 'miniset', description: 'Audiopocalypse golden miniset', obtainable: false },
  YOG_516:  { method: 'miniset', description: 'Fall of Ulduar golden miniset', obtainable: false },
  DEEP_020: { method: 'miniset', description: 'Delve into Deepholm golden miniset', obtainable: false },
  MIS_026:  { method: 'miniset', description: "Dr. Boom's Inventions golden miniset", obtainable: true },
  WORK_043: { method: 'miniset', description: 'Traveling Travel Agency golden miniset', obtainable: true },
  SC_013:   { method: 'miniset', description: 'Heroes of StarCraft golden miniset', obtainable: true },
  FIR_959:  { method: 'miniset', description: 'Embers of the World Tree golden miniset', obtainable: true },
  DINO_430: { method: 'miniset', description: 'Day of Rebirth golden miniset', obtainable: true },
  END_037:  { method: 'miniset', description: 'Echoes of the Infinite golden miniset', obtainable: true },

  // --- Tavern Pass: seasonal pass reward (time-limited) ---
  BAR_078:  { method: 'tavern-pass', description: 'Forged in the Barrens Tavern Pass', obtainable: false },
  SW_081:   { method: 'tavern-pass', description: 'United in Stormwind Tavern Pass', obtainable: false },
  AV_143:   { method: 'tavern-pass', description: 'Fractured in Alterac Valley Tavern Pass', obtainable: false },
  TSC_908:  { method: 'tavern-pass', description: 'Voyage to the Sunken City Tavern Pass', obtainable: false },
  REV_022:  { method: 'tavern-pass', description: 'Murder at Castle Nathria Tavern Pass', obtainable: false },
  RLK_803:  { method: 'tavern-pass', description: 'March of the Lich King Tavern Pass', obtainable: false },
  ETC_334:  { method: 'tavern-pass', description: 'Festival of Legends Tavern Pass', obtainable: false },
  TTN_717:  { method: 'tavern-pass', description: 'TITANS Tavern Pass', obtainable: false },
  WW_364:   { method: 'tavern-pass', description: 'Showdown in the Badlands Tavern Pass', obtainable: false },
  TOY_960:  { method: 'tavern-pass', description: "Whizbang's Workshop Tavern Pass", obtainable: false },
  VAC_446:  { method: 'tavern-pass', description: 'Perils in Paradise Tavern Pass', obtainable: false },
  GDB_128:  { method: 'tavern-pass', description: 'The Great Dark Beyond Tavern Pass', obtainable: false },
  EDR_000:  { method: 'tavern-pass', description: 'Into the Emerald Dream Tavern Pass', obtainable: false },
  TLC_100:  { method: 'tavern-pass', description: "The Lost City of Un'Goro Tavern Pass", obtainable: false },
  TIME_103: { method: 'tavern-pass', description: 'Across the Timeways Tavern Pass', obtainable: false },

  // --- Pre-order bundle ---
  TIME_063: { method: 'preorder', description: 'Across the Timeways Sequence Bundle', obtainable: false },

  // --- Shop-only (limited time, no longer available) ---
  GIL_820:  { method: 'shop', description: 'Diamond Shudderwock Bundle', obtainable: false },
  BOT_548:  { method: 'shop', description: 'TITANS Mega Bundle pre-purchase', obtainable: false },
  RLK_593:  { method: 'shop', description: 'Shop bundle (2500 Runestones)', obtainable: false },
  ETC_080:  { method: 'shop', description: 'Shop bundle', obtainable: false },
  ETC_071:  { method: 'shop', description: 'Shop bundle', obtainable: false },
  TTN_429:  { method: 'shop', description: 'Shop bundle', obtainable: false },
  TTN_092:  { method: 'shop', description: 'Shop bundle', obtainable: false },
  TTN_850:  { method: 'shop', description: 'Shop bundle', obtainable: false },
  WW_379:   { method: 'shop', description: 'Shop bundle', obtainable: false },
  WW_010:   { method: 'shop', description: 'Shop bundle', obtainable: false },
  TOY_607:  { method: 'shop', description: 'Shop bundle', obtainable: false },
  TOY_357:  { method: 'shop', description: 'Shop bundle', obtainable: false },
  TOY_807:  { method: 'shop', description: 'Shop bundle', obtainable: false },
  VAC_426:  { method: 'shop', description: 'Shop bundle', obtainable: false },
  VAC_524:  { method: 'shop', description: 'Shop bundle', obtainable: false },
  VAC_923:  { method: 'shop', description: 'Shop bundle', obtainable: false },
  VAC_415:  { method: 'shop', description: 'Shop bundle', obtainable: false },
  WORK_027: { method: 'shop', description: 'Shop bundle', obtainable: false },
  GDB_131:  { method: 'shop', description: 'Shop bundle', obtainable: false },
  GDB_145:  { method: 'shop', description: 'Shop bundle', obtainable: false },
  GDB_472:  { method: 'shop', description: 'Shop bundle', obtainable: false },
  GDB_455:  { method: 'shop', description: 'Shop bundle', obtainable: false },
  GDB_470:  { method: 'shop', description: 'Shop bundle', obtainable: false },
  GDB_448:  { method: 'shop', description: 'Shop bundle', obtainable: false },
  GDB_304:  { method: 'shop', description: 'Shop bundle', obtainable: false },
  EDR_464:  { method: 'shop', description: 'Diamond Tyrande Bundle (6000 Runestones)', obtainable: false },
  EDR_853:  { method: 'shop', description: 'Shop bundle', obtainable: false },
  EDR_493:  { method: 'shop', description: 'Shop bundle', obtainable: false },
  EDR_517:  { method: 'shop', description: 'Shop bundle', obtainable: false },
  EDR_526:  { method: 'shop', description: 'Shop bundle', obtainable: false },
  EDR_487:  { method: 'shop', description: 'Shop bundle', obtainable: false },
  EDR_844:  { method: 'shop', description: 'Shop bundle', obtainable: false },
  TLC_257:  { method: 'shop', description: 'Shop bundle', obtainable: false },
  TLC_463:  { method: 'shop', description: 'Shop bundle', obtainable: false },
  TLC_452:  { method: 'shop', description: 'Shop bundle', obtainable: false },
  TIME_609: { method: 'shop', description: 'Diamond Sylvanas Bundle (6000 Runestones)', obtainable: false },

  // --- Darkmoon Faire prizes ---
  TLC_106:  { method: 'darkmoon', description: 'Darkmoon Faire: Alexstrasza Treasure', obtainable: true },
  DINO_401: { method: 'darkmoon', description: 'Darkmoon Faire: Rabbitath Treasure', obtainable: true },
  TLC_836:  { method: 'darkmoon', description: 'Darkmoon Faire: King Krush Treasure', obtainable: true },
  TLC_810:  { method: 'darkmoon', description: 'Darkmoon Faire: Yogg-Saron Treasure', obtainable: true },
  TIME_013: { method: 'darkmoon', description: 'Darkmoon Faire: Arfus Treasure', obtainable: true },
  TIME_435: { method: 'darkmoon', description: 'Darkmoon Faire: Turalyon Treasure', obtainable: true },
  END_006:  { method: 'darkmoon', description: 'Darkmoon Faire: Ysera Treasure', obtainable: true },

  // --- Event rewards ---
  AV_223:   { method: 'event', description: 'Alterac Valley login reward (Feb 2022 - Apr 2023)', obtainable: false },

  // --- Shop (one-time bundles, no achievement path) ---
  AV_100:   { method: 'shop', description: 'Shop purchase (Apr 2022, 3000 Gold)', obtainable: false },
  GIFT_01:  { method: 'shop', description: '10th Anniversary Shop bundle', obtainable: false },
};

export function getDiamondAcquisition(cardId: string): DiamondAcquisitionInfo | null {
  return DIAMOND_ACQUISITION[cardId] ?? null;
}

const REVIEWED_SIGNATURE_SETS = new Set([
  'EXPERT1',
  'THE_SUNKEN_CITY',
  'REVENDRETH',
  'RETURN_OF_THE_LICH_KING',
  'BATTLE_OF_THE_BANDS',
  'TITANS',
  'WILD_WEST',
  'WHIZBANGS_WORKSHOP',
  'ISLAND_VACATION',
  'SPACE',
  'EMERALD_DREAM',
  'THE_LOST_CITY',
  'TIME_TRAVEL',
]);

const SIGNATURE_ACQUISITION: Record<string, SignatureAcquisitionInfo> = {
  // --- Shop-only signatures (legendary, cannot drop from packs) ---
  DINO_407: { method: 'shop', description: 'Shop bundle', obtainable: false },
  EDR_238:  { method: 'shop', description: 'Shop bundle', obtainable: false },
  EDR_464:  { method: 'shop', description: 'Shan Shui Tyrande Bundle', obtainable: false },
  EDR_844:  { method: 'shop', description: 'Shan Shui bundle', obtainable: false },
  EDR_845:  { method: 'shop', description: 'Shop bundle', obtainable: false },
  END_017:  { method: 'shop', description: 'Shop bundle', obtainable: false },
  END_036:  { method: 'shop', description: 'Shop bundle', obtainable: false },
  EX1_002:  { method: 'shop', description: 'Ink Wash Signature bundle', obtainable: false },
  FIR_951:  { method: 'shop', description: 'Ink Wash bundle', obtainable: false },
  FIR_958:  { method: 'shop', description: 'Ink Wash bundle', obtainable: false },
  GDB_466:  { method: 'shop', description: 'Shop bundle', obtainable: false },
  GDB_856:  { method: 'shop', description: 'Shop bundle', obtainable: false },
  REV_018:  { method: 'shop', description: 'Shop bundle', obtainable: false },
  SC_004:   { method: 'shop', description: 'StarCraft pre-order bundle', obtainable: false },
  SC_400:   { method: 'shop', description: 'StarCraft pre-order bundle', obtainable: false },
  SC_754:   { method: 'shop', description: 'StarCraft pre-order bundle', obtainable: false },
  TIME_005: { method: 'shop', description: 'Shop bundle', obtainable: false },
  TIME_009: { method: 'shop', description: 'Shop bundle', obtainable: false },
  TIME_024: { method: 'shop', description: 'Shop bundle', obtainable: false },
  TIME_042: { method: 'shop', description: 'Shop bundle', obtainable: false },
  TIME_209: { method: 'shop', description: 'Shop bundle', obtainable: false },
  TIME_435: { method: 'shop', description: 'Shop bundle', obtainable: false },
  TIME_618: { method: 'shop', description: 'Shop bundle', obtainable: false },
  TIME_619: { method: 'shop', description: 'Shop bundle', obtainable: false },
  TIME_706: { method: 'shop', description: 'Shop bundle', obtainable: false },
  TLC_102:  { method: 'shop', description: 'Shop bundle', obtainable: false },
  TLC_446:  { method: 'shop', description: 'Shop bundle', obtainable: false },
  TLC_513:  { method: 'shop', description: 'Shop bundle', obtainable: false },
  TLC_522:  { method: 'shop', description: 'Shop bundle', obtainable: false },
  TLC_602:  { method: 'shop', description: 'Shop bundle', obtainable: false },
  TLC_817:  { method: 'shop', description: 'Shop bundle', obtainable: false },

  // --- Achievement: collect all legendaries from a set (Whizbang's Workshop onward) ---
  TOY_356:  { method: 'achievement', description: "Collect all Whizbang's Workshop legendaries", obtainable: true, achievementSet: 'WHIZBANGS_WORKSHOP' },
  TOY_651:  { method: 'achievement', description: "Collect all Whizbang's Workshop legendaries", obtainable: true, achievementSet: 'WHIZBANGS_WORKSHOP' },
  VAC_915:  { method: 'achievement', description: 'Collect all Perils in Paradise legendaries', obtainable: true, achievementSet: 'ISLAND_VACATION' },
  VAC_958:  { method: 'achievement', description: 'Collect all Perils in Paradise legendaries', obtainable: true, achievementSet: 'ISLAND_VACATION' },
  GDB_310:  { method: 'achievement', description: 'Collect 15 Great Dark Beyond legendaries', obtainable: true, achievementSet: 'SPACE' },
  GDB_467:  { method: 'achievement', description: 'Collect all Great Dark Beyond legendaries', obtainable: true, achievementSet: 'SPACE' },
  EDR_105:  { method: 'achievement', description: 'Collect all Emerald Dream legendaries', obtainable: true, achievementSet: 'EMERALD_DREAM' },
  EDR_971:  { method: 'achievement', description: 'Collect all Emerald Dream legendaries', obtainable: true, achievementSet: 'EMERALD_DREAM' },
  TLC_226:  { method: 'achievement', description: "Collect all Lost City of Un'Goro legendaries", obtainable: true, achievementSet: 'THE_LOST_CITY' },
  TLC_243:  { method: 'achievement', description: "Collect all Lost City of Un'Goro legendaries", obtainable: true, achievementSet: 'THE_LOST_CITY' },
  TIME_217: { method: 'achievement', description: 'Collect all Across the Timeways legendaries', obtainable: true, achievementSet: 'TIME_TRAVEL' },
  TIME_053: { method: 'achievement', description: 'Collect all Across the Timeways legendaries', obtainable: true, achievementSet: 'TIME_TRAVEL' },

  // --- Tavern Pass signatures (time-limited, non-legendary) ---
  TOY_821:  { method: 'tavern-pass', description: "Whizbang's Workshop Tavern Pass", obtainable: false },
  TOY_376:  { method: 'tavern-pass', description: "Whizbang's Workshop Tavern Pass", obtainable: false },
  TOY_866:  { method: 'tavern-pass', description: "Whizbang's Workshop Tavern Pass", obtainable: false },
  VAC_304:  { method: 'tavern-pass', description: 'Perils in Paradise Tavern Pass', obtainable: false },
  VAC_948:  { method: 'tavern-pass', description: 'Perils in Paradise Tavern Pass', obtainable: false },
  VAC_523:  { method: 'tavern-pass', description: 'Perils in Paradise Tavern Pass', obtainable: false },
  GDB_862:  { method: 'tavern-pass', description: 'The Great Dark Beyond Tavern Pass', obtainable: false },
  GDB_341:  { method: 'tavern-pass', description: 'The Great Dark Beyond Tavern Pass', obtainable: false },
  GDB_301:  { method: 'tavern-pass', description: 'The Great Dark Beyond Tavern Pass', obtainable: false },
  EDR_861:  { method: 'tavern-pass', description: 'Into the Emerald Dream Tavern Pass', obtainable: false },
  EDR_001:  { method: 'tavern-pass', description: 'Into the Emerald Dream Tavern Pass', obtainable: false },
  EDR_979:  { method: 'tavern-pass', description: 'Into the Emerald Dream Tavern Pass', obtainable: false },
  TLC_401:  { method: 'tavern-pass', description: "Lost City of Un'Goro Tavern Pass", obtainable: false },
  TLC_519:  { method: 'tavern-pass', description: "Lost City of Un'Goro Tavern Pass", obtainable: false },
  TLC_828:  { method: 'tavern-pass', description: "Lost City of Un'Goro Tavern Pass", obtainable: false },
  TIME_100: { method: 'tavern-pass', description: 'Across the Timeways Tavern Pass', obtainable: false },
  TIME_058: { method: 'tavern-pass', description: 'Across the Timeways Tavern Pass', obtainable: false },
  TIME_041: { method: 'tavern-pass', description: 'Across the Timeways Tavern Pass', obtainable: false },
  TIME_852: { method: 'tavern-pass', description: 'Across the Timeways Tavern Pass (Level 100)', obtainable: false },
};

export function getSignatureAcquisition(cardId: string, setCode: string, rarity: Rarity): SignatureAcquisitionInfo {
  const explicit = SIGNATURE_ACQUISITION[cardId];
  if (explicit) return explicit;
  if (REVIEWED_SIGNATURE_SETS.has(setCode) && rarity === 'LEGENDARY')
    return { method: 'pack', description: 'Obtainable from golden packs', obtainable: true };
  if (REVIEWED_SIGNATURE_SETS.has(setCode))
    return { method: 'event', description: 'Event, Tavern Pass, or promotion', obtainable: false };
  return { method: 'unknown', description: 'Acquisition method unknown', obtainable: true };
}

export const CLASS_COLORS: Record<string, string> = {
  DEATHKNIGHT: '#C41E3A',
  DEMONHUNTER: '#A330C9',
  DRUID: '#FF7C0A',
  HUNTER: '#AAD372',
  MAGE: '#3FC7EB',
  PALADIN: '#F48CBA',
  PRIEST: '#FFFFFF',
  ROGUE: '#FFF468',
  SHAMAN: '#0070DD',
  WARLOCK: '#8788EE',
  WARRIOR: '#C69B6D',
  NEUTRAL: '#808080',
};

export interface BracketInfo {
  key: string;
  rankRange: string;
  timeRange: string;
  premium: boolean;
  fetchedAt: number;
  cardCount: number;
  fresh: boolean;
}

export interface BracketsResponse {
  brackets: BracketInfo[];
  allBrackets: Array<{ key: string; rankRange: string; timeRange: string; premium: boolean; requiresSession: boolean }>;
  lastPremiumFetchAt: number | null;
}

export const FREE_BRACKET = 'BRONZE_THROUGH_GOLD__CURRENT_PATCH';

export const RANK_RANGE_LABELS: Record<string, string> = {
  BRONZE_THROUGH_GOLD: 'Bronze - Gold',
  DIAMOND_THROUGH_LEGEND: 'Diamond - Legend',
  ALL: 'All Ranks',
};

export const TIME_RANGE_LABELS: Record<string, string> = {
  CURRENT_PATCH: 'Current Patch',
  CURRENT_EXPANSION: 'Current Expansion',
  LAST_7_DAYS: 'Last 7 Days',
  LAST_14_DAYS: 'Last 14 Days',
};

export function bracketLabel(key: string): string {
  const [rank, time] = key.split('__');
  return `${RANK_RANGE_LABELS[rank] ?? rank} / ${TIME_RANGE_LABELS[time] ?? time}`;
}

export interface ArchetypeInfo {
  id: number;
  name: string;
  playerClass: string;
  url: string;
  pctOfTotal?: number;
  winRate?: number;
  totalGames?: number;
  avgTurns?: number;
  avgDuration?: number;
  climbingSpeed?: number;
}

export interface DeckInfo {
  deckId: string;
  archetypeId: number;
  playerClass: string;
  winRate: number;
  totalGames: number;
  cards: [number, number][];
  deckstring: string;
  duration?: number;
  sideboardPairs?: [number, number][];
}

export interface CompanionCard {
  id: string;
  name: string;
  cost: number;
  type: string;
  set: string;
  rarity: string;
  cardClass: string;
  ownerDbfId?: number;
  sideboard?: boolean;
}

export interface HsguruMatchup {
  opponentClass: string;
  winRate: number;
  totalGames: number;
}

export interface DecksResponse {
  archetypes: ArchetypeInfo[];
  decks: DeckInfo[];
  companionCards: Record<string, CompanionCard>;
  fetchedAt: number;
  source?: 'hsreplay' | 'hsguru';
}

