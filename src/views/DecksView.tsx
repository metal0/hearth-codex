import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import { useStore } from '../stores/store.ts'
import { DUST_COST, RARITY_COLORS, CLASS_COLORS, bracketLabel } from '../types.ts'
import type { Rarity, DeckInfo, CompanionCard, ArchetypeInfo, HsguruMatchup, CardDb } from '../types.ts'
import { DustIcon, ManaIcon, StandardIcon, WildIcon } from '../components/Icons.tsx'
import { ClassIcon, classLabel } from '../components/ClassPicker.tsx'
import CardHover from '../components/CardHover.tsx'
import { CardCircle as CardCircleShared, RARITY_BORDER_COLORS, RARITY_BLEED, rarityBleedStyle } from '../components/CardCircle.tsx'
import ClassPicker from '../components/ClassPicker.tsx'
import { Dropdown } from '../components/FilterBar.tsx'
import { useRotationInfo } from '../hooks/useRotationInfo.ts'
import { api } from '../services/api.ts'

type DeckSortOption = 'dustValue' | 'winRate' | 'games' | 'craftCost' | 'climbRate'

const SORT_OPTIONS: { value: DeckSortOption; label: string }[] = [
  { value: 'dustValue', label: 'Dust Value' },
  { value: 'winRate', label: 'Win Rate' },
  { value: 'games', label: 'Games' },
  { value: 'craftCost', label: 'Dust Cost' },
  { value: 'climbRate', label: 'Stars/hr' },
]

type ArchetypeSortOption = 'winRate' | 'dustValue' | 'meta' | 'games' | 'climbRate' | 'dustCost'

const ARCHETYPE_SORT_OPTIONS: { value: ArchetypeSortOption; label: string }[] = [
  { value: 'winRate', label: 'Win Rate' },
  { value: 'dustValue', label: 'Dust Value' },
  { value: 'meta', label: 'Meta %' },
  { value: 'games', label: 'Games' },
  { value: 'climbRate', label: 'Stars/hr' },
  { value: 'dustCost', label: 'Dust Cost' },
]

const TIER_COLORS: Record<number, string> = { 1: '#22c55e', 2: '#3b82f6', 3: '#f59e0b', 4: '#ef4444' }

function getTier(winRate: number): number {
  if (winRate >= 54) return 1
  if (winRate >= 51) return 2
  if (winRate >= 48) return 3
  return 4
}

interface EnrichedDeck {
  deck: DeckInfo
  archetypeName: string
  archetypeUrl: string
  craftCost: number
  adjustedCraftCost: number
  dustValue: number
  metaPct: number
  minutesPerStar: number
  rotatingCards: { dbfId: string; rarity: Rarity }[]
}

function formatDuration(seconds?: number): string {
  if (!seconds) return '-'
  const m = Math.floor(seconds / 60)
  return `${m}m`
}

function formatStarsPerHour(minutesPerStar: number): string {
  if (!isFinite(minutesPerStar) || minutesPerStar <= 0) return '-'
  const sph = 60 / minutesPerStar
  if (sph >= 10) return Math.round(sph).toString()
  return sph.toFixed(1)
}

