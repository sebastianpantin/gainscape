import { Link } from 'react-router-dom';
import { type DotsCard } from '../../lib/stats/dots-rules.ts';

export function DotsCardMessage({ card }: { card: Exclude<DotsCard, { kind: 'ready' }> }) {
  if (card.kind === 'needs-sex') {
    return (
      <p className="muted">
        Set your sex in <Link to="/profile/settings">Settings</Link> to see your DOTS score.
      </p>
    );
  }
  if (card.kind === 'needs-bodyweight') {
    return (
      <p className="muted">
        Save your bodyweight in <Link to="/profile/edit">Edit profile</Link> to see your DOTS score.
      </p>
    );
  }
  return <p className="muted">{card.text}</p>;
}
