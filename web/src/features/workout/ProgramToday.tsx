import { type LastLoggedWeights, type Position, resolvePrescription } from '@domain/index.ts';
import { useEffect, useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { SegmentedChoice } from '../../components/SegmentedChoice.tsx';
import { type Exercise } from '../../lib/catalog-rules.ts';
import { type UnitPref } from '../../lib/profile.ts';
import { fetchLastLoggedSets } from '../../lib/programs.ts';
import {
  type ActiveProgram,
  dayChoices,
  pickedDay,
  positionLabel,
  prescriptionCards,
  startLabel,
} from '../../lib/program-today-rules.ts';
import { type PrescribedDayStart } from '../../offline/draft-format.ts';

interface ProgramTodayProps {
  program: ActiveProgram;
  exercises: readonly Exercise[];
  unit: UnitPref;
  disabled: boolean;
  onStart: (day: PrescribedDayStart) => void;
}

function useLastLoggedWeights(exerciseIds: readonly string[]): LastLoggedWeights {
  const [weights, setWeights] = useState<LastLoggedWeights>({});
  const idsKey = exerciseIds.join(',');

  useEffect(() => {
    if (idsKey === '') return;
    let active = true;
    fetchLastLoggedSets(idsKey.split(',')).then(
      (lastSets) => active && setWeights(Object.fromEntries([...lastSets].map(([id, set]) => [id, set.weightKg]))),
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [idsKey]);

  return weights;
}

export function ProgramToday({ program, exercises, unit, disabled, onStart }: ProgramTodayProps) {
  const [picked, setPicked] = useState<Position | null>(null);
  const idPrefix = useId();
  const boundIds = useMemo(
    () =>
      program.kind === 'ready'
        ? [...new Set(Object.values(program.enrollment.bindings).filter((id) => id !== null))].sort()
        : [],
    [program],
  );
  const lastLogged = useLastLoggedWeights(boundIds);

  if (program.kind === 'none') return null;
  if (program.kind === 'needs_update')
    return (
      <section className="panel stack" aria-label={program.name}>
        <h2>{program.name}</h2>
        <p className="muted">{program.message}</p>
      </section>
    );
  if (program.kind === 'template_missing')
    return (
      <section className="panel stack" aria-label="Your program">
        <h2>Your program</h2>
        <p className="muted">{program.message}</p>
      </section>
    );

  const { definition, enrollment, state, name } = program;
  const choices = dayChoices(definition, state);
  if (choices.length === 0) return null;
  const position = pickedDay(choices, picked);
  const chosenLabel = positionLabel(definition, position);
  const slots = resolvePrescription(definition, enrollment, state, position, lastLogged);
  const names = new Map(exercises.map((exercise) => [exercise.id, exercise.name]));
  const cards = prescriptionCards(definition, slots, unit, names);

  return (
    <section className="panel stack" aria-label={name}>
      <div className="row spread">
        <h2>{name}</h2>
        <Link to="/programs/active" className="tiny">
          Manage program
        </Link>
      </div>
      <span className="field">Day</span>
      <SegmentedChoice
        label="Day"
        stacked
        options={choices.map((choice) => ({ value: choice.label, label: choice.label }))}
        current={chosenLabel}
        onPick={(label) => setPicked(choices.find((choice) => choice.label === label)?.position ?? null)}
      />
      {cards.map((card) => {
        const headingId = `${idPrefix}-${card.slotId}`;
        return (
          <div className="stack prescription-card" key={card.slotId}>
            <h3 id={headingId}>{card.title}</h3>
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
      })}
      <button
        className="button primary big"
        type="button"
        disabled={disabled}
        onClick={() =>
          onStart({
            enrollmentId: enrollment.id,
            templateKey: program.templateKey,
            programName: name,
            dayName: chosenLabel,
            position,
            exercises: slots.flatMap((slot) => (slot.kind === 'exercise' ? [slot] : [])),
          })
        }
      >
        {startLabel(name, definition, position)}
      </button>
    </section>
  );
}
