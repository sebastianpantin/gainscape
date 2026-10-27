import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { LineChart } from '../../components/LineChart.tsx';
import { ProblemWithRetry } from '../../components/ScreenProblem.tsx';
import { ListSkeleton } from '../../components/ScreenSkeleton.tsx';
import { type Collection } from '../../lib/collection/collection-data.ts';
import { type Profile, type Sex } from '../../lib/profile/profile-rules.ts';
import { trendDayText } from '../../lib/progress/bodyweight-trend-rules.ts';
import { collectionQuery, dotsHistoryQuery, profileQuery } from '../../lib/query/queries.ts';
import { loadedState } from '../../lib/query/query-state-rules.ts';
import { dotsCardFor } from '../../lib/stats/dots-rules.ts';
import {
  dotsHistorySeries,
  nextLevelText,
  powerliftingLiftIds,
  STRENGTH_LEVELS,
  strengthLevel,
  strengthLevelMarker,
  strengthMeterLabel,
} from '../../lib/stats/strength-level-rules.ts';
import { formatWeight } from '../../lib/units.ts';
import { cacheFirstNotice } from '../../offline/cache-first.ts';
import { OFFLINE_STATS_NOTICE } from '../../offline/stats-cache.ts';
import { DotsCardMessage } from './DotsCardMessage.tsx';

function StrengthBar({ score }: { score: number }) {
  return (
    <div className="strength-bar" role="img" aria-label={strengthMeterLabel(score)}>
      {STRENGTH_LEVELS.map((level) => (
        <span key={level.name} className={`strength-bar-segment strength-${level.name.toLowerCase()}`} />
      ))}
      <span className="strength-bar-marker" style={{ left: `${strengthLevelMarker(score) * 100}%` }} />
    </div>
  );
}

function StrengthLegend() {
  return (
    <ul className="strength-legend" aria-label="Strength levels">
      {STRENGTH_LEVELS.map((level, index) => (
        <li key={level.name}>
          <span className={`strength-swatch strength-${level.name.toLowerCase()}`} aria-hidden="true" />
          <span>{level.name}</span>
          <span className="muted">{index === 0 ? `below ${STRENGTH_LEVELS[1].fromScore}` : `${level.fromScore}+`}</span>
        </li>
      ))}
    </ul>
  );
}

function DotsHistorySection({ userId, liftIds, sex }: { userId: string; liftIds: string[]; sex: Sex }) {
  const history = useQuery(dotsHistoryQuery(userId, liftIds));
  const loaded = loadedState(history.data, history.error);
  const notice = loaded.status === 'ready' ? cacheFirstNotice(loaded.data, OFFLINE_STATS_NOTICE) : null;
  return (
    <section className="panel stack" aria-labelledby="strength-level-history">
      <h2 id="strength-level-history">DOTS over time</h2>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {loaded.status === 'loading' && <ListSkeleton panels={1} />}
      {loaded.status === 'failed' && <ProblemWithRetry problem={loaded.problem} onRetry={history.refetch} />}
      {loaded.status === 'ready' &&
        (loaded.data.loaded.length > 0 ? (
          <LineChart
            title="DOTS over time"
            series={dotsHistorySeries(loaded.data.loaded, sex)}
            formatX={trendDayText}
            formatY={(value) => `${value}`}
          />
        ) : (
          <p className="muted">
            Log the squat, bench press and deadlift on or after your first saved bodyweight to chart your DOTS.
          </p>
        ))}
    </section>
  );
}

function StrengthLevelPanels({
  userId,
  profile,
  collection,
}: {
  userId: string;
  profile: Profile;
  collection: Collection;
}) {
  const card = dotsCardFor(profile, collection);
  if (card.kind !== 'ready' || profile.sex === null) {
    return (
      <section className="panel stack" aria-labelledby="strength-level-now">
        <h2 id="strength-level-now">Current level</h2>
        {card.kind !== 'ready' && <DotsCardMessage card={card} />}
      </section>
    );
  }
  const level = strengthLevel(card.score);
  const liftIds = powerliftingLiftIds(collection.exercises);
  return (
    <>
      <section className="panel stack" aria-labelledby="strength-level-now">
        <h2 id="strength-level-now">Current level</h2>
        <p className="strength-level-name">{level.name}</p>
        <StrengthBar score={card.score} />
        <StrengthLegend />
        <p>{nextLevelText(level)}</p>
        <dl className="stack strength-figures">
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
      </section>
      {liftIds && <DotsHistorySection userId={userId} liftIds={liftIds} sex={profile.sex} />}
    </>
  );
}

export function StrengthLevelScreen({ userId }: { userId: string }) {
  const profile = useQuery(profileQuery(userId));
  const collection = useQuery(collectionQuery(userId));
  const loaded = loadedState(
    profile.data && collection.data ? { profile: profile.data.loaded, collection: collection.data.loaded } : undefined,
    profile.error ?? collection.error,
  );
  const retry = () => Promise.all([profile.refetch(), collection.refetch()]);

  return (
    <main className="screen stack">
      <Link className="back-link" to="/collection/stats">
        ‹ Stats
      </Link>
      <h1 className="title">Strength level</h1>
      {loaded.status === 'loading' && <ListSkeleton />}
      {loaded.status === 'failed' && <ProblemWithRetry problem={loaded.problem} onRetry={retry} />}
      {loaded.status === 'ready' && (
        <StrengthLevelPanels userId={userId} profile={loaded.data.profile} collection={loaded.data.collection} />
      )}
      <p className="muted tiny">
        Levels are Gainscape&apos;s rough guide bands, not an official scale. DOTS compares the squat, bench press and
        deadlift total across bodyweights. The chart uses each workout&apos;s best e1RM.
      </p>
    </main>
  );
}
