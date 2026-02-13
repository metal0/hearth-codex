import { useState } from 'react'
import { api, setStoredToken, setStoredAccountId } from '../services/api.ts'

interface Props {
  onComplete: () => void
}

export default function OnboardingPopup({ onComplete }: Props) {
  const [sessionInput, setSessionInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleConnect() {
    const trimmed = sessionInput.trim()
    if (!trimmed) { setError('Please paste your session ID'); return }

    setLoading(true)
    setError('')

    try {
      const result = await api.register(trimmed)
      if (result.success && result.token) {
        setStoredToken(result.token)
        if (result.accountLo) setStoredAccountId(result.accountLo)
        onComplete()
      } else {
        setError(result.error || 'Registration failed')
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
            <h3 className="text-sm font-medium text-white mb-2">Get your session cookie</h3>
            <ol className="text-sm text-gray-400 space-y-1.5">
              <li className="flex gap-2">
                <span className="text-gold shrink-0">1.</span>
                <span>Open <a href="https://hsreplay.net" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline hover:text-blue-300">hsreplay.net</a> and log in</span>
              </li>
              <li className="flex gap-2">
                <span className="text-gold shrink-0">2.</span>
                <span>Open DevTools (<code className="text-xs bg-white/10 px-1 rounded">F12</code>) &rarr; Application &rarr; Cookies &rarr; hsreplay.net</span>
              </li>
              <li className="flex gap-2">
                <span className="text-gold shrink-0">3.</span>
                <span>Copy the <code className="text-xs bg-white/10 px-1 rounded">sessionid</code> cookie value</span>
              </li>
            </ol>
          </div>
        </div>

        <div className="space-y-3">
          <input
            type="password"
            value={sessionInput}
            onChange={e => setSessionInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleConnect()}
            placeholder="Paste your HSReplay session ID here"
            className="w-full bg-white/5 border border-white/15 rounded-lg px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-gold/50"
            disabled={loading}
          />

          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}

          <button
            onClick={handleConnect}
            disabled={loading || !sessionInput.trim()}
            className="w-full py-3 rounded-lg font-medium text-sm transition-colors bg-gold/20 text-gold border border-gold/30 hover:bg-gold/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Connecting to HSReplay...' : 'Connect'}
          </button>
        </div>

        <p className="text-[11px] text-gray-600 mt-4 text-center">
          Your session cookie is used to sync your collection and is stored securely on the server.
        </p>
      </div>
    </div>
  )
}
