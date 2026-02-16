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
  return <WikiIcon url={`${WIKI}/AchievementPin_Gameplay.png`} size={size} className={className} />
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
