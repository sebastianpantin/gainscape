import { useState } from 'react';
import { useUpdateFlow } from '../../../pwa/register-service-worker.ts';
import { type UpdateCheck } from '../../../pwa/update-flow.ts';

const UPDATE_CHECK_TEXT: Record<Exclude<UpdateCheck, 'ready'>, string> = {
  up_to_date: "You're up to date.",
  download_failed: "Couldn't download the update. Try again later.",
};

export function useUpdateCheck() {
  const flow = useUpdateFlow();
  const [checking, setChecking] = useState(false);
  const [checkText, setCheckText] = useState<string | null>(null);

  const checkForUpdates = async () => {
    if (!flow) return;
    setChecking(true);
    setCheckText('Checking for updates…');
    try {
      const result = await flow.checkForUpdates();
      setCheckText(result === 'ready' ? null : UPDATE_CHECK_TEXT[result]);
    } catch {
      setCheckText("Couldn't check for updates.");
    }
    setChecking(false);
  };

  return { canCheck: Boolean(flow) && !checking, checkText, checkForUpdates };
}
