import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { loadExercisesCacheFirst } from '../../lib/catalog-cache.ts';
import { type Exercise } from '../../lib/catalog-rules.ts';
import { fetchExercises } from '../../lib/catalog.ts';
import { usePreferences } from '../../lib/preferences.ts';
import { type PlanDay, planStatusText, programPlan } from '../../lib/program-plan-rules.ts';
import { PrescriptionCards } from './PrescriptionCards.tsx';
import { useActiveProgram } from './use-active-program.ts';
import { useLastLoggedWeights } from './use-last-logged-weights.ts';

interface ProgramPlanScreenProps {
  userId: string;
}

function PlanDaySection({ day }: { day: PlanDay }) {
  const headingId = useId();
  const statusText = planStatusText(day.status);
  return (
    <section className="panel stack" aria-labelledby={headingId}>
      <h3 id={headingId}>{day.label}</h3>
      {statusText && <p className="muted">{statusText}</p>}
      <PrescriptionCards cards={day.cards} heading="h4" />
    </section>
  );
}

export function ProgramPlanScreen({ userId }: ProgramPlanScreenProps) {
  const { program, loadStatus, statusText } = useActiveProgram(userId);
  const { unitPref } = usePreferences();
  const lastLogged = useLastLoggedWeights(program);
  const [exercises, setExercises] = useState<readonly Exercise[]>([]);

  useEffect(() => {
    let active = true;
    void loadExercisesCacheFirst(
      localStorage,
      userId,
      () => fetchExercises({ includeArchived: true }),
      (list) => active && setExercises(list.exercises),
    );
    return () => {
      active = false;
    };
  }, [userId]);

  if (program.kind !== 'ready')
    return (
      <main className="screen stack">
        <h1 className="title">Your program</h1>
        <p className="panel muted">
          {statusText ?? ('message' in program ? program.message : null)}
          {loadStatus === 'none' && (
            <>
              {' '}
              <Link to="/programs">Pick a program</Link>
            </>
          )}
        </p>
      </main>
    );

  const plan = programPlan({
    definition: program.definition,
    enrollment: program.enrollment,
    state: program.state,
    unit: unitPref,
    exerciseNames: new Map(exercises.map((exercise) => [exercise.id, exercise.name])),
    lastLogged,
  });

  return (
    <main className="screen stack">
      <h1 className="title">{program.name} plan</h1>
      <Link to="/programs/active" className="tiny">
        Back to {program.name}
      </Link>
      <h2>{plan.title}</h2>
      {plan.days.map((day) => (
        <PlanDaySection key={JSON.stringify(day.position)} day={day} />
      ))}
    </main>
  );
}
