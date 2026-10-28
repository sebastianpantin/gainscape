import { type KeyboardEvent } from 'react';
import { arrowedIndex } from '../lib/ui/radio-group-rules.ts';

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

  const moveWithArrows = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = arrowedIndex(event.key, index, options.length);
    if (next === null) return;
    event.preventDefault();
    onPick(options[next].value);
    (event.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
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
          disabled={disabled}
          onClick={() => onPick(option.value)}
          onKeyDown={(event) => moveWithArrows(event, index)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
