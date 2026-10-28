import { Link } from 'react-router-dom';
import { formatCount } from '../../lib/format.ts';
import { CHANGELOG } from './changelog-data.ts';
import { ReleaseList } from './ReleaseList.tsx';

const LATEST_RELEASES_SHOWN = 2;

export function WhatsNewScreen() {
  return (
    <main className="screen stack">
      <div className="stack" style={{ gap: 'var(--space-1)' }}>
        <Link className="back-link" to="/profile/settings">
          ‹ Settings
        </Link>
        <h1 className="title">What's new</h1>
      </div>
      <ReleaseList releases={CHANGELOG.slice(0, LATEST_RELEASES_SHOWN)} headingLevel={2} />
      {CHANGELOG.length > LATEST_RELEASES_SHOWN && (
        <details className="stack">
          <summary className="button">
            Show {formatCount(CHANGELOG.length - LATEST_RELEASES_SHOWN, 'older release')}
          </summary>
          <ReleaseList releases={CHANGELOG.slice(LATEST_RELEASES_SHOWN)} headingLevel={2} />
        </details>
      )}
    </main>
  );
}
