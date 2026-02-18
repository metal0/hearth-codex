const WIKI = 'https://hearthstone.wiki.gg/images'

interface IconProps {
  size?: number
  className?: string
}

function WikiIcon({ url, size = 14, className }: IconProps & { url: string }) {
  return (
    <img
      src={url}
      alt=""
      width={size}
      height={size}
      className={`inline-block shrink-0 ${className ?? ''}`}
      style={{ objectFit: 'contain' }}
      referrerPolicy="no-referrer"
    />
  )
}

function MaskIcon({ url, size = 14, className }: IconProps & { url: string }) {
  return (
    <span
      className={`inline-block shrink-0 ${className ?? ''}`}
      style={{
        width: size,
        height: size,
        backgroundColor: 'currentColor',
        WebkitMaskImage: `url(${url})`,
        WebkitMaskSize: 'contain',
        WebkitMaskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskImage: `url(${url})`,
        maskSize: 'contain',
        maskRepeat: 'no-repeat',
        maskPosition: 'center',
      }}
    />
  )
}

export function WildIcon({ size = 14, className }: IconProps) {
  return <MaskIcon url="/icons/mode-wild.svg" size={size} className={className} />
}

export function StandardIcon({ size = 14, className }: IconProps) {
  return <MaskIcon url="/icons/mode-standard.svg" size={size} className={className} />
}

export function ManaIcon({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" className={`inline-block shrink-0 ${className ?? ''}`}>
      <path d="M7 0.5L12.5 3.5L12.5 10.5L7 13.5L1.5 10.5L1.5 3.5Z" fill="#1565C0" stroke="#4fc3f7" strokeWidth="0.8" />
      <path d="M7 2L10.5 4.2V9.8L7 12L3.5 9.8V4.2Z" fill="#1e88e5" />
      <path d="M7 2L10.5 4.2L7 6.5L3.5 4.2Z" fill="#42a5f5" />
    </svg>
  )
}

export function DustIcon({ size = 14, className }: IconProps) {
  return <WikiIcon url={`${WIKI}/thumb/Dust.png/${Math.round(size * 3)}px-Dust.png`} size={size} className={className} />
}

export function GoldIcon({ size = 14, className }: IconProps) {
  return <WikiIcon url={`${WIKI}/Gold_coin.png`} size={size} className={className} />
}

const RARITY_GEM_URLS: Record<string, string> = {
  COMMON: `${WIKI}/Common.png`,
  RARE: `${WIKI}/Rare.png`,
  EPIC: `${WIKI}/Epic.png`,
  LEGENDARY: `${WIKI}/Legendary.png`,
}

export function RarityGem({ size = 12, className, rarity }: IconProps & { rarity?: string }) {
  const url = rarity ? RARITY_GEM_URLS[rarity] : undefined
  if (url) {
    return (
      <img
        src={url}
        alt={rarity}
        width={size * 0.7}
        height={size}
        className={`inline-block shrink-0 ${className ?? ''}`}
        style={{ objectFit: 'contain' }}
      />
    )
  }
  return (
    <svg width={size * 0.8} height={size} viewBox="0 0 10 13" className={`inline-block shrink-0 ${className ?? ''}`}>
      <path d="M5 0L9.5 4L5 13L0.5 4Z" fill="currentColor" />
      <path d="M0.5 4L5 0L9.5 4L5 6Z" fill="currentColor" opacity="0.75" />
      <path d="M5 0L9.5 4L5 6Z" fill="currentColor" opacity="0.55" />
    </svg>
  )
}

export function CardIcon({ size = 18, className }: IconProps) {
  return <WikiIcon url={`${WIKI}/thumb/CardPack1.png/${Math.round(size * 3)}px-CardPack1.png`} size={size} className={className} />
}

export function PackIcon({ size = 18, className }: IconProps) {
  return <WikiIcon url={`${WIKI}/thumb/CardPack713.png/${Math.round(size * 3)}px-CardPack713.png`} size={size} className={className} />
}

export function CraftIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={`inline-block shrink-0 ${className ?? ''}`}>
      <path d="M4 11h16l-1.5 2H5.5L4 11z" fill="#9ca3af" />
      <path d="M4 11l2-1h12l2 1" fill="#d1d5db" />
      <path d="M7.5 13h9v3.5h-9V13z" fill="#6b7280" />
      <path d="M6 16.5h12v2.5H6v-2.5z" fill="#4b5563" />
      <path d="M2 10l2.5 1V10c0-.5-.3-1-1-1H2.5c-.5 0-.7.3-.5.6l.5.4z" fill="#9ca3af" />
      <path d="M14.5 4.5l-1.2 5.5h-2.6l-1.2-5.5c-.2-.7.3-1.5 1.1-1.5h2.8c.8 0 1.3.8 1.1 1.5z" fill="#b45309" />
      <rect x="10.5" y="9" width="3" height="2" rx=".5" fill="#78350f" />
    </svg>
  )
}

