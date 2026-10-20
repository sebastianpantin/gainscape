import { createContext, useContext } from 'react';
import { parsedJson } from '../json-rules.ts';
import { keyedStore } from '../platform/keyed-store.ts';
import { EFFORT_INPUT_MODES, type EffortInputMode, UNIT_PREFS, type UnitPref } from './profile-rules.ts';

export interface Preferences {
  unitPref: UnitPref;
  effortInputMode: EffortInputMode;
}

interface PreferencesValue extends Preferences {
  applyPreferences: (changes: Partial<Preferences>) => void;
}

export const DEFAULT_PREFERENCES: Preferences = { unitPref: 'kg', effortInputMode: 'level' };

export const PreferencesContext = createContext<PreferencesValue>({
  ...DEFAULT_PREFERENCES,
  applyPreferences: () => undefined,
});

export function usePreferences(): PreferencesValue {
  return useContext(PreferencesContext);
}

export function pendingLocalPreferences(
  local: Preferences | null,
  loaded: Preferences | undefined,
): Preferences | null {
  const caughtUp =
    local !== null &&
    loaded !== undefined &&
    local.unitPref === loaded.unitPref &&
    local.effortInputMode === loaded.effortInputMode;
  return caughtUp ? null : local;
}

function isPreferences(value: unknown): value is Preferences {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    UNIT_PREFS.some((unit) => unit === candidate.unitPref) &&
    EFFORT_INPUT_MODES.some((mode) => mode === candidate.effortInputMode)
  );
}

export const preferencesCache = keyedStore<Preferences | null>('gainscape.preferences.', (raw) => {
  const parsed = parsedJson(raw);
  return isPreferences(parsed) ? parsed : null;
});
