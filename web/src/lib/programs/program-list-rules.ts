import type { ProgramCategory } from './program-row-rules.ts';
import type { Program } from './programs.ts';

export function templatesIn(programs: readonly Program[], category: ProgramCategory | null): Program[] {
  return programs.filter((program) => program.ownerUserId === null && (program.category ?? null) === category);
}

export function canFollowProgram(program: Program): boolean {
  return program.days.every((day) => day.exercises.every((planned) => planned.targetDurationS == null));
}
