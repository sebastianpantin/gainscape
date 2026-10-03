import { describe, expect, it } from 'vitest';
import { unitToKg } from '@domain/index.ts';
import {
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
  it('shows the Madcow 92.5 kg top set at 100% with 25 + 10 + 1.25 per side on a 20 kg bar', () => {
    expect(programSetMarkers(prescribed(92.5, 1), 'kg', KG_BAR)).toEqual({
      pct: '100%',
      optional: false,
      adjusted: false,
      plates: '25 + 10 + 1.25 per side',
    });
  });

  it('shows a 62.5% ramp set as "62.5%"', () => {
    expect(programSetMarkers(prescribed(57.5, 0.625), 'kg', KG_BAR).pct).toBe('62.5%');
  });

  it('marks an optional set as optional', () => {
    const backOff = prescribed(165, 0.95, { prescriptionDetail: { pct: 0.95, optional: true } });
    expect(programSetMarkers(backOff, 'kg', KG_BAR)).toMatchObject({ pct: '95%', optional: true });
  });

  it('marks a set whose weight the user changed from the snapshot as adjusted, with plates for the new weight', () => {
    const changed = { ...prescribed(92.5, 1), weightKg: 100 };
    expect(programSetMarkers(changed, 'kg', KG_BAR)).toMatchObject({ adjusted: true, plates: '25 + 15 per side' });
  });

  it('does not mark a pound user adjusted for retyping the shown 203.9 lb of a 92.5 kg snapshot', () => {
    const retyped = { ...prescribed(92.5, 1), weightKg: unitToKg(203.9, 'lb') };
    expect(programSetMarkers(retyped, 'lb', LB_BAR).adjusted).toBe(false);
  });

  it('marks a pound user adjusted for a different shown weight: 205 lb against 203.9 lb', () => {
    const changed = { ...prescribed(92.5, 1), weightKg: unitToKg(205, 'lb') };
    expect(programSetMarkers(changed, 'lb', LB_BAR).adjusted).toBe(true);
  });

  it('shows 225 lb on a 45 lb bar as 45 + 45 per side', () => {
    const weightKg = unitToKg(225, 'lb');
    expect(programSetMarkers(prescribed(weightKg, 0.85), 'lb', LB_BAR).plates).toBe('45 + 45 per side');
  });

  it('shows no plates when the bar is in another unit than the shown weight', () => {
    expect(programSetMarkers(prescribed(100, 1), 'lb', KG_BAR).plates).toBeNull();
  });

  it('shows no plates when the program has no bar weight', () => {
    expect(programSetMarkers(prescribed(100, 1), 'kg', null).plates).toBeNull();
  });

  it('shows no plates for a weight the standard plates cannot load: 101 kg', () => {
    expect(programSetMarkers(prescribed(101, 1), 'kg', KG_BAR).plates).toBeNull();
  });

  it('shows "Empty bar" for a set at the bar weight', () => {
    expect(programSetMarkers(prescribed(20, 0.4), 'kg', KG_BAR).plates).toBe('Empty bar');
  });

  it('shows no percentage or optional tag for a set from a draft written before prescription details', () => {
    const older: MarkedSet = { weightKg: 92.5, prescription: snapshot('mon-squat:4', { weightKg: 92.5, reps: 5 }) };
    expect(programSetMarkers(older, 'kg', KG_BAR)).toEqual({
      pct: null,
      optional: false,
      adjusted: false,
      plates: '25 + 10 + 1.25 per side',
    });
  });

  it('shows no markers at all on a set the user added, which has no prescription', () => {
    expect(programSetMarkers({ weightKg: 100, prescription: null }, 'kg', KG_BAR)).toEqual({
      pct: null,
      optional: false,
      adjusted: false,
      plates: null,
    });
  });
});

describe('program set marker texts', () => {
  it('reads the markers in order: percentage, optional, adjusted, plates', () => {
    expect(
      programSetMarkerTexts({ pct: '95%', optional: true, adjusted: true, plates: '25 + 25 + 20 + 2.5 per side' }),
    ).toEqual(['95%', 'optional', 'adjusted', '25 + 25 + 20 + 2.5 per side']);
  });

  it('leaves out the markers a set does not have', () => {
    expect(programSetMarkerTexts({ pct: '75%', optional: false, adjusted: false, plates: null })).toEqual(['75%']);
  });

  it('has no texts for a set without markers', () => {
    expect(programSetMarkerTexts({ pct: null, optional: false, adjusted: false, plates: null })).toEqual([]);
  });
});
