import { type ReactNode, useId, useRef, useState } from 'react';
import {
  enterKeyHintFor,
  fieldAfter,
  shownNumberText,
  stepDirectionForKey,
  steppedFieldValue,
  typedNumberChange,
  type TypedNumberText,
} from '../lib/ui/number-field-rules.ts';

interface NumberTextFieldProps {
  label: ReactNode;
  accessibleName?: string;
  value: number;
  lowest: number;
  highest: number;
  wholeNumber?: boolean;
  step?: number;
  lastInGroup?: boolean;
  onCommit: (value: number) => void;
}

function focusFieldAfter(input: HTMLInputElement) {
  const fields = Array.from(document.querySelectorAll<HTMLInputElement>('input[role="spinbutton"]'));
  const next = fieldAfter(fields, input);
  if (next === null) input.blur();
  else next.focus();
}

export function NumberTextField({
  label,
  accessibleName,
  value,
  lowest,
  highest,
  wholeNumber = false,
  step = 1,
  lastInGroup = false,
  onCommit,
}: NumberTextFieldProps) {
  const [typed, setTyped] = useState<TypedNumberText | null>(null);
  const keepSelectionOnMouseUp = useRef(false);
  const savedAsId = useId();
  const range = { lowest, highest, wholeNumber };
  const shown = shownNumberText(typed, value);
  const enterKeyHint = enterKeyHintFor(lastInGroup);
  return (
    <>
      <label className="compact-field">
        <span className="field-caption">{label}</span>
        <input
          type="text"
          role="spinbutton"
          aria-label={accessibleName}
          inputMode={wholeNumber ? 'numeric' : 'decimal'}
          enterKeyHint={enterKeyHint}
          autoComplete="off"
          aria-valuemin={lowest}
          aria-valuemax={highest}
          aria-valuenow={value}
          aria-invalid={shown.matchesValue ? undefined : true}
          aria-describedby={shown.matchesValue ? undefined : savedAsId}
          value={shown.text}
          onFocus={(event) => {
            keepSelectionOnMouseUp.current = true;
            event.currentTarget.select();
          }}
          onMouseUp={(event) => {
            if (!keepSelectionOnMouseUp.current) return;
            keepSelectionOnMouseUp.current = false;
            event.preventDefault();
            event.currentTarget.select();
          }}
          onChange={(event) => {
            const change = typedNumberChange(event.target.value, value, range);
            if (change.commit !== null) onCommit(change.commit);
            setTyped(change.typed);
          }}
          onKeyDown={(event) => {
            keepSelectionOnMouseUp.current = false;
            if (event.key === 'Enter') {
              event.preventDefault();
              if (enterKeyHint === 'done') setTyped(null);
              else focusFieldAfter(event.currentTarget);
              return;
            }
            const direction = stepDirectionForKey(event.key);
            if (direction === null) return;
            event.preventDefault();
            const next = steppedFieldValue(value, direction, step, range);
            if (next !== value) onCommit(next);
            setTyped(null);
          }}
          onBlur={() => {
            keepSelectionOnMouseUp.current = false;
            setTyped(null);
          }}
        />
        {shown.matchesValue ? null : (
          <span className="problem" aria-hidden="true">
            Saved as {value}
          </span>
        )}
      </label>
      <span id={savedAsId} role="status" className="visually-hidden">
        {shown.matchesValue ? '' : `Saved as ${value}`}
      </span>
    </>
  );
}
