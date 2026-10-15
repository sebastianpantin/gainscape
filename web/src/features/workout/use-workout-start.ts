import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { type Position } from '@domain/index.ts';
import { type Exercise } from '../../lib/exercises/catalog-rules.ts';
import { adjustEnrollment, refreshProgramFactsOrCached } from '../../lib/programs/program-enrollment.ts';
import { skipDayEvent } from '../../lib/programs/program-skip-rules.ts';
import { fetchLastLoggedSets, type Program, type ProgramDay } from '../../lib/programs/programs.ts';
import { exerciseListLoadQuery } from '../../lib/query/queries.ts';
import {
  type PrescribedDayStart,
  startDraft,
  startDraftFromDay,
  startDraftFromPrescription,
  type WorkoutDraft,
} from '../../offline/draft-format.ts';
import { type ProgramCache } from '../../offline/program-cache.ts';
import { type WorkoutDraftHandle } from '../../offline/use-workout-draft.ts';
import { startNoticeText } from './workout-rules.ts';

interface WorkoutStartInput {
  userId: string;
  exercises: Exercise[];
  startWorkout: WorkoutDraftHandle['startWorkout'];
  programCache: ProgramCache;
  showProgramCache: (cache: ProgramCache) => void;
}

export function useWorkoutStart({
  userId,
  exercises,
  startWorkout,
  programCache,
  showProgramCache,
}: WorkoutStartInput) {
  const queryClient = useQueryClient();
  const [startingDay, setStartingDay] = useState(false);
  const [startNotice, setStartNotice] = useState<string | null>(null);

  const openStartedDraft = async (started: { draft: WorkoutDraft; skippedExerciseIds: string[] }) => {
    const outcome = await startWorkout(() => started.draft);
    setStartingDay(false);
    setStartNotice(startNoticeText(outcome, started.skippedExerciseIds.length));
  };

  const startFromDay = async (program: Program, day: ProgramDay) => {
    setStartingDay(true);
    const exerciseIds = [...new Set(day.exercises.map((planned) => planned.exerciseId))];
    const [catalog, lastSets] = await Promise.all([
      queryClient.fetchQuery(exerciseListLoadQuery(userId)).then(
        ({ loaded }) => loaded,
        () => exercises,
      ),
      fetchLastLoggedSets(exerciseIds).catch(() => new Map()),
    ]);
    const started = startDraftFromDay(
      { id: day.id, name: day.name, programName: program.name, exercises: day.exercises },
      new Map(catalog.map((exercise) => [exercise.id, exercise])),
      lastSets,
      new Date(),
    );
    await openStartedDraft(started);
  };

  const startFromPrescription = async (day: PrescribedDayStart) => {
    setStartingDay(true);
    const started = startDraftFromPrescription(
      day,
      new Map(exercises.map((exercise) => [exercise.id, exercise])),
      new Date(),
    );
    await openStartedDraft(started);
  };

  const skipProgramDay = async (position: Position) => {
    const enrollment = programCache.enrollment;
    if (!enrollment) return;
    await adjustEnrollment(enrollment.id, skipDayEvent(position));
    showProgramCache(await refreshProgramFactsOrCached(userId, enrollment));
  };

  const startFreestyle = () => {
    if (startingDay) return;
    setStartNotice(null);
    void startWorkout(startDraft).then((outcome) => setStartNotice(startNoticeText(outcome, 0)));
  };

  return { startingDay, startNotice, startFromDay, startFromPrescription, skipProgramDay, startFreestyle };
}
