import { moveRadioWithArrows } from './radio-arrows.ts';

interface SegmentedChoiceProps<T> {
  label: string;
  options: readonly { value: T; label: string }[];
  current: T;
  stacked?: boolean;
  wrapped?: boolean;
  disabled?: boolean;
  onPick: (value: T) => void;
}

export function SegmentedChoice<T extends string | number>({
  label,
  options,
  current,
  stacked = false,
  wrapped = false,
  disabled = false,
  onPick,
}: SegmentedChoiceProps<T>) {
  const checkedIndex = options.findIndex((option) => option.value === current);
  const tabStop = checkedIndex === -1 ? 0 : checkedIndex;

  const pick = (value: T) => {
    if (!disabled) onPick(value);
  };

  return (
    <div
      className={stacked ? 'segmented stacked' : wrapped ? 'segmented wrapped' : 'segmented'}
      role="radiogroup"
      aria-label={label}
    >
      {options.map((option, index) => (
        <button
          key={String(option.value)}
          type="button"
          role="radio"
          aria-checked={current === option.value}
          tabIndex={index === tabStop ? 0 : -1}
          className={current === option.value ? 'segment active' : 'segment'}
          aria-disabled={disabled || undefined}
          onClick={() => pick(option.value)}
          onKeyDown={(event) => {
            if (!disabled) moveRadioWithArrows(event, index, options.length, (next) => pick(options[next].value));
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
