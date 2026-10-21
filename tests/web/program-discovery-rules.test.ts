import { type ProgramDefinition } from '@domain/index.ts';
import { describe, expect, it } from 'vitest';
import {
  FEATURED_TEMPLATE_KEYS,
  featuredPrograms,
  followingText,
  showsFollowProgramCard,
} from '../../web/src/lib/programs/program-discovery-rules.ts';
import { type TemplateListEntry, UPDATE_APP_TEXT } from '../../web/src/lib/programs/program-enroll-rules.ts';
import { type ActiveProgram } from '../../web/src/lib/programs/program-today-rules.ts';

const ROTATION = { schedule: { kind: 'rotation', days: [{}, {}] } } as unknown as ProgramDefinition;
const FOUR_WEEK_CYCLE = {
  schedule: { kind: 'cycle', weeksPerCycle: 4, days: [{}, {}, {}, {}] },
} as unknown as ProgramDefinition;

function enrollable(key: string, name: string, definition: ProgramDefinition): TemplateListEntry {
  return { kind: 'enrollable', key, version: 1, name, definition };
}

function needsUpdate(key: string, name: string): TemplateListEntry {
  return { kind: 'needs_update', key, version: 1, name, message: UPDATE_APP_TEXT };
}

describe('featured programs', () => {
  it('features StrongLifts 5x5, GZCLP and 5/3/1 in that order', () => {
    expect(FEATURED_TEMPLATE_KEYS).toEqual(['stronglifts_5x5', 'gzclp', 'five_three_one']);
  });

  it('lists the featured templates in featured order with how often you train', () => {
    const entries = [
      enrollable('five_three_one', '5/3/1', FOUR_WEEK_CYCLE),
      enrollable('madcow_5x5', 'Madcow 5x5', ROTATION),
      enrollable('gzclp', 'GZCLP', ROTATION),
      enrollable('stronglifts_5x5', 'StrongLifts 5x5', ROTATION),
    ];
    expect(featuredPrograms(entries).map(({ key, name, schedule }) => [key, name, schedule])).toEqual([
      ['stronglifts_5x5', 'StrongLifts 5x5', 'Rotates through 2 workouts'],
      ['gzclp', 'GZCLP', 'Rotates through 2 workouts'],
      ['five_three_one', '5/3/1', '4 days a week · 4-week cycle'],
    ]);
  });

  it('leaves out a featured template that is missing or cannot be followed', () => {
    const entries = [needsUpdate('stronglifts_5x5', 'StrongLifts 5x5'), enrollable('gzclp', 'GZCLP', ROTATION)];
    expect(featuredPrograms(entries).map((program) => program.key)).toEqual(['gzclp']);
  });

  it('features nothing before the templates have loaded', () => {
    expect(featuredPrograms([])).toEqual([]);
  });
});

const FEATURED = [{ key: 'gzclp', name: 'GZCLP', schedule: 'Rotates through 2 workouts' }];

describe('follow a program card', () => {
  it('shows once the app knows you follow no program and you have not dismissed it', () => {
    expect(showsFollowProgramCard('none', false, FEATURED)).toBe(true);
  });

  it('stays hidden after you dismiss it', () => {
    expect(showsFollowProgramCard('none', true, FEATURED)).toBe(false);
  });

  it('stays hidden when there is no featured program to offer', () => {
    expect(showsFollowProgramCard('none', false, [])).toBe(false);
  });

  it('stays hidden while you follow a program, or while the app cannot tell yet', () => {
    expect(showsFollowProgramCard('cached', false, FEATURED)).toBe(false);
    expect(showsFollowProgramCard('refreshing', false, FEATURED)).toBe(false);
    expect(showsFollowProgramCard('failed', false, FEATURED)).toBe(false);
  });
});

describe('following text', () => {
  it('names the program you follow', () => {
    const ready = { kind: 'ready', name: '5/3/1' } as unknown as ActiveProgram;
    expect(followingText(ready)).toBe("You're following 5/3/1");
    expect(followingText({ kind: 'needs_update', name: 'Madcow 5x5', message: UPDATE_APP_TEXT })).toBe(
      "You're following Madcow 5x5",
    );
  });

  it('still says you follow a program when its template is gone', () => {
    expect(followingText({ kind: 'template_missing' } as ActiveProgram)).toBe("You're following a program");
  });

  it('says nothing when you follow no program', () => {
    expect(followingText({ kind: 'none' })).toBeNull();
  });
});
