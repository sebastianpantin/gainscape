import { type Ref, useId, useMemo, useState } from 'react';
import { Icon } from '../../components/Icon.tsx';
import { type Exercise } from '../../lib/exercises/catalog-rules.ts';
import {
  exerciseSearchMatches,
  hiddenMatchesText,
  noMatchText,
  searchWords,
} from '../../lib/exercises/exercise-search-rules.ts';
import { pickerRowDetail } from '../../lib/progress/skill-map-rules.ts';

interface ExercisePickerProps {
  exercises: Exercise[];
  onPick: (exercise: Exercise) => void;
  placeholder?: string;
  searchRef?: Ref<HTMLInputElement>;
  suggestions?: Exercise[];
  suggestionsHeading?: string;
}

const MAX_MATCHES_SHOWN = 12;

export function ExercisePicker({
  exercises,
  onPick,
  placeholder = 'Add exercise…',
  searchRef,
  suggestions = [],
  suggestionsHeading = 'Similar exercises',
}: ExercisePickerProps) {
  const [query, setQuery] = useState('');
  const suggestionsHeadingId = useId();

  const { shown: matches, hiddenCount } = useMemo(
    () => exerciseSearchMatches(exercises, query, MAX_MATCHES_SHOWN),
    [exercises, query],
  );

  const searching = searchWords(query).length > 0;
  const pick = (exercise: Exercise) => {
    onPick(exercise);
    setQuery('');
  };

  const resultRow = (exercise: Exercise) => {
    const detail = pickerRowDetail(exercise);
    return (
      <li key={exercise.id}>
        <button type="button" className="button list-item picker-row" onClick={() => pick(exercise)}>
          <span>{exercise.name}</span>{' '}
          <span className="muted picker-detail">
            {detail.skills === null ? detail.kind : `${detail.kind} · ${detail.skills}`}
          </span>
        </button>
      </li>
    );
  };

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
          onKeyDown={(event) => {
            const topMatch = matches[0];
            if (event.key !== 'Enter' || topMatch === undefined) return;
            event.preventDefault();
            pick(topMatch);
          }}
          aria-label="Search exercises"
        />
      </span>
      {matches.length > 0 && <ul className="picker-results">{matches.map(resultRow)}</ul>}
      {!searching && suggestions.length > 0 && (
        <section aria-labelledby={suggestionsHeadingId}>
          <h3 id={suggestionsHeadingId} className="muted tiny picker-suggestions-heading">
            {suggestionsHeading}
          </h3>
          <ul className="picker-results">{suggestions.map(resultRow)}</ul>
        </section>
      )}
      <p className="muted" role="status">
        {searching && matches.length === 0 && noMatchText(query)}
        {hiddenCount > 0 && hiddenMatchesText(hiddenCount)}
      </p>
    </div>
  );
}
