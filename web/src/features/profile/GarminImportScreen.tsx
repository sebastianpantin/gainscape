import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { BackLink } from '../../components/BackLink.tsx';
import { ProblemWithRetry } from '../../components/ScreenProblem.tsx';
import { ListSkeleton } from '../../components/ScreenSkeleton.tsx';
import { activeExercises, isCardioExercise } from '../../lib/exercises/catalog-rules.ts';
import { importActivities } from '../../lib/garmin/garmin-import.ts';
import {
  activitiesToImport,
  allSelected,
  chosenCount,
  exerciseOfRow,
  fileSummary,
  importButtonLabel,
  importSummary,
  initialChoices,
  isChosen,
  type ReviewChoices,
  type ReviewContext,
  type ReviewExercise,
  reviewExercises,
  reviewMonths,
  reviewRange,
  type ReviewRow,
  reviewRows,
  rowBadge,
  rowFacts,
  rowTitle,
  withAllToggled,
  withExercisePicked,
  withRowToggled,
} from '../../lib/garmin/import-review-rules.ts';
import {
  dropPendingImport,
  heldPendingImport,
  holdFinishedImport,
  type PendingImport,
} from '../../lib/garmin/pending-import.ts';
import { usePreferences } from '../../lib/profile/preferences.ts';
import { exerciseListQuery, garminImportReviewQuery } from '../../lib/query/queries.ts';
import { loadedState } from '../../lib/query/query-state-rules.ts';
import { wrote } from '../../lib/query/writes.ts';
import { useGoBack } from '../../lib/ui/use-go-back.ts';

const SETTINGS_PATH = '/profile/settings';
const NOTHING_KNOWN: ReviewContext = { exerciseIdByGarminType: new Map(), seen: [], sessions: [] };

interface ReviewListProps {
  rows: ReviewRow[];
  context: ReviewContext;
  choices: ReviewChoices;
  exercisesById: ReadonlyMap<string, ReviewExercise>;
  pickable: ReviewExercise[];
  disabled: boolean;
  onChoices: (choices: ReviewChoices) => void;
}

