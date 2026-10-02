interface SegmentedChoiceProps<T> {
  label: string;
  options: readonly { value: T; label: string }[];
  current: T;
  stacked?: boolean;
  onPick: (value: T) => void;
}

export function SegmentedChoice<T extends string | number>({
  label,
  options,
  current,
  stacked = false,
  onPick,
}: SegmentedChoiceProps<T>) {
  return (
    <div className={stacked ? 'segmented stacked' : 'segmented'} role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          role="radio"
          aria-checked={current === option.value}
          className={current === option.value ? 'segment active' : 'segment'}
          onClick={() => onPick(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
