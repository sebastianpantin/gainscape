import { describe, expect, it } from 'vitest';
import { canFollowProgram, templatesIn } from '../../web/src/lib/programs/program-list-rules.ts';
import { programErrorText } from '../../web/src/lib/programs/program-error-rules.ts';
import type { Program } from '../../web/src/lib/programs/programs.ts';

const slot = (exerciseId: string, targetDurationS: number | null = null) => ({
  exerciseId,
  targetSets: 3,
  targetRepsMin: 15,
  targetRepsMax: 15,
  targetDurationS,
  progression: { kind: 'none' } as const,
});

const program = (overrides: Partial<Program>): Program => ({
  id: 'p',
  key: null,
  name: 'P',
  ownerUserId: null,
  copiedFromId: null,
  days: [{ id: 'd', name: 'Daily', position: 0, exercises: [slot('curl')] }],
  ...overrides,
});

describe('program list rules', () => {
  const ppl = program({ id: 'ppl', category: null });
  const old = program({ id: 'old' });
  const rehab = program({ id: 'rehab', category: 'rehab' });
  const own = program({ id: 'own', ownerUserId: 'me', category: null });

  it('splits templates into the ones to build on and the rehab ones, leaving own programs out', () => {
    const all = [ppl, old, rehab, own];
    expect(templatesIn(all, null).map((template) => template.id)).toEqual(['ppl', 'old']);
    expect(templatesIn(all, 'rehab').map((template) => template.id)).toEqual(['rehab']);
  });

  it('follows only programs without a timed hold, which start from Train instead', () => {
    expect(canFollowProgram(own)).toBe(true);
    const withHold = program({
      days: [{ id: 'd', name: 'Daily', position: 0, exercises: [slot('curl'), slot('wall-sit', 45)] }],
    });
    expect(canFollowProgram(withHold)).toBe(false);
  });

  it('explains why a program with a timed hold cannot be followed', () => {
    expect(programErrorText({ message: 'program_has_holds' })).toBe(
      "Programs with timed holds can't be followed. Start their days from Train.",
    );
  });
});
