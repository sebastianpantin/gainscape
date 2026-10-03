import { useIsOffline } from '../lib/use-online.ts';

export function OfflineBanner() {
  const offline = useIsOffline();
  if (!offline) return null;
  return (
    <div className="app-banner offline-banner" role="status">
      Offline. Your workout is saved on this device.
    </div>
  );
}
