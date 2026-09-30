import type { EffortLevel } from '@domain/types.ts';

const EFFORT_OPTIONS: { level: EffortLevel; label: string }[] = [
  { level: 'easy', label: 'Easy' },
  { level: 'hard', label: 'Hard' },
  { level: 'near_failure', label: 'Near fail' },
  { level: 'failure', label: 'Failure' },
];

interface EffortSelectorProps {
  selected: EffortLevel | null;
  onSelect: (level: EffortLevel | null) => void;
}

export function EffortSelector({ selected, onSelect }: EffortSelectorProps) {
  return (
    <div className="effort-selector" role="radiogroup" aria-label="Effort">
      {EFFORT_OPTIONS.map(({ level, label }) => (
        <button
          key={level}
          type="button"
          role="radio"
          aria-checked={selected === level}
          className={`effort-option ${selected === level ? 'selected' : ''}`}
          onClick={() => onSelect(selected === level ? null : level)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
