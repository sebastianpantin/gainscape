import { BrowserRouter, Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { AuthScreen } from './features/auth/AuthScreen.tsx';
import { CollectionScreen } from './features/collection/CollectionScreen.tsx';
import { ExercisesScreen } from './features/exercises/ExercisesScreen.tsx';
import { SkillsScreen } from './features/skills/SkillsScreen.tsx';
import { RevealScreen } from './features/summary/RevealScreen.tsx';
import { WorkoutScreen } from './features/workout/WorkoutScreen.tsx';
import { useAuthSession } from './lib/use-auth-session.ts';
import { openDraftStoreAndReconcile } from './offline/draft-boot.ts';
import { signOutKeepingDrafts } from './offline/sync-workout.ts';

async function signOut(userId: string): Promise<void> {
  const store = await openDraftStoreAndReconcile();
  const hasDraft = (await store.userIdsWithDrafts()).includes(userId);
  if (hasDraft && !window.confirm('Sign out? Your workout stays on this device.')) return;
  await signOutKeepingDrafts();
}

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
    <BrowserRouter>
      <nav className="tab-bar">
        <NavLink to="/" end className="tab">
          Workout
        </NavLink>
        <NavLink to="/skills" className="tab">
          Skills
        </NavLink>
        <NavLink to="/collection" className="tab">
          Collection
        </NavLink>
        <NavLink to="/exercises" className="tab">
          Exercises
        </NavLink>
        <button type="button" className="tab" onClick={() => signOut(userId)}>
          Sign out
        </button>
      </nav>
      <Routes>
        <Route path="/" element={<WorkoutScreen key={userId} userId={userId} />} />
        <Route path="/reveal" element={<RevealScreen />} />
        <Route path="/skills" element={<SkillsScreen userId={userId} />} />
        <Route path="/collection" element={<CollectionScreen userId={userId} />} />
        <Route path="/exercises" element={<ExercisesScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
