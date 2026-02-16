import type { CardDb, Expansion, CollectionData, BracketsResponse, DecksResponse, HsguruMatchup } from '../types.ts';

const TOKEN_KEY = 'hc-user-token';
const ACCOUNT_KEY = 'hc-account-id';
const AUTH_TIER_KEY = 'hc-auth-tier';
const COLLECTION_KEY = 'hc-collection';
const COLLECTION_META_KEY = 'hc-collection-meta';

export type AuthTier = 'collection' | 'full';

export interface CollectionMeta {
  accountLo: string;
  region: number;
  battletag: string;
}

export function getStoredToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function setStoredToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function getStoredAccountId(): string | null {
  try { return localStorage.getItem(ACCOUNT_KEY); } catch { return null; }
}

export function setStoredAccountId(id: string): void {
  localStorage.setItem(ACCOUNT_KEY, id);
}

export function getAuthTier(): AuthTier {
  if (getStoredToken()) return 'full';
  try {
    const tier = localStorage.getItem(AUTH_TIER_KEY);
    if (tier === 'collection' || tier === 'full') return tier;
  } catch {}
  return 'collection';
}

export function setAuthTier(tier: AuthTier): void {
  localStorage.setItem(AUTH_TIER_KEY, tier);
}

export function getCollectionMeta(): CollectionMeta | null {
  try {
    const raw = localStorage.getItem(COLLECTION_META_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CollectionMeta;
  } catch { return null; }
}

export function setCollectionMeta(meta: CollectionMeta): void {
  localStorage.setItem(COLLECTION_META_KEY, JSON.stringify(meta));
}

export function getLocalCollection(): CollectionData | null {
  try {
    const raw = localStorage.getItem(COLLECTION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CollectionData;
  } catch { return null; }
}

export function setLocalCollection(data: CollectionData): void {
  localStorage.setItem(COLLECTION_KEY, JSON.stringify(data));
}

export function clearCollectionOnlyData(): void {
  localStorage.removeItem(AUTH_TIER_KEY);
  localStorage.removeItem(COLLECTION_KEY);
  localStorage.removeItem(COLLECTION_META_KEY);
}

export function isAuthenticated(): boolean {
  return !!getStoredToken() || !!getCollectionMeta();
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> || {}),
    ...(token ? { 'X-User-Token': token } : {}),
  };
  const res = await fetch(`/api${url}`, { ...init, headers });
  if (res.status === 401 && !url.startsWith('/auth/') && token) {
    clearStoredToken();
    window.location.reload();
    throw new Error('Session expired');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error((body.error as string) || `API error: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export interface RegisterResponse {
  success: boolean;
  token?: string;
  battletag?: string;
  accountLo?: string;
  cards?: number;
  dust?: number;
  isPremium?: boolean | null;
  error?: string;
}

export interface CollectionLoginResponse {
  success: boolean;
  collection: Record<string, number[]>;
  dust: number;
  battletag: string;
  accountLo: string;
  region: number;
  cards: number;
}

export interface AuthMe {
  battletag: string;
  accountLo: string;
  region: number;
  isPremium: boolean | null;
  premiumConsent: boolean;
}

export interface DataStatus {
  cardDb: { updatedAt: number };
  meta: { updatedAt: number; availableBrackets?: string[]; lastPremiumFetchAt?: number | null };
  cf: { valid: boolean; expiresIn: number };
  hostedMode?: boolean;
  artVersion?: number;
}

export const api = {
  collectionLogin: (collectionUrl: string) =>
    fetchJson<CollectionLoginResponse>('/auth/collection-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ collectionUrl }),
    }),

  publicSync: (region: number, accountLo: string) =>
    fetchJson<{ success: boolean; collection: Record<string, number[]>; dust: number; cards: number; syncedAt: number }>(
      '/collection/public-sync',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ region, accountLo }),
      },
    ),

  register: (sessionId: string) =>
    fetchJson<RegisterResponse>('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    }),

  getMe: () => fetchJson<AuthMe>('/auth/me'),
  deleteAccount: () => fetchJson<{ success: boolean }>('/auth/account', { method: 'DELETE' }),

  getDataStatus: () => fetchJson<DataStatus>('/data-status'),

  getCards: () => fetchJson<CardDb>('/cards'),
  refreshCards: () => fetchJson<{ count: number; artVersion?: number }>('/cards/refresh', { method: 'POST' }),

  getExpansions: () => fetchJson<Expansion[]>('/expansions'),

  getCollection: () => fetchJson<CollectionData>('/collection'),
  syncCollection: (sessionId?: string) =>
    fetchJson<{ success: boolean; cards: number; dust: number; syncedAt?: number; dbRefreshed?: boolean; sessionExpired?: boolean }>(
      '/collection/sync',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      },
    ),

  getMeta: (bracket?: string) =>
    fetchJson<{ standard: Record<string, unknown>; wild: Record<string, unknown>; bracket: string; fallback?: boolean }>(
      bracket ? `/meta?bracket=${bracket}` : '/meta',
    ),
  getMetaBrackets: () => fetchJson<BracketsResponse>('/meta/brackets'),
  refreshMeta: () => fetchJson<{ count: number; brackets?: number }>('/meta/refresh', { method: 'POST' }),

  clearArtCache: () => fetchJson<{ queued: number; missCleared: number; artVersion?: number }>('/card-art/clear-cache', { method: 'POST' }),

  getPrefetchStatus: () => fetchJson<{ running: boolean; variant: string; done: number; total: number }>('/prefetch-status'),
  getArtCacheStats: () => fetchJson<{ cached: number; missed: number; variants: Record<string, { cached: number; missed: number }> }>('/card-art/cache-stats'),
  getSnapshots: () => fetchJson<import('../types.ts').CollectionSnapshot[]>('/snapshots'),
  saveSnapshot: (snapshot: import('../types.ts').CollectionSnapshot) =>
    fetchJson<{ saved: boolean; count: number }>('/snapshots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshot),
    }),
  clearSnapshots: () => fetchJson<{ cleared: boolean }>('/snapshots', { method: 'DELETE' }),

  getDecks: (opts?: { bracket?: string; gameType?: string; minGames?: number; rank?: string; period?: string }) => {
    const params = new URLSearchParams();
    if (opts?.bracket) params.set('bracket', opts.bracket);
    if (opts?.gameType) params.set('gameType', opts.gameType);
    if (opts?.minGames) params.set('minGames', String(opts.minGames));
    if (opts?.rank) params.set('rank', opts.rank);
    if (opts?.period) params.set('period', opts.period);
    const qs = params.toString();
    return fetchJson<DecksResponse>(qs ? `/decks?${qs}` : '/decks');
  },

  getDeckMatchups: (slug: string, format: number, rank?: string, period?: string) => {
    const params = new URLSearchParams({ format: String(format) });
    if (rank) params.set('rank', rank);
    if (period) params.set('period', period);
    return fetchJson<{ matchups: HsguruMatchup[] }>(`/decks/matchups/${encodeURIComponent(slug)}?${params}`);
  },

  getSettings: () => fetchJson<Record<string, unknown>>('/settings'),
  updateSettings: (settings: Record<string, unknown>) =>
    fetchJson<Record<string, unknown>>('/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    }),
};
