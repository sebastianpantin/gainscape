import { REP_MAX_SLOT_COUNT } from '@domain/types.ts';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { fetchSkills } from '../../lib/catalog.ts';
import type { Skill } from '../../lib/catalog-rules.ts';
import { formatLoad } from '../../lib/format.ts';
import { isUuid } from '../../lib/history-rules.ts';
import { usePreferences } from '../../lib/preferences.ts';
import {
  type CollectionView,
  type CollectionViewExercise,
  fetchCollectionView,
  fetchProfileView,
  type ProfileView,
  removeFriend,
} from '../../lib/social.ts';
import { slotClass } from '../collection/slot-class.ts';
import { ProfileWithTopSkills } from '../profile/ProfileWithTopSkills.tsx';
import { messageOf } from '../../lib/error-text.ts';

type ViewState =
  | { status: 'loading' }
  | { status: 'failed'; problem: string }
  | { status: 'missing' }
  | { status: 'ready'; skills: Skill[]; profile: ProfileView; collection: CollectionView };

function RecordsCard({ exercise, weightsHidden }: { exercise: CollectionViewExercise; weightsHidden: boolean }) {
  const { unitPref } = usePreferences();
  const slots = Array.from(
    { length: REP_MAX_SLOT_COUNT },
    (_, index) => exercise.repMaxes.find((slot) => slot.reps === index + 1) ?? null,
  );
  return (
    <section className="panel stack" data-testid="friend-record">
      <header className="row spread">
        <h3>{exercise.name}</h3>
        {exercise.pinned && <span className="muted tiny">Pinned</span>}
      </header>
      {exercise.loadType === 'bodyweight' ? (
        <p className={exercise.maxReps ? 'record-slot bodyweight-record filled' : 'record-slot bodyweight-record'}>
          Max reps: <strong>{exercise.maxReps ?? '—'}</strong>
        </p>
      ) : (
        <ol className="record-slots">
          {slots.map((slot, index) => (
            <li key={index} className={slotClass(slot)}>
              <span className="muted">{index + 1}RM</span>{' '}
              <span>
                {!slot
                  ? '—'
                  : slot.loadKg === null || weightsHidden
                    ? 'Set'
                    : formatLoad(slot.loadKg, exercise.loadType, unitPref)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function FriendProfileScreen() {
  const { friendId = '' } = useParams();
  return <FriendProfile key={friendId} friendId={friendId} />;
}

function FriendProfile({ friendId }: { friendId: string }) {
  const navigate = useNavigate();
  const [state, setState] = useState<ViewState>(() =>
    isUuid(friendId) ? { status: 'loading' } : { status: 'missing' },
  );
  const [removing, setRemoving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!isUuid(friendId)) return;
    let active = true;
    Promise.all([fetchSkills(), fetchProfileView(friendId), fetchCollectionView(friendId)]).then(
      ([skills, profile, collection]) => {
        if (!active) return;
        setState(profile && collection ? { status: 'ready', skills, profile, collection } : { status: 'missing' });
      },
      (error: Error) => active && setState({ status: 'failed', problem: error.message }),
    );
    return () => {
      active = false;
    };
  }, [friendId]);

  const remove = async () => {
    if (removing) return;
    setProblem(null);
    setRemoving(true);
    try {
      await removeFriend(friendId);
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
      {state.status === 'ready' &&
        (() => {
          const { collection } = state;
          return (
            <>
              <ProfileWithTopSkills skills={state.skills} profile={state.profile} headingId="friend-top-skills" />
              <section className="stack" aria-labelledby="friend-records">
                <h2 id="friend-records">Records</h2>
                {collection.weightsHidden && <p className="muted">Weights hidden</p>}
                {collection.exercises.length === 0 && <p className="muted">No records yet.</p>}
                {collection.exercises.map((exercise) => (
                  <RecordsCard key={exercise.exerciseId} exercise={exercise} weightsHidden={collection.weightsHidden} />
                ))}
                <p className="muted" data-testid="friend-items">
                  Items found: {collection.items.found.length} of {collection.items.catalogCount}
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
          );
        })()}
    </main>
  );
}
