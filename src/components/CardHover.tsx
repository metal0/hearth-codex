import { useState, useCallback } from 'react'
import { useStore } from '../stores/store.ts'

interface CardHoverProps {
  id: string
  name: string
  className?: string
}

export default function CardHover({ id, name, className }: CardHoverProps) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const collectionMode = useStore(s => s.collectionMode)

  const handleEnter = useCallback((e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const viewportW = window.innerWidth
    const imgW = 200
    const flipped = rect.right + imgW + 16 > viewportW
    setPos({
      x: flipped ? rect.left - imgW - 8 : rect.right + 8,
      y: rect.top,
    })
  }, [])

  const baseUrl = `/art/${id}_normal.png`
  const imgUrl = collectionMode === 'golden'
    ? `/art/${id}_golden.png`
    : collectionMode === 'signature'
      ? `/art/${id}_signature.png`
      : collectionMode === 'diamond'
        ? `/art/${id}_diamond.png`
        : baseUrl

  return (
    <span
      className={className}
      onMouseEnter={handleEnter}
      onMouseLeave={() => setPos(null)}
    >
      {name}
      {pos && (
        <img
          src={imgUrl}
          className="fixed z-[100] w-[200px] rounded-lg shadow-2xl pointer-events-none"
          style={{ left: pos.x, top: pos.y, transform: 'translateY(-25%)' }}
          alt={name}
          onError={e => {
            if (!(e.target as HTMLImageElement).src.endsWith('_normal.png')) {
              (e.target as HTMLImageElement).src = baseUrl
            }
          }}
        />
      )}
    </span>
  )
}
