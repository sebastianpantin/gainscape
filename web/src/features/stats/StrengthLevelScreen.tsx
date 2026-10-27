import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LineChart } from '../../components/LineChart.tsx';
import { ProblemWithRetry } from '../../components/ScreenProblem.tsx';
import { ListSkeleton } from '../../components/ScreenSkeleton.tsx';
import { type Collection } from '../../lib/collection/collection-data.ts';
import { type Profile } from '../../lib/profile/profile-rules.ts';
import { trendDayText } from '../../lib/progress/bodyweight-trend-rules.ts';
import { collectionQuery, dotsHistoryQuery, profileQuery } from '../../lib/query/queries.ts';
import { loadedState } from '../../lib/query/query-state-rules.ts';
import { type DotsCard, dotsCardFor } from '../../lib/stats/dots-rules.ts';
import {
  dotsHistorySeries,
  levelRangeText,
  nextLevelText,
  STRENGTH_LEVELS,
  strengthLevel,
  strengthLevelMarker,
  strengthMeterLabel,
  withCurrentPoint,
} from '../../lib/stats/strength-level-rules.ts';
import { localDateIn } from '../../lib/ui/date-bucket-rules.ts';
import { formatWeight } from '../../lib/units.ts';
import { cacheFirstNotice } from '../../offline/cache-first.ts';
import { OFFLINE_STATS_NOTICE } from '../../offline/stats-cache.ts';
import { DotsCardMessage } from './DotsCardMessage.tsx';

type ReadyDotsCard = Extract<DotsCard, { kind: 'ready' }>;

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
          <span className="muted">{levelRangeText(index)}</span>
        </li>
      ))}
    </ul>
  );
}

function DotsHistorySection({ userId, card, today }: { userId: string; card: ReadyDotsCard; today: string }) {
  const history = useQuery(dotsHistoryQuery(userId, card.liftIds));
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
      {loaded.status === 'ready' && (
        <LineChart
          title="DOTS over time"
          series={dotsHistorySeries(
            withCurrentPoint(loaded.data.loaded, today, card.totalKg, card.bodyweightKg),
            card.sex,
          )}
          formatX={trendDayText}
          formatY={String}
        />
      )}
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
  const [openedAt] = useState(() => Date.now());
  const card = dotsCardFor(profile, collection);
  if (card.kind !== 'ready') {
    return (
      <section className="panel stack" aria-labelledby="strength-level-now">
        <h2 id="strength-level-now">Current level</h2>
        <DotsCardMessage card={card} />
      </section>
    );
  }
  const level = strengthLevel(card.score);
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
      <DotsHistorySection userId={userId} card={card} today={localDateIn(profile.timezone, openedAt)} />
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
        deadlift total across bodyweights. The chart takes past days from each workout&apos;s best e1RM and today from
        your current bests.
      </p>
    </main>
  );
}
