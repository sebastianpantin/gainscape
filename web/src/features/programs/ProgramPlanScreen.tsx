import { useQuery } from '@tanstack/react-query';
import { useId } from 'react';
import { BackLink } from '../../components/BackLink.tsx';
import { ScreenProblem } from '../../components/ScreenProblem.tsx';
import { ListSkeleton } from '../../components/ScreenSkeleton.tsx';
import { usePreferences } from '../../lib/profile/preferences.ts';
import { type PlanDay, planStatusText, programPlan } from '../../lib/programs/program-plan-rules.ts';
import { exerciseListQuery } from '../../lib/query/queries.ts';
import { loadedState } from '../../lib/query/query-state-rules.ts';
import { PrescriptionCards } from './PrescriptionCards.tsx';
import { ProgramStatusScreen } from './ProgramStatusScreen.tsx';
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
  const exerciseList = useQuery(exerciseListQuery(userId));
  const exercises = loadedState(exerciseList.data, exerciseList.error);

  if (program.kind !== 'ready')
    return (
      <ProgramStatusScreen
        text={statusText ?? ('message' in program ? program.message : null)}
        loadStatus={loadStatus}
      />
    );

  const heading = (
    <>
      <BackLink parent="/programs/active" />
      <h1 className="title">{program.name} plan</h1>
    </>
  );
  if (exercises.status === 'failed')
    return <ScreenProblem heading={heading} problem={exercises.problem} onRetry={exerciseList.refetch} />;
  if (exercises.status === 'loading')
    return (
      <main className="screen stack">
        {heading}
        <ListSkeleton />
      </main>
    );

  const plan = programPlan({
    definition: program.definition,
    enrollment: program.enrollment,
    state: program.state,
    unit: unitPref,
    exerciseNames: new Map(exercises.data.map((exercise) => [exercise.id, exercise.name])),
    lastLogged,
  });

  return (
    <main className="screen stack">
      {heading}
      <h2>{plan.title}</h2>
      {plan.days.map((day) => (
        <PlanDaySection key={JSON.stringify(day.position)} day={day} />
      ))}
    </main>
  );
}
