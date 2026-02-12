import { useMemo, useState } from 'react'
import { useStore } from '../stores/store.ts'
import { RARITY_COLORS, RARITY_ORDER, DUST_DISENCHANT, DUST_DISENCHANT_GOLDEN, CLASS_COLORS } from '../types.ts'
import { DustIcon, RarityGem } from '../components/Icons.tsx'
import type { EnrichedCard, Rarity } from '../types.ts'
import CardHover from '../components/CardHover.tsx'
import ClassPicker, { ClassIcon, classLabel } from '../components/ClassPicker.tsx'
import RarityFilter from '../components/RarityFilter.tsx'
import { Dropdown } from '../components/FilterBar.tsx'

interface DisenchantCandidate {
  card: EnrichedCard
  variant: 'normal' | 'golden'
  count: number
  dustValue: number
  reason: string
  safety: number
  combinedPlayed: number
  combinedWinrate: number
  combinedDecks: number
  isExtra: boolean
}

type SortCol = 'name' | 'variant' | 'rarity' | 'dust' | 'played' | 'winrate' | 'safety'

function safetyColor(safety: number): string {
  if (safety >= 90) return 'text-green-400'
  if (safety >= 70) return 'text-lime-400'
  if (safety >= 50) return 'text-yellow-400'
  if (safety >= 30) return 'text-orange-400'
  return 'text-red-400'
}

