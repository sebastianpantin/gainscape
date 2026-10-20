import { Link } from 'react-router-dom';

export function StatsScreen() {
  return (
    <main className="screen stack">
      <Link className="back-link" to="/collection">
        ‹ Collection
      </Link>
      <h1 className="title">Stats</h1>
      <p className="muted">How your training adds up over weeks and months.</p>
    </main>
  );
}
