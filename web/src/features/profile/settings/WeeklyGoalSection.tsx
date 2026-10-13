import {
  goalFromChoice,
  goalSettingHint,
  goalToChoice,
  WEEKLY_GOAL_CHOICES,
} from '../../../lib/progress/weekly-goal-rules.ts';
import { Choice } from './Choice.tsx';
import { useWeeklyGoalSetting } from './use-weekly-goal-setting.ts';

const WEEKLY_GOAL_OPTIONS = WEEKLY_GOAL_CHOICES.map((value) => ({ value, label: value === 'off' ? 'Off' : value }));

export function WeeklyGoalSection() {
  const { loaded, status, chosen, pending, problem, pick, retry } = useWeeklyGoalSetting();

  if (loaded.kind === 'failed')
    return (
      <section className="panel stack" aria-labelledby="weekly-goal-heading">
        <h2 id="weekly-goal-heading">Weekly goal</h2>
        <p className="problem" role="alert">
          {loaded.message}
        </p>
        <button className="button outline" type="button" onClick={retry}>
          Try again
        </button>
      </section>
    );

  return (
    <section className="panel stack" aria-labelledby="weekly-goal-heading">
      <h2 id="weekly-goal-heading">Weekly goal</h2>
      <Choice
        label="Workouts per week"
        options={WEEKLY_GOAL_OPTIONS}
        current={goalToChoice(chosen)}
        disabled={pending || loaded.kind === 'loading'}
        onPick={(choice) => void pick(goalFromChoice(choice))}
      />
      <span className="hint" aria-live="polite">
        {loaded.kind === 'ready' ? goalSettingHint(status) : ''}
      </span>
      {problem && (
        <p className="problem" role="alert">
          {problem}
        </p>
      )}
    </section>
  );
}
