import { useQuery } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { LineChart } from '../../components/LineChart.tsx';
import { ProblemWithRetry } from '../../components/ScreenProblem.tsx';
import { ListSkeleton } from '../../components/ScreenSkeleton.tsx';
import { type Profile } from '../../lib/profile/profile-rules.ts';
import { trendDayText } from '../../lib/progress/bodyweight-trend-rules.ts';
import { collectionQuery, profileQuery, relativeStrengthQuery } from '../../lib/query/queries.ts';
import { loadedState } from '../../lib/query/query-state-rules.ts';
import { competitionBests, dotsCard } from '../../lib/stats/dots-rules.ts';
import {
  currentMultipleText,
  type RelativeStrengthLift,
  relativeStrengthLifts,
  relativeStrengthSeries,
} from '../../lib/stats/relative-strength-rules.ts';
import { formatWeight } from '../../lib/units.ts';
import { type Collection } from '../../lib/collection/collection-data.ts';

function LiftMultipleChart({ userId, lift }: { userId: string; lift: RelativeStrengthLift }) {
  const relative = useQuery(relativeStrengthQuery(userId, lift.id));
  const loaded = loadedState(relative.data?.loaded, relative.error);
  if (loaded.status === 'loading') return <ListSkeleton panels={1} />;
  if (loaded.status === 'failed') return <ProblemWithRetry problem={loaded.problem} onRetry={relative.refetch} />;
  const points = loaded.data;
  return (
    <>
      {points.length > 0 && (
        <LineChart
          title={`${lift.name} e1RM per bodyweight`}
          series={relativeStrengthSeries(points)}
          formatX={trendDayText}
          formatY={(value) => `${value}×`}
        />
      )}
      <p>{currentMultipleText(points)}</p>
    </>
  );
}

function LiftPicker({ userId, lifts }: { userId: string; lifts: RelativeStrengthLift[] }) {
  const [chosenId, setChosenId] = useState(lifts[0].id);
  const pickerId = useId();
  const shown = lifts.find((lift) => lift.id === chosenId) ?? lifts[0];
  return (
    <>
      <div className="field">
        <label htmlFor={pickerId}>Lift</label>
        <select id={pickerId} value={shown.id} onChange={(event) => setChosenId(event.target.value)}>
          {lifts.map((lift) => (
            <option key={lift.id} value={lift.id}>
              {lift.name}
            </option>
          ))}
        </select>
      </div>
      <LiftMultipleChart userId={userId} lift={shown} />
    </>
  );
}

function DotsPanel({ profile, collection }: { profile: Profile; collection: Collection }) {
  const card = dotsCard({
    sex: profile.sex,
    bodyweightKg: profile.bodyweightKg,
    bestE1rmKgByKey: competitionBests(collection.exercises, collection.data.strengthByExercise),
  });
  return (
    <div className="stack">
      <h3>DOTS score</h3>
      {card.kind === 'needs-sex' && (
        <p className="muted">
          Set your sex in <Link to="/profile/settings">Settings</Link> to see your DOTS score.
        </p>
      )}
      {card.kind === 'needs-bodyweight' && (
        <p className="muted">
          Save your bodyweight in <Link to="/profile/edit">Edit profile</Link> to see your DOTS score.
        </p>
      )}
      {card.kind === 'missing-lifts' && <p className="muted">{card.text}</p>}
      {card.kind === 'ready' && (
        <dl className="stack">
          <div className="row spread">
            <dt>DOTS</dt>
            <dd>{card.score.toFixed(2)}</dd>
          </div>
          <div className="row spread">
            <dt>Squat, bench and deadlift e1RM</dt>
            <dd>{formatWeight(card.totalKg, profile.unitPref)}</dd>
          </div>
          <div className="row spread">
            <dt>Bodyweight</dt>
            <dd>{formatWeight(card.bodyweightKg, profile.unitPref)}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}

export function RelativeStrengthSection({ userId }: { userId: string }) {
  const profile = useQuery(profileQuery(userId));
  const collection = useQuery(collectionQuery(userId));
  const loaded = loadedState(
    profile.data && collection.data ? { profile: profile.data.loaded, collection: collection.data.loaded } : undefined,
    profile.error ?? collection.error,
  );
  const retry = () => Promise.all([profile.refetch(), collection.refetch()]);
  const lifts =
    loaded.status === 'ready'
      ? relativeStrengthLifts(loaded.data.collection.exercises, loaded.data.collection.data.strengthByExercise)
      : [];

  return (
    <section className="panel stack" aria-labelledby="stats-relative-strength">
      <h2 id="stats-relative-strength">Relative strength</h2>
      {loaded.status === 'loading' && <ListSkeleton panels={1} />}
      {loaded.status === 'failed' && <ProblemWithRetry problem={loaded.problem} onRetry={retry} />}
      {loaded.status === 'ready' && (
        <>
          {lifts.length === 0 ? (
            <p className="muted">Log a barbell lift to see its e1RM per bodyweight.</p>
          ) : (
            <LiftPicker userId={userId} lifts={lifts} />
          )}
          <DotsPanel profile={loaded.data.profile} collection={loaded.data.collection} />
        </>
      )}
      <p className="muted tiny">
        Each workout&apos;s best e1RM divided by the latest bodyweight saved on or before that day. Barbell lifts only,
        since a dumbbell lift is logged per dumbbell. DOTS compares the squat, bench press and deadlift total across
        bodyweights.
      </p>
    </section>
  );
}
