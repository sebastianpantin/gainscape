import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { garminImportCandidate } from '@domain/index.ts';
import { fitActivitiesOf } from '../../web/src/lib/garmin/fit-file.ts';
import { encodeFitActivity, type FitActivitySpec, writeFitActivity } from './garmin-fit-file.ts';

const NOW = Date.parse('2026-11-24T12:00:00.000Z');
const STARTED_AT = '2026-11-23T06:30:05.000Z';

function bufferOf(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function activitiesOfGeneratedFile(spec: FitActivitySpec) {
  return await fitActivitiesOf(bufferOf(readFileSync(writeFitActivity('activity.fit', spec))));
}

describe('fitActivitiesOf', () => {
  it('reads a treadmill run: type, start, timer time without pauses and distance', async () => {
    expect(
      await activitiesOfGeneratedFile({
        startedAt: STARTED_AT,
        sport: 'running',
        subSport: 'treadmill',
        timerS: 1800,
        elapsedS: 1925,
        distanceM: 5012.4,
      }),
    ).toEqual([
      {
        type: 'treadmill_running',
        startedAt: STARTED_AT,
        durationS: 1800,
        distanceM: 5012.4,
        laps: [{ workoutStepIndex: null, durationS: 1800 }],
        workoutSteps: [],
      },
    ]);
  });

  it('reads an indoor ride without distance', async () => {
    const [ride] = await activitiesOfGeneratedFile({
      startedAt: STARTED_AT,
      sport: 'cycling',
      subSport: 'indoorCycling',
      timerS: 2700,
    });
    expect(ride).toMatchObject({ type: 'indoor_cycling', durationS: 2700, distanceM: null });
  });

  it('reads a pool swim with its distance', async () => {
    const [swim] = await activitiesOfGeneratedFile({
      startedAt: STARTED_AT,
      sport: 'swimming',
      subSport: 'lapSwimming',
      timerS: 840,
      distanceM: 457.2,
    });
    expect(swim).toMatchObject({ type: 'lap_swimming', durationS: 840, distanceM: 457.2 });
  });

  it('reads a strength activity and an activity Gainscape maps to no exercise by their Garmin type', async () => {
    const [strength] = await activitiesOfGeneratedFile({
      startedAt: STARTED_AT,
      sport: 'training',
      subSport: 'strengthTraining',
      timerS: 3000,
    });
    const [surf] = await activitiesOfGeneratedFile({ startedAt: STARTED_AT, sport: 'surfing', timerS: 3000 });
    expect(strength.type).toBe('strength_training');
    expect(surf.type).toBe('surfing');
  });

  it('reads a structured workout so the mapping fills the interval', async () => {
    const [run] = await activitiesOfGeneratedFile({
      startedAt: STARTED_AT,
      sport: 'running',
      timerS: 860,
      distanceM: 2500,
      workoutSteps: [
        { intensity: 'warmup' },
        { intensity: 'active', durationS: 60 },
        { intensity: 'rest', durationS: 30 },
        { repeatFromStep: 1, times: 4 },
        { intensity: 'cooldown' },
      ],
      laps: [
        { durationS: 300, workoutStepIndex: 0 },
        { durationS: 60, workoutStepIndex: 1 },
        { durationS: 30, workoutStepIndex: 2 },
        { durationS: 60, workoutStepIndex: 1 },
        { durationS: 30, workoutStepIndex: 2 },
        { durationS: 60, workoutStepIndex: 1 },
        { durationS: 30, workoutStepIndex: 2 },
        { durationS: 60, workoutStepIndex: 1 },
        { durationS: 30, workoutStepIndex: 2 },
        { durationS: 200, workoutStepIndex: 4 },
      ],
    });
    expect(run.workoutSteps).toEqual([
      { intensity: 'warmup', durationS: null },
      { intensity: 'active', durationS: 60 },
      { intensity: 'rest', durationS: 30 },
      { intensity: null, durationS: null },
      { intensity: 'cooldown', durationS: null },
    ]);
    expect(run.laps.map((lap) => lap.workoutStepIndex)).toEqual([0, 1, 2, 1, 2, 1, 2, 1, 2, 4]);
    expect(run.laps.map((lap) => lap.durationS)).toEqual([300, 60, 30, 60, 30, 60, 30, 60, 30, 200]);
    expect(garminImportCandidate(run, new Map([['running', 'exercise-running']]), NOW)).toMatchObject({
      startedAt: STARTED_AT,
      exerciseId: 'exercise-running',
      durationS: 860,
      distanceM: 2500,
      interval: { workS: 60, restS: 30, rounds: 4 },
      status: 'importable',
    });
  });

  it('reads a corrupt file as no activities', async () => {
    const bytes = encodeFitActivity({ startedAt: STARTED_AT, sport: 'running', timerS: 1800, distanceM: 5000 });
    const flipped = bytes.slice();
    const middle = Math.floor(flipped.length / 2);
    flipped[middle] = flipped[middle] ^ 0xff;
    expect(await fitActivitiesOf(bufferOf(flipped))).toEqual([]);
    expect(await fitActivitiesOf(bufferOf(bytes.slice(0, bytes.length - 20)))).toEqual([]);
  });

  it('reads a file that is no FIT file as no activities', async () => {
    expect(await fitActivitiesOf(bufferOf(new TextEncoder().encode('date,type,distance\n2026-11-23,run,5')))).toEqual(
      [],
    );
    expect(await fitActivitiesOf(new ArrayBuffer(0))).toEqual([]);
  });
});
