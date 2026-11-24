import {
  CARDIO_BOUNDS,
  type GarminActivity,
  garminActivityEnd,
  garminActivityIdentity,
  type GarminExercisePick,
  type GarminImportCandidate,
  garminImportCandidate,
  type GarminImportOutcome,
  type GarminLiftSet,
  type GarminRejection,
  type GarminSeenOutcome,
  type GarminSkipReason,
  type GarminStrengthDecision,
  garminStrengthDecision,
  MAX_SETS_PER_SESSION,
} from '@domain/index.ts';
import {
  activeExercises,
  type Exercise,
  isCardioExercise,
  isLiftExercise,
  type PaceUnit,
} from '../exercises/catalog-rules.ts';
import { formatCount, formatXp } from '../format.ts';
import { labelOfKey } from '../names.ts';
import type { InvokeOutcome } from '../platform/function-client-rules.ts';
import { RATE_LIMITED_STATUS } from '../platform/rate-limit.ts';
import type { UnitPref } from '../profile/profile-rules.ts';
import { distanceUnitFor, formatDistance } from '../units.ts';
import { describeInterval, formatDuration } from '../workout/cardio-rules.ts';
import type { SeenGarminActivity } from './seen-activities-rules.ts';
import {
  type GroupChoice,
  prefilledDecisions,
  type ReviewLift,
  strengthBadgeText,
  strengthFacts,
  UNDECIDED_GROUP,
} from './strength-review-rules.ts';

const GARMIN_IMPORT_DAILY_CAP = 500;
const DEFAULT_PACE_UNIT: PaceUnit = 'per_km';
const UNKNOWN_MONTH = 'Unknown date';
const UNNAMED_GARMIN_TYPE = 'Activity';
const DAILY_CAP_REASON: GarminSkipReason = 'daily_cap';

export type GreyedReason = GarminRejection | 'already_imported' | 'deleted_earlier' | 'rejected_earlier' | 'same_start';

export interface ReviewRow {
  id: string;
  candidate: GarminImportCandidate;
  greyed: GreyedReason | null;
}

export interface LoggedSession {
  startedAt: string;
  endedAt: string;
  exerciseIds: readonly string[];
}

export interface ReviewSession extends LoggedSession {
  startMs: number;
  endMs: number;
  holdsLiftSets: boolean;
}

export interface ReviewContext {
  exerciseIdByGarminType: ReadonlyMap<string, string>;
  exerciseIdByGarminCategory: ReadonlyMap<string, string>;
  seen: readonly SeenGarminActivity[];
  sessions: readonly LoggedSession[];
}

export interface ReviewExercise {
  id: string;
  name: string;
  tracksDistance: boolean;
  paceUnit: PaceUnit;
}

export interface ReviewChoices {
  selected: ReadonlySet<string>;
  exerciseByRow: ReadonlyMap<string, string>;
  groupsByRow: ReadonlyMap<string, readonly GroupChoice[]>;
  bodyweightKnown: boolean;
}

const GREYED_BY_SEEN: Record<GarminSeenOutcome, GreyedReason> = {
  imported: 'already_imported',
  deleted: 'deleted_earlier',
  rejected: 'rejected_earlier',
};

const GREYED_TEXT: Record<GreyedReason, string> = {
  already_imported: 'Already imported',
  deleted_earlier: 'Deleted earlier',
  rejected_earlier: 'Rejected earlier',
  same_start: 'Same start as another activity',
  too_long: `Over ${formatDuration(CARDIO_BOUNDS.steadyDurationS.max)}`,
  too_far: `Over ${formatDistance(CARDIO_BOUNDS.distanceM.max, 'km')}`,
  too_short: `Under ${formatDuration(CARDIO_BOUNDS.steadyDurationS.min)}`,
  no_sets: 'No sets to import',
  too_many_sets: `Over ${MAX_SETS_PER_SESSION} sets`,
  unreadable: 'Unreadable',
};

function newestFirst(first: ReviewRow, second: ReviewRow): number {
  return (second.candidate.startedAt ?? '').localeCompare(first.candidate.startedAt ?? '');
}

