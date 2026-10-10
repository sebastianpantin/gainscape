import { Icon } from '../../components/Icon.tsx';
import type { PaceUnit } from '../../lib/catalog-rules.ts';
import type { UnitPref } from '../../lib/profile.ts';
import type { CardioDraftSet } from '../../offline/draft-format.ts';
import { BoutFields, BoutModeToggle } from './BoutFields.tsx';
import { CardioEffortSelector } from './CardioEffortSelector.tsx';
import { previewXpLabel, type SetPreview } from './xp-preview.ts';

interface CardioSetRowProps {
  boutNumber: number;
  bout: CardioDraftSet;
  paceUnit: PaceUnit;
  tracksDistance: boolean;
  preview: SetPreview;
  unit: UnitPref;
  onChange: (changes: Partial<Omit<CardioDraftSet, 'id' | 'kind'>>) => void;
  onRemove: () => void;
  onToggleDone: () => void;
}

export function CardioSetRow({
  boutNumber,
  bout,
  paceUnit,
  tracksDistance,
  preview,
  unit,
  onChange,
  onRemove,
  onToggleDone,
}: CardioSetRowProps) {
  return (
    <li className={bout.done ? 'set-row bout-row' : 'set-row bout-row planned'} aria-label={`Bout ${boutNumber}`}>
      <span className="set-number">{boutNumber}</span>
      <BoutFields bout={bout} paceUnit={paceUnit} tracksDistance={tracksDistance} unit={unit} onChange={onChange} />
      <span className={bout.done ? 'set-xp earned' : 'set-xp'}>{previewXpLabel(preview)}</span>
      <button
        type="button"
        className={`button done-toggle ${bout.done ? 'selected' : ''}`}
        aria-pressed={bout.done}
        aria-label={`Done bout ${boutNumber}`}
        onClick={onToggleDone}
      >
        <Icon name="check" size={20} strokeWidth={3} />
      </button>
      <BoutModeToggle boutNumber={boutNumber} bout={bout} onChange={onChange} />
      <button type="button" className="button icon" aria-label={`Remove bout ${boutNumber}`} onClick={onRemove}>
        ✕
      </button>
      <CardioEffortSelector
        selected={bout.effort}
        onSelect={(effort) => onChange(effort === null ? { effort } : { effort, done: true })}
      />
    </li>
  );
}
