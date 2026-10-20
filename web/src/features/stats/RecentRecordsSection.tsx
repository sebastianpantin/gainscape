import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ProblemWithRetry } from '../../components/ScreenProblem.tsx';
import { ListSkeleton } from '../../components/ScreenSkeleton.tsx';
import { usePreferences } from '../../lib/profile/preferences.ts';
import { exerciseListQuery, recordTimelineQuery } from '../../lib/query/queries.ts';
import { loadedState } from '../../lib/query/query-state-rules.ts';
import { NO_RECORDS_TEXT, RECENT_RECORDS_SHOWN, recentRecords } from '../../lib/stats/pr-timeline-rules.ts';
import { RecordTimelineList } from './RecordTimelineList.tsx';

export function RecentRecordsSection({ userId }: { userId: string }) {
  const timeline = useInfiniteQuery(recordTimelineQuery(userId));
  const exercises = useQuery(exerciseListQuery(userId));
  const { unitPref } = usePreferences();
  const firstPage = timeline.data?.pages[0];
  const loaded = loadedState(
    firstPage && exercises.data
      ? recentRecords(
          firstPage.loaded,
          new Map(exercises.data.map((exercise) => [exercise.id, exercise])),
          unitPref,
          RECENT_RECORDS_SHOWN,
        )
      : undefined,
    timeline.error ?? exercises.error,
  );
  const retry = () => Promise.all([timeline.refetch(), exercises.refetch()]);

  return (
    <section className="panel stack" aria-labelledby="stats-records">
      <h2 id="stats-records">Recent records</h2>
      {loaded.status === 'loading' && <ListSkeleton panels={1} />}
      {loaded.status === 'failed' && <ProblemWithRetry problem={loaded.problem} onRetry={retry} />}
      {loaded.status === 'ready' && loaded.data.length === 0 && <p className="muted">{NO_RECORDS_TEXT}</p>}
      {loaded.status === 'ready' && loaded.data.length > 0 && (
        <>
          <RecordTimelineList label="Recent records" records={loaded.data} />
          <Link className="button" to="/collection/stats/records">
            All records
          </Link>
        </>
      )}
    </section>
  );
}