export function reviewRows(activities: readonly GarminActivity[], context: ReviewContext, now: number): ReviewRow[] {
  const seenOutcome = new Map(context.seen.map((seen) => [seen.startedAt, seen.outcome]));
  const startsInFile = new Set<string>();
  return activities
    .map((activity, index): ReviewRow => {
      const candidate = garminImportCandidate(activity, context.exerciseIdByGarminType, now);
      const id = `activity-${index}`;
      if (candidate.rejection !== null) return { id, candidate, greyed: candidate.rejection };
      const startedAt = candidate.startedAt!;
      const seen = seenOutcome.get(startedAt);
      if (seen !== undefined) return { id, candidate, greyed: GREYED_BY_SEEN[seen] };
      if (startsInFile.has(startedAt)) return { id, candidate, greyed: 'same_start' };
      startsInFile.add(startedAt);
      return { id, candidate, greyed: null };
    })
    .sort(newestFirst);
}

export function activitiesRange(activities: readonly GarminActivity[]): { from: string; to: string } | null {
  const spans = activities.flatMap(({ startedAt, durationS }) => {
    const identity = garminActivityIdentity(startedAt);
    if (identity === null || !Number.isFinite(durationS) || durationS < 0) return [];
    return [{ startedAt: identity, endedAt: garminActivityEnd({ startedAt: identity, durationS }) }];
  });
  if (spans.length === 0) return null;
  return {
    from: spans.map((span) => span.startedAt).reduce((earliest, start) => (start < earliest ? start : earliest)),
    to: spans.map((span) => span.endedAt).reduce((latest, end) => (end > latest ? end : latest)),
  };
}

export function reviewSessions(sessions: readonly LoggedSession[], exercises: readonly Exercise[]): ReviewSession[] {
  const liftIds = new Set(exercises.filter(isLiftExercise).map((exercise) => exercise.id));
  return sessions.map((session) => ({
    ...session,
    startMs: Date.parse(session.startedAt),
    endMs: Date.parse(session.endedAt),
    holdsLiftSets: session.exerciseIds.some((exerciseId) => liftIds.has(exerciseId)),
  }));
}

export function exerciseOfRow(row: ReviewRow, choices: ReviewChoices): string | null {
  return row.candidate.exerciseId ?? choices.exerciseByRow.get(row.id) ?? null;
}

export function isStrengthRow(row: ReviewRow): boolean {
  return row.greyed === null && row.candidate.kind === 'strength';
}

export function needsExercisePick(row: ReviewRow): boolean {
  return row.greyed === null && row.candidate.kind === 'cardio' && row.candidate.exerciseId === null;
}

export function groupDecisionsOfRow(row: ReviewRow, choices: ReviewChoices): readonly GroupChoice[] {
  return choices.groupsByRow.get(row.id) ?? row.candidate.setGroups.map(() => UNDECIDED_GROUP);
}

export function strengthDecisionOfRow(row: ReviewRow, choices: ReviewChoices): GarminStrengthDecision {
  return garminStrengthDecision(row.candidate.setGroups, groupDecisionsOfRow(row, choices), choices.bodyweightKnown);
}

export function canBeChosen(row: ReviewRow, choices: ReviewChoices): boolean {
  if (row.greyed !== null) return false;
  if (isStrengthRow(row)) return strengthDecisionOfRow(row, choices).status === 'ready';
  return exerciseOfRow(row, choices) !== null;
}

export function isChosen(row: ReviewRow, choices: ReviewChoices): boolean {
  return canBeChosen(row, choices) && choices.selected.has(row.id);
}

function possibleDuplicateOf(
  row: ReviewRow,
  choices: ReviewChoices,
  sessions: readonly ReviewSession[],
): ReviewSession | null {
  const { startedAt, durationS } = row.candidate;
  const exerciseId = exerciseOfRow(row, choices);
  const isStrength = isStrengthRow(row);
  if ((!isStrength && exerciseId === null) || startedAt === null || durationS === null) return null;
  const sameKindOfWorkout = (session: ReviewSession) =>
    isStrength ? session.holdsLiftSets : session.exerciseIds.includes(exerciseId!);
  const activityStart = Date.parse(startedAt);
  const activityEnd = Date.parse(garminActivityEnd({ startedAt, durationS }));
  return (
    sessions.find(
      (session) => sameKindOfWorkout(session) && session.startMs <= activityEnd && activityStart <= session.endMs,
    ) ?? null
  );
}

