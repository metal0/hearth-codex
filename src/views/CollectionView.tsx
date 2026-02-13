import { type ReactNode, useMemo, useState } from 'react'
import { useStore } from '../stores/store.ts'
import FilterBar from '../components/FilterBar.tsx'
import CardGrid from '../components/CardGrid.tsx'
import CardModal from '../components/CardModal.tsx'
import CollectionHeatmap from '../components/CollectionHeatmap.tsx'
import { RARITY_COLORS, CLASS_COLORS, DUST_COST, HS_CLASSES } from '../types.ts'
import { DustIcon, RarityGem } from '../components/Icons.tsx'
import type { Rarity, EnrichedCard, SortOption } from '../types.ts'

interface CardGroup {
  key: string
  label: ReactNode
  cards: EnrichedCard[]
}

const CLASS_DISPLAY: Record<string, string> = {
  DEATHKNIGHT: 'Death Knight',
  DEMONHUNTER: 'Demon Hunter',
  DRUID: 'Druid',
  HUNTER: 'Hunter',
  MAGE: 'Mage',
  PALADIN: 'Paladin',
  PRIEST: 'Priest',
  ROGUE: 'Rogue',
  SHAMAN: 'Shaman',
  WARLOCK: 'Warlock',
  WARRIOR: 'Warrior',
  NEUTRAL: 'Neutral',
}

function groupCards(cards: EnrichedCard[], sortBy: SortOption, expansions: { code: string; name: string }[]): CardGroup[] {
  switch (sortBy) {
    case 'rarity': {
      const order: Rarity[] = ['LEGENDARY', 'EPIC', 'RARE', 'COMMON']
      const map = new Map<Rarity, EnrichedCard[]>()
      for (const r of order) map.set(r, [])
      for (const c of cards) map.get(c.rarity)!.push(c)
      return order
        .filter(r => map.get(r)!.length > 0)
        .map(r => ({
          key: r,
          label: (
            <span className="flex items-center gap-2" style={{ color: RARITY_COLORS[r] }}>
              <RarityGem size={14} rarity={r} />
              {r} ({map.get(r)!.length})
            </span>
          ),
          cards: map.get(r)!,
        }))
    }
    case 'cost': {
      const map = new Map<number, EnrichedCard[]>()
      for (const c of cards) {
        const bucket = Math.min(c.cost, 10)
        if (!map.has(bucket)) map.set(bucket, [])
        map.get(bucket)!.push(c)
      }
      return [...map.entries()]
        .sort(([a], [b]) => a - b)
        .map(([cost, group]) => ({
          key: `cost-${cost}`,
          label: (
            <span className="flex items-center gap-2 text-mana">
              {cost >= 10 ? '10+' : cost} Mana ({group.length})
            </span>
          ),
          cards: group,
        }))
    }
    case 'class': {
      const classOrder = HS_CLASSES.filter(c => c !== 'NEUTRAL')
      const order = [...classOrder, 'NEUTRAL']
      const map = new Map<string, EnrichedCard[]>()
      for (const c of cards) {
        if (!map.has(c.cardClass)) map.set(c.cardClass, [])
        map.get(c.cardClass)!.push(c)
      }
      return order
        .filter(cls => map.has(cls) && map.get(cls)!.length > 0)
        .map(cls => ({
          key: cls,
          label: (
            <span className="flex items-center gap-2" style={{ color: CLASS_COLORS[cls] ?? '#808080' }}>
              {CLASS_DISPLAY[cls] ?? cls} ({map.get(cls)!.length})
            </span>
          ),
          cards: map.get(cls)!,
        }))
    }
    case 'set': {
      const expNameMap = new Map(expansions.map(e => [e.code, e.name]))
      const map = new Map<string, EnrichedCard[]>()
      const seen: string[] = []
      for (const c of cards) {
        if (!map.has(c.set)) { map.set(c.set, []); seen.push(c.set) }
        map.get(c.set)!.push(c)
      }
      return seen
        .filter(code => map.get(code)!.length > 0)
        .map(code => ({
          key: code,
          label: (
            <span className="text-gold">
              {expNameMap.get(code) ?? code} ({map.get(code)!.length})
            </span>
          ),
          cards: map.get(code)!,
        }))
    }
    case 'name': {
      const map = new Map<string, EnrichedCard[]>()
      const seen: string[] = []
      for (const c of cards) {
        const letter = (c.name[0] ?? '?').toUpperCase()
        if (!map.has(letter)) { map.set(letter, []); seen.push(letter) }
        map.get(letter)!.push(c)
      }
      return seen.map(letter => ({
        key: letter,
        label: <span className="text-gray-300">{letter} ({map.get(letter)!.length})</span>,
        cards: map.get(letter)!,
      }))
    }
    default:
      return cards.length > 0
        ? [{ key: 'all', label: <span className="text-gray-300">All Cards ({cards.length})</span>, cards }]
        : []
  }
}

