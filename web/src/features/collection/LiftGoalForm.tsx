import { type FormEvent, useState } from 'react';
import { NumberTextField } from '../../components/NumberTextField.tsx';
import { HIGHEST_GOAL_REPS, highestGoalWeight, type LiftGoalDraft } from '../../lib/progress/lift-goal-rules.ts';
import { type UnitPref } from '../../lib/profile/profile-rules.ts';
import { LOWEST_REPS, WEIGHT_INPUT_STEP, WEIGHT_STEPPER_STEP } from '../../lib/units.ts';

interface LiftGoalFormProps {
  initial: LiftGoalDraft;
  unit: UnitPref;
  busy: boolean;
  onSave: (draft: LiftGoalDraft) => void;
  onCancel: () => void;
}

export function LiftGoalForm({ initial, unit, busy, onSave, onCancel }: LiftGoalFormProps) {
  const [draft, setDraft] = useState(initial);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSave(draft);
  };

  return (
    <form className="stack" onSubmit={submit}>
      <div className="row wrap">
        <NumberTextField
          label={`Weight (${unit})`}
          accessibleName={`Goal weight in ${unit}`}
          value={draft.weight}
          lowest={WEIGHT_INPUT_STEP}
          highest={highestGoalWeight(unit)}
          step={WEIGHT_STEPPER_STEP[unit]}
          onCommit={(weight) => setDraft({ ...draft, weight })}
        />
        <NumberTextField
          label="Reps"
          accessibleName="Goal reps"
          value={draft.reps}
          lowest={LOWEST_REPS}
          highest={HIGHEST_GOAL_REPS}
          wholeNumber
          lastInGroup
          onCommit={(reps) => setDraft({ ...draft, reps })}
        />
      </div>
      <label className="field">
        Target date (optional)
        <input
          type="date"
          value={draft.targetDate}
          onChange={(event) => setDraft({ ...draft, targetDate: event.target.value })}
        />
      </label>
      <div className="row spread wrap">
        <button className="button" type="button" onClick={onCancel}>
          Cancel
        </button>
        <button className="button primary" type="submit" disabled={busy}>
          Save goal
        </button>
      </div>
    </form>
  );
}