function ReviewList({ rows, context, choices, exercisesById, pickable, disabled, onChoices }: ReviewListProps) {
  const { unitPref } = usePreferences();
  const headingPrefix = useId();
  const { sessions } = context;

  return (
    <>
      <label className="row">
        <input
          type="checkbox"
          checked={allSelected(rows, choices)}
          disabled={disabled}
          onChange={(event) => onChoices(withAllToggled(rows, choices, event.target.checked))}
        />
        Select all
      </label>
      {reviewMonths(rows).map((month, monthIndex) => (
        <section className="stack import-month" key={month.label} aria-labelledby={`${headingPrefix}-${monthIndex}`}>
          <h2 className="import-month-heading" id={`${headingPrefix}-${monthIndex}`}>
            {month.label}
          </h2>
          <ul className="import-list">
            {month.rows.map((row) => {
              const badge = rowBadge(row, choices, sessions);
              const title = rowTitle(row);
              const needsPick = row.greyed === null && row.candidate.exerciseId === null;
              return (
                <li className={row.greyed === null ? 'import-row' : 'import-row greyed'} key={row.id}>
                  <label className="import-check">
                    <input
                      type="checkbox"
                      checked={isChosen(row, choices)}
                      disabled={disabled || row.greyed !== null || exerciseOfRow(row, choices) === null}
                      onChange={(event) => onChoices(withRowToggled(rows, choices, row.id, event.target.checked))}
                    />
                    <span className="stack import-row-text">
                      <span className="import-row-title">
                        <strong>{title}</strong>
                        {badge && <span className={`import-badge ${badge.kind}`}>{badge.text}</span>}
                      </span>
                      <span className="muted">{rowFacts(row, choices, exercisesById, unitPref)}</span>
                      {badge?.kind === 'possible_duplicate' && <span className="muted tiny">{badge.note}</span>}
                    </span>
                  </label>
                  {needsPick && (
                    <select
                      aria-label={`Exercise for ${title}`}
                      value={choices.exerciseByRow.get(row.id) ?? ''}
                      disabled={disabled}
                      onChange={(event) =>
                        onChoices(withExercisePicked(rows, choices, sessions, row.id, event.target.value))
                      }
                    >
                      <option value="" disabled>
                        Choose exercise
                      </option>
                      {pickable.map((exercise) => (
                        <option key={exercise.id} value={exercise.id}>
                          {exercise.name}
                        </option>
                      ))}
                    </select>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </>
  );
}

function ImportReview({ userId, pending }: { userId: string; pending: PendingImport }) {
  const queryClient = useQueryClient();
  const goBack = useGoBack(SETTINGS_PATH);
  const [now] = useState(() => Date.now());
  const range = useMemo(
    () => reviewRange(reviewRows(pending.activities, NOTHING_KNOWN, now)),
    [pending.activities, now],
  );
  const contextQuery = useQuery(garminImportReviewQuery(userId, range));
  const exercisesQuery = useQuery(exerciseListQuery(userId));
  const [picked, setPicked] = useState<ReviewChoices | null>(null);
  const [importing, setImporting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const loaded = loadedState(
    contextQuery.data && exercisesQuery.data
      ? { context: contextQuery.data, exercises: exercisesQuery.data }
      : undefined,
    contextQuery.error ?? exercisesQuery.error,
  );
  const review = useMemo(() => {
    if (loaded.status !== 'ready') return null;
    const cardio = loaded.data.exercises.filter(isCardioExercise);
    const rows = reviewRows(pending.activities, loaded.data.context, now);
    return {
      rows,
      context: loaded.data.context,
      exercisesById: reviewExercises(cardio),
      pickable: [...reviewExercises(activeExercises(loaded.data.exercises).filter(isCardioExercise)).values()].sort(
        (first, second) => first.name.localeCompare(second.name),
      ),
      firstChoices: initialChoices(rows, loaded.data.context.sessions),
    };
  }, [loaded, pending.activities, now]);
  const choices = picked ?? review?.firstChoices ?? null;
  const count = review && choices ? chosenCount(review.rows, choices) : 0;

  const runImport = async () => {
    if (review === null || choices === null) return;
    setProblem(null);
    setImporting(true);
    const run = await importActivities(userId, activitiesToImport(review.rows, choices, review.exercisesById));
    if (run.outcomes.length > 0) await wrote(queryClient, { change: 'workout-changed' }).catch(() => undefined);
    setImporting(false);
    if (run.problem !== null) return setProblem(run.problem);
    dropPendingImport();
    holdFinishedImport(importSummary(run.outcomes));
    goBack();
  };

  return (
    <main className="screen stack">
      <div className="stack tight">
        <BackLink parent={SETTINGS_PATH} disabled={importing} />
        <h1 className="title">Import review</h1>
        <span className="muted">{fileSummary(pending.fileName, pending.activities.length)}</span>
      </div>
      {loaded.status === 'loading' && <ListSkeleton />}
      {loaded.status === 'failed' && (
        <ProblemWithRetry
          problem={loaded.problem}
          onRetry={() => Promise.all([contextQuery.refetch(), exercisesQuery.refetch()])}
        />
      )}
      {review && choices && (
        <ReviewList
          rows={review.rows}
          context={review.context}
          choices={choices}
          exercisesById={review.exercisesById}
          pickable={review.pickable}
          disabled={importing}
          onChoices={setPicked}
        />
      )}
      {problem && (
        <p className="problem" role="alert">
          {problem}
        </p>
      )}
      <div className="finish-bar">
        <button
          className="button primary big"
          type="button"
          disabled={count === 0 || importing}
          onClick={() => void runImport()}
        >
          {importing ? 'Importing…' : importButtonLabel(count)}
        </button>
      </div>
    </main>
  );
}

export function GarminImportScreen({ userId }: { userId: string }) {
  const [pending] = useState(heldPendingImport);
  if (pending === null) return <Navigate to={SETTINGS_PATH} replace />;
  return <ImportReview userId={userId} pending={pending} />;
}
