interface ProgressBarProps {
  fraction: number;
  label: string;
  valueText?: string;
  shownFraction?: number;
}

function percentOf(fraction: number): number {
  return Math.round(Math.min(1, Math.max(0, fraction)) * 100);
}

export function ProgressBar({ fraction, label, valueText, shownFraction = fraction }: ProgressBarProps) {
  const percent = percentOf(fraction);
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
      <div className="progress-fill" style={{ width: `${percentOf(shownFraction)}%` }} />
    </div>
  );
}
