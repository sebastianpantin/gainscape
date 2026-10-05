import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queryExerciseNotes, saveExerciseNoteWith } from '../../web/src/lib/exercise-note-rules.ts';
import { builtInExerciseId, createTestUser, db, type TestUser } from './local-stack.ts';
import { createCustomExercise } from './session-support.ts';

let owner: TestUser;
let other: TestUser;
let benchId: string;
let squatId: string;

beforeAll(async () => {
  [owner, other] = await Promise.all([createTestUser(), createTestUser()]);
  [benchId, squatId] = await Promise.all([builtInExerciseId('barbell_bench_press'), builtInExerciseId('back_squat')]);
});

afterAll(async () => {
  await db.end();
});

describe('exercise notes', () => {
  it('saves the trimmed note, replaces it and clears it when blank', async () => {
    expect(await saveExerciseNoteWith(owner.client, benchId, '  Seat 4\nwide grip  ')).toBe('Seat 4\nwide grip');
    expect(await saveExerciseNoteWith(owner.client, squatId, 'High bar')).toBe('High bar');
    expect(await queryExerciseNotes(owner.client)).toEqual({ [benchId]: 'Seat 4\nwide grip', [squatId]: 'High bar' });

    expect(await saveExerciseNoteWith(owner.client, benchId, 'Seat 5')).toBe('Seat 5');
    expect(await saveExerciseNoteWith(owner.client, squatId, '  ')).toBeNull();
    expect(await queryExerciseNotes(owner.client)).toEqual({ [benchId]: 'Seat 5' });
  });

  it("keeps each user's notes to themselves", async () => {
    await saveExerciseNoteWith(owner.client, benchId, 'Seat 5');
    expect(await queryExerciseNotes(other.client)).toEqual({});
    expect(await saveExerciseNoteWith(other.client, benchId, 'Seat 2')).toBe('Seat 2');
    expect(await queryExerciseNotes(other.client)).toEqual({ [benchId]: 'Seat 2' });
    expect((await queryExerciseNotes(owner.client))[benchId]).toBe('Seat 5');
  });

  it("refuses a note on another user's custom exercise", async () => {
    const customId = await createCustomExercise(other, { skillKey: 'shoulders' });
    await expect(saveExerciseNoteWith(owner.client, customId, 'Not mine')).rejects.toMatchObject({ code: '42501' });
    expect(await saveExerciseNoteWith(other.client, customId, 'Mine')).toBe('Mine');
  });

  it('refuses a note on a locked variation until the user unlocks it', async () => {
    const user = await createTestUser();
    const [pauseSquat] = await db`select id from public.exercises where key = 'pause_squat'`;
    const [scroll] = await db`select id from public.items where key = 'scroll_pause_squat'`;
    await expect(saveExerciseNoteWith(user.client, pauseSquat.id, 'Two count')).rejects.toMatchObject({
      code: '42501',
    });
    await db`insert into public.user_unlocks (user_id, exercise_id, item_id) values (${user.id}, ${pauseSquat.id}, ${scroll.id})`;
    expect(await saveExerciseNoteWith(user.client, pauseSquat.id, 'Two count')).toBe('Two count');
  });
});
