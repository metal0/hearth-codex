import { useMemo, useState } from 'react'
import { useStore } from '../stores/store.ts'
import type { Rarity, EnrichedCard, Expansion } from '../types.ts'
import { RARITY_COLORS } from '../types.ts'
import { ExpansionPackIcon, RarityGem } from './Icons.tsx'

const RARITIES: Rarity[] = ['COMMON', 'RARE', 'EPIC', 'LEGENDARY']

interface CellData {
  owned: number
  total: number
  pct: number
}

type HeatmapRow = {
  code: string
  name: string
  standard: boolean
  cells: Record<Rarity, CellData>
  overall: CellData
}

function cellColor(pct: number): string {
  if (pct >= 100) return 'rgba(34, 197, 94, 0.35)'
  if (pct === 0) return 'rgba(255, 255, 255, 0.03)'
  const t = pct / 100
  const r = Math.round(245 * (1 - t) + 34 * t)
  const g = Math.round(158 * (1 - t) + 197 * t)
  const b = Math.round(11 * (1 - t) + 94 * t)
  const alpha = 0.08 + t * 0.27
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`
}

function buildRows(cards: EnrichedCard[], expansions: Expansion[]): HeatmapRow[] {
  const map = new Map<string, Record<Rarity, CellData>>()

  for (const card of cards) {
    let byRarity = map.get(card.set)
    if (!byRarity) {
      byRarity = {
        COMMON: { owned: 0, total: 0, pct: 0 },
        RARE: { owned: 0, total: 0, pct: 0 },
        EPIC: { owned: 0, total: 0, pct: 0 },
        LEGENDARY: { owned: 0, total: 0, pct: 0 },
      }
      map.set(card.set, byRarity)
    }
    const cell = byRarity[card.rarity]
    cell.owned += card.totalOwned
    cell.total += card.maxCopies
  }

  for (const byRarity of map.values()) {
    for (const r of RARITIES) {
      const c = byRarity[r]
      c.pct = c.total > 0 ? (c.owned / c.total) * 100 : 0
    }
  }

  return expansions
    .filter(exp => map.has(exp.code))
    .map(exp => {
      const cells = map.get(exp.code)!
      let ownedSum = 0, totalSum = 0
      for (const r of RARITIES) {
        ownedSum += cells[r].owned
        totalSum += cells[r].total
      }
      return {
        code: exp.code,
        name: exp.name,
        standard: exp.standard,
        cells,
        overall: { owned: ownedSum, total: totalSum, pct: totalSum > 0 ? (ownedSum / totalSum) * 100 : 0 },
      }
    })
}

export default function CollectionHeatmap() {
  const getEnrichedCards = useStore(s => s.getEnrichedCards)
  const cards = useStore(s => s.cards)
  const collection = useStore(s => s.collection)
  const expansions = useStore(s => s.expansions)
  const collectionMode = useStore(s => s.collectionMode)
  const [formatFilter, setFormatFilter] = useState<'all' | 'standard' | 'wild'>('all')

  const enriched = useMemo(() => getEnrichedCards(), [
    getEnrichedCards, cards, collection, collectionMode,
  ])

  const rows = useMemo(() => {
    const all = buildRows(enriched, expansions)
    if (formatFilter === 'standard') return all.filter(r => r.standard)
    if (formatFilter === 'wild') return all.filter(r => !r.standard)
    return all
  }, [enriched, expansions, formatFilter])

  if (!collection || expansions.length === 0) return null

  return (
    <div className="bg-white/5 rounded-lg border border-white/10 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
        <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">Completion Heatmap</span>
        <div className="flex rounded overflow-hidden border border-white/10 text-[10px]">
          {(['all', 'standard', 'wild'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFormatFilter(f)}
              className={`px-2.5 py-1 ${
                formatFilter === f
                  ? 'bg-gold/20 text-gold'
                  : 'bg-white/5 text-gray-500 hover:bg-white/10'
              }`}
            >
              {f === 'all' ? 'All' : f === 'standard' ? 'Standard' : 'Wild'}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-white/5">
              <th className="text-left px-3 py-1.5 text-gray-500 font-medium w-48">Expansion</th>
              {RARITIES.map(r => (
                <th key={r} className="px-2 py-1.5 text-center w-20">
                  <span className="flex items-center justify-center gap-1" style={{ color: RARITY_COLORS[r] }}>
                    <RarityGem size={10} rarity={r} />
                    <span className="font-medium">{r[0] + r.slice(1).toLowerCase()}</span>
                  </span>
                </th>
              ))}
              <th className="px-2 py-1.5 text-center text-gray-400 font-medium w-20">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.code} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                <td className="px-3 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <ExpansionPackIcon code={row.code} size={16} />
                    <span className={`truncate ${row.standard ? 'text-gray-300' : 'text-gray-500'}`}>
                      {row.name}
                    </span>
                    {row.standard && (
                      <span className="text-[8px] text-blue-400/60 font-bold shrink-0">S</span>
                    )}
                  </div>
                </td>
                {RARITIES.map(r => {
                  const cell = row.cells[r]
                  return (
                    <td
                      key={r}
                      className="px-2 py-1.5 text-center font-mono"
                      style={{ backgroundColor: cellColor(cell.pct) }}
                    >
                      {cell.total > 0 ? (
                        <span className={cell.pct >= 100 ? 'text-green-400' : 'text-gray-400'}>
                          {cell.owned}/{cell.total}
                        </span>
                      ) : (
                        <span className="text-gray-700">—</span>
                      )}
                    </td>
                  )
                })}
                <td
                  className="px-2 py-1.5 text-center font-mono font-medium"
                  style={{ backgroundColor: cellColor(row.overall.pct) }}
                >
                  <span className={row.overall.pct >= 100 ? 'text-green-400' : 'text-gray-300'}>
                    {row.overall.pct.toFixed(1)}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
