import { describe, expect, it } from 'vitest';
import { type Program } from '../../web/src/lib/programs.ts';
import { programListCache } from '../../web/src/offline/program-list-cache.ts';
import { MemoryStorage } from './memory-storage.ts';

const USER_ID = '11111111-1111-4111-8111-111111111111';

const PROGRAMS: Program[] = [
  {
    id: 'own-ppl',
    key: null,
    name: 'My PPL',
    ownerUserId: USER_ID,
    copiedFromId: 'template-ppl',
    days: [
      {
        id: 'day-push',
        name: 'Push',
        position: 0,
        exercises: [
          { exerciseId: 'bench', targetSets: 3, targetRepsMin: 5, targetRepsMax: 8, progression: { kind: 'none' } },
          {
            exerciseId: 'squat',
            targetSets: 5,
            targetRepsMin: 5,
            targetRepsMax: 5,
            progression: { kind: 'linear', incrementKg: 2.5, incrementLb: 5 },
          },
          { exerciseId: 'press', targetSets: 3, targetRepsMin: 5, targetRepsMax: 5, progression: { kind: 'fixed' } },
        ],
      },
    ],
  },
  { id: 'template-ppl', key: 'ppl', name: 'PPL', ownerUserId: null, copiedFromId: null, days: [] },
];

describe('saved program list', () => {
  it('reads back own programs and templates for the same user', () => {
    const storage = new MemoryStorage();
    programListCache.save(storage, USER_ID, PROGRAMS);
    expect(programListCache.read(storage, USER_ID)).toEqual(PROGRAMS);
  });

  it('reads a list saved before progression existed with last weight for every exercise', () => {
    const storage = new MemoryStorage();
    const savedBeforeProgression = {
      userId: USER_ID,
      value: [
        {
          ...PROGRAMS[0],
          days: [
            {
              ...PROGRAMS[0].days[0],
              exercises: [{ exerciseId: 'bench', targetSets: 3, targetRepsMin: 5, targetRepsMax: 8 }],
            },
          ],
        },
      ],
    };
    storage.setItem(`gainscape.programs.v1.${USER_ID}`, JSON.stringify(savedBeforeProgression));
    expect(programListCache.read(storage, USER_ID)?.[0].days[0].exercises).toEqual([
      { exerciseId: 'bench', targetSets: 3, targetRepsMin: 5, targetRepsMax: 8, progression: { kind: 'none' } },
    ]);
  });

  it('ignores a saved list with an unknown progression', () => {
    const storage = new MemoryStorage();
    programListCache.save(storage, USER_ID, PROGRAMS);
    const raw = storage.getItem(storage.key(0)!)!;
    storage.setItem(storage.key(0)!, raw.replace('"kind":"fixed"', '"kind":"wave"'));
    expect(programListCache.read(storage, USER_ID)).toBeNull();
  });

  it('ignores a saved list with a malformed planned exercise', () => {
    const storage = new MemoryStorage();
    programListCache.save(storage, USER_ID, PROGRAMS);
    const raw = storage.getItem(storage.key(0)!)!;
    storage.setItem(storage.key(0)!, raw.replace('"targetSets":3', '"targetSets":"3"'));
    expect(programListCache.read(storage, USER_ID)).toBeNull();
  });
});
