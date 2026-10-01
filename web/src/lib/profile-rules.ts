import { CONTROL_CHARACTER } from './names.ts';

export type UnitPref = 'kg' | 'lb';
export type EffortInputMode = 'level' | 'rir' | 'rpe';
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
export const LOWEST_BODYWEIGHT_KG = 20;
export const HIGHEST_BODYWEIGHT_KG = 400;
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
