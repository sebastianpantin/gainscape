import type { GarminGroupDecision, GarminSetGroup } from '@domain/index.ts';
import { useState } from 'react';
import { DecimalInput } from '../../components/DecimalInput.tsx';
import type { LiftExercise } from '../../lib/exercises/catalog-rules.ts';
import {
  categoryLabel,
  decisionFor,
  groupName,
  groupNotes,
  groupSetViews,
  type ReviewLift,
  withFilledWeight,
  withGroupDecision,
  withSkip,
} from '../../lib/garmin/strength-review-rules.ts';
import type { UnitPref } from '../../lib/profile/profile-rules.ts';
import { ExercisePicker } from '../workout/ExercisePicker.tsx';

interface WeightFieldProps {
  label: string;
  name: string;
  disabled: boolean;
  onTyped: (typed: string) => void;
}

function WeightField({ label, name, disabled, onTyped }: WeightFieldProps) {
  const [typed, setTyped] = useState('');
  return (
    <label className="field">
      {label}
      <DecimalInput
        aria-label={name}
        value={typed}
        disabled={disabled}
        onChange={(event) => {
          setTyped(event.target.value);
          onTyped(event.target.value);
        }}
      />
    </label>
  );
}

interface GarminSetGroupsProps {
  activityTitle: string;
  groups: readonly GarminSetGroup[];
  decisions: readonly GarminGroupDecision[];
  lifts: ReadonlyMap<string, ReviewLift>;
  pickable: LiftExercise[];
  unit: UnitPref;
  disabled: boolean;
  openGroup: number | null;
  onOpenGroup: (index: number | null) => void;
  onDecisions: (decisions: GarminGroupDecision[]) => void;
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
        const decision = decisions[index];
        const skipped = decision?.skipped === true;
        const lift = lifts.get(decision?.exercise?.id ?? '');
        const name = `${groupName(groups, index)} of ${activityTitle}`;
        const sets = groupSetViews(group, decision, unit);
        const notes = groupNotes(group, decision, lift?.name, unit);
        const open = openGroup === index && !skipped && !disabled;
        return (
          <li className="stack import-group" key={index}>
            <span className="import-group-title">
              <strong>{categoryLabel(group.category)}</strong>
              <span className="muted">{sets.map((set) => set.text).join(', ')}</span>
            </span>
            {group.sets.length > 0 && (
              <>
                {!skipped && lift && <span>{lift.name}</span>}
                <div className="row wrap">
                  <button
                    type="button"
                    className="button"
                    aria-expanded={open}
                    aria-label={`${lift ? 'Change exercise' : 'Choose exercise'} for ${name}`}
                    disabled={disabled || skipped}
                    onClick={() => onOpenGroup(open ? null : index)}
                  >
                    {lift ? 'Change exercise' : 'Choose exercise'}
                  </button>
                  <label className="row">
                    <input
                      type="checkbox"
                      aria-label={`Skip ${name}`}
                      checked={skipped}
                      disabled={disabled}
                      onChange={(event) =>
                        onDecisions(
                          withGroupDecision(decisions, index, (before) => withSkip(before, event.target.checked)),
                        )
                      }
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
                      if (picked !== undefined)
                        onDecisions(withGroupDecision(decisions, index, () => decisionFor(picked)));
                      onOpenGroup(null);
                    }}
                  />
                )}
                {sets.map(
                  (set, setIndex) =>
                    set.asksWeight && (
                      <WeightField
                        key={`${lift?.id ?? ''}-${setIndex}`}
                        label={`Weight for set ${setIndex + 1} (${unit})`}
                        name={`Weight for set ${setIndex + 1} (${unit}), ${name}`}
                        disabled={disabled}
                        onTyped={(typed) =>
                          onDecisions(
                            withGroupDecision(decisions, index, (before) =>
                              withFilledWeight(before, setIndex, typed, unit),
                            ),
                          )
                        }
                      />
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
