import { describe, expect, it } from 'vitest';
import { type ProgramDefinition, programStateAt } from '@domain/index.ts';
import { type ProgramDoc } from '../../web/src/lib/programs/programs.ts';
import { type EnrollmentRow, enrollmentFromRow } from '../../web/src/lib/programs/program-facts-rules.ts';
import {
  carriedFollowOf,
  carriedInputs,
  followStatus,
  isEnrolledIn,
  isFollowing,
  workingWeights,
} from '../../web/src/lib/programs/program-follow-rules.ts';
import { type LoadType } from '../../web/src/lib/exercises/catalog-rules.ts';
import { customTemplateKey } from '../../web/src/lib/programs/program-enroll-rules.ts';
import { type PlannedExercise } from '../../web/src/offline/draft-starts.ts';
import {
  BENCH_ID,
  BENCH_LIFT,
  CUSTOM_FIVE_BY_FIVE,
  CUSTOM_KEY,
  customTemplateRow,
  PROGRAM_ID,
  ROW_ID,
  ROW_LIFT,
  SQUAT_ID,
  SQUAT_LIFT,
} from './custom-program-fixture.ts';

const SQUAT_FIVE_BY_FIVE: PlannedExercise = {
  exerciseId: SQUAT_ID,
  targetSets: 5,
  targetRepsMin: 5,
  targetRepsMax: 5,
  progression: { kind: 'linear', incrementKg: 2.5, incrementLb: 5 },
};

const BENCH_THREE_BY_EIGHT: PlannedExercise = {
  exerciseId: BENCH_ID,
  targetSets: 3,
  targetRepsMin: 8,
  targetRepsMax: 8,
  progression: { kind: 'none' },
};

function followedDoc(exercises: PlannedExercise[] = [SQUAT_FIVE_BY_FIVE, BENCH_THREE_BY_EIGHT]): ProgramDoc {
  return { id: PROGRAM_ID, name: 'My 5x5', days: [{ id: 'day-1', name: 'Day 1', exercises }] };
}

function enrollmentRow(overrides: Partial<EnrollmentRow> = {}): EnrollmentRow {
  return {
    id: 'enrollment-1',
    template_key: CUSTOM_KEY,
    template_version: 1,
    unit: 'kg',
    options: {},
    lift_bindings: { [SQUAT_LIFT]: SQUAT_ID, [BENCH_LIFT]: BENCH_ID },
    inputs: { [SQUAT_LIFT]: { workingWeight: 100 } },
    rounding: { increment: 2.5, mode: 'nearest', barWeight: 20 },
    started_at: '2026-10-10T08:00:00.000Z',
    ended_at: null,
    ...overrides,
  };
}

const TEMPLATES = [customTemplateRow()];

const ALL_EXTERNAL = (): LoadType => 'external';

describe('the key a program is published under', () => {
  it('is custom_ and the program id without dashes', () => {
    expect(customTemplateKey(PROGRAM_ID)).toBe(CUSTOM_KEY);
  });
});

