import { shownWeight, type WeightUnit } from '@domain/index.ts';
import { type DraftSet } from '../offline/draft-format.ts';
import { type BarbellSetup, type PlateSettings } from './plate-rules.ts';
import { pctLabel } from './program-enroll-rules.ts';
import { type ActiveProgram } from './program-today-rules.ts';

export interface BarSetting {
  weight: number;
  unit: WeightUnit;
}

export interface ProgramSetMarkers {
  pct: string | null;
  optional: boolean;
  adjusted: boolean;
}

export type MarkedSet = Pick<DraftSet, 'weightKg' | 'prescription' | 'prescriptionDetail'>;

export function draftBar(program: ActiveProgram, draftEnrollmentId: string | null): BarSetting | null {
  if (program.kind !== 'ready' || program.enrollment.id !== draftEnrollmentId) return null;
  return { weight: program.enrollment.rounding.barWeight, unit: program.enrollment.unit };
}

export interface DraftBarbellSetup extends BarbellSetup {
  barFromProgram: boolean;
}

export function barbellSetupFor(
  settings: PlateSettings,
  unit: WeightUnit,
  programBar: BarSetting | null,
): DraftBarbellSetup {
  const setup = settings[unit];
  return programBar !== null && programBar.unit === unit
    ? { ...setup, barWeight: programBar.weight, barFromProgram: true }
    : { ...setup, barFromProgram: false };
}

export function programSetMarkers(set: MarkedSet, unit: WeightUnit): ProgramSetMarkers {
  const { prescription, prescriptionDetail } = set;
  if (!prescription) return { pct: null, optional: false, adjusted: false };
  const pct = prescriptionDetail?.pct ?? null;
  return {
    pct: pct === null ? null : pctLabel(pct),
    optional: prescriptionDetail?.optional ?? false,
    adjusted: shownWeight(set.weightKg, unit) !== shownWeight(prescription.weightKg, unit),
  };
}

export function programSetMarkerTexts(markers: ProgramSetMarkers): string[] {
  return [markers.pct, markers.optional ? 'optional' : null, markers.adjusted ? 'adjusted' : null].filter(
    (text) => text !== null,
  );
}
