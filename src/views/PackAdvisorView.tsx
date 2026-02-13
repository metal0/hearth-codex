import { useMemo, useState } from 'react'
import { useStore } from '../stores/store.ts'
import { DUST_COST, RARITY_COLORS, getSignatureAcquisition } from '../types.ts'
import { RarityGem, DustIcon, StandardIcon, WildIcon, ExpansionPackIcon } from '../components/Icons.tsx'
import type { EnrichedCard, Expansion, Rarity } from '../types.ts'
import CardHover from '../components/CardHover.tsx'
import CollectionModeToggle from '../components/CollectionModeToggle.tsx'
import ClassPicker from '../components/ClassPicker.tsx'
import RarityFilter from '../components/RarityFilter.tsx'

const PACK_WEIGHT: Record<Rarity, number> = {
  COMMON: 0.7614,
  RARE: 0.1551,
  EPIC: 0.0429,
  LEGENDARY: 0.0100,
}

const DISENCHANT_VALUE: Record<Rarity, number> = {
  COMMON: 5,
  RARE: 20,
  EPIC: 100,
  LEGENDARY: 400,
}

const GOLDEN_DISENCHANT_VALUE: Record<Rarity, number> = {
  COMMON: 50,
  RARE: 100,
  EPIC: 400,
  LEGENDARY: 1600,
}

const GOLDEN_CRAFT: Record<Rarity, number> = {
  COMMON: 400,
  RARE: 800,
  EPIC: 1600,
  LEGENDARY: 3200,
}

const SIG_PER_PACK_EXPANSION = 0.05
const SIG_PER_PACK_OTHER = 0.006

interface TopCard extends EnrichedCard {
  pullChance: number
  metaScore: number
}

interface PackScore {
  code: string
  name: string
  isStandard: boolean
  isAggregate: boolean
  missingMetaCards: number
  missingByRarity: Record<Rarity, number>
  totalMissing: number
  metaDustPerPack: number
  dustPerPack: number
  craftCost: number
  topCards: TopCard[]
}

function computePullChance(rarity: Rarity, missingOfRarity: number): number {
  if (missingOfRarity <= 0) return 0
  const perSlot = PACK_WEIGHT[rarity] / missingOfRarity
  return 1 - Math.pow(1 - perSlot, 5)
}

function rarityCount(exp: Expansion, rarity: Rarity): number {
  return ({ COMMON: exp.commons, RARE: exp.rares, EPIC: exp.epics, LEGENDARY: exp.legendaries })[rarity] || 0
}

function scoreExpansionNormal(
  expansion: Expansion,
  missingMeta: EnrichedCard[],
  allMissingInSet: EnrichedCard[],
): PackScore {
  const allMissingByRarity: Record<Rarity, number> = { COMMON: 0, RARE: 0, EPIC: 0, LEGENDARY: 0 }
  for (const card of allMissingInSet) allMissingByRarity[card.rarity]++

  let metaDustPerPack = 0
  let craftCost = 0
  const missingByRarity: Record<Rarity, number> = { COMMON: 0, RARE: 0, EPIC: 0, LEGENDARY: 0 }

  for (const card of missingMeta) {
    craftCost += DUST_COST[card.rarity] * (card.maxCopies - card.totalOwned)
    missingByRarity[card.rarity]++
    const pull = computePullChance(card.rarity, allMissingByRarity[card.rarity])
    metaDustPerPack += pull * (card.inclusionRate / 100) * DUST_COST[card.rarity]
  }

  let dustPerPack = 0
  for (const rarity of ['COMMON', 'RARE', 'EPIC', 'LEGENDARY'] as Rarity[]) {
    const total = rarityCount(expansion, rarity)
    if (total === 0) continue
    const missingRatio = allMissingByRarity[rarity] / total
    dustPerPack += 5 * PACK_WEIGHT[rarity] * (missingRatio * DUST_COST[rarity] + (1 - missingRatio) * DISENCHANT_VALUE[rarity])
  }

  const topCards: TopCard[] = [...missingMeta]
    .map(card => {
      const pullChance = computePullChance(card.rarity, allMissingByRarity[card.rarity])
      const metaScore = pullChance * (card.inclusionRate / 100) * DUST_COST[card.rarity]
      return { ...card, pullChance, metaScore }
    })
    .sort((a, b) => b.metaScore - a.metaScore)
    .slice(0, 10)

  return {
    code: expansion.code,
    name: expansion.name,
    isStandard: expansion.standard,
    isAggregate: false,
    missingMetaCards: missingMeta.length,
    missingByRarity,
    totalMissing: missingMeta.length,
    metaDustPerPack,
    dustPerPack,
    craftCost,
    topCards,
  }
}

