interface ProgressBarProps {
  fraction: number;
  label: string;
  valueText?: string;
}

export function ProgressBar({ fraction, label, valueText }: ProgressBarProps) {
  const percent = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
  return (
    <div
      className="progress-bar"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={valueText}
    >
      <div className="progress-fill" style={{ width: `${percent}%` }} />
    </div>
  );
}
