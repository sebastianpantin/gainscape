import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  bonusText,
  challengeFailReason,
  challengeHeadline,
  challengeNotAppliedText,
  levelUpTakeover,
  levelUpCueDelayMs,
  levelUpTier,
  playsReveal,
  questRevealLines,
  REVEAL_MAX_PRE_LOOT_S,
  revealShape,
  revealTimeline,
  skipsRevealOnKey,
  takeoverKicker,
  unappliedChangesText,
  xpToNextLevelText,
  gainBarLabel,
} from '../../web/src/features/summary/reveal-rules.ts';
import { questLogFrom } from '../../web/src/lib/quests/quest-rules.ts';

const roundedS = (seconds: number) => Math.round(seconds * 1000) / 1000;

describe('bonusText', () => {
  it('shows the gear bonus of a skill with grouped thousands', () => {
    expect(bonusText('Gear', { core: 1234 }, 'core')).toBe('Gear bonus +1,234 XP');
  });

  it('shows nothing for a skill without a bonus or a summary from before gear', () => {
    expect(bonusText('Gear', { core: 12 }, 'chest')).toBeNull();
    expect(bonusText('Gear', { core: 0 }, 'core')).toBeNull();
    expect(bonusText('Gear', undefined, 'core')).toBeNull();
  });
});

describe('challenge lines', () => {
  const DEADLIFT = 'deadlift-id';
  const PULL_UP = 'pull-up-id';
  const names: Record<string, string> = { [DEADLIFT]: 'Deadlift', [PULL_UP]: 'Pull-up' };
  const nameOf = (exerciseId: string) => names[exerciseId] ?? 'Exercise';
  const prescription = {
    kind: 'prescription' as const,
    groups: [
      {
        rounds: 5,
        exercises: [
          { exerciseId: DEADLIFT, reps: 5, pct: 70 },
          { exerciseId: PULL_UP, reps: 5, pct: null },
        ],
      },
    ],
  };
  const planned = {
    challengeId: 'challenge-dl',
    name: 'Deadlift and Pull-up',
    definition: prescription,
    targetLoadsKg: { [DEADLIFT]: 100, [PULL_UP]: null },
  };
  const tenTon = {
    challengeId: 'challenge-tt',
    name: 'Ten-Ton Day',
    definition: { kind: 'volume' as const, metric: 'kg' as const, target: 10000, exerciseId: null, minPct: null },
    targetLoadsKg: {},
  };

  function judged(passed: boolean, targetLoadsKg: Record<string, number | null> = { [DEADLIFT]: 97.5 }) {
    return {
      challenge: {
        challengeId: 'challenge-dl',
        key: 'deadlift_and_pull_up',
        name: 'Deadlift and Pull-up',
        passed,
        targetLoadsKg,
      },
    };
  }

  it('heads the reveal with the outcome of the challenge', () => {
    expect(challengeHeadline(judged(true))).toBe('Challenge complete: Deadlift and Pull-up');
    expect(challengeHeadline(judged(false))).toBe('Challenge failed: Deadlift and Pull-up');
    expect(challengeHeadline({ challenge: null })).toBeNull();
    expect(challengeHeadline({})).toBeNull();
  });

  it('shows the challenge bonus of a skill', () => {
    expect(bonusText('Challenge', { back: 1250 }, 'back')).toBe('Challenge bonus +1,250 XP');
    expect(bonusText('Challenge', { back: 250 }, 'arms')).toBeNull();
    expect(bonusText('Challenge', { back: 0 }, 'back')).toBeNull();
    expect(bonusText('Challenge', undefined, 'back')).toBeNull();
  });

  it('explains a fail when the target rose above the planned load since the start', () => {
    expect(challengeFailReason(judged(false, { [DEADLIFT]: 105, [PULL_UP]: null }), planned, nameOf, 'kg')).toBe(
      'Target rose since you started: Deadlift 105 kg (planned 100 kg)',
    );
  });

  it('blames the logged sets of a prescription challenge when the target stayed within the plan', () => {
    expect(challengeFailReason(judged(false, { [DEADLIFT]: 97.5, [PULL_UP]: null }), planned, nameOf, 'kg')).toBe(
      'Not every prescribed set reached its reps and load',
    );
  });

  it('blames the volume of a volume challenge', () => {
    expect(challengeFailReason(judged(false, {}), tenTon, nameOf, 'kg')).toBe('Volume target not reached');
  });

  it('falls back to a plain reason without the planned challenge', () => {
    expect(challengeFailReason(judged(false), null, nameOf, 'kg')).toBe('Challenge target not reached');
  });

  it('gives no reason for a pass or a workout without a challenge', () => {
    expect(challengeFailReason(judged(true), planned, nameOf, 'kg')).toBeNull();
    expect(challengeFailReason({ challenge: null }, planned, nameOf, 'kg')).toBeNull();
  });

  it('tells the lifter a planned challenge was not applied, without guessing why the server skipped it', () => {
    expect(challengeNotAppliedText({ challenge: null }, planned)).toBe(
      "Challenge not applied: Deadlift and Pull-up couldn't be applied to this workout, so it was saved as a normal workout.",
    );
    expect(challengeNotAppliedText({}, planned)).toBe(
      "Challenge not applied: Deadlift and Pull-up couldn't be applied to this workout, so it was saved as a normal workout.",
    );
  });

  it('tells the lifter a planned challenge was not applied to a workout saved to history only', () => {
    expect(challengeNotAppliedText({ challenge: null, historyOnly: true }, planned)).toBe(
      'Challenge not applied: a workout older than 7 days is saved to history only. Your scroll was kept.',
    );
  });

  it('says nothing when the challenge was applied or none was planned', () => {
    expect(challengeNotAppliedText(judged(false), planned)).toBeNull();
    expect(challengeNotAppliedText(judged(true), planned)).toBeNull();
    expect(challengeNotAppliedText({ challenge: null }, null)).toBeNull();
  });
});

