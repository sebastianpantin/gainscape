import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  cachedPreferences,
  cachePreferences,
  DEFAULT_PREFERENCES,
  type Preferences,
  PreferencesContext,
} from '../lib/profile/preferences.ts';
import { fetchProfile } from '../lib/profile/profile.ts';

interface PreferencesProviderProps {
  userId: string;
  children: ReactNode;
}

export function PreferencesProvider({ userId, children }: PreferencesProviderProps) {
  const [preferences, setPreferences] = useState<Preferences>(() => cachedPreferences(userId) ?? DEFAULT_PREFERENCES);
  const localChanges = useRef(0);

  useEffect(() => {
    let active = true;
    const changesAtStart = localChanges.current;
    fetchProfile(userId).then(
      (profile) => {
        if (!active || localChanges.current !== changesAtStart) return;
        const loaded = { unitPref: profile.unitPref, effortInputMode: profile.effortInputMode };
        cachePreferences(userId, loaded);
        setPreferences(loaded);
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [userId]);

  const applyPreferences = useCallback(
    (changes: Partial<Preferences>) => {
      localChanges.current += 1;
      setPreferences((current) => {
        const next = { ...current, ...changes };
        cachePreferences(userId, next);
        return next;
      });
    },
    [userId],
  );

  const value = useMemo(() => ({ ...preferences, applyPreferences }), [preferences, applyPreferences]);
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}
