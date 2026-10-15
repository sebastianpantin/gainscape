import { type ProgramDefinition, type ProgramEnrollment } from './program-types.ts';
import { advanceProgram, finalDaySets } from './program-progression.ts';
import { initialProgramState, orderFacts, type ProgramFact, type ProgramState } from './program-state.ts';

export function programStateAt(
  definition: ProgramDefinition,
  enrollment: ProgramEnrollment,
  facts: readonly ProgramFact[],
): ProgramState {
  const ordered = orderFacts(facts);
  const finalSets = finalDaySets(definition, enrollment, ordered);
  return ordered.reduce(
    (state, fact) => advanceProgram(definition, enrollment, state, fact, finalSets),
    initialProgramState(definition, enrollment),
  );
}
