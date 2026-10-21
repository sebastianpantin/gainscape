import { describe, expect, it } from 'vitest';
import { loadCatalogData } from '../../scripts/catalog/load.ts';
import { WARMUP_ROUTINES } from '../../web/src/lib/workout/warmup-routine-rules.ts';

const exercisesByKey = new Map(loadCatalogData().exercises.map((exercise) => [exercise.key, exercise]));

describe('warm-up routines', () => {
  it.each(WARMUP_ROUTINES.map((routine) => [routine.liftKey, routine] as const))(
    'warms up %s with catalog lifts and drills',
    (liftKey, routine) => {
      expect(exercisesByKey.get(liftKey)?.modality).toBe('lift');
      for (const drillKey of routine.drillKeys) {
        const drill = exercisesByKey.get(drillKey);
        expect(drill, drillKey).toBeDefined();
        expect(drill?.modality, drillKey).toBe('cardio');
        expect(drill?.cardio?.tracksDistance, drillKey).toBe(false);
        expect(drill?.shares, drillKey).toEqual([{ skill: 'mobility', shareBp: 10000 }]);
      }
    },
  );
});
