import type { ReactNode } from 'react'
import { useStore } from '../stores/store.ts'
import type { CollectionMode } from '../types.ts'

function NormalIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className="shrink-0">
      <rect x="2" y="1" width="12" height="14" rx="2" opacity="0.8" />
      <rect x="4" y="3" width="8" height="2" rx="0.5" opacity="0.5" />
    </svg>
  )
}

function GoldenIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 16" fill="currentColor" className="shrink-0">
      <path d="M7 1L12 5L7 15L2 5Z" />
      <path d="M2 5L7 1L12 5L7 7Z" opacity="0.7" />
    </svg>
  )
}

function SignatureIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="shrink-0">
      <path d="M3 12C5 8 7 4 9 6C11 8 8 12 10 12C12 12 13 8 13 6" strokeLinecap="round" />
    </svg>
  )
}

function DiamondIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className="shrink-0">
      <path d="M4 2H12L15 6L8 15L1 6Z" opacity="0.9" />
      <path d="M1 6H15L8 15Z" opacity="0.6" />
      <path d="M4 2L6 6H10L12 2" fill="currentColor" opacity="0.4" />
    </svg>
  )
}

const ALL_MODES: { value: CollectionMode; label: string; icon: ReactNode; activeClass: string; tooltip: string }[] = [
  { value: 'normal', label: 'Normal', icon: <NormalIcon />, activeClass: 'bg-white/15 text-white', tooltip: 'Normal: counts all card versions' },
  { value: 'golden', label: 'Golden', icon: <GoldenIcon />, activeClass: 'bg-yellow-500/20 text-yellow-400', tooltip: 'Golden: counts golden, diamond & signature' },
  { value: 'signature', label: 'Signature', icon: <SignatureIcon />, activeClass: 'bg-purple-500/20 text-purple-400', tooltip: 'Signature: counts only signatures' },
  { value: 'diamond', label: 'Diamond', icon: <DiamondIcon />, activeClass: 'bg-cyan-500/20 text-cyan-300', tooltip: 'Diamond: counts only diamonds' },
]

export default function CollectionModeToggle({ modes }: { modes?: CollectionMode[] }) {
  const collectionMode = useStore(s => s.collectionMode)
  const setCollectionMode = useStore(s => s.setCollectionMode)

  const visible = modes ? ALL_MODES.filter(m => modes.includes(m.value)) : ALL_MODES
  const activeMode = visible.find(m => m.value === collectionMode) ? collectionMode : 'normal'

  return (
    <div className="flex rounded overflow-hidden border border-white/10">
      {visible.map(m => (
        <button
          key={m.value}
          onClick={() => setCollectionMode(m.value)}
          title={m.tooltip}
          className={`group flex items-center gap-0.5 px-2 py-1.5 text-xs transition-colors ${
            activeMode === m.value
              ? m.activeClass
              : 'bg-white/5 text-gray-400 hover:text-gray-200'
          }`}
        >
          {m.icon}
          <span className="max-w-0 overflow-hidden whitespace-nowrap opacity-0 group-hover:max-w-[80px] group-hover:opacity-100 transition-all duration-200 ease-out">
            {m.label}
          </span>
        </button>
      ))}
    </div>
  )
}
