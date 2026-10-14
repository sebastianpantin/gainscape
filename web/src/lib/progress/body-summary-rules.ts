import { BODY_SKILLS, type BodySkill, recoveryState } from './recovery-rules.ts';
import { type MuscleVolume } from './weekly-volume-rules.ts';

function recoveryPart(load: Readonly<Record<BodySkill, number>>): string {
  const recovering = BODY_SKILLS.filter((skill) => recoveryState(load[skill]) !== 'fresh').length;
  return recovering === 0 ? 'all fresh' : `${recovering} recovering`;
}

function volumePart(volume: Readonly<Record<BodySkill, MuscleVolume>>): string {
  const under = BODY_SKILLS.filter((skill) => volume[skill].band === 'below').length;
  return under === 0 ? 'none under target' : `${under} under target`;
}

export function bodySummaryText(
  load: Readonly<Record<BodySkill, number>> | null,
  volume: Readonly<Record<BodySkill, MuscleVolume>> | null,
): string | null {
  const parts = [load && recoveryPart(load), volume && volumePart(volume)].filter((part) => part !== null);
  if (parts.length === 0) return null;
  const text = parts.join(' · ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}
