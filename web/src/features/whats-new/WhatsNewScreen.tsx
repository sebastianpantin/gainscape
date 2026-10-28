import { Link } from 'react-router-dom';
import { CHANGELOG } from './changelog-data.ts';
import { ReleaseList } from './ReleaseList.tsx';

export function WhatsNewScreen() {
  return (
    <main className="screen stack">
      <div className="stack" style={{ gap: 'var(--space-1)' }}>
        <Link className="back-link" to="/profile/settings">
          ‹ Settings
        </Link>
        <h1 className="title">What's new</h1>
      </div>
      <ReleaseList releases={CHANGELOG} headingLevel={2} />
    </main>
  );
}
