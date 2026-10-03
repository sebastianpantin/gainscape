import { useId, useState } from 'react';
import { DISMISS_SUMMARY_LABEL, rolloverSummary } from '../../lib/program-summary-rules.ts';
import { dismissSummary, isSummaryDismissed } from '../../lib/program-summary-store.ts';
import { type ActiveProgram } from '../../lib/program-today-rules.ts';
import { deviceStorage } from '../../lib/rest-timer-store.ts';

interface ProgramSummaryProps {
  userId: string;
  program: ActiveProgram;
}

export function ProgramSummary({ userId, program }: ProgramSummaryProps) {
  const headingId = useId();
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  if (program.kind !== 'ready') return null;
  const summary = rolloverSummary(program.definition, program.enrollment, program.state);
  if (!summary || summary.key === dismissedKey || isSummaryDismissed(deviceStorage(), userId, summary.key)) return null;

  const dismiss = () => {
    dismissSummary(deviceStorage(), userId, summary.key);
    setDismissedKey(summary.key);
  };

  return (
    <section className="panel stack" aria-labelledby={headingId}>
      <h2 id={headingId}>{summary.title}</h2>
      <ul className="prescription-list">
        {summary.lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <button className="button" type="button" onClick={dismiss}>
        {DISMISS_SUMMARY_LABEL}
      </button>
    </section>
  );
}