function scoreExpansionGolden(
  expansion: Expansion,
  missingMeta: EnrichedCard[],
  allMissingInSet: EnrichedCard[],
): PackScore {
  const allMissingByRarity: Record<Rarity, number> = { COMMON: 0, RARE: 0, EPIC: 0, LEGENDARY: 0 }
  for (const card of allMissingInSet) allMissingByRarity[card.rarity]++

  let metaDustPerPack = 0
  let craftCost = 0
  const missingByRarity: Record<Rarity, number> = { COMMON: 0, RARE: 0, EPIC: 0, LEGENDARY: 0 }

  for (const card of missingMeta) {
    craftCost += GOLDEN_CRAFT[card.rarity] * (card.maxCopies - card.totalOwned)
    missingByRarity[card.rarity]++
    const pull = computePullChance(card.rarity, allMissingByRarity[card.rarity])
    metaDustPerPack += pull * (card.inclusionRate / 100) * DUST_COST[card.rarity]
  }

  let dustPerPack = 0
  for (const rarity of ['COMMON', 'RARE', 'EPIC', 'LEGENDARY'] as Rarity[]) {
    const total = rarityCount(expansion, rarity)
    if (total === 0) continue
    const missingRatio = allMissingByRarity[rarity] / total
    dustPerPack += 5 * PACK_WEIGHT[rarity] * (missingRatio * DUST_COST[rarity] + (1 - missingRatio) * GOLDEN_DISENCHANT_VALUE[rarity])
  }

  const topCards: TopCard[] = [...missingMeta]
    .map(card => {
      const pullChance = computePullChance(card.rarity, allMissingByRarity[card.rarity])
      const metaScore = pullChance * (card.inclusionRate / 100) * DUST_COST[card.rarity]
      return { ...card, pullChance, metaScore }
    })
    .sort((a, b) => b.metaScore - a.metaScore)
    .slice(0, 10)

  return {
    code: expansion.code,
    name: expansion.name,
    isStandard: expansion.standard,
    isAggregate: false,
    missingMetaCards: missingMeta.length,
    missingByRarity,
    totalMissing: missingMeta.length,
    metaDustPerPack,
    dustPerPack,
    craftCost,
    topCards,
  }
}

function scoreExpansionSignature(
  expansion: Expansion,
  missingMeta: EnrichedCard[],
  allMissingInSet: EnrichedCard[],
): PackScore {
  const sigRate = SIG_PER_PACK_EXPANSION
  const missingLegs = allMissingInSet.filter(c => c.rarity === 'LEGENDARY' && getSignatureAcquisition(c.id, c.set, c.rarity).method === 'pack')
  const missingLegCount = missingLegs.length

  let metaDustPerPack = 0
  let craftCost = 0
  const missingByRarity: Record<Rarity, number> = { COMMON: 0, RARE: 0, EPIC: 0, LEGENDARY: 0 }

  const metaLegs = missingMeta.filter(c => c.rarity === 'LEGENDARY' && getSignatureAcquisition(c.id, c.set, c.rarity).method === 'pack')
  for (const card of metaLegs) {
    craftCost += GOLDEN_CRAFT.LEGENDARY
    missingByRarity.LEGENDARY++
    const perCardChance = missingLegCount > 0 ? sigRate / missingLegCount : 0
    metaDustPerPack += perCardChance * (card.inclusionRate / 100) * GOLDEN_CRAFT.LEGENDARY
  }

  const dustPerPack = missingLegCount > 0 ? sigRate * GOLDEN_CRAFT.LEGENDARY : 0

  const topCards: TopCard[] = [...metaLegs]
    .map(card => {
      const perCardChance = missingLegCount > 0 ? sigRate / missingLegCount : 0
      const metaScore = perCardChance * (card.inclusionRate / 100) * GOLDEN_CRAFT.LEGENDARY
      return { ...card, pullChance: perCardChance, metaScore }
    })
    .sort((a, b) => b.metaScore - a.metaScore)
    .slice(0, 10)

  return {
    code: expansion.code,
    name: expansion.name,
    isStandard: expansion.standard,
    isAggregate: false,
    missingMetaCards: metaLegs.length,
    missingByRarity,
    totalMissing: metaLegs.length,
    metaDustPerPack,
    dustPerPack,
    craftCost,
    topCards,
  }
}

