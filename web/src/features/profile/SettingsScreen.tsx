import { Link } from 'react-router-dom';
import { ProblemWithRetry } from '../../components/ScreenProblem.tsx';
import { ListSkeleton } from '../../components/ScreenSkeleton.tsx';
import { AccountSection } from './settings/AccountSection.tsx';
import { AppSection } from './settings/AppSection.tsx';
import { PrivacySection } from './settings/PrivacySection.tsx';
import { StrengthScoreSection } from './settings/StrengthScoreSection.tsx';
import { TimezoneSection } from './settings/TimezoneSection.tsx';
import { TrainingSection } from './settings/TrainingSection.tsx';
import { WeeklyGoalSection } from './settings/WeeklyGoalSection.tsx';
import { useProfile } from './use-profile.ts';

interface SettingsScreenProps {
  userId: string;
  email: string | null;
}

export function SettingsScreen({ userId, email }: SettingsScreenProps) {
  const { state, replace, refresh } = useProfile(userId);

  return (
    <main className="screen stack">
      <div className="stack" style={{ gap: 'var(--space-1)' }}>
        <Link className="back-link" to="/profile">
          ‹ Profile
        </Link>
        <h1 className="title">Settings</h1>
      </div>
      {state.status === 'loading' && <ListSkeleton />}
      {state.status === 'failed' && <ProblemWithRetry problem={state.problem} onRetry={refresh} />}
      {state.status === 'ready' && (
        <>
          <TrainingSection userId={userId} profile={state.profile} replaceProfile={replace} />
          <StrengthScoreSection userId={userId} profile={state.profile} replaceProfile={replace} />
          <WeeklyGoalSection />
          <TimezoneSection profile={state.profile} replaceProfile={replace} />
          <PrivacySection userId={userId} profile={state.profile} replaceProfile={replace} />
        </>
      )}
      <AppSection />
      <AccountSection
        userId={userId}
        email={email}
        username={state.status === 'ready' ? state.profile.username : null}
      />
    </main>
  );
}
