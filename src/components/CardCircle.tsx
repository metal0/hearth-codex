import CardHover from './CardHover.tsx'

export const RARITY_BORDER_COLORS: Record<string, string> = {
  LEGENDARY: '#ff8000',
  EPIC: '#a335ee',
  RARE: '#0070dd',
  COMMON: '#6b7280',
}

export const RARITY_BLEED: Record<string, [string, string]> = {
  LEGENDARY: ['28', '14'],
  EPIC: ['1c', '0c'],
  RARE: ['14', '08'],
}

export function rarityBleedStyle(rarity: string): React.CSSProperties | null {
  const color = RARITY_BORDER_COLORS[rarity]
  const alpha = RARITY_BLEED[rarity]
  if (!color || !alpha) return null
  return {
    position: 'absolute' as const,
    inset: 0,
    background: `linear-gradient(to right, ${color}${alpha[0]} 0%, ${color}${alpha[1]} 40%, transparent 70%)`,
    pointerEvents: 'none' as const,
  }
}

export function CardCircle({ id, rarity, size = 48, missing, count, className }: {
  id: string
  rarity: string
  size?: number
  missing?: boolean
  count?: number
  className?: string
}) {
  const borderColor = RARITY_BORDER_COLORS[rarity] ?? '#555'
  const borderWidth = size >= 40 ? 2.5 : size >= 24 ? 2 : 1.5
  const innerWidth = size >= 40 ? 1.5 : 1

  return (
    <CardHover id={id} name="" className={`relative inline-block shrink-0 ${className ?? ''}`}>
      <div
        className="rounded-full overflow-hidden"
        style={{
          width: size,
          height: size,
          backgroundImage: `url(https://art.hearthstonejson.com/v1/256x/${id}.jpg)`,
          backgroundSize: '140%',
          backgroundPosition: 'center 30%',
          border: `${borderWidth}px solid ${borderColor}`,
          boxShadow: `inset 0 0 0 ${innerWidth}px #000, 0 2px 4px rgba(0,0,0,0.3)`,
          filter: missing ? 'grayscale(0.8) brightness(0.5)' : 'none',
        }}
      />
      {count != null && count > 1 && (
        <span className="absolute -bottom-0.5 -right-0.5 bg-navy text-[9px] text-gold font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center border border-white/20">
          {count}
        </span>
      )}
    </CardHover>
  )
}

export function RarityDot({ rarity, size = 8 }: { rarity: string; size?: number }) {
  return (
    <span
      className="inline-block rounded-full shrink-0"
      style={{
        width: size,
        height: size,
        backgroundColor: RARITY_BORDER_COLORS[rarity] ?? '#555',
      }}
    />
  )
}
