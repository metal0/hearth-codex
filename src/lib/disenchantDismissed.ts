export const DISENCHANT_DISMISSED_KEY = 'hc-disenchant-dismissed-v1'
export const DISENCHANT_DISMISSED_EVENT = 'hc-disenchant-dismissed-updated'

export type DisenchantVariant = 'normal' | 'golden'

export function disenchantDismissKey(dbfId: number | string, variant: DisenchantVariant): string {
  return `${dbfId}:${variant}`
}

export function loadDisenchantDismissed(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(DISENCHANT_DISMISSED_KEY)
    if (!raw) return new Set()
    return new Set(JSON.parse(raw) as string[])
  } catch {
    return new Set()
  }
}

export function saveDisenchantDismissed(ids: Set<string>): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(DISENCHANT_DISMISSED_KEY, JSON.stringify([...ids]))
  window.dispatchEvent(new Event(DISENCHANT_DISMISSED_EVENT))
}