describe('unappliedChangesText', () => {
  it('tells the lifter that the copy on this device differs from the saved workout and was not applied', () => {
    expect(unappliedChangesText({ storedContentDiffers: true })).toBe(
      "This workout was already saved, and the saved version differs from this device's copy, so this copy was not applied. Check it in History.",
    );
  });

  it('does not send the lifter to History for a workout too old to edit', () => {
    expect(unappliedChangesText({ storedContentDiffers: true, historyOnly: true })).toBe(
      "This workout was already saved, and the saved version differs from this device's copy, so this copy was not applied.",
    );
  });

  it('says nothing when the server stored what was sent', () => {
    expect(unappliedChangesText({})).toBeNull();
  });
});

describe('levelUpTier', () => {
  it('is a plain level up between milestones', () => {
    expect(levelUpTier({ from: 3, to: 4 })).toBe('normal');
    expect(levelUpTier({ from: 50, to: 53 })).toBe('normal');
  });

  it('is a milestone when it reaches or passes 10, 25, 50, 75 or a round ten above 50', () => {
    expect(levelUpTier({ from: 9, to: 10 })).toBe('milestone');
    expect(levelUpTier({ from: 8, to: 11 })).toBe('milestone');
    expect(levelUpTier({ from: 24, to: 25 })).toBe('milestone');
    expect(levelUpTier({ from: 49, to: 50 })).toBe('milestone');
    expect(levelUpTier({ from: 59, to: 60 })).toBe('milestone');
    expect(levelUpTier({ from: 74, to: 75 })).toBe('milestone');
    expect(levelUpTier({ from: 89, to: 90 })).toBe('milestone');
    expect(levelUpTier({ from: 25, to: 30 })).toBe('normal');
  });

  it('is the max tier on reaching level 99', () => {
    expect(levelUpTier({ from: 98, to: 99 })).toBe('max');
    expect(levelUpTier({ from: 89, to: 99 })).toBe('max');
  });
});

