import { describe, expect, it } from 'vitest';
import { lookAlikeStages, smallestSetCount } from '@domain/program-day.ts';
import {
  amrapBandAmount,
  areAmrapBandsRising,
  pctOfSlotTarget,
  rpeLoadPct,
  smallestNumber,
} from '@domain/program-eval.ts';
import { initialProgramState } from '@domain/program-state.ts';
import {
  type NumberExpr,
  type PctOfSlotLoad,
  type SlotDecl,
  type StageDecl,
  type StageScheme,
} from '@domain/program-types.ts';
import { isRepCountOnRpeChart } from '@domain/rpe-chart.ts';
import { type UnitAmount } from '@domain/units.ts';
import { FIVE_THREE_ONE } from './program-fixtures/five_three_one.ts';
import { resolveAt } from './program-fixtures/follow.ts';
import { FULL_PRIMITIVES } from './program-fixtures/full_primitives.ts';
import { GZCLP, gzclpEnrollment } from './program-fixtures/gzclp.ts';
import { JUGGERNAUT_2 } from './program-fixtures/juggernaut_2.ts';
import { broken, slotIn } from './program-fixtures/prescription-helpers.ts';
import { STAGED_WEEKLY } from './program-fixtures/review-fixtures.ts';
import { TEXAS_METHOD } from './program-fixtures/texas_method.ts';

describe('pctOfSlotTarget is the one lookup of the day and slot a pctOfSlot load reads', () => {
  const load: PctOfSlotLoad = { kind: 'pctOfSlot', day: 'mon', slot: 'mon-squat', idx: 0, pct: 0.8 };

  it('finds the slot on the named day', () => {
    expect(pctOfSlotTarget(TEXAS_METHOD, load)).toEqual({ kind: 'slot', slot: slotIn(TEXAS_METHOD, 'mon-squat') });
  });

  it('names an unknown day', () => {
    expect(pctOfSlotTarget(TEXAS_METHOD, { ...load, day: 'sun' })).toEqual({ kind: 'unknownDay' });
  });

  it('names a slot that sits on another day', () => {
    expect(pctOfSlotTarget(TEXAS_METHOD, { ...load, day: 'wed' })).toEqual({ kind: 'slotNotOnDay' });
  });

  it('has no target on a rotation schedule, which has no current week', () => {
    const onRotation: PctOfSlotLoad = { kind: 'pctOfSlot', day: 'a1', slot: 'a1-squat-t1', idx: 0, pct: 0.8 };
    expect(pctOfSlotTarget(GZCLP, onRotation)).toEqual({ kind: 'noCurrentWeek' });
  });
});

describe('the load resolver agrees with the validator on pctOfSlot', () => {
  it('answers unsupported on a rotation schedule instead of resolving at week 1', () => {
    const definition = broken(GZCLP, (copy) => {
      const scheme = slotIn(copy, 'a1-bench-t2').scheme;
      if (scheme.kind === 'stages') {
        scheme.load = { kind: 'pctOfSlot', day: 'a1', slot: 'a1-squat-t1', idx: 0, pct: 0.8 };
      }
    });
    const enrollment = gzclpEnrollment();

    const resolved = resolveAt(definition, enrollment, initialProgramState(definition, enrollment), { index: 0 });

    expect(resolved.find((slot) => slot.slotId === 'a1-bench-t2')).toMatchObject({
      kind: 'unsupported',
      primitive: 'pctOfSlot',
    });
    expect(resolved.find((slot) => slot.slotId === 'a1-squat-t1')?.kind).toBe('exercise');
  });
});

describe('rpeLoadPct decides whether an rpeLoad is on the RPE chart', () => {
  it('gives the chart share for 3 reps @ RPE 8', () => {
    expect(rpeLoadPct({ kind: 'rpeLoad', reps: 3, rpe: 8, of: 'e1rm' })).toBe(0.863);
  });

  it.each([
    [7, 8],
    [3, 6.5],
    [2.5, 8],
  ])('gives nothing for %d reps @ RPE %d', (reps, rpe) => {
    expect(rpeLoadPct({ kind: 'rpeLoad', reps, rpe, of: 'e1rm' })).toBeNull();
  });
});

