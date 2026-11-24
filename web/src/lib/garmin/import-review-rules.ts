import {
  CARDIO_BOUNDS,
  type CardioInterval,
  type GarminActivity,
  garminActivityEnd,
  type GarminImportCandidate,
  garminImportCandidate,
  type GarminRejection,
  METRES_PER_KM,
  SECONDS_PER_MINUTE,
} from '@domain/index.ts';
import type { PaceUnit } from '../exercises/catalog-rules.ts';
import { formatCount, formatXp } from '../format.ts';
import type { UnitPref } from '../profile/profile-rules.ts';
import type { InvokeOutcome } from '../platform/function-client-rules.ts';
import { RATE_LIMITED_STATUS } from '../platform/rate-limit.ts';
import { distanceUnitFor, formatDistance } from '../units.ts';
import { formatDuration } from '../workout/cardio-rules.ts';
import type { SeenGarminActivity, SeenGarminOutcome } from './seen-activities-rules.ts';

export const GARMIN_IMPORT_DAILY_CAP = 500;

const SECONDS_PER_HOUR = 3600;
const DEFAULT_PACE_UNIT: PaceUnit = 'per_km';
const UNKNOWN_MONTH = 'Unknown date';
const UNNAMED_GARMIN_TYPE = 'Activity';

export type GreyedReason =
  | 'already_imported'
  | 'deleted_earlier'
  | 'rejected_earlier'
  | 'same_start'
  | 'too_long'
  | 'too_far'
  | 'too_short'
  | 'strength'
  | 'unreadable';

export interface ReviewRow {
  id: string;
  candidate: GarminImportCandidate;
  greyed: GreyedReason | null;
}

export interface ReviewSession {
  id: string;
  startedAt: string;
  endedAt: string;
  exerciseIds: readonly string[];
}

export interface ReviewContext {
  exerciseIdByGarminType: ReadonlyMap<string, string>;
  seen: readonly SeenGarminActivity[];
  sessions: readonly ReviewSession[];
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
}

const GREYED_BY_SEEN: Record<SeenGarminOutcome, GreyedReason> = {
  imported: 'already_imported',
  deleted: 'deleted_earlier',
  rejected: 'rejected_earlier',
};

const GREYED_BY_REJECTION: Record<GarminRejection, GreyedReason> = {
  unreadable: 'unreadable',
  strength: 'strength',
  too_long: 'too_long',
  too_far: 'too_far',
  too_short: 'too_short',
};

const GREYED_TEXT: Record<GreyedReason, string> = {
  already_imported: 'Already imported',
  deleted_earlier: 'Deleted earlier',
  rejected_earlier: 'Rejected earlier',
  same_start: 'Same start as another activity',
  too_long: `Over ${CARDIO_BOUNDS.steadyDurationS.max / SECONDS_PER_HOUR} h`,
  too_far: `Over ${CARDIO_BOUNDS.distanceM.max / METRES_PER_KM} km`,
  too_short: `Under ${CARDIO_BOUNDS.steadyDurationS.min / SECONDS_PER_MINUTE} min`,
  strength: 'Strength not imported yet',
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
      if (candidate.rejection !== null) return { id, candidate, greyed: GREYED_BY_REJECTION[candidate.rejection] };
      const startedAt = candidate.startedAt!;
      const seen = seenOutcome.get(startedAt);
      if (seen !== undefined) return { id, candidate, greyed: GREYED_BY_SEEN[seen] };
      if (startsInFile.has(startedAt)) return { id, candidate, greyed: 'same_start' };
      startsInFile.add(startedAt);
      return { id, candidate, greyed: null };
    })
    .sort(newestFirst);
}

export function exerciseOfRow(row: ReviewRow, choices: ReviewChoices): string | null {
  return row.candidate.exerciseId ?? choices.exerciseByRow.get(row.id) ?? null;
}