export default function DisenchantAdvisorView() {
  const getEnrichedCards = useStore(s => s.getEnrichedCards)
  const cardsLoading = useStore(s => s.cardsLoading)
  const collection = useStore(s => s.collection)
  const expansions = useStore(s => s.expansions)
  const metaStandard = useStore(s => s.metaStandard)
  const metaWild = useStore(s => s.metaWild)
  const collectionMode = useStore(s => s.collectionMode)
  const variantConfirmed = useStore(s => s.variantConfirmed)

  const [selectedRarities, setSelectedRarities] = useState<Rarity[]>([])
  const [selectedClass, setSelectedClass] = useState('')
  const [selectedSet, setSelectedSet] = useState('')
  const [sortCol, setSortCol] = useState<SortCol>('safety')
  const [sortAsc, setSortAsc] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  const [playedThreshold, setPlayedThreshold] = useState(5)
  const [goldenKeepThreshold, setGoldenKeepThreshold] = useState(5)
  const [minSafety, setMinSafety] = useState(50)
  const [hideNoWinrate, setHideNoWinrate] = useState(true)

  const setOptions = useMemo(() => [
    { value: '', label: 'All Sets' },
    ...expansions.map(exp => ({
      value: exp.code,
      label: `${exp.name}${exp.standard ? ' (S)' : ''}`,
    })),
  ], [expansions])

  const { candidates, excludedNoStats, excludedNoWinrate } = useMemo(() => {
    const enriched = getEnrichedCards()
    const results: DisenchantCandidate[] = []
    let excluded = 0
    let excludedWr = 0

    for (const card of enriched) {
      if (!collection) continue
      const { normalCount, goldenCount, maxCopies, rarity } = card
      if (normalCount === 0 && goldenCount === 0) continue

      const deNormalAvail = Math.max(0, normalCount - (card.freeNormal ? 1 : 0))
      const deGoldenAvail = Math.max(0, goldenCount - (card.freeGolden ? 1 : 0))
      if (deNormalAvail === 0 && deGoldenAvail === 0) continue

      const stdEntry = metaStandard[card.dbfId]
      const wildEntry = metaWild[card.dbfId]
      const combinedPlayed = Math.max(stdEntry?.popularity ?? 0, wildEntry?.popularity ?? 0)
      const stdPop = stdEntry?.popularity ?? 0
      const wildPop = wildEntry?.popularity ?? 0
      const combinedWinrate = stdPop >= wildPop
        ? (stdEntry?.winrate ?? 0)
        : (wildEntry?.winrate ?? 0)
      const combinedDecks = Math.max(stdEntry?.decks ?? 0, wildEntry?.decks ?? 0)

      if (combinedPlayed === 0) {
        excluded++
        continue
      }

      const hasWinrate = combinedDecks >= 100 && combinedWinrate > 0
      if (hideNoWinrate && !hasWinrate) {
        excludedWr++
        continue
      }

      const usable = normalCount + goldenCount
      const extras = usable - maxCopies
      const isMeta = combinedPlayed >= goldenKeepThreshold

      if (extras > 0) {
        let deNormal: number, deGolden: number

        if (isMeta) {
          deNormal = Math.min(extras, deNormalAvail)
          deGolden = 0
        } else {
          deGolden = Math.min(extras, deGoldenAvail)
          deNormal = Math.min(extras - deGolden, deNormalAvail)
        }

        if (deNormal > 0) {
          const hasGoldenUpgrade = goldenCount > 0
          results.push({
            card,
            variant: 'normal',
            count: deNormal,
            dustValue: DUST_DISENCHANT[rarity] * deNormal,
            reason: hasGoldenUpgrade ? 'Golden upgrade' : 'Extra copy',
            safety: 100,
            combinedPlayed,
            combinedWinrate,
            combinedDecks,
            isExtra: true,
          })
        }

        if (deGolden > 0) {
          results.push({
            card,
            variant: 'golden',
            count: deGolden,
            dustValue: DUST_DISENCHANT_GOLDEN[rarity] * deGolden,
            reason: 'Golden redundant',
            safety: 100,
            combinedPlayed,
            combinedWinrate,
            combinedDecks,
            isExtra: true,
          })
        }
      }

      if (extras <= 0 && combinedPlayed < playedThreshold) {
        const safety = Math.round(100 * (1 - combinedPlayed / playedThreshold))
        const clampedSafety = Math.max(0, Math.min(99, safety))
        const reason = combinedPlayed === 0 ? 'Never played' : `Rarely played (${combinedPlayed.toFixed(2)}%)`

        if (deNormalAvail > 0 && deGoldenAvail > 0) {
          if (isMeta) {
            results.push({
              card,
              variant: 'normal',
              count: deNormalAvail,
              dustValue: DUST_DISENCHANT[rarity] * deNormalAvail,
              reason: reason + ' — keep golden',
              safety: clampedSafety,
              combinedPlayed,
              combinedWinrate,
              combinedDecks,
              isExtra: false,
            })
          } else {
            results.push({
              card,
              variant: 'golden',
              count: deGoldenAvail,
              dustValue: DUST_DISENCHANT_GOLDEN[rarity] * deGoldenAvail,
              reason: reason + ' — max dust',
              safety: clampedSafety,
              combinedPlayed,
              combinedWinrate,
              combinedDecks,
              isExtra: false,
            })
            results.push({
              card,
              variant: 'normal',
              count: deNormalAvail,
              dustValue: DUST_DISENCHANT[rarity] * deNormalAvail,
              reason,
              safety: clampedSafety,
              combinedPlayed,
              combinedWinrate,
              combinedDecks,
              isExtra: false,
            })
          }
        } else {
          if (deNormalAvail > 0) {
            results.push({
              card,
              variant: 'normal',
              count: deNormalAvail,
              dustValue: DUST_DISENCHANT[rarity] * deNormalAvail,
              reason,
              safety: clampedSafety,
              combinedPlayed,
              combinedWinrate,
              combinedDecks,
              isExtra: false,
            })
          }

          if (deGoldenAvail > 0) {
            results.push({
              card,
              variant: 'golden',
              count: deGoldenAvail,
              dustValue: DUST_DISENCHANT_GOLDEN[rarity] * deGoldenAvail,
              reason,
              safety: clampedSafety,
              combinedPlayed,
              combinedWinrate,
              combinedDecks,
              isExtra: false,
            })
          }
        }
      }
    }

    return { candidates: results, excludedNoStats: excluded, excludedNoWinrate: excludedWr }
  }, [getEnrichedCards, collection, expansions, metaStandard, metaWild, playedThreshold, goldenKeepThreshold, hideNoWinrate, collectionMode, variantConfirmed])

  const filtered = useMemo(() => {
    let items = candidates.filter(c => c.safety >= minSafety)

    if (selectedRarities.length > 0) {
      const rarities = new Set(selectedRarities)
      items = items.filter(c => rarities.has(c.card.rarity))
    }

    if (selectedClass) {
      items = items.filter(c => c.card.cardClass === selectedClass)
    }

    if (selectedSet) {
      items = items.filter(c => c.card.set === selectedSet)
    }

    const dir = sortAsc ? 1 : -1
    items.sort((a, b) => {
      switch (sortCol) {
        case 'name':
          return dir * a.card.name.localeCompare(b.card.name)
        case 'variant':
          return dir * a.variant.localeCompare(b.variant) || b.dustValue - a.dustValue
        case 'rarity':
          return dir * (RARITY_ORDER[a.card.rarity] - RARITY_ORDER[b.card.rarity]) || b.dustValue - a.dustValue
        case 'dust':
          return dir * (a.dustValue - b.dustValue) || a.card.name.localeCompare(b.card.name)
        case 'played':
          return dir * (a.combinedPlayed - b.combinedPlayed) || b.dustValue - a.dustValue
        case 'winrate':
          return dir * (a.combinedWinrate - b.combinedWinrate) || b.dustValue - a.dustValue
        case 'safety':
          return dir * (a.safety - b.safety) || b.dustValue - a.dustValue
        default:
          return 0
      }
    })

    return items
  }, [candidates, minSafety, selectedRarities, selectedClass, selectedSet, sortCol, sortAsc])

  const summary = useMemo(() => {
    const totalDust = filtered.reduce((s, c) => s + c.dustValue, 0)
    const extraCount = filtered.filter(c => c.isExtra).length
    const unplayedCount = filtered.filter(c => !c.isExtra).length
    return { totalDust, total: filtered.length, extraCount, unplayedCount }
  }, [filtered])

  function handleSortClick(col: SortCol) {
    if (sortCol === col) setSortAsc(!sortAsc)
    else { setSortCol(col); setSortAsc(col === 'safety' ? false : true) }
  }

  const sortIndicator = (col: SortCol) =>
    sortCol === col ? (sortAsc ? ' \u2191' : ' \u2193') : ''

  if (cardsLoading) {
    return <div className="p-8 text-gray-400">Loading...</div>
  }

  return (
    <div className="p-6 max-w-6xl">
      <h1 className="text-xl font-bold text-gold mb-6">Disenchant</h1>

      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <RarityFilter selected={selectedRarities} onChange={setSelectedRarities} />

        <Dropdown
          label="Set"
          options={setOptions}
          value={selectedSet}
          onChange={setSelectedSet}
        />

        <ClassPicker value={selectedClass} onChange={setSelectedClass} />

        <button
          onClick={() => setShowSettings(!showSettings)}
          className={`px-3 py-1.5 rounded text-xs border transition-colors ${
            showSettings
              ? 'bg-gold/20 text-gold border-gold/30'
              : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10'
          }`}
        >
          Thresholds
        </button>

        <button
          onClick={() => setHideNoWinrate(!hideNoWinrate)}
          className={`px-3 py-1.5 rounded text-xs border transition-colors ${
            hideNoWinrate
              ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
              : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10'
          }`}
        >
          Hide No WR
        </button>

        <span className="text-xs text-gray-500 ml-auto">
          {filtered.length} disenchant candidates
        </span>
      </div>

      {showSettings && (
        <div className="bg-white/5 rounded-lg border border-white/10 p-4 mb-4 grid grid-cols-3 gap-6">
          <div>
            <label className="block text-xs text-gray-400 mb-1">
              Max played % (hide above)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0.5}
                max={10}
                step={0.5}
                value={playedThreshold}
                onChange={e => setPlayedThreshold(parseFloat(e.target.value))}
                className="flex-1 accent-gold"
              />
              <span className="text-sm text-white w-12 text-right">{playedThreshold}%</span>
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">
              DE golden played below
            </label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0.01}
                max={20}
                step={0.01}
                value={goldenKeepThreshold}
                onChange={e => setGoldenKeepThreshold(parseFloat(e.target.value))}
                className="flex-1 accent-gold"
              />
              <span className="text-sm text-white w-14 text-right">{goldenKeepThreshold.toFixed(2)}%</span>
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">
              Min safety % to show
            </label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={100}
                step={10}
                value={minSafety}
                onChange={e => setMinSafety(parseInt(e.target.value))}
                className="flex-1 accent-gold"
              />
              <span className="text-sm text-white w-12 text-right">{minSafety}%</span>
            </div>
          </div>
        </div>
      )}

      {summary.total > 0 && (
        <div className="bg-navy-light rounded-lg border border-gold/20 p-4 mb-4">
          <h3 className="text-gold font-bold text-sm mb-1 flex items-center gap-1.5">
            <DustIcon size={16} />
            {summary.totalDust.toLocaleString()} dust available from {summary.total} cards
          </h3>
          <p className="text-xs text-gray-400">
            {summary.extraCount} extra copies &middot; {summary.unplayedCount} unplayed cards
          </p>
        </div>
      )}

      <div className="bg-white/5 rounded-lg border border-white/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-gray-400 text-xs select-none">
              <th className="text-left px-4 py-3 w-8"></th>
              <th
                className="text-left px-4 py-3 cursor-pointer hover:text-white"
                onClick={() => handleSortClick('name')}
              >
                Card{sortIndicator('name')}
              </th>
              <th
                className="text-left px-4 py-3 cursor-pointer hover:text-white"
                onClick={() => handleSortClick('variant')}
              >
                Variant{sortIndicator('variant')}
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
                DE Value{sortIndicator('dust')}
              </th>
              <th
                className="text-right px-4 py-3 cursor-pointer hover:text-white"
                onClick={() => handleSortClick('played')}
              >
                Played{sortIndicator('played')}
              </th>
              <th
                className="text-right px-4 py-3 cursor-pointer hover:text-white"
                onClick={() => handleSortClick('winrate')}
              >
                WR{sortIndicator('winrate')}
              </th>
              <th
                className="text-right px-4 py-3 cursor-pointer hover:text-white"
                onClick={() => handleSortClick('safety')}
              >
                Safety{sortIndicator('safety')}
              </th>
              <th className="text-left px-4 py-3">Reason</th>
              <th className="text-left px-4 py-3">Class</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 300).map((c, i) => (
              <tr key={`${c.card.dbfId}-${c.variant}-${i}`} className="border-b border-white/5 hover:bg-white/5">
                <td className="px-4 py-2">
                  <RarityGem size={14} rarity={c.card.rarity} />
                </td>
                <td className="px-4 py-2 text-white">
                  <CardHover id={c.card.id} name={c.card.name} className="text-white" />
                  {c.count > 1 && <span className="text-gray-500 ml-1">x{c.count}</span>}
                </td>
                <td className="px-4 py-2">
                  <span className={c.variant === 'golden' ? 'text-yellow-300' : 'text-gray-400'}>
                    {c.variant === 'golden' ? 'Golden' : 'Normal'}
                  </span>
                </td>
                <td className="px-4 py-2" style={{ color: RARITY_COLORS[c.card.rarity] }}>
                  {c.card.rarity[0] + c.card.rarity.slice(1).toLowerCase()}
                </td>
                <td className="px-4 py-2 text-right text-mana font-medium">
                  {c.dustValue.toLocaleString()}
                </td>
                <td className="px-4 py-2 text-right text-green-400 text-xs">
                  {c.combinedPlayed > 0 ? `${c.combinedPlayed.toFixed(2)}%` : '-'}
                </td>
                <td className="px-4 py-2 text-right text-amber-400 text-xs">
                  {c.combinedDecks >= 100 && c.combinedWinrate > 0 ? `${c.combinedWinrate.toFixed(2)}%` : '-'}
                </td>
                <td className={`px-4 py-2 text-right font-medium ${safetyColor(c.safety)}`}>
                  {c.safety}%
                </td>
                <td className="px-4 py-2 text-xs text-gray-400">
                  {c.reason}
                </td>
                <td className="px-4 py-2 text-xs">
                  <span className="flex items-center gap-1" style={{ color: CLASS_COLORS[c.card.cardClass] ?? '#808080' }}>
                    <ClassIcon cls={c.card.cardClass} size={12} />
                    {classLabel(c.card.cardClass)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="px-4 py-8 text-center text-gray-500">
            No disenchant candidates found with current filters.
          </div>
        )}
        {filtered.length > 300 && (
          <div className="px-4 py-3 text-xs text-gray-500 border-t border-white/5">
            Showing first 300 of {filtered.length} candidates
          </div>
        )}
      </div>

      {(excludedNoStats > 0 || excludedNoWinrate > 0) && (
        <p className="text-xs text-gray-600 mt-3">
          {[
            excludedNoStats > 0 && `${excludedNoStats} missing play rate`,
            excludedNoWinrate > 0 && `${excludedNoWinrate} missing winrate`,
          ].filter(Boolean).join(', ')} — excluded from results.
        </p>
      )}
    </div>
  )
}
