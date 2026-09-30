import { type FormEvent, useState } from 'react';
import { SampleNote } from '../../components/SampleNote.tsx';
import { SAMPLE_FEED, SAMPLE_FRIEND_REQUEST } from '../../lib/sample-data.ts';
import { FriendsTabs } from './FriendsTabs.tsx';

export function FriendsScreen() {
  const [gzGiven, setGzGiven] = useState<Set<string>>(() => new Set());
  const [requestAccepted, setRequestAccepted] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [username, setUsername] = useState('');

  const toggleGz = (eventId: string) =>
    setGzGiven((given) => {
      const next = new Set(given);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });

  const sendRequest = (event: FormEvent) => {
    event.preventDefault();
    if (!username.trim()) return;
    setSentTo(username.trim().toLowerCase());
    setUsername('');
  };

  return (
    <main className="screen stack">
      <h1 className="title">Friends</h1>
      <FriendsTabs />
      <SampleNote feature="Friends and the feed" />
      {!requestAccepted && (
        <div className="panel row">
          <span className="monogram" aria-hidden="true">
            {SAMPLE_FRIEND_REQUEST.username.slice(0, 2).toUpperCase()}
          </span>
          <span className="stack" style={{ gap: 2, flexGrow: 1 }}>
            <span>{SAMPLE_FRIEND_REQUEST.username} wants to be friends</span>
            <span className="muted tiny">1 request</span>
          </span>
          <button className="button primary" type="button" onClick={() => setRequestAccepted(true)}>
            Accept
          </button>
        </div>
      )}
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
      {sentTo && (
        <p className="muted" role="status">
          Request to {sentTo} would be sent here.
        </p>
      )}
      <ul className="feed" aria-label="Feed">
        {SAMPLE_FEED.map((event) => {
          const given = gzGiven.has(event.id);
          const count = event.gzCount + (given ? 1 : 0);
          return (
            <li className="panel feed-item" key={event.id}>
              <span className={`feed-badge ${event.kind}`} aria-hidden="true">
                {event.badge}
              </span>
              <div className="feed-body">
                <span className="muted tiny">
                  {event.who} · {event.when}
                </span>
                <span className="pixel">{event.text}</span>
                {event.detail && <span className="muted tiny">{event.detail}</span>}
              </div>
              <button
                className="button gz-button"
                type="button"
                aria-pressed={given}
                aria-label={`${given ? 'Remove gz from' : 'Say gz to'} ${event.who}, ${count} so far`}
                onClick={() => toggleGz(event.id)}
              >
                <span className="pixel">gz</span>
                <span className="tiny">{count}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
