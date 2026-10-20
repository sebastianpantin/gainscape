import { useQuery } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { BarChart } from '../../components/BarChart.tsx';
import { ProblemWithRetry } from '../../components/ScreenProblem.tsx';
import { ListSkeleton } from '../../components/ScreenSkeleton.tsx';
import { VOLUME_TARGET, volumeSetsText } from '../../lib/progress/weekly-volume-rules.ts';
import { exerciseListQuery, weeklyExerciseSetsQuery } from '../../lib/query/queries.ts';
import { loadedState } from '../../lib/query/query-state-rules.ts';
import {
  type MuscleHistory,
  thisWeekText,
  volumeHistory,
  volumeHistoryBars,
} from '../../lib/stats/volume-history-rules.ts';

function MuscleVolumeChart({ muscles }: { muscles: readonly MuscleHistory[] }) {
  const [chosenSkill, setChosenSkill] = useState(muscles[0].skill);
  const pickerId = useId();
  const shown = muscles.find((muscle) => muscle.skill === chosenSkill) ?? muscles[0];
  return (
    <>
      <div className="field">
        <label htmlFor={pickerId}>Muscle</label>
        <select
          id={pickerId}
          value={shown.skill}
          onChange={(event) => {
            const picked = muscles.find((muscle) => muscle.skill === event.target.value);
            if (picked) setChosenSkill(picked.skill);
          }}
        >
          {muscles.map((muscle) => (
            <option key={muscle.skill} value={muscle.skill}>
              {muscle.name}
            </option>
          ))}
        </select>
      </div>
      <BarChart
        title={`${shown.name} working sets per week`}
        bars={volumeHistoryBars(shown)}
        formatValue={volumeSetsText}
        minYStep={1}
      />
      <p>{thisWeekText(shown)}</p>
    </>
  );
}

export function VolumeHistorySection({ userId, timezone, now }: { userId: string; timezone: string; now: number }) {
  const weeklySets = useQuery(weeklyExerciseSetsQuery(userId));
  const exercises = useQuery(exerciseListQuery(userId));
  const loaded = loadedState(
    weeklySets.data && exercises.data
      ? volumeHistory(
          weeklySets.data.loaded,
          new Map(exercises.data.map((exercise) => [exercise.id, exercise])),
          timezone,
          now,
        )
      : undefined,
    weeklySets.error ?? exercises.error,
  );
  const retry = () => Promise.all([weeklySets.refetch(), exercises.refetch()]);

  return (
    <section className="panel stack" aria-labelledby="stats-volume">
      <h2 id="stats-volume">Volume history</h2>
      {loaded.status === 'loading' && <ListSkeleton panels={1} />}
      {loaded.status === 'failed' && <ProblemWithRetry problem={loaded.problem} onRetry={retry} />}
      {loaded.status === 'ready' && <MuscleVolumeChart muscles={loaded.data} />}
      <p className="muted tiny">
        Working sets per Monday week, split across the muscles each exercise trains. The target is {VOLUME_TARGET.min}{' '}
        to {VOLUME_TARGET.max} sets a week per muscle.
      </p>
    </section>
  );
}
