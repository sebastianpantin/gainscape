import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ItemIcon, SkillIcon, TrophyIcon } from '../../components/PixelArt.tsx';
import { SegmentedChoice } from '../../components/SegmentedChoice.tsx';
import { announceDataChange } from '../../lib/query/data-changes.ts';
import { messageOf } from '../../lib/error-text.ts';
import { TIER_COLORS } from '../../lib/collection/item-rules.ts';
import {
  beginnerProgram,
  FIRST_RUN_CARDS,
  type FirstRunCardIcon,
  nextOnboardingStep,
  ONBOARDING_STEPS,
  type OnboardingStep,
  onboardingStepLabel,
} from '../../lib/profile/onboarding-rules.ts';
import { usePreferences } from '../../lib/profile/preferences.ts';
import { type Profile, updatePrivateProfile, type UnitPref } from '../../lib/profile/profile.ts';
import { templateListEntries } from '../../lib/programs/program-enroll-rules.ts';
import { profileQuery, programTemplatesQuery } from '../../lib/query/queries.ts';
import { deviceStorage } from '../../lib/platform/keyed-store.ts';
import { type CacheFirstLoad } from '../../offline/cache-first.ts';
import { profileCache } from '../../offline/profile-cache.ts';

interface TrainStepProps {
  userId: string;
  onFinish: () => void;
  onFreestyle: () => void;
}

interface FirstRunDialogProps extends TrainStepProps {
  onSkip: () => void;
}

const UNIT_OPTIONS: { value: UnitPref; label: string }[] = [
  { value: 'kg', label: 'Kilograms' },
  { value: 'lb', label: 'Pounds' },
];

function CardIcon({ icon }: { icon: FirstRunCardIcon }) {
  if (icon === 'skill') return <SkillIcon skillKey="legs" />;
  if (icon === 'record') return <TrophyIcon />;
  return <ItemIcon kind="belt" color={TIER_COLORS.forged} />;
}

function StepPips({ step }: { step: OnboardingStep }) {
  const current = ONBOARDING_STEPS.indexOf(step);
  return (
    <span className="first-run-pips" aria-hidden="true">
      {ONBOARDING_STEPS.map((candidate, index) => (
        <span key={candidate} className={index <= current ? 'first-run-pip lit' : 'first-run-pip'} />
      ))}
    </span>
  );
}

function WelcomeStep() {
  return (
    <>
      <p>Log your lifts and level up like an adventurer. Your workouts earn you three things:</p>
      <ul className="first-run-cards" aria-label="What you earn">
        {FIRST_RUN_CARDS.map((card, index) => (
          <li key={card.title} className="first-run-card rise" style={{ animationDelay: `${index * 90}ms` }}>
            <span className="first-run-card-icon">
              <CardIcon icon={card.icon} />
            </span>
            <span className="stack" style={{ gap: 2 }}>
              <strong className="first-run-card-title">{card.title}</strong>
              <span className="muted tiny">{card.text}</span>
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

function UnitsStep({ userId }: { userId: string }) {
  const { unitPref, applyPreferences } = usePreferences();
  const queryClient = useQueryClient();
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const showSavedUnits = (saved: UnitPref) => {
    const storedProfile = profileCache.read(deviceStorage(), userId);
    if (storedProfile) profileCache.save(deviceStorage(), userId, { ...storedProfile, unitPref: saved });
    const { queryKey } = profileQuery(userId);
    void queryClient.cancelQueries({ queryKey });
    queryClient.setQueryData<CacheFirstLoad<Profile>>(
      queryKey,
      (current) => current && { ...current, loaded: { ...current.loaded, unitPref: saved } },
    );
  };

  const pick = async (next: UnitPref) => {
    if (saving || next === unitPref) return;
    const previous = unitPref;
    setSaving(true);
    setProblem(null);
    applyPreferences({ unitPref: next });
    try {
      await updatePrivateProfile(userId, { unitPref: next });
      showSavedUnits(next);
      void announceDataChange(queryClient, 'profile-saved');
    } catch (error) {
      applyPreferences({ unitPref: previous });
      setProblem(messageOf(error, 'Could not save your units.'));
    }
    setSaving(false);
  };

  return (
    <>
      <p>Pick the units on your plates and dumbbells. You can change this any time in Settings.</p>
      <SegmentedChoice
        label="Weight units"
        options={UNIT_OPTIONS}
        current={unitPref}
        onPick={(next) => void pick(next)}
      />
      <span className="hint">Everything is stored in kilograms, so switching never creates false records.</span>
      {problem && (
        <p className="problem" role="alert">
          {problem}
        </p>
      )}
    </>
  );
}

function TrainStep({ userId, onFinish, onFreestyle }: TrainStepProps) {
  const templates = useQuery(programTemplatesQuery(userId));
  const program = beginnerProgram(templateListEntries(templates.data ?? []));

  return (
    <>
      <p>Follow a plan that sets your weights, or log whatever you lift today.</p>
      <section className="first-run-choice stack" aria-labelledby="first-run-program">
        <h3 id="first-run-program">Follow a program</h3>
        {program ? (
          <>
            <p className="muted tiny">
              {program.name} is a classic beginner plan: three full-body workouts a week, adding weight as you go.
            </p>
            <Link className="button primary" to={`/programs/enroll/${program.key}`} onClick={onFinish}>
              Follow {program.name}
            </Link>
          </>
        ) : (
          <p className="muted tiny">Pick a beginner plan and Gainscape works out each workout's weights.</p>
        )}
        <Link className="button link first-run-browse" to="/programs" onClick={onFinish}>
          Browse all programs
        </Link>
      </section>
      <section className="first-run-choice stack" aria-labelledby="first-run-freestyle">
        <h3 id="first-run-freestyle">Freestyle</h3>
        <p className="muted tiny">Add exercises as you go. You can follow a program later.</p>
        <button
          className="button"
          type="button"
          onClick={() => {
            onFinish();
            onFreestyle();
          }}
        >
          Start an empty workout
        </button>
      </section>
    </>
  );
}

const STEP_TITLES: Record<OnboardingStep, string> = {
  welcome: 'Welcome to Gainscape',
  units: 'Kilograms or pounds?',
  train: 'How do you want to train?',
};

export function FirstRunDialog({ userId, onFinish, onSkip, onFreestyle }: FirstRunDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const [step, setStep] = useState<OnboardingStep>('welcome');
  const next = nextOnboardingStep(step);

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    return () => element?.close();
  }, []);

  useEffect(() => {
    heading.current?.focus();
  }, [step]);

  return (
    <dialog
      ref={dialog}
      className="panel stack first-run-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onSkip();
      }}
    >
      <div className="row spread">
        <span className="row first-run-progress">
          <StepPips step={step} />
          <span className="muted tiny">{onboardingStepLabel(step)}</span>
        </span>
        <button className="button link" type="button" onClick={onSkip}>
          Skip intro
        </button>
      </div>
      <h2 id={titleId} ref={heading} tabIndex={-1} className="first-run-title">
        {STEP_TITLES[step]}
      </h2>
      <div className="stack" key={step}>
        {step === 'welcome' && <WelcomeStep />}
        {step === 'units' && <UnitsStep userId={userId} />}
        {step === 'train' && <TrainStep userId={userId} onFinish={onFinish} onFreestyle={onFreestyle} />}
      </div>
      {next && (
        <button className="button primary" type="button" onClick={() => setStep(next)}>
          Next
        </button>
      )}
    </dialog>
  );
}
