import { useMemo, useState } from 'react'
import { useStore } from '../stores/store.ts'
import { RARITY_COLORS, DUST_COST, RARITY_ORDER, CLASS_COLORS } from '../types.ts'
import { DustIcon, RarityGem, StandardIcon, WildIcon } from '../components/Icons.tsx'
import type { EnrichedCard, Rarity } from '../types.ts'
import CardHover from '../components/CardHover.tsx'
import CollectionModeToggle from '../components/CollectionModeToggle.tsx'
import ClassPicker, { ClassIcon, classLabel } from '../components/ClassPicker.tsx'
import RarityFilter from '../components/RarityFilter.tsx'

export default function CraftAdvisorView() {
  const getEnrichedCards = useStore(s => s.getEnrichedCards)
  const collection = useStore(s => s.collection)
  const expansions = useStore(s => s.expansions)
  const cardsLoading = useStore(s => s.cardsLoading)
  const collectionMode = useStore(s => s.collectionMode)
  const storeSetFormatFilter = useStore(s => s.setFormatFilter)
  const variantConfirmed = useStore(s => s.variantConfirmed)
  const craftQueue = useStore(s => s.craftQueue)
  const addToQueue = useStore(s => s.addToQueue)
  const removeFromQueue = useStore(s => s.removeFromQueue)
  const clearQueue = useStore(s => s.clearQueue)

  const [formatFilter, setFormatFilterLocal] = useState<'standard' | 'wild'>('standard')
  const setFormatFilter = (f: 'standard' | 'wild') => { setFormatFilterLocal(f); storeSetFormatFilter(f) }
  const [selectedSet, setSelectedSet] = useState('')
  const [selectedRarities, setSelectedRarities] = useState<Rarity[]>([])
  const [selectedClass, setSelectedClass] = useState('')
  const [onlyAffordable, setOnlyAffordable] = useState(false)
  const [sortCol, setSortCol] = useState<'rarity' | 'dust' | 'name' | 'set' | 'inclusion' | 'winrate'>('inclusion')
  const [sortAsc, setSortAsc] = useState(false)
  const [showQueue, setShowQueue] = useState(true)
  const [confirmClear, setConfirmClear] = useState(false)

  const dust = collection?.dust ?? 0

  const missingCards = useMemo(() => {
    const all = getEnrichedCards()
    const standardCodes = new Set(expansions.filter(e => e.standard).map(e => e.code))

    let cards = all.filter(c => c.totalOwned < c.maxCopies && !c.freeNormal)

    if (formatFilter === 'standard') {
      cards = cards.filter(c => standardCodes.has(c.set))
    }

    if (selectedSet) {
      cards = cards.filter(c => c.set === selectedSet)
    }

    if (selectedRarities.length > 0) {
      const rarities = new Set(selectedRarities)
      cards = cards.filter(c => rarities.has(c.rarity))
    }

    if (selectedClass) {
      cards = cards.filter(c => c.cardClass === selectedClass)
    }

    if (onlyAffordable) {
      cards = cards.filter(c => {
        const missing = c.maxCopies - c.totalOwned
        return DUST_COST[c.rarity] * missing <= dust
      })
    }

    const dir = sortAsc ? 1 : -1
    cards.sort((a, b) => {
      switch (sortCol) {
        case 'rarity':
          return dir * (RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity])
            || DUST_COST[b.rarity] - DUST_COST[a.rarity]
        case 'dust':
          return dir * (DUST_COST[a.rarity] - DUST_COST[b.rarity])
        case 'name':
          return dir * a.name.localeCompare(b.name)
        case 'set':
          return dir * a.set.localeCompare(b.set)
        case 'inclusion': {
          const aInc = a.inclusionRate > 0
          const bInc = b.inclusionRate > 0
          if (aInc !== bInc) return aInc ? -1 : 1
          return dir * (a.inclusionRate - b.inclusionRate) || a.name.localeCompare(b.name)
        }
        case 'winrate': {
          const aHasWr = a.decks >= 100 && a.winrate > 0
          const bHasWr = b.decks >= 100 && b.winrate > 0
          if (aHasWr !== bHasWr) return aHasWr ? -1 : 1
          return dir * (a.winrate - b.winrate) || a.name.localeCompare(b.name)
        }
        default:
          return 0
      }
    })

    return cards
  }, [getEnrichedCards, expansions, formatFilter, selectedSet, selectedRarities, selectedClass, onlyAffordable, dust, sortCol, sortAsc, collectionMode, variantConfirmed])

  const craftPlan = useMemo(() => {
    if (!onlyAffordable) return null
    const plan: EnrichedCard[] = []
    let remaining = dust
    const sorted = [...missingCards].sort((a, b) => {
      if (b.inclusionRate !== a.inclusionRate) return b.inclusionRate - a.inclusionRate
      return RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity]
    })
    for (const card of sorted) {
      const cost = DUST_COST[card.rarity] * (card.maxCopies - card.totalOwned)
      if (cost <= remaining) {
        plan.push(card)
        remaining -= cost
      }
    }
    return { cards: plan, totalDust: dust - remaining, remaining }
  }, [missingCards, dust, onlyAffordable])

  const queuedCards = useMemo(() => {
    if (craftQueue.length === 0) return []
    const all = getEnrichedCards()
    const byId = new Map(all.map(c => [c.dbfId, c]))
    return craftQueue
      .map(id => byId.get(id))
      .filter((c): c is EnrichedCard => c != null && c.totalOwned < c.maxCopies)
  }, [craftQueue, getEnrichedCards, collectionMode, variantConfirmed])

  const queueDust = useMemo(() => {
    let total = 0
    for (const c of queuedCards) {
      total += DUST_COST[c.rarity] * (c.maxCopies - c.totalOwned)
    }
    return total
  }, [queuedCards])

  const queueSet = useMemo(() => new Set(craftQueue), [craftQueue])

  function handleSortClick(col: typeof sortCol) {
    if (sortCol === col) setSortAsc(!sortAsc)
    else { setSortCol(col); setSortAsc(false) }
  }

  const sortIndicator = (col: typeof sortCol) =>
    sortCol === col ? (sortAsc ? ' ^' : ' v') : ''

  if (cardsLoading) {
    return <div className="p-8 text-gray-400">Loading...</div>
  }

  return (
    <div className="p-6 max-w-6xl">
      <h1 className="text-xl font-bold text-gold mb-6">Crafting</h1>

      {/* Queue Panel */}
      {craftQueue.length > 0 && (
        <div className="bg-white/5 rounded-lg border border-gold/20 mb-4 overflow-hidden">
          <button
            onClick={() => setShowQueue(!showQueue)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5"
          >
            <span className="flex items-center gap-2 text-sm font-bold text-gold">
              <DustIcon size={16} />
              Craft Queue ({queuedCards.length})
              <span className="font-normal text-mana">{queueDust.toLocaleString()} dust</span>
            </span>
            <span className="flex items-center gap-3 text-xs text-gray-400">
              {dust >= queueDust ? (
                <span className="text-green-400">{(dust - queueDust).toLocaleString()} remaining</span>
              ) : (
                <span className="text-red-400">{(queueDust - dust).toLocaleString()} short</span>
              )}
              <span className="text-gray-600">{showQueue ? '\u25B2' : '\u25BC'}</span>
            </span>
          </button>

          {showQueue && (
            <div className="border-t border-white/5">
              <table className="w-full text-xs">
                <tbody>
                  {queuedCards.map(card => (
                    <tr key={card.dbfId} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                      <td className="px-4 py-1.5 w-6">
                        <RarityGem size={12} rarity={card.rarity} />
                      </td>
                      <td className="px-2 py-1.5 text-white">
                        <CardHover id={card.id} name={card.name} className="text-white" />
                      </td>
                      <td className="px-2 py-1.5 text-gray-500" style={{ color: RARITY_COLORS[card.rarity] }}>
                        {card.rarity[0] + card.rarity.slice(1).toLowerCase()}
                      </td>
                      <td className="px-2 py-1.5 text-right text-mana">
                        {DUST_COST[card.rarity] * (card.maxCopies - card.totalOwned)}
                      </td>
                      <td className="px-2 py-1.5 text-right text-green-400">
                        {card.inclusionRate > 0 ? `${card.inclusionRate.toFixed(1)}%` : '-'}
                      </td>
                      <td className="px-2 py-1.5 w-8 text-center">
                        <button
                          onClick={() => removeFromQueue(card.dbfId)}
                          className="text-red-400/60 hover:text-red-400 text-sm leading-none"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-4 py-2 border-t border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-gray-400">
                    Total: <span className="text-mana font-medium">{queueDust.toLocaleString()}</span> dust
                  </span>
                  <span className="text-gray-600">|</span>
                  <span className="text-gray-400">
                    Available: <span className="text-white font-medium">{dust.toLocaleString()}</span>
                  </span>
                </div>
                {confirmClear ? (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-red-400">Clear all?</span>
                    <button
                      onClick={() => { clearQueue(); setConfirmClear(false) }}
                      className="text-[10px] px-2 py-0.5 bg-red-600/30 text-red-400 border border-red-600/30 rounded hover:bg-red-600/40"
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => setConfirmClear(false)}
                      className="text-[10px] px-2 py-0.5 bg-white/5 text-gray-400 border border-white/10 rounded hover:bg-white/10"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmClear(true)}
                    className="text-[10px] text-gray-500 hover:text-gray-300"
                  >
                    Clear Queue
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <div className="flex rounded overflow-hidden border border-white/10">
          <button
            onClick={() => setFormatFilter('standard')}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm ${formatFilter === 'standard' ? 'bg-gold/20 text-gold' : 'bg-white/5 text-gray-400'}`}
          >
            <StandardIcon size={12} />
            Standard
          </button>
          <button
            onClick={() => setFormatFilter('wild')}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm ${formatFilter === 'wild' ? 'bg-gold/20 text-gold' : 'bg-white/5 text-gray-400'}`}
          >
            <WildIcon size={12} />
            Wild
          </button>
        </div>

        <CollectionModeToggle modes={['normal', 'golden']} />

        <RarityFilter selected={selectedRarities} onChange={setSelectedRarities} />

        <select
          value={selectedSet}
          onChange={e => setSelectedSet(e.target.value)}
          className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-gray-300"
        >
          <option value="">All Sets</option>
          {expansions.map(exp => (
            <option key={exp.code} value={exp.code}>
              {exp.name}{exp.standard ? ' (S)' : ''}
            </option>
          ))}
        </select>

        <ClassPicker
          value={selectedClass}
          onChange={setSelectedClass}
        />

        <button
          onClick={() => setOnlyAffordable(!onlyAffordable)}
          className={`px-4 py-2 rounded text-sm border transition-colors flex items-center gap-1.5 ${
            onlyAffordable
              ? 'bg-mana/20 text-mana border-mana/30'
              : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10'
          }`}
        >
          <DustIcon size={14} />
          Craftable Now ({dust.toLocaleString()})
        </button>

        <span className="text-xs text-gray-500 ml-auto">
          {missingCards.length} missing cards
        </span>
      </div>

      {/* Craft plan summary */}
      {craftPlan && craftPlan.cards.length > 0 && (
        <div className="bg-navy-light rounded-lg border border-mana/20 p-4 mb-4">
          <h3 className="text-mana font-bold text-sm mb-1 flex items-center gap-1.5">
            <DustIcon size={16} />
            Craft Plan: {craftPlan.cards.length} cards for {craftPlan.totalDust.toLocaleString()} dust
          </h3>
          <p className="text-xs text-gray-400">
            {craftPlan.remaining.toLocaleString()} dust remaining after crafting
          </p>
        </div>
      )}

      {/* Table */}
      <div className="bg-white/5 rounded-lg border border-white/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-gray-400 text-xs select-none">
              <th className="text-left px-4 py-3 w-12"></th>
              <th
                className="text-left px-4 py-3 cursor-pointer hover:text-white"
                onClick={() => handleSortClick('name')}
              >
                Card{sortIndicator('name')}
              </th>
              <th
                className="text-left px-4 py-3 cursor-pointer hover:text-white"
                onClick={() => handleSortClick('rarity')}
              >
                Rarity{sortIndicator('rarity')}
              </th>
              <th
                className="text-right px-4 py-3 cursor-pointer hover:text-white"
                onClick={() => handleSortClick('dust')}
              >
                Dust{sortIndicator('dust')}
              </th>
              <th
                className="text-left px-4 py-3 cursor-pointer hover:text-white"
                onClick={() => handleSortClick('set')}
              >
                Set{sortIndicator('set')}
              </th>
              <th
                className="text-right px-4 py-3 cursor-pointer hover:text-white"
                onClick={() => handleSortClick('inclusion')}
              >
                Played{sortIndicator('inclusion')}
              </th>
              <th
                className="text-right px-4 py-3 cursor-pointer hover:text-white"
                onClick={() => handleSortClick('winrate')}
              >
                WR{sortIndicator('winrate')}
              </th>
              <th className="text-left px-4 py-3">Class</th>
              <th className="text-center px-4 py-3">Have</th>
              <th className="w-10 px-2 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {missingCards.slice(0, 200).map(card => {
              const queued = queueSet.has(card.dbfId)
              return (
                <tr key={card.dbfId} className="border-b border-white/5 hover:bg-white/5">
                  <td className="px-4 py-2">
                    <RarityGem size={14} rarity={card.rarity} />
                  </td>
                  <td className="px-4 py-2 text-white">
                    <CardHover id={card.id} name={card.name} className="text-white" />
                  </td>
                  <td className="px-4 py-2" style={{ color: RARITY_COLORS[card.rarity] }}>
                    {card.rarity[0] + card.rarity.slice(1).toLowerCase()}
                  </td>
                  <td className="px-4 py-2 text-right text-mana">
                    {DUST_COST[card.rarity] * (card.maxCopies - card.totalOwned)}
                  </td>
                  <td className="px-4 py-2 text-gray-400 text-xs">
                    {expansions.find(e => e.code === card.set)?.name ?? card.set}
                  </td>
                  <td className="px-4 py-2 text-right text-green-400 text-xs">
                    {card.inclusionRate > 0 ? `${card.inclusionRate.toFixed(2)}%` : '-'}
                  </td>
                  <td className="px-4 py-2 text-right text-amber-400 text-xs">
                    {card.decks >= 100 && card.winrate > 0 ? `${card.winrate.toFixed(2)}%` : '-'}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    <span className="flex items-center gap-1" style={{ color: CLASS_COLORS[card.cardClass] ?? '#808080' }}>
                      <ClassIcon cls={card.cardClass} size={12} />
                      {classLabel(card.cardClass)}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-center text-gray-400">
                    {card.totalOwned}/{card.maxCopies}
                  </td>
                  <td className="px-2 py-2 text-center">
                    <button
                      onClick={() => queued ? removeFromQueue(card.dbfId) : addToQueue(card.dbfId)}
                      className={`w-6 h-6 rounded text-xs leading-none transition-colors ${
                        queued
                          ? 'bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/30'
                          : 'bg-white/5 text-gray-500 border border-white/10 hover:bg-gold/20 hover:text-gold hover:border-gold/30'
                      }`}
                      title={queued ? 'Remove from queue' : 'Add to queue'}
                    >
                      {queued ? '\u2713' : '+'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {missingCards.length > 200 && (
          <div className="px-4 py-3 text-xs text-gray-500 border-t border-white/5">
            Showing first 200 of {missingCards.length} cards
          </div>
        )}
      </div>
    </div>
  )
}
