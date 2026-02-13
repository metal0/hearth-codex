import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import Layout from './components/Layout.tsx'
import CollectionView from './views/CollectionView.tsx'
import CalculatorView from './views/CalculatorView.tsx'
import CraftAdvisorView from './views/CraftAdvisorView.tsx'
import PackAdvisorView from './views/PackAdvisorView.tsx'
import DisenchantAdvisorView from './views/DisenchantAdvisorView.tsx'
import HistoryView from './views/HistoryView.tsx'
import SettingsView from './views/SettingsView.tsx'
import OnboardingPopup from './components/OnboardingPopup.tsx'
import { useStore } from './stores/store.ts'
import { useCollectionSnapshots } from './hooks/useCollectionSnapshots.ts'
import { api, getStoredToken, getStoredAccountId, setStoredAccountId } from './services/api.ts'
import { migrateLocalStorage } from './utils/localStorageMigration.ts'

const TWO_HOURS = 2 * 60 * 60 * 1000

export default function App() {
  const [authenticated, setAuthenticated] = useState(() => !!getStoredToken())
  const fetchCards = useStore(s => s.fetchCards)
  const fetchCollection = useStore(s => s.fetchCollection)
  const fetchExpansions = useStore(s => s.fetchExpansions)
  const fetchMeta = useStore(s => s.fetchMeta)
  useCollectionSnapshots()

  useEffect(() => {
    if (!authenticated) return

    async function init() {
      try {
        const me = await api.getMe()
        useStore.getState().setBattletag(me.battletag)
        if (!getStoredAccountId()) {
          setStoredAccountId(me.accountLo)
          migrateLocalStorage(me.accountLo)
          useStore.getState().reloadCraftQueue()
        }
      } catch { /* 401 will redirect */ }

      api.getDataStatus().then(status => {
        if (status.hostedMode) useStore.getState().setHostedMode(true)
        if (status.artVersion) useStore.setState({ artVersion: status.artVersion })
      }).catch(() => {})

      await Promise.all([
        fetchCards(),
        fetchCollection(),
        fetchExpansions(),
        fetchMeta(),
      ])

      const { collection, syncCollection, addToast } = useStore.getState()
      const syncedAt = collection?.syncedAt
      const isStale = !syncedAt || (Date.now() - syncedAt > TWO_HOURS)
      if (!isStale) return

      try {
        const result = await syncCollection()
        if (result.success) {
          addToast(`Collection synced: ${result.cards?.toLocaleString()} cards, ${result.dust?.toLocaleString()} dust`, 'success')
        }
      } catch { /* network error — banner will show */ }
    }

    init()
  }, [authenticated, fetchCards, fetchCollection, fetchExpansions, fetchMeta])

  if (!authenticated) {
    return <OnboardingPopup onComplete={() => setAuthenticated(true)} />
  }

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
