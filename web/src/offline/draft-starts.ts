import {
  type ChallengeDefinition,
  e1rmAtSessionStart,
  loadTargetKg,
  type Position,
  type PrescribedExercise,
  type RoundingSetting,
  type StrengthState,
  type WeightUnit,
} from '@domain/index.ts';
import type { LoadType } from '../lib/exercises/catalog-rules.ts';
import { type CatalogChallenge, challengeLoadKg } from '../lib/collection/challenge-rules.ts';
import { defaultWeightKg, STARTING_REPS } from '../lib/workout/exercise-edit-rules.ts';
import { type LastLoggedSet } from './draft-edits.ts';
import { type DraftExercise, type LiftDraftExercise, withValidSupersets, type WorkoutDraft } from './draft-format.ts';

const CHALLENGE_REPS_PER_SET = 10;

export function startDraft(): WorkoutDraft {
  return {
    sessionId: crypto.randomUUID(),
    startedAt: new Date().toISOString(),
    finishedAt: null,
    programDayId: null,
    programLabel: null,
    program: null,
    challenge: null,
    exercises: [],
  };
}

export type PlannedProgression =
  { kind: 'none' } | { kind: 'fixed' } | { kind: 'linear'; incrementKg: number; incrementLb: number };

export type ProgressionKind = PlannedProgression['kind'];

export interface PlannedExercise {
  exerciseId: string;
  targetSets: number;
  targetRepsMin: number;
  targetRepsMax: number;
  progression: PlannedProgression;
}

interface StartableDay {
  id: string;
  name: string;
  programName: string;
  exercises: PlannedExercise[];
}

export type CatalogEntry = { name: string; archived: boolean } & (
  { modality?: 'lift'; loadType: LoadType; equipment?: string } | { modality: 'cardio' }
);

export function programLabelFor(programName: string, dayName: string): string {
  return `${programName} — ${dayName}`;
}

type LiftCatalogEntry = Extract<CatalogEntry, { loadType: LoadType }>;

function liftDraftExercises<Entry extends { exerciseId: string }>(
  entries: readonly Entry[],
  exercisesById: ReadonlyMap<string, CatalogEntry>,
  targetAndSets: (
    entry: Entry,
    exercise: LiftCatalogEntry,
  ) => Pick<LiftDraftExercise, 'target' | 'sets' | 'supersetId'>,
): { exercises: DraftExercise[]; skippedExerciseIds: string[] } {
  const skippedExerciseIds: string[] = [];
  const exercises = entries.flatMap((entry): DraftExercise[] => {
    const exercise = exercisesById.get(entry.exerciseId);
    if (!exercise || exercise.modality === 'cardio') {
      skippedExerciseIds.push(entry.exerciseId);
      return [];
    }
    return [
      {
        clientId: crypto.randomUUID(),
        exerciseId: entry.exerciseId,
        name: exercise.archived ? `${exercise.name} (archived)` : exercise.name,
        modality: 'lift',
        loadType: exercise.loadType,
        ...targetAndSets(entry, exercise),
      },
    ];
  });
  return { exercises, skippedExerciseIds };
}

export function startDraftFromDay(
  day: StartableDay,
  exercisesById: ReadonlyMap<string, CatalogEntry>,
  lastSets: ReadonlyMap<string, LastLoggedSet>,
  now: Date,
): { draft: WorkoutDraft; skippedExerciseIds: string[] } {
  const { exercises, skippedExerciseIds } = liftDraftExercises(day.exercises, exercisesById, (planned, exercise) => {
    const last = lastSets.get(planned.exerciseId);
    const weightKg = exercise.loadType === 'bodyweight' ? 0 : (last?.weightKg ?? defaultWeightKg(exercise.loadType));
    return {
      target: { sets: planned.targetSets, repsMin: planned.targetRepsMin, repsMax: planned.targetRepsMax },
      sets: Array.from({ length: planned.targetSets }, () => ({
        id: crypto.randomUUID(),
        weightKg,
        reps: planned.targetRepsMin,
        effort: null,
        done: false,
        isWarmup: false,
      })),
    };
  });
  return {
    draft: {
      sessionId: crypto.randomUUID(),
      startedAt: now.toISOString(),
      finishedAt: null,
      programDayId: day.id,
      programLabel: programLabelFor(day.programName, day.name),
      program: null,
      challenge: null,
      exercises,
    },
    skippedExerciseIds,
  };
}

