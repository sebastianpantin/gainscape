import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ProblemWithRetry } from '../../components/ScreenProblem.tsx';
import { ListSkeleton } from '../../components/ScreenSkeleton.tsx';
import { messageOf } from '../../lib/error-text.ts';
import { usePreferences } from '../../lib/profile/preferences.ts';
import { exerciseListQuery, recordTimelineQuery } from '../../lib/query/queries.ts';
import { loadedState } from '../../lib/query/query-state-rules.ts';
import { NO_RECORDS_TEXT, recordTimelineMonths, showMoreRecordsButton } from '../../lib/stats/pr-timeline-rules.ts';
import { cacheFirstNotice } from '../../offline/cache-first.ts';
import { OFFLINE_STATS_NOTICE } from '../../offline/stats-cache.ts';
import { RecordTimelineList } from './RecordTimelineList.tsx';

export function RecordTimelineScreen({ userId }: { userId: string }) {
  const timeline = useInfiniteQuery(recordTimelineQuery(userId));
  const exercises = useQuery(exerciseListQuery(userId));
  const [moreProblem, setMoreProblem] = useState<string | null>(null);
  const { unitPref } = usePreferences();
  const pages = timeline.data?.pages;
  const loaded = loadedState(
    pages && exercises.data
      ? recordTimelineMonths(
          pages.flatMap((page) => page.loaded),
          new Map(exercises.data.map((exercise) => [exercise.id, exercise])),
          unitPref,
        )
      : undefined,
    timeline.error ?? exercises.error,
  );
  const notice = pages?.[0] ? cacheFirstNotice(pages[0], OFFLINE_STATS_NOTICE) : null;
  const retry = () => Promise.all([timeline.refetch(), exercises.refetch()]);
  const showMoreButton = showMoreRecordsButton(timeline);

  async function showMore() {
    if (!showMoreButton?.canFetch) return;
    setMoreProblem(null);
    const result = await timeline.fetchNextPage();
    if (result.isError) setMoreProblem(messageOf(result.error, 'Could not load more records.'));
  }

  return (
    <main className="screen stack">
      <Link className="back-link" to="/collection/stats">
        ‹ Stats
      </Link>
      <h1 className="title">Records timeline</h1>
      <p className="muted">Every personal record you have set, newest first.</p>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {loaded.status === 'loading' && <ListSkeleton />}
      {loaded.status === 'failed' && <ProblemWithRetry problem={loaded.problem} onRetry={retry} />}
      {loaded.status === 'ready' && loaded.data.length === 0 && <p className="muted">{NO_RECORDS_TEXT}</p>}
      {loaded.status === 'ready' &&
        loaded.data.map(({ month, title, records }) => (
          <section key={month} className="panel stack" aria-labelledby={`records-${month}`}>
            <h2 id={`records-${month}`}>{title}</h2>
            <RecordTimelineList label={`Records in ${title}`} records={records} />
          </section>
        ))}
      {moreProblem && (
        <p className="problem" role="alert">
          {moreProblem}
        </p>
      )}
      {showMoreButton && (
        <button className="button" type="button" disabled={!showMoreButton.canFetch} onClick={() => void showMore()}>
          {showMoreButton.label}
        </button>
      )}
    </main>
  );
}
