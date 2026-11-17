import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PrototypeSwitcher, usePrototypeVariant } from '../../components/PrototypeSwitcher.tsx';
import {
  PROTOTYPE_EXERCISES,
  PROTOTYPE_ROWS,
  exerciseName,
  formatDate,
  formatMonth,
  isSelectable,
  resultOf,
  rowFacts,
  selectedByDefault,
  type ImportResult,
  type PrototypeRow,
} from './prototype-data.ts';
import './prototype.css';

const VARIANTS = [
  { key: 'A', name: 'Checklist from Settings' },
  { key: 'B', name: 'Buckets from History' },
  { key: 'C', name: 'By activity type from Train' },
];

type Stage = 'entry' | 'review' | 'done';

function useReview() {
  const [stage, setStage] = useState<Stage>('entry');
  const [selected, setSelected] = useState(
    () => new Set(PROTOTYPE_ROWS.filter(selectedByDefault).map((row) => row.id)),
  );
  const [exercises, setExercises] = useState<Record<string, string | null>>({});
  const toggle = (ids: string[], on: boolean) =>
    setSelected((previous) => {
      const next = new Set(previous);
      ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
      return next;
    });
  const pick = (ids: string[], exercise: string) =>
    setExercises((previous) => ({ ...previous, ...Object.fromEntries(ids.map((id) => [id, exercise])) }));
  const exerciseOf = (row: PrototypeRow) => exercises[row.id] ?? row.exercise;
  const chosenCount = PROTOTYPE_ROWS.filter((row) => selected.has(row.id) && exerciseOf(row) !== null).length;
  const result = resultOf(PROTOTYPE_ROWS, selected, exercises);
  return { stage, setStage, selected, toggle, pick, exerciseOf, chosenCount, result };
}

type Review = ReturnType<typeof useReview>;

function FakeFilePicker({ onChosen, label }: { onChosen: () => void; label: string }) {
  return (
    <label className="button primary">
      {label}
      <input
        className="visually-hidden"
        type="file"
        accept=".fit,.zip"
        onChange={onChosen}
        onClick={(event) => {
          event.preventDefault();
          onChosen();
        }}
      />
    </label>
  );
}

function ExerciseSelect({ row, review }: { row: PrototypeRow; review: Review }) {
  return (
    <select
      className="prototype-select"
      aria-label={`Exercise for ${row.garminLabel} on ${formatDate(row.date)}`}
      value={review.exerciseOf(row) ?? ''}
      onChange={(event) => {
        review.pick([row.id], event.target.value);
        review.toggle([row.id], true);
      }}
    >
      <option value="" disabled>
        Choose exercise
      </option>
      {PROTOTYPE_EXERCISES.map((exercise) => (
        <option key={exercise.key} value={exercise.key}>
          {exercise.name}
        </option>
      ))}
    </select>
  );
}

function badgeFor(row: PrototypeRow): string | null {
  if (row.status === 'historyOnly') return 'History only';
  if (row.status === 'match') return 'Possible duplicate';
  if (row.status === 'unmapped') return 'Needs an exercise';
  return row.note;
}

function ResultLine({ result }: { result: ImportResult }) {
  return (
    <span>
      {result.scored} earned XP · {result.historyOnly} saved as history only · {result.skipped} skipped
    </span>
  );
}

