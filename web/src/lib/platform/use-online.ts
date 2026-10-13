import { useEffect, useState, useSyncExternalStore } from 'react';

function subscribe(listener: () => void): () => void {
  window.addEventListener('online', listener);
  window.addEventListener('offline', listener);
  return () => {
    window.removeEventListener('online', listener);
    window.removeEventListener('offline', listener);
  };
}

export function useIsOffline(): boolean {
  return useSyncExternalStore(subscribe, () => navigator.onLine === false);
}

export function useOnlineSignal(): number {
  const [signal, setSignal] = useState(0);
  useEffect(() => {
    const signalOnline = () => setSignal((count) => count + 1);
    window.addEventListener('online', signalOnline);
    return () => window.removeEventListener('online', signalOnline);
  }, []);
  return signal;
}