function overlappingSession(
  row: ReviewRow,
  exerciseId: string | null,
  sessions: readonly ReviewSession[],
): ReviewSession | null {
  const { startedAt, durationS } = row.candidate;
  if (exerciseId === null || startedAt === null || durationS === null) return null;
  const activityStart = Date.parse(startedAt);
  const activityEnd = Date.parse(garminActivityEnd({ startedAt, durationS }));
  return (
    sessions.find(
      (session) =>
        session.exerciseIds.includes(exerciseId) &&
        Date.parse(session.startedAt) <= activityEnd &&
        activityStart <= Date.parse(session.endedAt),
    ) ?? null
  );
}

function canBeChosen(row: ReviewRow, choices: ReviewChoices): boolean {
  return row.greyed === null && exerciseOfRow(row, choices) !== null;
}

export function isChosen(row: ReviewRow, choices: ReviewChoices): boolean {
  return canBeChosen(row, choices) && choices.selected.has(row.id);
}

export function initialChoices(rows: readonly ReviewRow[], sessions: readonly ReviewSession[]): ReviewChoices {
  const selected = rows
    .filter((row) => row.greyed === null && row.candidate.exerciseId !== null)
    .filter((row) => overlappingSession(row, row.candidate.exerciseId, sessions) === null)
    .map((row) => row.id);
  return { selected: new Set(selected), exerciseByRow: new Map() };
}

function withSelection(choices: ReviewChoices, rowIds: readonly string[], on: boolean): ReviewChoices {
  const selected = new Set(choices.selected);
  for (const rowId of rowIds) {
    if (on) selected.add(rowId);
    else selected.delete(rowId);
  }
  return { ...choices, selected };
}

export function withRowToggled(
  rows: readonly ReviewRow[],
  choices: ReviewChoices,
  rowId: string,
  on: boolean,
): ReviewChoices {
  const row = rows.find((candidate) => candidate.id === rowId);
  if (row === undefined || !canBeChosen(row, choices)) return choices;
  return withSelection(choices, [rowId], on);
}

export function withExercisePicked(
  rows: readonly ReviewRow[],
  choices: ReviewChoices,
  sessions: readonly ReviewSession[],
  rowId: string,
  exerciseId: string,
): ReviewChoices {
  const row = rows.find((candidate) => candidate.id === rowId);
  if (row === undefined || row.greyed !== null) return choices;
  const picked = { ...choices, exerciseByRow: new Map([...choices.exerciseByRow, [rowId, exerciseId]]) };
  return withSelection(picked, [rowId], overlappingSession(row, exerciseId, sessions) === null);
}

export function withAllToggled(rows: readonly ReviewRow[], choices: ReviewChoices, on: boolean): ReviewChoices {
  const rowIds = rows.filter((row) => canBeChosen(row, choices)).map((row) => row.id);
  return withSelection(choices, rowIds, on);
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

interface TimeParts {
  weekday: string;
  day: string;
  month: string;
  hour: string;
  minute: string;
}

function startParts(startedAt: string, timeZone: string | undefined): TimeParts {
  const parts = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).formatToParts(new Date(startedAt));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? '';
  return {
    weekday: part('weekday'),
    day: part('day'),
    month: part('month'),
    hour: part('hour'),
    minute: part('minute'),
  };
}

export function formatActivityStart(startedAt: string, timeZone?: string): string {
  const { weekday, day, month, hour, minute } = startParts(startedAt, timeZone);
  return `${weekday} ${day} ${month}, ${hour}:${minute}`;
}

