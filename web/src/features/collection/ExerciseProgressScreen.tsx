import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { measuresRepsCapacity } from '@domain/types.ts';
import { LineChart } from '../../components/LineChart.tsx';
import { TermHelp } from '../../components/TermHelp.tsx';
import { messageOf } from '../../lib/error-text.ts';
import { type ExerciseProgress } from '../../lib/progress/exercise-progress.ts';
import {
  chartDateText,
  plateauSessions,
  progressChartSeries,
  progressValueText,
} from '../../lib/progress/exercise-progress-rules.ts';
import { plateauAdvice, plateauAdviceBasis, plateauOf } from '../../lib/progress/plateau-rules.ts';
import { formatLoad, formatSessionDate } from '../../lib/format.ts';
import { usePreferences } from '../../lib/profile/preferences.ts';
import { exerciseProgressQuery } from '../../lib/query/queries.ts';
import { skillShareRows } from '../../lib/progress/skill-map-rules.ts';

interface ExerciseProgressScreenProps {
  userId: string;
}

type Loaded =
  { kind: 'loading' } | { kind: 'problem'; message: string } | { kind: 'ready'; progress: ExerciseProgress };

const MISSING_EXERCISE = "This exercise isn't available.";

function loadedOf(progress: ExerciseProgress | null | undefined, error: Error | null): Loaded {
  if (progress) return { kind: 'ready', progress };
  if (progress === null) return { kind: 'problem', message: MISSING_EXERCISE };
  if (error) return { kind: 'problem', message: messageOf(error, 'Could not load progress.') };
  return { kind: 'loading' };
}

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
  const progress = useQuery(exerciseProgressQuery(userId, exerciseId));
  const [openedAt] = useState(Date.now);
  const loaded = loadedOf(progress.data, progress.isFetching ? null : progress.error);

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
  const trains = skillShareRows(exercise);
  const plateau =
    exercise.measure === undefined ? plateauOf(plateauSessions(sessions, exercise.loadType), openedAt) : null;

  return (
    <main className="screen stack">
      <BackButton />
      <div className="row">
        <h1 className="title">{exercise.name}</h1>
        {plateau && <span className="stalled-tag">Stalled</span>}
      </div>
      {plateau && (
        <section className="panel stack" aria-labelledby="stall-heading">
          <div className="row">
            <h2 id="stall-heading">Get past the stall</h2>
            <TermHelp glossaryKey="stalled" />
          </div>
          <p className="muted">No gain in your last {plateau.sessionsSince} workouts of this lift.</p>
          <ul>
            {plateauAdvice({
              loadType: exercise.loadType,
              unit: unitPref,
              ...plateauAdviceBasis(sessions, plateau),
            }).map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </section>
      )}
      {trains.length > 0 && (
        <section className="panel stack" aria-labelledby="trains-heading">
          <h2 id="trains-heading">Trains</h2>
          <ul>
            {trains.map((row) => (
              <li key={row.name}>
                {row.name} {row.percent}
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="panel stack" aria-labelledby="progress-chart-heading">
        <div className="row">
          <h2 id="progress-chart-heading">{repsOnly ? 'Reps over time' : 'Strength over time'}</h2>
          {!repsOnly && sessions.length > 0 && <TermHelp glossaryKey="e1rm" />}
        </div>
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
        <div className="row">
          <h2 id="rep-maxes-heading">{repsOnly ? 'Most reps' : 'Rep maxes'}</h2>
          {!repsOnly && <TermHelp glossaryKey="repMax" />}
        </div>
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
