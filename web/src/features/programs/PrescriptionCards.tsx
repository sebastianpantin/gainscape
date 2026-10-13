import { useId } from 'react';
import { type PrescriptionCard } from '../../lib/programs/program-today-rules.ts';

interface PrescriptionCardsProps {
  cards: readonly PrescriptionCard[];
  heading: 'h3' | 'h4';
}

export function PrescriptionCards({ cards, heading: Heading }: PrescriptionCardsProps) {
  const idPrefix = useId();
  return cards.map((card) => {
    const headingId = `${idPrefix}-${card.slotId}`;
    return (
      <div className="stack prescription-card" key={card.slotId}>
        <Heading id={headingId}>{card.title}</Heading>
        {card.kind === 'exercise' ? (
          <ul className="prescription-list" aria-labelledby={headingId}>
            {card.rows.map((row) => (
              <li key={row.ref}>{row.line}</li>
            ))}
          </ul>
        ) : (
          <p className="muted">{card.message}</p>
        )}
      </div>
    );
  });
}
