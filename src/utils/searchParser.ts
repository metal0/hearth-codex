import type { EnrichedCard, Rarity } from '../types.ts'

type CardPredicate = (c: EnrichedCard) => boolean

interface ParsedSearch {
  predicates: CardPredicate[]
  textParts: string[]
}

const RARITY_KEYWORDS: Record<string, Rarity> = {
  common: 'COMMON',
  rare: 'RARE',
  epic: 'EPIC',
  legendary: 'LEGENDARY',
}

const TYPE_KEYWORDS: Record<string, string> = {
  minion: 'MINION',
  spell: 'SPELL',
  weapon: 'WEAPON',
  hero: 'HERO',
  location: 'LOCATION',
}

const CLASS_KEYWORDS: Record<string, string> = {
  druid: 'DRUID',
  hunter: 'HUNTER',
  mage: 'MAGE',
  paladin: 'PALADIN',
  priest: 'PRIEST',
  rogue: 'ROGUE',
  shaman: 'SHAMAN',
  warlock: 'WARLOCK',
  warrior: 'WARRIOR',
  neutral: 'NEUTRAL',
  demonhunter: 'DEMONHUNTER',
  deathknight: 'DEATHKNIGHT',
}

const OWNERSHIP_KEYWORDS: Record<string, CardPredicate> = {
  missing: c => c.totalOwned < c.maxCopies,
  extra: c => (c.normalCount + c.goldenCount + c.diamondCount + c.signatureCount) > c.maxCopies,
  owned: c => (c.normalCount + c.goldenCount + c.diamondCount + c.signatureCount) > 0,
  golden: c => c.goldenCount > 0,
  signature: c => c.signatureCount > 0,
  diamond: c => c.diamondCount > 0,
  free: c => c.freeNormal === true,
}

function parseNumeric(val: string, getter: (c: EnrichedCard) => number | undefined): CardPredicate | null {
  if (val === 'even') return c => { const v = getter(c); return v != null && v % 2 === 0 }
  if (val === 'odd') return c => { const v = getter(c); return v != null && v % 2 === 1 }

  const rangeMatch = val.match(/^(\d+)-(\d+)$/)
  if (rangeMatch) {
    const lo = parseInt(rangeMatch[1])
    const hi = parseInt(rangeMatch[2])
    return c => { const v = getter(c); return v != null && v >= lo && v <= hi }
  }

  if (val.endsWith('+')) {
    const min = parseInt(val)
    if (!isNaN(min)) return c => { const v = getter(c); return v != null && v >= min }
  }

  if (val.endsWith('-')) {
    const max = parseInt(val)
    if (!isNaN(max)) return c => { const v = getter(c); return v != null && v <= max }
  }

  const exact = parseInt(val)
  if (!isNaN(exact)) return c => getter(c) === exact

  return null
}

const NUMERIC_FIELDS: Record<string, (c: EnrichedCard) => number | undefined> = {
  mana: c => c.cost,
  cost: c => c.cost,
  attack: c => c.attack,
  health: c => c.health,
}

function mergeMultiWordTokens(tokens: string[]): string[] {
  const result: string[] = []
  let i = 0
  while (i < tokens.length) {
    if (i + 1 < tokens.length) {
      const pair = tokens[i] + tokens[i + 1]
      if (pair === 'demonhunter' || pair === 'deathknight') {
        result.push(pair)
        i += 2
        continue
      }
    }
    result.push(tokens[i])
    i++
  }
  return result
}

export interface SearchFilters {
  rarities: Set<Rarity>
  ownership: 'all' | 'owned' | 'incomplete' | null
  mode: 'normal' | 'golden' | 'signature' | 'diamond' | null
}

export function extractSearchFilters(query: string): SearchFilters {
  const rarities = new Set<Rarity>()
  let ownership: SearchFilters['ownership'] = null
  let mode: SearchFilters['mode'] = null

  if (!query.trim()) return { rarities, ownership, mode }

  const rawTokens = query.toLowerCase().trim().split(/\s+/)
  const tokens = mergeMultiWordTokens(rawTokens)

  for (const token of tokens) {
    if (token in RARITY_KEYWORDS) rarities.add(RARITY_KEYWORDS[token])
    if (token === 'missing') ownership = 'incomplete'
    if (token === 'owned') ownership = 'owned'
    if (token === 'golden') mode = 'golden'
    if (token === 'signature') mode = 'signature'
    if (token === 'diamond') mode = 'diamond'
  }

  return { rarities, ownership, mode }
}

export function parseSearch(query: string): ParsedSearch {
  const predicates: CardPredicate[] = []
  const textParts: string[] = []

  if (!query.trim()) return { predicates, textParts }

  const rawTokens = query.toLowerCase().trim().split(/\s+/)
  const tokens = mergeMultiWordTokens(rawTokens)

  for (const token of tokens) {
    const colonIdx = token.indexOf(':')
    if (colonIdx > 0) {
      const key = token.slice(0, colonIdx)
      const val = token.slice(colonIdx + 1)
      if (!val) { textParts.push(token); continue }

      if (key in NUMERIC_FIELDS) {
        const pred = parseNumeric(val, NUMERIC_FIELDS[key])
        if (pred) { predicates.push(pred); continue }
      }

      if (key === 'rarity') {
        const r = RARITY_KEYWORDS[val]
        if (r) { predicates.push(c => c.rarity === r); continue }
      }

      if (key === 'type') {
        const t = TYPE_KEYWORDS[val]
        if (t) { predicates.push(c => c.type === t); continue }
      }

      textParts.push(token)
      continue
    }

    if (token in OWNERSHIP_KEYWORDS) {
      predicates.push(OWNERSHIP_KEYWORDS[token])
      continue
    }

    if (token in RARITY_KEYWORDS) {
      const r = RARITY_KEYWORDS[token]
      predicates.push(c => c.rarity === r)
      continue
    }

    if (token in TYPE_KEYWORDS) {
      const t = TYPE_KEYWORDS[token]
      predicates.push(c => c.type === t)
      continue
    }

    if (token in CLASS_KEYWORDS) {
      const cls = CLASS_KEYWORDS[token]
      predicates.push(c => c.cardClass === cls)
      continue
    }

    textParts.push(token)
  }

  return { predicates, textParts }
}
