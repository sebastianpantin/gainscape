import { Link } from 'react-router-dom';

interface EmptyStateProps {
  text: string;
  startLabel: string;
  to?: string;
}

export function EmptyState({ text, startLabel, to = '/' }: EmptyStateProps) {
  return (
    <div className="panel stack empty-state">
      <p className="muted">{text}</p>
      <Link className="button" to={to}>
        {startLabel}
      </Link>
    </div>
  );
}
