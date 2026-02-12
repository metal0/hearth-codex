import { useState, useEffect } from 'react'
import { useStore } from '../stores/store.ts'
import { api } from '../services/api.ts'

export default function SettingsView() {
  const syncCollection = useStore(s => s.syncCollection)
  const syncLoading = useStore(s => s.syncLoading)
  const fetchCards = useStore(s => s.fetchCards)
  const fetchMeta = useStore(s => s.fetchMeta)
  const addToast = useStore(s => s.addToast)
  const hsSessionId = useStore(s => s.hsSessionId)
  const setHsSessionId = useStore(s => s.setHsSessionId)

  const [sessionInput, setSessionInput] = useState(hsSessionId || '')
  const [syncResult, setSyncResult] = useState<{ success: boolean; message: string } | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshingMeta, setRefreshingMeta] = useState(false)
  const [cfStatus, setCfStatus] = useState<{ valid: boolean; expiresIn: number } | null>(null)
  const [cfSolving, setCfSolving] = useState(false)
  const [cacheStats, setCacheStats] = useState<{ cached: number; missed: number; totalCards: number; variants: Record<string, { cached: number; missed: number; total: number }> } | null>(null)

  useEffect(() => {
    api.getDataStatus().then(status => {
      setCfStatus(status.cf)
    }).catch(() => {})

    api.getArtCacheStats().then(setCacheStats).catch(() => {})
  }, [])

  function handleSave() {
    const trimmed = sessionInput.trim()
    setHsSessionId(trimmed || null)
    setSyncResult({ success: true, message: trimmed ? 'Session cookie saved locally' : 'Session cookie cleared' })
  }

  async function handleSync() {
    setSyncResult(null)
    const result = await syncCollection()
    if (result.success) {
      const msg = `Collection synced: ${result.cards?.toLocaleString()} cards, ${result.dust?.toLocaleString()} dust`
      setSyncResult({ success: true, message: msg })
      addToast(msg, 'success')
    } else {
      setSyncResult({ success: false, message: result.error || 'Sync failed' })
    }
  }

  async function handleRefreshCardDb() {
    setRefreshing(true)
    try {
      const result = await api.refreshCards()
      await fetchCards()
      setSyncResult({ success: true, message: `Card database refreshed: ${result.count} cards` })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to refresh'
      setSyncResult({ success: false, message })
    } finally {
      setRefreshing(false)
    }
  }

  const isConnected = !!hsSessionId
  const inputChanged = sessionInput.trim() !== (hsSessionId || '')

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-xl font-bold text-gold mb-6">Settings</h1>

      {/* HSReplay Connection */}
      <section className="bg-white/5 rounded-lg border border-white/10 p-5 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-sm font-bold text-white">HSReplay Connection</h2>
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-gray-500'}`} />
          <span className="text-[10px] text-gray-500">{isConnected ? 'Connected' : 'Not connected'}</span>
        </div>

        <div className="bg-navy/50 rounded-lg border border-white/5 p-4 mb-4">
          <p className="text-xs text-gray-400 leading-relaxed mb-2 font-medium">How to connect:</p>
          <ol className="text-xs text-gray-500 leading-relaxed space-y-1 list-decimal list-inside">
            <li>Open <a href="https://hsreplay.net" target="_blank" rel="noopener noreferrer" className="text-gold/70 hover:text-gold">hsreplay.net</a> in a new tab and log in</li>
            <li>Press <kbd className="px-1 py-0.5 bg-white/10 rounded text-[10px]">F12</kbd> to open DevTools</li>
            <li>Go to <span className="text-gray-300">Application</span> &gt; <span className="text-gray-300">Cookies</span> &gt; <span className="text-gray-300">hsreplay.net</span></li>
            <li>Copy the value of the <code className="px-1 py-0.5 bg-white/10 rounded text-[10px] text-gold/70">sessionid</code> cookie</li>
            <li>Paste it below and click Save</li>
          </ol>
          <p className="text-[10px] text-gray-600 mt-2">Your session cookie is stored locally in your browser and never sent to any third party.</p>
        </div>

        <label className="block text-xs text-gray-500 mb-1">sessionid</label>
        <div className="flex gap-2 mb-4">
          <input
            type="password"
            placeholder="Paste sessionid cookie value..."
            value={sessionInput}
            onChange={e => setSessionInput(e.target.value)}
            className="flex-1 bg-white/5 border border-white/10 rounded px-3 py-2 text-sm
                       font-mono text-gray-300 placeholder:text-gray-600
                       focus:outline-none focus:border-gold/50"
          />
          <button
            onClick={handleSave}
            disabled={!inputChanged}
            className="px-4 py-2 bg-white/10 text-gray-300 rounded text-sm
                       hover:bg-white/15 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Save
          </button>
          {isConnected && (
            <button
              onClick={() => { setSessionInput(''); setHsSessionId(null); setSyncResult({ success: true, message: 'Disconnected from HSReplay' }); }}
              className="px-3 py-2 bg-red-900/30 text-red-400 rounded text-sm hover:bg-red-900/50 transition-colors"
            >
              Disconnect
            </button>
          )}
        </div>

        <button
          onClick={handleSync}
          disabled={syncLoading || !isConnected}
          className="px-6 py-2 bg-gold text-navy-dark font-bold rounded text-sm
                     hover:bg-gold-dim transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {syncLoading ? 'Syncing...' : 'Sync Collection'}
        </button>

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

      {/* Card Database */}
      <section className="bg-white/5 rounded-lg border border-white/10 p-5 mb-6">
        <h2 className="text-sm font-bold text-white mb-3">Card Database</h2>
        <p className="text-xs text-gray-400 mb-3">
          Re-fetch the card database from HearthstoneJSON. This updates card names,
          images, and stats for all expansions.
        </p>
        <button
          onClick={handleRefreshCardDb}
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
          Refresh card popularity and win rate data from HSReplay. Auto-refreshes every 4 hours.
        </p>
        <button
          onClick={async () => {
            setRefreshingMeta(true)
            try {
              const result = await api.refreshMeta()
              await fetchMeta()
              setSyncResult({ success: true, message: `Meta stats refreshed: ${result.count} cards` })
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
        <button
          onClick={async () => {
            try {
              const result = await api.clearArtCache()
              setSyncResult({ success: true, message: `Art cache cleared: ${result.cleared} files removed` })
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
      </section>

      {/* Cloudflare Status */}
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

      {/* General status */}
      {syncResult && !syncLoading && !syncResult.message.includes('synced:') && (
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