export default function CollectionView() {
  const getFilteredCards = useStore(s => s.getFilteredCards)
  const cardsLoading = useStore(s => s.cardsLoading)
  const collectionLoading = useStore(s => s.collectionLoading)

  const [selectedCard, setSelectedCard] = useState<EnrichedCard | null>(null)
  const [showHeatmap, setShowHeatmap] = useState(false)
  const cards = useStore(s => s.cards)
  const collection = useStore(s => s.collection)
  const metaStandard = useStore(s => s.metaStandard)
  const metaWild = useStore(s => s.metaWild)
  const expansions = useStore(s => s.expansions)
  const selectedSets = useStore(s => s.selectedSets)
  const selectedClasses = useStore(s => s.selectedClasses)
  const selectedRarities = useStore(s => s.selectedRarities)
  const ownershipFilter = useStore(s => s.ownershipFilter)
  const formatFilter = useStore(s => s.formatFilter)
  const searchText = useStore(s => s.searchText)
  const sortBy = useStore(s => s.sortBy)
  const sortAsc = useStore(s => s.sortAsc)
  const collectionMode = useStore(s => s.collectionMode)

  const obtainabilityFilter = useStore(s => s.obtainabilityFilter)

  const filteredCards = useMemo(() => getFilteredCards(), [
    getFilteredCards, cards, collection, metaStandard, metaWild, expansions,
    selectedSets, selectedClasses, selectedRarities,
    ownershipFilter, obtainabilityFilter, formatFilter, searchText, sortBy, sortAsc,
    collectionMode,
  ])

  const groups = useMemo(
    () => groupCards(filteredCards, sortBy, expansions),
    [filteredCards, sortBy, expansions],
  )

  const stats = useMemo(() => {
    let totalCards = 0
    let ownedCards = 0
    let missingDust = 0
    for (const card of filteredCards) {
      totalCards += card.maxCopies
      ownedCards += card.totalOwned
      const missing = card.maxCopies - card.totalOwned
      if (missing > 0) missingDust += DUST_COST[card.rarity] * missing
    }
    return { totalCards, ownedCards, missingDust }
  }, [filteredCards])

  if (cardsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-400 text-lg">Loading card database...</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <FilterBar />

      <div className="px-4 py-2 bg-navy/50 border-b border-white/5 flex gap-6 text-xs text-gray-400">
        <span>
          Showing <span className="text-white font-medium">{filteredCards.length}</span> cards
        </span>
        {!collectionLoading && (
          <>
            <span>
              Owned: <span className="text-green-400 font-medium">{stats.ownedCards}</span>
              /{stats.totalCards}
              <span className="ml-1 text-gray-500">
                ({stats.totalCards > 0 ? (stats.ownedCards / stats.totalCards * 100).toFixed(2) : '0.00'}%)
              </span>
            </span>
            {collectionMode !== 'signature' && collectionMode !== 'diamond' && (
              <span className="flex items-center gap-1">
                <DustIcon size={12} />
                Missing: <span className="text-mana font-medium">{stats.missingDust.toLocaleString()}</span>
              </span>
            )}
          </>
        )}
        <button
          onClick={() => setShowHeatmap(h => !h)}
          className={`ml-auto flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium border transition-colors ${
            showHeatmap
              ? 'bg-gold/15 text-gold border-gold/30'
              : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10 hover:text-gray-300'
          }`}
        >
          <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor" className="opacity-70">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
          Heatmap
        </button>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {showHeatmap && <div className="mb-4"><CollectionHeatmap /></div>}
        {groups.map(group => (
          <section key={group.key} className="mb-8">
            <h2 className="text-sm font-bold mb-3 uppercase tracking-wider">
              {group.label}
            </h2>
            <CardGrid cards={group.cards} onCardClick={setSelectedCard} />
          </section>
        ))}

        {filteredCards.length === 0 && (
          <div className="text-center text-gray-500 py-20">
            No cards match your current filters.
          </div>
        )}
      </div>

      {selectedCard && (
        <CardModal card={selectedCard} onClose={() => setSelectedCard(null)} />
      )}
    </div>
  )
}
