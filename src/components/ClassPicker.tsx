import { useState, useRef, useEffect } from 'react'
import { HS_CLASSES, CLASS_COLORS } from '../types.ts'

const WIKI = 'https://hearthstone.wiki.gg/images'

const CLASS_ICON_URLS: Record<string, string> = {
  WARRIOR: `${WIKI}/thumb/Warrior_icon.png/64px-Warrior_icon.png`,
  PALADIN: `${WIKI}/thumb/Paladin_icon.png/64px-Paladin_icon.png`,
  HUNTER: `${WIKI}/thumb/Hunter_icon.png/64px-Hunter_icon.png`,
  ROGUE: `${WIKI}/thumb/Rogue_icon.png/64px-Rogue_icon.png`,
  PRIEST: `${WIKI}/thumb/Priest_icon.png/64px-Priest_icon.png`,
  SHAMAN: `${WIKI}/thumb/Shaman_icon.png/64px-Shaman_icon.png`,
  MAGE: `${WIKI}/thumb/Mage_icon.png/64px-Mage_icon.png`,
  WARLOCK: `${WIKI}/thumb/Warlock_icon.png/64px-Warlock_icon.png`,
  DRUID: `${WIKI}/thumb/Druid_icon.png/64px-Druid_icon.png`,
  DEMONHUNTER: `${WIKI}/thumb/Demon_Hunter_icon.png/64px-Demon_Hunter_icon.png`,
  DEATHKNIGHT: `${WIKI}/thumb/Death_Knight_icon.png/64px-Death_Knight_icon.png`,
  NEUTRAL: `${WIKI}/thumb/Neutral_icon.png/64px-Neutral_icon.png`,
}

const CLASS_LABELS: Record<string, string> = {
  NEUTRAL: 'Neutral',
  DEATHKNIGHT: 'Death Knight',
  DEMONHUNTER: 'Demon Hunter',
  DRUID: 'Druid',
  HUNTER: 'Hunter',
  MAGE: 'Mage',
  PALADIN: 'Paladin',
  PRIEST: 'Priest',
  ROGUE: 'Rogue',
  SHAMAN: 'Shaman',
  WARLOCK: 'Warlock',
  WARRIOR: 'Warrior',
}

export function ClassIcon({ cls, size = 14 }: { cls: string; size?: number }) {
  const url = CLASS_ICON_URLS[cls]
  if (url) {
    return (
      <img
        src={url}
        alt={cls}
        width={size}
        height={size}
        className="inline-block shrink-0"
        style={{ objectFit: 'contain' }}
      />
    )
  }
  return (
    <span
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, backgroundColor: CLASS_COLORS[cls] ?? '#808080' }}
    />
  )
}

export function classLabel(cls: string): string {
  return CLASS_LABELS[cls] ?? cls[0] + cls.slice(1).toLowerCase()
}

interface ClassPickerProps {
  value: string
  onChange: (cls: string) => void
  label?: string
}

export default function ClassPicker({ value, onChange, label = 'Class' }: ClassPickerProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const selectedLabel = value ? classLabel(value) : 'All'
  const selectedColor = value ? CLASS_COLORS[value] : undefined

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded px-3 py-1.5 text-xs text-gray-300
                   hover:bg-white/10 hover:border-white/20 transition-colors min-w-[120px]"
      >
        <span className="text-gray-500">{label}:</span>
        {value && <ClassIcon cls={value} size={12} />}
        <span className="truncate" style={selectedColor ? { color: selectedColor } : { color: 'white' }}>
          {selectedLabel}
        </span>
        <svg className={`w-3 h-3 ml-auto text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-navy-light border border-white/15 rounded-lg shadow-xl z-50 min-w-[180px] max-h-64 overflow-y-auto">
          <button
            onClick={() => { onChange(''); setOpen(false) }}
            className={`block w-full text-left px-3 py-2 text-xs transition-colors ${
              !value ? 'bg-gold/15 text-gold' : 'text-gray-300 hover:bg-white/10'
            }`}
          >
            All Classes
          </button>
          {HS_CLASSES.map(cls => (
            <button
              key={cls}
              onClick={() => { onChange(cls); setOpen(false) }}
              className={`flex items-center gap-2 w-full text-left px-3 py-2 text-xs transition-colors ${
                cls === value ? 'bg-white/10' : 'hover:bg-white/10'
              }`}
              style={{ color: CLASS_COLORS[cls] }}
            >
              <ClassIcon cls={cls} size={14} />
              {CLASS_LABELS[cls]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
