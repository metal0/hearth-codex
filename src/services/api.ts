import type { CardDb, Expansion, CollectionData } from '../types.ts';

const TOKEN_KEY = 'hc-user-token';
const ACCOUNT_KEY = 'hc-account-id';

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

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> || {}),
    ...(token ? { 'X-User-Token': token } : {}),
  };
  const res = await fetch(`/api${url}`, { ...init, headers });
  if (res.status === 401 && !url.startsWith('/auth/')) {
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
  error?: string;
}

export interface AuthMe {
  battletag: string;
  accountLo: string;
  region: number;
}

export interface DataStatus {
  cardDb: { updatedAt: number };
  meta: { updatedAt: number };
  cf: { valid: boolean; expiresIn: number };
  hostedMode?: boolean;
  artVersion?: number;
}

export const api = {
  register: (sessionId: string) =>
    fetchJson<RegisterResponse>('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    }),

  getMe: () => fetchJson<AuthMe>('/auth/me'),

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

  getMeta: () => fetchJson<Record<string, unknown>>('/meta'),
  refreshMeta: () => fetchJson<{ count: number }>('/meta/refresh', { method: 'POST' }),

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

  getSettings: () => fetchJson<Record<string, unknown>>('/settings'),
  updateSettings: (settings: Record<string, unknown>) =>
    fetchJson<Record<string, unknown>>('/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    }),
};
