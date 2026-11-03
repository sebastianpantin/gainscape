import { type KeyboardEvent } from 'react';
import { arrowedIndex } from '../lib/ui/radio-group-rules.ts';

export function moveRadioWithArrows(
  event: KeyboardEvent<HTMLElement>,
  index: number,
  count: number,
  pick: (next: number) => void,
): void {
  const next = arrowedIndex(event.key, index, count);
  if (next === null) return;
  event.preventDefault();
  pick(next);
  event.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();
}
