import { useEffect, useRef, useState } from 'react';

export interface ExerciseMenuAction {
  label: string;
  onChoose: () => void;
}

interface ExerciseMenuProps {
  exerciseName: string;
  actions: readonly ExerciseMenuAction[];
}

export function ExerciseMenu({ exerciseName, actions }: ExerciseMenuProps) {
  const menu = useRef<HTMLDetailsElement>(null);
  const summary = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const closeOnTapOutside = (event: PointerEvent) => {
      if (menu.current && !menu.current.contains(event.target as Node)) menu.current.open = false;
    };
    document.addEventListener('pointerdown', closeOnTapOutside);
    return () => {
      document.removeEventListener('pointerdown', closeOnTapOutside);
    };
  }, [open]);

  return (
    <details
      ref={menu}
      className="exercise-menu"
      onToggle={(event) => setOpen(event.currentTarget.open)}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !event.currentTarget.open) return;
        event.currentTarget.open = false;
        summary.current?.focus();
      }}
    >
      <summary ref={summary} aria-label={`Exercise menu for ${exerciseName}`}>
        ⋯
      </summary>
      <div className="exercise-menu-actions">
        {actions.map(({ label, onChoose }) => (
          <button
            key={label}
            className="button link"
            type="button"
            onClick={() => {
              if (menu.current) menu.current.open = false;
              onChoose();
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </details>
  );
}
