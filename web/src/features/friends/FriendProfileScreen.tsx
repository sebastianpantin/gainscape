import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Skill } from '../../lib/catalog-rules.ts';
import { isUuid } from '../../lib/history-rules.ts';
import {
  FEED_QUERY_PREFIX,
  type FriendProfileLoad,
  friendProfileQuery,
  FRIENDS_QUERY_PREFIX,
} from '../../lib/queries.ts';
import { loadedState } from '../../lib/query-state-rules.ts';
import { usePreferences } from '../../lib/preferences.ts';
import { type CollectionView, type CollectionViewExercise, type ProfileView, removeFriend } from '../../lib/social.ts';
import { slotsByReps } from '../collection/record-slots.ts';
import { RecordSlots } from '../collection/RecordSlots.tsx';
import { LoadoutPanel } from '../profile/LoadoutPanel.tsx';
import { ProfileWithTopSkills } from '../profile/ProfileWithTopSkills.tsx';
import { messageOf } from '../../lib/error-text.ts';

type ViewState =
  | { status: 'loading' }
  | { status: 'failed'; problem: string }
  | { status: 'missing' }
  | { status: 'ready'; skills: Skill[]; profile: ProfileView; collection: CollectionView };

function RecordsCard({ exercise, weightsHidden }: { exercise: CollectionViewExercise; weightsHidden: boolean }) {
  const { unitPref } = usePreferences();
  return (
    <section className="panel stack">
      <header className="row spread">
        <h3>{exercise.name}</h3>
        {exercise.pinned && <span className="muted tiny">Pinned</span>}
      </header>
      <RecordSlots
        loadType={exercise.loadType}
        slots={slotsByReps(exercise.repMaxes)}
        maxReps={exercise.maxReps}
        unit={unitPref}
        weightsHidden={weightsHidden}
      />
    </section>
  );
}

export function FriendProfileScreen() {
  const { friendId = '' } = useParams();
  return <FriendProfile key={friendId} friendId={friendId} />;
}

function viewStateOf(friendId: string, data: FriendProfileLoad | null | undefined, error: Error | null): ViewState {
  if (!isUuid(friendId) || data === null) return { status: 'missing' };
  const loaded = loadedState(data, error);
  return loaded.status === 'ready' ? { status: 'ready', ...loaded.data } : loaded;
}

function FriendProfile({ friendId }: { friendId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const view = useQuery(friendProfileQuery(friendId));
  const state = viewStateOf(friendId, view.data, view.isFetching ? null : view.error);
  const [removing, setRemoving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const remove = async () => {
    if (removing) return;
    setProblem(null);
    setRemoving(true);
    try {
      await removeFriend(friendId);
      queryClient.removeQueries({ queryKey: FRIENDS_QUERY_PREFIX });
      queryClient.removeQueries({ queryKey: FEED_QUERY_PREFIX });
      queryClient.removeQueries({ queryKey: friendProfileQuery(friendId).queryKey });
      navigate('/friends', { replace: true });
    } catch (error) {
      setProblem(messageOf(error, 'Could not remove this friend.'));
      setRemoving(false);
    }
  };

  return (
    <main className="screen stack">
      <Link className="back-link" to="/friends">
        ‹ Friends
      </Link>
      {state.status === 'loading' && <p>Loading…</p>}
      {state.status === 'failed' && (
        <p className="problem" role="alert">
          {state.problem}
        </p>
      )}
      {state.status === 'missing' && (
        <section className="panel stack">
          <h1 className="title">Not available</h1>
          <p className="muted">This profile is only visible to friends.</p>
          <Link className="button" to="/friends">
            Back to friends
          </Link>
        </section>
      )}
      {state.status === 'ready' && (
        <>
          <ProfileWithTopSkills
            skills={state.skills}
            profile={state.profile}
            headingId="friend-top-skills"
            nameIsPageTitle
          />
          <LoadoutPanel userId={friendId} />
          <section className="stack" aria-labelledby="friend-records">
            <h2 id="friend-records">Records</h2>
            {state.collection.weightsHidden && <p className="muted">Weights hidden</p>}
            {state.collection.exercises.length === 0 && <p className="muted">No records yet.</p>}
            {state.collection.exercises.map((exercise) => (
              <RecordsCard
                key={exercise.exerciseId}
                exercise={exercise}
                weightsHidden={state.collection.weightsHidden}
              />
            ))}
            <p className="muted">
              Items found: {state.collection.items.found.length} of {state.collection.items.catalogCount}
            </p>
          </section>
          {state.profile.relation === 'friend' && (
            <section className="panel stack">
              {problem && (
                <p className="problem" role="alert">
                  {problem}
                </p>
              )}
              {confirming ? (
                <>
                  <p>Remove {state.profile.displayName} from your friends?</p>
                  <button className="button danger" type="button" disabled={removing} onClick={remove}>
                    Remove for good
                  </button>
                  <button className="button" type="button" onClick={() => setConfirming(false)}>
                    Keep friend
                  </button>
                </>
              ) : (
                <button className="button danger" type="button" onClick={() => setConfirming(true)}>
                  Remove friend
                </button>
              )}
            </section>
          )}
        </>
      )}
    </main>
  );
}
