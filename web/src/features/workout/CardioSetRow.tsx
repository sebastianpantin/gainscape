import type { Ref } from 'react';
import type { PaceUnit } from '../../lib/exercises/catalog-rules.ts';
import type { UnitPref } from '../../lib/profile/profile.ts';
import type { CardioDraftSet } from '../../offline/draft-format.ts';
import { BoutFields, BoutModeToggle } from './BoutFields.tsx';
import { CardioEffortSelector } from './CardioEffortSelector.tsx';
import { DoneToggle } from './DoneToggle.tsx';
import { SetMenu } from './SetMenu.tsx';
import { useRowClearOfFinishBarAfterDone } from './use-finish-bar-clearance.ts';
import type { ShownSetDrop } from './set-feedback-rules.ts';
import { previewXpLabel, type SetPreview } from './xp-preview.ts';

interface CardioSetRowProps {
  boutNumber: number;
  bout: CardioDraftSet;
  paceUnit: PaceUnit;
  tracksDistance: boolean;
  preview: SetPreview;
  drop: ShownSetDrop | null;
  unit: UnitPref;
  current: boolean;
  onChange: (changes: Partial<Omit<CardioDraftSet, 'id' | 'kind'>>) => void;
  menuRef: Ref<HTMLButtonElement>;
  onRemove: () => void;
  onToggleDone: () => void;
}

export function CardioSetRow({
  boutNumber,
  bout,
  paceUnit,
  tracksDistance,
  preview,
  drop,
  unit,
  current,
  onChange,
  menuRef,
  onRemove,
  onToggleDone,
}: CardioSetRowProps) {
  const row = useRowClearOfFinishBarAfterDone(drop?.key);
  return (
    <li
      ref={row}
      className={`set-row bout-row${bout.done ? '' : ' planned'}${current ? ' current' : ''}`}
      aria-label={`Bout ${boutNumber}`}
      aria-current={current ? 'step' : undefined}
    >
      <span className="set-number">{boutNumber}</span>
      <BoutFields bout={bout} paceUnit={paceUnit} tracksDistance={tracksDistance} unit={unit} onChange={onChange} />
      <span className={bout.done ? 'set-xp earned' : 'set-xp'}>{previewXpLabel(preview)}</span>
      <DoneToggle done={bout.done} label={`Done bout ${boutNumber}`} drop={drop} onToggle={onToggleDone} />
      <BoutModeToggle boutNumber={boutNumber} bout={bout} onChange={onChange} />
      <SetMenu
        buttonRef={menuRef}
        name={`Bout ${boutNumber} options`}
        actions={[
          { label: 'Remove bout', accessibleName: `Remove bout ${boutNumber}`, danger: true, onChoose: onRemove },
        ]}
      />
      <CardioEffortSelector selected={bout.effort} onSelect={(effort) => onChange({ effort })} />
    </li>
  );
}
