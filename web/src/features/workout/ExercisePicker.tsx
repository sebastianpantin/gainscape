import { useMemo, useState } from 'react';
import { Icon } from '../../components/Icon.tsx';
import { type Exercise, exerciseLabels } from '../../lib/catalog.ts';

interface ExercisePickerProps {
  exercises: Exercise[];
  onPick: (exercise: Exercise) => void;
  placeholder?: string;
}

const MAX_MATCHES_SHOWN = 8;

export function ExercisePicker({ exercises, onPick, placeholder = 'Add exercise…' }: ExercisePickerProps) {
  const [query, setQuery] = useState('');

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return exercises.filter((exercise) => exercise.name.toLowerCase().includes(needle)).slice(0, MAX_MATCHES_SHOWN);
  }, [exercises, query]);

  return (
    <div className="exercise-picker">
      <span className="search-field">
        <Icon name="search" size={18} />
        <input
          type="search"
          placeholder={placeholder}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search exercises"
        />
      </span>
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
                {exercise.name}{' '}
                <span className="muted">{[exercise.equipment, exerciseLabels(exercise)].join(' ').trim()}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
