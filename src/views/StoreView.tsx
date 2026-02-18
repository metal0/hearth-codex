import { useState, useEffect, useMemo, useCallback } from 'react'
import { api } from '../services/api.ts'
import type { ShopBundle, BundleCategory, DealRating, Confidence } from '../services/shopTypes.ts'

const DISMISSED_KEY = 'hc-shop-dismissed'

function getDismissed(): Set<number> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY)
    if (!raw) return new Set()
    return new Set(JSON.parse(raw) as number[])
  } catch { return new Set() }
}

function saveDismissed(ids: Set<number>): void {
  localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids]))
}

const CATEGORY_ORDER: BundleCategory[] = [
  'prepurchase', 'collection', 'miniset', 'ladderready', 'pass', 'cosmetic', 'battlegrounds', 'mercenaries', 'runestone',
]

const CATEGORY_LABELS: Record<BundleCategory, string> = {
  prepurchase: 'Pre-Purchase',
  collection: 'Collection',
  miniset: 'Mini-Sets',
  ladderready: 'Ladder Ready',
  pass: 'Passes',
  cosmetic: 'Cosmetics',
  battlegrounds: 'Battlegrounds',
  mercenaries: 'Mercenaries',
  runestone: 'Runestones',
}

type SortCol = 'rating' | 'title' | 'category' | 'price' | 'savings' | 'expires'

const DEAL_RANK: Record<DealRating | 'estimated', number> = { buy: 3, consider: 2, estimated: 1, skip: 0 }

const DEAL_STYLES: Record<DealRating | 'estimated', { text: string; label: string; dot: string }> = {
  buy:       { text: 'text-green-400',  label: 'BUY',      dot: 'bg-green-400' },
  consider:  { text: 'text-yellow-400', label: 'CONSIDER', dot: 'bg-yellow-400' },
  skip:      { text: 'text-gray-500',   label: 'SKIP',     dot: 'bg-gray-500' },
  estimated: { text: 'text-blue-400',   label: 'EST.',     dot: 'bg-blue-400' },
}

const CONFIDENCE_CONFIG: Record<Confidence, { dot: string; label: string }> = {
  high:   { dot: 'bg-green-400',  label: 'High confidence' },
  medium: { dot: 'bg-yellow-400', label: 'Medium confidence' },
  low:    { dot: 'bg-orange-400', label: 'Low confidence' },
}

function stripHtml(str: string): string {
  return str.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '').trim()
}

function formatPrice(bundle: ShopBundle): string {
  if (bundle.pricing.usd) return `$${bundle.pricing.usd.toFixed(2)}`
  if (bundle.pricing.gold) return `${bundle.pricing.gold.toLocaleString()} gold`
  if (bundle.pricing.runestones) return `${bundle.pricing.runestones.toLocaleString()} RS`
  return 'Free'
}

function isHiddenBundle(b: ShopBundle): boolean {
  if (b.isBonusReward) return true
  if (b.isConditional) return true
  if (!b.isPrePurchase && b.items.length > 0 && b.items.every(i => i.type === 'ticket')) return true
  if (/golden mini[- ]?set/i.test(b.title)) return true
  return false
}

function hasEvaluableContent(b: ShopBundle): boolean {
  if (isHiddenBundle(b)) return false
  if (b.items.length > 0) return true
  if (b.valuation.dealRating !== 'skip') return true
  if (b.valuation.effectiveCostPerPack !== null) return true
  if (b.category === 'miniset') return true
  if (b.category === 'pass' && b.passRewards) return true
  return false
}

function deduplicateBundles(bundles: ShopBundle[]): ShopBundle[] {
  const seen = new Map<string, ShopBundle>()
  for (const b of bundles) {
    const dedupeKey = b.title.replace(/\s*\(Rank\s+\d+\s+of\s+\d+\)/i, '')
    const existing = seen.get(dedupeKey)
    if (!existing) { seen.set(dedupeKey, b); continue }
    const bRank = b.chainRank ?? 999
    const eRank = existing.chainRank ?? 999
    if (bRank < eRank) { seen.set(dedupeKey, b); continue }
    if (bRank === eRank && (
      DEAL_RANK[b.valuation.dealRating] > DEAL_RANK[existing.valuation.dealRating] ||
      b.items.length > existing.items.length
    )) {
      seen.set(dedupeKey, b)
    }
  }
  return [...seen.values()]
}

