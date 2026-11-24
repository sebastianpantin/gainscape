import type { GarminSetGroup } from '@domain/index.ts';
import { DecimalInput } from '../../components/DecimalInput.tsx';
import type { LiftExercise } from '../../lib/exercises/catalog-rules.ts';
import {
  categoryLabel,
  decisionFor,
  type GroupChoice,
  groupName,
  groupView,
  type ReviewLift,
  UNDECIDED_GROUP,
  withFilledWeight,
  withGroupDecision,
  withSkip,
} from '../../lib/garmin/strength-review-rules.ts';
import type { UnitPref } from '../../lib/profile/profile-rules.ts';
import { ExercisePicker } from '../workout/ExercisePicker.tsx';

interface GarminSetGroupsProps {
  activityTitle: string;
  groups: readonly GarminSetGroup[];
  decisions: readonly GroupChoice[];
  lifts: ReadonlyMap<string, ReviewLift>;
  pickable: LiftExercise[];
  unit: UnitPref;
  disabled: boolean;
  openGroup: number | null;
  onOpenGroup: (index: number | null) => void;
  onDecisions: (decisions: GroupChoice[]) => void;
}

export function GarminSetGroups({
  activityTitle,
  groups,
  decisions,
  lifts,
  pickable,
  unit,
  disabled,
  openGroup,
  onOpenGroup,
  onDecisions,
}: GarminSetGroupsProps) {
  return (
    <ul className="import-groups" aria-label={`Set groups of ${activityTitle}`}>
      {groups.map((group, index) => {
        const decision = decisions[index] ?? UNDECIDED_GROUP;
        const lift = lifts.get(decision.exercise?.id ?? '');
        const name = `${groupName(group, index)} of ${activityTitle}`;
        const { sets, notes } = groupView(group, decision, lift?.name, unit);
        const open = openGroup === index && !decision.skipped && !disabled;
        const change = (to: (before: GroupChoice) => GroupChoice) =>
          onDecisions(withGroupDecision(decisions, index, to));
        return (
          <li className="stack import-group" key={index}>
            <span className="import-group-title">
              <strong>{categoryLabel(group.category)}</strong>
              <span className="muted">{sets.map((set) => set.text).join(', ')}</span>
            </span>
            {group.sets.length > 0 && (
              <>
                {!decision.skipped && lift && <span>{lift.name}</span>}
                <div className="row wrap">
                  <button
                    type="button"
                    className="button"
                    aria-expanded={open}
                    aria-label={`${lift ? 'Change exercise' : 'Choose exercise'} for ${name}`}
                    disabled={disabled || decision.skipped}
                    onClick={() => onOpenGroup(open ? null : index)}
                  >
                    {lift ? 'Change exercise' : 'Choose exercise'}
                  </button>
                  <label className="row">
                    <input
                      type="checkbox"
                      aria-label={`Skip ${name}`}
                      checked={decision.skipped}
                      disabled={disabled}
                      onChange={(event) => change((before) => withSkip(before, event.target.checked))}
                    />
                    Skip
                  </label>
                </div>
                {open && (
                  <ExercisePicker
                    exercises={pickable}
                    placeholder="Search exercises…"
                    onPick={(exercise) => {
                      const picked = lifts.get(exercise.id);
                      if (picked !== undefined) change(() => decisionFor(picked));
                      onOpenGroup(null);
                    }}
                  />
                )}
                {sets.map(
                  (set, setIndex) =>
                    set.asksWeight && (
                      <label className="field" key={setIndex}>
                        {`Weight for set ${setIndex + 1} (${unit})`}
                        <DecimalInput
                          aria-label={`Weight for set ${setIndex + 1} (${unit}), ${name}`}
                          value={decision.typedWeights[setIndex] ?? ''}
                          disabled={disabled}
                          onChange={(event) =>
                            change((before) => withFilledWeight(before, setIndex, event.target.value, unit))
                          }
                        />
                      </label>
                    ),
                )}
              </>
            )}
            {notes.map((note) => (
              <span className="muted tiny" key={note}>
                {note}
              </span>
            ))}
          </li>
        );
      })}
    </ul>
  );
}