describe('isRepCountOnRpeChart', () => {
  it.each([1, 3, 6])('%d reps is on the chart', (reps) => {
    expect(isRepCountOnRpeChart(reps)).toBe(true);
  });

  it.each([0, 7, 2.5])('%d reps is off the chart', (reps) => {
    expect(isRepCountOnRpeChart(reps)).toBe(false);
  });
});

describe('smallestNumber is the smallest value a number expression can take', () => {
  it.each([
    ['a literal', 4, 4],
    ['a byCycle table', { byCycle: [5, 3, 4] }, 3],
    ['a choice option', { option: 'tmPct' }, 0.85],
    ['a number option', { option: 'deloadPct' }, 0.05],
  ] as [string, NumberExpr, number][])('%s', (_name, expr, smallest) => {
    expect(smallestNumber(FULL_PRIMITIVES, expr)).toBe(smallest);
  });

  it.each([
    ['an empty byCycle table', { byCycle: [] }],
    ['an undeclared option', { option: 'missing' }],
    ['an option with text values', { option: 'perRep' }],
  ] as [string, NumberExpr][])('is unknown for %s', (_name, expr) => {
    expect(smallestNumber(FULL_PRIMITIVES, expr)).toBeNull();
  });
});

describe('smallestSetCount is the fewest sets a slot can prescribe', () => {
  it('a set list has its length', () => {
    expect(smallestSetCount(FULL_PRIMITIVES, slotIn(FULL_PRIMITIVES, 'basic-pct'))).toBe(3);
  });

  it('a repeat with a literal count has that count', () => {
    expect(smallestSetCount(FULL_PRIMITIVES, slotIn(FULL_PRIMITIVES, 'advanced-add-on'))).toBe(6);
  });

  it('a repeat counted by an option has the smallest value the option can take', () => {
    const definition = broken(FULL_PRIMITIVES, (copy) => {
      copy.options.push({ key: 'backoffSets', kind: 'choice', values: [5, 3, 4], default: 5, source: ['synthetic'] });
      const scheme = slotIn(copy, 'advanced-backoff').scheme;
      if (scheme.kind === 'repeat') scheme.count = { option: 'backoffSets' };
    });
    expect(smallestSetCount(definition, slotIn(definition, 'advanced-backoff'))).toBe(3);
  });

  it('a week table has its shortest row (the 1-set Juggernaut realization week)', () => {
    const tableSlot = JUGGERNAUT_2.schedule.days[0].slots[0];
    expect(tableSlot.scheme.kind).toBe('weekTable');
    expect(smallestSetCount(JUGGERNAUT_2, tableSlot)).toBe(1);
  });

  it('stages have the smallest stage (5×3 of 5×3, 6×2, 10×1)', () => {
    expect(smallestSetCount(STAGED_WEEKLY, slotIn(STAGED_WEEKLY, 'a-bench'))).toBe(5);
  });

  it.each([
    [
      'an unknown week table',
      (slot: SlotDecl) => {
        slot.scheme = { kind: 'weekTable', table: 'missing', of: 'tm' };
      },
    ],
    [
      'no stages',
      (slot: SlotDecl) => {
        slot.scheme = { kind: 'stages', stages: [], load: { kind: 'pct', pct: 1, of: 'tm' } };
      },
    ],
    [
      'a count read from an undeclared option',
      (slot: SlotDecl) => {
        slot.scheme = { kind: 'repeat', count: { option: 'missing' }, reps: 5, load: { kind: 'lastLogged' } };
      },
    ],
  ])('is unknown for %s', (_name, mutate) => {
    const definition = broken(FIVE_THREE_ONE, (copy) => mutate(copy.schedule.days[0].slots[0]));
    expect(smallestSetCount(definition, definition.schedule.days[0].slots[0])).toBeNull();
  });
});

