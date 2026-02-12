import { useStore } from '../stores/store.ts'
import type { CollectionMode } from '../types.ts'

const ALL_MODES: { value: CollectionMode; label: string; activeClass: string }[] = [
  { value: 'normal', label: 'Normal', activeClass: 'bg-white/15 text-white' },
  { value: 'golden', label: 'Golden', activeClass: 'bg-yellow-500/20 text-yellow-400' },
  { value: 'signature', label: 'Signature', activeClass: 'bg-purple-500/20 text-purple-400' },
  { value: 'diamond', label: 'Diamond', activeClass: 'bg-cyan-500/20 text-cyan-300' },
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
          className={`px-3 py-1.5 text-xs transition-colors ${
            activeMode === m.value
              ? m.activeClass
              : 'bg-white/5 text-gray-400 hover:text-gray-200'
          }`}
        >
          {m.label}
        </button>
      ))}
    </div>
  )
}
