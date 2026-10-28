import { GLOSSARY } from '../../../lib/ui/glossary.ts';
import { SIMPLE_EFFORT_HINT } from '../../../lib/workout/effort-labels.ts';
import { usePreferences } from '../../../lib/profile/preferences.ts';
import { type EffortInputMode, UNIT_OPTIONS, updatePrivateProfile } from '../../../lib/profile/profile.ts';
import { useOptimisticProfileSave } from '../use-optimistic-profile-save.ts';
import { Choice } from './Choice.tsx';
import { PlateChoices } from './PlateChoices.tsx';
import { RestChoice } from './RestChoice.tsx';
import { type SectionProps } from './section-props.ts';
import { TrainingDeviceChoices } from './TrainingDeviceChoices.tsx';

const EFFORT_OPTIONS: { value: EffortInputMode; label: string; hint: string }[] = [
  { value: 'level', label: 'Simple', hint: SIMPLE_EFFORT_HINT },
  { value: 'rir', label: 'RIR', hint: GLOSSARY.rir.definition },
  { value: 'rpe', label: 'RPE', hint: GLOSSARY.rpe.definition },
];

export function TrainingSection({ userId, profile, replaceProfile }: SectionProps) {
  const { applyPreferences } = usePreferences();
  const { save, pending, problem } = useOptimisticProfileSave<'unitPref' | 'effortInputMode'>(
    profile,
    replaceProfile,
    (changes) => updatePrivateProfile(userId, changes),
    applyPreferences,
  );

  return (
    <section className="panel stack" aria-labelledby="training-heading">
      <h2 id="training-heading">Training</h2>
      <Choice
        label="Weight units"
        options={UNIT_OPTIONS}
        current={profile.unitPref}
        disabled={pending}
        onPick={(unitPref) => save({ unitPref })}
      />
      <span className="hint">Everything is stored in kilograms, so switching never creates false records.</span>
      <Choice
        label="How you rate effort"
        options={EFFORT_OPTIONS}
        current={profile.effortInputMode}
        disabled={pending}
        onPick={(effortInputMode) => save({ effortInputMode })}
      />
      <span className="hint">{EFFORT_OPTIONS.find((option) => option.value === profile.effortInputMode)?.hint}</span>
      <RestChoice userId={userId} />
      <TrainingDeviceChoices userId={userId} />
      <PlateChoices key={profile.unitPref} userId={userId} unit={profile.unitPref} />
      {problem && (
        <p className="problem" role="alert">
          {problem}
        </p>
      )}
    </section>
  );
}