describe('levelUpTakeover', () => {
  it('takes over with the one level up of the workout', () => {
    expect(levelUpTakeover([{ skill: 'chest', from: 9, to: 10 }])).toEqual({
      tier: 'milestone',
      entries: [{ skill: 'chest', from: 9, to: 10, tier: 'milestone' }],
    });
  });

  it('sums up every level up of the workout on one card, biggest first, and takes the tier of the biggest', () => {
    const takeover = levelUpTakeover([
      { skill: 'arms', from: 3, to: 4 },
      { skill: 'chest', from: 9, to: 10 },
      { skill: 'legs', from: 30, to: 31 },
      { skill: 'core', from: 5, to: 6 },
    ]);
    expect(takeover?.tier).toBe('milestone');
    expect(takeover?.entries.map((entry) => entry.skill)).toEqual(['chest', 'legs', 'core', 'arms']);
  });

  it('keeps every level up, however many skills went up', () => {
    const levelUps = [
      'chest',
      'back',
      'shoulders',
      'arms',
      'legs',
      'core',
      'grip',
      'endurance',
      'agility',
      'mobility',
    ].map((skill) => ({ skill, from: 1, to: 2 }));
    expect(levelUpTakeover(levelUps)?.entries).toHaveLength(10);
  });

  it('has no takeover without a level up', () => {
    expect(levelUpTakeover([])).toBeNull();
  });
});

describe('takeoverKicker', () => {
  it('names the kind of a single level up', () => {
    expect(takeoverKicker('normal', 1)).toBe('Level up!');
    expect(takeoverKicker('milestone', 1)).toBe('Milestone!');
    expect(takeoverKicker('max', 1)).toBe('Max level!');
  });

  it('counts the level ups of a summary', () => {
    expect(takeoverKicker('normal', 3)).toBe('3 level ups!');
    expect(takeoverKicker('milestone', 2)).toBe('2 level ups!');
  });
});

