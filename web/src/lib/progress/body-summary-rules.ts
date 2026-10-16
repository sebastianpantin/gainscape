import { BODY_SKILLS, type BodySkill, recoveryState, type RecoveryState } from './recovery-rules.ts';
import { type MuscleVolume } from './weekly-volume-rules.ts';

function countIn(load: Readonly<Record<BodySkill, number>>, state: RecoveryState): number {
  return BODY_SKILLS.filter((skill) => recoveryState(load[skill]) === state).length;
}

function recoveryPart(load: Readonly<Record<BodySkill, number>>): string {
  const recovering = countIn(load, 'recovering');
  if (recovering > 0) return `${recovering} recovering`;
  const easing = countIn(load, 'easing');
  return easing > 0 ? `${easing} almost fresh` : 'all fresh';
}

function volumePart(volume: Readonly<Record<BodySkill, MuscleVolume>>): string {
  const reached = BODY_SKILLS.filter((skill) => volume[skill].band !== 'below').length;
  return `${reached} of ${BODY_SKILLS.length} at target`;
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
