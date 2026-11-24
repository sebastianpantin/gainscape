import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { GarminImportOutcome } from '@domain/index.ts';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { BackLink } from '../../components/BackLink.tsx';
import { ProblemWithRetry } from '../../components/ScreenProblem.tsx';
import { ListSkeleton } from '../../components/ScreenSkeleton.tsx';
import type { LiftExercise } from '../../lib/exercises/catalog-rules.ts';
import { importActivities } from '../../lib/garmin/garmin-import.ts';
import {
  activitiesRange,
  activitiesToImport,
  allSelected,
  canBeChosen,
  chosenCount,
  fileSummary,
  groupDecisionsOfRow,
  importButtonLabel,
  importSummary,
  initialChoices,
  isChosen,
  isStrengthRow,
  needsBodyweight,
  needsExercisePick,
  pickableExercises,
  type ReviewChoices,
  type ReviewExercise,
  reviewExercises,
  reviewMonths,
  type ReviewRow,
  reviewRows,
  type ReviewSession,
  reviewSessions,
  rowBadge,
  rowFacts,
  rowTitle,
  withAllToggled,
  withBodyweightKnown,
  withExercisePicked,
  withGroupDecisions,
  withRowToggled,
} from '../../lib/garmin/import-review-rules.ts';
import {
  dropPendingImport,
  heldPendingImport,
  holdFinishedImport,
  type PendingImport,
} from '../../lib/garmin/pending-import.ts';
import { pickableLifts, type ReviewLift, reviewLifts } from '../../lib/garmin/strength-review-rules.ts';
import { deviceStorage } from '../../lib/platform/keyed-store.ts';
import { usePreferences } from '../../lib/profile/preferences.ts';
import { exerciseListQuery, garminImportReviewQuery, latestBodyweightQuery } from '../../lib/query/queries.ts';
import { loadedState } from '../../lib/query/query-state-rules.ts';
import { wrote } from '../../lib/query/writes.ts';
import { useGoBack } from '../../lib/ui/use-go-back.ts';
import { BodyweightPrompt } from '../workout/BodyweightPrompt.tsx';
import { GarminSetGroups } from './GarminSetGroups.tsx';
import { saveBodyweight } from './save-bodyweight.ts';

const SETTINGS_PATH = '/profile/settings';

interface ReviewListProps {
  rows: ReviewRow[];
  sessions: readonly ReviewSession[];
  choices: ReviewChoices;
  exercisesById: ReadonlyMap<string, ReviewExercise>;
  pickable: ReviewExercise[];
  lifts: ReadonlyMap<string, ReviewLift>;
  pickableLiftExercises: LiftExercise[];
  disabled: boolean;
  onChoices: (choices: ReviewChoices) => void;
}

interface OpenPicker {
  rowId: string;
  group: number;
}

