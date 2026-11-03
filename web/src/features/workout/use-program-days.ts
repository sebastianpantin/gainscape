import { type Exercise } from '../../lib/exercises/catalog-rules.ts';
import { useToast } from '../../lib/ui/toast.ts';
import { dayNameOf, restoreSecondDay, withoutSecondDay, withSecondDay } from '../../offline/draft-days.ts';
import { type WorkoutDraft } from '../../offline/draft-format.ts';
import { type PrescribedDayStart } from '../../offline/draft-starts.ts';
import { type WorkoutDraftHandle } from '../../offline/use-workout-draft.ts';

export function useProgramDays(
  draft: WorkoutDraft | null,
  exercises: readonly Exercise[],
  updateDraft: WorkoutDraftHandle['updateDraft'],
) {
  const { showToast } = useToast();

  const addDay = (day: PrescribedDayStart) => {
    const catalog = new Map(exercises.map((exercise) => [exercise.id, exercise]));
    updateDraft((latest) => withSecondDay(latest, day, catalog, crypto.randomUUID()).draft);
  };

  const removeSecondDay = () => {
    if (draft === null) return;
    const { removed } = withoutSecondDay(draft);
    if (removed === null) return;
    updateDraft((latest) => withoutSecondDay(latest).draft);
    showToast(`${dayNameOf(removed.secondDay.programLabel)} removed.`, {
      label: 'Undo',
      onAct: () => updateDraft((latest) => restoreSecondDay(latest, removed)),
    });
  };

  return { addDay, removeSecondDay };
}
