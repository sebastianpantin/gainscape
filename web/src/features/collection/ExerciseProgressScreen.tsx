import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { measuresRepsCapacity } from '@domain/types.ts';
import { LineChart } from '../../components/LineChart.tsx';
import { messageOf } from '../../lib/error-text.ts';
import { type ExerciseProgress, fetchExerciseProgress } from '../../lib/exercise-progress.ts';
import { chartDateText, progressChartSeries, progressValueText } from '../../lib/exercise-progress-rules.ts';
import { formatLoad, formatSessionDate } from '../../lib/format.ts';
import { usePreferences } from '../../lib/preferences.ts';

interface ExerciseProgressScreenProps {
  userId: string;
}

type Loaded =
  { kind: 'loading' } | { kind: 'problem'; message: string } | { kind: 'ready'; progress: ExerciseProgress };

const MISSING_EXERCISE = "This exercise isn't available.";

function BackButton() {
  const navigate = useNavigate();
  const location = useLocation();
  const cameFromApp = location.key !== 'default';
  return (
    <button type="button" className="back-link" onClick={() => (cameFromApp ? navigate(-1) : navigate('/collection'))}>
      ← Back
    </button>
  );
}

export function ExerciseProgressScreen({ userId }: ExerciseProgressScreenProps) {
  const { exerciseId = '' } = useParams();
  const { unitPref } = usePreferences();
  const [loaded, setLoaded] = useState<Loaded>({ kind: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    fetchExerciseProgress(userId, exerciseId, controller.signal).then(
      (progress) => setLoaded(progress ? { kind: 'ready', progress } : { kind: 'problem', message: MISSING_EXERCISE }),
      (error: unknown) => {
        if (!controller.signal.aborted)
          setLoaded({ kind: 'problem', message: messageOf(error, 'Could not load progress.') });
      },
    );
    return () => controller.abort();
  }, [userId, exerciseId]);

  if (loaded.kind !== 'ready')
    return (
      <main className="screen stack">
        <BackButton />
        {loaded.kind === 'loading' ? (
          <p>Loading…</p>
        ) : (
          <p className="problem" role="alert">
            {loaded.message}
          </p>
        )}
      </main>
    );

  const { exercise, sessions, repMaxes, maxReps } = loaded.progress;
  const repsOnly = measuresRepsCapacity(exercise.loadType);
  const series = progressChartSeries(sessions, exercise.loadType, unitPref);
  const formatY = (value: number) => progressValueText(value, exercise.loadType, unitPref);

  return (
    <main className="screen stack">
      <BackButton />
      <h1 className="title">{exercise.name}</h1>
      <section className="panel stack" aria-labelledby="progress-chart-heading">
        <h2 id="progress-chart-heading">{repsOnly ? 'Reps over time' : 'Strength over time'}</h2>
        {sessions.length === 0 ? (
          <p className="muted">Log this exercise to see your progress.</p>
        ) : (
          <LineChart
            title={repsOnly ? 'Most reps per workout' : 'e1RM and top set per workout'}
            series={series}
            formatX={chartDateText}
            formatY={formatY}
            minYStep={repsOnly ? 1 : undefined}
          />
        )}
      </section>
      <section className="panel stack" aria-labelledby="rep-maxes-heading">
        <h2 id="rep-maxes-heading">{repsOnly ? 'Most reps' : 'Rep maxes'}</h2>
        {repsOnly ? (
          <p>{maxReps ? `${maxReps.reps} reps · ${formatSessionDate(maxReps.localDate)}` : 'No record yet.'}</p>
        ) : (
          <table className="rep-max-table">
            <thead>
              <tr>
                <th scope="col">Reps</th>
                <th scope="col">Weight</th>
                <th scope="col">Set on</th>
              </tr>
            </thead>
            <tbody>
              {repMaxes.map((entry) => (
                <tr key={entry.reps}>
                  <th scope="row">{entry.reps}RM</th>
                  <td>{entry.loadKg === null ? '—' : formatLoad(entry.loadKg, exercise.loadType, unitPref)}</td>
                  <td>{entry.localDate === null ? '—' : formatSessionDate(entry.localDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
