import { type FormEvent, useId, useState } from 'react';
import { messageOf } from '../../lib/error-text.ts';
import {
  EXERCISE_NOTE_MAX_LENGTH,
  EXERCISE_NOTE_OFFLINE_TEXT,
  noteActionLabel,
  noteChanged,
} from '../../lib/exercise-note-rules.ts';

interface ExerciseNoteProps {
  exerciseName: string;
  note: string | undefined;
  offline: boolean;
  onSave: (body: string) => Promise<void>;
}

export function ExerciseNote({ exerciseName, note, offline, onSave }: ExerciseNoteProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const offlineHintId = useId();
  const offlineHint = offline && (
    <p className="hint" id={offlineHintId}>
      {EXERCISE_NOTE_OFFLINE_TEXT}
    </p>
  );
  const describedBy = offline ? offlineHintId : undefined;

  const stopEditing = () => {
    setDraft(null);
    setProblem(null);
  };

  async function save(event: FormEvent) {
    event.preventDefault();
    if (draft === null) return;
    if (!noteChanged(note, draft)) {
      stopEditing();
      return;
    }
    setSaving(true);
    setProblem(null);
    try {
      await onSave(draft);
      stopEditing();
    } catch (error) {
      setProblem(messageOf(error, "Couldn't save the note."));
    } finally {
      setSaving(false);
    }
  }

  if (draft === null) {
    return (
      <div className="exercise-note stack">
        {note && <p className="exercise-note-text">{note}</p>}
        <button
          className="button link"
          type="button"
          aria-label={`${noteActionLabel(note)} for ${exerciseName}`}
          aria-describedby={describedBy}
          disabled={offline}
          onClick={() => setDraft(note ?? '')}
        >
          {noteActionLabel(note)}
        </button>
        {offlineHint}
      </div>
    );
  }

  return (
    <form className="exercise-note stack" onSubmit={save}>
      <label className="field notes-field">
        Note
        <textarea
          aria-label={`Note for ${exerciseName}`}
          maxLength={EXERCISE_NOTE_MAX_LENGTH}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
      </label>
      {problem && (
        <p className="problem" role="alert">
          {problem}
        </p>
      )}
      {offlineHint}
      <span className="row">
        <button className="button primary" type="submit" aria-describedby={describedBy} disabled={saving || offline}>
          {saving ? 'Saving…' : 'Save note'}
        </button>
        <button className="button" type="button" disabled={saving} onClick={stopEditing}>
          Cancel
        </button>
      </span>
    </form>
  );
}
