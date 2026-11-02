import { type InputHTMLAttributes } from 'react';

type DecimalInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'role' | 'autoComplete' | 'min' | 'max'
> & {
  lowest?: number;
  highest?: number;
};

export function DecimalInput({ lowest, highest, inputMode = 'decimal', ...props }: DecimalInputProps) {
  return (
    <input
      type="text"
      role="spinbutton"
      inputMode={inputMode}
      autoComplete="off"
      aria-valuemin={lowest}
      aria-valuemax={highest}
      {...props}
    />
  );
}
