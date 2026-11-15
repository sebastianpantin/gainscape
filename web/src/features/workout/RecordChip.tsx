import type { UnitPref } from '../../lib/profile/profile-rules.ts';
import { type PreviewRecord, recordChipText, recordGainText, recordLandingLabel } from './record-preview.ts';

interface RecordChipProps {
  record: PreviewRecord;
  pulsing: boolean;
  unit: UnitPref;
}

export function RecordChip({ record, pulsing, unit }: RecordChipProps) {
  const gain = recordGainText(record, unit);
  return (
    <span
      className={pulsing ? 'record-chip pulse' : 'record-chip'}
      role="img"
      aria-label={recordLandingLabel(record, unit)}
    >
      {recordChipText(record)}
      {gain !== null && <span className="record-gain"> {gain}</span>}
    </span>
  );
}
