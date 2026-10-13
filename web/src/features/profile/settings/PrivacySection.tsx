import { Switch } from '../../../components/Switch.tsx';
import { updatePublicProfile } from '../../../lib/profile.ts';
import { useOptimisticProfileSave } from '../use-optimistic-profile-save.ts';
import { type SectionProps } from './section-props.ts';

export function PrivacySection({ userId, profile, onSaved }: SectionProps) {
  const { save, pending, problem } = useOptimisticProfileSave<'showWeights' | 'showBodyweight'>(
    profile,
    onSaved,
    (changes) => updatePublicProfile(userId, changes),
  );

  return (
    <section className="panel stack" aria-labelledby="privacy-heading">
      <h2 id="privacy-heading">Privacy</h2>
      <Switch
        label="Show my weights to friends"
        hint='Off: friends see "New 8RM Leg Press" without the load.'
        checked={profile.showWeights}
        disabled={pending}
        onChange={(showWeights) => save({ showWeights })}
      />
      <Switch
        label="Show my bodyweight to friends"
        hint="Off: weighted pull-ups and dips show only the added weight."
        checked={profile.showBodyweight}
        disabled={pending}
        onChange={(showBodyweight) => save({ showBodyweight })}
      />
      {problem && (
        <p className="problem" role="alert">
          {problem}
        </p>
      )}
      <span className="hint">Your height, age and bodyweight entries are never shown to anyone.</span>
    </section>
  );
}
