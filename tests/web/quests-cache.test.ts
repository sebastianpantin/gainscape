import { describe, expect, it } from 'vitest';
import type { QuestRows } from '../../web/src/lib/quests/quest-rules.ts';
import { questsCache } from '../../web/src/offline/quests-cache.ts';
import { MemoryStorage } from './memory-storage.ts';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';

const SAVED: QuestRows = {
  quests: [
    {
      id: 'quest-1',
      key: 'loose_limbs',
      name: 'Loose Limbs',
      description: 'Stretch.',
      quest_points: 1,
      sort_order: 7,
      definition: { steps: [{ kind: 'sessions', target: 3, exerciseId: null }] },
      retired_at: null,
    },
  ],
  progress: [{ quest_id: 'quest-1', started_at: '2026-10-10T10:00:00.000Z', step_index: 0, step_progress: '2.00' }],
  completions: [{ quest_id: 'quest-0', completed_at: '2026-10-09T10:00:00.000Z', quest_points: 2 }],
  exerciseNames: { squat: 'Back Squat' },
};

describe('saved quest log', () => {
  it('reads back the saved quests and progress for the same user', () => {
    const storage = new MemoryStorage();
    questsCache.save(storage, USER_ID, SAVED);
    expect(questsCache.read(storage, USER_ID)).toEqual(SAVED);
  });

  it("never hands one user's quests to another", () => {
    const storage = new MemoryStorage();
    questsCache.save(storage, USER_ID, SAVED);
    expect(questsCache.read(storage, OTHER_USER_ID)).toBeNull();
  });

  it('ignores a saved log of an older shape', () => {
    const storage = new MemoryStorage();
    questsCache.save(storage, USER_ID, { ...SAVED, completions: undefined } as unknown as QuestRows);
    expect(questsCache.read(storage, USER_ID)).toBeNull();
  });
});
