import { shownWeight, type WeightUnit } from '@domain/index.ts';
import { type DraftSet } from '../offline/draft-format.ts';
import { platesLabel, platesPerSide } from './plate-rules.ts';
import { pctLabel } from './program-enroll-rules.ts';

export interface BarSetting {
  weight: number;
  unit: WeightUnit;
}

export interface ProgramSetMarkers {
  pct: string | null;
  optional: boolean;
  adjusted: boolean;
  plates: string | null;
}

export type MarkedSet = Pick<DraftSet, 'weightKg' | 'prescription' | 'prescriptionDetail'>;

export function programSetMarkers(set: MarkedSet, unit: WeightUnit, bar: BarSetting | null): ProgramSetMarkers {
  const { prescription, prescriptionDetail } = set;
  if (!prescription) return { pct: null, optional: false, adjusted: false, plates: null };
  const pct = prescriptionDetail?.pct ?? null;
  const shown = shownWeight(set.weightKg, unit);
  const plates = bar !== null && bar.unit === unit ? platesLabel(platesPerSide(shown, bar.weight, unit)) : null;
  return {
    pct: pct === null ? null : pctLabel(pct),
    optional: prescriptionDetail?.optional ?? false,
    adjusted: shown !== shownWeight(prescription.weightKg, unit),
    plates,
  };
}

export function programSetMarkerTexts(markers: ProgramSetMarkers): string[] {
  return [
    markers.pct,
    markers.optional ? 'optional' : null,
    markers.adjusted ? 'adjusted' : null,
    markers.plates,
  ].filter((text) => text !== null);
}
