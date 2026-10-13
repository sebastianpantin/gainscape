const MOST_SEGMENTS_IN_ONE_ROW = 6;

export function Choice<T extends string>({
  label,
  options,
  current,
  disabled,
  onPick,
}: {
  label: string;
  options: { value: T; label: string }[];
  current: T;
  disabled: boolean;
  onPick: (value: T) => void;
}) {
  return (
    <div className="stack" style={{ gap: 6 }}>
      <span className="field">{label}</span>
      <div
        className={options.length > MOST_SEGMENTS_IN_ONE_ROW ? 'segmented wrapped' : 'segmented'}
        role="radiogroup"
        aria-label={label}
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={current === option.value}
            className={current === option.value ? 'segment active' : 'segment'}
            disabled={disabled}
            onClick={() => onPick(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
