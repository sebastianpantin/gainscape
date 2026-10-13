import { useQuery } from '@tanstack/react-query';
import { useId } from 'react';
import { Link } from 'react-router-dom';
import { usePreferences } from '../../lib/preferences.ts';
import { feedPreviewQuery } from '../../lib/queries.ts';
import { feedBadge, feedBadgeKind, feedText, recentFriendActivity, relativeTime } from '../../lib/social-rules.ts';

const STRIP_SIZE = 3;

export function FriendActivityStrip({ userId }: { userId: string }) {
  const headingId = useId();
  const { unitPref } = usePreferences();
  const feed = useQuery(feedPreviewQuery(userId));
  const recent = recentFriendActivity(feed.data ?? [], STRIP_SIZE);
  if (recent.length === 0) return null;
  return (
    <section className="panel stack friend-activity" aria-labelledby={headingId}>
      <div className="row spread">
        <h2 id={headingId}>Friends</h2>
        <Link className="tiny" to="/friends">
          See all
        </Link>
      </div>
      <ul className="friend-activity-list">
        {recent.map((item) => (
          <li key={item.eventId}>
            <span className={`feed-badge ${feedBadgeKind(item)}`} aria-hidden="true">
              {feedBadge(item)}
            </span>
            <span className="friend-activity-text">
              <strong>{item.displayName}</strong> {feedText(item, unitPref).headline}
            </span>
            <span className="muted tiny">{relativeTime(item.occurredAt)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