describe('follow status of your own program', () => {
  it('is not following with no enrollment, an ended one, or one in another program', () => {
    expect(followStatus(followedDoc(), null, TEMPLATES, ALL_EXTERNAL)).toBe('not_following');
    expect(
      followStatus(followedDoc(), enrollmentRow({ ended_at: '2026-10-10T09:00:00.000Z' }), TEMPLATES, ALL_EXTERNAL),
    ).toBe('not_following');
    expect(followStatus(followedDoc(), enrollmentRow({ template_key: 'madcow_5x5' }), TEMPLATES, ALL_EXTERNAL)).toBe(
      'not_following',
    );
  });

  it('is current when the program still compiles to the followed definition', () => {
    expect(followStatus(followedDoc(), enrollmentRow(), TEMPLATES, ALL_EXTERNAL)).toBe('current');
  });

  it('is current when the followed snapshot is not saved on this device, since nothing can be compared', () => {
    expect(followStatus(followedDoc(), enrollmentRow(), [], ALL_EXTERNAL)).toBe('current');
  });

  it('is outdated after a change to the name, a day name, sets, reps, the increment or the progression', () => {
    const changes: ProgramDoc[] = [
      { ...followedDoc(), name: 'My 5x5 v2' },
      { ...followedDoc(), days: [{ ...followedDoc().days[0], name: 'Heavy day' }] },
      followedDoc([{ ...SQUAT_FIVE_BY_FIVE, targetSets: 3 }, BENCH_THREE_BY_EIGHT]),
      followedDoc([SQUAT_FIVE_BY_FIVE, { ...BENCH_THREE_BY_EIGHT, targetRepsMax: 10 }]),
      followedDoc([
        { ...SQUAT_FIVE_BY_FIVE, progression: { kind: 'linear', incrementKg: 5, incrementLb: 10 } },
        BENCH_THREE_BY_EIGHT,
      ]),
      followedDoc([SQUAT_FIVE_BY_FIVE, { ...BENCH_THREE_BY_EIGHT, progression: { kind: 'fixed' } }]),
      followedDoc([{ ...SQUAT_FIVE_BY_FIVE, progression: { kind: 'fixed' } }, BENCH_THREE_BY_EIGHT]),
    ];
    for (const changed of changes)
      expect(followStatus(changed, enrollmentRow(), TEMPLATES, ALL_EXTERNAL)).toBe('outdated');
  });

  it('is outdated after adding, removing or reordering exercises or days', () => {
    const rowExercise: PlannedExercise = { ...BENCH_THREE_BY_EIGHT, exerciseId: ROW_ID };
    const changes: ProgramDoc[] = [
      followedDoc([SQUAT_FIVE_BY_FIVE, BENCH_THREE_BY_EIGHT, rowExercise]),
      followedDoc([SQUAT_FIVE_BY_FIVE]),
      followedDoc([BENCH_THREE_BY_EIGHT, SQUAT_FIVE_BY_FIVE]),
      { ...followedDoc(), days: [...followedDoc().days, { id: 'day-2', name: 'Day 2', exercises: [rowExercise] }] },
    ];
    for (const changed of changes)
      expect(followStatus(changed, enrollmentRow(), TEMPLATES, ALL_EXTERNAL)).toBe('outdated');
  });

  it('compares with the followed version, not the newest snapshot', () => {
    const newer = { ...CUSTOM_FIVE_BY_FIVE, version: 2, name: 'My 5x5 v2' };
    const templates = [...TEMPLATES, customTemplateRow(newer)];
    expect(followStatus(followedDoc(), enrollmentRow(), templates, ALL_EXTERNAL)).toBe('current');
    expect(followStatus({ ...followedDoc(), name: 'My 5x5 v2' }, enrollmentRow(), templates, ALL_EXTERNAL)).toBe(
      'outdated',
    );
    expect(
      followStatus(
        { ...followedDoc(), name: 'My 5x5 v2' },
        enrollmentRow({ template_version: 2 }),
        templates,
        ALL_EXTERNAL,
      ),
    ).toBe('current');
  });
});

