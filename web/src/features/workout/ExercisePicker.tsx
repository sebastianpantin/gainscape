import { useMemo, useState } from 'react';
import type { Exercise } from '../../lib/catalog.ts';

interface ExercisePickerProps {
  exercises: Exercise[];
  onPick: (exercise: Exercise) => void;
}

const MAX_MATCHES_SHOWN = 8;

export function ExercisePicker({ exercises, onPick }: ExercisePickerProps) {
  const [query, setQuery] = useState('');

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return exercises.filter((exercise) => exercise.name.toLowerCase().includes(needle)).slice(0, MAX_MATCHES_SHOWN);
  }, [exercises, query]);

  return (
    <div className="exercise-picker panel">
      <input
        type="search"
        placeholder="Add exercise…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        aria-label="Search exercises"
      />
      {matches.length > 0 && (
        <ul className="picker-results">
          {matches.map((exercise) => (
            <li key={exercise.id}>
              <button
                type="button"
                className="button list-item"
                onClick={() => {
                  onPick(exercise);
                  setQuery('');
                }}
              >
                {exercise.name} <span className="muted">{exercise.equipment}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
