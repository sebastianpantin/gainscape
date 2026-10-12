import { type ReactNode, useId, useState } from 'react';
import {
  shownNumberText,
  stepDirectionForKey,
  steppedFieldValue,
  typedNumberChange,
  type TypedNumberText,
} from '../lib/number-field-rules.ts';

interface NumberTextFieldProps {
  label: ReactNode;
  accessibleName?: string;
  value: number;
  lowest: number;
  highest: number;
  wholeNumber?: boolean;
  step?: number;
  onCommit: (value: number) => void;
}

export function NumberTextField({
  label,
  accessibleName,
  value,
  lowest,
  highest,
  wholeNumber = false,
  step = 1,
  onCommit,
}: NumberTextFieldProps) {
  const hintId = useId();
  const [typed, setTyped] = useState<TypedNumberText | null>(null);
  const range = { lowest, highest, wholeNumber };
  const shown = shownNumberText(typed, value);
  return (
    <label className="compact-field">
      <span className="field-caption">{label}</span>
      <input
        type="text"
        role="spinbutton"
        aria-label={accessibleName}
        inputMode={wholeNumber ? 'numeric' : 'decimal'}
        autoComplete="off"
        aria-valuemin={lowest}
        aria-valuemax={highest}
        aria-valuenow={value}
        aria-invalid={shown.matchesValue ? undefined : true}
        aria-describedby={shown.matchesValue ? undefined : hintId}
        value={shown.text}
        onChange={(event) => {
          const change = typedNumberChange(event.target.value, value, range);
          if (change.commit !== null) onCommit(change.commit);
          setTyped(change.typed);
        }}
        onKeyDown={(event) => {
          const direction = stepDirectionForKey(event.key);
          if (direction === null) return;
          event.preventDefault();
          const next = steppedFieldValue(value, direction, step, range);
          if (next !== value) onCommit(next);
          setTyped(null);
        }}
        onBlur={() => setTyped(null)}
      />
      {shown.matchesValue ? null : (
        <span id={hintId} className="problem" aria-hidden="true">
          Saved as {value}
        </span>
      )}
    </label>
  );
}
