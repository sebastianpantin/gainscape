import { type UnitPref } from '../../lib/profile/profile.ts';
import { type BackoffSuggestion } from '../../lib/workout/backoff-rules.ts';

interface BackoffChipProps {
  backoff: BackoffSuggestion;
  unit: UnitPref;
  setNumber: number;
  onFill: (changes: { weightKg: number; reps: number }) => void;
}

export function BackoffChip({ backoff, unit, setNumber, onFill }: BackoffChipProps) {
  const text = `Back-off ${backoff.shown} ${unit} × ${backoff.reps}`;
  return (
    <button
      type="button"
      className="last-set"
      aria-label={`${text}, fill set ${setNumber}`}
      onClick={() => onFill({ weightKg: backoff.weightKg, reps: backoff.reps })}
    >
      <span className="last-set-chip">{text}</span>
    </button>
  );
}
