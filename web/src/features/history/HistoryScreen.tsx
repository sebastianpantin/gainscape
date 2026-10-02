import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { fetchSessionPage } from '../../lib/history.ts';
import { HISTORY_PAGE_SIZE, type HistorySession } from '../../lib/history-rules.ts';
import { CollectionTabs } from '../collection/CollectionScreen.tsx';
import { formatXp } from '../workout/xp-preview.ts';
import { formatSessionDate, isEditable, sessionXp } from './session-edit.ts';
import { messageOf } from '../../lib/error-text.ts';

function SessionItem({ session, now }: { session: HistorySession; now: number }) {
  const summaryParts = [
    session.historyOnly ? null : `+${formatXp(sessionXp(session.summary))} XP`,
    `${session.setCount} ${session.setCount === 1 ? 'set' : 'sets'}`,
  ].filter(Boolean);
  return (
    <li>
      <Link className="button history-item" to={`/collection/history/${session.id}`}>
        <span className="row spread">
          <strong>{formatSessionDate(session.localDate)}</strong>
          {session.historyOnly ? (
            <span className="history-tag history-only">Saved to history, no XP</span>
          ) : (
            isEditable(session, now) && <span className="history-tag">Editable</span>
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
      {!sessions && !problem && <p>Loading…</p>}
      {sessions?.length === 0 && <p className="panel muted">No workouts yet. Finish one and it shows up here.</p>}
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
