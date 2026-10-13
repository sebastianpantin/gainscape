import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { launchTargetPath } from './launch-rules.ts';

interface LaunchParams {
  targetURL?: string;
}

interface LaunchQueue {
  setConsumer: (consumer: (params: LaunchParams) => void) => void;
}

function launchQueue(): LaunchQueue | null {
  return (window as Window & { launchQueue?: LaunchQueue }).launchQueue ?? null;
}

export function useLaunchRouting(): void {
  const navigate = useNavigate();
  const latestNavigate = useRef(navigate);
  useEffect(() => {
    latestNavigate.current = navigate;
  }, [navigate]);
  useEffect(() => {
    launchQueue()?.setConsumer((params) => {
      const { pathname, search, hash } = window.location;
      const path = launchTargetPath({
        targetURL: params.targetURL,
        origin: window.location.origin,
        currentPath: `${pathname}${search}${hash}`,
      });
      if (path !== null) void latestNavigate.current(path);
    });
  }, []);
}
