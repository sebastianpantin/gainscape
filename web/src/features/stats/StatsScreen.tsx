import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ProblemWithRetry } from '../../components/ScreenProblem.tsx';
import { ListSkeleton } from '../../components/ScreenSkeleton.tsx';
import { usePreferences } from '../../lib/profile/preferences.ts';
import { todayLocalDate } from '../../lib/progress/lift-goal-rules.ts';
import { trainingDaysQuery } from '../../lib/query/queries.ts';
import { loadedState } from '../../lib/query/query-state-rules.ts';
import { monthCompare } from '../../lib/stats/period-compare-rules.ts';
import { trainingCalendar } from '../../lib/stats/training-calendar-rules.ts';
import { monthKey, shiftMonth } from '../../lib/ui/date-bucket-rules.ts';
import { cacheFirstNotice } from '../../offline/cache-first.ts';
import { OFFLINE_STATS_NOTICE } from '../../offline/stats-cache.ts';
import { LootStatsSection } from './LootStatsSection.tsx';
import { MonthCompareTable } from './MonthCompareTable.tsx';
import { RecentRecordsSection } from './RecentRecordsSection.tsx';
import { TrainingCalendarTable } from './TrainingCalendarTable.tsx';
import { VolumeHistorySection } from './VolumeHistorySection.tsx';

export function StatsScreen({ userId }: { userId: string }) {
  const today = todayLocalDate(new Date());
  const thisMonth = monthKey(today);
  const [month, setMonth] = useState(thisMonth);
  const trainingDays = useQuery(trainingDaysQuery(userId, month));
  const { unitPref } = usePreferences();

  const loaded = loadedState(trainingDays.data, trainingDays.error);
  const notice = loaded.status === 'ready' ? cacheFirstNotice(loaded.data, OFFLINE_STATS_NOTICE) : null;

  return (
    <main className="screen stack">
      <Link className="back-link" to="/collection">
        ‹ Collection
      </Link>
      <h1 className="title">Stats</h1>
      <p className="muted">How your training adds up over weeks and months.</p>
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
      <VolumeHistorySection userId={userId} today={today} />
      <RecentRecordsSection userId={userId} />
      <LootStatsSection userId={userId} />
    </main>
  );
}
