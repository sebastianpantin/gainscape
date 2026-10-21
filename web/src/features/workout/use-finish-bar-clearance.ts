import { type RefObject, useEffect } from 'react';

const FINISH_BAR_HEIGHT = '--finish-bar-height';

export function useFinishBarClearance(finishBar: RefObject<HTMLElement | null>, workoutOpen: boolean): void {
  useEffect(() => {
    const bar = finishBar.current;
    if (!workoutOpen || !bar) return;
    const root = document.documentElement;
    const observer = new ResizeObserver(() => root.style.setProperty(FINISH_BAR_HEIGHT, `${bar.offsetHeight}px`));
    observer.observe(bar);
    return () => {
      observer.disconnect();
      root.style.removeProperty(FINISH_BAR_HEIGHT);
    };
  }, [finishBar, workoutOpen]);
}
