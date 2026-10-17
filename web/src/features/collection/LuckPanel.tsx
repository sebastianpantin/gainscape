import { useId } from 'react';
import { ProgressBar } from '../../components/ProgressBar.tsx';
import { luckView } from '../../lib/collection/luck-rules.ts';

interface LuckPanelProps {
  dryRolls: number;
}

export function LuckPanel({ dryRolls }: LuckPanelProps) {
  const headingId = useId();
  const view = luckView(dryRolls);
  return (
    <section className="panel stack" aria-labelledby={headingId}>
      <div className="row spread">
        <h2 id={headingId}>Luck</h2>
        <span className="accent-text">{view.chanceText}</span>
      </div>
      <ProgressBar fraction={view.meterFraction} label="Next drop chance" />
      <span>{view.dryRollsText}</span>
      <span className="muted tiny">{view.explanation}</span>
    </section>
  );
}
