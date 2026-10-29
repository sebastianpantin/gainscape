import { Link } from 'react-router-dom';
import { ShownNumber } from '../../components/ShownNumber.tsx';
import { useCountUp } from '../../lib/ui/use-count-up.ts';

interface LevelStatProps {
  userId: string;
  totalLevel: number;
  combatLevel: number;
}

export function LevelStat({ userId, totalLevel, combatLevel }: LevelStatProps) {
  const total = useCountUp(userId, 'total-level', totalLevel);
  const combat = useCountUp(userId, 'combat-level', combatLevel);
  const rose = total.rose || combat.rose;

  return (
    <Link className={rose ? 'header-stat level-rose' : 'header-stat'} to="/skills">
      <span className="header-stat-part">
        <span className="muted tiny">Total level</span>{' '}
        <strong>
          <ShownNumber shown={total.shown} value={totalLevel} />
        </strong>
      </span>
      <span className="header-stat-part">
        <span className="muted tiny">Combat</span>{' '}
        <strong>
          <ShownNumber shown={combat.shown} value={combatLevel} />
        </strong>
      </span>
    </Link>
  );
}
