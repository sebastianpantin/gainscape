import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePreferences } from '../../lib/profile/preferences.ts';
import { initialsFor } from '../../lib/profile/profile.ts';
import { feedQuery, friendsQuery } from '../../lib/query/queries.ts';
import { useToast } from '../../lib/ui/toast.ts';
import { removeFriend, respondToFriendRequest, sendFriendRequest, setGz } from '../../lib/social/social.ts';
import {
  type FeedItem,
  feedBadge,
  feedBadgeKind,
  feedText,
  friendsLoadProblem,
  type FriendRow,
  relativeTime,
  requestedUsername,
  sendRequestText,
  socialErrorMessage,
} from '../../lib/social/social-rules.ts';
import { ProblemWithRetry } from '../../components/ScreenProblem.tsx';
import { ListSkeleton } from '../../components/ScreenSkeleton.tsx';
import { ProfileBadge } from '../profile/ProfileCard.tsx';
import { TermHelp } from '../../components/TermHelp.tsx';
import { FriendsTabs } from './FriendsTabs.tsx';
import { messageOf } from '../../lib/error-text.ts';
import { loadedState } from '../../lib/query/query-state-rules.ts';
import { useIsOffline } from '../../lib/platform/use-online.ts';

const REQUEST_BADGE_SIZE = 36;
const GONE_POST = socialErrorMessage({ message: 'event_not_found' });

function problemText(error: unknown): string {
  return messageOf(error, 'Something went wrong. Try again.');
}

interface FeedEntryProps {
  item: FeedItem;
  pending: boolean;
  onToggleGz: (item: FeedItem) => void;
}

function FeedEntry({ item, pending, onToggleGz }: FeedEntryProps) {
  const { unitPref } = usePreferences();
  const text = feedText(item, unitPref);
  return (
    <li className="panel feed-item">
      <span className={`feed-badge ${feedBadgeKind(item)}`} aria-hidden="true">
        {feedBadge(item)}
      </span>
      <div className="feed-body">
        <span className="muted tiny">
          {item.isOwn ? 'You' : `${item.displayName} @${item.username}`} · {relativeTime(item.occurredAt)}
        </span>
        <span className="pixel">{text.headline}</span>
        {text.detail && <span className="muted tiny">{text.detail}</span>}
      </div>
      {item.isOwn ? (
        <span className="gz-count" role="img" aria-label={`${item.gzCount} gz`}>
          <span className="pixel">gz</span> <span className="tiny">{item.gzCount}</span>
        </span>
      ) : (
        <button
          className="button gz-button"
          type="button"
          aria-pressed={item.gzGiven}
          aria-busy={pending}
          disabled={pending}
          aria-label={`${item.gzGiven ? 'Remove your gz from' : 'Congratulate (gz)'} ${item.displayName} @${item.username}, ${item.gzCount} so far`}
          onClick={() => onToggleGz(item)}
        >
          <span className="pixel">gz</span>
          <span className="tiny">{item.gzCount}</span>
        </button>
      )}
    </li>
  );
}

interface FriendsScreenProps {
  userId: string;
}

function uniqueByEvent(items: FeedItem[]): FeedItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.eventId)) return false;
    seen.add(item.eventId);
    return true;
  });
}

