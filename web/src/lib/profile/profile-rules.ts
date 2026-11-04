import { MS_PER_DAY } from '@domain/math.ts';
import { roundTo } from '@domain/math.ts';
import { z } from 'zod';
import { CONTROL_CHARACTER, characterCount } from '../names.ts';
import { type Parsed } from '../parsed.ts';
import { columnsOf, nullableNumber, numericColumn } from '../rows.ts';
import { TOKEN_COLORS } from '../ui/token-colors.ts';
import { cmToFeetAndInches, feetAndInchesToCm, kgToUnit, parsedDecimal, unitToKg } from '../units.ts';

export const UNIT_PREFS = ['kg', 'lb'] as const;
export const EFFORT_INPUT_MODES = ['level', 'rir', 'rpe'] as const;
export const SEXES = ['male', 'female'] as const;
export type UnitPref = (typeof UNIT_PREFS)[number];
export type EffortInputMode = (typeof EFFORT_INPUT_MODES)[number];
export type Sex = (typeof SEXES)[number];

export const UNIT_OPTIONS: { value: UnitPref; label: string }[] = [
  { value: 'kg', label: 'Kilograms' },
  { value: 'lb', label: 'Pounds' },
];
export type TrainingFocus = 'strength' | 'muscle' | 'powerlifting' | 'general';
export type BadgeColor = 'gold' | 'blue' | 'green' | 'rust' | 'stone';

export interface Profile {
  username: string;
  displayName: string;
  bio: string | null;
  trainingFocus: TrainingFocus | null;
  trainingSince: number | null;
  badgeColor: BadgeColor;
  showWeights: boolean;
  showBodyweight: boolean;
  createdAt: string;
  bodyweightKg: number | null;
  heightCm: number | null;
  birthYear: number | null;
  sex: Sex | null;
  unitPref: UnitPref;
  effortInputMode: EffortInputMode;
  timezone: string;
  timezoneChangedAt: string | null;
}

export const DISPLAY_NAME_MAX_LENGTH = 40;
export const BIO_MAX_LENGTH = 80;
const LOWEST_BODYWEIGHT_KG = 20;
const HIGHEST_BODYWEIGHT_KG = 400;
const LOWEST_HEIGHT_CM = 100;
const HIGHEST_HEIGHT_CM = 250;
const EARLIEST_BIRTH_YEAR = 1900;
const MINIMUM_AGE_YEARS = 13;
const EARLIEST_TRAINING_YEAR = 1950;
export const TIMEZONE_CHANGE_COOLDOWN_DAYS = 7;

export const TRAINING_FOCUS_LABELS: Record<TrainingFocus, string> = {
  strength: 'Strength',
  muscle: 'Muscle',
  powerlifting: 'Powerlifting',
  general: 'General fitness',
};

export const BADGE_COLORS: Record<BadgeColor, { label: string; fill: string; light: string; dark: string }> = {
  gold: {
    label: 'Gold',
    fill: TOKEN_COLORS.accent,
    light: TOKEN_COLORS['accent-light'],
    dark: TOKEN_COLORS['accent-dark'],
  },
  blue: { label: 'Blue', fill: TOKEN_COLORS['art-rare'], light: '#a9cbea', dark: '#3f6f99' },
  green: { label: 'Green', fill: TOKEN_COLORS.xp, light: TOKEN_COLORS['xp-light'], dark: TOKEN_COLORS['xp-dark'] },
  rust: { label: 'Rust', fill: '#e0823d', light: '#f0ab78', dark: '#9c5220' },
  stone: { label: 'Stone', fill: '#a9b4bd', light: '#d2d9de', dark: '#6f7a83' },
};

export const TRAINING_FOCUSES = Object.keys(TRAINING_FOCUS_LABELS) as TrainingFocus[];
export const BADGE_COLOR_KEYS = Object.keys(BADGE_COLORS) as BadgeColor[];

export const profileRowSchema = z.object({
  username: z.string(),
  display_name: z.string(),
  bio: z.string().nullable(),
  training_focus: z.enum(TRAINING_FOCUSES).nullable(),
  training_since: z.number().nullable(),
  badge_color: z.enum(BADGE_COLOR_KEYS),
  show_weights: z.boolean(),
  show_bodyweight: z.boolean(),
  created_at: z.string(),
});

