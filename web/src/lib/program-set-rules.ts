import { type WeightUnit } from '@domain/index.ts';
import { type DraftSet } from '../offline/draft-format.ts';

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
  throw new Error(
    `programSetMarkers is not implemented: ${set.weightKg} kg shown in ${unit} on ${JSON.stringify(bar)}`,
  );
}

export function programSetMarkerTexts(markers: ProgramSetMarkers): string[] {
  throw new Error(`programSetMarkerTexts is not implemented: ${JSON.stringify(markers)}`);
}
