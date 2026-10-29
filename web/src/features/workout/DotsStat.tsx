import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ShownNumber } from '../../components/ShownNumber.tsx';
import { collectionQuery, profileQuery } from '../../lib/query/queries.ts';
import { dotsCardFor, dotsLevel } from '../../lib/stats/dots-rules.ts';
import { useCountUp } from '../../lib/ui/use-count-up.ts';

function useDotsLevel(userId: string): number | null {
  const profile = useQuery(profileQuery(userId)).data?.loaded;
  const scoreable = profile?.sex != null && profile.bodyweightKg != null;
  const collection = useQuery({ ...collectionQuery(userId), enabled: scoreable }).data?.loaded;
  if (!profile || !collection) return null;
  return dotsLevel(dotsCardFor(profile, collection));
}

function DotsLevelLink({ userId, level }: { userId: string; level: number }) {
  const { shown } = useCountUp(userId, 'dots', level);
  return (
    <Link className="header-stat" to="/collection/stats/strength-level">
      <span className="header-stat-part">
        <span className="muted tiny">DOTS</span>{' '}
        <strong>
          <ShownNumber shown={shown} value={level} />
        </strong>
      </span>
    </Link>
  );
}

export function DotsStat({ userId }: { userId: string }) {
  const level = useDotsLevel(userId);
  if (level === null) return null;
  return <DotsLevelLink userId={userId} level={level} />;
}
