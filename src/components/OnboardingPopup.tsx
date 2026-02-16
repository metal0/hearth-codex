import { useState } from 'react'
import {
  api, setAuthTier, setCollectionMeta, setLocalCollection, clearStoredToken,
} from '../services/api.ts'
import { useStore } from '../stores/store.ts'

interface Props {
  onComplete: () => void
}

export default function OnboardingPopup({ onComplete }: Props) {
  const [collectionUrl, setCollectionUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleCollectionLogin() {
    const trimmed = collectionUrl.trim()
    if (!trimmed) { setError('Please paste your collection URL'); return }

    setLoading(true)
    setError('')

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
      </div>
    </div>
  )
}
