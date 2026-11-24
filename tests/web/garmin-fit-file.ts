import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type ActivityMesg,
  Encoder,
  type FileIdMesg,
  type LapMesg,
  Profile,
  type SessionMesg,
  type WorkoutMesg,
  type WorkoutStepMesg,
} from '@garmin/fitsdk';

type FitSport = NonNullable<SessionMesg['sport']>;
type FitSubSport = NonNullable<SessionMesg['subSport']>;
type FitIntensity = NonNullable<WorkoutStepMesg['intensity']>;

export type FitWorkoutStepSpec =
  { intensity: FitIntensity; durationS?: number } | { repeatFromStep: number; times: number };

export interface FitLapSpec {
  durationS: number;
  workoutStepIndex?: number;
  intensity?: FitIntensity;
}

export interface FitActivitySpec {
  startedAt: string;
  sport: FitSport;
  subSport?: FitSubSport;
  timerS: number;
  elapsedS?: number;
  distanceM?: number;
  workoutSteps?: FitWorkoutStepSpec[];
  laps?: FitLapSpec[];
}

const MS_PER_SECOND = 1000;

function workoutStepMessage(step: FitWorkoutStepSpec, messageIndex: number): WorkoutStepMesg {
  if ('repeatFromStep' in step) {
    return {
      messageIndex,
      durationType: 'repeatUntilStepsCmplt',
      durationValue: step.repeatFromStep,
      targetValue: step.times,
    };
  }
  if (step.durationS === undefined) return { messageIndex, durationType: 'open', intensity: step.intensity };
  return {
    messageIndex,
    durationType: 'time',
    durationValue: step.durationS * MS_PER_SECOND,
    intensity: step.intensity,
  };
}

export function encodeFitActivity(spec: FitActivitySpec): Uint8Array {
  const start = new Date(spec.startedAt);
  const elapsedS = spec.elapsedS ?? spec.timerS;
  const end = new Date(start.getTime() + elapsedS * MS_PER_SECOND);
  const laps = spec.laps ?? [{ durationS: spec.timerS }];
  const workoutSteps = spec.workoutSteps ?? [];
  const encoder = new Encoder();

  const fileId: FileIdMesg = {
    type: 'activity',
    manufacturer: 'development',
    product: 1,
    serialNumber: 1,
    timeCreated: start,
  };
  encoder.onMesg(Profile.MesgNum.FILE_ID, fileId);
  if (workoutSteps.length > 0) {
    const workout: WorkoutMesg = { sport: spec.sport, numValidSteps: workoutSteps.length };
    encoder.onMesg(Profile.MesgNum.WORKOUT, workout);
  }
  workoutSteps.forEach((step, messageIndex) => {
    encoder.onMesg(Profile.MesgNum.WORKOUT_STEP, workoutStepMessage(step, messageIndex));
  });

  let lapStartMs = start.getTime();
  for (const lap of laps) {
    const lapEndMs = lapStartMs + lap.durationS * MS_PER_SECOND;
    const lapMessage: LapMesg = {
      timestamp: new Date(lapEndMs),
      startTime: new Date(lapStartMs),
      totalElapsedTime: lap.durationS,
      totalTimerTime: lap.durationS,
      intensity: lap.intensity ?? 'active',
      wktStepIndex: lap.workoutStepIndex,
    };
    encoder.onMesg(Profile.MesgNum.LAP, lapMessage);
    lapStartMs = lapEndMs;
  }

  const session: SessionMesg = {
    timestamp: end,
    startTime: start,
    totalElapsedTime: elapsedS,
    totalTimerTime: spec.timerS,
    totalDistance: spec.distanceM,
    sport: spec.sport,
    subSport: spec.subSport ?? 'generic',
    firstLapIndex: 0,
    numLaps: laps.length,
  };
  encoder.onMesg(Profile.MesgNum.SESSION, session);
  const activity: ActivityMesg = { timestamp: end, numSessions: 1, totalTimerTime: spec.timerS };
  encoder.onMesg(Profile.MesgNum.ACTIVITY, activity);
  return encoder.close();
}

export function writeFitActivity(fileName: string, spec: FitActivitySpec): string {
  const path = join(mkdtempSync(join(tmpdir(), 'gainscape-fit-')), fileName);
  writeFileSync(path, encodeFitActivity(spec));
  return path;
}
