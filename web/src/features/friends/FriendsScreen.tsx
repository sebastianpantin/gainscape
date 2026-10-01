import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePreferences } from '../../lib/preferences.ts';
import { initialsFor } from '../../lib/profile.ts';
import {
  FEED_PAGE_SIZE,
  fetchFeedPage,
  listFriends,
  removeFriend,
  respondToFriendRequest,
  sendFriendRequest,
  setGz,
} from '../../lib/social.ts';
import {
  type FeedItem,
  feedBadge,
  feedCursor,
  feedText,
  type FriendRow,
  relativeTime,
  sendRequestText,
  socialErrorMessage,
} from '../../lib/social-rules.ts';
import { ProfileBadge } from '../profile/ProfileCard.tsx';
import { FriendsTabs } from './FriendsTabs.tsx';

const REQUEST_BADGE_SIZE = 36;
const GONE_POST = socialErrorMessage({ message: 'event_not_found' });

type LoadState = { status: 'loading' } | { status: 'failed'; problem: string } | { status: 'ready' };

function problemText(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Try again.';
}

function loadFriendsAndFeed(): Promise<[FriendRow[], FeedItem[]]> {
  return Promise.all([listFriends(), fetchFeedPage(null)]);
}

interface FeedEntryProps {
  item: FeedItem;
  pending: boolean;
  onToggleGz: (item: FeedItem) => void;
}

function FeedEntry({ item, pending, onToggleGz }: FeedEntryProps) {
  const { unitPref } = usePreferences();
  const text = feedText(item, unitPref);
  const kind = item.type === 'level_up' || item.type === 'level_99' ? 'level' : item.type;
  return (
    <li className="panel feed-item" data-testid="feed-item">
      <span className={`feed-badge ${kind}`} aria-hidden="true">
        {feedBadge(item)}
      </span>
      <div className="feed-body">
        <span className="muted tiny">
          {item.isOwn ? 'You' : item.displayName} · {relativeTime(item.occurredAt)}
        </span>
        <span className="pixel">{text.headline}</span>
        {text.detail && <span className="muted tiny">{text.detail}</span>}
      </div>
      {item.isOwn ? (
        <span className="gz-count" aria-label={`${item.gzCount} gz`}>
          <span className="pixel">gz</span> <span className="tiny">{item.gzCount}</span>
        </span>
      ) : (
        <button
          className="button gz-button"
          type="button"
          aria-pressed={item.gzGiven}
          aria-busy={pending}
          disabled={pending}
          aria-label={`${item.gzGiven ? 'Remove gz from' : 'Say gz to'} ${item.displayName}, ${item.gzCount} so far`}
          onClick={() => onToggleGz(item)}
        >
          <span className="pixel">gz</span>
          <span className="tiny">{item.gzCount}</span>
        </button>
      )}
    </li>
  );
}

export function FriendsScreen() {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [reloadNonce, setReloadNonce] = useState(0);
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [feedEnded, setFeedEnded] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [gzPending, setGzPending] = useState<ReadonlySet<string>>(() => new Set());
  const [username, setUsername] = useState('');
  const [status, setStatus] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const show = useCallback(([loadedFriends, firstPage]: [FriendRow[], FeedItem[]]) => {
    setFriends(loadedFriends);
    setFeed(firstPage);
    setFeedEnded(firstPage.length < FEED_PAGE_SIZE);
    setLoad({ status: 'ready' });
  }, []);

  useEffect(() => {
    let active = true;
    loadFriendsAndFeed().then(
      (loaded) => active && show(loaded),
      (error: unknown) => active && setLoad({ status: 'failed', problem: problemText(error) }),
    );
    return () => {
      active = false;
    };
  }, [show, reloadNonce]);

  const retryLoad = () => {
    setLoad({ status: 'loading' });
    setReloadNonce((nonce) => nonce + 1);
  };

  const act = async (action: () => Promise<string | null>) => {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    setStatus('');
    try {
      const done = await action();
      if (done !== null) setStatus(done);
      show(await loadFriendsAndFeed());
    } catch (error) {
      setProblem(problemText(error));
    }
    setBusy(false);
  };

  const sendRequest = (event: FormEvent) => {
    event.preventDefault();
    const wanted = username.trim().toLowerCase();
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
    const last = feed.at(-1);
    if (!last || loadingMore) return;
    setLoadingMore(true);
    setProblem(null);
    try {
      const next = await fetchFeedPage(feedCursor(last));
      setFeed((current) => {
        const known = new Set(current.map((item) => item.eventId));
        return [...current, ...next.filter((item) => !known.has(item.eventId))];
      });
      setFeedEnded(next.length < FEED_PAGE_SIZE);
    } catch (error) {
      setProblem(problemText(error));
    }
    setLoadingMore(false);
  };

  const replaceItem = (eventId: string, change: (item: FeedItem) => FeedItem) =>
    setFeed((current) => current.map((item) => (item.eventId === eventId ? change(item) : item)));

  const markGzPending = (eventId: string, pending: boolean) =>
    setGzPending((current) => {
      const next = new Set(current);
      if (pending) next.add(eventId);
      else next.delete(eventId);
      return next;
    });

  const toggleGz = async (item: FeedItem) => {
    if (gzPending.has(item.eventId)) return;
    const given = !item.gzGiven;
    const optimisticCount = item.gzCount + (given ? 1 : -1);
    const stillOptimistic = (current: FeedItem) => current.gzGiven === given && current.gzCount === optimisticCount;
    const rollBack = (current: FeedItem) =>
      stillOptimistic(current) ? { ...current, gzGiven: item.gzGiven, gzCount: item.gzCount } : current;
    setProblem(null);
    setStatus('');
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
      <p className="muted" role="status">
        {status}
      </p>
      {problem && (
        <p className="problem" role="alert">
          {problem}
        </p>
      )}
      {load.status === 'loading' && <p>Loading…</p>}
      {load.status === 'failed' && (
        <section className="panel stack">
          <p className="problem" role="alert">
            {load.problem}
          </p>
          <button className="button" type="button" onClick={retryLoad}>
            Retry
          </button>
        </section>
      )}
      {load.status === 'ready' && (
        <>
          {incoming.map((friend) => (
            <div className="panel row" key={friend.userId} data-testid="incoming-request">
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
          {feed.length === 0 && <p className="muted">No posts yet. Add friends, or log a PR.</p>}
          {feed.length > 0 && (
            <ul className="feed" aria-label="Feed">
              {feed.map((item) => (
                <FeedEntry key={item.eventId} item={item} pending={gzPending.has(item.eventId)} onToggleGz={toggleGz} />
              ))}
            </ul>
          )}
          {feed.length > 0 && !feedEnded && (
            <button className="button" type="button" disabled={loadingMore} onClick={loadMore}>
              Load more
            </button>
          )}
        </>
      )}
    </main>
  );
}