describe('revealTimeline', () => {
  const shapes = fc.record({
    skillCount: fc.integer({ min: 0, max: 40 }),
    levelUp: fc.option(
      fc.record({
        tier: fc.constantFrom('normal' as const, 'milestone' as const, 'max' as const),
        count: fc.integer({ min: 1, max: 10 }),
      }),
      { nil: null },
    ),
    hasRecords: fc.boolean(),
  });

  it('staggers a few skills at a relaxed pace', () => {
    const timeline = revealTimeline({ skillCount: 3, levelUp: null, hasRecords: false });
    expect(timeline.skillDelaysS).toEqual([0.1, 0.25, 0.4]);
    expect(timeline.barDelaysS).toEqual([0.2, 0.35, 0.5]);
  });

  it('compresses the stagger so ten skills start within the same window as four', () => {
    const four = revealTimeline({ skillCount: 4, levelUp: null, hasRecords: false });
    const ten = revealTimeline({ skillCount: 10, levelUp: null, hasRecords: false });
    expect(ten.skillDelaysS.at(-1)).toBeCloseTo(four.skillDelaysS.at(-1)!);
    expect(ten.skillDelaysS[1] - ten.skillDelaysS[0]).toBeCloseTo(0.05);
  });

  it('takes over the screen once the bars have filled, then brings in level ups, records and the loot', () => {
    const timeline = revealTimeline({ skillCount: 2, levelUp: { tier: 'normal', count: 1 }, hasRecords: true });
    expect(timeline.takeover).toEqual({ startS: 0.95, endS: 2.55 });
    expect(timeline.levelUpDelayS).toBeCloseTo(2.55);
    expect(timeline.recordsDelayS).toBeCloseTo(2.85);
    expect(timeline.lootDelayS).toBeCloseTo(3.1);
  });

  it('holds a milestone longer and level 99 longest', () => {
    const lengthOf = (tier: 'normal' | 'milestone' | 'max') => {
      const { takeover } = revealTimeline({ skillCount: 1, levelUp: { tier, count: 1 }, hasRecords: false });
      return takeover === null ? 0 : roundedS(takeover.endS - takeover.startS);
    };
    expect([lengthOf('normal'), lengthOf('milestone'), lengthOf('max')]).toEqual([1.6, 2.2, 3]);
  });

  it('gives a summary a little longer to read, however many level ups it lists', () => {
    const lengthFor = (count: number) => {
      const { takeover } = revealTimeline({ skillCount: 1, levelUp: { tier: 'normal', count }, hasRecords: false });
      return takeover === null ? 0 : roundedS(takeover.endS - takeover.startS);
    };
    expect(lengthFor(2)).toBe(2.2);
    expect(lengthFor(10)).toBe(2.2);
  });

  it('skips the beats of sections that are not shown', () => {
    const timeline = revealTimeline({ skillCount: 2, levelUp: null, hasRecords: false });
    expect(timeline.takeover).toBeNull();
    expect(timeline.levelUpDelayS).toBeNull();
    expect(timeline.recordsDelayS).toBeNull();
    expect(timeline.lootDelayS).toBeCloseTo(0.6);
  });

  it('starts the loot at once when nothing comes before it', () => {
    expect(revealTimeline({ skillCount: 0, levelUp: null, hasRecords: false }).lootDelayS).toBeCloseTo(0.1);
  });

  it('starts the takeover only after the last bar has filled', () => {
    fc.assert(
      fc.property(shapes, (shape) => {
        const timeline = revealTimeline(shape);
        if (timeline.takeover === null) return;
        for (const delay of timeline.barDelaysS)
          expect(delay + 0.6).toBeLessThanOrEqual(timeline.takeover.startS + 1e-9);
      }),
    );
  });

  it('never makes the user wait more than the cap for the takeover or the loot, whatever the skill count', () => {
    fc.assert(
      fc.property(shapes, (shape) => {
        const timeline = revealTimeline(shape);
        const { takeover } = timeline;
        if (takeover === null) expect(timeline.lootDelayS).toBeLessThanOrEqual(REVEAL_MAX_PRE_LOOT_S);
        else {
          expect(takeover.startS).toBeLessThanOrEqual(REVEAL_MAX_PRE_LOOT_S);
          expect(takeover.endS - takeover.startS).toBeLessThanOrEqual(4);
          expect(timeline.lootDelayS - takeover.endS).toBeLessThanOrEqual(REVEAL_MAX_PRE_LOOT_S);
        }
        expect(timeline.skillDelaysS).toHaveLength(shape.skillCount);
        for (const delay of [...timeline.skillDelaysS, ...timeline.barDelaysS])
          expect(delay).toBeLessThanOrEqual(timeline.lootDelayS);
      }),
    );
  });

  it('settles only after every animation has finished', () => {
    fc.assert(
      fc.property(shapes, (shape) => {
        const timeline = revealTimeline(shape);
        const lastBarEndS = Math.max(0, ...timeline.barDelaysS.map((delay) => delay + 0.6));
        expect(timeline.settledAfterMs).toBeGreaterThanOrEqual(Math.round((timeline.lootDelayS + 0.4) * 1000));
        expect(timeline.settledAfterMs).toBeGreaterThanOrEqual(Math.round(lastBarEndS * 1000));
        const settleStartS = timeline.takeover?.endS ?? 0;
        expect(timeline.settledAfterMs).toBeLessThanOrEqual(Math.round(settleStartS * 1000) + 2000);
      }),
    );
  });
});