function isChosenUnasked(row: ReviewRow, choices: ReviewChoices, sessions: readonly ReviewSession[]): boolean {
  return canBeChosen(row, choices) && possibleDuplicateOf(row, choices, sessions) === null;
}

export interface ReviewMemory {
  exerciseIdByGarminCategory: ReadonlyMap<string, string>;
  lifts: ReadonlyMap<string, ReviewLift>;
  bodyweightKnown: boolean;
}

export function initialChoices(
  rows: readonly ReviewRow[],
  sessions: readonly ReviewSession[],
  memory: ReviewMemory,
): ReviewChoices {
  const unselected: ReviewChoices = {
    selected: new Set(),
    exerciseByRow: new Map(),
    groupsByRow: new Map(
      rows
        .filter(isStrengthRow)
        .map((row) => [
          row.id,
          prefilledDecisions(row.candidate.setGroups, memory.exerciseIdByGarminCategory, memory.lifts),
        ]),
    ),
    bodyweightKnown: memory.bodyweightKnown,
  };
  const selected = rows.filter((row) => isChosenUnasked(row, unselected, sessions)).map((row) => row.id);
  return { ...unselected, selected: new Set(selected) };
}

function withSelection(choices: ReviewChoices, rows: readonly ReviewRow[], on: boolean): ReviewChoices {
  const selected = new Set(choices.selected);
  for (const row of rows) {
    if (on) selected.add(row.id);
    else selected.delete(row.id);
  }
  return { ...choices, selected };
}

export function withRowToggled(choices: ReviewChoices, row: ReviewRow, on: boolean): ReviewChoices {
  return canBeChosen(row, choices) ? withSelection(choices, [row], on) : choices;
}

export function withExercisePicked(
  choices: ReviewChoices,
  sessions: readonly ReviewSession[],
  row: ReviewRow,
  exerciseId: string,
): ReviewChoices {
  if (row.greyed !== null) return choices;
  const picked = { ...choices, exerciseByRow: new Map([...choices.exerciseByRow, [row.id, exerciseId]]) };
  return withSelection(picked, [row], possibleDuplicateOf(row, picked, sessions) === null);
}

function withNewlyChoosableSelected(
  before: ReviewChoices,
  after: ReviewChoices,
  rows: readonly ReviewRow[],
  sessions: readonly ReviewSession[],
): ReviewChoices {
  const changed = rows.filter((row) => canBeChosen(row, before) !== canBeChosen(row, after));
  const selected = new Set(after.selected);
  for (const row of changed) {
    if (isChosenUnasked(row, after, sessions)) selected.add(row.id);
    else selected.delete(row.id);
  }
  return { ...after, selected };
}

export function withGroupDecisions(
  choices: ReviewChoices,
  sessions: readonly ReviewSession[],
  row: ReviewRow,
  decisions: readonly GroupChoice[],
): ReviewChoices {
  if (!isStrengthRow(row)) return choices;
  const decided = { ...choices, groupsByRow: new Map([...choices.groupsByRow, [row.id, decisions]]) };
  return withNewlyChoosableSelected(choices, decided, [row], sessions);
}

export function withBodyweightKnown(
  choices: ReviewChoices,
  rows: readonly ReviewRow[],
  sessions: readonly ReviewSession[],
): ReviewChoices {
  return withNewlyChoosableSelected(choices, { ...choices, bodyweightKnown: true }, rows, sessions);
}

export function needsBodyweight(rows: readonly ReviewRow[], choices: ReviewChoices): boolean {
  return rows.some((row) => isStrengthRow(row) && strengthDecisionOfRow(row, choices).status === 'needs_bodyweight');
}

export function withAllToggled(rows: readonly ReviewRow[], choices: ReviewChoices, on: boolean): ReviewChoices {
  return withSelection(
    choices,
    rows.filter((row) => canBeChosen(row, choices)),
    on,
  );
}

export function allSelected(rows: readonly ReviewRow[], choices: ReviewChoices): boolean {
  const choosable = rows.filter((row) => canBeChosen(row, choices));
  return choosable.length > 0 && choosable.every((row) => choices.selected.has(row.id));
}

export function chosenCount(rows: readonly ReviewRow[], choices: ReviewChoices): number {
  return rows.filter((row) => isChosen(row, choices)).length;
}

