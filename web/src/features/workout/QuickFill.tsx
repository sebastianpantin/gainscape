import { useState } from 'react';
import { NumberTextField } from '../../components/NumberTextField.tsx';
import { HIGHEST_REPS, LOWEST_REPS } from '../../lib/units.ts';

interface QuickFillProps {
  defaultSets: number;
  mostSets: number;
  defaultReps: number;
  onFill: (sets: number, reps: number) => void;
}

export function QuickFill({ defaultSets, mostSets, defaultReps, onFill }: QuickFillProps) {
  const [sets, setSets] = useState(Math.min(defaultSets, mostSets));
  const [reps, setReps] = useState(defaultReps);
  return (
    <fieldset className="quick-fill">
      <legend>Quick fill</legend>
      <NumberTextField label="sets" value={sets} lowest={1} highest={mostSets} wholeNumber onCommit={setSets} />
      <span aria-hidden="true">×</span>
      <NumberTextField
        label="reps"
        value={reps}
        lowest={LOWEST_REPS}
        highest={HIGHEST_REPS}
        wholeNumber
        lastInGroup
        onCommit={setReps}
      />
      <button className="button" type="button" onClick={() => onFill(sets, reps)}>
        Fill
      </button>
    </fieldset>
  );
}