function scoreAggregateNormal(
  label: string,
  expansions: Expansion[],
  missingMetaBySet: Map<string, EnrichedCard[]>,
  allMissingBySet: Map<string, EnrichedCard[]>,
): PackScore {
  const missingByRarity: Record<Rarity, number> = { COMMON: 0, RARE: 0, EPIC: 0, LEGENDARY: 0 }
  const allMissingByRarity: Record<Rarity, number> = { COMMON: 0, RARE: 0, EPIC: 0, LEGENDARY: 0 }
  const totalByRarity: Record<Rarity, number> = { COMMON: 0, RARE: 0, EPIC: 0, LEGENDARY: 0 }

  let craftCost = 0
  let totalMissing = 0
  const allMetaMissing: EnrichedCard[] = []

  for (const exp of expansions) {
    totalByRarity.COMMON += exp.commons
    totalByRarity.RARE += exp.rares
    totalByRarity.EPIC += exp.epics
    totalByRarity.LEGENDARY += exp.legendaries

    for (const card of missingMetaBySet.get(exp.code) ?? []) {
      craftCost += DUST_COST[card.rarity] * (card.maxCopies - card.totalOwned)
      missingByRarity[card.rarity]++
      totalMissing++
      allMetaMissing.push(card)
    }
    for (const card of allMissingBySet.get(exp.code) ?? []) {
      allMissingByRarity[card.rarity]++
    }
  }

  let metaDustPerPack = 0
  for (const card of allMetaMissing) {
    const pull = computePullChance(card.rarity, allMissingByRarity[card.rarity])
    metaDustPerPack += pull * (card.inclusionRate / 100) * DUST_COST[card.rarity]
  }

  let dustPerPack = 0
  for (const rarity of ['COMMON', 'RARE', 'EPIC', 'LEGENDARY'] as Rarity[]) {
    if (totalByRarity[rarity] === 0) continue
    const missingRatio = allMissingByRarity[rarity] / totalByRarity[rarity]
    dustPerPack += 5 * PACK_WEIGHT[rarity] * (missingRatio * DUST_COST[rarity] + (1 - missingRatio) * DISENCHANT_VALUE[rarity])
  }

  const topCards: TopCard[] = allMetaMissing
    .map(card => {
      const pullChance = computePullChance(card.rarity, allMissingByRarity[card.rarity])
      const metaScore = pullChance * (card.inclusionRate / 100) * DUST_COST[card.rarity]
      return { ...card, pullChance, metaScore }
    })
    .sort((a, b) => b.metaScore - a.metaScore)
    .slice(0, 10)

  return {
    code: '__aggregate__',
    name: label,
    isStandard: label.includes('Standard'),
    isAggregate: true,
    missingMetaCards: totalMissing,
    missingByRarity,
    totalMissing,
    metaDustPerPack,
    dustPerPack,
    craftCost,
    topCards,
  }
}

