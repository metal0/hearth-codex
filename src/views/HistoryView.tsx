import { useMemo, useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { useStore } from '../stores/store.ts'
import { loadSnapshots, clearSnapshots } from '../hooks/useCollectionSnapshots.ts'
import { Dropdown } from '../components/FilterBar.tsx'
import type { CollectionSnapshot } from '../types.ts'

const TOOLTIP_STYLE = {
  contentStyle: {
    backgroundColor: '#0f0f1e',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '8px',
    color: '#f5f5f5',
    fontSize: '12px',
    padding: '8px 12px',
  },
  labelStyle: { color: '#d4a843', fontWeight: 'bold' as const, marginBottom: '4px' },
  itemStyle: { color: '#f5f5f5' },
}

type TimeRange = '7d' | '30d' | '90d' | 'all'
const RANGES: { key: TimeRange; label: string; ms: number }[] = [
  { key: '7d', label: '7D', ms: 7 * 86400000 },
  { key: '30d', label: '30D', ms: 30 * 86400000 },
  { key: '90d', label: '90D', ms: 90 * 86400000 },
  { key: 'all', label: 'All', ms: Infinity },
]

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en', { month: 'short', day: 'numeric' })
}

export default function HistoryView() {
  const expansions = useStore(s => s.expansions)
  const [timeRange, setTimeRange] = useState<TimeRange>('all')
  const [selectedExpansion, setSelectedExpansion] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const [snapshots, setSnapshots] = useState<CollectionSnapshot[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadSnapshots().then(s => { setSnapshots(s); setLoading(false) })
  }, [])

  const setOptions = useMemo(() => [
    { value: '', label: 'Select expansion...' },
    ...expansions.map(exp => ({
      value: exp.code,
      label: `${exp.name}${exp.standard ? ' (S)' : ''}`,
    })),
  ], [expansions])

  const filtered = useMemo(() => {
    const cutoff = RANGES.find(r => r.key === timeRange)!.ms
    if (cutoff === Infinity) return snapshots
    const now = Date.now()
    return snapshots.filter(s => now - s.timestamp <= cutoff)
  }, [snapshots, timeRange])

  const dustData = useMemo(() =>
    filtered.map(s => ({ date: formatDate(s.timestamp), dust: s.dust })),
  [filtered])

  const completionData = useMemo(() =>
    filtered.map(s => ({
      date: formatDate(s.timestamp),
      Overall: s.overall.total > 0 ? parseFloat(((s.overall.owned / s.overall.total) * 100).toFixed(2)) : 0,
      Standard: s.standard.total > 0 ? parseFloat(((s.standard.owned / s.standard.total) * 100).toFixed(2)) : 0,
      Wild: s.wild.total > 0 ? parseFloat(((s.wild.owned / s.wild.total) * 100).toFixed(2)) : 0,
    })),
  [filtered])

  const expansionData = useMemo(() => {
    if (!selectedExpansion) return []
    return filtered.map(s => {
      const exp = s.expansions.find(e => e.code === selectedExpansion)
      return {
        date: formatDate(s.timestamp),
        completion: exp && exp.total > 0 ? parseFloat(((exp.owned / exp.total) * 100).toFixed(2)) : 0,
      }
    })
  }, [filtered, selectedExpansion])

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-bold text-gold mb-6">Collection History</h1>
        <p className="text-gray-500">Loading snapshots...</p>
      </div>
    )
  }

  if (snapshots.length === 0) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-bold text-gold mb-6">Collection History</h1>
        <p className="text-gray-400">No snapshots yet. Sync your collection to start tracking progress.</p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-5xl space-y-6">
      <h1 className="text-xl font-bold text-gold">Collection History</h1>

      <div className="flex items-center gap-2">
        <div className="flex rounded overflow-hidden border border-white/10">
          {RANGES.map(r => (
            <button
              key={r.key}
              onClick={() => setTimeRange(r.key)}
              className={`px-4 py-2 text-sm ${
                timeRange === r.key
                  ? 'bg-gold/20 text-gold'
                  : 'bg-white/5 text-gray-400 hover:bg-white/10'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-500 ml-auto">{filtered.length} snapshots</span>
      </div>

      {/* Dust Balance */}
      <div className="bg-white/5 rounded-lg border border-white/10 p-4">
        <h3 className="text-sm font-bold text-gray-300 mb-3">Dust Balance</h3>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={dustData}>
            <XAxis dataKey="date" tick={{ fill: '#9ca3af', fontSize: 10 }} />
            <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} />
            <Tooltip {...TOOLTIP_STYLE} />
            <Line type="monotone" dataKey="dust" stroke="#d4a843" strokeWidth={2} dot={{ r: 2 }} name="Dust" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Completion % */}
      <div className="bg-white/5 rounded-lg border border-white/10 p-4">
        <h3 className="text-sm font-bold text-gray-300 mb-3">Collection Completion</h3>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={completionData}>
            <XAxis dataKey="date" tick={{ fill: '#9ca3af', fontSize: 10 }} />
            <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} domain={[0, 100]} unit="%" />
            <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => `${v.toFixed(2)}%`} />
            <Legend wrapperStyle={{ fontSize: '12px' }} />
            <Line type="monotone" dataKey="Overall" stroke="#22c55e" strokeWidth={2} dot={{ r: 2 }} />
            <Line type="monotone" dataKey="Standard" stroke="#3b82f6" strokeWidth={2} dot={{ r: 2 }} />
            <Line type="monotone" dataKey="Wild" stroke="#a855f7" strokeWidth={2} dot={{ r: 2 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Per-Expansion */}
      <div className="bg-white/5 rounded-lg border border-white/10 p-4">
        <div className="flex items-center gap-3 mb-3">
          <h3 className="text-sm font-bold text-gray-300">Expansion Progress</h3>
          <Dropdown
            label="Expansion"
            options={setOptions}
            value={selectedExpansion}
            onChange={setSelectedExpansion}
          />
        </div>

        {selectedExpansion && expansionData.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={expansionData}>
              <XAxis dataKey="date" tick={{ fill: '#9ca3af', fontSize: 10 }} />
              <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} domain={[0, 100]} unit="%" />
              <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => `${v.toFixed(2)}%`} />
              <Line type="monotone" dataKey="completion" stroke="#d4a843" strokeWidth={2} dot={{ r: 2 }} name="Completion" />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-xs text-gray-500 py-8 text-center">Select an expansion to view progress over time.</p>
        )}
      </div>

      {/* Clear */}
      <div>
        {confirmClear ? (
          <div className="flex items-center gap-3">
            <span className="text-sm text-red-400">Clear all history? This cannot be undone.</span>
            <button
              onClick={async () => { await clearSnapshots(); setSnapshots([]); setConfirmClear(false) }}
              className="px-3 py-1.5 bg-red-600/30 text-red-400 border border-red-600/30 rounded text-sm hover:bg-red-600/40"
            >
              Confirm
            </button>
            <button
              onClick={() => setConfirmClear(false)}
              className="px-3 py-1.5 bg-white/5 text-gray-400 border border-white/10 rounded text-sm hover:bg-white/10"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmClear(true)}
            className="px-3 py-1.5 bg-white/5 text-gray-500 border border-white/10 rounded text-xs hover:bg-white/10"
          >
            Clear History
          </button>
        )}
      </div>
    </div>
  )
}