function ReviewList({
  rows,
  sessions,
  choices,
  exercisesById,
  pickable,
  lifts,
  pickableLiftExercises,
  disabled,
  onChoices,
}: ReviewListProps) {
  const { unitPref } = usePreferences();
  const headingPrefix = useId();
  const [openPicker, setOpenPicker] = useState<OpenPicker | null>(null);
  const months = useMemo(() => reviewMonths(rows), [rows]);

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
      {months.map((month, monthIndex) => (
        <section className="stack import-month" key={month.label} aria-labelledby={`${headingPrefix}-${monthIndex}`}>
          <h2 className="import-month-heading" id={`${headingPrefix}-${monthIndex}`}>
            {month.label}
          </h2>
          <ul className="import-list">
            {month.rows.map((row) => {
              const badge = rowBadge(row, choices, sessions);
              const title = rowTitle(row);
              return (
                <li className={row.greyed === null ? 'import-row' : 'import-row greyed'} key={row.id}>
                  <label className="import-check">
                    <input
                      type="checkbox"
                      checked={isChosen(row, choices)}
                      disabled={disabled || !canBeChosen(row, choices)}
                      onChange={(event) => onChoices(withRowToggled(choices, row, event.target.checked))}
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
                  {needsExercisePick(row) && (
                    <select
                      aria-label={`Exercise for ${title}`}
                      value={choices.exerciseByRow.get(row.id) ?? ''}
                      disabled={disabled}
                      onChange={(event) => onChoices(withExercisePicked(choices, sessions, row, event.target.value))}
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
                  {isStrengthRow(row) && (
                    <GarminSetGroups
                      activityTitle={title}
                      groups={row.candidate.setGroups}
                      decisions={groupDecisionsOfRow(row, choices)}
                      lifts={lifts}
                      pickable={pickableLiftExercises}
                      unit={unitPref}
                      disabled={disabled}
                      openGroup={openPicker?.rowId === row.id ? openPicker.group : null}
                      onOpenGroup={(group) => setOpenPicker(group === null ? null : { rowId: row.id, group })}
                      onDecisions={(decisions) => onChoices(withGroupDecisions(choices, sessions, row, decisions))}
                    />
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
  const range = useMemo(() => activitiesRange(pending.activities), [pending.activities]);
  const contextQuery = useQuery(garminImportReviewQuery(userId, range));
  const exercisesQuery = useQuery(exerciseListQuery(userId));
  const bodyweightQuery = useQuery(latestBodyweightQuery(userId));
  const { unitPref } = usePreferences();
  const [picked, setPicked] = useState<ReviewChoices | null>(null);
  const [importing, setImporting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const context = contextQuery.data;
  const exercises = exercisesQuery.data;
  const bodyweightKg = bodyweightQuery.data;
  const loaded = loadedState(
    context && exercises && bodyweightKg !== undefined ? true : undefined,
    contextQuery.error ?? exercisesQuery.error ?? bodyweightQuery.error,
  );
  const review = useMemo(() => {
    if (context === undefined || exercises === undefined) return null;
    const pickableLiftExercises = pickableLifts(exercises);
    return {
      rows: reviewRows(pending.activities, context, now),
      sessions: reviewSessions(context.sessions, exercises),
      exercisesById: reviewExercises(exercises),
      pickable: pickableExercises(exercises),
      lifts: reviewLifts(pickableLiftExercises),
      pickableLiftExercises,
      exerciseIdByGarminCategory: context.exerciseIdByGarminCategory,
    };
  }, [context, exercises, pending.activities, now]);
  const bodyweightKnown = bodyweightKg === undefined ? undefined : bodyweightKg !== null;
  const firstChoices = useMemo(() => {
    if (review === null || bodyweightKnown === undefined) return null;
    const { exerciseIdByGarminCategory, lifts } = review;
    return initialChoices(review.rows, review.sessions, { exerciseIdByGarminCategory, lifts, bodyweightKnown });
  }, [review, bodyweightKnown]);
  const onScreen = useRef(false);
  const imported = useRef<GarminImportOutcome[]>([]);
  useEffect(() => {
    onScreen.current = true;
    return () => {
      onScreen.current = false;
      dropPendingImport();
    };
  }, []);
  const choices = picked ?? firstChoices;
  const count = review && choices ? chosenCount(review.rows, choices) : 0;

  const runImport = async () => {
    if (review === null || choices === null) return;
    setProblem(null);
    setImporting(true);
    const run = await importActivities(userId, activitiesToImport(review.rows, choices, review.exercisesById));
    if (run.outcomes.length > 0) await wrote(queryClient, { change: 'workout-changed' }).catch(() => undefined);
    setImporting(false);
    imported.current.push(...run.outcomes);
    if (run.problem !== null) return setProblem(run.problem);
    holdFinishedImport(importSummary(imported.current));
    if (onScreen.current) goBack();
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
          onRetry={() => Promise.all([contextQuery.refetch(), exercisesQuery.refetch(), bodyweightQuery.refetch()])}
        />
      )}
      {review && choices && needsBodyweight(review.rows, choices) && (
        <BodyweightPrompt
          unit={unitPref}
          submitLabel="Save bodyweight"
          onSave={async (savedKg) => {
            await saveBodyweight({ userId, bodyweightKg: savedKg, storage: deviceStorage(), queryClient });
            setPicked(withBodyweightKnown(choices, review.rows, review.sessions));
          }}
        />
      )}
      {review && choices && (
        <ReviewList
          rows={review.rows}
          sessions={review.sessions}
          choices={choices}
          exercisesById={review.exercisesById}
          pickable={review.pickable}
          lifts={review.lifts}
          pickableLiftExercises={review.pickableLiftExercises}
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
