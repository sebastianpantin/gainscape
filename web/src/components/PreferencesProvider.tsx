import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
  cachedPreferences,
  cachePreferences,
  DEFAULT_PREFERENCES,
  type Preferences,
  PreferencesContext,
} from '../lib/profile/preferences.ts';
import { preferencesQuery } from '../lib/query/queries.ts';

interface PreferencesProviderProps {
  userId: string;
  children: ReactNode;
}

interface LocalPreferences {
  loadedWhenApplied: Preferences | undefined;
  preferences: Preferences;
}

export function PreferencesProvider({ userId, children }: PreferencesProviderProps) {
  const { data: loaded } = useQuery(preferencesQuery(userId));
  const [saved] = useState<Preferences>(() => cachedPreferences(userId) ?? DEFAULT_PREFERENCES);
  const [local, setLocal] = useState<LocalPreferences | null>(null);
  const preferences = local && local.loadedWhenApplied === loaded ? local.preferences : (loaded ?? saved);

  useEffect(() => {
    if (loaded) cachePreferences(userId, loaded);
  }, [userId, loaded]);

  const applyPreferences = useCallback(
    (changes: Partial<Preferences>) => {
      setLocal((current) => {
        const base = current && current.loadedWhenApplied === loaded ? current.preferences : (loaded ?? saved);
        const next = { ...base, ...changes };
        cachePreferences(userId, next);
        return { loadedWhenApplied: loaded, preferences: next };
      });
    },
    [userId, loaded, saved],
  );

  const value = useMemo(() => ({ ...preferences, applyPreferences }), [preferences, applyPreferences]);
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}