export function FriendsScreen({ userId }: FriendsScreenProps) {
  const queryClient = useQueryClient();
  const friendsList = useQuery(friendsQuery(userId));
  const feedPages = useInfiniteQuery(feedQuery(userId));
  const [busy, setBusy] = useState(false);
  const [gzPending, setGzPending] = useState<ReadonlySet<string>>(() => new Set());
  const [username, setUsername] = useState('');
  const { showToast, dismissToast } = useToast();
  const [problem, setProblem] = useState<string | null>(null);
  const offline = useIsOffline();

  const friends = friendsList.data ?? [];
  const feed = uniqueByEvent(feedPages.data?.pages.flat() ?? []);
  const load = loadedState(friendsList.data && feedPages.data ? true : undefined, friendsList.error ?? feedPages.error);

  const refetchAll = () => Promise.all([friendsList.refetch(), feedPages.refetch()]);

  const act = async (action: () => Promise<string | null>) => {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    dismissToast();
    let actionProblem: string | null = null;
    try {
      const done = await action();
      if (done !== null) showToast(done);
    } catch (error) {
      actionProblem = problemText(error);
    }
    const failedRefetch = (await refetchAll()).find((result) => result.isError);
    setProblem(actionProblem ?? (failedRefetch ? problemText(failedRefetch.error) : null));
    setBusy(false);
  };

  const sendRequest = (event: FormEvent) => {
    event.preventDefault();
    const wanted = requestedUsername(username);
    if (!wanted) return;
    void act(async () => {
      const result = await sendFriendRequest(wanted);
      if (result.status === 'sent' || result.status === 'accepted') setUsername('');
      return sendRequestText(result.status, result.friend?.username ?? wanted);
    });
  };

  const respond = (friend: FriendRow, accept: boolean) =>
    act(async () => {
      await respondToFriendRequest(friend.userId, accept);
      return accept ? `You and ${friend.username} are now friends` : `Declined ${friend.username}`;
    });

  const cancel = (friend: FriendRow) =>
    act(async () => {
      await removeFriend(friend.userId);
      return `Cancelled the request to ${friend.username}`;
    });

  const loadMore = async () => {
    if (feedPages.isFetchingNextPage) return;
    setProblem(null);
    const result = await feedPages.fetchNextPage();
    if (result.isError) setProblem(problemText(result.error));
  };

  const replaceItem = (eventId: string, change: (item: FeedItem) => FeedItem) => {
    const { queryKey } = feedQuery(userId);
    void queryClient.cancelQueries({ queryKey });
    queryClient.setQueryData(queryKey, (current) =>
      current
        ? {
            ...current,
            pages: current.pages.map((page) => page.map((item) => (item.eventId === eventId ? change(item) : item))),
          }
        : current,
    );
  };

  const markGzPending = (eventId: string, pending: boolean) =>
    setGzPending((current) => {
      const next = new Set(current);
      if (pending) next.add(eventId);
      else next.delete(eventId);
      return next;
    });

  const toggleGz = async (item: FeedItem) => {
    if (busy || gzPending.has(item.eventId)) return;
    const given = !item.gzGiven;
    const optimisticCount = item.gzCount + (given ? 1 : -1);
    const stillOptimistic = (current: FeedItem) => current.gzGiven === given && current.gzCount === optimisticCount;
    const rollBack = (current: FeedItem) =>
      stillOptimistic(current) ? { ...current, gzGiven: item.gzGiven, gzCount: item.gzCount } : current;
    setProblem(null);
    dismissToast();
    markGzPending(item.eventId, true);
    replaceItem(item.eventId, (current) => ({ ...current, gzGiven: given, gzCount: optimisticCount }));
    try {
      const result = await setGz(item.eventId, given);
      if (result.status === 'ok') {
        replaceItem(item.eventId, (current) => ({
          ...current,
          gzGiven: result.given,
          gzCount: result.gzCount ?? current.gzCount,
        }));
      } else {
        replaceItem(item.eventId, rollBack);
        setProblem(GONE_POST);
      }
    } catch (error) {
      replaceItem(item.eventId, rollBack);
      setProblem(problemText(error));
    }
    markGzPending(item.eventId, false);
  };

  const incoming = friends.filter((friend) => friend.relation === 'incoming');
  const outgoing = friends.filter((friend) => friend.relation === 'outgoing');
  const accepted = friends.filter((friend) => friend.relation === 'friend');

  return (
    <main className="screen stack">
      <h1 className="title">Friends</h1>
      <FriendsTabs />
      {problem && (
        <p className="problem" role="alert">
          {problem}
        </p>
      )}
      {load.status === 'loading' && <ListSkeleton />}
      {load.status === 'failed' && (
        <ProblemWithRetry problem={friendsLoadProblem(load.problem, offline)} onRetry={refetchAll} />
      )}
      {load.status === 'ready' && (
        <>
          {incoming.map((friend) => (
            <div className="panel row" key={friend.userId}>
              <ProfileBadge
                color={friend.badgeColor}
                initials={initialsFor(friend.displayName, friend.username)}
                size={REQUEST_BADGE_SIZE}
              />
              <span style={{ flexGrow: 1 }}>{friend.username} wants to be friends</span>
              <button className="button primary" type="button" disabled={busy} onClick={() => respond(friend, true)}>
                Accept
              </button>
              <button className="button" type="button" disabled={busy} onClick={() => respond(friend, false)}>
                Decline
              </button>
            </div>
          ))}
          <form className="row" style={{ alignItems: 'flex-end' }} onSubmit={sendRequest}>
            <label className="field" style={{ flexGrow: 1 }}>
              Add a friend by exact username
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoCapitalize="none"
                placeholder="username"
              />
            </label>
            <button className="button" type="submit" disabled={busy}>
              Send
            </button>
          </form>
          {outgoing.length > 0 && (
            <section className="panel stack" aria-labelledby="outgoing-heading">
              <h2 id="outgoing-heading">Sent requests</h2>
              <ul className="menu-list">
                {outgoing.map((friend) => (
                  <li className="row spread" key={friend.userId}>
                    <span>{friend.username}</span>
                    <button className="button link" type="button" disabled={busy} onClick={() => cancel(friend)}>
                      Cancel
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {accepted.length > 0 && (
            <section className="panel stack" aria-labelledby="friends-heading">
              <h2 id="friends-heading">Friends</h2>
              <ul className="menu-list" aria-label="Friends list">
                {accepted.map((friend) => (
                  <li key={friend.userId}>
                    <Link className="button" to={`/friends/${friend.userId}`}>
                      {friend.displayName} <span className="muted">@{friend.username}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {feed.length === 0 && <p className="muted">No posts yet. Add friends, or log a personal record (PR).</p>}
          {feed.length > 0 && (
            <p className="row muted tiny">
              Tap gz to congratulate a friend <TermHelp glossaryKey="gz" />
            </p>
          )}
          {feed.length > 0 && (
            <ul className="feed" aria-label="Feed">
              {feed.map((item) => (
                <FeedEntry
                  key={item.eventId}
                  item={item}
                  pending={busy || gzPending.has(item.eventId)}
                  onToggleGz={toggleGz}
                />
              ))}
            </ul>
          )}
          {feed.length > 0 && feedPages.hasNextPage && (
            <button className="button" type="button" disabled={busy || feedPages.isFetchingNextPage} onClick={loadMore}>
              Load more
            </button>
          )}
        </>
      )}
    </main>
  );
}