export function StoreIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={`inline-block shrink-0 ${className ?? ''}`}>
      <path d="M7 11c-1.5 0-2.5 1.2-2.5 3v3c0 3 2 5 7.5 5s7.5-2 7.5-5v-3c0-1.8-1-3-2.5-3H7z" fill="#92600a" />
      <path d="M7 11c-1.5 0-2.5 1.2-2.5 3v3c0 3 2 5 7.5 5s7.5-2 7.5-5v-3c0-1.8-1-3-2.5-3H7z" fill="url(#bag)" />
      <path d="M9 11V8.5c0-2 1.5-3.5 3-3.5s3 1.5 3 3.5V11" stroke="#6b4410" strokeWidth="2" fill="none" strokeLinecap="round" />
      <ellipse cx="9.5" cy="10" rx="2.8" ry="2" fill="#fbbf24" />
      <ellipse cx="14.5" cy="9.5" rx="2.8" ry="2" fill="#fcd34d" />
      <ellipse cx="12" cy="8" rx="2.5" ry="1.8" fill="#fde68a" />
      <defs>
        <linearGradient id="bag" x1="12" y1="11" x2="12" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#b87a1a" />
          <stop offset="1" stopColor="#78510e" />
        </linearGradient>
      </defs>
    </svg>
  )
}

export function CalculatorIcon({ size = 18, className }: IconProps) {
  return <GoldIcon size={size} className={className} />
}

export function HistoryIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}

export function DecksIcon({ size = 18, className }: IconProps) {
  return <WikiIcon url={`${WIKI}/thumb/CardBack0.png/${Math.round(size * 3)}px-CardBack0.png`} size={size} className={className} />
}

export function PackAdvisorIcon({ size = 18, className }: IconProps) {
  return <WikiIcon url={`${WIKI}/thumb/CardPack713.png/${Math.round(size * 3)}px-CardPack713.png`} size={size} className={className} />
}

const PACK_IMAGE_MAP: Record<string, number> = {
  EXPERT1: 1,
  GVG: 9,
  TGT: 10,
  OG: 11,
  GANGS: 19,
  UNGORO: 20,
  ICECROWN: 21,
  LOOTAPALOOZA: 30,
  GILNEAS: 31,
  BOOMSDAY: 38,
  TROLL: 40,
  DALARAN: 49,
  ULDUM: 128,
  DRAGONS: 347,
  BLACK_TEMPLE: 423,
  SCHOLOMANCE: 468,
  DARKMOON_FAIRE: 616,
  THE_BARRENS: 553,
  STORMWIND: 602,
  ALTERAC_VALLEY: 665,
  THE_SUNKEN_CITY: 694,
  REVENDRETH: 729,
  RETURN_OF_THE_LICH_KING: 821,
  BATTLE_OF_THE_BANDS: 854,
  TITANS: 819,
  WILD_WEST: 922,
  WHIZBANGS_WORKSHOP: 933,
  ISLAND_VACATION: 941,
  SPACE: 965,
  EMERALD_DREAM: 975,
  THE_LOST_CITY: 982,
  TIME_TRAVEL: 989,
  STANDARD: 713,
  WILD: 714,
}

export function ExpansionPackIcon({ code, size = 24, className, golden }: IconProps & { code: string; golden?: boolean }) {
  const map = golden ? GOLDEN_PACK_IMAGE_MAP : PACK_IMAGE_MAP
  const num = map[code]
  if (!num) {
    if (golden) {
      const normalNum = PACK_IMAGE_MAP[code]
      if (!normalNum) return null
      const px = Math.round(size * 3)
      return <WikiIcon url={`${WIKI}/thumb/CardPack${normalNum}.png/${px}px-CardPack${normalNum}.png`} size={size} className={className} />
    }
    return null
  }
  const px = Math.round(size * 3)
  return <WikiIcon url={`${WIKI}/thumb/CardPack${num}.png/${px}px-CardPack${num}.png`} size={size} className={className} />
}

const GOLDEN_PACK_IMAGE_MAP: Record<string, number> = {
  EXPERT1: 23,
  BLACK_TEMPLE: 939,
  SCHOLOMANCE: 603,
  DARKMOON_FAIRE: 643,
  THE_BARRENS: 686,
  STORMWIND: 737,
  ALTERAC_VALLEY: 841,
  THE_SUNKEN_CITY: 850,
  REVENDRETH: 874,
  RETURN_OF_THE_LICH_KING: 921,
  BATTLE_OF_THE_BANDS: 932,
  TITANS: 937,
  WILD_WEST: 952,
  WHIZBANGS_WORKSHOP: 970,
  ISLAND_VACATION: 977,
  SPACE: 986,
  EMERALD_DREAM: 990,
  THE_LOST_CITY: 1040,
  TIME_TRAVEL: 1055,
  STANDARD: 716,
  WILD: 904,
}
