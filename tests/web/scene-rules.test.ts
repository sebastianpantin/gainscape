import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  GOLD_TROPHY_DAYS,
  PENNANT_QUEST_POINTS,
  SILVER_TROPHY_DAYS,
  EQUIPMENT_MIN_SKILL_LEVEL,
  EQUIPMENT_SKILL,
  equipmentMask,
  MAX_EQUIPMENT_NAMED,
  MAX_SCENE_TROPHIES,
  SCENE_EQUIPMENT,
  SCENE_STAGES,
  type SceneEquipment,
  type SceneInput,
  sceneFor,
  type SceneSeen,
  type SceneStage,
  sceneGrowthText,
  sceneLabel,
  sceneLightFor,
  sceneStageIndex,
  sceneWeatherFor,
} from '../../web/src/lib/progress/scene-rules.ts';

const TODAY = '2026-11-18';

const NEW_LIFTER: SceneInput = {
  totalLevel: 10,
  recordDates: [],
  questPoints: 0,
  streakWeeks: 0,
  skillLevels: {},
  today: TODAY,
  hour: 12,
};

function skilled(...equipment: SceneEquipment[]): Record<string, number> {
  return Object.fromEntries(equipment.map((piece) => [EQUIPMENT_SKILL[piece], EQUIPMENT_MIN_SKILL_LEVEL]));
}

function seenAt(stage: SceneStage, equipment: readonly SceneEquipment[] | null = []): SceneSeen {
  return { stageIndex: sceneStageIndex(stage), equipmentMask: equipment && equipmentMask(equipment) };
}

function grown(stage: SceneStage, equipment: readonly SceneEquipment[] = []) {
  return { stage, equipment };
}