describe('follow status when a lift is repeated across days', () => {
  const benchFirstDays = (): ProgramDoc['days'] => [
    { id: 'day-a', name: 'Day A', exercises: [BENCH_THREE_BY_EIGHT, SQUAT_FIVE_BY_FIVE] },
    {
      id: 'day-b',
      name: 'Day B',
      exercises: [{ ...BENCH_THREE_BY_EIGHT, progression: { kind: 'linear', incrementKg: 1.25, incrementLb: 2.5 } }],
    },
  ];
  const repeatSlot = (id: string, lift: string, count: number, reps: number, linear: boolean) => ({
    id,
    lift,
    role: 'main' as const,
    scheme: {
      kind: 'repeat' as const,
      count,
      reps,
      load: linear ? { kind: 'pct' as const, pct: 1, of: 'workingWeight' as const } : { kind: 'lastLogged' as const },
    },
  });
  const linearRule = (lift: string, judgedSlot: string, kg: number, lb: number) => ({
    lift,
    var: 'workingWeight' as const,
    trigger: 'afterSession' as const,
    judgedSlots: [judgedSlot],
    onMet: [{ kind: 'increment' as const, by: { kg, lb } }],
    onMiss: [{ kind: 'hold' as const }],
  });
  const publishedInFirstSeenOrder = {
    ...CUSTOM_FIVE_BY_FIVE,
    schedule: {
      kind: 'rotation',
      days: [
        {
          key: 'd0',
          name: 'Day A',
          slots: [repeatSlot('d0_0', BENCH_LIFT, 3, 8, false), repeatSlot('d0_1', SQUAT_LIFT, 5, 5, true)],
        },
        { key: 'd1', name: 'Day B', slots: [repeatSlot('d1_0', BENCH_LIFT, 3, 8, true)] },
      ],
    },
    progression: [linearRule(BENCH_LIFT, 'd1_0', 1.25, 2.5), linearRule(SQUAT_LIFT, 'd0_1', 2.5, 5)],
  } as ProgramDefinition;

  it('is current whatever order the published rules list the lifts in', () => {
    const program: ProgramDoc = { ...followedDoc(), days: benchFirstDays() };
    expect(followStatus(program, enrollmentRow(), [customTemplateRow(publishedInFirstSeenOrder)], ALL_EXTERNAL)).toBe(
      'current',
    );
  });
});

describe('follow status when an exercise has no added weight', () => {
  const loadTypes =
    (squatLoadType: LoadType) =>
    (exerciseId: string): LoadType | null =>
      exerciseId === SQUAT_ID ? squatLoadType : 'external';
  const [publishedDay] = CUSTOM_FIVE_BY_FIVE.schedule.kind === 'rotation' ? CUSTOM_FIVE_BY_FIVE.schedule.days : [];
  const publishedWithoutAddedWeight = {
    ...CUSTOM_FIVE_BY_FIVE,
    inputs: [],
    schedule: {
      kind: 'rotation',
      days: [
        {
          ...publishedDay,
          slots: publishedDay.slots.map((slot) =>
            slot.lift === SQUAT_LIFT && slot.scheme.kind === 'repeat'
              ? { ...slot, scheme: { ...slot.scheme, load: { kind: 'lastLogged' } } }
              : slot,
          ),
        },
      ],
    },
    progression: [],
  } as ProgramDefinition;

  it('is current when the snapshot was compiled after the exercise changed to bodyweight', () => {
    for (const loadType of ['bodyweight', 'bodyweight_plus'] as const) {
      const templates = [customTemplateRow(publishedWithoutAddedWeight)];
      expect(followStatus(followedDoc(), enrollmentRow(), templates, loadTypes(loadType))).toBe('current');
      const fixedSquat = followedDoc([{ ...SQUAT_FIVE_BY_FIVE, progression: { kind: 'fixed' } }, BENCH_THREE_BY_EIGHT]);
      expect(followStatus(fixedSquat, enrollmentRow(), templates, loadTypes(loadType))).toBe('current');
    }
  });

  it('is outdated when the snapshot still adds weight to an exercise that now has none', () => {
    expect(followStatus(followedDoc(), enrollmentRow(), TEMPLATES, loadTypes('bodyweight'))).toBe('outdated');
  });

  it('keeps the planned progression of an exercise this device does not know', () => {
    expect(followStatus(followedDoc(), enrollmentRow(), TEMPLATES, () => null)).toBe('current');
  });
});

