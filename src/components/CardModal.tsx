import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { EnrichedCard, Rarity } from '../types.ts'
import { RARITY_COLORS, DUST_COST, getSignatureAcquisition, getDiamondAcquisition } from '../types.ts'
import type { DiamondAcquisitionInfo, SignatureAcquisitionInfo } from '../types.ts'
import { useStore } from '../stores/store.ts'

const PACK_WEIGHT: Record<Rarity, number> = {
  COMMON: 0.7614,
  RARE: 0.1551,
  EPIC: 0.0429,
  LEGENDARY: 0.0100,
}

const SIG_PER_PACK_EXPANSION_GOLDEN = 0.05
const SIG_PITY_EXPANSION_GOLDEN = 40

const PITY_CAP: Record<Rarity, number> = {
  COMMON: 0,
  RARE: 0,
  EPIC: 10,
  LEGENDARY: 40,
}

interface PackProbability {
  label: string
  chance: number
  packs: number
}

function computePullChance(rarity: Rarity, missingOfRarity: number): number {
  if (missingOfRarity === 0) return 0
  const pPerSlot = PACK_WEIGHT[rarity] / missingOfRarity
  return 1 - Math.pow(1 - pPerSlot, 5)
}

function expectedPacksToHitRarity(perPackChance: number, pityCap: number): number {
  if (perPackChance >= 1) return 1
  if (pityCap <= 0) return 1 / perPackChance

  let expected = 0
  let survival = 1

  for (let k = 1; k < pityCap; k++) {
    expected += k * survival * perPackChance
    survival *= (1 - perPackChance)
  }
  expected += pityCap * survival

  return expected
}

function expectedPacksForCard(rarity: Rarity, missingOfRarity: number): number {
  if (missingOfRarity <= 0) return 0

  const perPackChance = 1 - Math.pow(1 - PACK_WEIGHT[rarity], 5)
  const packsPerHit = expectedPacksToHitRarity(perPackChance, PITY_CAP[rarity])

  return Math.ceil(packsPerHit * (missingOfRarity + 1) / 2)
}

function expectedPacksForSig(missingInSet: number, perPackRate: number, pity: number): number {
  if (missingInSet <= 0) return 0
  const packsPerHit = expectedPacksToHitRarity(perPackRate, pity)
  return Math.ceil(packsPerHit * (missingInSet + 1) / 2)
}

function PullChanceBar({ label, chance, packs }: PackProbability) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-gray-400 whitespace-nowrap">{label}</span>
      <div className="flex items-center gap-2 ml-3">
        <div className="w-20 h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-gold rounded-full"
            style={{ width: `${Math.min(chance * 100, 100)}%` }}
          />
        </div>
        <span className="text-white font-medium w-12 text-right">
          {(chance * 100).toFixed(2)}%
        </span>
        <span className="text-gray-500 w-16 text-right">
          ~{packs.toLocaleString()} packs
        </span>
      </div>
    </div>
  )
}

