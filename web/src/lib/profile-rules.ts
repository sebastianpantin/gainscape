import { CONTROL_CHARACTER } from './names.ts';
import { cmToFeetAndInches, feetAndInchesToCm, kgToUnit, parsedDecimal, unitToKg } from './units.ts';

export const UNIT_PREFS = ['kg', 'lb'] as const;
export const EFFORT_INPUT_MODES = ['level', 'rir', 'rpe'] as const;
export type UnitPref = (typeof UNIT_PREFS)[number];
export type EffortInputMode = (typeof EFFORT_INPUT_MODES)[number];
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
  gold: { label: 'Gold', fill: '#ffb000', light: '#ffd166', dark: '#b87d00' },
  blue: { label: 'Blue', fill: '#6fa8dc', light: '#a9cbea', dark: '#3f6f99' },
  green: { label: 'Green', fill: '#7fd46a', light: '#b5f0a4', dark: '#4e8f3f' },
  rust: { label: 'Rust', fill: '#e0823d', light: '#f0ab78', dark: '#9c5220' },
  stone: { label: 'Stone', fill: '#a9b4bd', light: '#d2d9de', dark: '#6f7a83' },
};

export const TRAINING_FOCUSES = Object.keys(TRAINING_FOCUS_LABELS) as TrainingFocus[];
export const BADGE_COLOR_KEYS = Object.keys(BADGE_COLORS) as BadgeColor[];

function rangeProblem(raw: string, lowest: number, highest: number, message: string): string | null {
  if (raw.trim() === '') return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < lowest || value > highest) return message;
  return null;
}

export function heightProblem(raw: string): string | null {
  return rangeProblem(
    raw,
    LOWEST_HEIGHT_CM,
    HIGHEST_HEIGHT_CM,
    `Height must be between ${LOWEST_HEIGHT_CM} and ${HIGHEST_HEIGHT_CM} cm.`,
  );
}

export function latestBirthYear(now = new Date()): number {
  return now.getUTCFullYear() - MINIMUM_AGE_YEARS;
}

export function birthYearProblem(raw: string, now = new Date()): string | null {
  if (raw.trim() !== '' && !Number.isInteger(Number(raw))) return 'Enter a year like 1990.';
  return rangeProblem(
    raw,
    EARLIEST_BIRTH_YEAR,
    latestBirthYear(now),
    `Birth year must be between ${EARLIEST_BIRTH_YEAR} and ${latestBirthYear(now)}.`,
  );
}

export function trainingSinceProblem(raw: string, now = new Date()): string | null {
  if (raw.trim() !== '' && !Number.isInteger(Number(raw))) return 'Enter a year like 2019.';
  return rangeProblem(
    raw,
    EARLIEST_TRAINING_YEAR,
    now.getUTCFullYear(),
    `Training since must be between ${EARLIEST_TRAINING_YEAR} and ${now.getUTCFullYear()}.`,
  );
}

export function bioProblem(raw: string): string | null {
  if (raw.length > BIO_MAX_LENGTH) return `Bio can be at most ${BIO_MAX_LENGTH} characters.`;
  if (CONTROL_CHARACTER.test(raw)) return "Bio can't contain line breaks or control characters.";
  return null;
}

export function ageFrom(birthYear: number | null, now = new Date()): number | null {
  return birthYear === null ? null : now.getUTCFullYear() - birthYear;
}

export function initialsFor(displayName: string, username: string): string {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return (words[0] ?? username).slice(0, 2).toUpperCase();
}

const DAY_MS = 86_400_000;

export function nextTimezoneChangeAt(profile: Pick<Profile, 'timezoneChangedAt'>, now = new Date()): Date | null {
  if (!profile.timezoneChangedAt) return null;
  const next = new Date(profile.timezoneChangedAt);
  next.setUTCDate(next.getUTCDate() + TIMEZONE_CHANGE_COOLDOWN_DAYS);
  return next.getTime() > now.getTime() ? next : null;
}

export function cooldownStartFor(nextAllowedAt: string): string {
  return new Date(new Date(nextAllowedAt).getTime() - TIMEZONE_CHANGE_COOLDOWN_DAYS * DAY_MS).toISOString();
}

export function formatDay(date: Date): string {
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function optionalNumber(raw: string): number | null {
  return raw.trim() === '' ? null : Number(raw);
}

export function bodyweightRangeInUnit(unit: UnitPref): { lowest: number; highest: number } {
  return {
    lowest: Math.ceil(kgToUnit(LOWEST_BODYWEIGHT_KG, unit)),
    highest: Math.floor(kgToUnit(HIGHEST_BODYWEIGHT_KG, unit)),
  };
}

export function bodyweightKgFromInput(raw: string, unit: UnitPref): number | null {
  if (raw.trim() === '') return null;
  return unitToKg(parsedDecimal(raw) ?? Number.NaN, unit);
}

export function bodyweightInUnitProblem(raw: string, unit: UnitPref): string | null {
  const kg = bodyweightKgFromInput(raw, unit);
  if (kg === null) return null;
  if (!Number.isFinite(kg) || kg < LOWEST_BODYWEIGHT_KG || kg > HIGHEST_BODYWEIGHT_KG) {
    const { lowest, highest } = bodyweightRangeInUnit(unit);
    return `Bodyweight must be between ${lowest} and ${highest} ${unit}.`;
  }
  return null;
}

export const BODYWEIGHT_NUDGE_STEP: Record<UnitPref, number> = { kg: 0.1, lb: 0.2 };

export function nudgedBodyweightKg(bodyweightKg: number, direction: 1 | -1, unit: UnitPref): number {
  const inUnit = kgToUnit(bodyweightKg, unit) + direction * BODYWEIGHT_NUDGE_STEP[unit];
  const nextKg = unitToKg(Math.round(inUnit * 10) / 10, unit);
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

function feetAndInchesBlank(input: HeightInput): boolean {
  return input.feet.trim() === '' && input.inches.trim() === '';
}

export function heightInCm(input: HeightInput, unit: UnitPref): number | null {
  if (unit === 'kg') return optionalNumber(input.cm);
  if (feetAndInchesBlank(input)) return null;
  return feetAndInchesToCm({ feet: Number(input.feet || 0), inches: Number(input.inches || 0) });
}

export function sameHeightInput(a: HeightInput, b: HeightInput, unit: UnitPref): boolean {
  return unit === 'kg' ? a.cm === b.cm : a.feet === b.feet && a.inches === b.inches;
}

const HIGHEST_INCHES = 11;

export function feetAndInchesProblem(input: HeightInput, unit: UnitPref): string | null {
  if (unit === 'kg' || feetAndInchesBlank(input)) return null;
  const feet = Number(input.feet || 0);
  const inches = Number(input.inches || 0);
  if (!Number.isInteger(feet) || feet < 0 || !Number.isInteger(inches) || inches < 0 || inches > HIGHEST_INCHES)
    return 'Enter whole feet and 0–11 inches.';
  return null;
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
