import { describe, expect, it } from 'vitest';
import { unitToKg } from '@domain/index.ts';
import { type PlateSettings } from '../../web/src/lib/plate-rules.ts';
import {
  barbellSetupFor,
  type BarSetting,
  type MarkedSet,
  programSetMarkers,
  programSetMarkerTexts,
} from '../../web/src/lib/program-set-rules.ts';
import { snapshot } from '../domain/program-fixtures/facts.ts';

const KG_BAR: BarSetting = { weight: 20, unit: 'kg' };
const LB_BAR: BarSetting = { weight: 45, unit: 'lb' };

function prescribed(weightKg: number, pct: number | null, extra: Partial<MarkedSet> = {}): MarkedSet {
  return {
    weightKg,
    prescription: snapshot('mon-squat:4', { weightKg, reps: 5 }),
    prescriptionDetail: { pct, optional: false },
    ...extra,
  };
}

describe('program set markers', () => {
  it('shows the Madcow 92.5 kg top set at 100%', () => {
    expect(programSetMarkers(prescribed(92.5, 1), 'kg')).toEqual({ pct: '100%', optional: false, adjusted: false });
  });

  it('shows a 62.5% ramp set as "62.5%"', () => {
    expect(programSetMarkers(prescribed(57.5, 0.625), 'kg').pct).toBe('62.5%');
  });

  it('marks an optional set as optional', () => {
    const backOff = prescribed(165, 0.95, { prescriptionDetail: { pct: 0.95, optional: true } });
    expect(programSetMarkers(backOff, 'kg')).toMatchObject({ pct: '95%', optional: true });
  });

  it('marks a set whose weight the user changed from the snapshot as adjusted', () => {
    const changed = { ...prescribed(92.5, 1), weightKg: 100 };
    expect(programSetMarkers(changed, 'kg')).toMatchObject({ adjusted: true });
  });

  it('does not mark a pound user adjusted for retyping the shown 203.9 lb of a 92.5 kg snapshot', () => {
    const retyped = { ...prescribed(92.5, 1), weightKg: unitToKg(203.9, 'lb') };
    expect(programSetMarkers(retyped, 'lb').adjusted).toBe(false);
  });

  it('marks a pound user adjusted for a different shown weight: 205 lb against 203.9 lb', () => {
    const changed = { ...prescribed(92.5, 1), weightKg: unitToKg(205, 'lb') };
    expect(programSetMarkers(changed, 'lb').adjusted).toBe(true);
  });

  it('does not mark the 5RM test set adjusted: its snapshot asks for any weight', () => {
    const retest: MarkedSet = {
      weightKg: 110,
      prescription: snapshot('a1-squat-t1:retest', { weightKg: 0, reps: 5 }),
      prescriptionDetail: { pct: null, optional: false },
    };
    expect(programSetMarkers(retest, 'kg')).toEqual({ pct: null, optional: false, adjusted: false });
  });

  it('shows no percentage or optional tag for a set from a draft written before prescription details', () => {
    const older: MarkedSet = { weightKg: 92.5, prescription: snapshot('mon-squat:4', { weightKg: 92.5, reps: 5 }) };
    expect(programSetMarkers(older, 'kg')).toEqual({ pct: null, optional: false, adjusted: false });
  });

  it('shows no markers at all on a set the user added, which has no prescription', () => {
    expect(programSetMarkers({ weightKg: 100, prescription: null }, 'kg')).toEqual({
      pct: null,
      optional: false,
      adjusted: false,
    });
  });
});

describe('program set marker texts', () => {
  it('reads the markers in order: percentage, optional, adjusted', () => {
    expect(programSetMarkerTexts({ pct: '95%', optional: true, adjusted: true })).toEqual([
      '95%',
      'optional',
      'adjusted',
    ]);
  });

  it('leaves out the markers a set does not have', () => {
    expect(programSetMarkerTexts({ pct: '75%', optional: false, adjusted: false })).toEqual(['75%']);
  });

  it('has no texts for a set without markers', () => {
    expect(programSetMarkerTexts({ pct: null, optional: false, adjusted: false })).toEqual([]);
  });
});

describe('barbell setup of a draft', () => {
  const settings: PlateSettings = {
    kg: { barWeight: 15, plates: [20, 10, 5] },
    lb: { barWeight: 35, plates: [45, 10] },
  };

  it('uses the bar and plates set for the unit in a freestyle draft', () => {
    expect(barbellSetupFor(settings, 'kg', null)).toEqual({ ...settings.kg, barFromProgram: false });
    expect(barbellSetupFor(settings, 'lb', null)).toEqual({ ...settings.lb, barFromProgram: false });
  });

  it('uses the bar of the followed program with the plates set for the unit', () => {
    expect(barbellSetupFor(settings, 'kg', KG_BAR)).toEqual({
      barWeight: 20,
      plates: [20, 10, 5],
      barFromProgram: true,
    });
  });

  it('keeps the bar set for the unit when the program bar is in the other unit', () => {
    expect(barbellSetupFor(settings, 'lb', KG_BAR)).toEqual({ ...settings.lb, barFromProgram: false });
    expect(barbellSetupFor(settings, 'kg', LB_BAR)).toEqual({ ...settings.kg, barFromProgram: false });
  });
});
