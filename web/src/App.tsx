import { QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { Icon, type IconName } from './components/Icon.tsx';
import { PreferencesProvider } from './components/PreferencesProvider.tsx';
import { AuthCallbackScreen } from './features/auth/AuthCallbackScreen.tsx';
import { AuthScreen } from './features/auth/AuthScreen.tsx';
import { CollectionScreen } from './features/collection/CollectionScreen.tsx';
import { ExerciseProgressScreen } from './features/collection/ExerciseProgressScreen.tsx';
import { ItemsScreen } from './features/collection/ItemsScreen.tsx';
import { ExercisesScreen } from './features/exercises/ExercisesScreen.tsx';
import { FriendProfileScreen } from './features/friends/FriendProfileScreen.tsx';
import { FriendsScreen } from './features/friends/FriendsScreen.tsx';
import { HiscoresScreen } from './features/friends/HiscoresScreen.tsx';
import { HistoryScreen } from './features/history/HistoryScreen.tsx';
import { SessionDetailScreen } from './features/history/SessionDetailScreen.tsx';
import { EditProfileScreen } from './features/profile/EditProfileScreen.tsx';
import { FriendPreviewScreen } from './features/profile/FriendPreviewScreen.tsx';
import { ProfileScreen } from './features/profile/ProfileScreen.tsx';
import { SettingsScreen } from './features/profile/SettingsScreen.tsx';
import { ActiveProgramScreen } from './features/programs/ActiveProgramScreen.tsx';
import { ProgramPlanScreen } from './features/programs/ProgramPlanScreen.tsx';
import { ProgramEditor } from './features/programs/ProgramEditor.tsx';
import { ProgramEnrollScreen } from './features/programs/ProgramEnrollScreen.tsx';
import { ProgramsScreen } from './features/programs/ProgramsScreen.tsx';
import { SkillsScreen } from './features/skills/SkillsScreen.tsx';
import { RevealScreen } from './features/summary/RevealScreen.tsx';
import { WhatsNewScreen } from './features/whats-new/WhatsNewScreen.tsx';
import { WhatsNewSheet } from './features/whats-new/WhatsNewSheet.tsx';
import { WorkoutScreen } from './features/workout/WorkoutScreen.tsx';
import { createQueryClient } from './lib/query-client.ts';
import { parseAuthCallback } from './lib/auth-links.ts';
import { useAuthSession } from './lib/use-auth-session.ts';
import { OfflineBanner } from './pwa/OfflineBanner.tsx';
import { setUpdateUser } from './pwa/register-service-worker.ts';
import { UpdateBanner } from './pwa/UpdateBanner.tsx';

const TABS: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/', label: 'Train', icon: 'train', end: true },
  { to: '/skills', label: 'Skills', icon: 'skills' },
  { to: '/collection', label: 'Log', icon: 'log' },
  { to: '/friends', label: 'Friends', icon: 'friends' },
  { to: '/profile', label: 'Profile', icon: 'profile' },
];

export function App() {
  const [queryClient] = useState(createQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <UpdateBanner />
      <OfflineBanner />
      <Screens />
    </QueryClientProvider>
  );
}

function Screens() {
  const auth = useAuthSession();
  const queryClient = useQueryClient();
  const signedInUserId = auth.status === 'signed-in' ? auth.session.user.id : null;
  useEffect(() => setUpdateUser(signedInUserId), [signedInUserId]);
  useEffect(() => {
    if (signedInUserId === null) return;
    return () => queryClient.clear();
  }, [queryClient, signedInUserId]);
  const [callback, setCallback] = useState(() => parseAuthCallback(window.location.href));

  if (callback) return <AuthCallbackScreen callback={callback} onDone={() => setCallback(null)} />;
  if (auth.status === 'loading')
    return (
      <main className="screen">
        <p>Loading…</p>
      </main>
    );
  if (auth.status === 'signed-out') return <AuthScreen />;

  const userId = auth.session.user.id;
  return (
    <PreferencesProvider key={userId} userId={userId}>
      <BrowserRouter>
        <nav className="tab-bar" aria-label="Main">
          {TABS.map((tab) => (
            <NavLink key={tab.to} to={tab.to} end={tab.end} className="tab">
              <Icon name={tab.icon} />
              {tab.label}
            </NavLink>
          ))}
        </nav>
        <Routes>
          <Route path="/" element={<WorkoutScreen key={userId} userId={userId} />} />
          <Route path="/reveal" element={<RevealScreen userId={userId} />} />
          <Route path="/skills" element={<SkillsScreen userId={userId} />} />
          <Route path="/collection" element={<CollectionScreen userId={userId} />} />
          <Route path="/collection/items" element={<ItemsScreen userId={userId} />} />
          <Route path="/collection/exercises/:exerciseId" element={<ExerciseProgressScreen userId={userId} />} />
          <Route path="/collection/history" element={<HistoryScreen />} />
          <Route path="/collection/history/:sessionId" element={<SessionDetailScreen userId={userId} />} />
          <Route path="/friends" element={<FriendsScreen userId={userId} />} />
          <Route path="/friends/hiscores" element={<HiscoresScreen />} />
          <Route path="/friends/:friendId" element={<FriendProfileScreen />} />
          <Route path="/profile" element={<ProfileScreen userId={userId} />} />
          <Route path="/profile/edit" element={<EditProfileScreen userId={userId} />} />
          <Route path="/profile/preview" element={<FriendPreviewScreen userId={userId} />} />
          <Route
            path="/profile/settings"
            element={<SettingsScreen userId={userId} email={auth.session.user.email ?? null} />}
          />
          <Route path="/profile/settings/whats-new" element={<WhatsNewScreen />} />
          <Route path="/exercises" element={<ExercisesScreen userId={userId} />} />
          <Route path="/programs" element={<ProgramsScreen userId={userId} />} />
          <Route path="/programs/enroll/:key" element={<ProgramEnrollScreen userId={userId} />} />
          <Route path="/programs/active" element={<ActiveProgramScreen userId={userId} />} />
          <Route path="/programs/active/plan" element={<ProgramPlanScreen userId={userId} />} />
          <Route path="/programs/new" element={<ProgramEditor userId={userId} creating />} />
          <Route path="/programs/:programId" element={<ProgramEditor userId={userId} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <WhatsNewSheet userId={userId} />
      </BrowserRouter>
    </PreferencesProvider>
  );
}
