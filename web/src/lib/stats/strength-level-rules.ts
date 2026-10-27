import { roundTo } from '@domain/math.ts';
import { z } from 'zod';
import { type Sex } from '../profile/profile-rules.ts';
import { type BodyweightDay } from '../progress/bodyweight-trend-rules.ts';
import { type SessionProgress } from '../progress/exercise-progress-rules.ts';
import { daysBetween } from '../ui/date-bucket-rules.ts';
import { type ChartSeries } from '../ui/line-chart-rules.ts';
import { dotsScore, dotsTotalKg } from './dots-rules.ts';

export const STRENGTH_LEVELS = [
  { name: 'Beginner', fromScore: 0 },
  { name: 'Novice', fromScore: 200 },
  { name: 'Intermediate', fromScore: 275 },
  { name: 'Advanced', fromScore: 350 },
  { name: 'Elite', fromScore: 425 },
] as const;

export type StrengthLevelName = (typeof STRENGTH_LEVELS)[number]['name'];

const BAR_TOP_SCORE = 500;

export interface StrengthLevel {
  name: StrengthLevelName;
  next: { name: StrengthLevelName; pointsNeeded: number } | null;
}

function levelIndex(score: number): number {
  return Math.max(0, STRENGTH_LEVELS.filter((level) => score >= level.fromScore).length - 1);
}

export function levelRangeText(index: number): string {
  const next = STRENGTH_LEVELS[index + 1];
  return index === 0 && next ? `below ${next.fromScore}` : `${STRENGTH_LEVELS[index].fromScore}+`;
}

export function strengthLevel(score: number): StrengthLevel {
  const index = levelIndex(score);
  const next = STRENGTH_LEVELS[index + 1];
  return {
    name: STRENGTH_LEVELS[index].name,
    next: next ? { name: next.name, pointsNeeded: roundTo(2, next.fromScore - score) } : null,
  };
}

export function nextLevelText({ next }: StrengthLevel): string {
  return next ? `${next.pointsNeeded.toFixed(2)} points to ${next.name}` : 'Elite is the top level.';
}

export function strengthMeterLabel(score: number): string {
  return `Strength level ${strengthLevel(score).name}, DOTS ${score.toFixed(2)}`;
}

export function strengthLevelMarker(score: number): number {
  const index = levelIndex(score);
  const from = STRENGTH_LEVELS[index].fromScore;
  const to = STRENGTH_LEVELS[index + 1]?.fromScore ?? BAR_TOP_SCORE;
  const insideBand = Math.min(Math.max((score - from) / (to - from), 0), 1);
  return (index + insideBand) / STRENGTH_LEVELS.length;
}

export const dotsHistorySchema = z.array(z.object({ day: z.string(), totalKg: z.number(), bodyweightKg: z.number() }));

export type DotsHistoryPoint = z.infer<typeof dotsHistorySchema>[number];

interface DatedE1rm {
  localDate: string;
  e1rmKg: number;
}

function datedE1rms(sessions: readonly SessionProgress[]): DatedE1rm[] {
  return sessions
    .filter((session): session is SessionProgress & DatedE1rm => session.e1rmKg !== null)
    .sort((a, b) => a.localDate.localeCompare(b.localDate) || a.startedAt.localeCompare(b.startedAt));
}

function e1rmAsOf(sessions: readonly DatedE1rm[], day: string, windowDays: number): number | null {
  const upToDay = sessions.filter((session) => session.localDate <= day);
  const inWindow = upToDay.filter((session) => daysBetween(session.localDate, day) <= windowDays);
  if (inWindow.length > 0) return Math.max(...inWindow.map((session) => session.e1rmKg));
  return upToDay.at(-1)?.e1rmKg ?? null;
}

function bodyweightAsOf(bodyweights: readonly BodyweightDay[], day: string): number | null {
  return bodyweights.filter((entry) => entry.day <= day).at(-1)?.bodyweightKg ?? null;
}

export function dotsHistory(
  sessionsByLift: ReadonlyMap<string, readonly SessionProgress[]>,
  bodyweights: readonly BodyweightDay[],
  windowDays: number,
): DotsHistoryPoint[] {
  const lifts = [...sessionsByLift.values()].map(datedE1rms);
  const byDay = [...bodyweights].sort((a, b) => a.day.localeCompare(b.day));
  const days = [...new Set(lifts.flat().map((session) => session.localDate))].sort();
  return days.flatMap((day) => {
    const bodyweightKg = bodyweightAsOf(byDay, day);
    const e1rms = lifts.map((sessions) => e1rmAsOf(sessions, day, windowDays));
    const known = e1rms.filter((e1rmKg): e1rmKg is number => e1rmKg !== null);
    if (bodyweightKg === null || known.length < e1rms.length) return [];
    return [{ day, totalKg: dotsTotalKg(known), bodyweightKg }];
  });
}

export function withCurrentPoint(
  points: readonly DotsHistoryPoint[],
  today: string,
  totalKg: number,
  bodyweightKg: number,
): DotsHistoryPoint[] {
  return [...points.filter((point) => point.day !== today), { day: today, totalKg, bodyweightKg }];
}

export function dotsHistorySeries(points: readonly DotsHistoryPoint[], sex: Sex): ChartSeries[] {
  return [
    {
      name: 'DOTS',
      points: points.map(({ day, totalKg, bodyweightKg }) => ({
        x: Date.parse(`${day}T00:00:00Z`),
        y: dotsScore(totalKg, bodyweightKg, sex),
      })),
    },
  ];
}
