import { PAIN_BOUNDS } from '@domain/types.ts';
import { NumberTextField } from '../../components/NumberTextField.tsx';
import { painActions } from '../../lib/workout/pain-rules.ts';

interface PainFieldProps {
  pain: number | null | undefined;
  rowName: string;
  onChange: (pain: number) => void;
}

export function PainField({ pain, rowName, onChange }: PainFieldProps) {
  if (pain == null) return null;
  return (
    <div className="pain-field">
      <NumberTextField
        label={`pain /${PAIN_BOUNDS.max}`}
        accessibleName={`Pain from ${PAIN_BOUNDS.min} to ${PAIN_BOUNDS.max}, ${rowName}`}
        value={pain}
        lowest={PAIN_BOUNDS.min}
        highest={PAIN_BOUNDS.max}
        wholeNumber
        lastInGroup
        onCommit={onChange}
      />
    </div>
  );
}

interface PainControlProps {
  pain: number | null | undefined;
  rowName: string;
  onChange: (pain: number | null) => void;
}

export function PainControl({ pain, rowName, onChange }: PainControlProps) {
  return (
    <div className="pain-control">
      <PainField pain={pain} rowName={rowName} onChange={onChange} />
      {painActions(pain, rowName, onChange).map(({ label, accessibleName, onChoose }) => (
        <button key={label} type="button" className="button link" aria-label={accessibleName} onClick={onChoose}>
          {label}
        </button>
      ))}
    </div>
  );
}