function formatDustValue(v: number): string {
  if (!isFinite(v)) return '-'
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`
  return v.toFixed(0)
}

function dustValueColor(v: number): string {
  if (!isFinite(v)) return '#22c55e'
  if (v >= 100) return '#22c55e'
  if (v >= 30) return '#d4a843'
  if (v >= 10) return '#f59e0b'
  return '#ef4444'
}

function wrColor(wr: number): string {
  if (wr >= 55) return '#22c55e'
  if (wr >= 52) return '#86efac'
  if (wr >= 50) return '#d4a843'
  if (wr >= 48) return '#f59e0b'
  return '#ef4444'
}

type CardSortCol = 'cost' | 'dust'


function DeckRow({ deck, expanded, onToggle, companionCards, showDustValue }: { deck: EnrichedDeck; expanded: boolean; onToggle: () => void; companionCards: Record<string, CompanionCard>; showDustValue?: boolean }) {
  const [copied, setCopied] = useState(false)
  const [cardSort, setCardSort] = useState<{ col: CardSortCol; asc: boolean }>({ col: 'cost', asc: true })
  const rowRef = useRef<HTMLDivElement>(null)
  const cardDb = useStore(s => s.cards)
  const collection = useStore(s => s.collection)
  const artVersion = useStore(s => s.artVersion)
  const expansions = useStore(s => s.expansions)
  const deckGameMode = useStore(s => s.deckGameMode)
  const rotationInfo = useRotationInfo(expansions, 60)
  const rotatingCodes = deckGameMode === 'wild' ? new Set<string>() : (rotationInfo?.rotatingCodes ?? new Set<string>())
  useEffect(() => {
    if (expanded && rowRef.current) {
      setTimeout(() => rowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
    }
  }, [expanded])

  const deckCards = useMemo(() => {
    type DeckCard = { dbfId: string; id: string; name: string; rarity: Rarity; cost: number; count: number; set: string; cardClass: string; companion: boolean; sideboard: boolean; ownerDbfId: string | undefined }
    const result: DeckCard[] = []
    for (const [dbfId, count] of deck.deck.cards) {
      const key = String(dbfId)
      const card = cardDb[key]
      if (card) {
        result.push({ dbfId: key, id: card.id, name: card.name, rarity: card.rarity as Rarity, cost: card.cost, count, set: card.set, cardClass: card.cardClass ?? 'NEUTRAL', companion: false, sideboard: false, ownerDbfId: undefined })
      } else {
        const comp = companionCards[key]
        if (comp) result.push({ dbfId: key, id: comp.id, name: comp.name, rarity: (comp.rarity ?? 'COMMON') as Rarity, cost: comp.cost, count, set: comp.set, cardClass: comp.cardClass ?? 'NEUTRAL', companion: false, sideboard: false, ownerDbfId: undefined })
      }
    }
    for (const [compDbfId, ownerDbfId] of deck.deck.sideboardPairs ?? []) {
      const key = String(compDbfId)
      const card = cardDb[key]
      const comp = companionCards[key]
      const src = card ?? comp
      if (src) result.push({ dbfId: key, id: card?.id ?? comp?.id ?? '', name: card?.name ?? comp?.name ?? '', rarity: (card?.rarity ?? comp?.rarity ?? 'COMMON') as Rarity, cost: card?.cost ?? comp?.cost ?? 0, count: 1, set: card?.set ?? comp?.set ?? '', cardClass: card?.cardClass ?? comp?.cardClass ?? 'NEUTRAL', companion: true, sideboard: true, ownerDbfId: String(ownerDbfId) })
    }
    return result
  }, [deck.deck.cards, deck.deck.sideboardPairs, cardDb, companionCards])

  const sortedDeckCards = useMemo(() => {
    const mainCards = deckCards.filter(c => !c.companion)
    const companions = deckCards.filter(c => c.companion)
    const companionsByOwner = new Map<string, typeof companions>()
    for (const comp of companions) {
      if (comp.ownerDbfId) {
        const list = companionsByOwner.get(comp.ownerDbfId) ?? []
        list.push(comp)
        companionsByOwner.set(comp.ownerDbfId, list)
      }
    }

    const dir = cardSort.asc ? 1 : -1
    mainCards.sort((a, b) => {
      let av: number, bv: number
      switch (cardSort.col) {
        case 'cost': av = a.cost; bv = b.cost; break
        case 'dust': {
          const aCounts = collection?.collection?.[a.dbfId]
          const aOwned = aCounts ? (aCounts[0] || 0) + (aCounts[1] || 0) + (aCounts[2] || 0) + (aCounts[3] || 0) : 0
          const aMissing = Math.max(0, a.count - aOwned)
          av = DUST_COST[a.rarity] * aMissing
          const bCounts = collection?.collection?.[b.dbfId]
          const bOwned = bCounts ? (bCounts[0] || 0) + (bCounts[1] || 0) + (bCounts[2] || 0) + (bCounts[3] || 0) : 0
          const bMissing = Math.max(0, b.count - bOwned)
          bv = DUST_COST[b.rarity] * bMissing
          break
        }
        default: av = a.cost; bv = b.cost
      }
      return (av - bv) * dir || a.cost - b.cost || a.name.localeCompare(b.name)
    })

    const result: typeof deckCards = []
    for (const card of mainCards) {
      result.push(card)
      const comps = companionsByOwner.get(card.dbfId)
      if (comps) {
        const filtered = comps.filter(c => c.name !== card.name)
        filtered.sort((a, b) => a.cost - b.cost)
        result.push(...filtered)
      }
    }
    const orphanComps = companions.filter(c => !c.ownerDbfId)
    if (orphanComps.length > 0) result.push(...orphanComps)

    return result
  }, [deckCards, cardSort, collection])

  const combinedCosts = useMemo(() => {
    const costs = new Map<string, number>()
    for (const card of sortedDeckCards) {
      if (card.companion && card.sideboard && card.ownerDbfId && !cardDb[card.dbfId]) {
        const prev = costs.get(card.ownerDbfId) ?? 0
        costs.set(card.ownerDbfId, prev + card.cost)
      }
    }
    return costs
  }, [sortedDeckCards, cardDb])

  function toggleCardSort(col: CardSortCol) {
    setCardSort(prev => prev.col === col ? { col, asc: !prev.asc } : { col, asc: col === 'cost' })
  }

  function handleCopy(e: React.MouseEvent) {
    e.stopPropagation()
    navigator.clipboard.writeText(deck.deck.deckstring).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  const hasRotationWarning = deck.rotatingCards.length > 0

  const classColor = CLASS_COLORS[deck.deck.playerClass] ?? '#808080'

  return (
    <div ref={rowRef} className="border border-white/10 rounded-lg mb-2 overflow-hidden">
      <div
        className="px-3 py-2.5 cursor-pointer hover:bg-white/5 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2">
          <ClassIcon cls={deck.deck.playerClass} size={18} />
          <a
            href={deck.deck.deckId.startsWith('hsguru-')
              ? `https://www.hsguru.com/deck/${deck.deck.deckId.slice(7)}`
              : `https://hsreplay.net/decks/${deck.deck.deckId}/`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium hover:underline shrink-0"
            style={{ color: classColor }}
            onClick={e => e.stopPropagation()}
          >
            {deck.archetypeName}
          </a>

          <span className="text-white/15 shrink-0">|</span>

          <div className="flex items-center gap-3 text-xs flex-wrap">
            <span title="Win Rate">
              <span className="text-gray-500">WR </span>
              <span style={{ color: wrColor(deck.deck.winRate) }}>{deck.deck.winRate.toFixed(1)}%</span>
            </span>
            <span className="text-gray-400" title="Games Played">
              {deck.deck.totalGames >= 1000 ? `${(deck.deck.totalGames / 1000).toFixed(1)}k` : deck.deck.totalGames.toLocaleString()} games
            </span>
            <span className="text-gray-500" title="Meta Percentage">
              {deck.metaPct.toFixed(1)}% meta
            </span>
            {deck.deck.duration && (
              <span className="text-gray-500" title="Average Game Duration">
                ~{formatDuration(deck.deck.duration)}
              </span>
            )}
            {deck.deck.winRate > 50 && (
              <span className="text-gray-500" title="Stars per Hour">
                {formatStarsPerHour(deck.minutesPerStar)} ★/hr
              </span>
            )}
            {deck.craftCost > 0 ? (
              <span className="flex items-center gap-1" title="Dust to Craft">
                <DustIcon size={11} />
                <span className={`font-medium ${deck.craftCost > (collection?.dust ?? 0) ? 'text-red-400' : 'text-gold'}`}>{deck.craftCost.toLocaleString()}</span>
              </span>
            ) : (
              <span className="text-green-400 font-medium text-[10px] bg-green-500/15 px-1.5 py-0.5 rounded" title="You own all cards in this deck">
                Ready
              </span>
            )}
            {showDustValue && (
              <span title="Dust value: climb efficiency vs craft cost" style={{ color: dustValueColor(deck.dustValue) }}>
                <span className="text-gray-500">val </span>{formatDustValue(deck.dustValue)}
              </span>
            )}
            {hasRotationWarning && (
              <span className="text-orange-400" title={`${deck.rotatingCards.length} missing epic/legendary card(s) rotating soon`}>
                ⚠
              </span>
            )}
          </div>

          <button
            onClick={handleCopy}
            className="ml-auto px-2 py-1 rounded bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 transition-colors text-xs shrink-0"
            title="Copy deckstring to clipboard"
          >
            {copied ? '✓' : 'Copy'}
          </button>
        </div>

        {!expanded && (
          <div className="flex gap-0.5 flex-wrap mt-2">
            {deckCards.filter(c => !c.companion).map(c => {
              const clr = c.cardClass !== 'NEUTRAL' ? CLASS_COLORS[c.cardClass] : undefined
              const counts = collection?.collection?.[c.dbfId]
              const owned = counts ? (counts[0] || 0) + (counts[1] || 0) + (counts[2] || 0) + (counts[3] || 0) : 0
              const isMissing = owned < c.count
              return (
                <CardCircleShared
                  key={`${c.dbfId}-${c.count}`}
                  id={c.id}
                  rarity={c.rarity}
                  size={28}
                  count={c.count}
                  missing={isMissing}
                />
              )
            })}
          </div>
        )}
      </div>

      {expanded && (() => {
        const uniqueCards = sortedDeckCards.length
        const availH = window.innerHeight - 280
        const maxRowH = uniqueCards > 25 ? 40 : Math.floor(availH / uniqueCards)
        const rowH = Math.max(28, Math.min(maxRowH, 56))
        const manaH = rowH - 2
        const manaW = Math.round(manaH * 0.75)
        const artW = Math.round(rowH * 2.2)

        return (
        <div className="border-t border-white/10 bg-white/[0.02] p-3">
          <table className="text-[13px] border-collapse" style={{ borderSpacing: 0 }}>
            <thead>
              <tr className="text-[11px] text-gray-500 uppercase tracking-wider border-b border-white/10">
                <th className="py-1 px-0.5 font-medium cursor-pointer hover:text-gray-300 select-none text-center" onClick={() => toggleCardSort('cost')}>
                  <span className="inline-flex items-center gap-0.5"><ManaIcon size={10} />{cardSort.col === 'cost' ? (cardSort.asc ? '↑' : '↓') : ''}</span>
                </th>
                <th className="text-left py-1 pl-1 pr-2 font-medium">Card</th>
                <th className="text-center py-1 px-2 font-medium">Qty</th>
                <th className="text-center py-1 px-2 font-medium">Own</th>
                {deck.craftCost > 0 && (
                <th className="text-right py-1 px-2 font-medium cursor-pointer hover:text-gray-300 select-none" onClick={() => toggleCardSort('dust')}>
                  Dust{cardSort.col === 'dust' ? (cardSort.asc ? ' ↑' : ' ↓') : ''}
                </th>
                )}
                <th className="text-left py-1 px-2 font-medium">Set</th>
              </tr>
            </thead>
            <tbody>
              {sortedDeckCards.map((c, idx) => {
                const isCompanion = c.companion
                const counts = isCompanion ? undefined : collection?.collection?.[c.dbfId]
                const owned = counts ? (counts[0] || 0) + (counts[1] || 0) + (counts[2] || 0) + (counts[3] || 0) : 0
                const maxNeeded = isCompanion ? 0 : c.count
                const missing = Math.max(0, maxNeeded - owned)
                const isRotating = missing > 0 && rotatingCodes.has(c.set) && (c.rarity === 'EPIC' || c.rarity === 'LEGENDARY')
                const rarityColor = isCompanion ? '#4a5568' : (RARITY_BORDER_COLORS[c.rarity] ?? '#6b7280')
                const isLastCompanion = isCompanion && (idx + 1 >= sortedDeckCards.length || !sortedDeckCards[idx + 1].companion)
                const compRowH = Math.max(24, rowH - 6)

                return (
                  <tr
                    key={c.dbfId}
                    className={`hover:bg-white/5 group ${isCompanion ? '' : 'border-b border-white/5'}`}
                    style={{
                      height: isCompanion ? compRowH : rowH,
                      ...(missing > 0 && !isCompanion ? { borderLeft: '2px solid #f97316' } : {}),
                      ...(isLastCompanion ? { borderBottom: '1px solid rgba(255,255,255,0.05)' } : {}),
                    }}
                  >
                    <td className="py-0 text-center" style={{ paddingLeft: isCompanion ? 12 : 2, paddingRight: 2, position: 'relative' }}>
                      {isCompanion && (
                        <div style={{
                          position: 'absolute',
                          left: 5,
                          top: 0,
                          bottom: isLastCompanion ? '50%' : 0,
                          width: 1,
                          backgroundColor: 'rgba(255,255,255,0.15)',
                        }} />
                      )}
                      {isCompanion && (
                        <div style={{
                          position: 'absolute',
                          left: 5,
                          top: '50%',
                          width: 5,
                          height: 1,
                          backgroundColor: 'rgba(255,255,255,0.15)',
                        }} />
                      )}
                      <div className="relative flex items-center justify-center shrink-0 mx-auto" style={{ width: isCompanion ? manaW - 4 : manaW, height: isCompanion ? manaH - 4 : manaH, backgroundColor: rarityColor, borderRadius: 3, boxShadow: '0 0 0 1px rgba(0,0,0,0.6), 0 1px 2px rgba(0,0,0,0.4)' }}>
                        <span className="text-white font-bold leading-none" style={{ fontSize: isCompanion ? 11 : 13, textShadow: '0 0 2px #000, 0 0 2px #000' }}>{c.cost + (combinedCosts.get(c.dbfId) ?? 0)}</span>
                      </div>
                    </td>
                    <td className="pl-1.5 pr-4 py-0 relative overflow-hidden" style={{ whiteSpace: 'nowrap', minWidth: 100 }}>
                      {!isCompanion && RARITY_BLEED[c.rarity] && (
                        <div className="absolute inset-0 pointer-events-none" style={{ background: `linear-gradient(to right, ${rarityColor}${RARITY_BLEED[c.rarity][0]} 0%, ${rarityColor}${RARITY_BLEED[c.rarity][1]} 40%, transparent 70%)` }} />
                      )}
                      <div
                        className="absolute pointer-events-none z-[1]"
                        style={{
                          right: -2,
                          top: 0,
                          height: '100%',
                          width: isCompanion ? artW - 10 : artW + 4,
                          backgroundImage: `url(/art/${c.id}_normal.png)`,
                          backgroundSize: '130%',
                          backgroundPosition: 'center 30%',
                          opacity: isCompanion ? 0.25 : missing > 0 ? 0.3 : 0.6,
                          filter: isCompanion || missing > 0 ? 'grayscale(0.7)' : 'none',
                          maskImage: 'linear-gradient(to right, transparent 0%, black 20%, black 85%, transparent 100%), linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%)',
                          WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 20%, black 85%, transparent 100%), linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%)',
                          maskComposite: 'intersect',
                          WebkitMaskComposite: 'destination-in',
                        }}
                      />
                      <CardHover id={c.id} name="" className="flex items-center gap-1 relative z-[2]">
                        <span className={`whitespace-nowrap ${isCompanion ? 'text-gray-500 text-[12px]' : missing > 0 ? 'text-gray-400' : 'text-gray-200 group-hover:text-white'}`} style={{ textShadow: '0 0 4px #000, 0 0 4px #000, 1px 1px 3px #000, -1px -1px 3px #000' }}>{c.name}</span>
                        {isRotating && <span className="text-orange-400 text-[10px] shrink-0" title="Rotating out of Standard soon">⚠</span>}
                      </CardHover>
                    </td>
                    <td className="text-center px-2 py-0 text-gray-400">
                      {isCompanion ? '' : c.rarity === 'LEGENDARY' ? <span className="text-amber-300">★</span> : c.count > 1 ? <span className="text-[10px] font-bold px-1 py-0.5 rounded bg-black/40 border border-white/20 text-gold leading-none">×{c.count}</span> : ''}
                    </td>
                    <td className="text-center px-2 py-0">
                      {isCompanion ? <span className="text-gray-400 text-[10px]">{c.sideboard ? 'choice' : 'token'}</span>
                        : missing > 0 ? <span className="text-red-400">-{missing}</span>
                        : <span className="text-green-400">✓</span>
                      }
                    </td>
                    {deck.craftCost > 0 && (
                    <td className="text-right px-2 py-0">
                      {missing > 0 && (
                        <span className="flex items-center justify-end gap-0.5">
                          <DustIcon size={9} />
                          <span className="text-gold text-[10px]">{(DUST_COST[c.rarity] * missing).toLocaleString()}</span>
                        </span>
                      )}
                    </td>
                    )}
                    <td className="py-0 px-2 text-gray-400 text-[10px] whitespace-nowrap">
                      {expansions.find(e => e.code === c.set)?.name ?? c.set}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        )
      })()}
    </div>
  )
}

interface CoreCard {
  dbfId: number
  id: string
  name: string
  rarity: string
  cost: number
  set: string
  cardClass: string
  inclusion: number
  avgCopies: number
}

interface AggregatedArchetype {
  id: number
  name: string
  playerClass: string
  url: string
  winRate: number
  totalGames: number
  metaPct: number
  deckCount: number
  avgDuration: number
  avgTurns: number
  climbingSpeed: number
  bestDeck: DeckInfo
  coreCards: CoreCard[]
  popularCards: CoreCard[]
  flexCards: CoreCard[]
  pctOfTotal: number
}

function aggregateArchetypes(
  decks: DeckInfo[],
  archetypes: ArchetypeInfo[],
  cardDb: Record<string, { id: string; name: string; rarity: string; cost: number; set?: string; cardClass?: string }>,
): AggregatedArchetype[] {
  const archMap = new Map(archetypes.map(a => [a.id, a]));
  const byArchetype = new Map<number, DeckInfo[]>()
  for (const d of decks) {
    const list = byArchetype.get(d.archetypeId) ?? []
    list.push(d)
    byArchetype.set(d.archetypeId, list)
  }

  const totalGamesAll = decks.reduce((s, d) => s + d.totalGames, 0)
  const result: AggregatedArchetype[] = []

  for (const [archId, archDecks] of byArchetype) {
    const arch = archMap.get(archId)
    if (!arch) continue

    const totalGames = archDecks.reduce((s, d) => s + d.totalGames, 0)
    const winRate = arch.winRate ?? (totalGames > 0
      ? archDecks.reduce((s, d) => s + d.winRate * d.totalGames, 0) / totalGames
      : 0)
    const avgDuration = arch.avgDuration ?? (totalGames > 0
      ? archDecks.reduce((s, d) => s + (d.duration ?? 480) * d.totalGames, 0) / totalGames / 60
      : 0)
    const avgTurns = arch.avgTurns ?? 0
    const climbingSpeed = arch.climbingSpeed ?? (winRate > 50
      ? 60 / (avgDuration > 0 ? avgDuration : 8) * (2 * winRate / 100 - 1)
      : 0)
    const pctOfTotal = arch.pctOfTotal ?? (totalGamesAll > 0 ? (totalGames / totalGamesAll) * 100 : 0)

    const totalDeckGames = archDecks.reduce((s, d) => s + d.totalGames, 0)
    const cardCounts = new Map<number, { gamesWithCard: number; totalCopies: number; decksWithCard: number }>()
    for (const d of archDecks) {
      for (const [dbfId, count] of d.cards) {
        const existing = cardCounts.get(dbfId) ?? { gamesWithCard: 0, totalCopies: 0, decksWithCard: 0 }
        existing.gamesWithCard += d.totalGames
        existing.totalCopies += count
        existing.decksWithCard++
        cardCounts.set(dbfId, existing)
      }
    }

    const allCards: CoreCard[] = []
    for (const [dbfId, stats] of cardCounts) {
      const card = cardDb[String(dbfId)]
      if (!card) continue
      const inclusion = totalDeckGames > 0 ? stats.gamesWithCard / totalDeckGames : 0
      allCards.push({
        dbfId,
        id: card.id,
        name: card.name,
        rarity: card.rarity,
        cost: card.cost,
        set: card.set ?? '',
        cardClass: card.cardClass ?? 'NEUTRAL',
        inclusion,
        avgCopies: stats.totalCopies / stats.decksWithCard,
      })
    }
    allCards.sort((a, b) => b.inclusion - a.inclusion || a.cost - b.cost)

    const coreCards = allCards.filter(c => c.inclusion > 0.85)
    const popularCards = allCards.filter(c => c.inclusion > 0.5 && c.inclusion <= 0.85)
    const flexCards = allCards.filter(c => c.inclusion <= 0.5 && c.inclusion >= 0.2)

    const bestDeck = archDecks.reduce((best, d) => d.winRate > best.winRate ? d : best, archDecks[0])

    result.push({
      id: archId,
      name: arch.name,
      playerClass: arch.playerClass,
      url: arch.url,
      winRate,
      totalGames: arch.totalGames ?? totalGames,
      metaPct: totalGamesAll > 0 ? (totalGames / totalGamesAll) * 100 : 0,
      deckCount: archDecks.length,
      avgDuration,
      avgTurns,
      climbingSpeed,
      bestDeck,
      coreCards,
      popularCards,
      flexCards,
      pctOfTotal,
    })
  }

  for (const arch of archetypes) {
    if (byArchetype.has(arch.id)) continue
    if (!arch.winRate || !arch.totalGames) continue
    result.push({
      id: arch.id,
      name: arch.name,
      playerClass: arch.playerClass,
      url: arch.url,
      winRate: arch.winRate,
      totalGames: arch.totalGames,
      metaPct: totalGamesAll > 0 ? ((arch.totalGames ?? 0) / totalGamesAll) * 100 : 0,
      deckCount: 0,
      avgDuration: arch.avgDuration ?? 0,
      avgTurns: arch.avgTurns ?? 0,
      climbingSpeed: arch.climbingSpeed ?? 0,
      bestDeck: null as unknown as DeckInfo,
      coreCards: [],
      popularCards: [],
      flexCards: [],
      pctOfTotal: arch.pctOfTotal ?? 0,
    })
  }

  result.sort((a, b) => b.winRate - a.winRate)
  return result
}

function ArchetypeRow({
  arch,
  expanded,
  onToggle,
  onViewDecks,
  cardDb,
  collection,
  artVersion,
  gameMode,
  expansions,
  deckInfo,
  showDustValue,
}: {
  arch: AggregatedArchetype
  expanded: boolean
  onToggle: () => void
  onViewDecks: () => void
  cardDb: Record<string, { id: string; name: string; rarity: string; cost: number; set?: string; cardClass?: string }>
  collection: { collection?: Record<string, number[]>; dust?: number } | null
  artVersion: number
  expansions: { code: string; name: string }[]
  gameMode: 'standard' | 'wild'
  deckInfo: { bestDeck: EnrichedDeck | null; canBuild: boolean } | null
  showDustValue?: boolean
}) {
  const [matchups, setMatchups] = useState<HsguruMatchup[] | null>(null)
  const [matchupsLoading, setMatchupsLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'cards' | 'matchups'>('cards')
  const [copied, setCopied] = useState(false)
  const rowRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (expanded && rowRef.current) {
      setTimeout(() => rowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
    }
  }, [expanded])

  const loadMatchups = useCallback(() => {
    if (gameMode !== 'wild' || matchups || matchupsLoading) return
    setMatchupsLoading(true)
    const slug = arch.url.split('/archetype/')[1]?.split('?')[0] ?? arch.name
    api.getDeckMatchups(decodeURIComponent(slug), 1).then(data => {
      setMatchups(data.matchups)
    }).catch(() => setMatchups([])).finally(() => setMatchupsLoading(false))
  }, [arch, matchups, matchupsLoading, gameMode])

  const tier = getTier(arch.winRate)
  const tierColor = TIER_COLORS[tier]
  const classColor = CLASS_COLORS[arch.playerClass] ?? '#808080'
  const craftCost = deckInfo?.bestDeck?.craftCost ?? 0

  return (
    <div ref={rowRef} className="border border-white/10 rounded-lg mb-2 overflow-hidden flex">
      <div
        className="w-9 shrink-0 flex flex-col items-center justify-center cursor-pointer"
        style={{ backgroundColor: tierColor + '10', borderRight: `2px solid ${tierColor}40` }}
        onClick={onToggle}
      >
        <span className="font-bold text-sm" style={{ color: tierColor }}>T{tier}</span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="px-3 py-2.5 cursor-pointer hover:bg-white/5 transition-colors" onClick={onToggle}>
          <div className="flex items-center gap-2">
            <ClassIcon cls={arch.playerClass} size={20} />
            <span className="text-sm font-medium" style={{ color: classColor }}>{arch.name}</span>
            {arch.deckCount > 0 && (
              <button
                onClick={e => { e.stopPropagation(); onViewDecks() }}
                className="ml-auto px-2 py-1 rounded bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 transition-colors text-xs shrink-0"
              >
                View Decks →
              </button>
            )}
          </div>

          <div className="flex items-center gap-3 text-xs mt-1.5 flex-wrap">
            <span title="Win Rate">
              <span className="text-gray-500">WR </span>
              <span style={{ color: wrColor(arch.winRate) }}>{arch.winRate.toFixed(1)}%</span>
            </span>
            <span className="text-gray-400" title="Games Played">
              {arch.totalGames >= 1000 ? `${(arch.totalGames / 1000).toFixed(1)}k` : arch.totalGames.toLocaleString()} games
            </span>
            {arch.pctOfTotal > 0 && (
              <span className="text-gray-500" title="Meta Percentage — how often this archetype appears in the current meta">
                {arch.pctOfTotal.toFixed(1)}% meta
              </span>
            )}
            {arch.avgDuration > 0 && (
              <span className="text-gray-500" title="Average Game Duration">
                ~{Math.round(arch.avgDuration)}m
              </span>
            )}
            {arch.climbingSpeed > 0 && (
              <span className="text-gray-500" title="Climbing Speed (Stars per Hour)">
                {arch.climbingSpeed.toFixed(1)} ★/hr
              </span>
            )}
            <span className="text-gray-500">{arch.deckCount} deck{arch.deckCount !== 1 ? 's' : ''}</span>
            {craftCost > 0 && (
              <span className="flex items-center gap-1" title="Dust needed to craft the best-value deck variant">
                <DustIcon size={11} />
                <span className={craftCost > (collection?.dust ?? 0) ? 'text-red-400' : 'text-gold'}>{craftCost.toLocaleString()}</span>
              </span>
            )}
            {showDustValue && deckInfo?.bestDeck && (
              <span title="Dust value: climb efficiency vs craft cost" style={{ color: dustValueColor(deckInfo.bestDeck.dustValue) }}>
                <span className="text-gray-500">val </span>{formatDustValue(deckInfo.bestDeck.dustValue)}
              </span>
            )}
          </div>

          {!expanded && arch.coreCards.length > 0 && (
            <div className="flex gap-1.5 flex-wrap mt-3">
              {arch.coreCards.slice(0, 20).map(c => {
                const counts = collection?.collection?.[String(c.dbfId)]
                const owned = counts ? (counts[0] || 0) + (counts[1] || 0) + (counts[2] || 0) + (counts[3] || 0) : 0
                const isMissing = owned < Math.ceil(c.avgCopies)
                return (
                  <CardCircleShared key={c.dbfId} id={c.id} rarity={c.rarity} size={48} missing={isMissing} />
                )
              })}
            </div>
          )}
        </div>

        {expanded && (
          <div className="border-t border-white/10 bg-white/[0.02]">
            {deckInfo?.bestDeck && (() => {
              const bd = deckInfo.bestDeck
              return (
                <div className="px-3 py-2.5 border-b border-white/10 flex items-center gap-3 flex-wrap">
                  <span className="text-[11px] text-gray-400 uppercase tracking-wider font-medium">Suggested Deck</span>
                  <span title="Best deck win rate" className="text-xs">
                    <span className="text-gray-500">WR </span>
                    <span style={{ color: wrColor(bd.deck.winRate) }}>{bd.deck.winRate.toFixed(1)}%</span>
                  </span>
                  <span className="text-gray-400 text-xs">{bd.deck.totalGames.toLocaleString()} games</span>
                  {bd.craftCost > 0 ? (
                    <span className="flex items-center gap-0.5 text-xs">
                      <DustIcon size={10} />
                      <span className={bd.craftCost > (collection?.dust ?? 0) ? 'text-red-400' : 'text-gold'}>{bd.craftCost.toLocaleString()}</span>
                    </span>
                  ) : (
                    <span className="text-green-400 text-[10px] bg-green-500/15 px-1.5 py-0.5 rounded">Ready</span>
                  )}
                  <span title="Dust value" className="text-xs" style={{ color: dustValueColor(bd.dustValue) }}>
                    <span className="text-gray-500">val </span>{formatDustValue(bd.dustValue)}
                  </span>
                  <div className="flex items-center gap-1.5 ml-auto">
                    <a
                      href={bd.deck.deckId.startsWith('hsguru-')
                        ? `https://www.hsguru.com/deck/${bd.deck.deckId.slice(7)}`
                        : `https://hsreplay.net/decks/${bd.deck.deckId}/`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2 py-1 rounded bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 transition-colors text-xs"
                      onClick={e => e.stopPropagation()}
                    >
                      View →
                    </a>
                    <button
                      onClick={e => {
                        e.stopPropagation()
                        navigator.clipboard.writeText(bd.deck.deckstring).then(() => {
                          setCopied(true)
                          setTimeout(() => setCopied(false), 1500)
                        })
                      }}
                      className="px-2 py-1 rounded bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 transition-colors text-xs"
                    >
                      {copied ? '✓' : 'Copy'}
                    </button>
                  </div>
                </div>
              )
            })()}

            <div className="flex border-b border-white/10">
              <button
                onClick={() => setActiveTab('cards')}
                className={`px-4 py-2 text-xs ${activeTab === 'cards' ? 'text-white border-b-2 border-gold' : 'text-gray-500 hover:text-gray-300'}`}
              >
                Card Analysis ({arch.coreCards.length + arch.popularCards.length + arch.flexCards.length})
              </button>
              <button
                onClick={() => { setActiveTab('matchups'); loadMatchups() }}
                className={`px-4 py-2 text-xs ${activeTab === 'matchups' ? 'text-white border-b-2 border-gold' : 'text-gray-500 hover:text-gray-300'}`}
              >
                Matchups
              </button>
            </div>

          {activeTab === 'cards' && (() => {
            const allCards = [...arch.coreCards, ...arch.popularCards, ...arch.flexCards]
            if (allCards.length === 0) return <div className="p-3 text-gray-500 text-xs text-center py-4">No deck data available for card breakdown</div>

            const availH = window.innerHeight - 300
            const maxRowH = allCards.length > 25 ? 40 : Math.floor(availH / allCards.length)
            const rowH = Math.max(28, Math.min(maxRowH, 56))
            const manaH = rowH - 2
            const manaW = Math.round(manaH * 0.75)
            const artW = Math.round(rowH * 2.2)

            const sections: { label: string; cards: CoreCard[]; labelColor: string }[] = []
            if (arch.coreCards.length > 0) sections.push({ label: 'Core', cards: arch.coreCards, labelColor: '#d4d4d4' })
            if (arch.popularCards.length > 0) sections.push({ label: 'Popular', cards: arch.popularCards, labelColor: '#9ca3af' })
            if (arch.flexCards.length > 0) sections.push({ label: 'Flex', cards: arch.flexCards, labelColor: '#6b7280' })

            return (
              <div className="p-3 space-y-3">
                {sections.map(section => (
                  <div key={section.label}>
                    <div className="text-[11px] uppercase tracking-wider font-medium mb-1 px-0.5" style={{ color: section.labelColor }}>
                      {section.label} ({section.cards.length})
                    </div>
                    <table className="text-[13px] border-collapse" style={{ borderSpacing: 0 }}>
                      <tbody>
                        {section.cards.map(c => {
                          const rarityColor = RARITY_BORDER_COLORS[c.rarity] ?? '#6b7280'
                          const counts = collection?.collection?.[String(c.dbfId)]
                          const owned = counts ? (counts[0] || 0) + (counts[1] || 0) + (counts[2] || 0) + (counts[3] || 0) : 0
                          const needed = Math.ceil(c.avgCopies)
                          const missing = Math.max(0, needed - owned)
                          return (
                            <tr key={c.dbfId} className="hover:bg-white/5 group border-b border-white/5" style={{ height: rowH, ...(missing > 0 ? { borderLeft: '2px solid #f97316' } : {}) }}>
                              <td className="py-0 px-0.5 text-center">
                                <div className="relative flex items-center justify-center shrink-0 mx-auto" style={{ width: manaW, height: manaH, backgroundColor: rarityColor, borderRadius: 3, boxShadow: '0 0 0 1px rgba(0,0,0,0.6), 0 1px 2px rgba(0,0,0,0.4)' }}>
                                  <span className="text-white font-bold leading-none" style={{ fontSize: 13, textShadow: '0 0 2px #000, 0 0 2px #000' }}>{c.cost}</span>
                                </div>
                              </td>
                              <td className="pl-1.5 pr-4 py-0 relative overflow-hidden" style={{ whiteSpace: 'nowrap', minWidth: 100 }}>
                                {RARITY_BLEED[c.rarity] && (
                                  <div className="absolute inset-0 pointer-events-none" style={{ background: `linear-gradient(to right, ${rarityColor}${RARITY_BLEED[c.rarity][0]} 0%, ${rarityColor}${RARITY_BLEED[c.rarity][1]} 40%, transparent 70%)` }} />
                                )}
                                <div
                                  className="absolute pointer-events-none z-[1]"
                                  style={{
                                    right: -2, top: 0, height: '100%', width: artW + 4,
                                    backgroundImage: `url(/art/${c.id}_normal.png)`,
                                    backgroundSize: '130%', backgroundPosition: 'center 30%',
                                    opacity: missing > 0 ? 0.3 : 0.6,
                                    filter: missing > 0 ? 'grayscale(0.7)' : 'none',
                                    maskImage: 'linear-gradient(to right, transparent 0%, black 20%, black 85%, transparent 100%), linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%)',
                                    WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 20%, black 85%, transparent 100%), linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%)',
                                    maskComposite: 'intersect',
                                    WebkitMaskComposite: 'destination-in' as never,
                                  }}
                                />
                                <CardHover id={c.id} name="" className="flex items-center gap-1 relative z-[2]">
                                  <span className={`whitespace-nowrap ${missing > 0 ? 'text-gray-400' : 'text-gray-200 group-hover:text-white'}`} style={{ textShadow: '0 0 4px #000, 0 0 4px #000, 1px 1px 3px #000, -1px -1px 3px #000' }}>{c.name}</span>
                                </CardHover>
                              </td>
                              <td className="text-center px-2 py-0 text-gray-400 text-xs">
                                {(c.inclusion * 100).toFixed(0)}%
                              </td>
                              <td className="text-center px-2 py-0 text-gray-400 text-xs">
                                {c.avgCopies.toFixed(1)}
                              </td>
                              <td className="text-center px-2 py-0">
                                {missing > 0 ? <span className="text-red-400 text-xs">-{missing}</span> : <span className="text-green-400 text-xs">✓</span>}
                              </td>
                              <td className="py-0 px-2 text-gray-400 text-[10px] whitespace-nowrap">
                                {expansions.find(e => e.code === c.set)?.name ?? c.set}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )
          })()}

          {activeTab === 'matchups' && (
            <div className="p-3">
              {matchupsLoading ? (
                <div className="text-gray-500 text-xs text-center py-4">Loading matchups...</div>
              ) : !matchups || matchups.length === 0 ? (
                <div className="text-gray-500 text-xs text-center py-4">No matchup data available</div>
              ) : (
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-[11px] text-gray-500 uppercase tracking-wider border-b border-white/10">
                      <th className="py-1 px-2 text-left font-medium">Opponent</th>
                      <th className="py-1 px-2 text-center font-medium">Win Rate</th>
                      <th className="py-1 px-2 text-center font-medium">Games</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matchups.sort((a, b) => b.winRate - a.winRate).map(m => (
                      <tr key={m.opponentClass} className="border-b border-white/5 hover:bg-white/5">
                        <td className="py-1.5 px-2 flex items-center gap-2">
                          <ClassIcon cls={m.opponentClass} size={14} />
                          <span className="text-gray-300">{classLabel(m.opponentClass)}</span>
                        </td>
                        <td className="py-1.5 px-2 text-center">
                          <span style={{ color: wrColor(m.winRate) }}>{m.winRate.toFixed(1)}%</span>
                        </td>
                        <td className="py-1.5 px-2 text-center text-gray-400">{m.totalGames.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  )
}

type ViewMode = 'archetypes' | 'decks'

function CardInclusionFilter({ cardDb, requiredCards, onChange }: { cardDb: CardDb; requiredCards: number[]; onChange: (cards: number[]) => void }) {
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const artVersion = useStore(s => s.artVersion)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setFocused(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const suggestions = useMemo(() => {
    if (!query || query.length < 2) return []
    const q = query.toLowerCase()
    const results: { dbfId: number; id: string; name: string; cost: number; rarity: string; cardClass: string }[] = []
    const requiredSet = new Set(requiredCards)
    for (const [dbfId, card] of Object.entries(cardDb)) {
      if (requiredSet.has(Number(dbfId))) continue
      if (card.name.toLowerCase().includes(q)) {
        results.push({ dbfId: Number(dbfId), id: card.id, name: card.name, cost: card.cost, rarity: card.rarity, cardClass: card.cardClass })
      }
      if (results.length >= 8) break
    }
    results.sort((a, b) => {
      const aStarts = a.name.toLowerCase().startsWith(q) ? 0 : 1
      const bStarts = b.name.toLowerCase().startsWith(q) ? 0 : 1
      return aStarts - bStarts || a.cost - b.cost || a.name.localeCompare(b.name)
    })
    return results
  }, [query, cardDb, requiredCards])

  function addCard(dbfId: number) {
    onChange([...requiredCards, dbfId])
    setQuery('')
    inputRef.current?.focus()
  }

  function removeCard(dbfId: number) {
    onChange(requiredCards.filter(id => id !== dbfId))
  }

  const selectedCards = requiredCards.map(dbfId => {
    const card = cardDb[String(dbfId)]
    return card ? { dbfId, id: card.id, name: card.name, cost: card.cost, rarity: card.rarity, cardClass: card.cardClass } : null
  }).filter(Boolean) as { dbfId: number; id: string; name: string; cost: number; rarity: string; cardClass: string }[]

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-gray-400 whitespace-nowrap">Must include:</span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          placeholder="Search cards..."
          className="bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-gray-200 w-36 focus:outline-none focus:border-gold/50"
        />
      </div>

      {focused && suggestions.length > 0 && (
        <div className="absolute top-full left-0 mt-1 bg-gray-900 border border-white/15 rounded-lg shadow-xl z-50 w-72 max-h-80 overflow-auto">
          {suggestions.map(card => (
            <CardHover key={card.dbfId} id={card.id} name="" className="block">
              <button
                onClick={() => addCard(card.dbfId)}
                className="w-full text-left px-2 py-1.5 hover:bg-white/10 flex items-center gap-2 relative overflow-hidden group"
              >
                <div
                  className="absolute inset-0 z-0 pointer-events-none opacity-30 group-hover:opacity-50"
                  style={{
                    backgroundImage: `url(/art/${card.id}_normal.png)`,
                    backgroundSize: '180%',
                    backgroundPosition: 'center 25%',
                    maskImage: 'linear-gradient(to right, transparent 0%, black 30%, black 70%, transparent 100%)',
                    WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 30%, black 70%, transparent 100%)',
                  }}
                />
                <span className="relative z-[1] w-5 h-5 rounded text-white text-[10px] font-bold flex items-center justify-center shrink-0" style={{ backgroundColor: RARITY_BORDER_COLORS[card.rarity as Rarity] ?? '#6b7280', boxShadow: '0 0 0 1px rgba(0,0,0,0.6)' }}>{card.cost}</span>
                <span className="relative z-[1] text-xs text-gray-200 truncate flex-1" style={{ textShadow: '0 0 4px #000, 0 0 4px #000' }}>{card.name}</span>
              </button>
            </CardHover>
          ))}
        </div>
      )}

      {selectedCards.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {selectedCards.map(card => (
            <CardHover key={card.dbfId} id={card.id} name="">
              <div className="flex items-center gap-1 bg-white/10 border border-white/15 rounded pl-1 pr-0.5 py-0.5 text-xs text-gray-200 relative overflow-hidden group">
                <div
                  className="absolute inset-0 z-0 pointer-events-none opacity-25"
                  style={{
                    backgroundImage: `url(/art/${card.id}_normal.png)`,
                    backgroundSize: '200%',
                    backgroundPosition: 'center 25%',
                    maskImage: 'linear-gradient(to right, transparent 0%, black 30%, black 80%, transparent 100%)',
                    WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 30%, black 80%, transparent 100%)',
                  }}
                />
                <span className="relative z-[1] w-4 h-4 rounded text-white text-[9px] font-bold flex items-center justify-center shrink-0" style={{ backgroundColor: RARITY_BORDER_COLORS[card.rarity as Rarity] ?? '#6b7280', boxShadow: '0 0 0 1px rgba(0,0,0,0.6)' }}>{card.cost}</span>
                <span className="relative z-[1] whitespace-nowrap" style={{ textShadow: '0 0 4px #000, 0 0 4px #000' }}>{card.name}</span>
                <button
                  onClick={() => removeCard(card.dbfId)}
                  className="relative z-[1] w-4 h-4 flex items-center justify-center text-gray-500 hover:text-red-400 shrink-0"
                >
                  ×
                </button>
              </div>
            </CardHover>
          ))}
        </div>
      )}
    </div>
  )
}

export default function DecksView() {
  const deckList = useStore(s => s.deckList)
  const deckArchetypes = useStore(s => s.deckArchetypes)
  const companionCards = useStore(s => s.deckCompanionCards)
  const decksLoading = useStore(s => s.decksLoading)
  const fetchDecks = useStore(s => s.fetchDecks)
  const cardDb = useStore(s => s.cards)
  const collection = useStore(s => s.collection)
  const expansions = useStore(s => s.expansions)
  const metaBracket = useStore(s => s.metaBracket)
  const deckGameMode = useStore(s => s.deckGameMode)
  const setDeckGameMode = useStore(s => s.setDeckGameMode)
  const deckSource = useStore(s => s.deckSource)
  const decksFetchedAt = useStore(s => s.decksFetchedAt)

  const [viewMode, setViewMode] = useState<ViewMode>('archetypes')
  const [classFilter, setClassFilter] = useState('')
  const [archetypeFilter, setArchetypeFilter] = useState('')
  const [searchText, setSearchText] = useState('')
  const [buildableOnly, setBuildableOnly] = useState(false)
  const [canBuildOnly, setCanBuildOnly] = useState(false)
  const [hideNoDecks, setHideNoDecks] = useState(true)
  const [hideUnnamed, setHideUnnamed] = useState(true)
  const [requiredCards, setRequiredCards] = useState<number[]>([])
  const [maxDust, setMaxDust] = useState(50000)
  const [sortBy, setSortBy] = useState<DeckSortOption>('dustValue')
  const [sortAsc, setSortAsc] = useState(false)
  const [archSortBy, setArchSortBy] = useState<ArchetypeSortOption>('winRate')
  const [archSortAsc, setArchSortAsc] = useState(false)
  const [expandedDeck, setExpandedDeck] = useState<string | null>(null)
  const [expandedArchetype, setExpandedArchetype] = useState<number | null>(null)
  const [minGames, setMinGames] = useState(deckGameMode === 'wild' ? 50 : 200)
  const [minGamesInput, setMinGamesInput] = useState(String(minGames))
  const [deckFiltersExpanded, setDeckFiltersExpanded] = useState(false)

  useEffect(() => { fetchDecks() }, [fetchDecks, deckGameMode, metaBracket])
  useEffect(() => {
    setMinGames(deckGameMode === 'wild' ? 50 : 200)
    setMinGamesInput(String(deckGameMode === 'wild' ? 50 : 200))
  }, [deckGameMode])

  const rotationInfo = useRotationInfo(expansions, 60)
  const rotatingCodes = deckGameMode === 'wild' ? new Set<string>() : (rotationInfo?.rotatingCodes ?? new Set<string>())
  const daysLeft = rotationInfo?.daysLeft ?? 90

  const artVersion = useStore(s => s.artVersion)
  const archMap = useMemo(() => new Map(deckArchetypes.map(a => [a.id, a])), [deckArchetypes])

  const aggregatedArchetypes = useMemo(
    () => aggregateArchetypes(deckList, deckArchetypes, cardDb),
    [deckList, deckArchetypes, cardDb],
  )

  function handleViewDecks(archetypeId: number) {
    setViewMode('decks')
    setArchetypeFilter(String(archetypeId))
  }

  function handleApplyMinGames() {
    const v = parseInt(minGamesInput)
    if (!isNaN(v) && v >= 0) {
      setMinGames(v)
      fetchDecks({ minGames: v })
    }
  }

  const archetypeOptions = useMemo(() => {
    const filtered = classFilter
      ? deckArchetypes.filter(a => a.playerClass === classFilter)
      : deckArchetypes
    return [
      { value: '', label: 'All Archetypes' },
      ...filtered.map(a => ({ value: String(a.id), label: a.name })),
    ]
  }, [deckArchetypes, classFilter])

  const enrichedDecks = useMemo(() => {
    const totalGamesAll = deckList.reduce((s, d) => s + d.totalGames, 0)

    return deckList.map((deck): EnrichedDeck => {
      const arch = archMap.get(deck.archetypeId)
      let craftCost = 0
      let adjustedCraftCost = 0
      const rotCards: { dbfId: string; rarity: Rarity }[] = []

      for (const [dbfId, count] of deck.cards) {
        const card = cardDb[String(dbfId)]
        if (!card) continue
        const rarity = card.rarity as Rarity
        const counts = collection?.collection?.[String(dbfId)]
        const owned = counts ? (counts[0] || 0) + (counts[1] || 0) + (counts[2] || 0) + (counts[3] || 0) : 0
        const missing = Math.max(0, count - owned)

        if (missing > 0) {
          const cost = DUST_COST[rarity] * missing
          craftCost += cost

          const isRotating = rotatingCodes.has(card.set)
          const rotWeight = isRotating ? Math.max(0, daysLeft / 90) : 1
          adjustedCraftCost += cost * rotWeight

          if (isRotating && (rarity === 'EPIC' || rarity === 'LEGENDARY')) {
            rotCards.push({ dbfId: String(dbfId), rarity })
          }
        }
      }

      const metaPct = totalGamesAll > 0 ? (deck.totalGames / totalGamesAll) * 100 : 0
      const durationMin = deck.duration ? deck.duration / 60 : 8
      const minutesPerStar = deck.winRate > 50 ? durationMin / (2 * deck.winRate / 100 - 1) : Infinity
      const starsPerHour = isFinite(minutesPerStar) && minutesPerStar > 0 ? 60 / minutesPerStar : 0

      let dustValue: number
      if (starsPerHour <= 0) {
        dustValue = 0
      } else {
        dustValue = starsPerHour * 100 / (1 + adjustedCraftCost / 5000)
      }

      return {
        deck,
        archetypeName: arch?.name ?? `Archetype #${deck.archetypeId}`,
        archetypeUrl: arch?.url ?? '',
        craftCost,
        adjustedCraftCost,
        dustValue,
        metaPct,
        minutesPerStar,
        rotatingCards: rotCards,
      }
    })
  }, [deckList, cardDb, collection, rotatingCodes, daysLeft, archMap])

  const archetypeDeckInfo = useMemo(() => {
    const result = new Map<number, { bestDeck: EnrichedDeck | null; canBuild: boolean }>()
    const byArchetype = new Map<number, EnrichedDeck[]>()
    for (const d of enrichedDecks) {
      const list = byArchetype.get(d.deck.archetypeId) ?? []
      list.push(d)
      byArchetype.set(d.deck.archetypeId, list)
    }
    for (const arch of aggregatedArchetypes) {
      const archDecks = byArchetype.get(arch.id) ?? []
      const totalGames = archDecks.reduce((s, d) => s + d.deck.totalGames, 0)
      const threshold = totalGames * 0.2
      const eligible = archDecks.filter(d => d.deck.totalGames >= threshold)
      if (eligible.length === 0) {
        result.set(arch.id, { bestDeck: null, canBuild: false })
        continue
      }
      eligible.sort((a, b) => b.dustValue - a.dustValue)
      const userDust = collection?.dust ?? 0
      const canBuild = eligible.some(d => d.craftCost <= userDust)
      result.set(arch.id, { bestDeck: eligible[0], canBuild })
    }
    return result
  }, [aggregatedArchetypes, enrichedDecks, collection])

  const filteredArchetypes = useMemo(() => {
    let list = [...aggregatedArchetypes]
    if (searchText) {
      const q = searchText.toLowerCase()
      list = list.filter(a => a.name.toLowerCase().includes(q))
    }
    if (classFilter) list = list.filter(a => a.playerClass === classFilter)
    if (hideNoDecks) list = list.filter(a => a.deckCount > 0)
    if (hideUnnamed) list = list.filter(a => !/^Archetype #/.test(a.name))
    if (canBuildOnly) {
      list = list.filter(a => archetypeDeckInfo.get(a.id)?.canBuild ?? false)
    }
    if (requiredCards.length > 0) {
      list = list.filter(a => {
        const allCards = [...a.coreCards, ...a.popularCards, ...a.flexCards]
        return requiredCards.every(id => allCards.some(c => c.dbfId === id))
      })
    }
    const dir = archSortAsc ? 1 : -1
    list = [...list].sort((a, b) => {
      const infoA = archetypeDeckInfo.get(a.id)
      const infoB = archetypeDeckInfo.get(b.id)
      switch (archSortBy) {
        case 'winRate': return (a.winRate - b.winRate) * dir
        case 'meta': return (a.pctOfTotal - b.pctOfTotal) * dir
        case 'games': return (a.totalGames - b.totalGames) * dir
        case 'climbRate': return (a.climbingSpeed - b.climbingSpeed) * dir
        case 'dustCost': return ((infoA?.bestDeck?.craftCost ?? 99999) - (infoB?.bestDeck?.craftCost ?? 99999)) * dir
        case 'dustValue': return ((infoA?.bestDeck?.dustValue ?? 0) - (infoB?.bestDeck?.dustValue ?? 0)) * dir
        default: return 0
      }
    })
    return list
  }, [aggregatedArchetypes, searchText, classFilter, canBuildOnly, hideNoDecks, hideUnnamed, requiredCards, archSortBy, archSortAsc, archetypeDeckInfo])

  const filtered = useMemo(() => {
    let list = enrichedDecks

    if (searchText) {
      const q = searchText.toLowerCase()
      list = list.filter(d => d.archetypeName.toLowerCase().includes(q))
    }
    if (classFilter) list = list.filter(d => d.deck.playerClass === classFilter)
    if (archetypeFilter) list = list.filter(d => String(d.deck.archetypeId) === archetypeFilter)
    if (buildableOnly) list = list.filter(d => d.craftCost === 0)
    if (requiredCards.length > 0) {
      list = list.filter(d => {
        const deckDbfIds = new Set(d.deck.cards.map(([id]) => id))
        return requiredCards.every(id => deckDbfIds.has(id))
      })
    }
    list = list.filter(d => d.craftCost <= maxDust)

    const dir = sortAsc ? 1 : -1
    list = [...list].sort((a, b) => {
      switch (sortBy) {
        case 'dustValue': return (a.dustValue - b.dustValue) * dir
        case 'winRate': return (a.deck.winRate - b.deck.winRate) * dir
        case 'games': return (a.deck.totalGames - b.deck.totalGames) * dir
        case 'craftCost': return (a.craftCost - b.craftCost) * dir
        case 'climbRate': {
          const av = isFinite(a.minutesPerStar) ? 60 / a.minutesPerStar : 0
          const bv = isFinite(b.minutesPerStar) ? 60 / b.minutesPerStar : 0
          return (av - bv) * dir
        }
        default: return 0
      }
    })

    return list
  }, [enrichedDecks, classFilter, archetypeFilter, buildableOnly, requiredCards, maxDust, sortBy, sortAsc, searchText])

  if (decksLoading && deckList.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-400 text-lg">Loading deck data...</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="sticky top-0 z-10 bg-navy/95 backdrop-blur-sm border-b border-white/10">
        <div className="px-4 pt-4 pb-2 flex items-baseline gap-3">
          <h1 className="text-xl font-bold text-gold">Decks</h1>
          {deckGameMode === 'standard' && (
            <span className="text-xs text-gray-500">Stats: <span className="text-gray-400">{bracketLabel(metaBracket)}</span></span>
          )}
          {deckGameMode === 'wild' && (
            <span className="text-xs text-gray-500">Stats: <span className="text-gray-400">{bracketLabel(metaBracket)}</span></span>
          )}
          {deckSource && (
            <span className="text-gray-400 text-[10px]">via {deckSource === 'hsguru' ? 'HSGuru' : 'HSReplay'}</span>
          )}
          {decksLoading && <span className="text-gold text-xs">Refreshing...</span>}
        </div>
        <div className="px-4 py-2 flex items-center gap-2">
          <button
            onClick={() => setDeckFiltersExpanded(!deckFiltersExpanded)}
            title={deckFiltersExpanded ? 'Hide filters' : 'Show filters'}
            className={`p-1.5 rounded border transition-colors ${
              deckFiltersExpanded
                ? 'bg-gold/15 text-gold border-gold/30'
                : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10 hover:text-gray-300'
            }`}
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="6" x2="20" y2="6" />
              <line x1="6" y1="12" x2="18" y2="12" />
              <line x1="8" y1="18" x2="16" y2="18" />
            </svg>
          </button>

          <div className="relative w-48">
            <input
              type="text"
              placeholder="Search archetypes..."
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              className="bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm w-full pr-7 placeholder:text-gray-500 focus:outline-none focus:border-gold/50"
            />
            {searchText && (
              <button
                onClick={() => setSearchText('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-gray-500 hover:text-gray-300 transition-colors"
              >
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>

          <div className="flex rounded overflow-hidden border border-white/10">
            <button
              onClick={() => setDeckGameMode('standard')}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm transition-colors ${
                deckGameMode === 'standard' ? 'bg-gold/20 text-gold' : 'bg-white/5 text-gray-400 hover:text-gray-200'
              }`}
            >
              <StandardIcon size={12} /> Standard
            </button>
            <button
              onClick={() => setDeckGameMode('wild')}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm transition-colors ${
                deckGameMode === 'wild' ? 'bg-gold/20 text-gold' : 'bg-white/5 text-gray-400 hover:text-gray-200'
              }`}
            >
              <WildIcon size={12} /> Wild
            </button>
          </div>

          <div className="flex rounded overflow-hidden border border-white/10 shrink-0">
            <button
              onClick={() => setViewMode('archetypes')}
              className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${viewMode === 'archetypes' ? 'bg-gold/80 text-navy' : 'bg-white/5 text-gray-400 hover:text-white'}`}
            >
              Archetypes
            </button>
            <button
              onClick={() => setViewMode('decks')}
              className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${viewMode === 'decks' ? 'bg-gold/80 text-navy' : 'bg-white/5 text-gray-400 hover:text-white'}`}
            >
              Decks
            </button>
          </div>

          <div className="flex items-center gap-1 ml-auto">
            <Dropdown
              label="Sort"
              options={viewMode === 'archetypes' ? ARCHETYPE_SORT_OPTIONS : SORT_OPTIONS}
              value={viewMode === 'archetypes' ? archSortBy : sortBy}
              onChange={v => viewMode === 'archetypes' ? setArchSortBy(v as ArchetypeSortOption) : setSortBy(v as DeckSortOption)}
            />
            <button
              onClick={() => viewMode === 'archetypes' ? setArchSortAsc(!archSortAsc) : setSortAsc(!sortAsc)}
              className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-gray-400 hover:bg-white/10 hover:text-white transition-colors"
              title={(viewMode === 'archetypes' ? archSortAsc : sortAsc) ? 'Ascending' : 'Descending'}
            >
              {(viewMode === 'archetypes' ? archSortAsc : sortAsc) ? '↑' : '↓'}
            </button>
          </div>
        </div>

        {deckFiltersExpanded && (
          <div className="border-t border-white/5 pt-2 pb-3 px-4 space-y-2">
          <div className="flex flex-wrap gap-2 items-center">
            <ClassPicker value={classFilter} onChange={v => { setClassFilter(v); setArchetypeFilter('') }} excludeNeutral />

            {viewMode === 'archetypes' && (
              <>
                <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={hideNoDecks}
                    onChange={e => setHideNoDecks(e.target.checked)}
                    className="accent-gold"
                  />
                  Has Decks
                </label>
                <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={hideUnnamed}
                    onChange={e => setHideUnnamed(e.target.checked)}
                    className="accent-gold"
                  />
                  Named Only
                </label>
                <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={canBuildOnly}
                    onChange={e => setCanBuildOnly(e.target.checked)}
                    className="accent-gold"
                  />
                  Can Build
                </label>
              </>
            )}

            {viewMode === 'decks' && (
              <>
                <Dropdown
                  label="Archetype"
                  options={archetypeOptions}
                  value={archetypeFilter}
                  onChange={setArchetypeFilter}
                />
                <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={buildableOnly}
                    onChange={e => setBuildableOnly(e.target.checked)}
                    className="accent-gold"
                  />
                  Buildable
                </label>
                <div className="flex items-center gap-1.5 text-xs text-gray-400">
                  <DustIcon size={12} />
                  <span>Max:</span>
                  <input
                    type="range"
                    min={0}
                    max={50000}
                    step={100}
                    value={maxDust}
                    onChange={e => setMaxDust(Number(e.target.value))}
                    className="w-24 accent-gold"
                  />
                  <span className="text-gold w-12 text-right">{maxDust >= 50000 ? '∞' : maxDust.toLocaleString()}</span>
                </div>
              </>
            )}

            <div className="flex items-center gap-1.5 text-xs text-gray-400 ml-auto">
              <span>Min games:</span>
              <input
                type="number"
                value={minGamesInput}
                onChange={e => setMinGamesInput(e.target.value)}
                onBlur={handleApplyMinGames}
                onKeyDown={e => e.key === 'Enter' && handleApplyMinGames()}
                className="bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-gray-200 w-16 focus:outline-none focus:border-gold/50 text-center"
              />
            </div>
          </div>
          <CardInclusionFilter cardDb={cardDb} requiredCards={requiredCards} onChange={setRequiredCards} />
          </div>
        )}
      </div>

      <div className="px-4 py-1.5 bg-navy/50 border-b border-white/5 text-xs text-gray-400 flex justify-between">
        {viewMode === 'archetypes' ? (
          <span><span className="text-white font-medium">{filteredArchetypes.length}</span> archetypes</span>
        ) : (
          <span>Showing <span className="text-white font-medium">{filtered.length}</span> decks</span>
        )}
        {decksFetchedAt != null && decksFetchedAt > 0 && (
          <span>Updated {(() => {
            const mins = Math.floor((Date.now() - decksFetchedAt) / 60000)
            if (mins < 1) return 'just now'
            if (mins < 60) return `${mins}m ago`
            const hrs = Math.floor(mins / 60)
            if (hrs < 24) return `${hrs}h ago`
            return `${Math.floor(hrs / 24)}d ago`
          })()}</span>
        )}
      </div>

      <div className="flex-1 overflow-auto p-4">
        {viewMode === 'archetypes' ? (
          <>
            {filteredArchetypes.map(a => (
              <ArchetypeRow
                key={a.id}
                arch={a}
                expanded={expandedArchetype === a.id}
                onToggle={() => setExpandedArchetype(prev => prev === a.id ? null : a.id)}
                onViewDecks={() => handleViewDecks(a.id)}
                cardDb={cardDb}
                collection={collection}
                artVersion={artVersion}
                gameMode={deckGameMode}
                expansions={expansions}
                deckInfo={archetypeDeckInfo.get(a.id) ?? null}
                showDustValue={archSortBy === 'dustValue'}
              />
            ))}
            {filteredArchetypes.length === 0 && !decksLoading && (
              <div className="text-center text-gray-500 py-20">
                {deckArchetypes.length === 0
                  ? deckGameMode === 'wild'
                    ? 'No Wild data available. Fetching from HSGuru...'
                    : 'No deck data available. Make sure you have an active HSReplay session.'
                  : 'No archetypes match your current filters.'}
              </div>
            )}
          </>
        ) : (
          <>
            {filtered.map(d => (
              <DeckRow
                key={d.deck.deckId}
                deck={d}
                expanded={expandedDeck === d.deck.deckId}
                onToggle={() => setExpandedDeck(prev => prev === d.deck.deckId ? null : d.deck.deckId)}
                companionCards={companionCards}
                showDustValue={sortBy === 'dustValue'}
              />
            ))}
            {filtered.length === 0 && !decksLoading && (
              <div className="text-center text-gray-500 py-20">
                {deckList.length === 0
                  ? deckGameMode === 'wild'
                    ? 'No Wild deck data available.'
                    : 'No deck data available. Make sure you have an active HSReplay session.'
                  : 'No decks match your current filters.'}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
