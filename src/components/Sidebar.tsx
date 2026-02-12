import { type ReactNode, useMemo, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useStore } from '../stores/store.ts'
import { CardIcon, CalculatorIcon, CraftIcon, PackAdvisorIcon, SettingsIcon, DustIcon, HistoryIcon, RarityGem } from './Icons.tsx'
import { RARITY_COLORS, DUST_COST, DUST_DISENCHANT } from '../types.ts'
import type { Rarity, CollectionMode } from '../types.ts'

const NAV_ITEMS: { to: string; label: string; icon: ReactNode }[] = [
  { to: '/', label: 'Collection', icon: <CardIcon size={16} /> },
  { to: '/calculator', label: 'Cost Calculator', icon: <CalculatorIcon size={16} /> },
  { to: '/craft', label: 'Crafting', icon: <CraftIcon size={16} /> },
  { to: '/packs', label: 'Packs', icon: <PackAdvisorIcon size={16} /> },
  { to: '/disenchant', label: 'Disenchant', icon: <DustIcon size={16} /> },
  { to: '/history', label: 'History', icon: <HistoryIcon size={16} /> },
  { to: '/settings', label: 'Settings', icon: <SettingsIcon size={16} /> },
]

const RARITIES: Rarity[] = ['LEGENDARY', 'EPIC', 'RARE', 'COMMON']


const GOLDEN_CRAFT_COST: Record<Rarity, number> = {
  COMMON: 400,
  RARE: 800,
  EPIC: 1600,
  LEGENDARY: 3200,
}

const BAR_MODES: CollectionMode[] = ['normal', 'golden', 'signature']
const MODE_CONFIG: Record<string, { symbol: string; color: string; label: string }> = {
  normal: { symbol: '\u2666', color: '#9ca3af', label: 'Normal' },
  golden: { symbol: '\u2605', color: '#d4a843', label: 'Golden' },
  signature: { symbol: '\u2726', color: '#a855f7', label: 'Signature' },
}

interface RarityBreakdown {
  ownedDust: number
  totalDust: number
}

interface CompletionBarProps {
  label: string
  ownedDust: number
  totalDust: number
  byRarity: Record<Rarity, RarityBreakdown>
  mode?: CollectionMode
}

function CompletionBar({ label, ownedDust, totalDust, byRarity, mode }: CompletionBarProps) {
  const [hover, setHover] = useState(false)
  const pct = totalDust > 0 ? Math.round(ownedDust / totalDust * 100) : 0
  const isSig = mode === 'signature'

  return (
    <div className="relative" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div className="flex justify-between text-[10px] mb-0.5">
        <span className="text-gray-500">{label}</span>
        <span className="text-gray-400">{pct}%</span>
      </div>
      <div className="h-1 bg-white/5 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${pct}%`,
            backgroundColor: pct === 100 ? '#22c55e' : '#d4a843',
          }}
        />
      </div>

      {hover && (
        <div className="absolute left-full top-0 ml-2 bg-navy-light border border-white/15 rounded-lg shadow-xl z-50 p-3 w-52">
          <div className="text-[11px] font-medium text-gray-300 mb-2">
            {label} — {isSig ? 'Copies' : 'Dust Value'}
          </div>
          <div className="space-y-1.5">
            {RARITIES.map(r => {
              const b = byRarity[r]
              if (b.totalDust === 0) return null
              const rpct = (b.ownedDust / b.totalDust * 100).toFixed(2)
              const ownedCount = isSig ? Math.round(b.ownedDust / DUST_COST[r]) : 0
              const totalCount = isSig ? Math.round(b.totalDust / DUST_COST[r]) : 0
              return (
                <div key={r} className="flex items-center gap-1.5 text-[10px]">
                  <RarityGem size={10} rarity={r} />
                  <span style={{ color: RARITY_COLORS[r] }} className="w-16 truncate">
                    {r[0] + r.slice(1).toLowerCase()}
                  </span>
                  <span className="text-gray-400 ml-auto">
                    {isSig
                      ? `${ownedCount} / ${totalCount}`
                      : `${(b.ownedDust / 1000).toFixed(2)}k / ${(b.totalDust / 1000).toFixed(2)}k`
                    }
                  </span>
                  <span className="text-gray-500 w-8 text-right">{rpct}%</span>
                </div>
              )
            })}
          </div>
          <div className="mt-2 pt-2 border-t border-white/10 text-[10px] text-gray-500">
            {isSig
              ? 'Progress based on signature copies per rarity'
              : mode === 'golden'
                ? 'Weighted by golden craft cost (Legendary = 3200, Epic = 1600, Rare = 800, Common = 400)'
                : 'Weighted by craft cost (Legendary = 1600, Epic = 400, Rare = 100, Common = 40)'
            }
          </div>
        </div>
      )}
    </div>
  )
}

interface DustStats {
  totalOwnedDust: number
  disenchantByRarity: Record<Rarity, { count: number; dust: number }>
  totalDisenchant: number
}

