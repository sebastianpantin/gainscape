import { type RefObject, useEffect } from 'react';
import { scrollToClearFinishBar } from '../../lib/workout/finish-bar-clearance-rules.ts';

const FINISH_BAR_HEIGHT = '--finish-bar-height';
const FOCUS_GAP_PX = 8;
const TEXT_ENTRY = 'input:not([type=checkbox], [type=radio], [type=button], [type=submit]), textarea';

export function useFinishBarClearance(finishBar: RefObject<HTMLElement | null>, workoutOpen: boolean): void {
  useEffect(() => {
    const bar = finishBar.current;
    if (!workoutOpen || !bar) return;
    const root = document.documentElement;
    const observer = new ResizeObserver(() => root.style.setProperty(FINISH_BAR_HEIGHT, `${bar.offsetHeight}px`));
    observer.observe(bar);
    let pendingFrame = 0;
    const clearFocusedField = (event: FocusEvent) => {
      const field = event.target;
      const isWorkoutTextField =
        field instanceof HTMLElement &&
        field.matches(TEXT_ENTRY) &&
        bar.closest('main')?.contains(field) === true &&
        field.closest('dialog, [popover]') === null;
      if (!isWorkoutTextField) return;
      cancelAnimationFrame(pendingFrame);
      pendingFrame = requestAnimationFrame(() => {
        const distance = scrollToClearFinishBar(
          field.getBoundingClientRect(),
          bar.getBoundingClientRect().top,
          FOCUS_GAP_PX,
        );
        if (distance > 0) window.scrollBy({ top: distance });
      });
    };
    document.addEventListener('focusin', clearFocusedField);
    return () => {
      observer.disconnect();
      document.removeEventListener('focusin', clearFocusedField);
      cancelAnimationFrame(pendingFrame);
      root.style.removeProperty(FINISH_BAR_HEIGHT);
    };
  }, [finishBar, workoutOpen]);
}
