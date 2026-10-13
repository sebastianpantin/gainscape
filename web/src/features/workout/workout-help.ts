import type { ChallengeDefinition } from '@domain/challenges.ts';
import type { StrengthState } from '@domain/types.ts';
import { mentionsE1rm } from '../../lib/collection/challenge-rules.ts';
import type { GlossaryKey } from '../../lib/ui/glossary.ts';
import type { EffortInputMode } from '../../lib/profile/profile-rules.ts';
import { amrapBadgeOf } from '../../lib/programs/program-today-rules.ts';
import type { DraftExercise, LiftDraftExercise } from '../../offline/draft-format.ts';

export interface WorkoutHelpInputs {
  mode: EffortInputMode;
  exercises: readonly DraftExercise[];
  strength: StrengthState | null;
  challenge: ChallengeDefinition | null;
}

type WorkoutHelpKey = Extract<GlossaryKey, 'rir' | 'rpe' | 'e1rm' | 'repMax' | 'amrap'>;

const WORKOUT_HELP_ORDER: readonly WorkoutHelpKey[] = ['rir', 'rpe', 'e1rm', 'repMax', 'amrap'];

export function workoutHelpKeys({ mode, exercises, strength, challenge }: WorkoutHelpInputs): GlossaryKey[] {
  const lifts = exercises.filter((exercise): exercise is LiftDraftExercise => exercise.modality === 'lift');
  const hasLift = lifts.length > 0;
  const hasPriorLift = lifts.some((exercise) => strength?.[exercise.exerciseId]?.hasPriorSession ?? false);
  const shows: Record<WorkoutHelpKey, boolean> = {
    rir: (hasLift && mode === 'rir') || hasPriorLift,
    rpe: hasLift && mode === 'rpe',
    e1rm: (hasLift && mode === 'rir') || (challenge !== null && mentionsE1rm(challenge)),
    repMax: hasPriorLift,
    amrap: lifts.some((exercise) => exercise.sets.some((set) => amrapBadgeOf(set.prescription) !== null)),
  };
  return WORKOUT_HELP_ORDER.filter((key) => shows[key]);
}