describe('revealShape', () => {
  const summary = {
    xpBySkill: { chest: 120, arms: 0, shoulders: 40 },
    levelUps: [{ skill: 'chest', from: 4, to: 5 }],
    prs: [],
  };

  it('counts the skills that gained XP and notes the level-up cards and records', () => {
    expect(revealShape(summary)).toEqual({ skillCount: 2, levelUp: { tier: 'normal', count: 1 }, hasRecords: false });
  });

  it('has nothing to choreograph for a history-only save or a missing summary', () => {
    const empty = { skillCount: 0, levelUp: null, hasRecords: false };
    expect(revealShape({ ...summary, historyOnly: true as const })).toEqual(empty);
    expect(revealShape(null)).toEqual(empty);
  });
});

describe('levelUpCueDelayMs', () => {
  const withLevelUps = revealTimeline({ skillCount: 2, levelUp: { tier: 'milestone', count: 2 }, hasRecords: false });

  it('lands the cue on the peak of the takeover card', () => {
    expect(levelUpCueDelayMs(withLevelUps, false)).toBe(1250);
  });

  it('cues at once under reduced motion, where the level up is already on screen', () => {
    expect(levelUpCueDelayMs(withLevelUps, true)).toBe(0);
  });

  it('has no cue without a level up', () => {
    const without = revealTimeline({ skillCount: 2, levelUp: null, hasRecords: false });
    expect(levelUpCueDelayMs(without, false)).toBeNull();
    expect(levelUpCueDelayMs(without, true)).toBeNull();
  });
});

describe('reveal playback', () => {
  it('plays only for a summary that is not history only', () => {
    expect(playsReveal(null)).toBe(false);
    expect(playsReveal({ historyOnly: true })).toBe(false);
    expect(playsReveal({})).toBe(true);
  });

  it('skips on Escape anywhere and on Enter only away from links and buttons', () => {
    expect(skipsRevealOnKey({ key: 'Escape', onInteractiveElement: true })).toBe(true);
    expect(skipsRevealOnKey({ key: 'Escape', onInteractiveElement: false })).toBe(true);
    expect(skipsRevealOnKey({ key: 'Enter', onInteractiveElement: false })).toBe(true);
    expect(skipsRevealOnKey({ key: 'Enter', onInteractiveElement: true })).toBe(false);
    expect(skipsRevealOnKey({ key: 'Tab', onInteractiveElement: false })).toBe(false);
    expect(skipsRevealOnKey({ key: ' ', onInteractiveElement: false })).toBe(false);
  });
});

