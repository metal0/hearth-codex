import { useState, useEffect, useRef } from 'react'
import type { EnrichedCard } from '../types.ts'
import { RARITY_COLORS, DUST_COST } from '../types.ts'
import { useStore } from '../stores/store.ts'

export default function CardTile({ card, onClick }: { card: EnrichedCard; onClick?: () => void }) {
  const av = useStore(s => s.artVersion)
  const [imgSrc, setImgSrc] = useState(card.imageUrl)
  const [textFallback, setTextFallback] = useState(false)
  const loadedRef = useRef(false)
  const retryRef = useRef(0)
  const isComplete = card.totalOwned >= card.maxCopies
  const isPartial = card.totalOwned > 0 && !isComplete
  const isUnowned = card.totalOwned === 0
  const fallbackUrl = `/art/${card.id}_normal.png?v=${av}`
  const isVariant = !card.imageUrl.includes('_normal.png')

  useEffect(() => {
    loadedRef.current = false
    retryRef.current = 0
    setImgSrc(card.imageUrl)
    setTextFallback(false)

    if (isVariant) {
      const timer = setTimeout(() => {
        if (!loadedRef.current) setImgSrc(fallbackUrl)
      }, 1500)
      return () => clearTimeout(timer)
    }
  }, [card.imageUrl, card.id, isVariant, fallbackUrl])

  useEffect(() => {
    if (!isVariant || imgSrc !== fallbackUrl || loadedRef.current) return
    let cancelled = false
    const delays = [10000, 30000]

    function scheduleRetry() {
      if (cancelled || retryRef.current >= delays.length) return
      const delay = delays[retryRef.current]
      setTimeout(async () => {
        if (cancelled) return
        try {
          const res = await fetch(card.imageUrl, { method: 'HEAD' })
          if (cancelled) return
          if (res.ok) { loadedRef.current = true; setImgSrc(card.imageUrl) }
          else if (res.status === 404) return
          else { retryRef.current++; scheduleRetry() }
        } catch {
          if (!cancelled) { retryRef.current++; scheduleRetry() }
        }
      }, delay)
    }

    scheduleRetry()
    return () => { cancelled = true }
  }, [isVariant, imgSrc, card.imageUrl, fallbackUrl])

  const src = imgSrc

  return (
    <div
      onClick={onClick}
      className={`relative group rounded-lg overflow-hidden transition-transform hover:scale-105 hover:z-10 cursor-pointer ${
        isUnowned ? 'grayscale opacity-50' : ''
      } ${isPartial ? 'opacity-80' : ''}`}
    >
      {textFallback ? (
        <div
          className="aspect-[3/4] flex flex-col items-center justify-center p-2 text-center border rounded-lg"
          style={{ borderColor: RARITY_COLORS[card.rarity] + '40', backgroundColor: '#1a1a2e' }}
        >
          <div className="text-xs font-bold mb-1" style={{ color: RARITY_COLORS[card.rarity] }}>
            {card.cost}
          </div>
          <div className="text-[10px] leading-tight text-gray-300">{card.name}</div>
          <div className="text-[9px] text-gray-500 mt-1">{card.cardClass}</div>
        </div>
      ) : (
        <img
          src={src}
          alt={card.name}
          loading="lazy"
          onLoad={() => { loadedRef.current = true }}
          onError={() => {
            if (src === fallbackUrl) setTextFallback(true)
            else setImgSrc(fallbackUrl)
          }}
          className="w-full aspect-[3/4] object-cover object-top"
        />
      )}

      {isPartial && (
        <div
          className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded text-[10px] font-bold shadow-lg"
          style={{ backgroundColor: '#eab308', color: '#000' }}
        >
          {card.totalOwned}/{card.maxCopies}
        </div>
      )}
      {isComplete && card.totalOwned > card.maxCopies && (
        <div
          className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded text-[10px] font-bold shadow-lg"
          style={{ backgroundColor: '#22c55e', color: '#000' }}
        >
          {card.totalOwned}
        </div>
      )}

      {/* Hover tooltip */}
      <div className="absolute inset-x-0 bottom-0 bg-black/90 p-2 translate-y-full group-hover:translate-y-0 transition-transform">
        <p className="text-xs font-medium text-white truncate">{card.name}</p>
        <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
          <span>{card.cardClass[0] + card.cardClass.slice(1).toLowerCase()}</span>
          <span>{DUST_COST[card.rarity]} dust</span>
        </div>
        {(card.goldenCount > 0 || card.diamondCount > 0 || card.signatureCount > 0) && (
          <div className="text-[10px] text-gray-500 mt-0.5">
            {card.goldenCount > 0 && <span className="text-yellow-400">G:{card.goldenCount} </span>}
            {card.diamondCount > 0 && <span className="text-cyan-300">D:{card.diamondCount} </span>}
            {card.signatureCount > 0 && <span className="text-purple-400">S:{card.signatureCount}</span>}
          </div>
        )}
        {(card.inclusionRate > 0 || (card.decks >= 100 && card.winrate > 0)) && (
          <div className="text-[10px] text-gray-500 mt-0.5">
            {card.inclusionRate > 0 && <span className="text-green-400">{card.inclusionRate.toFixed(2)}% played</span>}
            {card.inclusionRate > 0 && card.decks >= 100 && card.winrate > 0 && <span> · </span>}
            {card.decks >= 100 && card.winrate > 0 && <span className="text-amber-400">{card.winrate.toFixed(2)}% WR</span>}
          </div>
        )}
      </div>
    </div>
  )
}
