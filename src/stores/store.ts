import { create } from 'zustand';
import type {
  CardDb, Expansion, CollectionData, CalculatorResponse,
  OwnershipFilter, FormatFilter, SortOption, EnrichedCard, Rarity, CollectionMode,
} from '../types.ts';
import { RARITY_ORDER, DUST_COST, HS_CLASSES } from '../types.ts';

const CLASS_ORDER = Object.fromEntries(HS_CLASSES.map((c, i) => [c, i === 0 ? 99 : i])) as Record<string, number>;

const CRAFT_QUEUE_KEY = 'hs-craft-queue';
function loadCraftQueue(): string[] {
  try {
    const raw = localStorage.getItem(CRAFT_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function saveCraftQueue(queue: string[]) {
  try { localStorage.setItem(CRAFT_QUEUE_KEY, JSON.stringify(queue)); } catch {}
}

const HS_SESSION_KEY = 'hs-session-id';
function loadSessionId(): string | null {
  try { return localStorage.getItem(HS_SESSION_KEY) || null; } catch { return null; }
}
function saveSessionId(id: string | null) {
  try {
    if (id) localStorage.setItem(HS_SESSION_KEY, id);
    else localStorage.removeItem(HS_SESSION_KEY);
  } catch {}
}
import { api } from '../services/api.ts';
import { parseSearch } from '../utils/searchParser.ts';
import CalculatorWorker from '../workers/calculator.worker.ts?worker';

interface MetaEntry {
  dbfId: number;
  popularity: number;
  winrate: number;
  decks: number;
  class: string;
}

export interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error';
}

interface VariantConfirmed {
  signature: Set<string>;
  diamond: Set<string>;
}

interface AppState {
  cards: CardDb;
  expansions: Expansion[];
  collection: CollectionData | null;
  metaStandard: Record<string, MetaEntry>;
  metaWild: Record<string, MetaEntry>;
  variantConfirmed: VariantConfirmed;

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
  formatFilter: FormatFilter;
  searchText: string;
  sortBy: SortOption;
  sortAsc: boolean;

  calculatorResults: CalculatorResponse | null;

  fetchCards: () => Promise<void>;
  fetchCollection: () => Promise<void>;
  fetchExpansions: () => Promise<void>;
  fetchMeta: () => Promise<void>;
  fetchVariantAvailability: () => Promise<void>;
  autoSync: () => Promise<void>;
  dismissError: (index: number) => void;
  collectionSyncedAt: number | null;
  syncCollection: (sessionId?: string) => Promise<{ success: boolean; cards?: number; dust?: number; error?: string }>;
  runCalculator: (expansionCodes: string[], dust: number) => Promise<void>;

  setCollectionMode: (mode: CollectionMode) => void;
  setSelectedSets: (sets: string[]) => void;
  setSelectedClasses: (classes: string[]) => void;
  setSelectedRarities: (rarities: Rarity[]) => void;
  setOwnershipFilter: (filter: OwnershipFilter) => void;
  setFormatFilter: (filter: FormatFilter) => void;
  setSearchText: (text: string) => void;
  setSortBy: (sort: SortOption) => void;
  toggleSortDirection: () => void;

  hsSessionId: string | null;
  setHsSessionId: (id: string | null) => void;

  craftQueue: string[];
  addToQueue: (dbfId: string) => void;
  removeFromQueue: (dbfId: string) => void;
  clearQueue: () => void;

  getEnrichedCards: () => EnrichedCard[];
  getFilteredCards: () => EnrichedCard[];
}

export const useStore = create<AppState>((set, get) => ({
  cards: {},
  expansions: [],
  collection: null,
  metaStandard: {},
  metaWild: {},
  variantConfirmed: { signature: new Set<string>(), diamond: new Set<string>() },

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
  formatFilter: 'standard',
  searchText: '',
  sortBy: 'rarity',
  sortAsc: false,

  calculatorResults: null,

  hsSessionId: loadSessionId(),
  setHsSessionId: (id) => { saveSessionId(id); set({ hsSessionId: id }); },

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
      const collection = await api.getCollection();
      set({ collection, collectionSyncedAt: collection.syncedAt ?? null });
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
      const data = await api.getMeta();
      if (data.standard && data.wild) {
        set({ metaStandard: data.standard, metaWild: data.wild });
      } else {
        set({ metaStandard: data, metaWild: {} });
      }
    } catch (err) {
      console.error('Failed to fetch meta:', err);
    }
  },

  fetchVariantAvailability: async () => {
    try {
      const data = await api.getVariantAvailability();
      set({
        variantConfirmed: {
          signature: new Set(data.signatureConfirmed),
          diamond: new Set(data.diamondConfirmed),
        },
      });
    } catch (err) {
      console.error('Failed to fetch variant availability:', err);
    }
  },

  syncCollection: async (sessionId?: string) => {
    set({ syncLoading: true });
    try {
      const sid = sessionId || get().hsSessionId || undefined;
      const result = await api.syncCollection(sid);
      if (result.success) {
        if (result.dbRefreshed) {
          await get().fetchCards();
          await get().fetchExpansions();
          get().addToast('Card database auto-updated (new cards detected)', 'success');
        }
        await get().fetchCollection();
        set({ collectionSyncedAt: result.syncedAt ?? Date.now() });
        return { success: true, cards: result.cards, dust: result.dust };
      }
      return { success: false, error: 'Sync returned unsuccessful' };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, error: message };
    } finally {
      set({ syncLoading: false });
    }
  },

  runCalculator: async (expansionCodes: string[], dust: number) => {
    set({ calculatorLoading: true });
    try {
      const { cards, expansions, collection } = get();
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
        worker.postMessage({ expansionCodes, expansions, cardDb: cards, collection, dust });
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

  setCollectionMode: (mode) => set({ collectionMode: mode }),
  setSelectedSets: (sets) => set({ selectedSets: sets }),
  setSelectedClasses: (classes) => set({ selectedClasses: classes }),
  setSelectedRarities: (rarities) => set({ selectedRarities: rarities }),
  setOwnershipFilter: (filter) => set({ ownershipFilter: filter }),
  setFormatFilter: (filter) => set({ formatFilter: filter }),
  setSearchText: (text) => set({ searchText: text }),
  setSortBy: (sort) => set({ sortBy: sort }),
  toggleSortDirection: () => set(s => ({ sortAsc: !s.sortAsc })),

  getEnrichedCards: () => {
    const { cards, collection, metaStandard, metaWild, collectionMode, expansions, formatFilter, variantConfirmed } = get();
    const meta = formatFilter === 'wild' ? metaWild : metaStandard;
    const enriched: EnrichedCard[] = [];

    const setYearNum = new Map<string, number>();
    for (const exp of expansions) setYearNum.set(exp.code, exp.yearNum);

    for (const [dbfId, card] of Object.entries(cards)) {
      const counts = collection?.collection?.[dbfId] || [0, 0, 0, 0];
      const normal = counts[0] || 0;
      const golden = counts[1] || 0;
      const diamond = counts[2] || 0;
      const signature = counts[3] || 0;
      const maxCopies = card.rarity === 'LEGENDARY' ? 1 : 2;
      const metaEntry = meta[dbfId];

      const sigVariantExists = variantConfirmed.signature.has(card.id);
      const diaVariantExists = variantConfirmed.diamond.has(card.id);

      let totalOwned: number;
      switch (collectionMode) {
        case 'golden':
          totalOwned = Math.min(golden + diamond + signature, maxCopies);
          break;
        case 'signature':
          totalOwned = (sigVariantExists || signature > 0) ? Math.min(signature + diamond, maxCopies) : maxCopies;
          break;
        case 'diamond':
          totalOwned = (diaVariantExists || diamond > 0) ? Math.min(diamond, maxCopies) : maxCopies;
          break;
        default:
          totalOwned = Math.min(normal + golden + diamond + signature, maxCopies);
      }

      const art = (v: string) => `/api/card-art/${card.id}/${v}`
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
        freeNormal: card.freeNormal,
        freeGolden: card.freeGolden,
      });
    }

    return enriched;
  },

  getFilteredCards: () => {
    const state = get();
    let cards = state.getEnrichedCards();
    const {
      selectedSets, selectedClasses, selectedRarities,
      ownershipFilter, formatFilter, searchText, sortBy, sortAsc, expansions,
      collection, collectionMode,
    } = state;

    if (formatFilter === 'standard') {
      const standardCodes = new Set(expansions.filter(e => e.standard).map(e => e.code))
      cards = cards.filter(c => standardCodes.has(c.set))
    }

    if (collectionMode === 'diamond') {
      const { variantConfirmed } = state;
      cards = cards.filter(c => variantConfirmed.diamond.has(c.id) || c.diamondCount > 0)
    } else if (collectionMode === 'signature') {
      const { variantConfirmed } = state;
      cards = cards.filter(c => variantConfirmed.signature.has(c.id) || c.signatureCount > 0)
    }

    if (selectedSets.length > 0) {
      const setCodes = new Set(selectedSets);
      cards = cards.filter(c => setCodes.has(c.set));
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
        case 'rarity': return dir * (RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity]) || a.cost - b.cost || a.name.localeCompare(b.name);
        case 'set': return dir * ((setOrder.get(a.set) ?? 999) - (setOrder.get(b.set) ?? 999)) || a.name.localeCompare(b.name);
        case 'class': return dir * ((CLASS_ORDER[a.cardClass] ?? 50) - (CLASS_ORDER[b.cardClass] ?? 50)) || a.cost - b.cost || a.name.localeCompare(b.name);
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