function scoreAggregateGolden(
  label: string,
  expansions: Expansion[],
  missingMetaBySet: Map<string, EnrichedCard[]>,
  allMissingBySet: Map<string, EnrichedCard[]>,
): PackScore {
  const missingByRarity: Record<Rarity, number> = { COMMON: 0, RARE: 0, EPIC: 0, LEGENDARY: 0 }
  const allMissingByRarity: Record<Rarity, number> = { COMMON: 0, RARE: 0, EPIC: 0, LEGENDARY: 0 }
  const totalByRarity: Record<Rarity, number> = { COMMON: 0, RARE: 0, EPIC: 0, LEGENDARY: 0 }

  let craftCost = 0
  let totalMissing = 0
  const allMetaMissing: EnrichedCard[] = []

  for (const exp of expansions) {
    totalByRarity.COMMON += exp.commons
    totalByRarity.RARE += exp.rares
    totalByRarity.EPIC += exp.epics
    totalByRarity.LEGENDARY += exp.legendaries

    for (const card of missingMetaBySet.get(exp.code) ?? []) {
      craftCost += GOLDEN_CRAFT[card.rarity] * (card.maxCopies - card.totalOwned)
      missingByRarity[card.rarity]++
      totalMissing++
      allMetaMissing.push(card)
    }
    for (const card of allMissingBySet.get(exp.code) ?? []) {
      allMissingByRarity[card.rarity]++
    }
  }

  let metaDustPerPack = 0
  for (const card of allMetaMissing) {
    const pull = computePullChance(card.rarity, allMissingByRarity[card.rarity])
    metaDustPerPack += pull * (card.inclusionRate / 100) * DUST_COST[card.rarity]
  }

  let dustPerPack = 0
  for (const rarity of ['COMMON', 'RARE', 'EPIC', 'LEGENDARY'] as Rarity[]) {
    if (totalByRarity[rarity] === 0) continue
    const missingRatio = allMissingByRarity[rarity] / totalByRarity[rarity]
    dustPerPack += 5 * PACK_WEIGHT[rarity] * (missingRatio * DUST_COST[rarity] + (1 - missingRatio) * GOLDEN_DISENCHANT_VALUE[rarity])
  }

  const topCards: TopCard[] = allMetaMissing
    .map(card => {
      const pullChance = computePullChance(card.rarity, allMissingByRarity[card.rarity])
      const metaScore = pullChance * (card.inclusionRate / 100) * DUST_COST[card.rarity]
      return { ...card, pullChance, metaScore }
    })
    .sort((a, b) => b.metaScore - a.metaScore)
    .slice(0, 10)

  return {
    code: '__aggregate__',
    name: label,
    isStandard: label.includes('Standard'),
    isAggregate: true,
    missingMetaCards: totalMissing,
    missingByRarity,
    totalMissing,
    metaDustPerPack,
    dustPerPack,
    craftCost,
    topCards,
  }
}

function scoreAggregateSignature(
  label: string,
  expansions: Expansion[],
  missingMetaBySet: Map<string, EnrichedCard[]>,
  allMissingBySet: Map<string, EnrichedCard[]>,
): PackScore {
  const sigRate = SIG_PER_PACK_OTHER
  const missingByRarity: Record<Rarity, number> = { COMMON: 0, RARE: 0, EPIC: 0, LEGENDARY: 0 }

  let totalMissingLegs = 0
  for (const cards of allMissingBySet.values()) {
    for (const c of cards) {
      if (c.rarity === 'LEGENDARY' && getSignatureAcquisition(c.id, c.set, c.rarity).method === 'pack') totalMissingLegs++
    }
  }

  let craftCost = 0
  let metaDustPerPack = 0
  const metaLegs: EnrichedCard[] = []

  for (const cards of missingMetaBySet.values()) {
    for (const card of cards) {
      if (card.rarity !== 'LEGENDARY' || getSignatureAcquisition(card.id, card.set, card.rarity).method !== 'pack') continue
      metaLegs.push(card)
      craftCost += GOLDEN_CRAFT.LEGENDARY
      missingByRarity.LEGENDARY++
      const perCardChance = totalMissingLegs > 0 ? sigRate / totalMissingLegs : 0
      metaDustPerPack += perCardChance * (card.inclusionRate / 100) * GOLDEN_CRAFT.LEGENDARY
    }
  }

  const dustPerPack = totalMissingLegs > 0 ? sigRate * GOLDEN_CRAFT.LEGENDARY : 0

  const topCards: TopCard[] = metaLegs
    .map(card => {
      const perCardChance = totalMissingLegs > 0 ? sigRate / totalMissingLegs : 0
      const metaScore = perCardChance * (card.inclusionRate / 100) * GOLDEN_CRAFT.LEGENDARY
      return { ...card, pullChance: perCardChance, metaScore }
    })
    .sort((a, b) => b.metaScore - a.metaScore)
    .slice(0, 10)

  return {
    code: '__aggregate__',
    name: label,
    isStandard: label.includes('Standard'),
    isAggregate: true,
    missingMetaCards: metaLegs.length,
    missingByRarity,
    totalMissing: metaLegs.length,
    metaDustPerPack,
    dustPerPack,
    craftCost,
    topCards,
  }
}

