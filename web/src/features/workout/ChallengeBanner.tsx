import { useState } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog.tsx';
import { TermHelp } from '../../components/TermHelp.tsx';
import { challengeSummaryText, challengeVolumeText } from '../../lib/collection/challenge-rules.ts';
import { type Exercise } from '../../lib/exercises/catalog-rules.ts';
import { type UnitPref } from '../../lib/profile/profile.ts';
import { type DraftChallenge, type WorkoutDraft } from '../../offline/draft-format.ts';

interface ChallengeBannerProps {
  draft: WorkoutDraft;
  challenge: DraftChallenge;
  exercises: readonly Exercise[];
  unit: UnitPref;
  onDiscard: () => void;
}

export function ChallengeBanner({ draft, challenge, exercises, unit, onDiscard }: ChallengeBannerProps) {
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const nameOf = (exerciseId: string) =>
    exercises.find((exercise) => exercise.id === exerciseId)?.name ??
    draft.exercises.find((exercise) => exercise.exerciseId === exerciseId)?.name ??
    'Exercise';
  const { definition } = challenge;
  return (
    <section className="panel stack" aria-label="Challenge">
      <h2>Challenge: {challenge.name}</h2>
      <span className="muted">{challengeSummaryText(definition, nameOf, unit)}</span>
      {definition.kind === 'volume' && definition.metric === 'kg' && (
        <p className="stack" style={{ gap: 2 }}>
          <span>{challengeVolumeText(draft, definition.target, unit)}</span>
          <span className="muted tiny">Only the weight you load counts, never your bodyweight.</span>
        </p>
      )}
      <button className="button link" type="button" onClick={() => setConfirmingDiscard(true)}>
        Discard challenge
      </button>
      {confirmingDiscard && (
        <ConfirmDialog
          title="Discard this challenge workout?"
          confirmLabel="Discard workout"
          danger
          onConfirm={onDiscard}
          onCancel={() => setConfirmingDiscard(false)}
        >
          <div className="row">
            Your scroll is kept until a challenge workout is saved. <TermHelp glossaryKey="scroll" />
          </div>
        </ConfirmDialog>
      )}
    </section>
  );
}
