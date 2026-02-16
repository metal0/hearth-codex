import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import Layout from './components/Layout.tsx'
import CollectionView from './views/CollectionView.tsx'
import CalculatorView from './views/CalculatorView.tsx'
import CraftAdvisorView from './views/CraftAdvisorView.tsx'
import PackAdvisorView from './views/PackAdvisorView.tsx'
import DecksView from './views/DecksView.tsx'
import DisenchantAdvisorView from './views/DisenchantAdvisorView.tsx'
import HistoryView from './views/HistoryView.tsx'
import SettingsView from './views/SettingsView.tsx'
import OnboardingPopup from './components/OnboardingPopup.tsx'
import { useStore } from './stores/store.ts'
import { useCollectionSnapshots } from './hooks/useCollectionSnapshots.ts'
import {
  api, getStoredToken, getStoredAccountId, setStoredAccountId,
  isAuthenticated as checkAuth, getCollectionMeta,
} from './services/api.ts'
import { migrateLocalStorage } from './utils/localStorageMigration.ts'

const TWO_HOURS = 2 * 60 * 60 * 1000

export default function App() {
  const [authenticated, setAuthenticated] = useState(() => checkAuth())
  const fetchCards = useStore(s => s.fetchCards)
  const fetchCollection = useStore(s => s.fetchCollection)
  const fetchExpansions = useStore(s => s.fetchExpansions)
  const fetchMeta = useStore(s => s.fetchMeta)
  useCollectionSnapshots()

  useEffect(() => {
    if (!authenticated) return

    async function init() {
      const authTier = useStore.getState().authTier

      if (authTier === 'full') {
        try {
          const me = await api.getMe()
          useStore.getState().setBattletag(me.battletag)
          useStore.setState({ isPremium: me.isPremium ?? null, premiumConsent: me.premiumConsent ?? false })
          if (!getStoredAccountId()) {
            setStoredAccountId(me.accountLo)
            migrateLocalStorage(me.accountLo)
            useStore.getState().reloadCraftQueue()
          }
        } catch { /* 401 will redirect */ }

        try {
          const settings = await api.getSettings()
          if (typeof settings.metaBracket === 'string') {
            useStore.setState({ metaBracket: settings.metaBracket })
          }
          if (settings.deckGameMode === 'wild') {
            useStore.setState({ deckGameMode: 'wild' })
          }
        } catch {}
      } else {
        const meta = getCollectionMeta()
        if (meta) {
          useStore.getState().setBattletag(meta.battletag)
        }
        try {
          const savedGameMode = localStorage.getItem('hc-deck-game-mode')
          if (savedGameMode === 'wild') useStore.setState({ deckGameMode: 'wild' })
        } catch {}
      }

      api.getDataStatus().then(status => {
        if (status.hostedMode) useStore.getState().setHostedMode(true)
        if (status.artVersion) useStore.setState({ artVersion: status.artVersion })
      }).catch(() => {})

      await Promise.all([
        fetchCards(),
        fetchCollection(),
        fetchExpansions(),
        fetchMeta(),
        useStore.getState().fetchBrackets(),
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
        <Route path="/decks" element={<DecksView />} />
        <Route path="/disenchant" element={<DisenchantAdvisorView />} />
        <Route path="/history" element={<HistoryView />} />
        <Route path="/settings" element={<SettingsView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}
