import { useEffect, useRef } from 'react'
import { useStore } from '../stores/store.ts'
import type { CollectionSnapshot } from '../types.ts'

const STORAGE_KEY = 'hs-collection-snapshots'
const MAX_SNAPSHOTS = 365

export function loadSnapshots(): CollectionSnapshot[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function clearSnapshots() {
  localStorage.removeItem(STORAGE_KEY)
}

function buildDiffMessage(prev: CollectionSnapshot, next: CollectionSnapshot): string | null {
  const cardDiff = next.overall.owned - prev.overall.owned
  const dustDiff = next.dust - prev.dust

  if (cardDiff === 0 && dustDiff === 0) return null

  const parts: string[] = []

  if (cardDiff !== 0) {
    parts.push(`${cardDiff > 0 ? '+' : ''}${cardDiff} cards`)
  }

  if (dustDiff !== 0) {
    parts.push(`${dustDiff > 0 ? '+' : ''}${dustDiff.toLocaleString()} dust`)
  }

  const stdDiff = next.standard.owned - prev.standard.owned
  if (stdDiff > 0) {
    parts.push(`+${stdDiff} standard`)
  }

  return parts.join(', ')
}

export function useCollectionSnapshots() {
  const collectionSyncedAt = useStore(s => s.collectionSyncedAt)
  const collection = useStore(s => s.collection)
  const expansions = useStore(s => s.expansions)
  const getEnrichedCards = useStore(s => s.getEnrichedCards)
  const addToast = useStore(s => s.addToast)
  const initialRef = useRef(true)

  useEffect(() => {
    if (initialRef.current) {
      initialRef.current = false
      return
    }

    if (!collectionSyncedAt || !collection || expansions.length === 0) return

    const cards = getEnrichedCards()
    const standardCodes = new Set(expansions.filter(e => e.standard).map(e => e.code))

    let overallOwned = 0, overallTotal = 0
    let standardOwned = 0, standardTotal = 0
    let wildOwned = 0, wildTotal = 0
    const expMap = new Map<string, { owned: number; total: number }>()

    for (const card of cards) {
      const owned = Math.min(
        card.normalCount + card.goldenCount + card.diamondCount + card.signatureCount,
        card.maxCopies,
      )
      overallOwned += owned
      overallTotal += card.maxCopies

      if (standardCodes.has(card.set)) {
        standardOwned += owned
        standardTotal += card.maxCopies
      }

      wildOwned += owned
      wildTotal += card.maxCopies

      const exp = expMap.get(card.set) || { owned: 0, total: 0 }
      exp.owned += owned
      exp.total += card.maxCopies
      expMap.set(card.set, exp)
    }

    const snapshot: CollectionSnapshot = {
      timestamp: collectionSyncedAt,
      dust: collection.dust ?? 0,
      overall: { owned: overallOwned, total: overallTotal },
      standard: { owned: standardOwned, total: standardTotal },
      wild: { owned: wildOwned, total: wildTotal },
      expansions: Array.from(expMap.entries()).map(([code, stats]) => ({ code, ...stats })),
    }

    const existing = loadSnapshots()
    const prev = existing.length > 0 ? existing[existing.length - 1] : null

    if (prev) {
      const diff = buildDiffMessage(prev, snapshot)
      if (diff) {
        addToast(`Since last sync: ${diff}`, 'success')
      }
    }

    const deduped = existing.filter(s => s.timestamp !== collectionSyncedAt)
    const updated = [...deduped, snapshot]
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-MAX_SNAPSHOTS)

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    } catch {
      // localStorage quota exceeded — silently fail
    }
  }, [collectionSyncedAt])
}
