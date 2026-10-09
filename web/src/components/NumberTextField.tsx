import { type ReactNode, useState } from 'react';
import { typedNumberWithin } from '../lib/units.ts';

interface NumberTextFieldProps {
  label: ReactNode;
  value: number;
  lowest: number;
  highest: number;
  wholeNumber?: boolean;
  onCommit: (value: number) => void;
}

interface TypedText {
  text: string;
  value: number;
}

export function NumberTextField({
  label,
  value,
  lowest,
  highest,
  wholeNumber = false,
  onCommit,
}: NumberTextFieldProps) {
  const [typed, setTyped] = useState<TypedText | null>(null);
  const shownText = typed !== null && typed.value === value ? typed.text : String(value);
  return (
    <label className="compact-field">
      {label}
      <input
        type="text"
        role="spinbutton"
        inputMode={wholeNumber ? 'numeric' : 'decimal'}
        autoComplete="off"
        aria-valuemin={lowest}
        aria-valuemax={highest}
        aria-valuenow={value}
        value={shownText}
        onChange={(event) => {
          const next = typedNumberWithin(event.target.value, lowest, highest, wholeNumber);
          if (next !== null && next !== value) onCommit(next);
          setTyped({ text: event.target.value, value: next ?? value });
        }}
        onBlur={() => setTyped(null)}
      />
    </label>
  );
}
