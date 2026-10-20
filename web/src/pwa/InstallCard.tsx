import { useState } from 'react';
import { dismissInstallCard, INSTALL_CARD_DUE, promptInstall, useInstallState } from './install.ts';
import { readInstallCard } from './install-state.ts';

export function InstallCard({ userId }: { userId: string }) {
  const state = useInstallState();
  const [card, setCard] = useState(() => readInstallCard(userId));
  if (card !== INSTALL_CARD_DUE || (state !== 'promptable' && state !== 'ios_manual')) return null;

  const dismiss = () => setCard(dismissInstallCard(userId));

  return (
    <section className="panel stack install-card" aria-label="Install Gainscape">
      <p>Install Gainscape so your workouts load without signal.</p>
      {state === 'promptable' ? (
        <button className="button primary" type="button" onClick={() => void promptInstall()}>
          Install Gainscape
        </button>
      ) : (
        <p className="muted">In Safari, tap Share, then Add to Home Screen.</p>
      )}
      <button className="button link" type="button" onClick={dismiss}>
        Dismiss
      </button>
    </section>
  );
}
