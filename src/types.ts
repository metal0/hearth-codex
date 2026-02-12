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
}

export type CardDb = Record<string, CardDbEntry>;

export interface Expansion {
  name: string;
  code: string;
  year: string;
  yearNum: number;
  standard: boolean;
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
  freeNormal?: boolean;
  freeGolden?: boolean;
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