export function garminTypeLabel(garminType: string | null): string {
  if (garminType === null) return UNNAMED_GARMIN_TYPE;
  const words = garminType.replaceAll('_', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function rowTitle(row: ReviewRow, timeZone?: string): string {
  const type = garminTypeLabel(row.candidate.garminType);
  return row.candidate.startedAt === null
    ? type
    : `${formatActivityStart(row.candidate.startedAt, timeZone)} · ${type}`;
}

function intervalText(interval: CardioInterval): string {
  return `${interval.rounds} × ${formatDuration(interval.workS)} / ${formatDuration(interval.restS)} rest`;
}

export function rowFacts(
  row: ReviewRow,
  choices: ReviewChoices,
  exercisesById: ReadonlyMap<string, ReviewExercise>,
  unit: UnitPref,
): string {
  const { durationS, distanceM, interval } = row.candidate;
  const exercise = exercisesById.get(exerciseOfRow(row, choices) ?? '');
  const showsDistance = distanceM !== null && (exercise?.tracksDistance ?? true);
  return [
    exercise?.name,
    durationS === null ? null : formatDuration(durationS),
    showsDistance ? formatDistance(distanceM, distanceUnitFor(unit, exercise?.paceUnit ?? DEFAULT_PACE_UNIT)) : null,
    interval === null ? null : intervalText(interval),
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
  const exerciseId = exerciseOfRow(row, choices);
  if (exerciseId === null) return { kind: 'needs_exercise', text: 'Needs an exercise' };
  const duplicate = overlappingSession(row, exerciseId, sessions);
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
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone }).format(new Date(startedAt));
}

export function reviewMonths(rows: readonly ReviewRow[], timeZone?: string): ReviewMonth[] {
  const months: ReviewMonth[] = [];
  for (const row of rows) {
    const label = monthLabel(row.candidate.startedAt, timeZone);
    const month = months.find((entry) => entry.label === label);
    if (month === undefined) months.push({ label, rows: [row] });
    else month.rows.push(row);
  }
  return months;
}

export function reviewRange(rows: readonly ReviewRow[]): { from: string; to: string } | null {
  const spans = rows.flatMap(({ candidate: { startedAt, durationS } }) =>
    startedAt === null || durationS === null
      ? []
      : [{ startedAt, endedAt: garminActivityEnd({ startedAt, durationS }) }],
  );
  if (spans.length === 0) return null;
  return {
    from: spans.map((span) => span.startedAt).reduce((earliest, start) => (start < earliest ? start : earliest)),
    to: spans.map((span) => span.endedAt).reduce((latest, end) => (end > latest ? end : latest)),
  };
}

export interface ActivityToImport {
  startedAt: string;
  garminType: string | null;
  exerciseId: string;
  durationS: number;
  distanceM: number | null;
  interval: CardioInterval | null;
  historyOnly: boolean;
}

export function activitiesToImport(
  rows: readonly ReviewRow[],
  choices: ReviewChoices,
  exercisesById: ReadonlyMap<string, ReviewExercise>,
): ActivityToImport[] {
  return rows
    .filter((row) => isChosen(row, choices))
    .flatMap((row): ActivityToImport[] => {
      const exercise = exercisesById.get(exerciseOfRow(row, choices)!);
      const { startedAt, garminType, durationS, distanceM, interval, historyOnly } = row.candidate;
      if (exercise === undefined || startedAt === null || durationS === null) return [];
      return [
        {
          startedAt,
          garminType,
          exerciseId: exercise.id,
          durationS,
          distanceM: exercise.tracksDistance ? distanceM : null,
          interval,
          historyOnly,
        },
      ];
    })
    .sort((first, second) => first.startedAt.localeCompare(second.startedAt));
}

export type ImportOutcome =
  | { startedAt: string; outcome: 'imported'; sessionId: string; xp: number }
  | { startedAt: string; outcome: 'history_only'; sessionId: string }
  | { startedAt: string; outcome: 'skipped'; reason: string };

export interface ImportSummary {
  scored: number;
  xp: number;
  historyOnly: number;
  skipped: number;
  hitDailyCap: boolean;
}

const DAILY_CAP_REASON = 'daily_cap';

export function importSummary(outcomes: readonly ImportOutcome[]): ImportSummary {
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

export function reviewExercises(
  exercises: readonly { id: string; name: string; activity: { tracksDistance: boolean; paceUnit: PaceUnit } }[],
): Map<string, ReviewExercise> {
  return new Map(
    exercises.map(({ id, name, activity: { tracksDistance, paceUnit } }) => [
      id,
      { id, name, tracksDistance, paceUnit },
    ]),
  );
}

export const UNREADABLE_FILE_TEXT =
  'Could not read a Garmin activity from that file. In Garmin Connect on the web, open one activity and export it as a .fit file.';

export const FILE_READER_PROBLEM_TEXT = 'Could not open that file. Check your connection and try again.';

export function lastImportText(lastImportAt: string, timeZone?: string): string {
  return `Last import: ${formatActivityStart(lastImportAt, timeZone)}`;
}
