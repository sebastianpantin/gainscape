import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { collectionQuery, profileQuery } from '../../lib/query/queries.ts';
import { dotsCardFor, dotsLevel } from '../../lib/stats/dots-rules.ts';

function useDotsLevel(userId: string): number | null {
  const profile = useQuery(profileQuery(userId)).data?.loaded;
  const scoreable = profile?.sex != null && profile.bodyweightKg != null;
  const collection = useQuery({ ...collectionQuery(userId), enabled: scoreable }).data?.loaded;
  if (!profile || !collection) return null;
  return dotsLevel(dotsCardFor(profile, collection));
}

export function DotsStat({ userId }: { userId: string }) {
  const level = useDotsLevel(userId);
  if (level === null) return null;
  return (
    <Link className="header-stat" to="/collection/stats">
      <span className="header-stat-part">
        <span className="muted tiny">DOTS</span> <strong>{level}</strong>
      </span>
    </Link>
  );
}
