import { type Position } from '@domain/index.ts';
import { useState } from 'react';
import { SegmentedChoice } from '../../components/SegmentedChoice.tsx';
import {
  type ActiveProgram,
  dayStartFrom,
  pickedDay,
  positionLabel,
  secondDayChoices,
} from '../../lib/programs/program-today-rules.ts';
import { type DraftProgram } from '../../offline/draft-format.ts';
import { type PrescribedDayStart } from '../../offline/draft-starts.ts';
import { useLastLoggedWeights } from '../programs/use-last-logged-weights.ts';

type ReadyProgram = Extract<ActiveProgram, { kind: 'ready' }>;

interface DayPanelProps {
  program: ReadyProgram;
  choices: ReturnType<typeof secondDayChoices>;
  onAdd: (day: PrescribedDayStart) => void;
  onClose: () => void;
}

function DayPanel({ program, choices, onAdd, onClose }: DayPanelProps) {
  const [picked, setPicked] = useState<Position | null>(null);
  const lastLogged = useLastLoggedWeights(program);
  const position = pickedDay(choices, picked);
  const label = positionLabel(program.definition, position);
  return (
    <section className="panel stack" aria-label="Add a program day">
      <p className="hint">Its sets save as their own workout when you finish.</p>
      <SegmentedChoice
        label="Day"
        stacked
        options={choices.map((choice) => ({ value: choice.label, label: choice.label }))}
        current={label}
        onPick={(chosen) => setPicked(choices.find((choice) => choice.label === chosen)?.position ?? null)}
      />
      <button
        className="button primary"
        type="button"
        onClick={() => {
          onAdd(dayStartFrom(program, position, lastLogged));
          onClose();
        }}
      >
        Add {label}
      </button>
      <button className="button" type="button" onClick={onClose}>
        Cancel
      </button>
    </section>
  );
}

interface AddProgramDayProps {
  program: ActiveProgram;
  link: DraftProgram;
  onAdd: (day: PrescribedDayStart) => void;
}

export function AddProgramDay({ program, link, onAdd }: AddProgramDayProps) {
  const [open, setOpen] = useState(false);
  const choices = secondDayChoices(program, link);
  if (program.kind !== 'ready' || choices.length === 0) return null;
  if (open) return <DayPanel program={program} choices={choices} onAdd={onAdd} onClose={() => setOpen(false)} />;
  return (
    <button className="button dashed" type="button" onClick={() => setOpen(true)}>
      + Add a program day
    </button>
  );
}
