import { describe, expect, it } from 'vitest';
import {
  BEGINNER_TEMPLATE,
  beginnerProgram,
  FIRST_RUN_CARDS,
  nextOnboardingStep,
  ONBOARDING_STEPS,
  onboardingDecision,
  onboardingStepLabel,
  trainingHistoryNow,
  trainingHistoryOf,
} from '../../web/src/lib/onboarding-rules.ts';
import { GLOSSARY } from '../../web/src/lib/glossary.ts';
import { type ProgramDefinition } from '@domain/index.ts';
import { type TemplateListEntry, UPDATE_APP_TEXT } from '../../web/src/lib/program-enroll-rules.ts';

describe('onboarding decision', () => {
  it('stays hidden once finished or skipped, whatever the history says', () => {
    expect(onboardingDecision({ status: 'done' }, 'none')).toBe('hide');
    expect(onboardingDecision({ status: 'done' }, 'unknown')).toBe('hide');
  });

  it('stays hidden when storage cannot remember a skip', () => {
    expect(onboardingDecision({ status: 'unavailable' }, 'none')).toBe('hide');
  });

  it('waits for the training history of a user it has not onboarded here', () => {
    expect(onboardingDecision({ status: 'absent' }, 'unknown')).toBe('wait');
  });

  it('records a user who already trains as onboarded without showing anything', () => {
    expect(onboardingDecision({ status: 'absent' }, 'some')).toBe('record');
  });

  it('shows the flow to a user with no workouts and no program', () => {
    expect(onboardingDecision({ status: 'absent' }, 'none')).toBe('show');
  });
});

describe('training history', () => {
  it('is none only without workouts and without a followed program', () => {
    expect(trainingHistoryOf({ hasWorkout: false, hasEnrollment: false })).toBe('none');
  });

  it('is some with a workout or a followed program', () => {
    expect(trainingHistoryOf({ hasWorkout: true, hasEnrollment: false })).toBe('some');
    expect(trainingHistoryOf({ hasWorkout: false, hasEnrollment: true })).toBe('some');
  });
});

describe('training history right now', () => {
  it('counts a workout open on this device as training, before the check answers', () => {
    expect(trainingHistoryNow({ hasDraft: true, fetching: true, fetched: null })).toBe('some');
    expect(trainingHistoryNow({ hasDraft: true, fetching: false, fetched: 'none' })).toBe('some');
  });

  it('is unknown while the check runs again, so a stale answer never opens the intro', () => {
    expect(trainingHistoryNow({ hasDraft: false, fetching: true, fetched: 'none' })).toBe('unknown');
    expect(trainingHistoryNow({ hasDraft: false, fetching: false, fetched: null })).toBe('unknown');
  });

  it('uses the settled answer otherwise', () => {
    expect(trainingHistoryNow({ hasDraft: false, fetching: false, fetched: 'none' })).toBe('none');
    expect(trainingHistoryNow({ hasDraft: false, fetching: false, fetched: 'some' })).toBe('some');
  });
});

describe('onboarding steps', () => {
  it('runs welcome, units, then how to train', () => {
    expect(ONBOARDING_STEPS).toEqual(['welcome', 'units', 'train']);
    expect(nextOnboardingStep('welcome')).toBe('units');
    expect(nextOnboardingStep('units')).toBe('train');
    expect(nextOnboardingStep('train')).toBeNull();
  });

  it('labels each step with its position', () => {
    expect(onboardingStepLabel('welcome')).toBe('Step 1 of 3');
    expect(onboardingStepLabel('train')).toBe('Step 3 of 3');
  });
});

function enrollable(key: string, name: string): TemplateListEntry {
  return { kind: 'enrollable', key, version: 1, name, definition: {} as ProgramDefinition };
}

function needsUpdate(key: string, name: string): TemplateListEntry {
  return { kind: 'needs_update', key, version: 1, name, message: UPDATE_APP_TEXT };
}

describe('beginner program', () => {
  it('suggests StrongLifts 5x5 when it can be followed', () => {
    expect(BEGINNER_TEMPLATE).toBe('stronglifts_5x5');
    expect(beginnerProgram([enrollable('gzclp', 'GZCLP'), enrollable('stronglifts_5x5', 'StrongLifts 5x5')])).toEqual({
      key: BEGINNER_TEMPLATE,
      name: 'StrongLifts 5x5',
    });
  });

  it('suggests nothing when the template is missing or cannot be followed', () => {
    expect(beginnerProgram([])).toBeNull();
    expect(beginnerProgram([needsUpdate('stronglifts_5x5', 'StrongLifts 5x5')])).toBeNull();
  });
});

describe('first-run cards', () => {
  it('explains skills, records and loot with the glossary text, without repeating the term', () => {
    expect(FIRST_RUN_CARDS.map((card) => card.title)).toEqual(['Skills & XP', 'Records', 'Loot']);
    expect(FIRST_RUN_CARDS.map((card) => card.text)).toEqual([
      'The sets you log earn XP for the skills their exercises train, such as Chest or Legs. Skills level up from 1 to 99.',
      'Your best result so far on an exercise, such as the most weight for a number of reps.',
      'Hard sets can drop items when you finish a workout. Equip gear for bonus XP and craft it into better tiers.',
    ]);
  });

  it('keeps every card text inside its glossary definition', () => {
    const definitions = [GLOSSARY.xp, GLOSSARY.pr, GLOSSARY.loot].map((entry) => entry.definition.toLowerCase());
    FIRST_RUN_CARDS.forEach((card, index) => expect(definitions[index]).toContain(card.text.toLowerCase()));
  });
});
