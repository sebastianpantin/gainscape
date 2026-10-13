import { formatXp } from '../../lib/format.ts';
import type { SkillStanding } from '../../lib/standing-rules.ts';
import type { WeeklyGoalStatus } from '../../lib/weekly-goal-rules.ts';

export function greetingFor(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 18) return 'Good afternoon';
  if (hour >= 18 && hour < 23) return 'Good evening';
  return 'Late one tonight';
}

export function levelCountStart(seen: number | null, current: number): number {
  return seen !== null && seen < current ? seen : current;
}

export interface NearestLevelUp {
  skillName: string;
  xpToGo: number;
  nextLevel: number;
}

export function nearestLevelUp(skills: readonly SkillStanding[]): NearestLevelUp | null {
  let nearest: NearestLevelUp | null = null;
  for (const { skill, progress } of skills) {
    if (progress.xp <= 0 || progress.nextLevelXp === null) continue;
    const xpToGo = progress.nextLevelXp - progress.xp;
    if (nearest === null || xpToGo < nearest.xpToGo) {
      nearest = { skillName: skill.name, xpToGo, nextLevel: progress.level + 1 };
    }
  }
  return nearest;
}

export function nearestLevelUpText({ skillName, xpToGo, nextLevel }: NearestLevelUp): string {
  return `${skillName} is ${formatXp(xpToGo)} XP from level ${nextLevel}`;
}

const DAYS_IN_WEEK = 7;
const MS_PER_DAY = 86_400_000;
const WARNING_DAYS = 3;
const SPARE_DAYS_BEFORE_WARNING = 1;
const MOST_WORKOUTS_A_DAY = 2;

function daysLeftInWeek(weekStart: string, now: Date): number | null {
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const daysSinceWeekStart = Math.round((today - Date.parse(`${weekStart}T00:00:00Z`)) / MS_PER_DAY);
  if (daysSinceWeekStart < 0 || daysSinceWeekStart >= DAYS_IN_WEEK) return null;
  return DAYS_IN_WEEK - daysSinceWeekStart;
}

export function streakRiskText(status: WeeklyGoalStatus, now: Date): string | null {
  if (status.goal === null) return null;
  const needed = status.goal - status.sessionsThisWeek;
  const daysLeft = daysLeftInWeek(status.weekStart, now);
  if (needed <= 0 || daysLeft === null || daysLeft > WARNING_DAYS) return null;
  if (daysLeft - needed > SPARE_DAYS_BEFORE_WARNING || needed > daysLeft * MOST_WORKOUTS_A_DAY) return null;
  const workouts = needed === 1 ? 'workout' : 'workouts';
  const deadline = daysLeft === 1 ? 'today' : 'by Sunday';
  const stakes = status.streakWeeks > 0 ? `keeps your ${status.streakWeeks} week streak` : 'hits your weekly goal';
  return `${needed} more ${workouts} ${deadline} ${stakes}`;
}
