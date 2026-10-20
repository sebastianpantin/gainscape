import { describe, expect, it } from 'vitest';
import {
  bonusRows,
  equippedGearLabel,
  type EquippedGear,
  formatGearBonusPercent,
  loadoutBySlot,
} from '../../web/src/lib/collection/gear-rules.ts';

const SKILLS = [
  { key: 'chest', name: 'Chest' },
  { key: 'back', name: 'Back' },
  { key: 'shoulders', name: 'Shoulders' },
  { key: 'arms', name: 'Arms' },
  { key: 'legs', name: 'Legs' },
  { key: 'core', name: 'Core' },
  { key: 'endurance', name: 'Endurance' },
  { key: 'agility', name: 'Agility' },
];

const rookieBelt: EquippedGear = {
  slot: 'belt',
  itemId: 'item-rookie-belt',
  itemKey: 'rookie_belt',
  name: 'Rookie belt',
  tier: 'rookie',
};

const fullAscendant: EquippedGear[] = (['belt', 'chalk', 'straps', 'sleeves', 'shoes', 'gloves'] as const).map(
  (slot) => ({
    slot,
    itemId: `ascendant-${slot}`,
    itemKey: `ascendant_${slot}`,
    name: `Ascendant ${slot}`,
    tier: 'ascendant',
  }),
);

describe('formatGearBonusPercent', () => {
  it('shows one decimal with a plus sign and drops a trailing .0', () => {
    expect(formatGearBonusPercent(0.1)).toBe('+10%');
    expect(formatGearBonusPercent(1 / 30)).toBe('+3.3%');
    expect(formatGearBonusPercent(1 / 70)).toBe('+1.4%');
    expect(formatGearBonusPercent(1 / 210)).toBe('+0.5%');
  });
});

describe('loadoutBySlot', () => {
  it('lists every slot in order with its label, empty when nothing is equipped', () => {
    expect(loadoutBySlot([])).toEqual([
      { slot: 'belt', label: 'Belt', gear: null },
      { slot: 'chalk', label: 'Chalk', gear: null },
      { slot: 'straps', label: 'Straps', gear: null },
      { slot: 'sleeves', label: 'Sleeves', gear: null },
      { slot: 'shoes', label: 'Shoes', gear: null },
      { slot: 'gloves', label: 'Gloves', gear: null },
    ]);
  });

  it('puts the equipped item in its slot', () => {
    const rows = loadoutBySlot([rookieBelt]);
    expect(rows[0]).toEqual({ slot: 'belt', label: 'Belt', gear: rookieBelt });
    expect(rows.slice(1).every((row) => row.gear === null)).toBe(true);
  });
});

describe('bonusRows', () => {
  it('shows the bonus of each boosted skill in skill order', () => {
    expect(bonusRows([rookieBelt], SKILLS)).toEqual([
      { skillKey: 'back', skillName: 'Back', percent: '+0.5%' },
      { skillKey: 'legs', skillName: 'Legs', percent: '+0.5%' },
      { skillKey: 'core', skillName: 'Core', percent: '+1.4%' },
    ]);
  });

  it('gives every skill the full bonus with a full Ascendant loadout', () => {
    expect(bonusRows(fullAscendant, SKILLS)).toEqual(
      SKILLS.map((skill) => ({ skillKey: skill.key, skillName: skill.name, percent: '+10%' })),
    );
  });

  it('is empty with nothing equipped', () => {
    expect(bonusRows([], SKILLS)).toEqual([]);
  });

  it('leaves out a boosted skill the catalog does not list', () => {
    expect(
      bonusRows(
        [rookieBelt],
        SKILLS.filter((skill) => skill.key !== 'legs'),
      ).map((row) => row.skillKey),
    ).toEqual(['back', 'core']);
  });
});

describe('equippedGearLabel', () => {
  it('names the equipped gear and where the link leads', () => {
    const chalk: EquippedGear = {
      ...rookieBelt,
      slot: 'chalk',
      itemKey: 'grinder_chalk',
      name: 'Grinder chalk',
      tier: 'grinder',
    };
    expect(equippedGearLabel([rookieBelt, chalk])).toBe('Loadout: Rookie belt and Grinder chalk. Open Items');
  });
});
