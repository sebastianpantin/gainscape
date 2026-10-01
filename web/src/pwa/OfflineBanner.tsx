import { useSyncExternalStore } from 'react';

function subscribe(listener: () => void): () => void {
  window.addEventListener('online', listener);
  window.addEventListener('offline', listener);
  return () => {
    window.removeEventListener('online', listener);
    window.removeEventListener('offline', listener);
  };
}

export function OfflineBanner() {
  const offline = useSyncExternalStore(subscribe, () => navigator.onLine === false);
  if (!offline) return null;
  return (
    <div className="app-banner offline-banner" role="status">
      Offline. Your workout is saved on this device.
    </div>
  );
}
