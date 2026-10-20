import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useRef } from 'react';
import { type Exercise } from '../../lib/exercises/catalog-rules.ts';
import { type ActiveProgram } from '../../lib/programs/program-today-rules.ts';
import { type UnitPref } from '../../lib/profile/profile.ts';
import { type StandingState } from '../../lib/progress/standing.ts';
import { profileQuery, trainingDaysQuery } from '../../lib/query/queries.ts';
import { localDateIn, monthKey } from '../../lib/ui/date-bucket-rules.ts';
import { type DraftNotice } from '../../offline/draft-session.ts';
import { InstallCard } from '../../pwa/InstallCard.tsx';
import { FriendActivityStrip } from '../friends/FriendActivityStrip.tsx';
import { FirstRunDialog } from '../onboarding/FirstRunDialog.tsx';
import { HighlightsCard } from './HighlightsCard.tsx';
import { LevelStat } from './LevelStat.tsx';
import { LiftGoalsCard } from './LiftGoalsCard.tsx';
import { ProgramDayStarts } from './ProgramDayStarts.tsx';
import { ProgramSummary } from './ProgramSummary.tsx';
import { ProgramToday } from './ProgramToday.tsx';
import { ThisWeekCard } from './ThisWeekCard.tsx';
import { greetingFor } from './today-rules.ts';
import { TrainingHero } from './TrainingHero.tsx';
import { type useWorkoutStart } from './use-workout-start.ts';

interface TodayViewProps {
  userId: string;
  deviceNotices: ReactNode;
  notice: DraftNotice | null;
  standing: StandingState;
  exercises: Exercise[];
  unit: UnitPref;
  program: ActiveProgram;
  start: ReturnType<typeof useWorkoutStart>;
  onboarding: { open: boolean; finish: () => void };
  onFreestyleFromOnboarding: () => void;
}

export function TodayView({
  userId,
  deviceNotices,
  notice,
  standing,
  exercises,
  unit,
  program,
  start,
  onboarding,
  onFreestyleFromOnboarding,
}: TodayViewProps) {
  const startButton = useRef<HTMLButtonElement>(null);
  const now = new Date();
  const timezone = useQuery(profileQuery(userId)).data?.loaded.timezone;
  const today = timezone === undefined ? null : localDateIn(timezone, now.getTime());
  const trainingDays = useQuery({ ...trainingDaysQuery(userId, monthKey(today ?? '')), enabled: today !== null });
  const trainedDates = trainingDays.data?.loaded.map((session) => session.localDate);
  return (
    <main className="screen stack">
      <div className="screen-header">
        <div className="stack" style={{ gap: 4 }}>
          <span className="muted">
            {greetingFor(now.getHours())} ·{' '}
            {now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}
          </span>
          <h1 className="title">Train</h1>
        </div>
        {standing.status === 'ready' && (
          <LevelStat
            userId={userId}
            totalLevel={standing.standing.totalLevel}
            combatLevel={standing.standing.combatLevel}
          />
        )}
      </div>
      {deviceNotices}
      {notice === 'deleted' && (
        <p className="notice" role="status">
          This workout was deleted
        </p>
      )}
      {notice === 'saved_elsewhere' && (
        <p className="notice" role="status">
          This workout was saved in another tab.
        </p>
      )}
      <InstallCard userId={userId} />
      <ThisWeekCard today={today} trainedDates={trainedDates} />
      <ProgramSummary userId={userId} program={program} />
      <ProgramToday
        program={program}
        exercises={exercises}
        unit={unit}
        disabled={start.startingDay}
        onStart={start.startFromPrescription}
        onSkip={start.skipProgramDay}
      />
      <button
        ref={startButton}
        className="button primary big"
        type="button"
        disabled={start.startingDay}
        onClick={start.startFreestyle}
      >
        Start workout
      </button>
      <p className="muted" style={{ textAlign: 'center' }}>
        Freestyle: add exercises as you go.
      </p>
      <ProgramDayStarts
        userId={userId}
        disabled={start.startingDay}
        followingProgram={program.kind !== 'none'}
        onStart={start.startFromDay}
      />
      <TrainingHero userId={userId} standing={standing} unit={unit} />
      <HighlightsCard userId={userId} today={today} trainedDates={trainedDates} unit={unit} />
      <LiftGoalsCard userId={userId} unit={unit} />
      <FriendActivityStrip userId={userId} />
      {onboarding.open && (
        <FirstRunDialog
          userId={userId}
          onFinish={onboarding.finish}
          onSkip={() => {
            onboarding.finish();
            requestAnimationFrame(() => startButton.current?.focus());
          }}
          onFreestyle={onFreestyleFromOnboarding}
        />
      )}
    </main>
  );
}
