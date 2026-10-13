import { QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { type ComponentType, lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { Icon, type IconName } from './components/Icon.tsx';
import { ScreenErrorBoundary } from './components/ScreenErrorBoundary.tsx';
import { ScreenSkeleton } from './components/ScreenSkeleton.tsx';
import { PreferencesProvider } from './components/PreferencesProvider.tsx';
import { AuthCallbackScreen } from './features/auth/AuthCallbackScreen.tsx';
import { AuthScreen } from './features/auth/AuthScreen.tsx';
import { WhatsNewSheet } from './features/whats-new/WhatsNewSheet.tsx';
import { ActiveWorkoutBar } from './features/workout/ActiveWorkoutBar.tsx';
import { WorkoutScreen } from './features/workout/WorkoutScreen.tsx';
import { useDataChangeInvalidation } from './lib/data-changes.ts';
import { createQueryClient } from './lib/query-client.ts';
import { parseAuthCallback } from './lib/auth-links.ts';
import { useAuthSession } from './lib/use-auth-session.ts';
import { useRouteFocusAndTitle } from './lib/use-route-focus.ts';
import { OfflineBanner } from './pwa/OfflineBanner.tsx';
import { setUpdateUser } from './pwa/register-service-worker.ts';
import { UpdateBanner } from './pwa/UpdateBanner.tsx';

const SCREEN_PRELOAD_DELAY_MS = 1_000;
const screenLoaders: (() => Promise<unknown>)[] = [];

function lazyScreen<Name extends string, Props extends object>(
  load: () => Promise<Record<Name, ComponentType<Props>>>,
  name: Name,
) {
  screenLoaders.push(load);
  return lazy(async () => ({ default: (await load())[name] }));
}

function preloadScreens(): void {
  for (const load of screenLoaders) load().catch(() => undefined);
}

const CollectionScreen = lazyScreen(() => import('./features/collection/CollectionScreen.tsx'), 'CollectionScreen');
const ExerciseProgressScreen = lazyScreen(
  () => import('./features/collection/ExerciseProgressScreen.tsx'),
  'ExerciseProgressScreen',
);
const ItemsScreen = lazyScreen(() => import('./features/collection/ItemsScreen.tsx'), 'ItemsScreen');
const ExercisesScreen = lazyScreen(() => import('./features/exercises/ExercisesScreen.tsx'), 'ExercisesScreen');
const FriendProfileScreen = lazyScreen(
  () => import('./features/friends/FriendProfileScreen.tsx'),
  'FriendProfileScreen',
);
const FriendsScreen = lazyScreen(() => import('./features/friends/FriendsScreen.tsx'), 'FriendsScreen');
const HiscoresScreen = lazyScreen(() => import('./features/friends/HiscoresScreen.tsx'), 'HiscoresScreen');
const HistoryScreen = lazyScreen(() => import('./features/history/HistoryScreen.tsx'), 'HistoryScreen');
const SessionDetailScreen = lazyScreen(
  () => import('./features/history/SessionDetailScreen.tsx'),
  'SessionDetailScreen',
);
const EditProfileScreen = lazyScreen(() => import('./features/profile/EditProfileScreen.tsx'), 'EditProfileScreen');
const FriendPreviewScreen = lazyScreen(
  () => import('./features/profile/FriendPreviewScreen.tsx'),
  'FriendPreviewScreen',
);
const ProfileScreen = lazyScreen(() => import('./features/profile/ProfileScreen.tsx'), 'ProfileScreen');
const SettingsScreen = lazyScreen(() => import('./features/profile/SettingsScreen.tsx'), 'SettingsScreen');
const ActiveProgramScreen = lazyScreen(
  () => import('./features/programs/ActiveProgramScreen.tsx'),
  'ActiveProgramScreen',
);
const ProgramPlanScreen = lazyScreen(() => import('./features/programs/ProgramPlanScreen.tsx'), 'ProgramPlanScreen');
const ProgramEditor = lazyScreen(() => import('./features/programs/ProgramEditor.tsx'), 'ProgramEditor');
const ProgramEnrollScreen = lazyScreen(
  () => import('./features/programs/ProgramEnrollScreen.tsx'),
  'ProgramEnrollScreen',
);
const ProgramsScreen = lazyScreen(() => import('./features/programs/ProgramsScreen.tsx'), 'ProgramsScreen');
const SkillsScreen = lazyScreen(() => import('./features/skills/SkillsScreen.tsx'), 'SkillsScreen');
const RevealScreen = lazyScreen(() => import('./features/summary/RevealScreen.tsx'), 'RevealScreen');
const WhatsNewScreen = lazyScreen(() => import('./features/whats-new/WhatsNewScreen.tsx'), 'WhatsNewScreen');

const TABS: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/', label: 'Train', icon: 'train', end: true },
  { to: '/skills', label: 'Skills', icon: 'skills' },
  { to: '/collection', label: 'Collection', icon: 'log' },
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

function RouteFocusAndTitle() {
  useRouteFocusAndTitle();
  return null;
}

function Screens() {
  const auth = useAuthSession();
  const queryClient = useQueryClient();
  useDataChangeInvalidation();
  const signedInUserId = auth.status === 'signed-in' ? auth.session.user.id : null;
  useEffect(() => setUpdateUser(signedInUserId), [signedInUserId]);
  useEffect(() => {
    if (signedInUserId === null) return;
    return () => queryClient.clear();
  }, [queryClient, signedInUserId]);
  useEffect(() => {
    if (signedInUserId === null) return;
    const timer = setTimeout(preloadScreens, SCREEN_PRELOAD_DELAY_MS);
    return () => clearTimeout(timer);
  }, [signedInUserId]);
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
        <RouteFocusAndTitle />
        <nav className="tab-bar" aria-label="Main">
          {TABS.map((tab) => (
            <NavLink key={tab.to} to={tab.to} end={tab.end} className="tab">
              <Icon name={tab.icon} />
              {tab.label}
            </NavLink>
          ))}
        </nav>
        <ActiveWorkoutBar userId={userId} />
        <ScreenErrorBoundary>
          <Suspense fallback={<ScreenSkeleton />}>
            <Routes>
              <Route path="/" element={<WorkoutScreen key={userId} userId={userId} />} />
              <Route path="/reveal" element={<RevealScreen userId={userId} />} />
              <Route path="/skills" element={<SkillsScreen userId={userId} />} />
              <Route path="/collection" element={<CollectionScreen userId={userId} />} />
              <Route path="/collection/items" element={<ItemsScreen userId={userId} />} />
              <Route path="/collection/exercises/:exerciseId" element={<ExerciseProgressScreen userId={userId} />} />
              <Route path="/collection/history" element={<HistoryScreen userId={userId} />} />
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
          </Suspense>
        </ScreenErrorBoundary>
        <WhatsNewSheet userId={userId} />
      </BrowserRouter>
    </PreferencesProvider>
  );
}