export interface PrescribedDayStart {
  enrollmentId: string;
  templateKey: string;
  programName: string;
  dayName: string;
  position: Position;
  exercises: readonly PrescribedExercise[];
}

export function startDraftFromPrescription(
  day: PrescribedDayStart,
  exercisesById: ReadonlyMap<string, CatalogEntry>,
  now: Date,
): { draft: WorkoutDraft; skippedExerciseIds: string[] } {
  const { exercises, skippedExerciseIds } = liftDraftExercises(
    day.exercises,
    exercisesById,
    (prescribed, exercise) => ({
      target: null,
      sets: prescribed.sets.map((set) => ({
        id: crypto.randomUUID(),
        weightKg: set.weightKg ?? set.suggestedWeightKg ?? defaultWeightKg(exercise.loadType),
        reps: set.reps ?? STARTING_REPS,
        effort: null,
        done: false,
        isWarmup: false,
        prescription: set.snapshot,
        prescriptionDetail: { pct: set.pct, optional: set.optional },
      })),
    }),
  );
  return {
    draft: {
      sessionId: crypto.randomUUID(),
      startedAt: now.toISOString(),
      finishedAt: null,
      programDayId: null,
      programLabel: programLabelFor(day.programName, day.dayName),
      program: { enrollmentId: day.enrollmentId, position: day.position, templateKey: day.templateKey },
      challenge: null,
      exercises,
    },
    skippedExerciseIds,
  };
}

interface PlannedChallengeExercise {
  exerciseId: string;
  sets: number;
  reps: number;
  pct: number | null;
  supersetId: string | null;
}

function plannedChallengeExercises(definition: ChallengeDefinition): PlannedChallengeExercise[] {
  if (definition.kind === 'prescription') {
    return definition.groups.flatMap((group) => {
      const supersetId = group.exercises.length > 1 ? crypto.randomUUID() : null;
      return group.exercises.map(({ exerciseId, reps, pct }) => ({
        exerciseId,
        sets: group.rounds,
        reps,
        pct,
        supersetId,
      }));
    });
  }
  if (definition.metric !== 'reps' || definition.exerciseId === null) return [];
  return [
    {
      exerciseId: definition.exerciseId,
      sets: Math.ceil(definition.target / CHALLENGE_REPS_PER_SET),
      reps: CHALLENGE_REPS_PER_SET,
      pct: definition.minPct,
      supersetId: null,
    },
  ];
}

export function startDraftFromChallenge(
  challenge: CatalogChallenge,
  exercisesById: ReadonlyMap<string, CatalogEntry>,
  strength: StrengthState,
  rounding: RoundingSetting,
  unit: WeightUnit,
  now: Date,
): { draft: WorkoutDraft; skippedExerciseIds: string[] } {
  const targetLoadsKg: Record<string, number | null> = {};
  const { exercises, skippedExerciseIds } = liftDraftExercises(
    plannedChallengeExercises(challenge.definition),
    exercisesById,
    (planned, exercise) => {
      const target =
        planned.pct === null ? null : loadTargetKg(planned.pct, e1rmAtSessionStart(strength, planned.exerciseId));
      const weightKg =
        target === null || exercise.loadType !== 'external'
          ? defaultWeightKg(exercise.loadType)
          : challengeLoadKg(target, rounding, unit, (exercise.equipment ?? 'barbell') === 'barbell');
      targetLoadsKg[planned.exerciseId] = planned.pct === null ? null : weightKg;
      return {
        target: null,
        supersetId: planned.supersetId,
        sets: Array.from({ length: planned.sets }, () => ({
          id: crypto.randomUUID(),
          weightKg,
          reps: planned.reps,
          effort: null,
          done: false,
          isWarmup: false,
        })),
      };
    },
  );
  return {
    draft: {
      sessionId: crypto.randomUUID(),
      startedAt: now.toISOString(),
      finishedAt: null,
      programDayId: null,
      programLabel: `Challenge — ${challenge.name}`,
      program: null,
      challenge: { challengeId: challenge.id, name: challenge.name, definition: challenge.definition, targetLoadsKg },
      exercises: withValidSupersets(exercises),
    },
    skippedExerciseIds,
  };
}
