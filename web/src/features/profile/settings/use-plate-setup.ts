import { useState } from 'react';
import { type UnitPref } from '../../../lib/profile.ts';
import { type BarbellSetup, isUsableBarOrPlate } from '../../../lib/plate-rules.ts';
import { readPlateSettings, savePlateSettings } from '../../../lib/plate-settings-store.ts';
import { deviceStorage } from '../../../lib/rest-timer-store.ts';

export function usePlateSetup(userId: string, unit: UnitPref) {
  const [setup, setSetup] = useState(() => readPlateSettings(deviceStorage(), userId)[unit]);
  const [barText, setBarText] = useState(() => String(setup.barWeight));
  const barNumber = Number(barText);
  const barValid = barText.trim() !== '' && isUsableBarOrPlate(barNumber);
  const change = (changes: Partial<BarbellSetup>) => {
    const latest = readPlateSettings(deviceStorage(), userId);
    const next = { ...latest[unit], ...changes };
    setSetup(next);
    savePlateSettings(deviceStorage(), userId, { ...latest, [unit]: next });
  };
  const changeBar = (text: string) => {
    setBarText(text);
    const barWeight = Number(text);
    if (text.trim() !== '' && isUsableBarOrPlate(barWeight)) change({ barWeight });
  };
  const togglePlate = (plate: number) => {
    const plates = setup.plates.includes(plate)
      ? setup.plates.filter((owned) => owned !== plate)
      : [...setup.plates, plate].sort((a, b) => b - a);
    change({ plates });
  };
  return { setup, barText, barValid, changeBar, togglePlate };
}
