import { SegmentedChoice } from '../../../components/SegmentedChoice.tsx';

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
      <SegmentedChoice
        label={label}
        options={options}
        current={current}
        wrapped={options.length > MOST_SEGMENTS_IN_ONE_ROW}
        disabled={disabled}
        onPick={onPick}
      />
    </div>
  );
}
