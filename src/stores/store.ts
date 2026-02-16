import { create } from 'zustand';
import type {
  CardDb, Expansion, CollectionData, CalculatorResponse, MetaEntry,
  OwnershipFilter, FormatFilter, SortOption, EnrichedCard, Rarity, CollectionMode,
  ObtainabilityFilter, BracketInfo, ArchetypeInfo, DeckInfo, CompanionCard,
} from '../types.ts';
import { RARITY_ORDER, DUST_COST, HS_CLASSES, getDiamondAcquisition, getSignatureAcquisition, FREE_BRACKET } from '../types.ts';

const CLASS_ORDER = Object.fromEntries(HS_CLASSES.map((c, i) => [c, i === 0 ? 99 : i])) as Record<string, number>;

import {
  api, clearStoredToken, getStoredAccountId,
  getAuthTier, getCollectionMeta, getLocalCollection, setLocalCollection,
  clearCollectionOnlyData, type AuthTier,
} from '../services/api.ts';

function craftQueueKey(): string {
  const acct = getStoredAccountId();
  return acct ? `hs-craft-queue-${acct}` : 'hs-craft-queue';
}
function loadCraftQueue(): string[] {
  try {
    const raw = localStorage.getItem(craftQueueKey());
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function saveCraftQueue(queue: string[]) {
  try { localStorage.setItem(craftQueueKey(), JSON.stringify(queue)); } catch {}
}
import { parseSearch } from '../utils/searchParser.ts';
import CalculatorWorker from '../workers/calculator.worker.ts?worker';

export interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error';
}

interface AppState {
  cards: CardDb;
  expansions: Expansion[];
  collection: CollectionData | null;
  metaStandard: Record<string, MetaEntry>;
  metaWild: Record<string, MetaEntry>;

  cardsLoading: boolean;
  collectionLoading: boolean;
  calculatorLoading: boolean;
  syncLoading: boolean;

  toasts: Toast[];
  addToast: (message: string, type: 'success' | 'error') => void;
  dismissToast: (id: number) => void;

  dataErrors: string[];
  autoSyncRan: boolean;

  collectionMode: CollectionMode;
  selectedSets: string[];
  selectedClasses: string[];
  selectedRarities: Rarity[];
  ownershipFilter: OwnershipFilter;
  obtainabilityFilter: ObtainabilityFilter;
  formatFilter: FormatFilter;
  searchText: string;
  sortBy: SortOption;
  sortAsc: boolean;

  calculatorResults: CalculatorResponse | null;

  fetchCards: () => Promise<void>;
  fetchCollection: () => Promise<void>;
  fetchExpansions: () => Promise<void>;
  fetchMeta: () => Promise<void>;
  autoSync: () => Promise<void>;
  dismissError: (index: number) => void;
  collectionSyncedAt: number | null;
  syncCollection: (sessionId?: string) => Promise<{ success: boolean; cards?: number; dust?: number; error?: string }>;
  runCalculator: (expansionCodes: string[], dust: number, metaOnly?: boolean) => Promise<void>;

  setCollectionMode: (mode: CollectionMode) => void;
  setSelectedSets: (sets: string[]) => void;
  setSelectedClasses: (classes: string[]) => void;
  setSelectedRarities: (rarities: Rarity[]) => void;
  setOwnershipFilter: (filter: OwnershipFilter) => void;
  setObtainabilityFilter: (filter: ObtainabilityFilter) => void;
  setFormatFilter: (filter: FormatFilter) => void;
  setSearchText: (text: string) => void;
  setSortBy: (sort: SortOption) => void;
  toggleSortDirection: () => void;

  authTier: AuthTier;
  battletag: string | null;
  setBattletag: (tag: string | null) => void;
  artVersion: number;
  hostedMode: boolean;
  setHostedMode: (hosted: boolean) => void;
  logout: () => void;

  metaBracket: string;
  availableBrackets: BracketInfo[];
  isPremium: boolean | null;
  premiumConsent: boolean;
  metaFallback: boolean;
  setMetaBracket: (bracket: string) => Promise<void>;
  fetchBrackets: () => Promise<void>;
  setPremiumConsent: (consent: boolean) => Promise<void>;

  showHeatmap: boolean;
  toggleHeatmap: () => void;
  filtersExpanded: boolean;
  toggleFilters: () => void;

  deckArchetypes: ArchetypeInfo[];
  deckList: DeckInfo[];
  deckCompanionCards: Record<string, CompanionCard>;
  decksLoading: boolean;
  decksFetchedAt: number | null;
  deckGameMode: 'standard' | 'wild';
  deckSource: 'hsreplay' | 'hsguru' | null;
  setDeckGameMode: (mode: 'standard' | 'wild') => void;
  fetchDecks: (opts?: { minGames?: number }) => Promise<void>;

  craftQueue: string[];
  addToQueue: (dbfId: string) => void;
  removeFromQueue: (dbfId: string) => void;
  clearQueue: () => void;
  reloadCraftQueue: () => void;

  getEnrichedCards: () => EnrichedCard[];
  getFilteredCards: () => EnrichedCard[];
}

export const useStore = create<AppState>((set, get) => ({
  cards: {},
  expansions: [],
  collection: null,
  metaStandard: {},
  metaWild: {},

  cardsLoading: false,
  collectionLoading: false,
  calculatorLoading: false,
  syncLoading: false,
  toasts: [],
  addToast: (message, type) => {
    const id = Date.now()
    set(s => ({ toasts: [...s.toasts, { id, message, type }] }))
    setTimeout(() => get().dismissToast(id), 4000)
  },
  dismissToast: (id) => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
  dataErrors: [],
  autoSyncRan: false,
  collectionSyncedAt: null,

  collectionMode: 'normal',
  selectedSets: [],
  selectedClasses: [],
  selectedRarities: [],
  ownershipFilter: 'all',
  obtainabilityFilter: 'all',
  formatFilter: 'standard',
  searchText: '',
  sortBy: 'set',
  sortAsc: true,

  calculatorResults: null,

  authTier: getAuthTier(),
  battletag: null,
  setBattletag: (tag) => set({ battletag: tag }),
  artVersion: 1,
  hostedMode: false,
  setHostedMode: (hosted) => set({ hostedMode: hosted }),
  logout: () => {
    if (get().authTier === 'full') {
      clearStoredToken();
    } else {
      clearCollectionOnlyData();
    }
    window.location.reload();
  },

  metaBracket: FREE_BRACKET,
  availableBrackets: [],
  isPremium: null,
  premiumConsent: false,
  metaFallback: false,

  setMetaBracket: async (bracket) => {
    if (get().authTier !== 'full') return;
    set({ metaBracket: bracket, metaFallback: false });
    try { await api.updateSettings({ metaBracket: bracket }); } catch {}
    await get().fetchMeta();
  },

  fetchBrackets: async () => {
    try {
      const data = await api.getMetaBrackets();
      set({ availableBrackets: data.brackets });
    } catch (err) {
      console.error('Failed to fetch brackets:', err);
    }
  },

  setPremiumConsent: async (consent) => {
    set({ premiumConsent: consent });
    try { await api.updateSettings({ premiumConsent: consent }); } catch {}
  },

  showHeatmap: false,
  toggleHeatmap: () => set(s => ({ showHeatmap: !s.showHeatmap })),
  filtersExpanded: false,
  toggleFilters: () => set(s => ({ filtersExpanded: !s.filtersExpanded })),

  deckArchetypes: [],
  deckList: [],
  deckCompanionCards: {},
  decksLoading: false,
  decksFetchedAt: null,
  deckGameMode: 'standard',
  deckSource: null,
  setDeckGameMode: (mode) => {
    set({ deckGameMode: mode, deckArchetypes: [], deckList: [], deckCompanionCards: {}, decksFetchedAt: null, deckSource: null });
    if (get().authTier === 'full') {
      api.updateSettings({ deckGameMode: mode }).catch(() => {});
    } else {
      try { localStorage.setItem('hc-deck-game-mode', mode); } catch {}
    }
  },
  fetchDecks: async (opts) => {
    set({ decksLoading: true });
    try {
      const { metaBracket, deckGameMode } = get();
      const data = await api.getDecks({
        bracket: metaBracket,
        gameType: deckGameMode,
        minGames: opts?.minGames,
      });
      set({
        deckArchetypes: data.archetypes,
        deckList: data.decks,
        deckCompanionCards: data.companionCards ?? {},
        decksFetchedAt: data.fetchedAt,
        deckSource: data.source ?? 'hsreplay',
      });
    } catch (err) {
      console.error('Failed to fetch decks:', err);
      get().addToast('Failed to load deck data', 'error');
    } finally {
      set({ decksLoading: false });
    }
  },

  craftQueue: loadCraftQueue(),
  addToQueue: (dbfId) => set(s => {
    if (s.craftQueue.includes(dbfId)) return s;
    const next = [...s.craftQueue, dbfId];
    saveCraftQueue(next);
    return { craftQueue: next };
  }),
  removeFromQueue: (dbfId) => set(s => {
    const next = s.craftQueue.filter(id => id !== dbfId);
    saveCraftQueue(next);
    return { craftQueue: next };
  }),
  clearQueue: () => { saveCraftQueue([]); set({ craftQueue: [] }); },
  reloadCraftQueue: () => set({ craftQueue: loadCraftQueue() }),

  fetchCards: async () => {
    set({ cardsLoading: true });
    try {
      const cards = await api.getCards();
      set({ cards });
    } catch (err) {
      console.error('Failed to fetch cards:', err);
    } finally {
      set({ cardsLoading: false });
    }
  },

  fetchCollection: async () => {
    set({ collectionLoading: true });
    try {
      if (get().authTier === 'full') {
        const collection = await api.getCollection();
        set({ collection });
      } else {
        const local = getLocalCollection();
        if (local) set({ collection: local });
      }
    } catch (err) {
      console.error('Failed to fetch collection:', err);
    } finally {
      set({ collectionLoading: false });
    }
  },

  fetchExpansions: async () => {
    try {
      const expansions = await api.getExpansions();
      set({ expansions });
    } catch (err) {
      console.error('Failed to fetch expansions:', err);
    }
  },

  fetchMeta: async () => {
    try {
      const bracket = get().metaBracket;
      const data = await api.getMeta(bracket);
      const update: Partial<AppState> = {
        metaStandard: data.standard as Record<string, MetaEntry>,
        metaWild: data.wild as Record<string, MetaEntry>,
      };
      if (data.bracket) update.metaBracket = data.bracket;
      if (data.fallback) {
        if (!get().metaFallback) {
          get().addToast('Selected stats bracket unavailable. Showing free stats.', 'error');
        }
        update.metaFallback = true;
        if (data.bracket && get().authTier === 'full') {
          api.updateSettings({ metaBracket: data.bracket }).catch(() => {});
        }
      } else {
        update.metaFallback = false;
      }
      set(update);
    } catch (err) {
      console.error('Failed to fetch meta:', err);
    }
  },

  syncCollection: async (sessionId?: string) => {
    set({ syncLoading: true });
    try {
      if (get().authTier === 'full') {
        const result = await api.syncCollection(sessionId);
        if (result.success) {
          await get().fetchCollection();
          set({ collectionSyncedAt: Date.now() });
          return { success: true, cards: result.cards, dust: result.dust };
        }
        return { success: false, error: 'Sync returned unsuccessful' };
      } else {
        const meta = getCollectionMeta();
        if (!meta) return { success: false, error: 'No collection URL configured' };
        const result = await api.publicSync(meta.region, meta.accountLo);
        if (result.success) {
          const collectionData: CollectionData = { collection: result.collection, dust: result.dust, syncedAt: result.syncedAt };
          setLocalCollection(collectionData);
          set({ collection: collectionData, collectionSyncedAt: result.syncedAt });
          return { success: true, cards: result.cards, dust: result.dust };
        }
        return { success: false, error: 'Sync returned unsuccessful' };
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, error: message };
    } finally {
      set({ syncLoading: false });
    }
  },

  runCalculator: async (expansionCodes: string[], dust: number, metaOnly?: boolean) => {
    set({ calculatorLoading: true });
    try {
      const { cards, expansions, collection, metaStandard, metaWild } = get();
      const results = await new Promise<CalculatorResponse>((resolve, reject) => {
        const worker = new CalculatorWorker();
        worker.onmessage = (e: MessageEvent<CalculatorResponse>) => {
          resolve(e.data);
          worker.terminate();
        };
        worker.onerror = (err) => {
          reject(err);
          worker.terminate();
        };
        const msg: Record<string, unknown> = { expansionCodes, expansions, cardDb: cards, collection, dust };
        if (metaOnly) {
          msg.metaOnly = true;
          msg.metaStandard = metaStandard;
          msg.metaWild = metaWild;
        }
        worker.postMessage(msg);
      });
      set({ calculatorResults: results });
    } catch (err) {
      console.error('Calculator error:', err);
    } finally {
      set({ calculatorLoading: false });
    }
  },

  autoSync: async () => {
    if (get().autoSyncRan) return;
    set({ autoSyncRan: true });

    const ONE_DAY = 24 * 60 * 60 * 1000;
    const errors: string[] = [];

    try {
      const status = await api.getDataStatus();
      if (status.artVersion) set({ artVersion: status.artVersion });

      if (!status.cardDb.updatedAt || Date.now() - status.cardDb.updatedAt > ONE_DAY) {
        try {
          await api.refreshCards();
          await get().fetchCards();
          await get().fetchExpansions();
        } catch {
          errors.push('Card database auto-refresh failed. Refresh manually in Settings.');
        }
      }

      if (!status.meta.updatedAt || Date.now() - status.meta.updatedAt > ONE_DAY) {
        try {
          await api.refreshMeta();
          await get().fetchMeta();
        } catch {
          errors.push('Meta stats auto-refresh failed — Cloudflare clearance may be expired. Check Settings.');
        }
      }
    } catch {
      errors.push('Could not check data freshness. Server may be unreachable.');
    }

    if (errors.length > 0) {
      set({ dataErrors: errors });
    }
  },

  dismissError: (index) => set(s => ({
    dataErrors: s.dataErrors.filter((_, i) => i !== index),
  })),

  setCollectionMode: (mode) => set(s => ({
    collectionMode: mode,
    obtainabilityFilter: (mode === 'normal' || mode === 'golden') ? 'all' as const : s.obtainabilityFilter,
  })),
  setSelectedSets: (sets) => set({ selectedSets: sets }),
  setSelectedClasses: (classes) => set({ selectedClasses: classes }),
  setSelectedRarities: (rarities) => set({ selectedRarities: rarities }),
  setOwnershipFilter: (filter) => set({ ownershipFilter: filter }),
  setObtainabilityFilter: (filter) => set({ obtainabilityFilter: filter }),
  setFormatFilter: (filter) => set({ formatFilter: filter }),
  setSearchText: (text) => set({ searchText: text }),
  setSortBy: (sort) => set({ sortBy: sort }),
  toggleSortDirection: () => set(s => ({ sortAsc: !s.sortAsc })),

  getEnrichedCards: () => {
    const { cards, collection, metaStandard, metaWild, collectionMode, expansions, formatFilter, artVersion } = get();
    const meta = formatFilter === 'wild' ? metaWild : metaStandard;
    const enriched: EnrichedCard[] = [];
    const av = artVersion;

    const setYearNum = new Map<string, number>();
    for (const exp of expansions) setYearNum.set(exp.code, exp.yearNum);

    for (const [dbfId, card] of Object.entries(cards)) {
      const directCounts = collection?.collection?.[dbfId] || [0, 0, 0, 0];
      let normal = directCounts[0] || 0;
      let golden = directCounts[1] || 0;
      let diamond = directCounts[2] || 0;
      let signature = directCounts[3] || 0;
      let inCore = card.set === 'CORE';
      if (card.aliasDbfIds) {
        for (const alias of card.aliasDbfIds) {
          if (!inCore && cards[alias]?.set === 'CORE') inCore = true;
          const ac = collection?.collection?.[alias];
          if (ac) {
            normal = Math.max(normal, ac[0] || 0);
            golden = Math.max(golden, ac[1] || 0);
            diamond = Math.max(diamond, ac[2] || 0);
            signature = Math.max(signature, ac[3] || 0);
          }
        }
      }
      const maxCopies = card.rarity === 'LEGENDARY' ? 1 : 2;
      const resolveMeta = (source: Record<string, MetaEntry>) => {
        let best = source[dbfId];
        if (card.aliasDbfIds) {
          for (const alias of card.aliasDbfIds) {
            const ae = source[alias];
            if (ae && (!best || ae.popularity > best.popularity)) best = ae;
          }
        }
        return best;
      };
      const metaEntry = resolveMeta(meta);
      const stdMeta = resolveMeta(metaStandard);
      const wildMeta = resolveMeta(metaWild);

      let totalOwned: number;
      switch (collectionMode) {
        case 'golden':
          totalOwned = Math.min(golden + diamond + signature, maxCopies);
          break;
        case 'signature':
          totalOwned = (card.hasSignature || signature > 0) ? Math.min(signature + diamond, maxCopies) : maxCopies;
          break;
        case 'diamond':
          totalOwned = (card.hasDiamond || diamond > 0) ? Math.min(diamond, maxCopies) : maxCopies;
          break;
        default:
          totalOwned = Math.min(normal + golden + diamond + signature, maxCopies);
      }

      const art = (v: string) => `/art/${card.id}_${v}.png?v=${av}`
      const bestOwned =
        diamond > 0 ? art('diamond')
        : signature > 0 ? art('signature')
        : golden > 0 ? art('golden')
        : null;

      let imageUrl: string
      switch (collectionMode) {
        case 'golden':
          imageUrl = bestOwned ?? art('golden')
          break
        case 'signature':
          imageUrl = art('signature')
          break
        case 'diamond':
          imageUrl = art('diamond')
          break
        default:
          imageUrl = bestOwned ?? art('normal')
      }

      enriched.push({
        dbfId,
        id: card.id,
        name: card.name,
        set: card.set,
        rarity: card.rarity,
        type: card.type,
        cardClass: card.cardClass,
        cost: card.cost,
        attack: card.attack,
        health: card.health,
        text: card.text,
        normalCount: normal,
        goldenCount: golden,
        diamondCount: diamond,
        signatureCount: signature,
        totalOwned,
        maxCopies,
        imageUrl,
        inclusionRate: metaEntry?.popularity ?? 0,
        winrate: metaEntry?.winrate ?? 0,
        decks: metaEntry?.decks ?? 0,
        inclusionRateStd: stdMeta?.popularity ?? 0,
        winrateStd: stdMeta?.winrate ?? 0,
        decksStd: stdMeta?.decks ?? 0,
        inclusionRateWild: wildMeta?.popularity ?? 0,
        winrateWild: wildMeta?.winrate ?? 0,
        decksWild: wildMeta?.decks ?? 0,
        freeNormal: card.freeNormal,
        freeGolden: card.freeGolden,
        hasSignature: card.hasSignature,
        hasDiamond: card.hasDiamond,
        inCore: inCore || undefined,
        aliasDbfIds: card.aliasDbfIds,
      });
    }

    return enriched;
  },

  getFilteredCards: () => {
    const state = get();
    let cards = state.getEnrichedCards();
    const {
      selectedSets, selectedClasses, selectedRarities,
      ownershipFilter, obtainabilityFilter, formatFilter, searchText, sortBy, sortAsc, expansions,
      collection, collectionMode,
    } = state;

    if (formatFilter === 'standard') {
      const standardCodes = new Set(expansions.filter(e => e.standard).map(e => e.code))
      cards = cards.filter(c => standardCodes.has(c.set))
    }

    if (collectionMode === 'diamond') {
      cards = cards.filter(c => c.hasDiamond || c.diamondCount > 0)
    } else if (collectionMode === 'signature') {
      cards = cards.filter(c => c.hasSignature || c.signatureCount > 0)
    }

    if (selectedSets.length > 0) {
      const setCodes = new Set(selectedSets);
      cards = cards.filter(c => setCodes.has(c.set));
    } else {
      const nonCoreNames = new Set(cards.filter(c => c.set !== 'CORE').map(c => c.name));
      cards = cards.filter(c => c.set !== 'CORE' || !nonCoreNames.has(c.name));
    }

    if (selectedClasses.length > 0) {
      const classes = new Set(selectedClasses);
      cards = cards.filter(c => classes.has(c.cardClass));
    }

    if (selectedRarities.length > 0) {
      const rarities = new Set(selectedRarities);
      cards = cards.filter(c => rarities.has(c.rarity));
    }

    if (ownershipFilter === 'owned') {
      cards = cards.filter(c => c.totalOwned >= c.maxCopies);
    } else if (ownershipFilter === 'incomplete') {
      cards = cards.filter(c => c.totalOwned < c.maxCopies);
    }

    if (obtainabilityFilter !== 'all' && (collectionMode === 'diamond' || collectionMode === 'signature')) {
      const wantObtainable = obtainabilityFilter === 'obtainable';
      cards = cards.filter(c => {
        const acq = collectionMode === 'diamond'
          ? getDiamondAcquisition(c.id)
          : getSignatureAcquisition(c.id, c.set, c.rarity);
        const isObtainable = acq?.obtainable ?? true;
        return wantObtainable ? isObtainable : !isObtainable;
      });
    }

    if (searchText.trim()) {
      const { predicates, textParts } = parseSearch(searchText);
      for (const pred of predicates) {
        cards = cards.filter(pred);
      }
      for (const part of textParts) {
        const lower = part.toLowerCase();
        cards = cards.filter(c =>
          c.name.toLowerCase().includes(lower)
          || (c.text?.toLowerCase().includes(lower) ?? false),
        );
      }
    }

    const dir = sortAsc ? 1 : -1;
    const setOrder = new Map(expansions.map((e, i) => [e.code, i]));
    cards.sort((a, b) => {
      switch (sortBy) {
        case 'name': return dir * a.name.localeCompare(b.name);
        case 'cost': return dir * (a.cost - b.cost) || a.name.localeCompare(b.name);
        case 'rarity': return dir * (RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity]) || (a.cost - b.cost) || a.name.localeCompare(b.name);
        case 'set': return dir * ((setOrder.get(a.set) ?? 999) - (setOrder.get(b.set) ?? 999)) || (a.cost - b.cost) || a.name.localeCompare(b.name);
        case 'class': return dir * ((CLASS_ORDER[a.cardClass] ?? 50) - (CLASS_ORDER[b.cardClass] ?? 50)) || (a.cost - b.cost) || a.name.localeCompare(b.name);
        case 'inclusion': {
          const aHas = a.inclusionRate > 0;
          const bHas = b.inclusionRate > 0;
          if (aHas !== bHas) return aHas ? -1 : 1;
          return dir * (a.inclusionRate - b.inclusionRate) || a.name.localeCompare(b.name);
        }
        case 'winrate': {
          const aHas = a.decks >= 100 && a.winrate > 0;
          const bHas = b.decks >= 100 && b.winrate > 0;
          if (aHas !== bHas) return aHas ? -1 : 1;
          return dir * (a.winrate - b.winrate) || a.name.localeCompare(b.name);
        }
        default: return 0;
      }
    });

    return cards;
  },
}));
