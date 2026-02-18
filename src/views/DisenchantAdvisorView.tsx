import { useMemo, useState } from 'react'
import { useStore } from '../stores/store.ts'
import { DUST_DISENCHANT, DUST_DISENCHANT_GOLDEN, CLASS_COLORS, bracketLabel } from '../types.ts'
import { DustIcon } from '../components/Icons.tsx'
import { rarityBleedStyle } from '../components/CardCircle.tsx'
import type { EnrichedCard, Rarity } from '../types.ts'
import CardHover from '../components/CardHover.tsx'
import ClassPicker, { ClassIcon, classLabel } from '../components/ClassPicker.tsx'
import RarityFilter from '../components/RarityFilter.tsx'
import { Dropdown } from '../components/FilterBar.tsx'
import AdvisorDisclaimer from '../components/AdvisorDisclaimer.tsx'

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
  coreWarning?: boolean
  setName: string
}

type SortCol = 'name' | 'variant' | 'set' | 'dust' | 'played' | 'winrate' | 'safety'

function safetyColor(safety: number): string {
  if (safety >= 90) return 'text-green-400'
  if (safety >= 70) return 'text-lime-400'
  if (safety >= 50) return 'text-yellow-400'
  if (safety >= 30) return 'text-orange-400'
  return 'text-red-400'
}

function computeSafety(played: number, wr: number, decks: number): number {
  const baseSafety = played <= 0.5 ? 100 : 100 * Math.exp(-0.1 * (played - 0.5))
  const hasReliableWr = decks >= 100 && wr > 0
  let wrMult = 1
  if (hasReliableWr) {
    if (wr >= 50) wrMult = Math.exp(-0.12 * (wr - 50))
    else if (wr < 45) wrMult = Math.min(1.5, 1 + (45 - wr) * 0.05)
  }
  return Math.max(0, Math.min(99, Math.round(baseSafety * wrMult)))
}

function computeCoreDupSafety(played: number, wr: number, decks: number): number {
  if (played <= 1) return 100
  let safety = 100 * Math.exp(-0.0055 * (played - 1))
  const hasReliableWr = decks >= 100 && wr > 0
  if (hasReliableWr && wr > 50) {
    safety *= Math.exp(-0.005 * (wr - 50))
  }
  return Math.max(0, Math.min(100, Math.round(safety)))
}

