export type GlossaryKey =
  | 'rir'
  | 'rpe'
  | 'sessionRpe'
  | 'e1rm'
  | 'oneRm'
  | 'fiveRm'
  | 'repMax'
  | 'trainingMax'
  | 'amrap'
  | 'superset'
  | 'pr'
  | 'xp'
  | 'loot';

export interface GlossaryEntry {
  term: string;
  question: string;
  name: string;
  definition: string;
}

export const GLOSSARY: Readonly<Record<GlossaryKey, GlossaryEntry>> = {
  rir: {
    term: 'RIR',
    question: 'What is RIR?',
    name: 'Reps in reserve',
    definition: 'Reps in reserve: how many more reps you could have done before failing, 0 to 6+.',
  },
  rpe: {
    term: 'RPE',
    question: 'What is RPE?',
    name: 'Rate of perceived exertion',
    definition:
      'Rate of perceived exertion: how hard a set felt, 6 to 10, where 10 means you could not do one more rep. RPE 8 means 2 reps in reserve.',
  },
  sessionRpe: {
    term: 'Session RPE',
    question: 'What is session RPE?',
    name: 'Session rate of perceived exertion',
    definition:
      'Session rate of perceived exertion: how hard the whole workout felt, from 1 (very easy) to 10 (max effort).',
  },
  e1rm: {
    term: 'e1RM',
    question: 'What is e1RM (estimated 1RM)?',
    name: 'Estimated one-rep max',
    definition:
      'Estimated one-rep max: the most you could likely lift for a single rep, worked out from the weights, reps and effort you log.',
  },
  oneRm: {
    term: '1RM',
    question: 'What is a 1RM?',
    name: 'One-rep max',
    definition: 'One-rep max: the heaviest weight you can lift for a single rep with good form.',
  },
  fiveRm: {
    term: '5RM',
    question: 'What is a 5RM?',
    name: 'Five-rep max',
    definition: 'Five-rep max: the heaviest weight you can lift for 5 reps in a row with good form.',
  },
  repMax: {
    term: 'RM',
    question: 'What is a rep max (RM)?',
    name: 'Rep max',
    definition:
      'Rep max: the heaviest weight you have lifted for a given number of reps. A 3RM is your best for 3 reps.',
  },
  trainingMax: {
    term: 'Training max',
    question: 'What is a training max?',
    name: 'Training max',
    definition:
      'Training max: a weight a little below your one-rep max. The program sets your weights as percentages of it.',
  },
  amrap: {
    term: 'AMRAP',
    question: 'What is an AMRAP set?',
    name: 'As many reps as possible',
    definition:
      'As many reps as possible: do at least the reps shown, then keep going while you can still lift with good form.',
  },
  superset: {
    term: 'Superset',
    question: 'What is a superset?',
    name: 'Superset',
    definition:
      'Superset: two or more exercises paired back to back. You do one set of each in turn, then take a break.',
  },
  pr: {
    term: 'PR',
    question: 'What is a PR?',
    name: 'Personal record',
    definition:
      'Personal record: your best result so far on an exercise, such as the most weight for a number of reps.',
  },
  xp: {
    term: 'XP',
    question: 'What is XP?',
    name: 'Experience points',
    definition:
      'Experience points: the sets you log earn XP for the skills their exercises train, such as Chest or Legs. Skills level up from 1 to 99.',
  },
  loot: {
    term: 'Loot',
    question: 'What is loot?',
    name: 'Loot',
    definition:
      'Loot: hard sets can drop items when you finish a workout. Equip gear for bonus XP and craft it into better tiers.',
  },
};
