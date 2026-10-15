import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
  cachedPreferences,
  cachePreferences,
  DEFAULT_PREFERENCES,
  pendingLocalPreferences,
  type Preferences,
  PreferencesContext,
} from '../lib/profile/preferences.ts';
import { preferencesQuery } from '../lib/query/queries.ts';

interface PreferencesProviderProps {
  userId: string;
  children: ReactNode;
}

export function PreferencesProvider({ userId, children }: PreferencesProviderProps) {
  const { data: loaded } = useQuery(preferencesQuery(userId));
  const [saved] = useState<Preferences>(() => cachedPreferences(userId) ?? DEFAULT_PREFERENCES);
  const [local, setLocal] = useState<Preferences | null>(null);
  const pending = pendingLocalPreferences(local, loaded);
  if (pending !== local) setLocal(pending);
  const preferences = pending ?? loaded ?? saved;

  useEffect(() => {
    if (loaded && !pending) cachePreferences(userId, loaded);
  }, [userId, loaded, pending]);

  const applyPreferences = useCallback(
    (changes: Partial<Preferences>) => {
      setLocal((current) => {
        const next = { ...(current ?? loaded ?? saved), ...changes };
        cachePreferences(userId, next);
        return next;
      });
    },
    [userId, loaded, saved],
  );

  const value = useMemo(() => ({ ...preferences, applyPreferences }), [preferences, applyPreferences]);
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}
