import { useState, useRef, useEffect } from 'react'
import { useStore } from '../stores/store.ts'
import type { OwnershipFilter, FormatFilter, SortOption } from '../types.ts'
import CollectionModeToggle from './CollectionModeToggle.tsx'
import ClassPicker from './ClassPicker.tsx'
import RarityFilter from './RarityFilter.tsx'
import { StandardIcon, WildIcon } from './Icons.tsx'

const OWNERSHIP_OPTIONS: { value: OwnershipFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'owned', label: 'Owned' },
  { value: 'incomplete', label: 'Incomplete' },
]

const FORMAT_OPTIONS: { value: FormatFilter; label: string }[] = [
  { value: 'standard', label: 'Standard' },
  { value: 'wild', label: 'Wild' },
]

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'rarity', label: 'Rarity' },
  { value: 'cost', label: 'Mana Cost' },
  { value: 'name', label: 'Name' },
  { value: 'set', label: 'Set' },
  { value: 'class', label: 'Class' },
  { value: 'inclusion', label: 'Played %' },
  { value: 'winrate', label: 'Win Rate' },
]

export function Dropdown({ label, options, value, onChange }: {
  label: string
  options: { value: string; label: string }[]
  value: string
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const selected = options.find(o => o.value === value)

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded px-3 py-1.5 text-xs text-gray-300
                   hover:bg-white/10 hover:border-white/20 transition-colors min-w-[120px]"
      >
        <span className="text-gray-500">{label}:</span>
        <span className="text-white truncate">{selected?.label ?? 'All'}</span>
        <svg className={`w-3 h-3 ml-auto text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-navy-light border border-white/15 rounded-lg shadow-xl z-50 min-w-[180px] max-h-64 overflow-y-auto">
          {options.map(opt => (
            <button
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false) }}
              className={`block w-full text-left px-3 py-2 text-xs transition-colors ${
                opt.value === value
                  ? 'bg-gold/15 text-gold'
                  : 'text-gray-300 hover:bg-white/10'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function FilterBar() {
  const {
    selectedSets, selectedClasses, selectedRarities,
    ownershipFilter, formatFilter, searchText, sortBy, sortAsc,
    expansions,
    setSelectedSets, setSelectedClasses, setSelectedRarities,
    setOwnershipFilter, setFormatFilter, setSearchText, setSortBy, toggleSortDirection,
  } = useStore()

  const setOptions = [
    { value: '', label: 'All Sets' },
    ...expansions.map(exp => ({
      value: exp.code,
      label: `${exp.name}${exp.standard ? ' (S)' : ''}`,
    })),
  ]

  return (
    <div className="sticky top-0 z-10 bg-navy/95 backdrop-blur-sm border-b border-white/10 px-4 py-3 flex flex-wrap gap-2 items-center">
      <input
        type="text"
        placeholder="missing legendary, mana:5..."
        value={searchText}
        onChange={e => setSearchText(e.target.value)}
        className="bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm w-48
                   placeholder:text-gray-500 focus:outline-none focus:border-gold/50"
      />

      <div className="flex rounded overflow-hidden border border-white/10">
        {FORMAT_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => setFormatFilter(opt.value)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors ${
              formatFilter === opt.value
                ? 'bg-gold/20 text-gold'
                : 'bg-white/5 text-gray-400 hover:text-gray-200'
            }`}
          >
            {opt.value === 'standard' ? <StandardIcon size={12} /> : <WildIcon size={12} />}
            {opt.label}
          </button>
        ))}
      </div>

      <CollectionModeToggle modes={['normal', 'golden', 'signature', 'diamond']} />

      <RarityFilter selected={selectedRarities} onChange={setSelectedRarities} />

      <div className="flex rounded overflow-hidden border border-white/10">
        {OWNERSHIP_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => setOwnershipFilter(opt.value)}
            className={`px-2.5 py-1.5 text-xs transition-colors ${
              ownershipFilter === opt.value
                ? 'bg-mana/20 text-mana'
                : 'bg-white/5 text-gray-400 hover:text-gray-200'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <Dropdown
        label="Set"
        options={setOptions}
        value={selectedSets.length === 1 ? selectedSets[0] : ''}
        onChange={v => setSelectedSets(v ? [v] : [])}
      />

      <ClassPicker
        value={selectedClasses.length === 1 ? selectedClasses[0] : ''}
        onChange={v => setSelectedClasses(v ? [v] : [])}
      />

      <div className="flex items-center gap-1 ml-auto">
        <Dropdown
          label="Sort"
          options={SORT_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
          value={sortBy}
          onChange={v => setSortBy(v as SortOption)}
        />
        <button
          onClick={toggleSortDirection}
          className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-gray-400
                     hover:bg-white/10 hover:text-white transition-colors"
          title={sortAsc ? 'Ascending' : 'Descending'}
        >
          {sortAsc ? '\u2191' : '\u2193'}
        </button>
      </div>
    </div>
  )
}
