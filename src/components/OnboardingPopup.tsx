import { useState } from 'react'
import {
  api, setAuthTier, setCollectionMeta, setLocalCollection, clearStoredToken,
  setStoredToken, setStoredAccountId,
} from '../services/api.ts'
import { useStore } from '../stores/store.ts'

interface Props {
  onComplete: () => void
}

export default function OnboardingPopup({ onComplete }: Props) {
  const [tab, setTab] = useState<'collection' | 'session'>('collection')
  const [collectionUrl, setCollectionUrl] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sessionRequired, setSessionRequired] = useState<{ battletag: string } | null>(null)

  async function handleCollectionLogin() {
    const trimmed = collectionUrl.trim()
    if (!trimmed) { setError('Please paste your collection URL'); return }

    setLoading(true)
    setError('')
    setSessionRequired(null)

    try {
      const result = await api.collectionLogin(trimmed)
      if (result.success) {
        clearStoredToken()
        setAuthTier('collection')
        useStore.setState({ authTier: 'collection' })
        setCollectionMeta({
          accountLo: result.accountLo,
          region: result.region,
          battletag: result.battletag,
        })
        setLocalCollection({ collection: result.collection, dust: result.dust, syncedAt: Date.now() })
        onComplete()
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Connection failed'
      if (message.includes('session ID')) {
        const match = message.match(/\(([^)]+)\)/)
        setSessionRequired({ battletag: match?.[1] ?? 'your account' })
        setTab('session')
      }
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  async function handleSessionLogin() {
    const trimmed = sessionId.trim()
    if (!trimmed) { setError('Please paste your session ID'); return }

    setLoading(true)
    setError('')

    try {
      const result = await api.register(trimmed)
      if (result.success && result.token) {
        setStoredToken(result.token)
        if (result.accountLo) setStoredAccountId(result.accountLo)
        setAuthTier('full')
        useStore.setState({ authTier: 'full' })
        onComplete()
      } else {
        setError(result.error || 'Login failed')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Connection failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-navy-light border border-white/15 rounded-xl shadow-2xl max-w-lg w-full p-8">
        <h1 className="text-2xl font-bold text-gold mb-2">Welcome to Hearth Codex</h1>
        <p className="text-gray-400 text-sm mb-6">
          Track your Hearthstone collection, calculate pack costs, and optimize your crafting strategy.
        </p>

        <div className="flex gap-1 mb-6 bg-white/5 rounded-lg p-1">
          <button
            onClick={() => { setTab('collection'); setError(''); setSessionRequired(null) }}
            className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
              tab === 'collection'
                ? 'bg-gold/20 text-gold border border-gold/30'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            Collection URL
          </button>
          <button
            onClick={() => { setTab('session'); setError('') }}
            className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
              tab === 'session'
                ? 'bg-gold/20 text-gold border border-gold/30'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            Session ID
          </button>
        </div>

        {tab === 'collection' && (
          <>
            <div className="space-y-4 mb-6">
              <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                <h3 className="text-sm font-medium text-white mb-2">Before you start</h3>
                <ul className="text-sm text-gray-400 space-y-2">
                  <li className="flex gap-2">
                    <span className="text-gold shrink-0">1.</span>
                    <span>
                      You need a free <a href="https://hsreplay.net" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline hover:text-blue-300">HSReplay.net</a> account linked to your Blizzard account.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-gold shrink-0">2.</span>
                    <span>
                      Install <a href="https://hsreplay.net/downloads/" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline hover:text-blue-300">Hearthstone Deck Tracker</a> to keep your collection data up to date on HSReplay.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-gold shrink-0">3.</span>
                    <span>Run Deck Tracker at least once while Hearthstone is open so it uploads your collection.</span>
                  </li>
                </ul>
              </div>

              <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                <h3 className="text-sm font-medium text-white mb-2">Get your collection URL</h3>
                <ol className="text-sm text-gray-400 space-y-1.5">
                  <li className="flex gap-2">
                    <span className="text-gold shrink-0">1.</span>
                    <span>Go to <a href="https://hsreplay.net/account/" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline hover:text-blue-300">HSReplay Account Settings</a></span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-gold shrink-0">2.</span>
                    <span>Under <strong className="text-white">Collection</strong>, set visibility to <strong className="text-white">Public</strong></span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-gold shrink-0">3.</span>
                    <span>Open <a href="https://hsreplay.net/collection/mine/" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline hover:text-blue-300">your collection page</a> and use the copy URL button to copy the link</span>
                  </li>
                </ol>
              </div>
            </div>

            <div className="space-y-3">
              <input
                type="text"
                value={collectionUrl}
                onChange={e => setCollectionUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCollectionLogin()}
                placeholder="https://hsreplay.net/collection/2/12345678/"
                className="w-full bg-white/5 border border-white/15 rounded-lg px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-gold/50"
                disabled={loading}
              />

              {error && <p className="text-red-400 text-sm">{error}</p>}

              <button
                onClick={handleCollectionLogin}
                disabled={loading || !collectionUrl.trim()}
                className="w-full py-3 rounded-lg font-medium text-sm transition-colors bg-gold/20 text-gold border border-gold/30 hover:bg-gold/30 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Loading collection...' : 'View Collection'}
              </button>

              <p className="text-[11px] text-gray-600 text-center">
                Your collection data is stored locally in this browser only.
              </p>
            </div>
          </>
        )}

        {tab === 'session' && (
          <>
            {sessionRequired && (
              <div className="bg-amber-900/20 border border-amber-500/30 rounded-lg p-4 mb-4">
                <p className="text-sm text-amber-300">
                  <strong>{sessionRequired.battletag}</strong> is registered with a session ID.
                  Please log in with your HSReplay session ID below.
                </p>
              </div>
            )}

            <div className="bg-white/5 rounded-lg p-4 border border-white/10 mb-6">
              <h3 className="text-sm font-medium text-white mb-2">Get your session ID</h3>
              <ol className="text-sm text-gray-400 space-y-1.5">
                <li className="flex gap-2">
                  <span className="text-gold shrink-0">1.</span>
                  <span>Open <a href="https://hsreplay.net" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline hover:text-blue-300">hsreplay.net</a> and log in</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-gold shrink-0">2.</span>
                  <span>Open DevTools (<code className="px-1 bg-white/10 rounded text-[10px]">F12</code>) &rarr; Application &rarr; Cookies &rarr; hsreplay.net</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-gold shrink-0">3.</span>
                  <span>Copy the <code className="px-1 bg-white/10 rounded text-[10px] text-gold/70">sessionid</code> cookie value</span>
                </li>
              </ol>
            </div>

            <div className="space-y-3">
              <input
                type="password"
                value={sessionId}
                onChange={e => setSessionId(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSessionLogin()}
                placeholder="Paste your HSReplay session ID"
                className="w-full bg-white/5 border border-white/15 rounded-lg px-4 py-3 text-sm font-mono text-white placeholder:text-gray-500 focus:outline-none focus:border-gold/50"
                disabled={loading}
              />

              {error && !sessionRequired && <p className="text-red-400 text-sm">{error}</p>}

              <button
                onClick={handleSessionLogin}
                disabled={loading || !sessionId.trim()}
                className="w-full py-3 rounded-lg font-medium text-sm transition-colors bg-gold/20 text-gold border border-gold/30 hover:bg-gold/30 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Connecting...' : 'Connect Account'}
              </button>

              <p className="text-[11px] text-gray-600 text-center">
                Enables persistent settings, collection history, and premium stats.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
