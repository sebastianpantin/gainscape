import { type Ref, useMemo, useState } from 'react';
import { Icon } from '../../components/Icon.tsx';
import { type Exercise } from '../../lib/exercises/catalog-rules.ts';
import { exerciseSearchMatches, hiddenMatchesText } from '../../lib/exercises/exercise-search-rules.ts';
import { pickerRowDetail } from '../../lib/progress/skill-map-rules.ts';

interface ExercisePickerProps {
  exercises: Exercise[];
  onPick: (exercise: Exercise) => void;
  placeholder?: string;
  searchRef?: Ref<HTMLInputElement>;
}

const MAX_MATCHES_SHOWN = 12;

export function ExercisePicker({ exercises, onPick, placeholder = 'Add exercise…', searchRef }: ExercisePickerProps) {
  const [query, setQuery] = useState('');

  const { shown: matches, hiddenCount } = useMemo(
    () => exerciseSearchMatches(exercises, query, MAX_MATCHES_SHOWN),
    [exercises, query],
  );

  return (
    <div className="exercise-picker">
      <span className="search-field">
        <Icon name="search" size={18} />
        <input
          ref={searchRef}
          type="search"
          placeholder={placeholder}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search exercises"
        />
      </span>
      {matches.length > 0 && (
        <ul className="picker-results">
          {matches.map((exercise) => {
            const detail = pickerRowDetail(exercise);
            return (
              <li key={exercise.id}>
                <button
                  type="button"
                  className="button list-item"
                  onClick={() => {
                    onPick(exercise);
                    setQuery('');
                  }}
                >
                  {exercise.name} <span className="muted">{detail.kind}</span>
                  {detail.skills !== null && <span className="muted"> {detail.skills}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {hiddenCount > 0 && <p className="muted">{hiddenMatchesText(hiddenCount)}</p>}
    </div>
  );
}
