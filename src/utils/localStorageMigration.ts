export function migrateLocalStorage(accountId: string): void {
  const migrations: [string, string][] = [
    ['hs-craft-queue', `hs-craft-queue-${accountId}`],
  ]

  for (const old of ['hs-collection-snapshots', `hs-collection-snapshots-${accountId}`]) {
    try { localStorage.removeItem(old) } catch { /* ignore */ }
  }

  for (const [oldKey, newKey] of migrations) {
    try {
      const existing = localStorage.getItem(oldKey)
      if (existing && !localStorage.getItem(newKey)) {
        localStorage.setItem(newKey, existing)
        localStorage.removeItem(oldKey)
      }
    } catch { /* ignore */ }
  }
}
