import { type ReactNode, useMemo, useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { useStore } from '../stores/store.ts'
import { CardIcon, CalculatorIcon, CraftIcon, PackAdvisorIcon, DustIcon, HistoryIcon, RarityGem } from './Icons.tsx'
import { RARITY_COLORS, DUST_COST, DUST_DISENCHANT, DUST_DISENCHANT_GOLDEN } from '../types.ts'
import type { Rarity, CollectionMode } from '../types.ts'
import { useRotationInfo } from '../hooks/useRotationInfo.ts'

const NAV_ITEMS: { to: string; label: string; icon: ReactNode }[] = [
  { to: '/', label: 'Collection', icon: <CardIcon size={16} /> },
  { to: '/calculator', label: 'Cost Calculator', icon: <CalculatorIcon size={16} /> },
  { to: '/craft', label: 'Crafting', icon: <CraftIcon size={16} /> },
  { to: '/packs', label: 'Packs', icon: <PackAdvisorIcon size={16} /> },
  { to: '/disenchant', label: 'Disenchant', icon: <DustIcon size={16} /> },
  { to: '/history', label: 'History', icon: <HistoryIcon size={16} /> },
]

const RARITIES: Rarity[] = ['LEGENDARY', 'EPIC', 'RARE', 'COMMON']


const GOLDEN_CRAFT_COST: Record<Rarity, number> = {
  COMMON: 400,
  RARE: 800,
  EPIC: 1600,
  LEGENDARY: 3200,
}

const BAR_MODES: CollectionMode[] = ['normal', 'golden', 'signature', 'meta' as CollectionMode]
const MODE_CONFIG: Record<string, { symbol: string; color: string; label: string }> = {
  normal: { symbol: '\u2666', color: '#9ca3af', label: 'Normal' },
  golden: { symbol: '\u2605', color: '#d4a843', label: 'Golden' },
  signature: { symbol: '\u2726', color: '#a855f7', label: 'Signature' },
  meta: { symbol: '\u2694', color: '#4fc3f7', label: 'Meta' },
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
  const isMeta = mode === 'meta'
  const barColor = isMeta ? '#4fc3f7' : '#d4a843'

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
            backgroundColor: pct === 100 ? '#22c55e' : barColor,
          }}
        />
      </div>

      {hover && (
        <div className="absolute left-full top-0 ml-2 bg-navy-light border border-white/15 rounded-lg shadow-xl z-50 p-3 w-52">
          <div className="text-[11px] font-medium text-gray-300 mb-2">
            {label} — {isMeta ? 'Meta Weight' : isSig ? 'Copies' : 'Dust Value'}
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
                      : `${(b.ownedDust / 1000).toFixed(isMeta ? 0 : 2)}k / ${(b.totalDust / 1000).toFixed(isMeta ? 0 : 2)}k`
                    }
                  </span>
                  <span className="text-gray-500 w-8 text-right">{rpct}%</span>
                </div>
              )
            })}
          </div>
          <div className="mt-2 pt-2 border-t border-white/10 text-[10px] text-gray-500">
            {isMeta
              ? 'Weighted by played% \u00d7 craft cost. Unplayed cards get a 0.1% baseline.'
              : isSig
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

const SYNC_COOLDOWN = 5 * 60 * 1000

function SyncButton() {
  const syncCollection = useStore(s => s.syncCollection)
  const syncLoading = useStore(s => s.syncLoading)
  const collectionSyncedAt = useStore(s => s.collectionSyncedAt)
  const serverSyncedAt = useStore(s => s.collection?.syncedAt ?? null)
  const hostedMode = useStore(s => s.hostedMode)
  const addToast = useStore(s => s.addToast)
  const [now, setNow] = useState(Date.now)

  const lastSync = Math.max(collectionSyncedAt ?? 0, serverSyncedAt ?? 0)
  const onCooldown = hostedMode && lastSync > 0 && now - lastSync < SYNC_COOLDOWN
  const cooldownLeft = onCooldown ? Math.ceil((SYNC_COOLDOWN - (now - lastSync)) / 60000) : 0
  const disabled = syncLoading || onCooldown

  useEffect(() => {
    if (!hostedMode || !lastSync) return
    const remaining = SYNC_COOLDOWN - (Date.now() - lastSync)
    if (remaining <= 0) return
    const id = setInterval(() => setNow(Date.now()), 10000)
    const timeout = setTimeout(() => { clearInterval(id); setNow(Date.now()) }, remaining + 100)
    return () => { clearInterval(id); clearTimeout(timeout) }
  }, [hostedMode, lastSync])

  async function handleSync() {
    const result = await syncCollection()
    if (result.success) {
      addToast(`Synced: ${result.cards?.toLocaleString()} cards, ${result.dust?.toLocaleString()} dust`, 'success')
    } else {
      addToast(result.error || 'Sync failed', 'error')
    }
  }

  return (
    <button
      onClick={handleSync}
      disabled={disabled}
      className={`p-1.5 rounded transition-colors shrink-0 disabled:opacity-30 disabled:cursor-not-allowed ${disabled ? 'text-gray-500' : 'text-green-400 hover:text-green-300'}`}
      title={syncLoading ? 'Syncing...' : onCooldown ? `Sync available in ${cooldownLeft}m` : 'Sync collection'}
    >
      <svg
        width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
        className={syncLoading ? 'animate-spin' : ''}
      >
        <path d="M21 2v6h-6" />
        <path d="M3 12a9 9 0 0115.36-6.36L21 8" />
        <path d="M3 22v-6h6" />
        <path d="M21 12a9 9 0 01-15.36 6.36L3 16" />
      </svg>
    </button>
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
  const hostedMode = useStore(s => s.hostedMode)
  const battletag = useStore(s => s.battletag)
  const logout = useStore(s => s.logout)

  const [logoutConfirm, setLogoutConfirm] = useState(false)
  const rotationInfo = useRotationInfo(expansions)

  const stats = useMemo(() => {
    const standardCodes = new Set(expansions.filter(e => e.standard).map(e => e.code))
    const isMeta = barMode === 'meta'
    const META_BASELINE = 0.1

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
      const baseCraftCost = DUST_COST[rarity]
      const craftCost = barMode === 'golden' ? GOLDEN_CRAFT_COST[rarity] : baseCraftCost

      const counts = collection?.collection?.[dbfId]
      const normal = counts ? (counts[0] || 0) : 0
      const golden = counts ? (counts[1] || 0) : 0
      const diamond = counts ? (counts[2] || 0) : 0
      const signature = counts ? (counts[3] || 0) : 0

      if (barMode === 'signature' && !card.hasSignature && signature === 0) continue

      let cardWeight: number
      if (isMeta) {
        const stdPop = (metaStandard[dbfId]?.popularity ?? 0)
        const wildPop = (metaWild[dbfId]?.popularity ?? 0)
        const stdWeight = baseCraftCost * Math.max(stdPop, META_BASELINE)
        const wildWeight = baseCraftCost * Math.max(wildPop, META_BASELINE)

        const stdFull = stdWeight * maxCopies
        const wildFull = wildWeight * maxCopies

        const owned = Math.min(normal + golden + diamond + signature, maxCopies)
        if (owned > 0) uniqueOwned++

        if (isStandard) {
          standardTotalDust += stdFull
          standardByRarity[rarity].totalDust += stdFull
          const ownedVal = stdWeight * owned
          standardOwnedDust += ownedVal
          standardByRarity[rarity].ownedDust += ownedVal
        }
        wildTotalDust += wildFull
        wildByRarity[rarity].totalDust += wildFull
        const wildOwned = wildWeight * owned
        wildOwnedDust += wildOwned
        wildByRarity[rarity].ownedDust += wildOwned
        continue
      }

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

      if (barMode === 'normal') {
        const deNormalAvail = Math.max(0, normal - (card.freeNormal ? 1 : 0))
        const deGoldenAvail = Math.max(0, golden - (card.freeGolden ? 1 : 0))
        if (deNormalAvail > 0 || deGoldenAvail > 0) {
          const stdEntry = metaStandard[dbfId]
          const wildEntry = metaWild[dbfId]
          const combinedPlayed = Math.max(stdEntry?.popularity ?? 0, wildEntry?.popularity ?? 0)

          if (combinedPlayed > 0) {
            const usable = normal + golden
            const extras = usable - maxCopies

            if (extras > 0) {
              const deNormal = Math.min(extras, deNormalAvail)
              const deGolden = Math.min(extras - deNormal, deGoldenAvail)
              if (deNormal > 0) {
                const d = DUST_DISENCHANT[rarity] * deNormal
                disenchantByRarity[rarity].count += deNormal
                disenchantByRarity[rarity].dust += d
                totalDisenchant += d
              }
              if (deGolden > 0) {
                const d = DUST_DISENCHANT_GOLDEN[rarity] * deGolden
                disenchantByRarity[rarity].count += deGolden
                disenchantByRarity[rarity].dust += d
                totalDisenchant += d
              }
            } else if (combinedPlayed < 5) {
              const safety = Math.round(100 * (1 - combinedPlayed / 5))
              if (safety >= 50) {
                if (deNormalAvail > 0) {
                  const d = DUST_DISENCHANT[rarity] * deNormalAvail
                  disenchantByRarity[rarity].count += deNormalAvail
                  disenchantByRarity[rarity].dust += d
                  totalDisenchant += d
                }
                if (deGoldenAvail > 0) {
                  const d = DUST_DISENCHANT_GOLDEN[rarity] * deGoldenAvail
                  disenchantByRarity[rarity].count += deGoldenAvail
                  disenchantByRarity[rarity].dust += d
                  totalDisenchant += d
                }
              }
            }
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
  }, [cards, collection, expansions, barMode, metaStandard, metaWild])

  const dustStats: DustStats = {
    totalOwnedDust: dust,
    disenchantByRarity: stats.disenchantByRarity,
    totalDisenchant: stats.totalDisenchant,
  }

  return (
    <nav className="w-52 bg-navy flex flex-col border-r border-white/10 shrink-0">
      <div className="px-4 py-5 border-b border-white/10">
        <h1 className="text-gold font-bold text-lg tracking-tight">HearthCodex</h1>
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

      {rotationInfo && (
        <div className="px-4 py-2 border-t border-white/5">
          <div className="text-[10px] text-orange-400 font-medium mb-1">
            Rotating ~{rotationInfo.monthStr} ({rotationInfo.daysLeft}d)
          </div>
          {rotationInfo.rotatingSetNames.map(name => (
            <div key={name} className="text-[10px] text-gray-500 leading-tight">{name}</div>
          ))}
        </div>
      )}

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

      <div className="px-4 py-3 border-t border-white/10 space-y-2.5">
        {battletag && (
          <div className="group flex items-center gap-2 min-w-0">
            <img src="/battlenet.svg" alt="" width={18} height={18} className="shrink-0 opacity-60" style={{ filter: 'brightness(0) invert(0.6) sepia(1) saturate(3) hue-rotate(190deg)' }} />
            <span className="text-xs text-gray-400 truncate">
              <span className="blur-sm group-hover:blur-none transition-[filter] duration-200">{battletag}</span>
            </span>
            <div className="flex items-center gap-0.5 ml-auto shrink-0">
              <NavLink
                to="/settings"
                className={({ isActive }) =>
                  `p-1.5 rounded transition-colors ${isActive ? 'text-gold' : 'text-gray-500 hover:text-gray-300'}`
                }
                title="Settings"
              >
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
                </svg>
              </NavLink>
              <SyncButton />
            </div>
          </div>
        )}
        <div className="border-t border-white/5" />
        <div className="flex items-center gap-2">
          <a
            href="https://github.com/metal0/hearth-codex"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-gray-400 hover:text-gray-200 transition-colors text-sm"
          >
            <svg width={18} height={18} viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
            GitHub
          </a>
          <div className="flex-1" />
          {battletag && (
            logoutConfirm ? (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-red-400">Logout?</span>
                <button onClick={logout} className="text-xs text-red-400 font-medium hover:text-red-300 px-1">Yes</button>
                <button onClick={() => setLogoutConfirm(false)} className="text-xs text-gray-500 hover:text-gray-300 px-1">No</button>
              </div>
            ) : (
              <button
                onClick={() => setLogoutConfirm(true)}
                className="p-1.5 text-red-400/40 hover:text-red-400 transition-colors shrink-0"
                title="Logout"
              >
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </button>
            )
          )}
        </div>
      </div>
    </nav>
  )
}
