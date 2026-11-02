import { useId } from 'react';

interface SwitchProps {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

export function Switch({ label, hint, checked, disabled = false, onChange }: SwitchProps) {
  const labelId = useId();
  const hintId = useId();
  const toggle = () => {
    if (!disabled) onChange(!checked);
  };
  return (
    <div className="switch-row">
      <div className="switch-text">
        <span id={labelId}>{label}</span>
        {hint && (
          <span id={hintId} className="hint">
            {hint}
          </span>
        )}
      </div>
      <button
        type="button"
        role="switch"
        className="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={hint ? hintId : undefined}
        aria-disabled={disabled || undefined}
        onClick={toggle}
      >
        <span className="switch-knob" />
      </button>
    </div>
  );
}
