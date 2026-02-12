import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import Layout from './components/Layout.tsx'
import CollectionView from './views/CollectionView.tsx'
import CalculatorView from './views/CalculatorView.tsx'
import CraftAdvisorView from './views/CraftAdvisorView.tsx'
import PackAdvisorView from './views/PackAdvisorView.tsx'
import DisenchantAdvisorView from './views/DisenchantAdvisorView.tsx'
import HistoryView from './views/HistoryView.tsx'
import SettingsView from './views/SettingsView.tsx'
import { useStore } from './stores/store.ts'
import { useCollectionSnapshots } from './hooks/useCollectionSnapshots.ts'

const TWO_HOURS = 2 * 60 * 60 * 1000

export default function App() {
  const fetchCards = useStore(s => s.fetchCards)
  const fetchCollection = useStore(s => s.fetchCollection)
  const fetchExpansions = useStore(s => s.fetchExpansions)
  const fetchMeta = useStore(s => s.fetchMeta)
  const fetchVariantAvailability = useStore(s => s.fetchVariantAvailability)

  useCollectionSnapshots()

  useEffect(() => {
    async function init() {
      await Promise.all([
        fetchCards(),
        fetchCollection(),
        fetchExpansions(),
        fetchMeta(),
        fetchVariantAvailability(),
      ])

      const { collection, hsSessionId, syncCollection, addToast } = useStore.getState()
      const syncedAt = collection?.syncedAt
      const isStale = !syncedAt || (Date.now() - syncedAt > TWO_HOURS)
      if (!isStale || !hsSessionId) return

      try {
        const result = await syncCollection()
        if (result.success) {
          addToast(`Collection synced: ${result.cards?.toLocaleString()} cards, ${result.dust?.toLocaleString()} dust`, 'success')
        }
      } catch { /* network error — banner will show */ }
    }

    init()
  }, [fetchCards, fetchCollection, fetchExpansions, fetchMeta, fetchVariantAvailability])

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<CollectionView />} />
        <Route path="/calculator" element={<CalculatorView />} />
        <Route path="/craft" element={<CraftAdvisorView />} />
        <Route path="/packs" element={<PackAdvisorView />} />
        <Route path="/disenchant" element={<DisenchantAdvisorView />} />
        <Route path="/history" element={<HistoryView />} />
        <Route path="/settings" element={<SettingsView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}