function primaryRating(b: ShopBundle): DealRating | 'estimated' {
  const d = DEAL_RANK[b.valuation.dealRating]
  const p = DEAL_RANK[b.valuation.personalRating === 'estimated' ? 'estimated' : b.valuation.personalRating]
  if (d >= p) return b.valuation.dealRating
  return b.valuation.personalRating
}

function primaryRank(b: ShopBundle): number {
  return Math.max(DEAL_RANK[b.valuation.dealRating], DEAL_RANK[b.valuation.personalRating === 'estimated' ? 'estimated' : b.valuation.personalRating])
}

function getTimeRemaining(endDate: string): { ms: number; label: string; tier: 'critical' | 'soon' | 'normal' | 'permanent' } {
  const end = new Date(endDate).getTime()
  const now = Date.now()
  const ms = end - now
  if (ms <= 0) return { ms: 0, label: 'Expired', tier: 'normal' }

  const days = ms / (1000 * 60 * 60 * 24)
  if (days > 365) return { ms, label: '', tier: 'permanent' }

  const d = Math.floor(days)
  const h = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))

  if (days < 3) return { ms, label: d > 0 ? `${d}d ${h}h` : `${h}h`, tier: 'critical' }
  if (days < 7) return { ms, label: `${d}d`, tier: 'soon' }
  return { ms, label: `${d}d`, tier: 'normal' }
}

function itemSummary(bundle: ShopBundle): string {
  if (bundle.passRewards) {
    const r = bundle.passRewards
    const parts: string[] = []
    if (r.paidPacks > 0) parts.push(`${r.paidPacks} packs`)
    if (r.paidCards > 0) parts.push(`${r.paidCards} cards`)
    if (r.paidGold > 0) parts.push(`${r.paidGold} gold`)
    if (r.paidTavernTickets > 0) parts.push(`${r.paidTavernTickets} tickets`)
    if (r.paidXpBoosts > 0) parts.push(`${r.paidXpBoosts} XP boosts`)
    if (r.hasDiamond) parts.push('diamond')
    if (r.paidCosmetics > 0) parts.push(`${r.paidCosmetics} cosmetics`)
    return parts.length > 0 ? `Paid track: ${parts.join(' + ')}` : ''
  }

  const parts: string[] = []
  const packs = bundle.items.filter(i => i.type === 'pack')
  const cards = bundle.items.filter(i => i.type === 'card')
  const tickets = bundle.items.filter(i => i.type === 'ticket')
  const cosmetics = bundle.items.filter(i => i.type === 'cosmetic')

  for (const p of packs) {
    const prefix = p.variant === 'golden' ? 'Golden ' : ''
    parts.push(`${p.quantity}x ${prefix}${p.expansion ? p.name : 'Pack'}`)
  }
  for (const c of cards) {
    const vLabel = c.variant && c.variant !== 'normal' ? ` ${c.variant}` : ''
    parts.push(`${c.quantity > 1 ? `${c.quantity}x ` : ''}${c.rarity === 'LEGENDARY' ? 'Legendary' : 'Card'}${vLabel}`)
  }
  for (const t of tickets) parts.push(`${t.quantity}x Tavern Ticket`)
  if (cosmetics.length > 0) parts.push(cosmetics.length === 1 ? cosmetics[0].name : `${cosmetics.length} cosmetics`)

  return parts.join(' + ')
}

function FilterIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="6" y1="12" x2="18" y2="12" />
      <line x1="8" y1="18" x2="16" y2="18" />
    </svg>
  )
}

