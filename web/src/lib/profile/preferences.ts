import { createContext, useContext } from 'react';
import { EFFORT_INPUT_MODES, type EffortInputMode, UNIT_PREFS, type UnitPref } from './profile-rules.ts';

export interface Preferences {
  unitPref: UnitPref;
  effortInputMode: EffortInputMode;
}

export interface PreferencesValue extends Preferences {
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

const CACHE_KEY_PREFIX = 'gainscape.preferences.';

function isPreferences(value: unknown): value is Preferences {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    UNIT_PREFS.some((unit) => unit === candidate.unitPref) &&
    EFFORT_INPUT_MODES.some((mode) => mode === candidate.effortInputMode)
  );
}

export function cachedPreferences(userId: string): Preferences | null {
  try {
    const raw = localStorage.getItem(`${CACHE_KEY_PREFIX}${userId}`);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return isPreferences(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function cachePreferences(userId: string, preferences: Preferences): void {
  try {
    localStorage.setItem(`${CACHE_KEY_PREFIX}${userId}`, JSON.stringify(preferences));
  } catch {
    return;
  }
}

export function forgetCachedPreferences(storage: Storage | null, userId: string): void {
  try {
    storage?.removeItem(`${CACHE_KEY_PREFIX}${userId}`);
  } catch {
    return;
  }
}
