import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ProblemWithRetry } from '../../components/ScreenProblem.tsx';
import { ListSkeleton } from '../../components/ScreenSkeleton.tsx';
import { usePreferences } from '../../lib/profile/preferences.ts';
import { profileQuery, trainingDaysQuery } from '../../lib/query/queries.ts';
import { loadedState } from '../../lib/query/query-state-rules.ts';
import { monthCompare } from '../../lib/stats/period-compare-rules.ts';
import { trainingCalendar } from '../../lib/stats/training-calendar-rules.ts';
import { localDateIn, monthKey, shiftMonth } from '../../lib/ui/date-bucket-rules.ts';
import { cacheFirstNotice } from '../../offline/cache-first.ts';
import { OFFLINE_STATS_NOTICE } from '../../offline/stats-cache.ts';
import { CollectionTabs } from '../collection/CollectionScreen.tsx';
import { CollectionHeading } from '../collection/CollectionHeading.tsx';
import { LootStatsSection } from './LootStatsSection.tsx';
import { MonthCompareTable } from './MonthCompareTable.tsx';
import { RecentRecordsSection } from './RecentRecordsSection.tsx';
import { RelativeStrengthSection } from './RelativeStrengthSection.tsx';
import { TrainingCalendarTable } from './TrainingCalendarTable.tsx';
import { VolumeHistorySection } from './VolumeHistorySection.tsx';

function StatsSections({ userId, timezone, now }: { userId: string; timezone: string; now: number }) {
  const today = localDateIn(timezone, now);
  const thisMonth = monthKey(today);
  const [month, setMonth] = useState(thisMonth);
  const trainingDays = useQuery(trainingDaysQuery(userId, month));
  const { unitPref } = usePreferences();

  const loaded = loadedState(trainingDays.data, trainingDays.error);
  const notice = loaded.status === 'ready' ? cacheFirstNotice(loaded.data, OFFLINE_STATS_NOTICE) : null;

  return (
    <>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <section className="panel stack" aria-labelledby="stats-calendar">
        <h2 id="stats-calendar">Training calendar</h2>
        <div className="row spread">
          <button className="button" type="button" onClick={() => setMonth(shiftMonth(month, -1))}>
            <span aria-hidden="true">‹ </span>Previous month
          </button>
          <button
            className="button"
            type="button"
            disabled={month >= thisMonth}
            onClick={() => setMonth(shiftMonth(month, 1))}
          >
            Next month<span aria-hidden="true"> ›</span>
          </button>
        </div>
        {loaded.status === 'loading' && <ListSkeleton panels={1} />}
        {loaded.status === 'failed' && <ProblemWithRetry problem={loaded.problem} onRetry={trainingDays.refetch} />}
        {loaded.status === 'ready' && (
          <TrainingCalendarTable calendar={trainingCalendar(month, loaded.data.loaded, today)} />
        )}
      </section>
      {loaded.status === 'ready' && (
        <section className="panel stack" aria-labelledby="stats-compare">
          <h2 id="stats-compare">Month compare</h2>
          <MonthCompareTable compare={monthCompare(month, loaded.data.loaded, unitPref)} />
        </section>
      )}
      <VolumeHistorySection userId={userId} timezone={timezone} now={now} />
      <RelativeStrengthSection userId={userId} />
      <RecentRecordsSection userId={userId} />
      <LootStatsSection userId={userId} />
    </>
  );
}

export function StatsScreen({ userId }: { userId: string }) {
  const profile = useQuery(profileQuery(userId));
  const [openedAt] = useState(() => Date.now());
  const loaded = loadedState(profile.data?.loaded, profile.error);

  return (
    <main className="screen stack">
      <CollectionHeading tab="Stats" />
      <CollectionTabs />
      <p className="muted">How your training adds up over weeks and months.</p>
      {loaded.status === 'loading' && <ListSkeleton panels={1} />}
      {loaded.status === 'failed' && <ProblemWithRetry problem={loaded.problem} onRetry={profile.refetch} />}
      {loaded.status === 'ready' && <StatsSections userId={userId} timezone={loaded.data.timezone} now={openedAt} />}
    </main>
  );
}