export default function StoreView() {
  const [bundles, setBundles] = useState<ShopBundle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cacheAgeMs, setCacheAgeMs] = useState<number | null>(null)
  const [dismissed, setDismissedState] = useState<Set<number>>(getDismissed)
  const [showDismissed, setShowDismissed] = useState(false)
  const [showRunestones, setShowRunestones] = useState(false)
  const [showReturning, setShowReturning] = useState(false)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [ratingFilter, setRatingFilter] = useState<DealRating | 'all'>('all')
  const [categoryFilter, setCategoryFilter] = useState<BundleCategory | 'all'>('all')
  const [sortCol, setSortCol] = useState<SortCol>('rating')
  const [sortAsc, setSortAsc] = useState(false)
  const [filtersExpanded, setFiltersExpanded] = useState(false)
  const [searchText, setSearchText] = useState('')

  const fetchBundles = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.getShopBundles()
      setBundles(res.bundles)
      setCacheAgeMs(res.cacheAgeMs)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load shop data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchBundles() }, [fetchBundles])

  const toggleDismiss = useCallback((id: number) => {
    setDismissedState(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      saveDismissed(next)
      return next
    })
  }, [])

  function handleSortClick(col: SortCol) {
    if (sortCol === col) setSortAsc(!sortAsc)
    else { setSortCol(col); setSortAsc(false) }
  }

  const sortIndicator = (col: SortCol) =>
    sortCol === col ? (sortAsc ? ' ^' : ' v') : ''

  const { sorted, stats, activeCats, dismissedCount } = useMemo(() => {
    const deduped = deduplicateBundles(bundles)
    const evaluable = deduped.filter(hasEvaluableContent)

    const dismissedN = evaluable.filter(b => dismissed.has(b.pmtProductId)).length

    let visible = evaluable.filter(b => {
      if (dismissed.has(b.pmtProductId) && !showDismissed) return false
      if (b.category === 'runestone' && !showRunestones) return false
      if (b.eligibilityTag && !showReturning) return false
      if (ratingFilter !== 'all' && primaryRating(b) !== ratingFilter) return false
      if (categoryFilter !== 'all' && b.category !== categoryFilter) return false
      if (searchText) {
        const q = searchText.toLowerCase()
        if (!b.title.toLowerCase().includes(q) && !stripHtml(b.description).toLowerCase().includes(q)) return false
      }
      return true
    })

    const dir = sortAsc ? 1 : -1
    visible.sort((a, b) => {
      switch (sortCol) {
        case 'rating': return dir * (primaryRank(a) - primaryRank(b))
        case 'title': return dir * a.title.localeCompare(b.title)
        case 'category': return dir * (CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category))
        case 'price': return dir * ((a.pricing.usd ?? 0) - (b.pricing.usd ?? 0))
        case 'savings': return dir * ((a.valuation.savingsPercent ?? -999) - (b.valuation.savingsPercent ?? -999))
        case 'expires': return dir * (getTimeRemaining(a.endDate).ms - getTimeRemaining(b.endDate).ms)
        default: return 0
      }
    })

    const buyCount = evaluable.filter(b => primaryRating(b) === 'buy').length
    const considerCount = evaluable.filter(b => primaryRating(b) === 'consider').length

    const cats = new Set<BundleCategory>()
    for (const b of evaluable) {
      if (b.category !== 'runestone') cats.add(b.category)
    }

    return {
      sorted: visible,
      stats: { total: evaluable.length, buy: buyCount, consider: considerCount },
      activeCats: [...cats].sort((a, b) => CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b)),
      dismissedCount: dismissedN,
    }
  }, [bundles, dismissed, showDismissed, showRunestones, showReturning, ratingFilter, categoryFilter, sortCol, sortAsc, searchText])

  const cacheMinutes = cacheAgeMs !== null ? Math.round(cacheAgeMs / 60000) : null
  const hasActiveFilters = ratingFilter !== 'all' || categoryFilter !== 'all' || showReturning || showRunestones || showDismissed

  if (loading && bundles.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-gold/30 border-t-gold rounded-full mx-auto mb-3" />
          <div className="text-sm text-gray-400">Loading shop data...</div>
        </div>
      </div>
    )
  }

  if (error && bundles.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-400 text-sm mb-2">Failed to load shop data</div>
          <div className="text-gray-500 text-xs mb-3">{error}</div>
          <button onClick={fetchBundles} className="text-xs text-gold hover:text-gold/80 transition-colors">Retry</button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-baseline gap-3 mb-4">
        <h1 className="text-xl font-bold text-gold">Store Advisor</h1>
        <span className="text-xs text-gray-500">
          {stats.total} offers
          {cacheMinutes !== null && <> &middot; {cacheMinutes}m ago</>}
        </span>
        {stats.buy > 0 && (
          <span className="text-[10px] font-medium text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded">
            {stats.buy} recommended
          </span>
        )}
        {stats.consider > 0 && (
          <span className="text-[10px] font-medium text-yellow-400 bg-yellow-500/10 px-1.5 py-0.5 rounded">
            {stats.consider} worth considering
          </span>
        )}
      </div>

      {/* Toolbar */}
      <div className="bg-white/5 rounded-t-lg border border-white/10 border-b-0">
        <div className="flex items-center gap-2 px-4 py-2">
          <button
            onClick={() => setFiltersExpanded(!filtersExpanded)}
            title={filtersExpanded ? 'Hide filters' : 'Show filters'}
            className={`p-1.5 rounded border transition-colors ${
              filtersExpanded || hasActiveFilters
                ? 'bg-gold/15 text-gold border-gold/30'
                : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10 hover:text-gray-300'
            }`}
          >
            <FilterIcon />
          </button>

          <div className="relative w-48">
            <input
              type="text"
              placeholder="Search bundles..."
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              className="bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm w-full pr-7 placeholder:text-gray-500 focus:outline-none focus:border-gold/50"
            />
            {searchText && (
              <button
                onClick={() => setSearchText('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-gray-500 hover:text-gray-300 transition-colors"
              >
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>

          {/* Rating filter — compact dots with hover expand */}
          <div className="flex rounded overflow-hidden border border-white/10">
            <button
              onClick={() => setRatingFilter('all')}
              className={`px-3 py-1.5 text-xs transition-colors ${
                ratingFilter === 'all' ? 'bg-gold/20 text-gold' : 'bg-white/5 text-gray-400 hover:text-gray-200'
              }`}
            >
              All
            </button>
            {(['buy', 'consider', 'skip'] as const).map(r => (
              <button
                key={r}
                onClick={() => setRatingFilter(ratingFilter === r ? 'all' : r)}
                title={DEAL_STYLES[r].label}
                className={`group flex items-center gap-1 px-2 py-1.5 text-xs transition-colors ${
                  ratingFilter === r ? 'bg-gold/20 text-gold' : 'bg-white/5 text-gray-400 hover:text-gray-200'
                }`}
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${DEAL_STYLES[r].dot}`} />
                <span className="max-w-0 group-hover:max-w-16 overflow-hidden transition-all duration-150 whitespace-nowrap">
                  {DEAL_STYLES[r].label}
                </span>
              </button>
            ))}
          </div>

          <span className="text-xs text-gray-500 ml-auto">{sorted.length} bundles</span>
        </div>

        {/* Collapseable filters */}
        {filtersExpanded && (
          <div className="border-t border-white/5 pt-2 pb-3 px-4 space-y-2">
            <div className="flex flex-wrap gap-2 items-center">
              {/* Category pills */}
              <div className="flex rounded overflow-hidden border border-white/10">
                <button
                  onClick={() => setCategoryFilter('all')}
                  className={`px-3 py-1.5 text-xs ${
                    categoryFilter === 'all' ? 'bg-gold/20 text-gold' : 'bg-white/5 text-gray-400 hover:text-gray-200'
                  }`}
                >
                  All
                </button>
                {activeCats.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(categoryFilter === cat ? 'all' : cat)}
                    className={`px-3 py-1.5 text-xs ${
                      categoryFilter === cat ? 'bg-gold/20 text-gold' : 'bg-white/5 text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    {CATEGORY_LABELS[cat]}
                  </button>
                ))}
              </div>

              {/* Toggle filters */}
              <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showReturning}
                  onChange={e => setShowReturning(e.target.checked)}
                  className="accent-gold"
                />
                Eligibility Offers
              </label>
              <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showRunestones}
                  onChange={e => setShowRunestones(e.target.checked)}
                  className="accent-gold"
                />
                Runestones
              </label>
              {dismissedCount > 0 && (
                <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showDismissed}
                    onChange={e => setShowDismissed(e.target.checked)}
                    className="accent-gold"
                  />
                  Dismissed ({dismissedCount})
                </label>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white/5 rounded-b-lg border border-white/10 border-t-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-gray-400 text-xs select-none">
              <th className="text-left px-4 py-3 cursor-pointer hover:text-white w-20" onClick={() => handleSortClick('rating')}>
                Rating{sortIndicator('rating')}
              </th>
              <th className="text-left px-4 py-3 cursor-pointer hover:text-white" onClick={() => handleSortClick('title')}>
                Bundle{sortIndicator('title')}
              </th>
              <th className="text-left px-4 py-3 cursor-pointer hover:text-white w-28" onClick={() => handleSortClick('category')}>
                Category{sortIndicator('category')}
              </th>
              <th className="text-right px-4 py-3 cursor-pointer hover:text-white w-24" onClick={() => handleSortClick('price')}>
                Price{sortIndicator('price')}
              </th>
              <th className="text-right px-4 py-3 cursor-pointer hover:text-white w-20" onClick={() => handleSortClick('savings')}>
                Savings{sortIndicator('savings')}
              </th>
              <th className="text-right px-4 py-3 cursor-pointer hover:text-white w-20" onClick={() => handleSortClick('expires')}>
                Expires{sortIndicator('expires')}
              </th>
              <th className="w-16 px-2 py-3" />
            </tr>
          </thead>
          <tbody>
            {sorted.map(bundle => {
              const rating = primaryRating(bundle)
              const style = DEAL_STYLES[rating]
              const time = getTimeRemaining(bundle.endDate)
              const confCfg = CONFIDENCE_CONFIG[bundle.valuation.confidence]
              const isExpanded = expandedId === bundle.pmtProductId
              const isDismissed = dismissed.has(bundle.pmtProductId)
              const summary = itemSummary(bundle)

              return (
                <tr
                  key={bundle.pmtProductId}
                  onClick={() => setExpandedId(isExpanded ? null : bundle.pmtProductId)}
                  className={`border-b border-white/5 cursor-pointer transition-colors ${
                    isDismissed ? 'opacity-40' : ''
                  } ${isExpanded ? 'bg-white/[0.03]' : 'hover:bg-white/[0.02]'}`}
                >
                  <td className="px-4 py-3">
                    <span className={`font-bold text-xs ${style.text}`}>{style.label}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium">{bundle.title}</span>
                      {bundle.isPrePurchase && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400 font-medium">PRE-ORDER</span>
                      )}
                      {bundle.chainRank !== null && bundle.chainTotal !== null && bundle.chainTotal > 1 && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 font-medium">{bundle.chainRank} of {bundle.chainTotal}</span>
                      )}
                      {bundle.eligibilityTag && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-gray-500">{bundle.eligibilityTag}</span>
                      )}
                    </div>
                    {summary && (
                      <div className="text-[11px] text-gray-400 mt-0.5 truncate max-w-md">{summary}</div>
                    )}

                    {isExpanded && (
                      <div className="mt-3 border-t border-white/5 pt-3">
                        <div className="grid grid-cols-2 gap-6">
                          {/* Contents */}
                          <div>
                            <div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium mb-2">Contents</div>
                            {bundle.passRewards ? (
                              <div className="space-y-1">
                                {bundle.passRewards.paidPacks > 0 && (
                                  <div className="flex items-center gap-2 text-xs">
                                    <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-blue-400" />
                                    <span className="text-gray-300">{bundle.passRewards.paidPacks}x Card Packs</span>
                                  </div>
                                )}
                                {bundle.passRewards.paidCards > 0 && (
                                  <div className="flex items-center gap-2 text-xs">
                                    <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-amber-400" />
                                    <span className="text-gray-300">{bundle.passRewards.paidCards}x Golden/Signature Cards</span>
                                  </div>
                                )}
                                {bundle.passRewards.paidGold > 0 && (
                                  <div className="flex items-center gap-2 text-xs">
                                    <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-yellow-400" />
                                    <span className="text-gray-300">{bundle.passRewards.paidGold.toLocaleString()} Gold</span>
                                  </div>
                                )}
                                {bundle.passRewards.paidTavernTickets > 0 && (
                                  <div className="flex items-center gap-2 text-xs">
                                    <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-purple-400" />
                                    <span className="text-gray-300">{bundle.passRewards.paidTavernTickets}x Tavern Tickets</span>
                                  </div>
                                )}
                                {bundle.passRewards.hasDiamond && (
                                  <div className="flex items-center gap-2 text-xs">
                                    <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-cyan-400" />
                                    <span className="text-gray-300">Diamond Card</span>
                                  </div>
                                )}
                                {bundle.passRewards.paidXpBoosts > 0 && (
                                  <div className="flex items-center gap-2 text-xs">
                                    <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-emerald-400" />
                                    <span className="text-gray-300">{bundle.passRewards.paidXpBoosts}x XP Boosts</span>
                                  </div>
                                )}
                                {bundle.passRewards.paidCosmetics > 0 && (
                                  <div className="flex items-center gap-2 text-xs">
                                    <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-pink-400" />
                                    <span className="text-gray-300">{bundle.passRewards.paidCosmetics} Cosmetics</span>
                                  </div>
                                )}
                                <div className="text-[10px] text-gray-400 mt-1">Paid-track exclusive rewards from {bundle.passRewards.trackName}</div>
                              </div>
                            ) : bundle.items.length > 0 ? (
                              <div className="space-y-1">
                                {bundle.items.map((item, i) => (
                                  <div key={i} className="flex items-center gap-2 text-xs">
                                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                      item.type === 'pack' ? 'bg-blue-400' :
                                      item.type === 'card' ? 'bg-amber-400' :
                                      item.type === 'ticket' ? 'bg-purple-400' :
                                      item.type === 'cosmetic' ? 'bg-pink-400' :
                                      'bg-gray-600'
                                    }`} />
                                    <span className={item.resolved ? 'text-gray-300' : 'text-gray-500'}>
                                      {item.quantity > 1 ? `${item.quantity}x ` : ''}{item.name}
                                    </span>
                                    {item.variant && item.variant !== 'normal' && (
                                      <span className={`text-[9px] px-1 rounded font-medium ${
                                        item.variant === 'golden' ? 'text-yellow-500 bg-yellow-500/10' :
                                        item.variant === 'signature' ? 'text-purple-400 bg-purple-500/10' :
                                        'text-cyan-400 bg-cyan-500/10'
                                      }`}>
                                        {item.variant}
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : bundle.description ? (
                              <p className="text-xs text-gray-500 whitespace-pre-line leading-relaxed">{stripHtml(bundle.description).slice(0, 300)}</p>
                            ) : (
                              <span className="text-xs text-gray-400 italic">No content data</span>
                            )}
                          </div>

                          {/* Valuation */}
                          <div className="space-y-3">
                            <div>
                              <div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium mb-1">Deal Quality</div>
                              <p className="text-xs text-gray-400 leading-relaxed">{bundle.valuation.dealReason}</p>
                              {bundle.valuation.effectiveCostPerPack !== null && (
                                <div className="text-[10px] text-gray-400 mt-0.5">
                                  ${bundle.valuation.effectiveCostPerPack.toFixed(2)}/pack vs ${bundle.valuation.baselineCostPerPack.toFixed(2)} baseline
                                </div>
                              )}
                            </div>
                            <div>
                              <div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium mb-1">Personal Value</div>
                              <p className="text-xs text-gray-400 leading-relaxed">{bundle.valuation.personalReason}</p>
                              {bundle.valuation.collectionDelta !== null && bundle.valuation.collectionDelta > 0 && (
                                <div className="text-[10px] text-green-500 mt-0.5">+{bundle.valuation.collectionDelta}% collection</div>
                              )}
                              {bundle.valuation.expectedDust !== null && (
                                <div className="text-[10px] text-gray-400 mt-0.5">~{bundle.valuation.expectedDust.toLocaleString()} dust</div>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
                              <div className={`w-1.5 h-1.5 rounded-full ${confCfg.dot}`} />
                              <span>{confCfg.label}</span>
                              {bundle.valuation.confidenceReason && (
                                <span className="text-gray-500">— {bundle.valuation.confidenceReason}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-300 text-xs align-top">{CATEGORY_LABELS[bundle.category]}</td>
                  <td className="px-4 py-3 text-right align-top">
                    <span className="text-gold font-medium">{formatPrice(bundle)}</span>
                    {bundle.pricing.usd && bundle.pricing.gold && (
                      <div className="text-[10px] text-yellow-600">{bundle.pricing.gold.toLocaleString()} gold</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right align-top">
                    {bundle.valuation.savingsPercent !== null && bundle.valuation.savingsPercent > 0 ? (
                      <span className={`font-bold ${
                        bundle.valuation.savingsPercent >= 30 ? 'text-green-400' :
                        bundle.valuation.savingsPercent >= 10 ? 'text-yellow-400' : 'text-gray-500'
                      }`}>
                        -{bundle.valuation.savingsPercent}%
                      </span>
                    ) : bundle.valuation.effectiveCostPerPack !== null ? (
                      <span className="text-[10px] text-gray-400">${bundle.valuation.effectiveCostPerPack.toFixed(2)}/pk</span>
                    ) : (
                      <span className="text-gray-500">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right align-top">
                    {time.tier !== 'permanent' && time.label ? (
                      <span className={`text-xs ${
                        time.tier === 'critical' ? 'text-red-400 font-medium' :
                        time.tier === 'soon' ? 'text-orange-400' : 'text-gray-300'
                      }`}>
                        {time.label}
                      </span>
                    ) : (
                      <span className="text-[10px] text-gray-500">perm</span>
                    )}
                  </td>
                  <td className="px-2 py-3 text-center align-top">
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleDismiss(bundle.pmtProductId) }}
                      className="text-[10px] text-gray-400 hover:text-red-400 transition-colors"
                    >
                      {isDismissed ? 'Restore' : 'Dismiss'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {sorted.length === 0 && (
          <div className="text-center py-12 text-gray-500 text-sm">No bundles match the current filters.</div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center mt-4 text-[10px] text-gray-400">
        <span>Data from hearthstone.wiki.gg</span>
      </div>
    </div>
  )
}