export default function DisenchantAdvisorView() {
  const getEnrichedCards = useStore(s => s.getEnrichedCards)
  const cardsLoading = useStore(s => s.cardsLoading)
  const collection = useStore(s => s.collection)
  const expansions = useStore(s => s.expansions)
  const metaStandard = useStore(s => s.metaStandard)
  const metaWild = useStore(s => s.metaWild)
  const collectionMode = useStore(s => s.collectionMode)
  const metaBracket = useStore(s => s.metaBracket)

  const [selectedRarities, setSelectedRarities] = useState<Rarity[]>(['LEGENDARY', 'EPIC', 'RARE'])
  const [selectedClass, setSelectedClass] = useState('')
  const [selectedSet, setSelectedSet] = useState('')
  const [sortCol, setSortCol] = useState<SortCol>('safety')
  const [sortAsc, setSortAsc] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  const [playedThreshold, setPlayedThreshold] = useState(3)
  const [maxWinrate, setMaxWinrate] = useState(45)
  const [minSafety, setMinSafety] = useState(80)
  const [hideNoWinrate, setHideNoWinrate] = useState(false)

  const setOptions = useMemo(() => [
    { value: '', label: 'All Sets' },
    ...expansions.filter(e => e.code !== 'CORE').map(exp => ({
      value: exp.code,
      label: `${exp.name}${exp.standard ? ' (S)' : ''}`,
    })),
  ], [expansions])

  const { candidates, excludedNoStats, excludedNoWinrate } = useMemo(() => {
    const enriched = getEnrichedCards()
    const results: DisenchantCandidate[] = []
    let excluded = 0
    let excludedWr = 0
    const setNameMap = new Map(expansions.map(e => [e.code, e.name]))

    for (const card of enriched) {
      if (!collection) continue
      if (card.set === 'CORE' || card.set === 'EVENT') continue
      const rawCounts = collection.collection?.[card.dbfId] || [0, 0, 0, 0]
      const normalCount = rawCounts[0] || 0
      const goldenCount = rawCounts[1] || 0
      const { maxCopies, rarity } = card
      if (normalCount === 0 && goldenCount === 0) continue

      const deNormalAvail = Math.max(0, normalCount - (card.freeNormal ? 1 : 0))
      const deGoldenAvail = Math.max(0, goldenCount - (card.freeGolden ? 1 : 0))
      if (deNormalAvail === 0 && deGoldenAvail === 0) continue

      let stdEntry = metaStandard[card.dbfId]
      let wildEntry = metaWild[card.dbfId]
      if (card.aliasDbfIds) {
        for (const alias of card.aliasDbfIds) {
          const se = metaStandard[alias]
          if (se && (!stdEntry || se.popularity > stdEntry.popularity)) stdEntry = se
          const we = metaWild[alias]
          if (we && (!wildEntry || we.popularity > wildEntry.popularity)) wildEntry = we
        }
      }
      const stdGames = stdEntry?.decks ?? 0
      const wildGames = wildEntry?.decks ?? 0
      const totalGamesForWeight = stdGames + wildGames
      const combinedPlayed = totalGamesForWeight > 0
        ? ((stdEntry?.popularity ?? 0) * stdGames + (wildEntry?.popularity ?? 0) * wildGames) / totalGamesForWeight
        : 0
      const combinedWinrate = totalGamesForWeight > 0
        ? ((stdEntry?.winrate ?? 0) * stdGames + (wildEntry?.winrate ?? 0) * wildGames) / totalGamesForWeight
        : 0
      const combinedDecks = totalGamesForWeight
      const hasReliableWr = combinedDecks >= 100 && combinedWinrate > 0

      if (combinedPlayed === 0) {
        excluded++
        continue
      }

      if (hideNoWinrate && !hasReliableWr) {
        excludedWr++
        continue
      }

      const totalPlayable = card.normalCount + card.goldenCount + card.diamondCount + card.signatureCount
      const extras = totalPlayable - maxCopies
      const hasPremium = card.diamondCount > 0 || card.signatureCount > 0

      const cardSetName = setNameMap.get(card.set) ?? card.set

      const pushCandidate = (variant: 'normal' | 'golden', count: number, reason: string, safety: number, isExtra: boolean, coreWarning?: boolean, overrideSetName?: string) => {
        const dustValue = (variant === 'golden' ? DUST_DISENCHANT_GOLDEN[rarity] : DUST_DISENCHANT[rarity]) * count
        results.push({ card, variant, count, dustValue, reason, safety, combinedPlayed, combinedWinrate, combinedDecks, isExtra, coreWarning, setName: overrideSetName ?? cardSetName })
      }

      if (card.inCore) {
        const dupSafety = computeCoreDupSafety(combinedPlayed, combinedWinrate, combinedDecks)

        if (extras > 0) {
          let remaining = extras
          if (deNormalAvail > 0) {
            const n = Math.min(remaining, deNormalAvail)
            remaining -= n
            const reason = hasPremium ? `In Core — ${card.diamondCount > 0 ? 'Diamond' : 'Signature'} upgrade`
              : card.goldenCount > 0 ? 'In Core — Golden upgrade' : 'In Core — Extra'
            pushCandidate('normal', n, reason, dupSafety, dupSafety === 100, true)
          }
          if (remaining > 0 && deGoldenAvail > 0 && dupSafety >= 100) {
            const g = Math.min(remaining, deGoldenAvail)
            pushCandidate('golden', g, 'In Core — Extra golden', dupSafety, true, true)
          }
        } else {
          if (deNormalAvail > 0) pushCandidate('normal', deNormalAvail, 'In Core — DE', dupSafety, dupSafety === 100, true)
          if (deGoldenAvail > 0 && dupSafety >= 100) pushCandidate('golden', deGoldenAvail, 'In Core — DE golden', dupSafety, true, true)
        }
        continue
      }

      if (hasReliableWr && combinedWinrate > maxWinrate) continue

      if (extras > 0) {
        let remaining = extras
        const premiumLabel = card.diamondCount > 0 ? 'Diamond' : 'Signature'

        if (deNormalAvail > 0) {
          const n = Math.min(remaining, deNormalAvail)
          remaining -= n
          const reason = hasPremium ? `${premiumLabel} upgrade`
            : card.goldenCount > 0 ? 'Golden upgrade' : 'Extra copy'
          pushCandidate('normal', n, reason, 100, true)
        }
        if (remaining > 0 && deGoldenAvail > 0) {
          const g = Math.min(remaining, deGoldenAvail)
          const reason = hasPremium ? `${premiumLabel} upgrade` : 'Extra copy'
          pushCandidate('golden', g, reason, 100, true)
        }
      }

      if (extras <= 0 && combinedPlayed < playedThreshold) {
        const safety = computeSafety(combinedPlayed, combinedWinrate, combinedDecks)
        const reason = `Rarely played (${combinedPlayed.toFixed(2)}%)`

        if (deNormalAvail > 0) pushCandidate('normal', deNormalAvail, reason, safety, false)
        if (deGoldenAvail > 0) pushCandidate('golden', deGoldenAvail, reason, safety, false)
      }
    }

    return { candidates: results, excludedNoStats: excluded, excludedNoWinrate: excludedWr }
  }, [getEnrichedCards, collection, expansions, metaStandard, metaWild, playedThreshold, maxWinrate, hideNoWinrate, collectionMode])

  const setOrder = useMemo(() => {
    const order = new Map<string, number>()
    expansions.forEach((e, i) => order.set(e.code, i))
    return order
  }, [expansions])

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
        case 'set':
          return dir * ((setOrder.get(a.card.set) ?? 999) - (setOrder.get(b.card.set) ?? 999))
            || a.card.name.localeCompare(b.card.name)
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
  }, [candidates, minSafety, selectedRarities, selectedClass, selectedSet, sortCol, sortAsc, setOrder])

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
    <AdvisorDisclaimer>
    <div className="p-6 max-w-6xl">
      <div className="flex items-baseline gap-3 mb-6">
        <h1 className="text-xl font-bold text-gold">Disenchant</h1>
        <span className="text-xs text-gray-500">Stats: <span className="text-gray-400">{bracketLabel(metaBracket)}</span></span>
      </div>

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
              Max winrate % (skip above)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={30}
                max={60}
                step={1}
                value={maxWinrate}
                onChange={e => setMaxWinrate(parseInt(e.target.value))}
                className="flex-1 accent-gold"
              />
              <span className="text-sm text-white w-12 text-right">{maxWinrate}%</span>
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
              <th className="text-left px-2 py-3">Class</th>
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
                onClick={() => handleSortClick('set')}
              >
                Set{sortIndicator('set')}
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
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 300).map((c, i) => (
              <tr key={`${c.card.dbfId}-${c.variant}-${i}`} className="border-b border-white/5 hover:bg-white/5" style={{ height: 40 }}>
                <td className="pl-2 pr-1 py-2">
                  <span
                    className="flex items-center justify-center w-8 h-8 rounded-full"
                    style={{
                      border: `1.5px solid ${CLASS_COLORS[c.card.cardClass] ?? '#808080'}`,
                      boxShadow: 'inset 0 0 0 1.5px #000',
                    }}
                    title={classLabel(c.card.cardClass)}
                  >
                    <ClassIcon cls={c.card.cardClass} size={20} />
                  </span>
                </td>
                <td className="px-4 py-1 text-white relative overflow-hidden">
                  {rarityBleedStyle(c.card.rarity) && <div style={rarityBleedStyle(c.card.rarity)!} />}
                  <div
                    className="absolute z-[1] pointer-events-none"
                    style={{
                      right: -2,
                      top: 0,
                      bottom: 0,
                      width: 140,
                      backgroundImage: `url(/art/${c.card.id}_normal.png)`,
                      backgroundSize: '160%',
                      backgroundPosition: 'center 30%',
                      opacity: 0.45,
                      maskImage: 'linear-gradient(to right, transparent 0%, black 25%, black 80%, transparent 100%), linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%)',
                      WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 25%, black 80%, transparent 100%), linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%)',
                      maskComposite: 'intersect',
                      WebkitMaskComposite: 'destination-in',
                    }}
                  />
                  <CardHover id={c.card.id} name="" className="flex items-center gap-1.5 relative z-[2]" style={{ textShadow: '0 0 4px #000, 0 0 4px #000, 1px 1px 3px #000' }}>
                    <span className="text-white">{c.card.name}</span>
                    {c.count > 1 && <span className="text-[10px] font-bold ml-1.5 px-1 py-0.5 rounded bg-black/60 border border-white/25 text-gold leading-none">x{c.count}</span>}
                  </CardHover>
                </td>
                <td className="px-4 py-2">
                  <span className={c.variant === 'golden' ? 'text-yellow-300' : 'text-gray-400'}>
                    {c.variant === 'golden' ? 'Golden' : 'Normal'}
                  </span>
                </td>
                <td className="px-4 py-2 text-gray-400 text-xs">
                  {c.setName}
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
                  <span className="flex items-center gap-1">
                    {c.reason}
                    {c.coreWarning && (
                      <span className="relative group">
                        <svg className="w-3.5 h-3.5 text-blue-400 cursor-help flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                        </svg>
                        <div className="hidden group-hover:block absolute bottom-5 right-0 w-56 bg-gray-900 border border-white/20 rounded-lg p-2.5 text-[11px] leading-relaxed text-gray-300 z-50 shadow-xl">
                          This card could rotate out of Core. If you disenchant it, you'll lose access to it entirely when that happens.
                        </div>
                      </span>
                    )}
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
        <p className="text-xs text-gray-400 mt-3">
          {[
            excludedNoStats > 0 && `${excludedNoStats} missing play rate`,
            excludedNoWinrate > 0 && `${excludedNoWinrate} missing winrate`,
          ].filter(Boolean).join(', ')} — excluded from results.
        </p>
      )}

      <details className="mt-6 bg-white/5 rounded-lg border border-white/10">
        <summary className="px-4 py-3 text-xs text-gray-400 cursor-pointer hover:text-gray-300 select-none">
          How does the safety score work?
        </summary>
        <div className="px-4 pb-4 space-y-3 text-xs text-gray-400 leading-relaxed">
          <div>
            <span className="text-gray-300 font-medium">Safety score</span> — A 0-99% composite score
            indicating how safe a card is to disenchant. Combines play rate (primary) with winrate (modifier).
            Higher = safer to dust.
          </div>
          <div>
            <span className="text-gray-300 font-medium">Play rate factor</span> — Cards played in
            &le;0.5% of decks start at 100% safety. Safety drops exponentially as play rate increases
            (e.g., 5% played &asymp; 64% safety, 10% played &asymp; 39% safety).
          </div>
          <div>
            <span className="text-gray-300 font-medium">Winrate modifier</span> — Applied when winrate
            data is reliable (100+ decks). Cards with &gt;50% winrate have reduced safety (strong cards
            you might regret dusting). Cards below 45% winrate get a small safety boost.
          </div>
          <div>
            <span className="text-gray-300 font-medium">Extra copies (100% safe)</span> — Cards where
            you own more playable copies than the deck limit (2 for non-legendary, 1 for legendary).
            Includes golden/diamond/signature upgrades — if you have a premium version, the normal
            copy is a pure extra.
          </div>
          <div>
            <span className="text-gray-300 font-medium">CORE-backed cards</span> — If a card is
            currently in the Core set, you can play it for free. The expansion copy is safe to disenchant,
            but may become unplayable if the card rotates out of Core (shown with an info icon).
          </div>
          <div>
            <span className="text-gray-300 font-medium">Free cards</span> — Cards obtained for free
            (e.g., through achievements) are excluded from disenchant counts. Only craftable copies
            are shown as candidates.
          </div>
          <div>
            <span className="text-gray-300 font-medium">Thresholds</span> — Adjustable via the
            Thresholds panel: max played % (hide meta-relevant cards), max winrate % (skip high-WR cards
            entirely), and min safety % (filter the results table).
          </div>
        </div>
      </details>
    </div>
    </AdvisorDisclaimer>
  )
}
