import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  MAX_SCENE_PENNANTS,
  MAX_SCENE_TROPHIES,
  SCENE_STAGES,
  type SceneInput,
  sceneFor,
  sceneGrowthText,
  sceneLabel,
  sceneLightFor,
  sceneStageIndex,
} from '../../web/src/lib/progress/scene-rules.ts';

const NEW_LIFTER: SceneInput = { totalLevel: 10, recordCount: 0, questPoints: 0, hour: 12 };

describe('sceneFor', () => {
  it('starts a new lifter in a bare room with only a rack', () => {
    expect(sceneFor(NEW_LIFTER)).toEqual({
      stage: 'bare',
      props: ['rack'],
      trophies: 0,
      pennants: 0,
      light: 'day',
    });
  });

  it.each([
    [14, 'bare'],
    [15, 'plates'],
    [39, 'plates'],
    [40, 'banners'],
    [99, 'banners'],
    [100, 'window'],
    [299, 'window'],
    [300, 'skyline'],
    [990, 'skyline'],
  ] as const)('puts total level %i in the %s stage', (totalLevel, stage) => {
    expect(sceneFor({ ...NEW_LIFTER, totalLevel }).stage).toBe(stage);
  });

  it('keeps every earlier prop as the gym grows, the window before the city outside it', () => {
    expect(sceneFor({ ...NEW_LIFTER, totalLevel: 15 }).props).toEqual(['rack', 'wall-plates']);
    expect(sceneFor({ ...NEW_LIFTER, totalLevel: 40 }).props).toEqual(['rack', 'wall-plates', 'banner']);
    expect(sceneFor({ ...NEW_LIFTER, totalLevel: 100 }).props).toEqual(['rack', 'wall-plates', 'banner', 'window']);
    expect(sceneFor({ ...NEW_LIFTER, totalLevel: 300 }).props).toEqual([
      'rack',
      'wall-plates',
      'banner',
      'window',
      'skyline',
    ]);
  });

  it('never shrinks as total level rises', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 990 }), fc.integer({ min: 0, max: 990 }), (a, b) => {
        const [lower, higher] = a <= b ? [a, b] : [b, a];
        const before = sceneFor({ ...NEW_LIFTER, totalLevel: lower });
        const after = sceneFor({ ...NEW_LIFTER, totalLevel: higher });
        expect(sceneStageIndex(after.stage)).toBeGreaterThanOrEqual(sceneStageIndex(before.stage));
        for (const prop of before.props) expect(after.props).toContain(prop);
      }),
    );
  });

  it('hangs one trophy per recent record, at most three', () => {
    expect(sceneFor({ ...NEW_LIFTER, recordCount: 1 }).trophies).toBe(1);
    expect(sceneFor({ ...NEW_LIFTER, recordCount: 3 }).trophies).toBe(3);
    expect(sceneFor({ ...NEW_LIFTER, recordCount: 40 }).trophies).toBe(MAX_SCENE_TROPHIES);
    expect(MAX_SCENE_TROPHIES).toBe(3);
  });

  it('strings up a pennant at 1, 5 and 15 quest points, at most three', () => {
    expect(sceneFor({ ...NEW_LIFTER, questPoints: 0 }).pennants).toBe(0);
    expect(sceneFor({ ...NEW_LIFTER, questPoints: 1 }).pennants).toBe(1);
    expect(sceneFor({ ...NEW_LIFTER, questPoints: 4 }).pennants).toBe(1);
    expect(sceneFor({ ...NEW_LIFTER, questPoints: 5 }).pennants).toBe(2);
    expect(sceneFor({ ...NEW_LIFTER, questPoints: 15 }).pennants).toBe(3);
    expect(sceneFor({ ...NEW_LIFTER, questPoints: 500 }).pennants).toBe(MAX_SCENE_PENNANTS);
  });
});

describe('sceneLightFor', () => {
  it.each([
    [0, 'night'],
    [4, 'night'],
    [5, 'dawn'],
    [7, 'dawn'],
    [8, 'day'],
    [17, 'day'],
    [18, 'dusk'],
    [20, 'dusk'],
    [21, 'night'],
    [23, 'night'],
  ] as const)('lights hour %i as %s', (hour, light) => {
    expect(sceneLightFor(hour)).toBe(light);
  });
});

describe('sceneGrowthText', () => {
  it('says nothing the first time the scene is seen on this device', () => {
    expect(sceneGrowthText(null, 'window')).toBeNull();
  });

  it('says nothing when the stage is the one last seen, or an earlier one', () => {
    expect(sceneGrowthText(sceneStageIndex('plates'), 'plates')).toBeNull();
    expect(sceneGrowthText(sceneStageIndex('window'), 'plates')).toBeNull();
  });

  it('names what the newest stage added', () => {
    expect(sceneGrowthText(sceneStageIndex('bare'), 'plates')).toBe('Your gym grew: plates on the wall');
    expect(sceneGrowthText(sceneStageIndex('plates'), 'banners')).toBe('Your gym grew: a banner went up');
    expect(sceneGrowthText(sceneStageIndex('banners'), 'window')).toBe('Your gym grew: a window let the light in');
    expect(sceneGrowthText(sceneStageIndex('window'), 'skyline')).toBe('Your gym grew: the city came into view');
    expect(sceneGrowthText(sceneStageIndex('bare'), 'skyline')).toBe('Your gym grew: the city came into view');
  });

  it('has an index for every stage in growing order', () => {
    expect(SCENE_STAGES.map(sceneStageIndex)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('sceneLabel', () => {
  it('describes a bare room', () => {
    expect(sceneLabel(sceneFor(NEW_LIFTER))).toBe('Your gym: a bare room with a rack, in daylight');
  });

  it('lists what has grown, with trophies, pennants and the light', () => {
    expect(sceneLabel(sceneFor({ totalLevel: 300, recordCount: 1, questPoints: 6, hour: 22 }))).toBe(
      'Your gym: a rack, plates on the wall, a banner, a window onto the city, 1 trophy and 2 quest pennants, at night',
    );
    expect(sceneLabel(sceneFor({ totalLevel: 100, recordCount: 3, questPoints: 0, hour: 6 }))).toBe(
      'Your gym: a rack, plates on the wall, a banner, a window and 3 trophies, at dawn',
    );
    expect(sceneLabel(sceneFor({ totalLevel: 15, recordCount: 0, questPoints: 1, hour: 19 }))).toBe(
      'Your gym: a rack, plates on the wall and 1 quest pennant, at dusk',
    );
  });
});
