import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CountUp } from '../../components/CountUp.tsx';
import { prefersReducedMotion } from '../../lib/platform/device-effects.ts';
import { deviceStorage } from '../../lib/platform/keyed-store.ts';
import { seenLevelsCache } from '../../offline/seen-levels-cache.ts';
import { levelCountStart } from './today-rules.ts';

const LEVEL_COUNT_MS = 1200;

interface LevelStatProps {
  userId: string;
  totalLevel: number;
  combatLevel: number;
}

export function LevelStat({ userId, totalLevel, combatLevel }: LevelStatProps) {
  const [seen] = useState(() => seenLevelsCache.read(deviceStorage(), userId));
  const [reducedMotion] = useState(prefersReducedMotion);
  const totalFrom = levelCountStart(seen?.totalLevel ?? null, totalLevel);
  const combatFrom = levelCountStart(seen?.combatLevel ?? null, combatLevel);
  const rose = !reducedMotion && (totalFrom < totalLevel || combatFrom < combatLevel);

  useEffect(() => {
    const remember = () => seenLevelsCache.save(deviceStorage(), userId, { totalLevel, combatLevel });
    if (!rose) {
      remember();
      return;
    }
    const afterCount = setTimeout(remember, LEVEL_COUNT_MS);
    return () => clearTimeout(afterCount);
  }, [userId, totalLevel, combatLevel, rose]);

  return (
    <Link className={rose ? 'header-stat level-rose' : 'header-stat'} to="/skills">
      <span className="muted tiny">Total · Combat</span>
      <strong>
        <CountUp
          key={`${totalFrom}:${totalLevel}`}
          value={totalLevel}
          from={totalFrom}
          durationMs={LEVEL_COUNT_MS}
          animate={rose}
          format={String}
        />{' '}
        ·{' '}
        <CountUp
          key={`${combatFrom}:${combatLevel}`}
          value={combatLevel}
          from={combatFrom}
          durationMs={LEVEL_COUNT_MS}
          animate={rose}
          format={String}
        />
      </strong>
    </Link>
  );
}