function VariantA() {
  const review = useReview();
  const months = useMemo(() => {
    const groups = new Map<string, PrototypeRow[]>();
    PROTOTYPE_ROWS.forEach((row) =>
      groups.set(formatMonth(row.date), [...(groups.get(formatMonth(row.date)) ?? []), row]),
    );
    return [...groups.entries()];
  }, []);
  const selectable = PROTOTYPE_ROWS.filter(isSelectable).map((row) => row.id);
  const allOn = selectable.every((id) => review.selected.has(id));

  if (review.stage === 'entry') {
    return (
      <main className="screen stack">
        <h1 className="title">Settings</h1>
        <section className="panel stack" aria-labelledby="garmin-heading">
          <h2 id="garmin-heading">Garmin</h2>
          <FakeFilePicker label="Import from file" onChosen={() => review.setStage('review')} />
          <span className="hint">
            Export activities from Garmin Connect on the web: one activity as a .fit file, or all of them through
            Account Data Management as a .zip.
          </span>
        </section>
        <section className="panel stack">
          <h2>Training</h2>
          <span className="muted">Unit, bodyweight, rest timer…</span>
        </section>
      </main>
    );
  }

  if (review.stage === 'done') {
    return (
      <main className="screen stack">
        <h1 className="title">Settings</h1>
        <div className="prototype-toast" role="status">
          <strong>Import done.</strong> <ResultLine result={review.result} />{' '}
          <Link className="tap-link" to="/collection/history">
            See History
          </Link>
        </div>
        <section className="panel stack">
          <h2>Garmin</h2>
          <span className="muted">
            Last import: today, {review.result.scored + review.result.historyOnly} workouts.
          </span>
        </section>
      </main>
    );
  }

  return (
    <main className="screen stack prototype-with-bar">
      <div className="stack prototype-tight">
        <button type="button" className="button link prototype-back" onClick={() => review.setStage('entry')}>
          ‹ Back
        </button>
        <h1 className="title">Import review</h1>
        <span className="muted">garmin-export.zip · {PROTOTYPE_ROWS.length} activities</span>
      </div>
      <label className="row prototype-check-row">
        <input type="checkbox" checked={allOn} onChange={(event) => review.toggle(selectable, event.target.checked)} />
        <span>Select all</span>
      </label>
      {months.map(([month, rows]) => (
        <section key={month} className="stack prototype-tight">
          <h2 className="prototype-month">{month}</h2>
          <ul className="prototype-list">
            {rows.map((row) => {
              const canSelect = isSelectable(row);
              const badge = badgeFor(row);
              return (
                <li key={row.id} className={canSelect ? 'prototype-item' : 'prototype-item prototype-greyed'}>
                  <label className="prototype-check-row">
                    <input
                      type="checkbox"
                      disabled={!canSelect || review.exerciseOf(row) === null}
                      checked={review.selected.has(row.id) && review.exerciseOf(row) !== null}
                      onChange={(event) => review.toggle([row.id], event.target.checked)}
                    />
                    <span className="stack prototype-tight">
                      <span className="row spread">
                        <strong>
                          {formatDate(row.date)} · {row.garminLabel}
                        </strong>
                        {badge && <span className={`prototype-badge prototype-badge-${row.status}`}>{badge}</span>}
                      </span>
                      <span className="muted">
                        {row.exercise && row.status !== 'unmapped' ? `${exerciseName(row.exercise)} · ` : ''}
                        {rowFacts(row)}
                      </span>
                      {row.status === 'match' && <span className="muted tiny">{row.note}</span>}
                    </span>
                  </label>
                  {row.status === 'unmapped' && <ExerciseSelect row={row} review={review} />}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <div className="prototype-bar">
        <button
          type="button"
          className="button primary big"
          disabled={review.chosenCount === 0}
          onClick={() => review.setStage('done')}
        >
          Import {review.chosenCount} workouts
        </button>
      </div>
    </main>
  );
}

function Bucket({
  title,
  hint,
  rows,
  review,
  open,
  toggleable,
}: {
  title: string;
  hint: string;
  rows: PrototypeRow[];
  review: Review;
  open?: boolean;
  toggleable: 'group' | 'each' | 'none';
}) {
  if (rows.length === 0) return null;
  const ids = rows.map((row) => row.id);
  const on = ids.filter((id) => review.selected.has(id)).length;
  return (
    <section className="panel stack">
      <div className="row spread">
        <h2>
          {title} <span className="muted">({rows.length})</span>
        </h2>
        {toggleable === 'group' && (
          <button
            type="button"
            className="button toggle"
            aria-pressed={on === ids.length}
            onClick={() => review.toggle(ids, on !== ids.length)}
          >
            {on === ids.length ? 'Included' : on === 0 ? 'Left out' : `${on} of ${ids.length}`}
          </button>
        )}
      </div>
      <span className="hint">{hint}</span>
      <details open={open}>
        <summary>{toggleable === 'none' ? 'Show why' : 'Show workouts'}</summary>
        <ul className="prototype-list">
          {rows.map((row) => (
            <li key={row.id} className="prototype-item">
              <label className="prototype-check-row">
                {toggleable !== 'none' && (
                  <input
                    type="checkbox"
                    disabled={review.exerciseOf(row) === null}
                    checked={review.selected.has(row.id) && review.exerciseOf(row) !== null}
                    onChange={(event) => review.toggle([row.id], event.target.checked)}
                  />
                )}
                <span className="stack prototype-tight">
                  <strong>
                    {formatDate(row.date)} · {row.garminLabel}
                  </strong>
                  <span className="muted">{row.note ?? rowFacts(row)}</span>
                </span>
              </label>
              {row.status === 'unmapped' && <ExerciseSelect row={row} review={review} />}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

function VariantB() {
  const review = useReview();
  const by = (status: PrototypeRow['status'][]) => PROTOTYPE_ROWS.filter((row) => status.includes(row.status));

  if (review.stage === 'entry') {
    return (
      <main className="screen stack">
        <div className="row spread">
          <h1 className="title">History</h1>
          <button type="button" className="button outline" onClick={() => review.setStage('review')}>
            Import
          </button>
        </div>
        <ul className="prototype-list">
          {['17 Nov · Upper / Lower', '15 Nov · Running', '14 Nov · Upper / Lower'].map((label) => (
            <li key={label} className="panel">
              {label}
            </li>
          ))}
        </ul>
      </main>
    );
  }

  if (review.stage === 'done') {
    return (
      <main className="screen stack">
        <h1 className="title">Import done</h1>
        <section className="panel stack">
          <span className="prototype-big-number">{review.result.scored + review.result.historyOnly}</span>
          <span>workouts added to History</span>
          <ResultLine result={review.result} />
        </section>
        <button type="button" className="button primary" onClick={() => review.setStage('entry')}>
          Back to History
        </button>
      </main>
    );
  }

  return (
    <main className="screen stack prototype-with-bar">
      <div className="stack prototype-tight">
        <button type="button" className="button link prototype-back" onClick={() => review.setStage('entry')}>
          ‹ Back
        </button>
        <h1 className="title">Import review</h1>
      </div>
      <section className="panel stack">
        <FakeFilePicker label="Choose Garmin file" onChosen={() => review.setStage('review')} />
        <span className="muted">garmin-export.zip · {PROTOTYPE_ROWS.length} activities found</span>
      </section>
      <Bucket
        title="Ready"
        hint="Last 7 days. These earn XP and Records."
        rows={by(['new'])}
        review={review}
        toggleable="group"
      />
      <Bucket
        title="History only"
        hint="Older than 7 days. Saved to History, earn nothing."
        rows={by(['historyOnly'])}
        review={review}
        toggleable="group"
      />
      <Bucket
        title="Needs an exercise"
        hint="Garmin types Gainscape does not know yet. Pick one or leave them out."
        rows={by(['unmapped'])}
        review={review}
        open
        toggleable="each"
      />
      <Bucket
        title="Possible duplicates"
        hint="A workout you logged by hand overlaps these. Left out unless you include them."
        rows={by(['match'])}
        review={review}
        open
        toggleable="each"
      />
      <Bucket
        title="Not imported"
        hint="Already imported, deleted earlier, or over the limits."
        rows={by(['imported', 'deleted', 'rejected'])}
        review={review}
        toggleable="none"
      />
      <div className="prototype-bar">
        <button
          type="button"
          className="button primary big"
          disabled={review.chosenCount === 0}
          onClick={() => review.setStage('done')}
        >
          Import {review.chosenCount} workouts
        </button>
      </div>
    </main>
  );
}

function VariantC() {
  const review = useReview();
  const types = useMemo(() => {
    const groups = new Map<string, PrototypeRow[]>();
    PROTOTYPE_ROWS.forEach((row) => groups.set(row.garminType, [...(groups.get(row.garminType) ?? []), row]));
    return [...groups.values()].sort((a, b) => b.length - a.length);
  }, []);
  const notImported = PROTOTYPE_ROWS.filter((row) => !isSelectable(row));

  if (review.stage === 'entry') {
    return (
      <main className="screen stack">
        <h1 className="title">Train</h1>
        <section className="panel stack">
          <button type="button" className="button primary big">
            Start workout
          </button>
          <div className="row">
            <button type="button" className="button">
              Log past workout
            </button>
            <button type="button" className="button" onClick={() => review.setStage('review')}>
              Import from Garmin
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="screen stack prototype-with-bar">
      <div className="stack prototype-tight">
        <button type="button" className="button link prototype-back" onClick={() => review.setStage('entry')}>
          ‹ Back
        </button>
        <h1 className="title">Import review</h1>
        <span className="muted">
          {PROTOTYPE_ROWS.length} activities · {notImported.length} not importable
        </span>
      </div>
      {review.stage === 'done' && (
        <div className="prototype-toast" role="status">
          <strong>Imported.</strong> <ResultLine result={review.result} />
        </div>
      )}
      <ul className="prototype-list">
        {types.map((rows) => {
          const first = rows[0];
          const importable = rows.filter(isSelectable);
          const ids = importable.map((row) => row.id);
          const on = ids.filter((id) => review.selected.has(id)).length;
          const exercise = review.exerciseOf(first);
          const recent = importable.filter((row) => row.status === 'new' || row.status === 'match').length;
          return (
            <li key={first.garminType} className="panel stack">
              <div className="row spread">
                <strong>
                  {first.garminLabel} <span className="muted">× {rows.length}</span>
                </strong>
                <button
                  type="button"
                  className="button toggle"
                  aria-pressed={on > 0}
                  aria-label={`Include ${first.garminLabel}`}
                  disabled={ids.length === 0 || exercise === null}
                  onClick={() => review.toggle(ids, on === 0)}
                >
                  {on === 0 ? 'Off' : on === ids.length ? 'All' : `${on}/${ids.length}`}
                </button>
              </div>
              <div className="row prototype-tight">
                <span className="muted">as</span>
                <select
                  className="prototype-select"
                  aria-label={`Exercise for every ${first.garminLabel}`}
                  value={exercise ?? ''}
                  onChange={(event) => {
                    review.pick(
                      rows.map((row) => row.id),
                      event.target.value,
                    );
                    review.toggle(ids, true);
                  }}
                >
                  <option value="" disabled>
                    Choose exercise
                  </option>
                  {PROTOTYPE_EXERCISES.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </div>
              <span className="hint">
                {recent} earn XP · {importable.length - recent} history only · {rows.length - importable.length} not
                importable
              </span>
              <details>
                <summary>Pick single workouts</summary>
                <ul className="prototype-list">
                  {rows.map((row) => (
                    <li
                      key={row.id}
                      className={isSelectable(row) ? 'prototype-item' : 'prototype-item prototype-greyed'}
                    >
                      <label className="prototype-check-row">
                        <input
                          type="checkbox"
                          disabled={!isSelectable(row) || exercise === null}
                          checked={review.selected.has(row.id) && exercise !== null}
                          onChange={(event) => review.toggle([row.id], event.target.checked)}
                        />
                        <span>
                          {formatDate(row.date)} · {rowFacts(row)}
                          {badgeFor(row) && <span className="muted"> · {badgeFor(row)}</span>}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          );
        })}
      </ul>
      {review.stage !== 'done' && (
        <div className="prototype-bar">
          <button
            type="button"
            className="button primary big"
            disabled={review.chosenCount === 0}
            onClick={() => review.setStage('done')}
          >
            Import {review.chosenCount} workouts
          </button>
        </div>
      )}
    </main>
  );
}

export function GarminImportPrototype() {
  const variant = usePrototypeVariant(VARIANTS.map((entry) => entry.key));
  return (
    <>
      <div className="prototype-banner">PROTOTYPE · stub data · nothing is saved</div>
      {variant === 'A' && <VariantA key="A" />}
      {variant === 'B' && <VariantB key="B" />}
      {variant === 'C' && <VariantC key="C" />}
      <PrototypeSwitcher variants={VARIANTS} />
    </>
  );
}
