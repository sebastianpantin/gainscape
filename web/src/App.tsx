import { BrowserRouter, Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { Icon, type IconName } from './components/Icon.tsx';
import { PreferencesProvider } from './components/PreferencesProvider.tsx';
import { AuthScreen } from './features/auth/AuthScreen.tsx';
import { CollectionScreen } from './features/collection/CollectionScreen.tsx';
import { ItemsScreen } from './features/collection/ItemsScreen.tsx';
import { ExercisesScreen } from './features/exercises/ExercisesScreen.tsx';
import { FriendsScreen } from './features/friends/FriendsScreen.tsx';
import { HiscoresScreen } from './features/friends/HiscoresScreen.tsx';
import { HistoryScreen } from './features/history/HistoryScreen.tsx';
import { SessionDetailScreen } from './features/history/SessionDetailScreen.tsx';
import { EditProfileScreen } from './features/profile/EditProfileScreen.tsx';
import { FriendPreviewScreen } from './features/profile/FriendPreviewScreen.tsx';
import { ProfileScreen } from './features/profile/ProfileScreen.tsx';
import { SettingsScreen } from './features/profile/SettingsScreen.tsx';
import { ProgramEditor } from './features/programs/ProgramEditor.tsx';
import { ProgramsScreen } from './features/programs/ProgramsScreen.tsx';
import { SkillsScreen } from './features/skills/SkillsScreen.tsx';
import { RevealScreen } from './features/summary/RevealScreen.tsx';
import { WorkoutScreen } from './features/workout/WorkoutScreen.tsx';
import { useAuthSession } from './lib/use-auth-session.ts';

const TABS: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/', label: 'Train', icon: 'train', end: true },
  { to: '/skills', label: 'Skills', icon: 'skills' },
  { to: '/collection', label: 'Log', icon: 'log' },
  { to: '/friends', label: 'Friends', icon: 'friends' },
  { to: '/profile', label: 'Profile', icon: 'profile' },
];

export function App() {
  const auth = useAuthSession();

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
          <Route path="/collection/history" element={<HistoryScreen />} />
          <Route path="/collection/history/:sessionId" element={<SessionDetailScreen userId={userId} />} />
          <Route path="/friends" element={<FriendsScreen />} />
          <Route path="/friends/hiscores" element={<HiscoresScreen userId={userId} />} />
          <Route path="/profile" element={<ProfileScreen userId={userId} />} />
          <Route path="/profile/edit" element={<EditProfileScreen userId={userId} />} />
          <Route path="/profile/preview" element={<FriendPreviewScreen userId={userId} />} />
          <Route
            path="/profile/settings"
            element={<SettingsScreen userId={userId} email={auth.session.user.email ?? null} />}
          />
          <Route path="/exercises" element={<ExercisesScreen />} />
          <Route path="/programs" element={<ProgramsScreen userId={userId} />} />
          <Route path="/programs/:programId" element={<ProgramEditor userId={userId} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </PreferencesProvider>
  );
}
