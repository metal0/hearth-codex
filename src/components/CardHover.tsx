import { useState, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../stores/store.ts'
import type { CollectionMode } from '../types.ts'

interface CardHoverProps {
  id: string
  name: string
  variant?: CollectionMode
  className?: string
  style?: React.CSSProperties
  children?: React.ReactNode
}

export default function CardHover({ id, name, variant = 'normal', className, style, children }: CardHoverProps) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const av = useStore(s => s.artVersion)

  useEffect(() => () => setPos(null), [])

  const handleEnter = useCallback((e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const viewportW = window.innerWidth
    const viewportH = window.innerHeight
    const imgW = 338
    const imgH = 481
    const flipped = rect.right + imgW + 16 > viewportW
    const x = flipped ? rect.left - imgW - 8 : rect.right + 8
    let y = rect.top - imgH * 0.25
    if (y + imgH > viewportH - 8) y = viewportH - imgH - 8
    if (y < 8) y = 8
    setPos({ x, y })
  }, [])

  const a = (v: string) => `/art/${id}_${v}.png?v=${av}`
  const baseUrl = a('normal')
  const imgUrl = variant !== 'normal' ? a(variant) : baseUrl

  return (
    <span
      className={className}
      style={style}
      onMouseEnter={handleEnter}
      onMouseLeave={() => setPos(null)}
    >
      {children ?? name}
      {pos && createPortal(
        <img
          src={imgUrl}
          className="fixed z-[9999] w-[338px] rounded-lg shadow-2xl pointer-events-none"
          style={{ left: pos.x, top: pos.y }}
          alt={name || id}
          onError={e => {
            const img = e.target as HTMLImageElement
            if (!img.src.includes('_normal.png')) {
              img.src = baseUrl
            }
          }}
        />,
        document.body,
      )}
    </span>
  )
}
