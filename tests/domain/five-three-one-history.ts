import { type EffortInput, type LiftSetInput, type SessionInput } from '@domain/index.ts';
import { easy, hard, moderate, nearFailure } from './fixtures.ts';

const rir = (value: number) => ({ type: 'rir', value }) as const;

type SetLine = [exerciseId: string, weightKg: number, reps: number, effort: EffortInput, isWarmup?: boolean];

function session(id: string, startedAt: string, lines: readonly SetLine[]): SessionInput {
  return {
    id,
    startedAt,
    sets: lines.map(([exerciseId, weightKg, reps, effort, isWarmup = false], index): LiftSetInput => ({
      id: `${id}-set-${index + 1}`,
      exerciseId,
      position: index + 1,
      weightKg,
      reps,
      isWarmup,
      effort,
    })),
  };
}

const warmups = (exerciseId: string, loads: readonly number[]): SetLine[] =>
  loads.map((weightKg) => [exerciseId, weightKg, 5, easy, true]);

export const fiveThreeOneHistory: readonly SessionInput[] = [
  session('w1-squat', '2026-09-07T17:00:00.000Z', [
    ...warmups('squat', [40, 50, 60]),
    ['squat', 70, 5, moderate],
    ['squat', 80, 5, hard],
    ['squat', 90, 7, nearFailure],
  ]),
  session('w1-bench', '2026-09-09T17:00:00.000Z', [
    ...warmups('bench', [30, 37.5, 45]),
    ['bench', 50, 5, moderate],
    ['bench', 57.5, 5, hard],
    ['bench', 65, 8, nearFailure],
  ]),
  session('w1-fsl', '2026-09-11T17:00:00.000Z', [
    ['squat', 70, 5, null],
    ['squat', 70, 5, null],
    ['squat', 70, 5, null],
    ['bench', 50, 5, null],
    ['bench', 50, 5, null],
    ['bench', 50, 5, null],
  ]),
  session('w2-squat', '2026-09-14T17:00:00.000Z', [
    ...warmups('squat', [40, 50, 60]),
    ['squat', 75, 3, easy],
    ['squat', 85, 5, moderate],
    ['squat', 95, 5, moderate],
  ]),
  session('w2-bench', '2026-09-16T17:00:00.000Z', [
    ...warmups('bench', [30, 37.5, 45]),
    ['bench', 52.5, 3, rir(5)],
    ['bench', 60, 5, rir(4)],
    ['bench', 67.5, 6, rir(1)],
  ]),
  session('w2-fsl', '2026-09-18T17:00:00.000Z', [
    ['squat', 75, 5, easy],
    ['squat', 75, 5, easy],
    ['squat', 75, 5, easy],
    ['bench', 52.5, 5, easy],
    ['bench', 52.5, 5, easy],
    ['bench', 52.5, 5, easy],
  ]),
];