export const profilePrivateRowSchema = z.object({
  bodyweight_kg: numericColumn.nullable(),
  height_cm: numericColumn.nullable(),
  birth_year: z.number().nullable(),
  sex: z.enum(SEXES).nullable(),
  unit_pref: z.enum(UNIT_PREFS),
  effort_input_mode: z.enum(EFFORT_INPUT_MODES),
  timezone: z.string(),
  timezone_changed_at: z.string().nullable(),
});

export const PROFILE_COLUMNS = columnsOf(profileRowSchema);
export const PROFILE_PRIVATE_COLUMNS = columnsOf(profilePrivateRowSchema);

export function profileFromRows(
  publicRow: z.infer<typeof profileRowSchema>,
  privateRow: z.infer<typeof profilePrivateRowSchema>,
): Profile {
  return {
    username: publicRow.username,
    displayName: publicRow.display_name,
    bio: publicRow.bio,
    trainingFocus: publicRow.training_focus,
    trainingSince: publicRow.training_since,
    badgeColor: publicRow.badge_color,
    showWeights: publicRow.show_weights,
    showBodyweight: publicRow.show_bodyweight,
    createdAt: publicRow.created_at,
    bodyweightKg: nullableNumber(privateRow.bodyweight_kg),
    heightCm: nullableNumber(privateRow.height_cm),
    birthYear: privateRow.birth_year,
    sex: privateRow.sex,
    unitPref: privateRow.unit_pref,
    effortInputMode: privateRow.effort_input_mode,
    timezone: privateRow.timezone,
    timezoneChangedAt: privateRow.timezone_changed_at,
  };
}

function withinRange(value: number | null, lowest: number, highest: number, message: string): Parsed<number | null> {
  if (value === null || (value >= lowest && value <= highest)) return { kind: 'ok', value };
  return { kind: 'problem', problem: message };
}

function parsedYear(
  raw: string,
  earliest: number,
  latest: number,
  label: string,
  example: number,
): Parsed<number | null> {
  const year = optionalNumber(raw);
  if (year !== null && !Number.isInteger(year)) return { kind: 'problem', problem: `Enter a year like ${example}.` };
  return withinRange(year, earliest, latest, `${label} must be between ${earliest} and ${latest}.`);
}

export function latestBirthYear(now = new Date()): number {
  return now.getUTCFullYear() - MINIMUM_AGE_YEARS;
}

export function parsedBirthYear(raw: string, now = new Date()): Parsed<number | null> {
  return parsedYear(raw, EARLIEST_BIRTH_YEAR, latestBirthYear(now), 'Birth year', 1990);
}

export function parsedTrainingSince(raw: string, now = new Date()): Parsed<number | null> {
  return parsedYear(raw, EARLIEST_TRAINING_YEAR, now.getUTCFullYear(), 'Training since', 2019);
}

export function parsedBio(raw: string): Parsed<string | null> {
  const bio = raw.trim();
  if (characterCount(bio) > BIO_MAX_LENGTH)
    return { kind: 'problem', problem: `Bio can be at most ${BIO_MAX_LENGTH} characters.` };
  if (CONTROL_CHARACTER.test(bio))
    return { kind: 'problem', problem: "Bio can't contain line breaks or control characters." };
  return { kind: 'ok', value: bio === '' ? null : bio };
}

export function ageFrom(birthYear: number | null, now = new Date()): number | null {
  return birthYear === null ? null : now.getUTCFullYear() - birthYear;
}

export function initialsFor(displayName: string, username: string): string {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return (words[0] ?? username).slice(0, 2).toUpperCase();
}

export function nextTimezoneChangeAt(profile: Pick<Profile, 'timezoneChangedAt'>, now = new Date()): Date | null {
  if (!profile.timezoneChangedAt) return null;
  const next = new Date(profile.timezoneChangedAt);
  next.setUTCDate(next.getUTCDate() + TIMEZONE_CHANGE_COOLDOWN_DAYS);
  return next.getTime() > now.getTime() ? next : null;
}

export function cooldownStartFor(nextAllowedAt: string): string {
  return new Date(new Date(nextAllowedAt).getTime() - TIMEZONE_CHANGE_COOLDOWN_DAYS * MS_PER_DAY).toISOString();
}