export default function PackAdvisorView() {
  const getEnrichedCards = useStore(s => s.getEnrichedCards)
  const expansions = useStore(s => s.expansions)
  const collection = useStore(s => s.collection)
  const metaStandard = useStore(s => s.metaStandard)
  const metaWild = useStore(s => s.metaWild)
  const cardsLoading = useStore(s => s.cardsLoading)
  const collectionMode = useStore(s => s.collectionMode)
  const [formatFilter, setFormatFilter] = useState<'standard' | 'wild'>('standard')
  const [selectedClass, setSelectedClass] = useState('')
  const [selectedRarities, setSelectedRarities] = useState<Rarity[]>([])
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [sortCol, setSortCol] = useState<'meta' | 'avg' | 'missing' | 'craft'>('meta')
  const [sortAsc, setSortAsc] = useState(false)

  const isGoldenMode = collectionMode === 'golden' || collectionMode === 'signature'
  const isSigMode = collectionMode === 'signature'

  const scores = useMemo(() => {
    const all = getEnrichedCards()
    let missingMeta = all.filter(c => c.totalOwned < c.maxCopies && c.inclusionRate > 0)
    let allMissing = all.filter(c => c.totalOwned < c.maxCopies)

    if (selectedClass) {
      missingMeta = missingMeta.filter(c => c.cardClass === selectedClass || c.cardClass === 'NEUTRAL')
      allMissing = allMissing.filter(c => c.cardClass === selectedClass || c.cardClass === 'NEUTRAL')
    }
    if (selectedRarities.length > 0) {
      const rarities = new Set(selectedRarities)
      missingMeta = missingMeta.filter(c => rarities.has(c.rarity))
      allMissing = allMissing.filter(c => rarities.has(c.rarity))
    }

    const bySet = new Map<string, EnrichedCard[]>()
    for (const card of missingMeta) {
      const list = bySet.get(card.set) ?? []
      list.push(card)
      bySet.set(card.set, list)
    }

    const allMissingBySet = new Map<string, EnrichedCard[]>()
    for (const card of allMissing) {
      const list = allMissingBySet.get(card.set) ?? []
      list.push(card)
      allMissingBySet.set(card.set, list)
    }

    const filteredExpansions = formatFilter === 'standard'
      ? expansions.filter(e => e.standard)
      : expansions.filter(e => !e.standard)

    const scoreExpansion = isSigMode
      ? (exp: Expansion) => scoreExpansionSignature(exp, bySet.get(exp.code) ?? [], allMissingBySet.get(exp.code) ?? [])
      : isGoldenMode
        ? (exp: Expansion) => scoreExpansionGolden(exp, bySet.get(exp.code) ?? [], allMissingBySet.get(exp.code) ?? [])
        : (exp: Expansion) => scoreExpansionNormal(exp, bySet.get(exp.code) ?? [], allMissingBySet.get(exp.code) ?? [])

    const expScores = filteredExpansions
      .map(scoreExpansion)
      .filter(s => s.missingMetaCards > 0)

    const aggregateLabel = formatFilter === 'standard'
      ? (isGoldenMode ? 'Standard Golden Pack' : 'Standard Pack')
      : (isGoldenMode ? 'Wild Golden Pack' : 'Wild Pack')
    const relevantCodes = new Set(filteredExpansions.map(e => e.code))
    const filteredMetaBySet = new Map<string, EnrichedCard[]>()
    const filteredAllBySet = new Map<string, EnrichedCard[]>()
    for (const [code, cards] of bySet) {
      if (relevantCodes.has(code)) filteredMetaBySet.set(code, cards)
    }
    for (const [code, cards] of allMissingBySet) {
      if (relevantCodes.has(code)) filteredAllBySet.set(code, cards)
    }

    const aggregate = isSigMode
      ? scoreAggregateSignature(aggregateLabel, filteredExpansions, filteredMetaBySet, filteredAllBySet)
      : isGoldenMode
        ? scoreAggregateGolden(aggregateLabel, filteredExpansions, filteredMetaBySet, filteredAllBySet)
        : scoreAggregateNormal(aggregateLabel, filteredExpansions, filteredMetaBySet, filteredAllBySet)

    const result = [...expScores]
    if (aggregate.missingMetaCards > 0) result.push(aggregate)

    const dir = sortAsc ? 1 : -1
    result.sort((a, b) => {
      switch (sortCol) {
        case 'meta': return dir * (a.metaDustPerPack - b.metaDustPerPack)
        case 'avg': return dir * (a.dustPerPack - b.dustPerPack)
        case 'missing': return dir * (a.missingMetaCards - b.missingMetaCards)
        case 'craft': return dir * (a.craftCost - b.craftCost)
        default: return 0
      }
    })
    return result
  }, [getEnrichedCards, expansions, formatFilter, selectedClass, selectedRarities, collection, metaStandard, metaWild, collectionMode, sortCol, sortAsc, isGoldenMode, isSigMode])

  function handleSort(col: typeof sortCol) {
    if (sortCol === col) setSortAsc(!sortAsc)
    else { setSortCol(col); setSortAsc(false) }
  }

  const sortIcon = (col: typeof sortCol) =>
    sortCol === col ? (sortAsc ? ' \u25B2' : ' \u25BC') : ''

  const hasMetaData = Object.keys(metaStandard).length > 0 || Object.keys(metaWild).length > 0

  if (cardsLoading) {
    return <div className="p-8 text-gray-400">Loading...</div>
  }

  if (!hasMetaData) {
    return (
      <div className="p-6 max-w-4xl">
        <h1 className="text-xl font-bold text-gold mb-6">Packs</h1>
        <div className="bg-white/5 rounded-lg border border-white/10 p-8 text-center text-gray-400">
          Meta stats not loaded. Refresh meta data in Settings to use Pack Advisor.
        </div>
      </div>
    )
  }

  const best = scores[0]

  const packTypeLabel = isSigMode ? 'golden pack (sig)' : isGoldenMode ? 'golden pack' : 'pack'
  const craftLabel = isSigMode ? 'golden craft cost' : isGoldenMode ? 'golden craft cost' : 'craft cost'

  return (
    <div className="p-6 max-w-5xl">
      <h1 className="text-xl font-bold text-gold mb-6">Packs</h1>

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

        <CollectionModeToggle modes={['normal', 'golden', 'signature']} />

        <RarityFilter selected={selectedRarities} onChange={setSelectedRarities} />

        <ClassPicker value={selectedClass} onChange={setSelectedClass} />

        {!collection && (
          <span className="text-xs text-amber-400">
            Collection not synced — showing values assuming no cards owned
          </span>
        )}
      </div>

      {isGoldenMode && !isSigMode && (
        <div className="bg-yellow-900/15 border border-yellow-500/20 rounded-lg px-4 py-2.5 mb-4 text-xs text-yellow-300">
          Golden packs contain 5 golden cards with the same rarity distribution as normal packs. Values shown use golden craft/disenchant costs.
        </div>
      )}

      {best && (
        <div className="bg-navy-light rounded-lg border border-gold/20 p-5 mb-4">
          <h3 className="text-gold font-bold text-sm mb-3">
            Best value: {best.name}
          </h3>
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center gap-1.5">
              <DustIcon size={12} />
              <span className="text-green-400 font-medium">{best.metaDustPerPack.toFixed(2)}</span>
              <span className="text-gray-500">expected meta dust per {packTypeLabel}</span>
            </div>
            {!isSigMode && (
              <div className="flex items-center gap-1.5">
                <DustIcon size={12} />
                <span className="text-gray-300 font-medium">{best.dustPerPack.toFixed(2)}</span>
                <span className="text-gray-500">avg dust value per {packTypeLabel}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <span className="text-amber-400 font-medium">{best.missingMetaCards}</span>
              <span className="text-gray-500">missing meta {isSigMode ? 'legendaries' : 'cards'}</span>
              {!isSigMode && (
                <>
                  <span className="text-gray-600 mx-0.5">&middot;</span>
                  <DustIcon size={12} />
                  <span className="text-mana font-medium">{best.craftCost.toLocaleString()}</span>
                  <span className="text-gray-500">{craftLabel}</span>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {scores.length === 0 ? (
        <div className="bg-white/5 rounded-lg border border-white/10 p-8 text-center text-gray-400">
          No missing meta {isSigMode ? 'signature legendaries' : 'cards'} in {formatFilter} format. You have everything!
        </div>
      ) : (
        <div className="bg-white/5 rounded-lg border border-white/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-gray-400 text-xs select-none">
                <th className="text-center px-3 py-3 w-10">#</th>
                <th className="text-left px-4 py-3">{isGoldenMode ? 'Golden Pack' : 'Pack Type'}</th>
                <th className="text-center px-4 py-3 cursor-pointer hover:text-white" onClick={() => handleSort('missing')}>
                  Missing{sortIcon('missing')}
                </th>
                <th className="text-right px-4 py-3 cursor-pointer hover:text-white" onClick={() => handleSort('meta')}>
                  <span className="flex items-center justify-end gap-1">
                    <DustIcon size={10} />
                    Meta / Pack{sortIcon('meta')}
                  </span>
                </th>
                {!isSigMode && (
                  <th className="text-right px-4 py-3 cursor-pointer hover:text-white" onClick={() => handleSort('avg')}>
                    <span className="flex items-center justify-end gap-1">
                      <DustIcon size={10} />
                      Avg / Pack{sortIcon('avg')}
                    </span>
                  </th>
                )}
                {!isSigMode && (
                  <th className="text-right px-4 py-3 cursor-pointer hover:text-white" onClick={() => handleSort('craft')}>
                    <span className="flex items-center justify-end gap-1">
                      <DustIcon size={10} />
                      {isGoldenMode ? 'Gold Craft' : 'Craft Cost'}{sortIcon('craft')}
                    </span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {scores.map((score, i) => {
                const isExpanded = expandedRow === score.code
                return (
                  <tr
                    key={score.code}
                    onClick={() => setExpandedRow(isExpanded ? null : score.code)}
                    className={`border-b border-white/5 cursor-pointer transition-colors ${
                      score.isAggregate ? 'bg-gold/5 hover:bg-gold/10' : 'hover:bg-white/5'
                    }`}
                  >
                    <td className="px-3 py-3 text-center">
                      <span className={`font-bold ${i === 0 ? 'text-gold' : 'text-gray-500'}`}>
                        {i + 1}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-white font-medium flex items-center gap-2">
                        {score.isAggregate
                          ? <ExpansionPackIcon code={score.isStandard ? 'STANDARD' : 'WILD'} size={28} golden={isGoldenMode} />
                          : <ExpansionPackIcon code={score.code} size={28} golden={isGoldenMode} />
                        }
                        <span>{isGoldenMode && !score.isAggregate ? `Golden ${score.name}` : score.name}</span>
                        {score.isAggregate && (
                          <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-gold/15 text-gold/80 font-normal">
                            MIXED
                          </span>
                        )}
                      </div>
                      {!isSigMode && score.craftCost > 0 && score.craftCost <= (isGoldenMode ? 3200 : 1600) && (
                        <div className="text-[10px] text-mana mt-0.5 flex items-center gap-1">
                          <DustIcon size={9} /> Just craft it
                        </div>
                      )}
                      {isExpanded && score.topCards.length > 0 && (
                        <div className="mt-3 border-t border-white/5 pt-2">
                          <div className="flex items-center gap-2 text-[10px] text-gray-500 mb-1.5 font-medium uppercase tracking-wide">
                            <span className="w-4" />
                            <span className="flex-1">Card</span>
                            <span className="w-14 text-right">Played</span>
                            <span className="w-14 text-right">Pull</span>
                            <span className="w-14 text-right">{isGoldenMode ? 'Gold' : 'Craft'}</span>
                            <span className="w-12 text-right">Score</span>
                          </div>
                          {score.topCards.map(card => (
                            <div key={card.dbfId} className="flex items-center gap-2 text-xs py-0.5">
                              <RarityGem size={10} rarity={card.rarity} />
                              <span className="flex items-center gap-1 truncate flex-1">
                                <CardHover id={card.id} name={card.name} className="text-gray-300 truncate" />
                              </span>
                              <span className="text-green-400 w-14 text-right shrink-0">
                                {card.inclusionRate.toFixed(2)}%
                              </span>
                              <span className="w-14 text-right shrink-0 text-amber-400">
                                {(card.pullChance * 100).toFixed(2)}%
                              </span>
                              <span className="text-mana w-14 text-right shrink-0 flex items-center justify-end gap-0.5">
                                <DustIcon size={9} />
                                {(isGoldenMode ? GOLDEN_CRAFT[card.rarity] : DUST_COST[card.rarity]).toLocaleString()}
                              </span>
                              <span className="text-gold w-12 text-right shrink-0">
                                {card.metaScore.toFixed(2)}
                              </span>
                            </div>
                          ))}
                          {score.missingMetaCards > score.topCards.length && (
                            <div className="text-[10px] text-gray-500 pt-1">
                              ... {score.missingMetaCards - score.topCards.length} more not shown
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center align-top">
                      <div className="text-gray-300">{score.missingMetaCards}</div>
                      {!isSigMode && (
                        <div className="flex justify-center gap-1.5 mt-1">
                          {(['LEGENDARY', 'EPIC', 'RARE', 'COMMON'] as Rarity[]).map(r =>
                            score.missingByRarity[r] > 0 ? (
                              <span key={r} className="flex items-center gap-0.5 text-[10px] font-medium" style={{ color: RARITY_COLORS[r] }}>
                                <RarityGem size={10} rarity={r} />
                                {score.missingByRarity[r]}
                              </span>
                            ) : null
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right align-top">
                      <span className={`font-medium ${i === 0 ? 'text-green-400' : 'text-gray-300'}`}>
                        {score.metaDustPerPack.toFixed(2)}
                      </span>
                    </td>
                    {!isSigMode && (
                      <td className="px-4 py-3 text-right align-top text-gray-400">
                        {score.dustPerPack.toFixed(2)}
                      </td>
                    )}
                    {!isSigMode && (
                      <td className="px-4 py-3 text-right text-mana align-top">
                        {score.craftCost.toLocaleString()}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 space-y-1.5">
        {isSigMode ? (
          <p className="text-[10px] text-gray-600">
            <span className="text-gray-500">Meta / Pack</span> — expected meta-relevant signature value per golden pack.
            Based on 5% signature rate (expansion golden) or 0.6% (standard/wild golden), weighted by played % and golden craft cost.
          </p>
        ) : (
          <>
            <p className="text-[10px] text-gray-600">
              <span className="text-gray-500">Meta / Pack</span> — expected meta-relevant dust saved per {packTypeLabel}.
              Weights each missing card by played %, {isGoldenMode ? 'golden ' : ''}craft cost, and pull chance (with duplicate protection).
            </p>
            <p className="text-[10px] text-gray-600">
              <span className="text-gray-500">Avg / Pack</span> — expected dust value per {packTypeLabel}. New cards save their {isGoldenMode ? 'golden ' : ''}craft cost, duplicates give {isGoldenMode ? 'golden ' : ''}disenchant value.
            </p>
            <p className="text-[10px] text-gray-600">
              <span className="text-gray-500">Score</span> — per-card meta value: pull chance &times; played % &times; {isGoldenMode ? 'golden ' : ''}craft cost.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
