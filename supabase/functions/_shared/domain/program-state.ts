import {
  evaluateNumber,
  type ProgramDefinition,
  type ProgramEnrollment,
  type ProgramReferences,
  type ProgressionTrigger,
  type ReferenceVar,
} from './program-definition.ts';
import { type PrescriptionSnapshot } from './program-prescription.ts';
import { advanceProgram, finalDaySets, ruleKeyOf } from './program-progression.ts';
import { firstPosition, type Position, type ScheduleCursor } from './program-schedule.ts';
import { type EffortInputType } from './types.ts';

export interface FactSet {
  exerciseId: string;
  weightKg: number;
  reps: number;
  effortInputType: EffortInputType | null;
  effortValue: number | null;
  prescription: PrescriptionSnapshot | null;
}

interface FactBase {
  id: string;
  at: string;
  local?: boolean;
}

export interface SessionFact extends FactBase {
  kind: 'session';
  position: Position;
  sets: FactSet[];
}

export interface SetReferenceFact extends FactBase {
  kind: 'set_reference';
  lift: string;
  var: ReferenceVar;
  value: number;
}

export interface SkipDayFact extends FactBase {
  kind: 'skip_day';
  position: Position;
}

export interface JumpToFact extends FactBase {
  kind: 'jump_to';
  position: Position;
}

export type ProgramFact = SessionFact | SetReferenceFact | SkipDayFact | JumpToFact;

export type LiftOutcome = 'met' | 'missed' | 'neutral';

export type ReferenceChangeReason = 'increment' | 'tmReset' | 'set_reference' | 'adjustment';

export interface ReferenceChange {
  lift: string;
  var: ReferenceVar;
  from: number;
  to: number;
  reason: ReferenceChangeReason;
  position: Position;
}

export interface DayRecord {
  epoch: number;
  position: Position;
  status: 'completed' | 'skipped';
  outcomes: Readonly<Record<string, LiftOutcome>>;
  judgedSets: readonly FactSet[];
}

export type RuleKey = `${string}:${ReferenceVar}:${ProgressionTrigger}`;

export interface ProgramState extends ScheduleCursor {
  epoch: number;
  refs: ProgramReferences;
  consecutiveMisses: Readonly<Partial<Record<RuleKey, number>>>;
  successes: Readonly<Partial<Record<RuleKey, number>>>;
  days: readonly DayRecord[];
  dayIndex: Readonly<Record<string, number>>;
  history: readonly ReferenceChange[];
}

function initialReferences(definition: ProgramDefinition, enrollment: ProgramEnrollment): ProgramReferences {
  const numbers = { definition, options: enrollment.options, cycle: 1 };
  const lifts = [...new Set(definition.inputs.flatMap((input) => input.lifts))];
  const refs: Record<string, Partial<Record<ReferenceVar, number>>> = {};
  for (const lift of lifts) {
    const inputs = enrollment.inputs[lift] ?? {};
    const liftRefs: Partial<Record<ReferenceVar, number>> = {};
    for (const initial of definition.initial) {
      const input = inputs[initial.from];
      if (input === undefined || liftRefs[initial.var] !== undefined) continue;
      if (initial.kind === 'copy') liftRefs[initial.var] = input;
      if (initial.kind === 'scale') liftRefs[initial.var] = input * evaluateNumber(initial.factor, numbers);
      if (initial.kind === 'onRamp') liftRefs[initial.var] = input * initial.factor ** (initial.peakWeek - 1);
    }
    refs[lift] = liftRefs;
  }
  return refs;
}

export function initialProgramState(definition: ProgramDefinition, enrollment: ProgramEnrollment): ProgramState {
  return {
    position: firstPosition(definition),
    epoch: 0,
    completedDays: [],
    refs: initialReferences(definition, enrollment),
    consecutiveMisses: Object.fromEntries(definition.progression.map((rule) => [ruleKeyOf(rule), 0])),
    successes: {},
    days: [],
    dayIndex: {},
    history: [],
  };
}

const EXPLICIT_ZONE = /(?:Z|[+-]\d{2}:?\d{2})$/i;

function instantOf(fact: ProgramFact): number {
  const instant = EXPLICIT_ZONE.test(fact.at) ? Date.parse(fact.at) : Number.NaN;
  return Number.isNaN(instant) ? Number.POSITIVE_INFINITY : instant;
}

function compareFacts(a: ProgramFact, b: ProgramFact): number {
  const byInstant = instantOf(a) - instantOf(b);
  if (byInstant !== 0 && !Number.isNaN(byInstant)) return byInstant;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

export function orderFacts(facts: readonly ProgramFact[]): ProgramFact[] {
  const byId = new Map<string, ProgramFact>();
  for (const fact of facts) {
    const kept = byId.get(fact.id);
    if (!kept || (kept.local && !fact.local)) byId.set(fact.id, fact);
  }
  return [...byId.values()].sort(compareFacts);
}

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
