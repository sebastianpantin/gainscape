import { Link } from 'react-router-dom';

interface EmptyStateProps {
  text: string;
  startLabel: string;
}

export function EmptyState({ text, startLabel }: EmptyStateProps) {
  return (
    <div className="panel stack empty-state">
      <p className="muted">{text}</p>
      <Link className="button" to="/">
        {startLabel}
      </Link>
    </div>
  );
}
