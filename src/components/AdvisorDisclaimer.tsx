import { useState, useEffect, type ReactNode } from 'react'

const LS_KEY = 'hc-advisor-disclaimer-accepted'

function isAccepted(): boolean {
  return localStorage.getItem(LS_KEY) === '1'
}

export default function AdvisorDisclaimer({ children }: { children: ReactNode }) {
  const [accepted, setAccepted] = useState(isAccepted)
  const [countdown, setCountdown] = useState(3)

  useEffect(() => {
    if (accepted) return
    if (countdown <= 0) return
    const id = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(id)
  }, [accepted, countdown])

  if (accepted) return <>{children}</>

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="bg-white/5 border border-white/10 rounded-xl max-w-lg p-6 space-y-4">
        <div className="flex items-center gap-2">
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <h2 className="text-lg font-bold text-gold">Advisory Disclaimer</h2>
        </div>

        <p className="text-sm text-gray-300 leading-relaxed">
          All recommendations, valuations, and ratings in this tool are based on the
          <span className="text-white font-medium"> current Hearthstone expansion and meta snapshot</span>.
          They reflect card usage and value as of right now and are{' '}
          <span className="text-amber-400 font-medium">not predictions of future viability</span>.
        </p>

        <p className="text-sm text-gray-400 leading-relaxed">
          Card power levels, meta relevance, and crafting priorities shift with every balance
          patch, expansion release, and Standard rotation. Use these recommendations as a
          starting point, not as financial advice.
        </p>

        <button
          disabled={countdown > 0}
          onClick={() => { localStorage.setItem(LS_KEY, '1'); setAccepted(true) }}
          className={`w-full py-2.5 rounded-lg font-bold text-sm transition-colors ${
            countdown > 0
              ? 'bg-white/5 text-gray-500 cursor-not-allowed'
              : 'bg-gold text-navy-dark hover:bg-gold-dim cursor-pointer'
          }`}
        >
          {countdown > 0 ? `I understand (${countdown}s)` : 'I understand'}
        </button>
      </div>
    </div>
  )
}
