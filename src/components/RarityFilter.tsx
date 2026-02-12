import type { Rarity } from '../types.ts'
import { RARITY_COLORS } from '../types.ts'
import { RarityGem } from './Icons.tsx'

const RARITIES: Rarity[] = ['LEGENDARY', 'EPIC', 'RARE', 'COMMON']

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
    <div className="flex gap-1">
      {RARITIES.map(r => {
        const active = selected.includes(r)
        return (
          <button
            key={r}
            onClick={() => toggle(r)}
            className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors border ${
              active
                ? 'border-current bg-current/15'
                : 'border-white/10 bg-white/5 hover:bg-white/10'
            }`}
            style={active ? { color: RARITY_COLORS[r] } : { color: '#9ca3af' }}
          >
            <RarityGem size={12} rarity={r} />
            {r[0] + r.slice(1).toLowerCase()}
          </button>
        )
      })}
    </div>
  )
}