describe('amrapTable bands', () => {
  const bands: [number, UnitAmount][] = [
    [0, { kg: 0, lb: 0 }],
    [2, { kg: 2.5, lb: 5 }],
    [4, { kg: 5, lb: 10 }],
  ];

  it.each([
    [0, { kg: 0, lb: 0 }],
    [3, { kg: 2.5, lb: 5 }],
    [4, { kg: 5, lb: 10 }],
    [12, { kg: 5, lb: 10 }],
  ])('%d reps reads the last band it reaches', (reps, amount) => {
    expect(amrapBandAmount(bands, reps)).toEqual(amount);
  });

  it('reads no band below the first one or with no logged set', () => {
    expect(amrapBandAmount(bands.slice(1), 1)).toBeUndefined();
    expect(amrapBandAmount(bands, undefined)).toBeUndefined();
  });

  it('rise when every minReps is above the one before', () => {
    expect(areAmrapBandsRising(bands)).toBe(true);
    expect(areAmrapBandsRising([])).toBe(true);
  });

  it.each([
    ['descending', [0, 4, 2]],
    ['repeated', [0, 2, 2]],
  ])('do not rise when %s', (_name, minReps) => {
    expect(areAmrapBandsRising(minReps.map((reps) => [reps, { kg: reps, lb: reps }]))).toBe(false);
  });
});

describe('lookAlikeStages names the stages a fully logged day cannot tell apart', () => {
  function stagesOf(...stages: StageDecl[]): StageScheme {
    return { kind: 'stages', stages, load: { kind: 'pct', pct: 1, of: 'workingWeight' } };
  }

  it('none for GZCLP 5×3+, 6×2+, 10×1+', () => {
    expect(
      lookAlikeStages(
        stagesOf(
          { sets: 5, reps: 3, amrapLast: true },
          { sets: 6, reps: 2, amrapLast: true },
          { sets: 10, reps: 1, amrapLast: true },
        ),
      ),
    ).toEqual([]);
  });

  it('3×5 and 5×5: every set of a 3×5 day is also a set of 5×5', () => {
    expect(
      lookAlikeStages(stagesOf({ sets: 3, reps: 5, amrapLast: false }, { sets: 5, reps: 5, amrapLast: false })),
    ).toEqual([[0, 1]]);
  });

  it('5×5 and 3×5 in the other order', () => {
    expect(
      lookAlikeStages(stagesOf({ sets: 5, reps: 5, amrapLast: false }, { sets: 3, reps: 5, amrapLast: false })),
    ).toEqual([[0, 1]]);
  });

  it('two identical stages, with a different one between them', () => {
    expect(
      lookAlikeStages(
        stagesOf(
          { sets: 5, reps: 3, amrapLast: true },
          { sets: 6, reps: 2, amrapLast: true },
          { sets: 5, reps: 3, amrapLast: true },
        ),
      ),
    ).toEqual([[0, 2]]);
  });

  it('3×5 and 5×5 with an AMRAP last set: the AMRAP sits at another index, so a full day matches one stage', () => {
    expect(
      lookAlikeStages(stagesOf({ sets: 3, reps: 5, amrapLast: true }, { sets: 5, reps: 5, amrapLast: true })),
    ).toEqual([]);
  });

  it('3×5 and 3×5+: the last set differs by its AMRAP flag', () => {
    expect(
      lookAlikeStages(stagesOf({ sets: 3, reps: 5, amrapLast: false }, { sets: 3, reps: 5, amrapLast: true })),
    ).toEqual([]);
  });

  it('3×5 and 4×5+: the plain stage is the start of the AMRAP one', () => {
    expect(
      lookAlikeStages(stagesOf({ sets: 3, reps: 5, amrapLast: false }, { sets: 4, reps: 5, amrapLast: true })),
    ).toEqual([[0, 1]]);
  });
});
