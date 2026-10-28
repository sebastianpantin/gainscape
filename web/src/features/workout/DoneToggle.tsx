import type { Ref } from 'react';
import { Icon } from '../../components/Icon.tsx';
import type { ShownSetDrop } from './set-feedback-rules.ts';

interface DoneToggleProps {
  done: boolean;
  label: string;
  drop: ShownSetDrop | null;
  onToggle: () => void;
  buttonRef?: Ref<HTMLButtonElement>;
}

export function DoneToggle({ done, label, drop, onToggle, buttonRef }: DoneToggleProps) {
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="button toggle done-toggle"
        aria-pressed={done}
        aria-label={label}
        onClick={onToggle}
      >
        <Icon name="check" size={20} strokeWidth={3} />
      </button>
      {drop?.xpText && (
        <span key={drop.key} className="xp-drop" aria-hidden="true">
          {drop.xpText}
        </span>
      )}
    </>
  );
}
