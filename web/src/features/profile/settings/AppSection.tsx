import { Link } from 'react-router-dom';
import { promptInstall, useInstallState } from '../../../pwa/install.ts';
import { APP_VERSION } from '../../whats-new/changelog-data.ts';
import { useUpdateCheck } from './use-update-check.ts';

const LICENSES_PAGE = '/licenses/index.html';

export function AppSection() {
  const install = useInstallState();
  const { canCheck, checkText, checkForUpdates } = useUpdateCheck();

  return (
    <section className="panel stack" aria-labelledby="app-heading">
      <h2 id="app-heading">App</h2>
      {install === 'promptable' && (
        <button className="button primary" type="button" onClick={() => void promptInstall()}>
          Install Gainscape
        </button>
      )}
      {install === 'ios_manual' && <p className="hint">In Safari, tap Share, then Add to Home Screen.</p>}
      {install === 'installed' && <p className="hint">Installed on this device.</p>}
      <span>Version {APP_VERSION}</span>
      <span className="muted tiny">Build {__APP_BUILD__}</span>
      <Link className="button link" to="/profile/settings/whats-new">
        What's new
      </Link>
      <button className="button" type="button" disabled={!canCheck} onClick={checkForUpdates}>
        Check for updates
      </button>
      {checkText && (
        <p className="muted" role="status">
          {checkText}
        </p>
      )}
      <a className="button link" href={LICENSES_PAGE}>
        Licenses
      </a>
    </section>
  );
}
