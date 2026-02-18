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

export interface ShopResponse {
  bundles: ShopBundle[];
  cacheAgeMs: number | null;
}