function OwnershipRow({ label, owned, count, color, tooltip }: {
  label: string; owned: boolean; count: number; color: string; tooltip?: ReactNode
}) {
  return (
    <div className="group/row relative">
      <div className="flex items-center gap-2 text-xs cursor-default">
        {owned ? (
          <svg className="w-3.5 h-3.5 text-green-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5 text-red-400/60 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        )}
        <span className={color}>{label}</span>
        {count > 1 && <span className="text-gray-500">x{count}</span>}
        {tooltip && (
          <svg className="w-3 h-3 text-gray-600 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )}
      </div>
      {tooltip && (
        <div className="absolute left-0 top-full mt-1 z-50 hidden group-hover/row:block">
          <div className="bg-navy-dark border border-white/15 rounded-lg shadow-2xl p-3 min-w-[280px]">
            {tooltip}
          </div>
        </div>
      )}
    </div>
  )
}

export default function CardModal({ card, onClose }: { card: EnrichedCard; onClose: () => void }) {
  const expansions = useStore(s => s.expansions)
  const getEnrichedCards = useStore(s => s.getEnrichedCards)

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  const expansion = expansions.find(e => e.code === card.set)
  const isStandard = expansion?.standard ?? false
  const isComplete = card.totalOwned >= card.maxCopies
  const hasSignature = card.hasSignature ?? false
  const hasDiamond = card.hasDiamond ?? false
  const isLegendary = card.rarity === 'LEGENDARY'
  const sigEligible = (expansion?.yearNum ?? 0) >= 2022

  type ArtVariant = 'normal' | 'golden' | 'signature' | 'diamond'
  const artVariants: { key: ArtVariant; label: string; color: string }[] = [
    { key: 'normal', label: 'Normal', color: '#9ca3af' },
    { key: 'golden', label: 'Golden', color: '#d4a843' },
    ...(hasSignature ? [{ key: 'signature' as const, label: 'Signature', color: '#a855f7' }] : []),
    ...(hasDiamond ? [{ key: 'diamond' as const, label: 'Diamond', color: '#67e8f9' }] : []),
  ]

  const defaultVariant: ArtVariant = card.diamondCount > 0 && hasDiamond ? 'diamond'
    : card.signatureCount > 0 && hasSignature ? 'signature'
    : card.goldenCount > 0 ? 'golden' : 'normal'
  const [artVariant, setArtVariant] = useState<ArtVariant>(defaultVariant)
  const av = useStore(s => s.artVersion)

  const artUrl = artVariant === 'normal'
    ? `/art/${card.id}_normal-lg.png?v=${av}`
    : `/art/${card.id}_${artVariant}.png?v=${av}`

  const normalChances = useMemo((): PackProbability[] => {
    if (card.normalCount >= card.maxCopies) return []

    const all = getEnrichedCards()
    const setMissing: Record<Rarity, number> = { COMMON: 0, RARE: 0, EPIC: 0, LEGENDARY: 0 }
    const standardMissing: Record<Rarity, number> = { COMMON: 0, RARE: 0, EPIC: 0, LEGENDARY: 0 }
    const wildMissing: Record<Rarity, number> = { COMMON: 0, RARE: 0, EPIC: 0, LEGENDARY: 0 }
    const standardCodes = new Set(expansions.filter(e => e.standard).map(e => e.code))

    for (const c of all) {
      if (c.normalCount >= c.maxCopies) continue
      wildMissing[c.rarity]++
      if (c.set === card.set) setMissing[c.rarity]++
      if (standardCodes.has(c.set)) standardMissing[c.rarity]++
    }

    const results: PackProbability[] = []
    const setChance = computePullChance(card.rarity, setMissing[card.rarity])
    if (setChance > 0) results.push({ label: `${expansion?.name ?? card.set} Pack`, chance: setChance, packs: expectedPacksForCard(card.rarity, setMissing[card.rarity]) })

    if (isStandard) {
      const stdChance = computePullChance(card.rarity, standardMissing[card.rarity])
      if (stdChance > 0) results.push({ label: 'Standard Pack', chance: stdChance, packs: expectedPacksForCard(card.rarity, standardMissing[card.rarity]) })
    }

    const wildChance = computePullChance(card.rarity, wildMissing[card.rarity])
    if (wildChance > 0) results.push({ label: 'Wild Pack', chance: wildChance, packs: expectedPacksForCard(card.rarity, wildMissing[card.rarity]) })

    return results
  }, [card, getEnrichedCards, expansions, isStandard, expansion])

  const goldenChances = useMemo((): PackProbability[] => {
    if (card.goldenCount >= card.maxCopies) return []

    const all = getEnrichedCards()
    let missingGoldenOfRarity = 0

    for (const c of all) {
      if (c.set !== card.set || c.rarity !== card.rarity) continue
      if (c.goldenCount < c.maxCopies) missingGoldenOfRarity++
    }

    const chance = computePullChance(card.rarity, missingGoldenOfRarity)
    if (chance > 0) {
      return [{ label: `${expansion?.name ?? card.set} Golden Pack`, chance, packs: expectedPacksForCard(card.rarity, missingGoldenOfRarity) }]
    }
    return []
  }, [card, getEnrichedCards, expansion])

  const sigAcq: SignatureAcquisitionInfo | null = (hasSignature || card.signatureCount > 0)
    ? getSignatureAcquisition(card.id, card.set, card.rarity)
    : null

  const diamondAcq: DiamondAcquisitionInfo | null = (hasDiamond || card.diamondCount > 0)
    ? getDiamondAcquisition(card.id)
    : null

  const signatureChances = useMemo((): PackProbability[] => {
    if (sigAcq?.method !== 'pack' || card.signatureCount > 0) return []

    const all = getEnrichedCards()
    let packLegsInSet = 0
    let ownedSigsInSet = 0

    for (const c of all) {
      if (c.set !== card.set || c.rarity !== 'LEGENDARY') continue
      if (getSignatureAcquisition(c.id, c.set, c.rarity).method !== 'pack') continue
      packLegsInSet++
      if (c.signatureCount > 0) ownedSigsInSet++
    }

    const missingInPool = packLegsInSet - ownedSigsInSet
    if (missingInPool <= 0) return []

    const expChance = SIG_PER_PACK_EXPANSION_GOLDEN / missingInPool
    const expPacks = expectedPacksForSig(missingInPool, SIG_PER_PACK_EXPANSION_GOLDEN, SIG_PITY_EXPANSION_GOLDEN)

    return [{
      label: `${expansion?.name ?? card.set} Golden Pack`,
      chance: expChance,
      packs: expPacks,
    }]
  }, [card, sigAcq, getEnrichedCards, expansion])

  const normalTooltip = normalChances.length > 0 ? (
    <div className="space-y-1.5">
      <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Pull chance per pack</div>
      {normalChances.map(p => <PullChanceBar key={p.label} {...p} />)}
    </div>
  ) : undefined

  const goldenTooltip = goldenChances.length > 0 ? (
    <div className="space-y-1.5">
      <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Golden pull chance per golden pack</div>
      {goldenChances.map(p => <PullChanceBar key={p.label} {...p} />)}
    </div>
  ) : undefined

  const sigAchievementProgress = useMemo(() => {
    if (!sigAcq || sigAcq.method !== 'achievement' || !sigAcq.achievementSet) return null
    const all = getEnrichedCards()
    const setLegs = all.filter(c => c.set === sigAcq.achievementSet && c.rarity === 'LEGENDARY')
    const owned = setLegs.filter(c => c.normalCount + c.goldenCount + c.diamondCount + c.signatureCount > 0).length
    return { owned, total: setLegs.length }
  }, [sigAcq, getEnrichedCards])

  const diamondAchievementProgress = useMemo(() => {
    if (!diamondAcq || diamondAcq.method !== 'achievement' || !diamondAcq.achievementSet) return null
    const all = getEnrichedCards()
    const setLegs = all.filter(c => c.set === diamondAcq.achievementSet && c.rarity === 'LEGENDARY')
    const owned = setLegs.filter(c => c.normalCount + c.goldenCount + c.diamondCount + c.signatureCount > 0).length
    return { owned, total: setLegs.length }
  }, [diamondAcq, getEnrichedCards])

  const signatureTooltip = sigAcq ? (() => {
    if (sigAcq.method === 'pack') {
      if (signatureChances.length > 0) return (
        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Signature pull chance per golden pack</div>
          <div className="text-[10px] text-gray-500 mb-1">5% per expansion golden pack for any signature in this set</div>
          {signatureChances.map(p => <PullChanceBar key={p.label} {...p} />)}
        </div>
      )
      if (card.signatureCount > 0) return undefined
      return (
        <div className="text-xs text-gray-400">
          <p>Obtainable from expansion golden packs (5% per pack, 40 pity).</p>
        </div>
      )
    }
    if (sigAcq.method === 'achievement' && sigAchievementProgress) {
      const { owned, total } = sigAchievementProgress
      const pct = total > 0 ? (owned / total * 100) : 0
      return (
        <div className="text-xs text-gray-400 space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-gray-500">Achievement reward</div>
          <p>{sigAcq.description}</p>
          <div>
            <div className="flex justify-between text-[10px] mb-1">
              <span>{owned} / {total} legendaries</span>
              <span className={pct >= 100 ? 'text-green-400' : 'text-gold'}>{pct.toFixed(0)}%</span>
            </div>
            <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-gold rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%` }} />
            </div>
          </div>
        </div>
      )
    }
    return (
      <div className="text-xs text-gray-400">
        <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">How to obtain</div>
        <p>{sigAcq.description}</p>
        {!sigAcq.obtainable && <p className="text-red-400/70 mt-1">No longer available</p>}
      </div>
    )
  })() : undefined

  const diamondTooltip = (hasDiamond || card.diamondCount > 0) && card.diamondCount === 0 ? (() => {
    if (diamondAcq?.method === 'achievement' && diamondAchievementProgress) {
      const { owned, total } = diamondAchievementProgress
      const pct = total > 0 ? (owned / total * 100) : 0
      return (
        <div className="text-xs text-gray-400 space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-gray-500">Achievement reward</div>
          <p>{diamondAcq.description}</p>
          <div>
            <div className="flex justify-between text-[10px] mb-1">
              <span>{owned} / {total} legendaries</span>
              <span className={pct >= 100 ? 'text-green-400' : 'text-gold'}>{pct.toFixed(0)}%</span>
            </div>
            <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-cyan-400 rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%` }} />
            </div>
          </div>
        </div>
      )
    }
    if (diamondAcq) {
      return (
        <div className="text-xs text-gray-400">
          <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">How to obtain</div>
          <p>{diamondAcq.description}</p>
          {!diamondAcq.obtainable && <p className="text-red-400/70 mt-1">No longer available</p>}
        </div>
      )
    }
    return (
      <div className="text-xs text-gray-400">
        <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">How to obtain</div>
        <p>Acquisition method unknown</p>
      </div>
    )
  })() : undefined

  const ownershipStatus = isComplete ? 'Complete' : card.totalOwned > 0 ? 'Incomplete' : 'Missing'
  const statusColor = isComplete ? 'text-green-400' : card.totalOwned > 0 ? 'text-yellow-400' : 'text-red-400'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative bg-navy-dark border border-white/15 rounded-xl shadow-2xl max-w-3xl w-full mx-4 flex animate-in"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-white/10 text-gray-400 hover:text-white hover:bg-white/20 transition-colors z-10"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="shrink-0 p-6 flex flex-col items-center gap-3">
          <div className="w-[240px] h-[340px] relative overflow-hidden rounded-lg shadow-lg bg-black/30">
            <img
              key={artVariant}
              src={artUrl}
              alt={card.name}
              className="absolute inset-0 w-full h-full object-cover object-top"
              onError={e => {
                const fallback = `/art/${card.id}_normal-lg.png`
                if (!(e.target as HTMLImageElement).src.endsWith('_normal-lg.png')) {
                  (e.target as HTMLImageElement).src = fallback
                }
              }}
            />
          </div>
          {artVariants.length > 1 && (
            <div className="flex gap-1">
              {artVariants.map(v => (
                <button
                  key={v.key}
                  onClick={() => setArtVariant(v.key)}
                  className={`px-2 py-1 text-[10px] rounded transition-colors ${
                    artVariant === v.key
                      ? 'bg-white/15 font-medium'
                      : 'bg-white/5 hover:bg-white/10'
                  }`}
                  style={{ color: v.color }}
                >
                  {v.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 py-6 pr-6 space-y-5 overflow-y-auto max-h-[80vh]">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold text-white">{card.name}</h2>
              <span className="text-xs px-2 py-0.5 rounded bg-white/10 text-mana font-medium">{card.cost}</span>
            </div>
            <div className="flex items-center gap-1.5 mt-1 text-xs">
              <span style={{ color: RARITY_COLORS[card.rarity] }} className="font-medium">
                {card.rarity[0] + card.rarity.slice(1).toLowerCase()}
              </span>
              <span className="text-gray-600">&middot;</span>
              <span className="text-gray-400">{card.cardClass[0] + card.cardClass.slice(1).toLowerCase()}</span>
              <span className="text-gray-600">&middot;</span>
              <span className="text-gray-400">{card.type[0] + card.type.slice(1).toLowerCase()}</span>
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {expansion?.name ?? card.set}
              {isStandard && <span className="text-gold ml-1">(Standard)</span>}
            </div>
            {card.text && (
              <p className="text-xs text-gray-400 mt-2 leading-relaxed" dangerouslySetInnerHTML={{ __html: card.text }} />
            )}
          </div>

          <div className="border-t border-white/10 pt-4">
            <h3 className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Ownership</h3>
            <div className="space-y-1">
              <OwnershipRow label="Normal" owned={card.normalCount > 0} count={card.normalCount} color="text-gray-300" tooltip={normalTooltip} />
              <OwnershipRow label="Golden" owned={card.goldenCount > 0} count={card.goldenCount} color="text-yellow-400" tooltip={goldenTooltip} />
              {(hasDiamond || card.diamondCount > 0) && (
                <OwnershipRow label="Diamond" owned={card.diamondCount > 0} count={card.diamondCount} color="text-cyan-300" tooltip={diamondTooltip} />
              )}
              {(hasSignature || card.signatureCount > 0) && (
                <OwnershipRow label="Signature" owned={card.signatureCount > 0} count={card.signatureCount} color="text-purple-400" tooltip={signatureTooltip} />
              )}
            </div>
            <div className="mt-2 text-xs">
              <span className={statusColor + ' font-medium'}>{ownershipStatus}</span>
              <span className="text-gray-500 ml-1">
                ({card.totalOwned}/{card.maxCopies})
              </span>
              {!isComplete && (
                <span className="text-gray-500 ml-2">
                  {DUST_COST[card.rarity] * (card.maxCopies - card.totalOwned)} dust to craft
                </span>
              )}
            </div>
            <p className="text-[10px] text-gray-600 mt-1">Hover a row for pull chances</p>
          </div>

          <div className="border-t border-white/10 pt-4">
            <h3 className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Meta Stats</h3>
            {card.inclusionRate > 0 || card.winrate > 0 ? (
              <div className="flex gap-6 text-xs">
                <div>
                  <span className="text-gray-400">Played</span>
                  <div className="text-green-400 font-medium text-sm">{card.inclusionRate.toFixed(2)}%</div>
                </div>
                <div>
                  <span className="text-gray-400">Win Rate</span>
                  <div className="text-amber-400 font-medium text-sm">{card.winrate.toFixed(2)}%</div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-500">No competitive data</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
