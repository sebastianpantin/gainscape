import { type PreviewRecord, recordChipLabel, recordChipText } from './record-preview.ts';

interface RecordChipProps {
  record: PreviewRecord;
  pulsing: boolean;
}

export function RecordChip({ record, pulsing }: RecordChipProps) {
  return (
    <span className={pulsing ? 'record-chip pulse' : 'record-chip'} role="img" aria-label={recordChipLabel(record)}>
      {recordChipText(record)}
    </span>
  );
}