export function formatDay(date: Date): string {
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function optionalNumber(raw: string): number | null {
  return raw.trim() === '' ? null : (parsedDecimal(raw) ?? Number.NaN);
}

export function bodyweightRangeInUnit(unit: UnitPref): { lowest: number; highest: number } {
  return {
    lowest: Math.ceil(kgToUnit(LOWEST_BODYWEIGHT_KG, unit)),
    highest: Math.floor(kgToUnit(HIGHEST_BODYWEIGHT_KG, unit)),
  };
}

export function parsedBodyweightKg(raw: string, unit: UnitPref): Parsed<number | null> {
  const typed = optionalNumber(raw);
  const { lowest, highest } = bodyweightRangeInUnit(unit);
  return withinRange(
    typed === null ? null : unitToKg(typed, unit),
    LOWEST_BODYWEIGHT_KG,
    HIGHEST_BODYWEIGHT_KG,
    `Bodyweight must be between ${lowest} and ${highest} ${unit}.`,
  );
}

export const BODYWEIGHT_OFFLINE_TEXT = "You're offline. Saving bodyweight needs a connection.";

export const BODYWEIGHT_NUDGE_STEP: Record<UnitPref, number> = { kg: 0.1, lb: 0.2 };

export function nudgedBodyweightKg(bodyweightKg: number, direction: 1 | -1, unit: UnitPref): number {
  const inUnit = kgToUnit(bodyweightKg, unit) + direction * BODYWEIGHT_NUDGE_STEP[unit];
  const nextKg = unitToKg(roundTo(1, inUnit), unit);
  return Math.min(HIGHEST_BODYWEIGHT_KG, Math.max(LOWEST_BODYWEIGHT_KG, nextKg));
}

export interface HeightInput {
  cm: string;
  feet: string;
  inches: string;
}

export function initialHeight(heightCm: number | null): HeightInput {
  if (heightCm === null) return { cm: '', feet: '', inches: '' };
  const { feet, inches } = cmToFeetAndInches(heightCm);
  return { cm: String(heightCm), feet: String(feet), inches: String(inches) };
}

export function sameHeightInput(a: HeightInput, b: HeightInput, unit: UnitPref): boolean {
  return unit === 'kg' ? a.cm === b.cm : a.feet === b.feet && a.inches === b.inches;
}

const HIGHEST_INCHES = 11;

function wholeCount(raw: string): number | null {
  const count = raw.trim() === '' ? 0 : parsedDecimal(raw);
  return count !== null && Number.isInteger(count) && count >= 0 ? count : null;
}

function typedHeightCm(input: HeightInput, unit: UnitPref): Parsed<number | null> {
  if (unit === 'kg') return { kind: 'ok', value: optionalNumber(input.cm) };
  if (input.feet.trim() === '' && input.inches.trim() === '') return { kind: 'ok', value: null };
  const feet = wholeCount(input.feet);
  const inches = wholeCount(input.inches);
  if (feet === null || inches === null || inches > HIGHEST_INCHES)
    return { kind: 'problem', problem: 'Enter whole feet and 0–11 inches.' };
  return { kind: 'ok', value: feetAndInchesToCm({ feet, inches }) };
}

export function parsedHeightCm(input: HeightInput, unit: UnitPref): Parsed<number | null> {
  const typed = typedHeightCm(input, unit);
  if (typed.kind === 'problem') return typed;
  return withinRange(
    typed.value,
    LOWEST_HEIGHT_CM,
    HIGHEST_HEIGHT_CM,
    `Height must be between ${LOWEST_HEIGHT_CM} and ${HIGHEST_HEIGHT_CM} cm.`,
  );
}

const SERVER_RULE_MESSAGES: Record<string, string> = {
  training_since_in_future: "Training since can't be in the future.",
  birth_year_too_recent: 'You need to be at least 13 to use Gainscape.',
};

export function saveProblemText(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error
        ? String(error.message)
        : '';
  return SERVER_RULE_MESSAGES[message] ?? (message || 'Could not save your profile.');
}

export function previousValues<K extends keyof Profile>(
  profile: Profile,
  changes: Partial<Pick<Profile, K>>,
): Pick<Profile, K> {
  return Object.fromEntries(Object.keys(changes).map((key) => [key, profile[key as K]])) as Pick<Profile, K>;
}
