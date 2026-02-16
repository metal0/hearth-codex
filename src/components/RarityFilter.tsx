import type { Rarity } from '../types.ts'
import { RARITY_COLORS } from '../types.ts'
import { RarityGem } from './Icons.tsx'

const RARITIES: Rarity[] = ['LEGENDARY', 'EPIC', 'RARE', 'COMMON']

const RARITY_LABELS: Record<Rarity, string> = {
  LEGENDARY: 'Legendary',
  EPIC: 'Epic',
  RARE: 'Rare',
  COMMON: 'Common',
}

interface RarityFilterProps {
  selected: Rarity[]
  onChange: (rarities: Rarity[]) => void
}

export default function RarityFilter({ selected, onChange }: RarityFilterProps) {
  function toggle(r: Rarity) {
    if (selected.includes(r)) onChange(selected.filter(x => x !== r))
    else onChange([...selected, r])
  }

  return (
    <div className="flex gap-0.5">
      {RARITIES.map(r => {
        const active = selected.includes(r)
        return (
          <button
            key={r}
            onClick={() => toggle(r)}
            title={RARITY_LABELS[r]}
            className={`group flex items-center gap-0.5 px-1.5 py-1 text-xs rounded transition-colors border ${
              active
                ? 'border-current bg-current/15'
                : 'border-white/10 bg-white/5 hover:bg-white/10'
            }`}
            style={active ? { color: RARITY_COLORS[r] } : { color: '#9ca3af' }}
          >
            <RarityGem size={14} rarity={r} />
            <span className="max-w-0 overflow-hidden whitespace-nowrap opacity-0 group-hover:max-w-[80px] group-hover:opacity-100 transition-all duration-200 ease-out">
              {RARITY_LABELS[r]}
            </span>
          </button>
        )
      })}
    </div>
  )
}
