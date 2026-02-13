import type { EnrichedCard } from '../types.ts'
import CardTile from './CardTile.tsx'

export default function CardGrid({ cards, onCardClick }: { cards: EnrichedCard[]; onCardClick?: (card: EnrichedCard) => void }) {
  if (cards.length === 0) {
    return (
      <p className="text-gray-500 text-sm py-4">No cards match your filters.</p>
    )
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(235px,1fr))] gap-2">
      {cards.map(card => (
        <CardTile key={card.dbfId} card={card} onClick={onCardClick ? () => onCardClick(card) : undefined} />
      ))}
    </div>
  )
}
