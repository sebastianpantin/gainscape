import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon.tsx';
import type { RecordTimelineEntry } from '../../lib/stats/pr-timeline-rules.ts';

export function RecordTimelineList({ label, records }: { label: string; records: readonly RecordTimelineEntry[] }) {
  return (
    <ul className="menu-list" aria-label={label}>
      {records.map((record) => (
        <li key={record.key}>
          <Link className="button" to={`/collection/history/${record.sessionId}`}>
            <span className="menu-label">
              {record.text}
              <span className="muted tiny">{record.dateText}</span>
            </span>
            <Icon name="chevron" size={18} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
