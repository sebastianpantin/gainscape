import { type Sex, updatePrivateProfile } from '../../../lib/profile/profile.ts';
import { useOptimisticProfileSave } from '../use-optimistic-profile-save.ts';
import { Choice } from './Choice.tsx';
import { type SectionProps } from './section-props.ts';

type SexChoice = Sex | 'unset';

const SEX_OPTIONS: { value: SexChoice; label: string }[] = [
  { value: 'unset', label: 'Not set' },
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
];

export function StrengthScoreSection({ userId, profile, replaceProfile }: SectionProps) {
  const { save, pending, problem } = useOptimisticProfileSave<'sex'>(profile, replaceProfile, (changes) =>
    updatePrivateProfile(userId, changes),
  );

  return (
    <section className="panel stack" aria-labelledby="strength-score-heading">
      <h2 id="strength-score-heading">Strength score</h2>
      <Choice
        label="Sex"
        options={SEX_OPTIONS}
        current={profile.sex ?? 'unset'}
        disabled={pending}
        onPick={(choice) => save({ sex: choice === 'unset' ? null : choice })}
      />
      <span className="hint">
        Used only for your DOTS score on Stats, which compares lifters of different bodyweights. Never shown to anyone.
      </span>
      {problem && (
        <p className="problem" role="alert">
          {problem}
        </p>
      )}
    </section>
  );
}
