import { describe, expect, it } from 'vitest';
import type { CardioExercise, Exercise, LiftExercise } from '../../web/src/lib/exercises/catalog-rules.ts';
import {
  nextRecordTimelineCursor,
  recentRecords,
  recordTimelineMonths,
  type RecordTimelineRow,
  recordTimelineRowsSchema,
} from '../../web/src/lib/stats/pr-timeline-rules.ts';

const base = { equipment: 'barbell', custom: false, archived: false, skillShares: [] };
const bench: LiftExercise = { ...base, id: 'bench', name: 'Bench Press', modality: 'lift', loadType: 'external' };
const pullUp: LiftExercise = { ...base, id: 'pull-up', name: 'Pull-up', modality: 'lift', loadType: 'bodyweight' };
const run: CardioExercise = {
  ...base,
  id: 'run',
  name: 'Running',
  modality: 'cardio',
  activity: { paceUnit: 'per_km', referencePaceSPerKm: null, maxEffort: 'max', tracksDistance: true, shares: [] },
};
const exercisesById = new Map<string, Exercise>([bench, pullUp, run].map((exercise) => [exercise.id, exercise]));

const benchMax = {
  kind: 'rep_max' as const,
  exerciseId: 'bench',
  setId: 'set-1',
  reps: 1,
  loadKg: 100,
  previousLoadKg: 95,
  previousReps: null,
};
const pullUpReps = {
  kind: 'bodyweight_reps' as const,
  exerciseId: 'pull-up',
  setId: 'set-2',
  reps: 12,
  loadKg: null,
  previousLoadKg: null,
  previousReps: 10,
};
const runDistance = {
  kind: 'cardio' as const,
  exerciseId: 'run',
  setId: 'bout-1',
  records: [{ kind: 'distance' as const, value: 5000, previous: null }],
};

function row(sessionId: string, localDate: string, record: RecordTimelineRow['record']): RecordTimelineRow {
  return { session_id: sessionId, started_at: `${localDate}T08:00:00+00:00`, local_date: localDate, record };
}

const timeline = [
  row('s3', '2026-10-06', runDistance),
  row('s2', '2026-10-02', benchMax),
  row('s2', '2026-10-02', pullUpReps),
  row('s1', '2026-09-28', { ...benchMax, loadKg: 95, previousLoadKg: null }),
];

describe('recordTimelineRowsSchema', () => {
  it('reads the rows the RPC sends and refuses a record without a kind', () => {
    expect(recordTimelineRowsSchema.parse(timeline)).toEqual(timeline);
    expect(recordTimelineRowsSchema.safeParse([{ ...timeline[0], record: { exerciseId: 'run' } }]).success).toBe(false);
  });
});

describe('recentRecords', () => {
  it('describes the newest records in the unit of the user and links each to its workout', () => {
    expect(recentRecords(timeline, exercisesById, 'kg', 3)).toEqual([
      { key: 's3:0', sessionId: 's3', dateText: 'Tue, 6 Oct 2026', text: 'Running: 5 km (first)' },
      { key: 's2:0', sessionId: 's2', dateText: 'Fri, 2 Oct 2026', text: 'Bench Press: 1RM 100 kg (was 95 kg)' },
      { key: 's2:1', sessionId: 's2', dateText: 'Fri, 2 Oct 2026', text: 'Pull-up: 12 reps (was 10)' },
    ]);
  });

  it('shows loads in pounds for a pounds user and names an exercise it no longer knows', () => {
    expect(recentRecords(timeline.slice(1, 2), exercisesById, 'lb', 5)[0]?.text).toBe(
      'Bench Press: 1RM 220.5 lb (was 209.4 lb)',
    );
    expect(recentRecords(timeline.slice(1, 2), new Map(), 'kg', 5)[0]?.text).toBe('Exercise: 1RM 100 kg (was 95 kg)');
  });
});

describe('recordTimelineMonths', () => {
  it('groups the records by the month of their workout, newest first', () => {
    const months = recordTimelineMonths(timeline, exercisesById, 'kg');
    expect(months.map(({ month, title, records }) => [month, title, records.map((record) => record.key)])).toEqual([
      ['2026-10', 'October 2026', ['s3:0', 's2:0', 's2:1']],
      ['2026-09', 'September 2026', ['s1:0']],
    ]);
    expect(months[1]?.records[0]?.text).toBe('Bench Press: 1RM 95 kg (first record)');
  });

  it('has no months without records', () => {
    expect(recordTimelineMonths([], exercisesById, 'kg')).toEqual([]);
  });
});

describe('nextRecordTimelineCursor', () => {
  it('continues after the last workout of a full page', () => {
    expect(nextRecordTimelineCursor(timeline, 3)).toEqual({ startedAt: '2026-09-28T08:00:00+00:00', sessionId: 's1' });
  });

  it('stops after a page with fewer workouts than asked for', () => {
    expect(nextRecordTimelineCursor(timeline, 4)).toBeUndefined();
    expect(nextRecordTimelineCursor([], 4)).toBeUndefined();
  });
});
