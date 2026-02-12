import type { CardDb, Expansion, CollectionData } from '../types.ts';

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${url}`, init);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json() as Promise<T>;
}

export interface DataStatus {
  cardDb: { updatedAt: number };
  meta: { updatedAt: number };
  cf: { valid: boolean; expiresIn: number };
}

export const api = {
  getDataStatus: () => fetchJson<DataStatus>('/data-status'),

  getCards: () => fetchJson<CardDb>('/cards'),
  refreshCards: () => fetchJson<{ count: number }>('/cards/refresh', { method: 'POST' }),

  getExpansions: () => fetchJson<Expansion[]>('/expansions'),

  getCollection: () => fetchJson<CollectionData>('/collection'),
  syncCollection: (sessionId?: string) =>
    fetchJson<{ success: boolean; cards: number; dust: number; syncedAt?: number; dbRefreshed?: boolean }>(
      '/collection/sync',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      },
    ),

  getMeta: () => fetchJson<Record<string, unknown>>('/meta'),
  refreshMeta: () => fetchJson<{ count: number }>('/meta/refresh', { method: 'POST' }),

  clearArtCache: () => fetchJson<{ cleared: number }>('/card-art/clear-cache', { method: 'POST' }),

  getPrefetchStatus: () => fetchJson<{ running: boolean; variant: string; done: number; total: number }>('/prefetch-status'),
  getArtCacheStats: () => fetchJson<{ cached: number; missed: number; variants: Record<string, { cached: number; missed: number }> }>('/card-art/cache-stats'),
  getVariantAvailability: () => fetchJson<{ signatureConfirmed: string[]; diamondConfirmed: string[] }>('/variant-availability'),

  getSettings: () => fetchJson<Record<string, unknown>>('/settings'),
  updateSettings: (settings: Record<string, unknown>) =>
    fetchJson<Record<string, unknown>>('/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    }),
};
