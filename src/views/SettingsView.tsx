import { useState, useEffect } from 'react'
import { useStore } from '../stores/store.ts'
import { api, setStoredToken, setStoredAccountId, setAuthTier } from '../services/api.ts'
import { FREE_BRACKET, bracketLabel } from '../types.ts'
import { Dropdown } from '../components/FilterBar.tsx'

export default function SettingsView() {
  const authTier = useStore(s => s.authTier)
  const syncCollection = useStore(s => s.syncCollection)
  const syncLoading = useStore(s => s.syncLoading)
  const fetchCards = useStore(s => s.fetchCards)
  const fetchMeta = useStore(s => s.fetchMeta)
  const addToast = useStore(s => s.addToast)
  const hostedMode = useStore(s => s.hostedMode)
  const battletag = useStore(s => s.battletag)
  const isPremium = useStore(s => s.isPremium)
  const premiumConsent = useStore(s => s.premiumConsent)
  const metaBracket = useStore(s => s.metaBracket)
  const availableBrackets = useStore(s => s.availableBrackets)
  const setMetaBracket = useStore(s => s.setMetaBracket)
  const fetchBrackets = useStore(s => s.fetchBrackets)
  const setPremiumConsent = useStore(s => s.setPremiumConsent)

  const [upgradeInput, setUpgradeInput] = useState('')
  const [upgradeLoading, setUpgradeLoading] = useState(false)
  const [upgradeError, setUpgradeError] = useState('')
  const [sessionInput, setSessionInput] = useState('')
  const [showReauth, setShowReauth] = useState(false)
  const [reauthLoading, setReauthLoading] = useState(false)
  const [syncResult, setSyncResult] = useState<{ success: boolean; message: string } | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshingMeta, setRefreshingMeta] = useState(false)
  const [cfStatus, setCfStatus] = useState<{ valid: boolean; expiresIn: number } | null>(null)
  const [cfSolving, setCfSolving] = useState(false)
  const [cacheStats, setCacheStats] = useState<{ cached: number; missed: number; totalCards: number; variants: Record<string, { cached: number; missed: number; total: number }> } | null>(null)

  const availableKeys = new Set(availableBrackets.map(b => b.key))

  const ALL_BRACKET_KEYS = [
    'BRONZE_THROUGH_GOLD__CURRENT_PATCH',
    'BRONZE_THROUGH_GOLD__CURRENT_EXPANSION',
    'DIAMOND_THROUGH_LEGEND__CURRENT_PATCH',
    'DIAMOND_THROUGH_LEGEND__CURRENT_EXPANSION',
    'ALL__LAST_7_DAYS',
    'ALL__LAST_14_DAYS',
  ]

  useEffect(() => {
    api.getDataStatus().then(status => {
      setCfStatus(status.cf)
    }).catch(() => {})
    api.getArtCacheStats().then(setCacheStats).catch(() => {})
    fetchBrackets().catch(() => {})
  }, [])

  async function handleReauth() {
    const trimmed = sessionInput.trim()
    if (!trimmed) return
    setReauthLoading(true)
    setSyncResult(null)
    try {
      const result = await api.syncCollection(trimmed)
      if (result.sessionExpired === false || result.success) {
        setShowReauth(false)
        setSessionInput('')
        const msg = `Session updated. Collection synced: ${result.cards?.toLocaleString()} cards, ${result.dust?.toLocaleString()} dust`
        setSyncResult({ success: true, message: msg })
        addToast(msg, 'success')
      } else {
        setSyncResult({ success: false, message: result.error || 'Invalid session cookie' })
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update session'
      setSyncResult({ success: false, message: msg })
    } finally {
      setReauthLoading(false)
    }
  }

  async function handleSync() {
    setSyncResult(null)
    const result = await syncCollection()
    if (result.success) {
      const msg = `Collection synced: ${result.cards?.toLocaleString()} cards, ${result.dust?.toLocaleString()} dust`
      setSyncResult({ success: true, message: msg })
      addToast(msg, 'success')
    } else {
      const isExpired = result.error?.includes('401') || result.error?.includes('expired')
      if (isExpired) setShowReauth(true)
      setSyncResult({ success: false, message: result.error || 'Sync failed' })
    }
  }

  async function handleUpgrade() {
    const trimmed = upgradeInput.trim()
    if (!trimmed) return
    setUpgradeLoading(true)
    setUpgradeError('')
    try {
      const result = await api.register(trimmed)
      if (result.success && result.token) {
        setStoredToken(result.token)
        if (result.accountLo) setStoredAccountId(result.accountLo)
        setAuthTier('full')
        window.location.reload()
      } else {
        setUpgradeError(result.error || 'Upgrade failed')
      }
    } catch (err: unknown) {
      setUpgradeError(err instanceof Error ? err.message : 'Connection failed')
    } finally {
      setUpgradeLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-xl font-bold text-gold mb-6">Settings</h1>

      {authTier === 'collection' && (
        <section className="bg-amber-900/20 rounded-lg border border-amber-500/30 p-5 mb-6">
          <h2 className="text-sm font-bold text-amber-400 mb-2">Upgrade to Full Account</h2>
          <p className="text-xs text-gray-400 mb-3">
            Connect your HSReplay session ID to unlock persistent settings, collection history, and premium stat brackets.
          </p>
          <div className="bg-white/5 rounded-lg p-3 mb-3 border border-white/5">
            <ol className="text-[11px] text-gray-400 space-y-1">
              <li className="flex gap-2">
                <span className="text-amber-400 shrink-0">1.</span>
                <span>Open <a href="https://hsreplay.net" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline hover:text-blue-300">hsreplay.net</a> and log in</span>
              </li>
              <li className="flex gap-2">
                <span className="text-amber-400 shrink-0">2.</span>
                <span>Open DevTools (<code className="px-1 bg-white/10 rounded text-[10px]">F12</code>) &rarr; Application &rarr; Cookies &rarr; hsreplay.net</span>
              </li>
              <li className="flex gap-2">
                <span className="text-amber-400 shrink-0">3.</span>
                <span>Copy the <code className="px-1 bg-white/10 rounded text-[10px] text-gold/70">sessionid</code> cookie value</span>
              </li>
            </ol>
          </div>
          <div className="flex gap-2">
            <input
              type="password"
              placeholder="Paste your HSReplay session ID"
              value={upgradeInput}
              onChange={e => setUpgradeInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleUpgrade()}
              className="flex-1 bg-white/5 border border-white/10 rounded px-3 py-2 text-sm
                         font-mono text-gray-300 placeholder:text-gray-600
                         focus:outline-none focus:border-amber-500/50"
            />
            <button
              onClick={handleUpgrade}
              disabled={upgradeLoading || !upgradeInput.trim()}
              className="px-4 py-2 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded text-sm
                         hover:bg-amber-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {upgradeLoading ? 'Upgrading...' : 'Upgrade'}
            </button>
          </div>
          {upgradeError && <p className="text-red-400 text-xs mt-2">{upgradeError}</p>}
        </section>
      )}

      {/* Collection Sync */}
      <section className="bg-white/5 rounded-lg border border-white/10 p-5 mb-6">
        <h2 className="text-sm font-bold text-white mb-3">Collection Sync</h2>
        <div className="flex gap-2 mb-4">
          <button
            onClick={handleSync}
            disabled={syncLoading}
            className="px-6 py-2 bg-gold text-navy-dark font-bold rounded text-sm
                       hover:bg-gold-dim transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {syncLoading ? 'Syncing...' : 'Sync Collection'}
          </button>
          {authTier === 'full' && (
            <button
              onClick={() => setShowReauth(!showReauth)}
              className="px-4 py-2 bg-white/10 text-gray-300 rounded text-sm hover:bg-white/15 transition-colors"
            >
              Update Session
            </button>
          )}
        </div>

        {showReauth && (
          <div className="bg-navy/50 rounded-lg border border-white/5 p-4 mb-4">
            <p className="text-xs text-gray-400 mb-2">If your HSReplay session expired, paste a new <code className="px-1 py-0.5 bg-white/10 rounded text-[10px] text-gold/70">sessionid</code> cookie here.</p>
            <div className="flex gap-2">
              <input
                type="password"
                placeholder="Paste new sessionid..."
                value={sessionInput}
                onChange={e => setSessionInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleReauth()}
                className="flex-1 bg-white/5 border border-white/10 rounded px-3 py-2 text-sm
                           font-mono text-gray-300 placeholder:text-gray-600
                           focus:outline-none focus:border-gold/50"
              />
              <button
                onClick={handleReauth}
                disabled={reauthLoading || !sessionInput.trim()}
                className="px-4 py-2 bg-gold/20 text-gold border border-gold/30 rounded text-sm
                           hover:bg-gold/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {reauthLoading ? 'Updating...' : 'Update'}
              </button>
            </div>
          </div>
        )}

        {syncLoading && (
          <div className="mt-3">
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-gold rounded-full animate-pulse" style={{ width: '60%', transition: 'width 2s ease' }} />
            </div>
            <p className="text-[10px] text-gray-500 mt-1">Connecting to HSReplay and downloading collection...</p>
          </div>
        )}

        {!syncLoading && syncResult && (
          <div
            className={`mt-3 rounded-lg p-3 text-sm ${
              syncResult.success
                ? 'bg-green-900/30 border border-green-500/30 text-green-300'
                : 'bg-red-900/30 border border-red-500/30 text-red-300'
            }`}
          >
            {syncResult.message}
          </div>
        )}
      </section>

      {/* Account Info */}
      {battletag && (
        <section className="bg-white/5 rounded-lg border border-white/10 p-5 mb-6">
          <h2 className="text-sm font-bold text-white mb-3">Account</h2>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-300">{battletag}</span>
            {isPremium && (
              <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded">
                Premium
              </span>
            )}
          </div>
          {isPremium && hostedMode && authTier === 'full' && (
            <div className="mt-4 pt-4 border-t border-white/5">
              <label className="flex items-start gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={premiumConsent}
                  onChange={e => setPremiumConsent(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-white/20 bg-white/5 text-gold
                             focus:ring-gold/30 focus:ring-offset-0 cursor-pointer"
                />
                <div>
                  <span className="text-sm text-gray-300 group-hover:text-white transition-colors">
                    Share my premium session for stats collection
                  </span>
                  <p className="text-[10px] text-gray-500 mt-1 leading-relaxed">
                    Your HSReplay session will be used server-side to fetch premium stat brackets
                    for all users. In extreme cases, HSReplay could restrict your account.
                  </p>
                </div>
              </label>
            </div>
          )}
        </section>
      )}

      {/* Meta Stats Bracket */}
      {authTier === 'full' && (
        <section className="bg-white/5 rounded-lg border border-white/10 p-5 mb-6">
          <h2 className="text-sm font-bold text-white mb-3">Meta Stats Bracket</h2>
          <p className="text-xs text-gray-400 mb-3">
            Choose which rank range and time period to use for card play rate and win rate stats.
            Premium brackets require at least one consenting premium user.
          </p>
          <div className="mb-3">
            <Dropdown
              label="Bracket"
              options={ALL_BRACKET_KEYS.map(key => ({
                value: key,
                label: `${bracketLabel(key)}${!availableKeys.has(key) ? ' (unavailable)' : ''}`,
              }))}
              value={metaBracket}
              onChange={setMetaBracket}
            />
          </div>
          {!availableKeys.has(metaBracket) && metaBracket !== FREE_BRACKET && (
            <p className="text-[10px] text-amber-400/80">
              Selected bracket is currently unavailable. Free bracket will be used as fallback.
            </p>
          )}
        </section>
      )}

      {!hostedMode && (
        <>
          {/* Card Database */}
          <section className="bg-white/5 rounded-lg border border-white/10 p-5 mb-6">
            <h2 className="text-sm font-bold text-white mb-3">Card Database</h2>
            <p className="text-xs text-gray-400 mb-3">
              Re-fetch the card database from HearthstoneJSON. This updates card names,
              images, and stats for all expansions.
            </p>
            <button
              onClick={async () => {
                setRefreshing(true)
                try {
                  const result = await api.refreshCards()
                  if (result.artVersion) useStore.setState({ artVersion: result.artVersion })
                  await fetchCards()
                  setSyncResult({ success: true, message: `Card database refreshed: ${result.count} cards` })
                } catch (err: unknown) {
                  const message = err instanceof Error ? err.message : 'Failed to refresh'
                  setSyncResult({ success: false, message })
                } finally {
                  setRefreshing(false)
                }
              }}
              disabled={refreshing}
              className="px-4 py-2 bg-white/10 text-gray-300 rounded text-sm
                         hover:bg-white/15 transition-colors disabled:opacity-40"
            >
              {refreshing ? 'Refreshing...' : 'Refresh Card Database'}
            </button>
          </section>

          {/* Meta Stats */}
          <section className="bg-white/5 rounded-lg border border-white/10 p-5 mb-6">
            <h2 className="text-sm font-bold text-white mb-3">Meta Stats</h2>
            <p className="text-xs text-gray-400 mb-3">
              Refresh all stat brackets from HSReplay. Auto-refreshes every 12 hours.
            </p>
            <button
              onClick={async () => {
                setRefreshingMeta(true)
                try {
                  const result = await api.refreshMeta()
                  await Promise.all([fetchMeta(), fetchBrackets()])
                  const bracketMsg = result.brackets ? ` (${result.brackets} brackets)` : ''
                  setSyncResult({ success: true, message: `Meta stats refreshed: ${result.count} cards${bracketMsg}` })
                } catch (err: unknown) {
                  const message = err instanceof Error ? err.message : 'Failed to refresh meta'
                  setSyncResult({ success: false, message })
                } finally {
                  setRefreshingMeta(false)
                }
              }}
              disabled={refreshingMeta}
              className="px-4 py-2 bg-white/10 text-gray-300 rounded text-sm
                         hover:bg-white/15 transition-colors disabled:opacity-40"
            >
              {refreshingMeta ? 'Refreshing...' : 'Refresh Meta Stats'}
            </button>
          </section>
        </>
      )}

      {/* Card Art Cache */}
      <section className="bg-white/5 rounded-lg border border-white/10 p-5 mb-6">
        <h2 className="text-sm font-bold text-white mb-3">Card Art Cache</h2>
        <p className="text-xs text-gray-400 mb-3">
          Card art (golden, signature, diamond variants) is cached locally to avoid repeated
          requests to external sources. Clear the cache if card art appears incorrect or outdated.
        </p>
        {cacheStats && (
          <div className="mb-3 space-y-2">
            <div className="flex gap-4 text-xs">
              <span className="text-green-400">{cacheStats.cached.toLocaleString()} cached</span>
              <span className="text-gray-500">{cacheStats.missed.toLocaleString()} unavailable</span>
              {cacheStats.totalCards > 0 && (
                <span className="text-gray-600">{(cacheStats.totalCards * 4).toLocaleString()} total</span>
              )}
            </div>
            {cacheStats.variants && (
              <div className="grid grid-cols-4 gap-2 text-[10px]">
                {(['normal', 'golden', 'signature', 'diamond'] as const).map(v => {
                  const s = cacheStats.variants[v];
                  if (!s) return null;
                  const label = v[0].toUpperCase() + v.slice(1);
                  const color = { normal: 'text-gray-400', golden: 'text-yellow-400', signature: 'text-purple-400', diamond: 'text-cyan-300' }[v];
                  const checked = s.cached + s.missed;
                  const pct = s.total > 0 ? Math.round(checked / s.total * 100) : 0;
                  return (
                    <div key={v} className="bg-white/5 rounded px-2 py-1.5">
                      <div className={`font-medium ${color}`}>{label}</div>
                      <div className="text-gray-400">{s.cached.toLocaleString()} <span className="text-gray-600">cached</span></div>
                      <div className="text-gray-500">{s.missed.toLocaleString()} <span className="text-gray-600">miss</span></div>
                      {s.total > 0 && (
                        <div className="mt-1">
                          <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                            <div className="h-full bg-green-500/40 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                          <div className="text-gray-600 mt-0.5">{checked}/{s.total.toLocaleString()} ({pct}%)</div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {!hostedMode && (
          <button
            onClick={async () => {
              try {
                const result = await api.clearArtCache()
                if (result.artVersion) useStore.setState({ artVersion: result.artVersion })
                setSyncResult({ success: true, message: `Art cache cleared: ${result.missCleared} miss files removed` })
                const tc = cacheStats?.totalCards ?? 0;
                setCacheStats({ cached: 0, missed: 0, totalCards: tc, variants: { normal: { cached: 0, missed: 0, total: tc }, golden: { cached: 0, missed: 0, total: tc }, signature: { cached: 0, missed: 0, total: tc }, diamond: { cached: 0, missed: 0, total: tc } } })
              } catch {
                setSyncResult({ success: false, message: 'Failed to clear art cache' })
              }
            }}
            className="px-4 py-2 bg-white/10 text-gray-300 rounded text-sm
                       hover:bg-white/15 transition-colors"
          >
            Clear Art Cache
          </button>
        )}
      </section>

      {!hostedMode && (
        <section className="bg-white/5 rounded-lg border border-white/10 p-5 mb-6">
          <h2 className="text-sm font-bold text-white mb-3">Cloudflare Clearance</h2>
          <p className="text-xs text-gray-400 mb-3">
            HSReplay uses Cloudflare protection. A valid clearance is required for collection sync and meta stats.
          </p>
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-2.5 h-2.5 rounded-full ${cfStatus?.valid ? 'bg-green-400' : 'bg-red-400'}`} />
            <span className="text-sm text-gray-300">
              {cfStatus === null
                ? 'Checking...'
                : cfStatus.valid
                  ? `Active (expires in ${Math.round(cfStatus.expiresIn / 60)}m)`
                  : 'Expired or not solved'}
            </span>
          </div>
          <button
            onClick={async () => {
              setCfSolving(true)
              try {
                const res = await fetch('/api/cf/solve', { method: 'POST' })
                const data = await res.json() as { success?: boolean; expiresIn?: number; error?: string }
                if (data.success) {
                  setCfStatus({ valid: true, expiresIn: data.expiresIn ?? 1800 })
                  setSyncResult({ success: true, message: 'Cloudflare challenge solved' })
                } else {
                  setSyncResult({ success: false, message: data.error ?? 'Failed to solve Cloudflare challenge' })
                }
              } catch {
                setSyncResult({ success: false, message: 'Failed to reach server for CF solve' })
              } finally {
                setCfSolving(false)
              }
            }}
            disabled={cfSolving}
            className="px-4 py-2 bg-white/10 text-gray-300 rounded text-sm
                       hover:bg-white/15 transition-colors disabled:opacity-40"
          >
            {cfSolving ? 'Solving...' : 'Solve Cloudflare Challenge'}
          </button>
        </section>
      )}

      {syncResult && !syncLoading && (
        <div
          className={`rounded-lg p-4 text-sm ${
            syncResult.success
              ? 'bg-green-900/30 border border-green-500/30 text-green-300'
              : 'bg-red-900/30 border border-red-500/30 text-red-300'
          }`}
        >
          {syncResult.message}
        </div>
      )}
    </div>
  )
}
