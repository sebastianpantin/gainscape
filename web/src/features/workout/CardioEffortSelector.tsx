import { CARDIO_EFFORT_LEVELS, type EffortInput } from '@domain/types.ts';
import { CARDIO_EFFORT_LABELS } from '../history/session-edit.ts';

interface CardioEffortSelectorProps {
  selected: EffortInput;
  onSelect: (effort: EffortInput) => void;
}

export function CardioEffortSelector({ selected, onSelect }: CardioEffortSelectorProps) {
  const selectedLevel = selected?.type === 'cardio' ? selected.level : null;
  return (
    <div className="effort-selector" role="radiogroup" aria-label="Effort">
      {CARDIO_EFFORT_LEVELS.map((level) => {
        const checked = level === selectedLevel;
        return (
          <button
            key={level}
            type="button"
            role="radio"
            aria-checked={checked}
            className={`effort-option ${checked ? 'selected' : ''}`}
            onClick={() => onSelect(checked ? null : { type: 'cardio', level })}
          >
            {CARDIO_EFFORT_LABELS[level]}
          </button>
        );
      })}
    </div>
  );
}
