import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePreferences } from '../../lib/preferences.ts';
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
} from '../../lib/social-rules.ts';
import { FriendsTabs } from './FriendsTabs.tsx';

function problemText(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Try again.';
}

function loadFriendsAndFeed(): Promise<[FriendRow[], FeedItem[]]> {
  return Promise.all([listFriends(), fetchFeedPage(null)]);
}

function FeedEntry({ item, onToggleGz }: { item: FeedItem; onToggleGz: (item: FeedItem) => void }) {
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
  const [friends, setFriends] = useState<FriendRow[] | null>(null);
  const [feed, setFeed] = useState<FeedItem[] | null>(null);
  const [feedEnded, setFeedEnded] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [username, setUsername] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const show = useCallback(([loadedFriends, firstPage]: [FriendRow[], FeedItem[]]) => {
    setFriends(loadedFriends);
    setFeed(firstPage);
    setFeedEnded(firstPage.length < FEED_PAGE_SIZE);
  }, []);

  const refresh = useCallback(async () => show(await loadFriendsAndFeed()), [show]);

  useEffect(() => {
    let active = true;
    loadFriendsAndFeed().then(
      (loaded) => active && show(loaded),
      (error: unknown) => active && setProblem(problemText(error)),
    );
    return () => {
      active = false;
    };
  }, [show]);

  const act = async (action: () => Promise<unknown>) => {
    setProblem(null);
    try {
      await action();
      await refresh();
    } catch (error) {
      setProblem(problemText(error));
    }
  };

  const sendRequest = (event: FormEvent) => {
    event.preventDefault();
    const wanted = username.trim().toLowerCase();
    if (!wanted) return;
    setStatus(null);
    void act(async () => {
      const result = await sendFriendRequest(wanted);
      setStatus(sendRequestText(result.status, result.friend?.username ?? wanted));
      if (result.status === 'sent' || result.status === 'accepted') setUsername('');
    });
  };

  const loadMore = async () => {
    if (!feed || feed.length === 0) return;
    setLoadingMore(true);
    try {
      const next = await fetchFeedPage(feedCursor(feed[feed.length - 1]));
      setFeed([...feed, ...next]);
      setFeedEnded(next.length < FEED_PAGE_SIZE);
    } catch (error) {
      setProblem(problemText(error));
    }
    setLoadingMore(false);
  };

  const replaceItem = (eventId: string, change: (item: FeedItem) => FeedItem) =>
    setFeed((current) => current?.map((item) => (item.eventId === eventId ? change(item) : item)) ?? current);

  const toggleGz = async (item: FeedItem) => {
    const given = !item.gzGiven;
    setProblem(null);
    replaceItem(item.eventId, (current) => ({
      ...current,
      gzGiven: given,
      gzCount: current.gzCount + (given ? 1 : -1),
    }));
    try {
      const result = await setGz(item.eventId, given);
      replaceItem(item.eventId, (current) => ({ ...current, gzGiven: result.given, gzCount: result.gzCount }));
    } catch (error) {
      replaceItem(item.eventId, (current) => ({ ...current, gzGiven: item.gzGiven, gzCount: item.gzCount }));
      setProblem(problemText(error));
    }
  };

  const incoming = friends?.filter((friend) => friend.relation === 'incoming') ?? [];
  const outgoing = friends?.filter((friend) => friend.relation === 'outgoing') ?? [];
  const accepted = friends?.filter((friend) => friend.relation === 'friend') ?? [];

  return (
    <main className="screen stack">
      <h1 className="title">Friends</h1>
      <FriendsTabs />
      {problem && (
        <p className="problem" role="alert">
          {problem}
        </p>
      )}
      {incoming.map((friend) => (
        <div className="panel row" key={friend.userId} data-testid="incoming-request">
          <span className="monogram" aria-hidden="true">
            {friend.username.slice(0, 2).toUpperCase()}
          </span>
          <span className="stack" style={{ gap: 2, flexGrow: 1 }}>
            <span>{friend.username} wants to be friends</span>
          </span>
          <button
            className="button primary"
            type="button"
            onClick={() => act(() => respondToFriendRequest(friend.userId, true))}
          >
            Accept
          </button>
          <button
            className="button"
            type="button"
            onClick={() => act(() => respondToFriendRequest(friend.userId, false))}
          >
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
        <button className="button" type="submit">
          Send
        </button>
      </form>
      {status && (
        <p className="muted" role="status">
          {status}
        </p>
      )}
      {outgoing.length > 0 && (
        <section className="panel stack" aria-labelledby="outgoing-heading">
          <h2 id="outgoing-heading">Sent requests</h2>
          <ul className="menu-list" style={{ gap: 8 }}>
            {outgoing.map((friend) => (
              <li className="row spread" key={friend.userId}>
                <span>{friend.username}</span>
                <button className="button link" type="button" onClick={() => act(() => removeFriend(friend.userId))}>
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
      {feed === null && !problem && <p>Loading…</p>}
      {feed !== null && feed.length === 0 && <p className="muted">No posts yet. Add friends, or log a PR.</p>}
      {feed !== null && feed.length > 0 && (
        <ul className="feed" aria-label="Feed">
          {feed.map((item) => (
            <FeedEntry key={item.eventId} item={item} onToggleGz={toggleGz} />
          ))}
        </ul>
      )}
      {feed !== null && feed.length > 0 && !feedEnded && (
        <button className="button" type="button" disabled={loadingMore} onClick={loadMore}>
          Load more
        </button>
      )}
    </main>
  );
}
