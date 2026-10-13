import { DEFAULT_BALANCE } from '@domain/index.ts';
import { describe, expect, it } from 'vitest';
import { assumedEffort } from '../../web/src/lib/workout/effort-labels.ts';
import { GLOSSARY, type GlossaryKey } from '../../web/src/lib/ui/glossary.ts';

const ENTRIES = Object.entries(GLOSSARY);
const QUESTIONS = ENTRIES.map(([, entry]) => entry.question);

describe('GLOSSARY', () => {
  it.each<[GlossaryKey, string]>([
    ['rir', 'What is RIR?'],
    ['rpe', 'What is RPE?'],
    ['sessionRpe', 'What is session RPE?'],
    ['e1rm', 'What is e1RM (estimated 1RM)?'],
    ['oneRm', 'What is a 1RM?'],
    ['fiveRm', 'What is a 5RM?'],
    ['repMax', 'What is a rep max (RM)?'],
    ['trainingMax', 'What is a training max?'],
    ['amrap', 'What is an AMRAP set?'],
    ['superset', 'What is a superset?'],
    ['pr', 'What is a PR?'],
    ['xp', 'What is XP?'],
    ['loot', 'What is loot?'],
  ])('asks %s as %j', (key, question) => {
    expect(GLOSSARY[key].question).toBe(question);
  });

  it('spells out AMRAP and PR', () => {
    expect(GLOSSARY.amrap.name).toBe('As many reps as possible');
    expect(GLOSSARY.pr.name).toBe('Personal record');
  });

  it('asks distinct questions, none contained in another', () => {
    expect(new Set(QUESTIONS).size).toBe(QUESTIONS.length);
    for (const question of QUESTIONS) {
      const others = QUESTIONS.filter((other) => other !== question);
      expect(others.filter((other) => other.toLowerCase().includes(question.toLowerCase()))).toEqual([]);
    }
  });

  it.each(ENTRIES)('fills every field of %s', (_key, entry) => {
    expect(entry.term).not.toBe('');
    expect(entry.name).not.toBe('');
    expect(entry.definition).not.toBe('');
  });

  it.each(ENTRIES)('ends the %s definition with a full stop', (_key, entry) => {
    expect(entry.definition.endsWith('.')).toBe(true);
  });

  it.each(ENTRIES.filter(([, entry]) => entry.term !== entry.name))(
    'spells out the %s name in its definition',
    (_key, entry) => {
      expect(entry.definition.toLowerCase()).toContain(entry.name.toLowerCase());
    },
  );

  it('explains skill levels and loot for a first-time lifter', () => {
    expect(GLOSSARY.xp.definition).toContain('1 to 99');
    expect(GLOSSARY.loot.definition).toContain('hard sets can drop items');
  });

  it('defines RIR and RPE for a beginner', () => {
    expect(GLOSSARY.rir.definition).toBe(
      'Reps in reserve: how many more reps you could have done before failing, 0 to 6+.',
    );
    expect(GLOSSARY.rpe.definition).toBe(
      'Rate of perceived exertion: how hard a set felt, 6 to 10, where 10 means you could not do one more rep. RPE 8 means 2 reps in reserve.',
    );
  });

  it('matches the RPE example to how the app converts 2 reps in reserve', () => {
    expect(assumedEffort('rpe', 2, DEFAULT_BALANCE.effortLevelRir)).toEqual({ type: 'rpe', value: 8 });
    expect(GLOSSARY.rpe.definition).toContain('RPE 8 means 2 reps in reserve');
  });
});
