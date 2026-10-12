import { isSessionEditable } from '@domain/edit-window.ts';
import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { fetchSessionPage } from '../../lib/history.ts';
import { HISTORY_PAGE_SIZE, type HistorySession } from '../../lib/history-rules.ts';
import { EmptyState } from '../../components/EmptyState.tsx';
import { Icon } from '../../components/Icon.tsx';
import { ListSkeleton } from '../../components/ScreenSkeleton.tsx';
import { CollectionTabs } from '../collection/CollectionScreen.tsx';
import { formatSessionDate, formatXp, sessionXp } from '../../lib/format.ts';
import { messageOf } from '../../lib/error-text.ts';
import { sessionTimingParts } from '../../lib/session-timing-rules.ts';
import { exerciseListText, recordBadgeText, sessionVolumeKg, volumeText } from '../../lib/history-overview-rules.ts';
import { usePreferences } from '../../lib/preferences.ts';
import type { UnitPref } from '../../lib/profile-rules.ts';

function EditState({ session, now }: { session: HistorySession; now: number }) {
  if (session.historyOnly) return <span className="history-tag history-only">Saved to history, no XP</span>;
  if (isSessionEditable(session, now))
    return (
      <span className="history-tag">
        <Icon name="pencil" size={12} />
        Editable
      </span>
    );
  return (
    <span className="history-tag history-locked">
      <Icon name="lock" size={12} />
      Locked
    </span>
  );
}

interface SessionItemProps {
  session: HistorySession;
  now: number;
  unit: UnitPref;
  cardRef?: RefObject<HTMLLIElement | null>;
}

function SessionItem({ session, now, unit, cardRef }: SessionItemProps) {
  const summaryParts = [
    session.historyOnly ? null : `+${formatXp(sessionXp(session.summary))} XP`,
    `${session.setCount} ${session.setCount === 1 ? 'set' : 'sets'}`,
    volumeText(sessionVolumeKg(session.overviewSets), unit),
    ...sessionTimingParts(session),
  ].filter(Boolean);
  const exercises = exerciseListText(session.overviewSets);
  const records = recordBadgeText(session.summary.prs?.length ?? 0);
  return (
    <li ref={cardRef}>
      <Link className="button history-item" to={`/collection/history/${session.id}`}>
        <span className="row spread">
          <strong>{formatSessionDate(session.localDate)}</strong>
          <EditState session={session} now={now} />
        </span>
        {(exercises || records) && (
          <span className="history-exercises">
            {records && <span className="history-record-badge">{records}</span>}
            {exercises && <span className="history-exercise-names">{exercises}</span>}
          </span>
        )}
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
  const [autoLoad, setAutoLoad] = useState(true);
  const { unitPref } = usePreferences();
  const loadingRef = useRef(false);

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

  const loadMore = useCallback(async () => {
    if (!sessions || sessions.length === 0 || loadingRef.current) return;
    loadingRef.current = true;
    setLoadingMore(true);
    setProblem(null);
    try {
      const page = await fetchSessionPage(sessions.at(-1)!);
      setSessions([...sessions, ...page]);
      setHasMore(page.length === HISTORY_PAGE_SIZE);
      setAutoLoad(true);
    } catch (error) {
      setProblem(messageOf(error, 'Could not load more workouts.'));
      setAutoLoad(false);
    }
    loadingRef.current = false;
    setLoadingMore(false);
  }, [sessions]);

  const lastCardRef = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    const lastCard = lastCardRef.current;
    if (!hasMore || !autoLoad || !lastCard || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadMore();
    });
    observer.observe(lastCard);
    return () => observer.disconnect();
  }, [hasMore, autoLoad, loadMore]);

  return (
    <main className="screen stack">
      <h1 className="title">Collection log</h1>
      <CollectionTabs />
      <p className="history-edit-note">
        <Icon name="pencil" size={12} />
        You can change or delete workouts from the last 7 days.
      </p>
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
          {sessions.map((session, index) => (
            <SessionItem
              key={session.id}
              session={session}
              now={now}
              unit={unitPref}
              cardRef={index === sessions.length - 1 ? lastCardRef : undefined}
            />
          ))}
        </ul>
      )}
      {hasMore && (
        <button className="button" type="button" disabled={loadingMore} onClick={() => void loadMore()}>
          {loadingMore ? 'Loading more…' : 'Load more'}
        </button>
      )}
    </main>
  );
}
