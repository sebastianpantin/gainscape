import { useId } from 'react';
import { TermHelp } from '../../components/TermHelp.tsx';
import { SESSION_RPE_VALUES, sessionRpeChoiceLabel, sessionRpeFromChoice } from '../../lib/session-timing-rules.ts';

interface SessionRpeFieldProps {
  sessionRpe: number | null;
  onChange: (sessionRpe: number | null) => void;
}

export function SessionRpeField({ sessionRpe, onChange }: SessionRpeFieldProps) {
  const selectId = useId();
  return (
    <div className="field">
      <div className="row">
        <label htmlFor={selectId}>Session RPE (optional)</label>
        <TermHelp glossaryKey="sessionRpe" />
      </div>
      <select
        id={selectId}
        value={sessionRpe ?? ''}
        onChange={(event) => onChange(sessionRpeFromChoice(event.target.value))}
      >
        <option value="">Not rated</option>
        {SESSION_RPE_VALUES.map((value) => (
          <option key={value} value={value}>
            {sessionRpeChoiceLabel(value)}
          </option>
        ))}
      </select>
    </div>
  );
}
