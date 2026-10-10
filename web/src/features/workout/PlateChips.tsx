import { plateLook } from '../../lib/plate-rules.ts';
import type { UnitPref } from '../../lib/profile-rules.ts';

interface PlateChipsProps {
  plates: readonly number[];
  unit: UnitPref;
}

export function PlateChips({ plates, unit }: PlateChipsProps) {
  return (
    <span
      className="plate-chips"
      role="img"
      aria-label={`${plates.length} ${plates.length === 1 ? 'plate' : 'plates'} each side`}
    >
      <span className="plate-sleeve" />
      {plates.map((plate, index) => {
        const { tone, size } = plateLook(plate, unit);
        return <span key={`${index}-${plate}`} className={`plate ${tone} ${size}`} />;
      })}
      <span className="plate-sleeve end" />
    </span>
  );
}