export function importButtonLabel(count: number): string {
  return `Import ${formatCount(count, 'workout')}`;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(
  kind: 'start' | 'month',
  timeZone: string | undefined,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const key = `${kind}:${timeZone ?? ''}`;
  const known = formatters.get(key);
  if (known !== undefined) return known;
  const formatter = new Intl.DateTimeFormat('en-GB', { ...options, timeZone });
  formatters.set(key, formatter);
  return formatter;
}

function formatActivityStart(startedAt: string, timeZone?: string): string {
  const parts = formatterFor('start', timeZone, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(startedAt));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? '';
  return `${part('weekday')} ${part('day')} ${part('month')}, ${part('hour')}:${part('minute')}`;
}

function garminTypeLabel(garminType: string | null): string {
  return garminType === null ? UNNAMED_GARMIN_TYPE : labelOfKey(garminType);
}

export function rowTitle(row: ReviewRow, timeZone?: string): string {
  const type = garminTypeLabel(row.candidate.garminType);
  return row.candidate.startedAt === null
    ? type
    : `${formatActivityStart(row.candidate.startedAt, timeZone)} · ${type}`;
}

export function rowFacts(
  row: ReviewRow,
  choices: ReviewChoices,
  exercisesById: ReadonlyMap<string, ReviewExercise>,
  unit: UnitPref,
): string {
  const { durationS, distanceM, interval, setGroups } = row.candidate;
  const exercise = exercisesById.get(exerciseOfRow(row, choices) ?? '');
  const showsDistance = distanceM !== null && (exercise?.tracksDistance ?? true);
  return [
    exercise?.name,
    setGroups.length > 0 ? strengthFacts(setGroups) : null,
    durationS === null ? null : formatDuration(durationS),
    showsDistance ? formatDistance(distanceM, distanceUnitFor(unit, exercise?.paceUnit ?? DEFAULT_PACE_UNIT)) : null,
    interval === null ? null : describeInterval(interval),
  ]
    .filter((fact) => fact !== null && fact !== undefined)
    .join(' · ');
}

export type RowBadge =
  | { kind: 'greyed' | 'needs_exercise' | 'history_only'; text: string }
  | { kind: 'possible_duplicate'; text: string; note: string };

export function rowBadge(
  row: ReviewRow,
  choices: ReviewChoices,
  sessions: readonly ReviewSession[],
  timeZone?: string,
): RowBadge | null {
  if (row.greyed !== null) return { kind: 'greyed', text: GREYED_TEXT[row.greyed] };
  const needs = isStrengthRow(row)
    ? strengthBadgeText(strengthDecisionOfRow(row, choices))
    : exerciseOfRow(row, choices) === null
      ? 'Needs an exercise'
      : null;
  if (needs !== null) return { kind: 'needs_exercise', text: needs };
  const duplicate = possibleDuplicateOf(row, choices, sessions);
  if (duplicate !== null) {
    return {
      kind: 'possible_duplicate',
      text: 'Possible duplicate',
      note: `Matches a workout logged ${formatActivityStart(duplicate.startedAt, timeZone)}`,
    };
  }
  return row.candidate.historyOnly ? { kind: 'history_only', text: 'History only' } : null;
}

export interface ReviewMonth {
  label: string;
  rows: ReviewRow[];
}

function monthLabel(startedAt: string | null, timeZone: string | undefined): string {
  if (startedAt === null) return UNKNOWN_MONTH;
  return formatterFor('month', timeZone, { month: 'long', year: 'numeric' }).format(new Date(startedAt));
}

export function reviewMonths(rows: readonly ReviewRow[], timeZone?: string): ReviewMonth[] {
  const months = new Map<string, ReviewRow[]>();
  for (const row of rows) {
    const label = monthLabel(row.candidate.startedAt, timeZone);
    months.set(label, [...(months.get(label) ?? []), row]);
  }
  return [...months].map(([label, monthRows]) => ({ label, rows: monthRows }));
}

export function reviewExercises(exercises: readonly Exercise[]): Map<string, ReviewExercise> {
  return new Map(
    exercises
      .filter(isCardioExercise)
      .map(({ id, name, activity: { tracksDistance, paceUnit } }) => [id, { id, name, tracksDistance, paceUnit }]),
  );
}

export function pickableExercises(exercises: readonly Exercise[]): ReviewExercise[] {
  return [...reviewExercises(activeExercises(exercises)).values()].sort((first, second) =>
    first.name.localeCompare(second.name),
  );
}

interface ActivityToImportBase {
  startedAt: string;
  garminType: string | null;
  durationS: number;
  historyOnly: boolean;
}

export interface CardioActivityToImport extends ActivityToImportBase {
  exerciseId: string;
  distanceM: number | null;
  interval: GarminImportCandidate['interval'];
}

export interface StrengthActivityToImport extends ActivityToImportBase {
  sets: GarminLiftSet[];
  picks: GarminExercisePick[];
}

export type ActivityToImport = CardioActivityToImport | StrengthActivityToImport;

export function activitiesToImport(
  rows: readonly ReviewRow[],
  choices: ReviewChoices,
  exercisesById: ReadonlyMap<string, ReviewExercise>,
): ActivityToImport[] {
  return rows
    .filter((row) => isChosen(row, choices))
    .flatMap((row): ActivityToImport[] => {
      const { startedAt, garminType, durationS, distanceM, interval, historyOnly } = row.candidate;
      if (startedAt === null || durationS === null) return [];
      const measured = { startedAt, garminType, durationS, historyOnly };
      if (isStrengthRow(row)) {
        const decision = strengthDecisionOfRow(row, choices);
        return decision.status === 'ready' ? [{ ...measured, sets: decision.sets, picks: decision.picks }] : [];
      }
      const exercise = exercisesById.get(exerciseOfRow(row, choices)!);
      if (exercise === undefined) return [];
      return [
        { ...measured, exerciseId: exercise.id, distanceM: exercise.tracksDistance ? distanceM : null, interval },
      ];
    })
    .sort((first, second) => first.startedAt.localeCompare(second.startedAt));
}

export interface ImportSummary {
  scored: number;
  xp: number;
  historyOnly: number;
  skipped: number;
  hitDailyCap: boolean;
}

export function importSummary(outcomes: readonly GarminImportOutcome[]): ImportSummary {
  const scored = outcomes.filter((outcome) => outcome.outcome === 'imported');
  const skipped = outcomes.filter((outcome) => outcome.outcome === 'skipped');
  return {
    scored: scored.length,
    xp: scored.reduce((total, outcome) => total + outcome.xp, 0),
    historyOnly: outcomes.filter((outcome) => outcome.outcome === 'history_only').length,
    skipped: skipped.length,
    hitDailyCap: skipped.some((outcome) => outcome.reason === DAILY_CAP_REASON),
  };
}

export function importStatusText(summary: ImportSummary): string {
  const parts = [
    summary.scored > 0 ? `${formatCount(summary.scored, 'workout')} earned ${formatXp(summary.xp)} XP` : null,
    summary.historyOnly > 0 ? `${formatXp(summary.historyOnly)} saved as history only` : null,
    summary.skipped > 0 ? `${formatXp(summary.skipped)} skipped` : null,
  ].filter((part) => part !== null);
  const happened = parts.length === 0 ? 'Nothing was imported.' : `${parts.join(' · ')}.`;
  if (!summary.hitDailyCap) return happened;
  return `${happened} The daily limit of ${GARMIN_IMPORT_DAILY_CAP} imported workouts is reached; import the rest tomorrow.`;
}

export function importProblemText(answer: Exclude<InvokeOutcome<unknown>, { kind: 'ok' }>): string {
  if (answer.kind === 'needs_sign_in' || answer.kind === 'wrong_account') return 'Sign in again to import.';
  if (answer.kind === 'retryable') return 'Could not reach the server. Check your connection and try again.';
  if (answer.status === RATE_LIMITED_STATUS) return 'Too many requests in a short time. Wait a minute and try again.';
  return 'Could not import these workouts. Try again.';
}

export function fileSummary(fileName: string, activityCount: number): string {
  return `${fileName} · ${activityCount} ${activityCount === 1 ? 'activity' : 'activities'}`;
}

export const UNREADABLE_FILE_TEXT =
  'Could not read a Garmin activity from that file. In Garmin Connect on the web, open one activity and export it as a .fit file.';

export const FILE_READER_PROBLEM_TEXT = 'Could not open that file. Check your connection and try again.';

export function lastImportText(lastImportAt: string, timeZone?: string): string {
  return `Last import: ${formatActivityStart(lastImportAt, timeZone)}`;
}
