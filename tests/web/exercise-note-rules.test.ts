import { describe, expect, it } from 'vitest';
import {
  noteActionLabel,
  noteChanged,
  toExerciseNotes,
  withLocalSaves,
  withNote,
} from '../../web/src/lib/exercise-note-rules.ts';

describe('exercise note rules', () => {
  it('maps the rows to a note per exercise', () => {
    expect(
      toExerciseNotes([
        { exercise_id: 'bench', body: 'Seat 4' },
        { exercise_id: 'squat', body: 'High bar\nBelt from 100' },
      ]),
    ).toEqual({ bench: 'Seat 4', squat: 'High bar\nBelt from 100' });
  });

  it('sees a change only when the trimmed text differs from the saved note', () => {
    expect(noteChanged('Seat 4', ' Seat 4 ')).toBe(false);
    expect(noteChanged('Seat 4', 'Seat 5')).toBe(true);
    expect(noteChanged(undefined, '   ')).toBe(false);
    expect(noteChanged(undefined, 'Seat 4')).toBe(true);
    expect(noteChanged('Seat 4', '')).toBe(true);
    expect(noteChanged('Seat 4\nwide grip', '\n Seat 4\nwide grip \t')).toBe(false);
  });

  it('sets, replaces and removes a note without touching the others', () => {
    const notes = { bench: 'Seat 4', squat: 'High bar' };
    expect(withNote(notes, 'bench', 'Seat 5')).toEqual({ bench: 'Seat 5', squat: 'High bar' });
    expect(withNote(notes, 'row', 'Strap')).toEqual({ bench: 'Seat 4', squat: 'High bar', row: 'Strap' });
    expect(withNote(notes, 'bench', null)).toEqual({ squat: 'High bar' });
    expect(notes).toEqual({ bench: 'Seat 4', squat: 'High bar' });
  });

  it('lets notes saved on this screen win over a fetch that started before the save', () => {
    const fetched = { bench: 'Seat 4', squat: 'High bar', row: 'Strap' };
    expect(withLocalSaves(fetched, { bench: 'Seat 5', squat: null, press: 'Thumbless' })).toEqual({
      bench: 'Seat 5',
      row: 'Strap',
      press: 'Thumbless',
    });
    expect(withLocalSaves(fetched, {})).toEqual(fetched);
  });

  it('offers to add a note when there is none and to edit one otherwise', () => {
    expect(noteActionLabel(undefined)).toBe('Add note');
    expect(noteActionLabel('Seat 4')).toBe('Edit note');
  });
});