describe('follow status before the exercise list has loaded', () => {
  it('is undecided for a followed program, even one whose snapshot differs', () => {
    const renamed = { ...followedDoc(), name: 'My 5x5 v2' };
    expect(followStatus(renamed, enrollmentRow(), TEMPLATES, null)).toBe('undecided');
    expect(followStatus(followedDoc(), enrollmentRow(), TEMPLATES, null)).toBe('undecided');
  });

  it('is still not following when the program is not followed', () => {
    expect(followStatus(followedDoc(), null, TEMPLATES, null)).toBe('not_following');
  });
});

describe('a cached enrollment in a program', () => {
  it('is in the program when it was started from its published key, ended or not', () => {
    expect(isEnrolledIn(PROGRAM_ID, enrollmentRow())).toBe(true);
    expect(isEnrolledIn(PROGRAM_ID, enrollmentRow({ ended_at: '2026-10-10T09:00:00.000Z' }))).toBe(true);
  });

  it('is not in the program with no enrollment or one in another program', () => {
    expect(isEnrolledIn(PROGRAM_ID, null)).toBe(false);
    expect(isEnrolledIn(PROGRAM_ID, enrollmentRow({ template_key: 'madcow_5x5' }))).toBe(false);
  });
});

describe('following a program', () => {
  it('needs an enrollment in that program that has not ended', () => {
    expect(isFollowing(PROGRAM_ID, enrollmentRow())).toBe(true);
    expect(isFollowing(PROGRAM_ID, enrollmentRow({ ended_at: '2026-10-10T09:00:00.000Z' }))).toBe(false);
    expect(isFollowing(PROGRAM_ID, enrollmentRow({ template_key: 'madcow_5x5' }))).toBe(false);
    expect(isFollowing(PROGRAM_ID, null)).toBe(false);
  });
});

describe('carrying working weights to the new version', () => {
  const after = (sessions: number) => {
    const enrollment = enrollmentFromRow(enrollmentRow());
    const facts = Array.from({ length: sessions }, (_, index) => ({
      kind: 'session' as const,
      id: `session-${index}`,
      at: `2026-10-1${index}T08:00:00.000Z`,
      position: { index },
      sets: Array.from({ length: 5 }, (_, set) => {
        const weightKg = 100 + index * 2.5;
        return {
          exerciseId: SQUAT_ID,
          weightKg,
          reps: 5,
          effortInputType: null,
          effortValue: null,
          prescription: { ref: `d0_0:${set}`, weightKg, reps: 5, minReps: null, amrap: false },
        };
      }),
    }));
    return programStateAt(CUSTOM_FIVE_BY_FIVE, enrollment, facts);
  };

  it('reads the current working weight of every lift', () => {
    expect(workingWeights(after(0))).toEqual({ [SQUAT_LIFT]: 100 });
    expect(workingWeights(after(1))).toEqual({ [SQUAT_LIFT]: 102.5 });
  });

  it('fills the starting weight of each lift the new version asks for, and leaves a new lift empty', () => {
    const next = {
      ...CUSTOM_FIVE_BY_FIVE,
      version: 2,
      inputs: [{ lifts: [SQUAT_LIFT, ROW_LIFT], kinds: ['workingWeight' as const] }],
    };
    expect(carriedInputs({ [SQUAT_LIFT]: 102.5, [BENCH_LIFT]: 60 }, next)).toEqual({
      [SQUAT_LIFT]: '102.5',
      [ROW_LIFT]: '',
    });
  });
});

describe('the carried follow passed to the follow form', () => {
  it('reads a unit and working weights', () => {
    const carried = { unit: 'lb', workingWeights: { [SQUAT_LIFT]: 225 } };
    expect(carriedFollowOf({ carried })).toEqual(carried);
  });

  it('ignores anything else', () => {
    for (const state of [null, undefined, 'x', {}, { carried: { unit: 'st', workingWeights: {} } }]) {
      expect(carriedFollowOf(state)).toBeNull();
    }
    expect(carriedFollowOf({ carried: { unit: 'kg', workingWeights: { [SQUAT_LIFT]: 'heavy' } } })).toBeNull();
  });
});