function DustTooltip({ stats }: { stats: DustStats }) {
  const [hover, setHover] = useState(false)

  return (
    <div className="relative inline-flex" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div className="flex items-center gap-1 text-xs cursor-help">
        <DustIcon size={12} />
        <span className="text-mana font-medium">{stats.totalOwnedDust.toLocaleString()}</span>
      </div>

      {hover && (
        <div className="absolute left-full top-0 ml-2 bg-navy-light border border-white/15 rounded-lg shadow-xl z-50 p-3 w-56">
          <div className="text-[11px] font-medium text-gray-300 mb-2">Dust Available</div>
          <div className="text-xs text-mana mb-3">{stats.totalOwnedDust.toLocaleString()} dust</div>

          {stats.totalDisenchant > 0 && (
            <>
              <div className="text-[11px] font-medium text-gray-300 mb-1.5">
                Safe Disenchant (extras + unplayed)
              </div>
              <div className="space-y-1">
                {RARITIES.map(r => {
                  const d = stats.disenchantByRarity[r]
                  if (d.count === 0) return null
                  return (
                    <div key={r} className="flex items-center gap-1.5 text-[10px]">
                      <RarityGem size={10} rarity={r} />
                      <span style={{ color: RARITY_COLORS[r] }} className="w-16">
                        {r[0] + r.slice(1).toLowerCase()}
                      </span>
                      <span className="text-gray-400">{d.count} cards</span>
                      <span className="text-mana ml-auto">{d.dust.toLocaleString()}</span>
                    </div>
                  )
                })}
              </div>
              <div className="mt-1.5 pt-1.5 border-t border-white/10 flex justify-between text-[10px]">
                <span className="text-gray-400">Total safe disenchant</span>
                <span className="text-mana font-medium">{stats.totalDisenchant.toLocaleString()}</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default function Sidebar() {
  const cards = useStore(s => s.cards)
  const collection = useStore(s => s.collection)
  const expansions = useStore(s => s.expansions)
  const metaStandard = useStore(s => s.metaStandard)
  const metaWild = useStore(s => s.metaWild)
  const dust = collection?.dust ?? 0
  const [barMode, setBarMode] = useState<CollectionMode>('normal')

  const variantConfirmed = useStore(s => s.variantConfirmed)

  const stats = useMemo(() => {
    const standardCodes = new Set(expansions.filter(e => e.standard).map(e => e.code))

    let uniqueOwned = 0

    const emptyBreakdown = (): Record<Rarity, RarityBreakdown> => ({
      LEGENDARY: { ownedDust: 0, totalDust: 0 },
      EPIC: { ownedDust: 0, totalDust: 0 },
      RARE: { ownedDust: 0, totalDust: 0 },
      COMMON: { ownedDust: 0, totalDust: 0 },
    })
    const standardByRarity = emptyBreakdown()
    const wildByRarity = emptyBreakdown()
    let standardOwnedDust = 0
    let standardTotalDust = 0
    let wildOwnedDust = 0
    let wildTotalDust = 0

    const emptyDisenchant = (): Record<Rarity, { count: number; dust: number }> => ({
      LEGENDARY: { count: 0, dust: 0 },
      EPIC: { count: 0, dust: 0 },
      RARE: { count: 0, dust: 0 },
      COMMON: { count: 0, dust: 0 },
    })
    const disenchantByRarity = emptyDisenchant()
    let totalDisenchant = 0

    for (const [dbfId, card] of Object.entries(cards)) {
      const maxCopies = card.rarity === 'LEGENDARY' ? 1 : 2
      const isStandard = standardCodes.has(card.set)
      const rarity = card.rarity as Rarity
      const craftCost = barMode === 'golden' ? GOLDEN_CRAFT_COST[rarity] : DUST_COST[rarity]

      const counts = collection?.collection?.[dbfId]
      const normal = counts ? (counts[0] || 0) : 0
      const golden = counts ? (counts[1] || 0) : 0
      const diamond = counts ? (counts[2] || 0) : 0
      const signature = counts ? (counts[3] || 0) : 0

      if (barMode === 'signature' && !variantConfirmed.signature.has(card.id) && signature === 0) continue

      const fullDust = craftCost * maxCopies

      wildTotalDust += fullDust
      wildByRarity[rarity].totalDust += fullDust
      if (isStandard) {
        standardTotalDust += fullDust
        standardByRarity[rarity].totalDust += fullDust
      }

      let owned: number
      switch (barMode) {
        case 'golden':
          owned = Math.min(golden + diamond + signature, maxCopies)
          break
        case 'signature':
          owned = Math.min(signature + diamond, maxCopies)
          break
        default:
          owned = Math.min(normal + golden + diamond + signature, maxCopies)
      }

      const ownedDust = craftCost * owned
      wildOwnedDust += ownedDust
      wildByRarity[rarity].ownedDust += ownedDust
      if (isStandard) {
        standardOwnedDust += ownedDust
        standardByRarity[rarity].ownedDust += ownedDust
      }

      if (owned > 0) uniqueOwned++

      if (barMode === 'normal' && rarity !== 'COMMON') {
        const totalCopies = normal + golden + diamond + signature
        const extras = Math.max(0, totalCopies - maxCopies)

        if (extras > 0) {
          const extraDust = DUST_DISENCHANT[rarity] * extras
          disenchantByRarity[rarity].count += extras
          disenchantByRarity[rarity].dust += extraDust
          totalDisenchant += extraDust
        }

        const baseCopies = Math.min(totalCopies, maxCopies)
        if (baseCopies > 0) {
          const stdEntry = metaStandard[dbfId]
          const wildEntry = metaWild[dbfId]
          const played = Math.max(stdEntry?.popularity ?? 0, wildEntry?.popularity ?? 0)
          if (played < 0.1) {
            const deValue = DUST_DISENCHANT[rarity] * baseCopies
            disenchantByRarity[rarity].count += baseCopies
            disenchantByRarity[rarity].dust += deValue
            totalDisenchant += deValue
          }
        }
      }
    }

    return {
      totalCards: Object.keys(cards).length,
      uniqueOwned,
      standardOwnedDust,
      standardTotalDust,
      wildOwnedDust,
      wildTotalDust,
      standardByRarity,
      wildByRarity,
      disenchantByRarity,
      totalDisenchant,
    }
  }, [cards, collection, expansions, barMode, metaStandard, metaWild, variantConfirmed])

  const dustStats: DustStats = {
    totalOwnedDust: dust,
    disenchantByRarity: stats.disenchantByRarity,
    totalDisenchant: stats.totalDisenchant,
  }

  return (
    <nav className="w-52 bg-navy flex flex-col border-r border-white/10 shrink-0">
      <div className="px-4 py-5 border-b border-white/10">
        <h1 className="text-gold font-bold text-lg tracking-tight leading-tight">
          Hearth<br />Codex
        </h1>
        {stats.totalCards > 0 && (
          <div className="mt-3 space-y-2">
            <div className="text-xs text-gray-400">
              <span className="text-green-400 font-medium">{stats.uniqueOwned.toLocaleString()}</span>
              <span className="text-gray-500"> / {stats.totalCards.toLocaleString()} unique cards</span>
            </div>
            {dust > 0 && barMode === 'normal' && <DustTooltip stats={dustStats} />}

            <button
              onClick={() => {
                const idx = BAR_MODES.indexOf(barMode)
                setBarMode(BAR_MODES[(idx + 1) % BAR_MODES.length])
              }}
              className="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
              title={`Showing: ${MODE_CONFIG[barMode].label}. Click to cycle.`}
            >
              <span style={{ color: MODE_CONFIG[barMode].color, fontSize: 11 }}>{MODE_CONFIG[barMode].symbol}</span>
              <span style={{ color: MODE_CONFIG[barMode].color }}>{MODE_CONFIG[barMode].label}</span>
            </button>

            {stats.standardTotalDust > 0 && (
              <CompletionBar
                label="Standard"
                ownedDust={stats.standardOwnedDust}
                totalDust={stats.standardTotalDust}
                byRarity={stats.standardByRarity}
                mode={barMode}
              />
            )}
            {stats.wildTotalDust > 0 && (
              <CompletionBar
                label="Wild (All)"
                ownedDust={stats.wildOwnedDust}
                totalDust={stats.wildTotalDust}
                byRarity={stats.wildByRarity}
                mode={barMode}
              />
            )}
          </div>
        )}
      </div>

      {(() => {
        const standardYearNums = [...new Set(expansions.filter(e => e.standard).map(e => e.yearNum))].sort((a, b) => a - b)
        if (standardYearNums.length < 2) return null
        const oldestYear = standardYearNums[0]
        const rotatingSets = expansions.filter(e => e.yearNum === oldestYear)
        const rotationDate = new Date(Math.max(...standardYearNums) + 1, 3, 15)
        const now = new Date()
        const daysLeft = Math.ceil((rotationDate.getTime() - now.getTime()) / 86400000)
        if (daysLeft <= 0) return null
        const monthStr = rotationDate.toLocaleString('en', { month: 'short', year: 'numeric' })
        return (
          <div className="px-4 py-2 border-t border-white/5">
            <div className="text-[10px] text-orange-400 font-medium mb-1">
              Rotating ~{monthStr} ({daysLeft}d)
            </div>
            {rotatingSets.map(s => (
              <div key={s.code} className="text-[10px] text-gray-500 leading-tight">{s.name}</div>
            ))}
          </div>
        )
      })()}

      <div className="flex-1 py-3">
        {NAV_ITEMS.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors ${
                isActive
                  ? 'bg-white/10 text-gold border-r-2 border-gold font-medium'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
              }`
            }
          >
            {item.icon}
            {item.label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
