import { isSessionEditable } from '@domain/edit-window.ts';
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { fetchSessionPage } from '../../lib/history.ts';
import { HISTORY_PAGE_SIZE, type HistorySession } from '../../lib/history-rules.ts';
import { EmptyState } from '../../components/EmptyState.tsx';
import { ListSkeleton } from '../../components/ScreenSkeleton.tsx';
import { CollectionTabs } from '../collection/CollectionScreen.tsx';
import { formatSessionDate, formatXp, sessionXp } from '../../lib/format.ts';
import { messageOf } from '../../lib/error-text.ts';
import { sessionTimingParts } from '../../lib/session-timing-rules.ts';

function SessionItem({ session, now }: { session: HistorySession; now: number }) {
  const summaryParts = [
    session.historyOnly ? null : `+${formatXp(sessionXp(session.summary))} XP`,
    `${session.setCount} ${session.setCount === 1 ? 'set' : 'sets'}`,
    ...sessionTimingParts(session),
  ].filter(Boolean);
  return (
    <li>
      <Link className="button history-item" to={`/collection/history/${session.id}`}>
        <span className="row spread">
          <strong>{formatSessionDate(session.localDate)}</strong>
          {session.historyOnly ? (
            <span className="history-tag history-only">Saved to history, no XP</span>
          ) : (
            isSessionEditable(session, now) && <span className="history-tag">Editable</span>
          )}
        </span>
        <span className="muted">{summaryParts.join(' · ')}</span>
        {session.notes && <span className="muted tiny history-notes">{session.notes}</span>}
      </Link>
    </li>
  );
}

export function HistoryScreen() {
  const location = useLocation();
  const notice = (location.state as { notice?: string } | null)?.notice ?? null;
  const [sessions, setSessions] = useState<HistorySession[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    let active = true;
    fetchSessionPage(null).then(
      (page) => {
        if (!active) return;
        setSessions(page);
        setHasMore(page.length === HISTORY_PAGE_SIZE);
      },
      (error: Error) => active && setProblem(error.message),
    );
    return () => {
      active = false;
    };
  }, []);

  const loadMore = async () => {
    if (!sessions || sessions.length === 0) return;
    setLoadingMore(true);
    setProblem(null);
    try {
      const page = await fetchSessionPage(sessions.at(-1)!);
      setSessions([...sessions, ...page]);
      setHasMore(page.length === HISTORY_PAGE_SIZE);
    } catch (error) {
      setProblem(messageOf(error, 'Could not load more workouts.'));
    }
    setLoadingMore(false);
  };

  return (
    <main className="screen stack">
      <h1 className="title">Collection log</h1>
      <CollectionTabs />
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {problem && (
        <p className="problem" role="alert">
          {problem}
        </p>
      )}
      {!sessions && !problem && <ListSkeleton />}
      {sessions?.length === 0 && (
        <EmptyState text="No workouts yet. Finish one and it shows up here." startLabel="Start your first workout" />
      )}
      {sessions && sessions.length > 0 && (
        <ul className="history-list" aria-label="Workouts">
          {sessions.map((session) => (
            <SessionItem key={session.id} session={session} now={now} />
          ))}
        </ul>
      )}
      {hasMore && (
        <button className="button" type="button" disabled={loadingMore} onClick={loadMore}>
          Load more
        </button>
      )}
      <span className="hint">You can change or delete workouts from the last 7 days.</span>
    </main>
  );
}
