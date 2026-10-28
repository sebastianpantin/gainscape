import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useRef, useState } from 'react';
import { type Exercise } from '../../lib/exercises/catalog-rules.ts';
import { deviceStorage } from '../../lib/platform/keyed-store.ts';
import { dismissFollowCard, isFollowCardDismissed } from '../../lib/programs/follow-card-store.ts';
import { featuredPrograms, showsFollowProgramCard } from '../../lib/programs/program-discovery-rules.ts';
import { templateListEntries } from '../../lib/programs/program-enroll-rules.ts';
import { type ProgramLoadStatus } from '../../lib/programs/program-status-rules.ts';
import { type ActiveProgram } from '../../lib/programs/program-today-rules.ts';
import { type UnitPref } from '../../lib/profile/profile.ts';
import { type StandingState } from '../../lib/progress/standing.ts';
import { profileQuery, programTemplatesQuery, trainingDaysQuery } from '../../lib/query/queries.ts';
import { localDateIn, monthKey } from '../../lib/ui/date-bucket-rules.ts';
import { type DraftNotice } from '../../offline/draft-session.ts';
import { readProgramCache } from '../../offline/program-cache.ts';
import { InstallCard } from '../../pwa/InstallCard.tsx';
import { FriendActivityStrip } from '../friends/FriendActivityStrip.tsx';
import { FirstRunDialog } from '../onboarding/FirstRunDialog.tsx';
import { DotsStat } from './DotsStat.tsx';
import { FollowProgramCard } from './FollowProgramCard.tsx';
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
  programLoadStatus: ProgramLoadStatus;
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
  programLoadStatus,
  start,
  onboarding,
  onFreestyleFromOnboarding,
}: TodayViewProps) {
  const startButton = useRef<HTMLButtonElement>(null);
  const [followCardDismissed, setFollowCardDismissed] = useState(() => isFollowCardDismissed(deviceStorage(), userId));
  const [savedTemplates] = useState(() => readProgramCache(localStorage, userId).templates);
  const liveTemplates = useQuery(programTemplatesQuery(userId));
  const featured = featuredPrograms(templateListEntries(liveTemplates.data ?? savedTemplates));
  const followCardShown = showsFollowProgramCard(programLoadStatus, followCardDismissed, featured);
  const now = new Date();
  const timezone = useQuery(profileQuery(userId)).data?.loaded.timezone;
  const today = timezone === undefined ? null : localDateIn(timezone, now.getTime());
  const trainingDays = useQuery({ ...trainingDaysQuery(userId, monthKey(today ?? '')), enabled: today !== null });
  const trainedDates = trainingDays.data?.loaded.map((session) => session.localDate);
  return (
    <main className="screen stack">
      <div className="screen-header">
        <div className="stack" style={{ gap: 'var(--space-1)' }}>
          <span className="muted">
            {greetingFor(now.getHours())} ·{' '}
            {now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}
          </span>
          <h1 className="title">Train</h1>
        </div>
      </div>
      <div className="header-stats">
        {standing.status === 'ready' && (
          <LevelStat
            userId={userId}
            totalLevel={standing.standing.totalLevel}
            combatLevel={standing.standing.combatLevel}
          />
        )}
        <DotsStat userId={userId} />
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
      {followCardShown && (
        <FollowProgramCard
          programs={featured}
          onDismiss={() => {
            dismissFollowCard(deviceStorage(), userId);
            setFollowCardDismissed(true);
          }}
        />
      )}
      <ProgramDayStarts
        userId={userId}
        disabled={start.startingDay}
        hideEmptyState={program.kind !== 'none' || followCardShown}
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