describe('questRevealLines', () => {
  const skills = [
    { id: 'skill-legs', key: 'legs', name: 'Legs' },
    { id: 'skill-core', key: 'core', name: 'Core' },
  ];
  const squat = 'exercise-squat';
  const quest = (id: string, name: string, steps: unknown[]) => ({
    id,
    key: id.replace('-', '_'),
    name,
    description: 'A quest.',
    quest_points: 1,
    sort_order: 1,
    retired_at: null,
    definition: { steps, rewardXp: { 'skill-legs': 800 }, requiredLevels: [], requiredQuestIds: [] },
  });
  const log = questLogFrom({
    quests: [
      quest('quest-initiation', 'X Marks the Squat', [
        { kind: 'sessions', target: 2, exerciseId: squat },
        { kind: 'volume', metric: 'reps', target: 100, exerciseId: squat },
      ]),
      quest('quest-heavy', 'The Restless Squat', [{ kind: 'record', exerciseId: squat }]),
    ],
    progress: [],
    completions: [],
    exerciseNames: { [squat]: 'Back Squat' },
  });
  const empty = { completed: [], progressed: [], unlocked: [], levelUps: [] };

  it('has nothing to show without quest news', () => {
    expect(questRevealLines({}, log, skills, 'kg')).toBeNull();
    expect(questRevealLines({ quests: empty }, log, skills, 'kg')).toBeNull();
  });

  it('describes completions with their quest points and XP in skill order', () => {
    const quests = {
      ...empty,
      completed: [
        {
          questId: 'quest-initiation',
          key: 'x_marks_the_squat',
          name: 'X Marks the Squat',
          questPoints: 1,
          xpBySkill: { 'skill-core': 200, 'skill-legs': 800 },
        },
      ],
      levelUps: [{ skill: 'legs', from: 14, to: 15 }],
    };
    expect(questRevealLines({ quests }, null, skills, 'kg')).toEqual({
      completed: [
        {
          questId: 'quest-initiation',
          text: 'Quest complete: X Marks the Squat',
          detail: '+1 quest point · +800 Legs XP, +200 Core XP',
        },
      ],
      progressed: [],
      unlocked: [],
      levelUps: [{ skillName: 'Legs', from: 14, to: 15 }],
    });
  });

  it('counts progress on the current step and names the next one', () => {
    const quests = {
      ...empty,
      progressed: [
        { questId: 'quest-initiation', stepIndex: 0, stepProgress: 1, stepTarget: 2 },
        { questId: 'quest-heavy', stepIndex: 0, stepProgress: 0, stepTarget: 1 },
      ],
    };
    expect(questRevealLines({ quests }, log, skills, 'kg')?.progressed).toEqual([
      { questId: 'quest-initiation', text: 'X Marks the Squat: step 1 of 2', detail: '1 / 2 workouts' },
      { questId: 'quest-heavy', text: 'The Restless Squat: step 1 of 1', detail: 'Set a new Back Squat record' },
    ]);
  });

  it('falls back to the bare counts when the quest list is not loaded', () => {
    const quests = { ...empty, progressed: [{ questId: 'quest-x', stepIndex: 1, stepProgress: 30, stepTarget: 100 }] };
    expect(questRevealLines({ quests }, null, skills, 'kg')?.progressed).toEqual([
      { questId: 'quest-x', text: 'A quest: step 2', detail: '30 / 100' },
    ]);
  });

  it('keeps two unnamed quests on the same step apart by their quest ids', () => {
    const quests = {
      ...empty,
      progressed: [
        { questId: 'quest-x', stepIndex: 0, stepProgress: 1, stepTarget: 3 },
        { questId: 'quest-y', stepIndex: 0, stepProgress: 1, stepTarget: 3 },
      ],
    };
    const lines = questRevealLines({ quests }, null, skills, 'kg')?.progressed ?? [];
    expect(lines.map((line) => line.text)).toEqual(['A quest: step 1', 'A quest: step 1']);
    expect(lines.map((line) => line.questId)).toEqual(['quest-x', 'quest-y']);
  });

  it('names newly available quests', () => {
    const quests = { ...empty, unlocked: ['quest-heavy', 'quest-unknown'] };
    expect(questRevealLines({ quests }, log, skills, 'kg')?.unlocked).toEqual([
      'New quest available: The Restless Squat',
      'New quest available: a new quest',
    ]);
  });
});

describe('XP to the next level under a reveal bar', () => {
  it('counts the XP left from 0 XP to level 2 at 80 XP: "80 XP to level 2"', () => {
    expect(xpToNextLevelText(0)).toBe('80 XP to level 2');
  });

  it('rounds partial XP up, so 80.4 XP (level 2) reads 167 - 80.4 = 86.6 → "87 XP to level 3"', () => {
    expect(xpToNextLevelText(80.4)).toBe('87 XP to level 3');
  });

  it('groups thousands: 500,000 XP (level 89) needs 534,888 - 500,000 = "34,888 XP to level 90"', () => {
    expect(xpToNextLevelText(500_000)).toBe('34,888 XP to level 90');
  });

  it('reads "Max level" at level 99 (998,458 XP)', () => {
    expect(xpToNextLevelText(998_458)).toBe('Max level');
  });

  it('names the bar with the skill, the share of the level and the XP to go: 48 of 80 XP is 60%', () => {
    expect(gainBarLabel('Strength', 48)).toBe('Strength: 60% of the way to level 2, 32 XP to go');
  });

  it('names a maxed bar "Max level"', () => {
    expect(gainBarLabel('Strength', 998_458)).toBe('Strength: Max level');
  });
});