describe('sceneFor', () => {
  it('starts a new lifter in a bare room with only a rack', () => {
    expect(sceneFor(NEW_LIFTER)).toEqual({
      stage: 'bare',
      props: ['rack'],
      equipment: [],
      trophies: [],
      pennants: 0,
      torch: null,
      light: 'day',
      weather: 'clear',
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

  it('hangs a trophy for each of the three newest records, newest first', () => {
    expect(sceneFor({ ...NEW_LIFTER, recordDates: [TODAY] }).trophies).toEqual(['gold']);
    expect(
      sceneFor({ ...NEW_LIFTER, recordDates: ['2026-06-01', TODAY, '2026-10-30', '2026-02-01'] }).trophies,
    ).toEqual(['gold', 'silver', 'bronze']);
    expect(MAX_SCENE_TROPHIES).toBe(3);
  });

  it('keeps a trophy gold for a week and silver for thirty days, then bronze', () => {
    const metalAt = (recordDate: string) => sceneFor({ ...NEW_LIFTER, recordDates: [recordDate] }).trophies[0];
    expect([GOLD_TROPHY_DAYS, SILVER_TROPHY_DAYS]).toEqual([7, 30]);
    expect(metalAt('2026-11-11')).toBe('gold');
    expect(metalAt('2026-11-10')).toBe('silver');
    expect(metalAt('2026-10-19')).toBe('silver');
    expect(metalAt('2026-10-18')).toBe('bronze');
    expect(metalAt('2026-11-19')).toBe('gold');
  });

  it('strings up a pennant at 1, 3, 6, 10, 15 and 21 quest points', () => {
    const pennantsAt = (questPoints: number) => sceneFor({ ...NEW_LIFTER, questPoints }).pennants;
    expect([0, 1, 2, 3, 5, 6, 9, 10, 14, 15, 20, 21, 500].map(pennantsAt)).toEqual([
      0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6,
    ]);
    expect(PENNANT_QUEST_POINTS).toHaveLength(6);
  });

  it('brings in a piece of equipment for each skill at level 20, in a fixed order', () => {
    expect(new Set(Object.values(EQUIPMENT_SKILL)).size).toBe(SCENE_EQUIPMENT.length);
    for (const piece of SCENE_EQUIPMENT) {
      const skill = EQUIPMENT_SKILL[piece];
      expect(sceneFor({ ...NEW_LIFTER, skillLevels: { [skill]: EQUIPMENT_MIN_SKILL_LEVEL - 1 } }).equipment).toEqual(
        [],
      );
      expect(sceneFor({ ...NEW_LIFTER, skillLevels: { [skill]: EQUIPMENT_MIN_SKILL_LEVEL } }).equipment).toEqual([
        piece,
      ]);
      expect(sceneFor({ ...NEW_LIFTER, skillLevels: { [skill]: 99 } }).equipment).toEqual([piece]);
    }
    expect(sceneFor({ ...NEW_LIFTER, skillLevels: skilled('mat', 'bench', 'kettlebell') }).equipment).toEqual([
      'bench',
      'kettlebell',
      'mat',
    ]);
    expect(sceneFor({ ...NEW_LIFTER, skillLevels: { juggling: 99 } }).equipment).toEqual([]);
  });

  it('lights a torch for a streak, bigger at 4 and at 12 weeks', () => {
    expect(sceneFor({ ...NEW_LIFTER, streakWeeks: 0 }).torch).toBeNull();
    expect(sceneFor({ ...NEW_LIFTER, streakWeeks: 1 }).torch).toEqual({ streakWeeks: 1, flame: 'small' });
    expect(sceneFor({ ...NEW_LIFTER, streakWeeks: 3 }).torch).toEqual({ streakWeeks: 3, flame: 'small' });
    expect(sceneFor({ ...NEW_LIFTER, streakWeeks: 4 }).torch).toEqual({ streakWeeks: 4, flame: 'steady' });
    expect(sceneFor({ ...NEW_LIFTER, streakWeeks: 11 }).torch).toEqual({ streakWeeks: 11, flame: 'steady' });
    expect(sceneFor({ ...NEW_LIFTER, streakWeeks: 12 }).torch).toEqual({ streakWeeks: 12, flame: 'roaring' });
    expect(sceneFor({ ...NEW_LIFTER, streakWeeks: 80 }).torch).toEqual({ streakWeeks: 80, flame: 'roaring' });
  });
});

describe('sceneWeatherFor', () => {
  it.each([
    ['2026-12-01', 'snow'],
    ['2027-01-15', 'snow'],
    ['2027-02-28', 'snow'],
    ['2027-03-01', 'clear'],
    ['2026-07-04', 'clear'],
    ['2026-11-30', 'clear'],
  ] as const)('on %s the weather is %s', (today, weather) => {
    expect(sceneWeatherFor(today)).toBe(weather);
    expect(sceneFor({ ...NEW_LIFTER, totalLevel: 100, today }).weather).toBe(weather);
  });

  it('stays clear in a room without a window to see it through', () => {
    expect(sceneFor({ ...NEW_LIFTER, totalLevel: 99, today: '2026-12-24' }).weather).toBe('clear');
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
    expect(sceneGrowthText(null, grown('window', ['bench']))).toBeNull();
  });

  it('says nothing when the stage is the one last seen, or an earlier one', () => {
    expect(sceneGrowthText(seenAt('plates'), grown('plates'))).toBeNull();
    expect(sceneGrowthText(seenAt('window'), grown('plates'))).toBeNull();
  });

  it('names what the newest stage added', () => {
    expect(sceneGrowthText(seenAt('bare'), grown('plates'))).toBe('Your gym grew: plates on the wall');
    expect(sceneGrowthText(seenAt('plates'), grown('banners'))).toBe('Your gym grew: a banner went up');
    expect(sceneGrowthText(seenAt('banners'), grown('window'))).toBe('Your gym grew: a window let the light in');
    expect(sceneGrowthText(seenAt('window'), grown('skyline'))).toBe('Your gym grew: the city came into view');
    expect(sceneGrowthText(seenAt('bare'), grown('skyline'))).toBe('Your gym grew: the city came into view');
  });

  it('names the equipment that arrived since the last visit', () => {
    expect(sceneGrowthText(seenAt('plates'), grown('plates', ['kettlebell']))).toBe(
      'Your gym grew: a kettlebell arrived',
    );
    expect(sceneGrowthText(seenAt('plates', ['kettlebell']), grown('plates', ['bench', 'kettlebell', 'mat']))).toBe(
      'Your gym grew: a bench and a mat arrived',
    );
    expect(sceneGrowthText(seenAt('plates', ['bench', 'mat']), grown('plates', ['bench', 'mat']))).toBeNull();
    expect(sceneGrowthText(seenAt('plates', ['bench', 'mat']), grown('plates', ['bench']))).toBeNull();
  });

  it('counts the arrivals instead of naming more than three', () => {
    expect(MAX_EQUIPMENT_NAMED).toBe(3);
    expect(sceneGrowthText(seenAt('plates'), grown('plates', SCENE_EQUIPMENT.slice(0, 4)))).toBe(
      'Your gym grew: 4 pieces of equipment arrived',
    );
  });

  it('says both when a stage and equipment came together', () => {
    expect(sceneGrowthText(seenAt('bare'), grown('plates', ['dumbbells']))).toBe(
      'Your gym grew: plates on the wall and dumbbells arrived',
    );
  });

  it('stays quiet about equipment the first time this device tracks it', () => {
    expect(sceneGrowthText(seenAt('plates', null), grown('plates', ['bench']))).toBeNull();
    expect(sceneGrowthText(seenAt('bare', null), grown('plates', ['bench']))).toBe('Your gym grew: plates on the wall');
  });

  it('has an index for every stage in growing order', () => {
    expect(SCENE_STAGES.map(sceneStageIndex)).toEqual([0, 1, 2, 3, 4]);
  });

  it('gives every set of equipment its own mask', () => {
    expect(equipmentMask([])).toBe(0);
    expect(new Set(SCENE_EQUIPMENT.map((piece) => equipmentMask([piece]))).size).toBe(SCENE_EQUIPMENT.length);
    expect(equipmentMask(['bench', 'mat'])).toBe(equipmentMask(['bench']) + equipmentMask(['mat']));
  });
});

describe('sceneLabel', () => {
  it('describes a bare room', () => {
    expect(sceneLabel(sceneFor(NEW_LIFTER))).toBe('Your gym: a bare room with a rack, in daylight');
  });

  it('lists what has grown, with trophies, pennants and the light', () => {
    expect(
      sceneLabel(sceneFor({ ...NEW_LIFTER, totalLevel: 300, recordDates: ['2026-11-01'], questPoints: 3, hour: 22 })),
    ).toBe(
      'Your gym: a rack, plates on the wall, a banner, a window onto the city, 1 silver trophy and 2 quest pennants, at night',
    );
    expect(
      sceneLabel(
        sceneFor({ ...NEW_LIFTER, totalLevel: 100, recordDates: [TODAY, '2026-11-15', '2026-01-05'], hour: 6 }),
      ),
    ).toBe('Your gym: a rack, plates on the wall, a banner, a window, 2 gold trophies and 1 bronze trophy, at dawn');
    expect(sceneLabel(sceneFor({ ...NEW_LIFTER, totalLevel: 15, questPoints: 1, hour: 19 }))).toBe(
      'Your gym: a rack, plates on the wall and 1 quest pennant, at dusk',
    );
  });

  it('names up to three pieces of equipment and counts more', () => {
    expect(sceneLabel(sceneFor({ ...NEW_LIFTER, skillLevels: skilled('kettlebell') }))).toBe(
      'Your gym: a rack and a kettlebell, in daylight',
    );
    expect(
      sceneLabel(
        sceneFor({ ...NEW_LIFTER, recordDates: [TODAY], skillLevels: skilled('bar-plates', 'bench', 'cones') }),
      ),
    ).toBe('Your gym: a rack, a bench, more plates on the bar, cones and 1 gold trophy, in daylight');
    expect(sceneLabel(sceneFor({ ...NEW_LIFTER, totalLevel: 15, skillLevels: skilled(...SCENE_EQUIPMENT) }))).toBe(
      'Your gym: a rack, plates on the wall and 10 pieces of equipment, in daylight',
    );
  });

  it('mentions the snow only once a window shows it', () => {
    expect(sceneLabel(sceneFor({ ...NEW_LIFTER, today: '2026-12-24' }))).toBe(
      'Your gym: a bare room with a rack, in daylight',
    );
    expect(sceneLabel(sceneFor({ ...NEW_LIFTER, totalLevel: 100, today: '2026-12-24', hour: 22 }))).toBe(
      'Your gym: a rack, plates on the wall, a banner and a window, at night with snow outside',
    );
  });

  it('names the torch and the streak that lit it', () => {
    expect(sceneLabel(sceneFor({ ...NEW_LIFTER, streakWeeks: 3 }))).toBe(
      'Your gym: a rack and a torch for your 3 week streak, in daylight',
    );
    expect(
      sceneLabel(
        sceneFor({
          ...NEW_LIFTER,
          totalLevel: 15,
          recordDates: ['2026-01-05', '2026-01-09'],
          streakWeeks: 12,
          hour: 22,
        }),
      ),
    ).toBe('Your gym: a rack, plates on the wall, 2 bronze trophies and a torch for your 12 week streak, at night');
  });
});
