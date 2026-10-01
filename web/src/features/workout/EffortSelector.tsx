import type { EffortInput, EffortLevel } from '@domain/types.ts';
import type { EffortInputMode } from '../../lib/profile.ts';
import { EFFORT_LEVEL_LABELS } from '../history/session-edit.ts';

interface EffortOption {
  effort: NonNullable<EffortInput>;
  label: string;
  accessibleName: string;
}

const LEVELS: EffortLevel[] = ['easy', 'hard', 'near_failure', 'failure'];

const RIR_CHOICES = [6, 5, 4, 3, 2, 1, 0];
const RPE_CHOICES = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];

const OPTIONS: Record<EffortInputMode, EffortOption[]> = {
  level: LEVELS.map((level) => {
    const label = EFFORT_LEVEL_LABELS[level];
    return { effort: { type: 'level', level }, label, accessibleName: label };
  }),
  rir: RIR_CHOICES.map((value) => {
    const label = value === 6 ? '6+' : String(value);
    return { effort: { type: 'rir', value }, label, accessibleName: `RIR ${label}` };
  }),
  rpe: RPE_CHOICES.map((value) => ({
    effort: { type: 'rpe', value },
    label: String(value),
    accessibleName: `RPE ${value}`,
  })),
};

const GROUP_LABELS: Record<EffortInputMode, string> = {
  level: 'Effort',
  rir: 'Reps in reserve',
  rpe: 'Rate of perceived exertion',
};

function sameEffort(a: EffortInput, b: EffortInput): boolean {
  if (a === null || b === null) return a === b;
  if (a.type === 'level' && b.type === 'level') return a.level === b.level;
  if (a.type === 'rir' && b.type === 'rir') return a.value === b.value;
  if (a.type === 'rpe' && b.type === 'rpe') return a.value === b.value;
  return false;
}

interface EffortSelectorProps {
  mode: EffortInputMode;
  selected: EffortInput;
  onSelect: (effort: EffortInput) => void;
}

export function EffortSelector({ mode, selected, onSelect }: EffortSelectorProps) {
  const shownMode = selected === null || selected.type === 'cardio' ? mode : selected.type;
  return (
    <div className={`effort-selector ${shownMode}`} role="radiogroup" aria-label={GROUP_LABELS[shownMode]}>
      {shownMode !== 'level' && (
        <span className="effort-caption" aria-hidden="true">
          {shownMode === 'rir' ? 'RIR' : 'RPE'}
        </span>
      )}
      {OPTIONS[shownMode].map((option) => {
        const checked = sameEffort(selected, option.effort);
        return (
          <button
            key={option.accessibleName}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={option.accessibleName === option.label ? undefined : option.accessibleName}
            className={`effort-option ${checked ? 'selected' : ''}`}
            onClick={() => onSelect(checked ? null : option.effort)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
