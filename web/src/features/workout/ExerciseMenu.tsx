import { useRef } from 'react';

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
  return (
    <details ref={menu} className="exercise-menu">
      <summary aria-label={`Exercise menu for ${exerciseName}`}>⋯</summary>
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
