import { type ReactNode, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Sidebar from './Sidebar.tsx'
import { useStore } from '../stores/store.ts'
import type { Toast } from '../stores/store.ts'
import { api } from '../services/api.ts'

const TWO_HOURS = 2 * 60 * 60 * 1000

function SyncBanner() {
  const collectionSyncedAt = useStore(s => s.collectionSyncedAt)
  const collectionLoading = useStore(s => s.collectionLoading)
  const syncLoading = useStore(s => s.syncLoading)
  const collection = useStore(s => s.collection)

  if (collectionLoading || syncLoading) return null

  const hasCards = Object.keys(collection?.collection ?? {}).length > 0
  const isStale = !collectionSyncedAt || (Date.now() - collectionSyncedAt > TWO_HOURS)

  if (!isStale && hasCards) return null

  return (
    <div className="bg-amber-900/30 border-b border-amber-500/30 px-4 py-2.5 text-sm text-amber-300 flex items-center gap-2">
      {hasCards
        ? 'Collection data is outdated (last synced over 2 hours ago).'
        : 'No collection synced yet.'}
      <Link to="/settings" className="underline hover:text-amber-200 font-medium">
        Go to Settings
      </Link>
    </div>
  )
}

function ErrorBanners() {
  const dataErrors = useStore(s => s.dataErrors)
  const dismissError = useStore(s => s.dismissError)

  if (dataErrors.length === 0) return null

  return (
    <>
      {dataErrors.map((error, i) => (
        <div key={i} className="bg-red-900/30 border-b border-red-500/30 px-4 py-2.5 text-sm text-red-300 flex items-center gap-2">
          <span className="flex-1">{error}</span>
          <Link to="/settings" className="underline hover:text-red-200 font-medium shrink-0">
            Settings
          </Link>
          <button
            onClick={() => dismissError(i)}
            className="text-red-400 hover:text-red-200 shrink-0 ml-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </>
  )
}

function Toasts() {
  const toasts = useStore(s => s.toasts)
  const dismissToast = useStore(s => s.dismissToast)

  if (toasts.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2">
      {toasts.map((t: Toast) => (
        <div
          key={t.id}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-xl text-sm animate-in ${
            t.type === 'success'
              ? 'bg-green-900/90 border border-green-500/40 text-green-300'
              : 'bg-red-900/90 border border-red-500/40 text-red-300'
          }`}
        >
          <span className="flex-1">{t.message}</span>
          <button onClick={() => dismissToast(t.id)} className="text-white/40 hover:text-white/80">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  )
}

function PrefetchBanner() {
  const [status, setStatus] = useState<{ running: boolean; variant: string; done: number; total: number } | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function poll() {
      try {
        const s = await api.getPrefetchStatus()
        if (!cancelled) setStatus(s)
        if (s.running && !cancelled) setTimeout(poll, 3000)
      } catch { /* ignore */ }
    }
    poll()
    return () => { cancelled = true }
  }, [])

  if (dismissed || !status?.running) return null
  const pct = status.total > 0 ? Math.round(status.done / status.total * 100) : 0

  return (
    <div className="bg-blue-900/20 border-b border-blue-500/20 px-4 py-1.5 text-xs text-blue-300 flex items-center gap-3">
      <span>Caching card art: {status.variant} ({pct}%)</span>
      <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden max-w-xs">
        <div className="h-full bg-blue-400/60 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-blue-400/60">{status.done}/{status.total}</span>
      <button onClick={() => setDismissed(true)} className="text-blue-400/40 hover:text-blue-300 ml-1">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

export default function Layout({ children }: { children: ReactNode }) {
  const autoSync = useStore(s => s.autoSync)

  useEffect(() => {
    autoSync()
  }, [autoSync])

  return (
    <div className="flex h-screen bg-navy-dark text-gray-100">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <ErrorBanners />
        <SyncBanner />
        <PrefetchBanner />
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
      <Toasts />
    </div>
  )
}
