import { useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { wrote } from '../../../lib/query/writes.ts';
import { changeTimezone, cooldownStartFor, formatDay, type Profile } from '../../../lib/profile/profile.ts';
import { type SectionProps } from './section-props.ts';

export function useTimezoneChange(userId: string, profile: Profile, replaceProfile: SectionProps['replaceProfile']) {
  const queryClient = useQueryClient();
  const [candidate, setCandidate] = useState(profile.timezone);
  const [message, setMessage] = useState<{ kind: 'problem' | 'status'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const change = async (event: FormEvent) => {
    event.preventDefault();
    if (candidate === profile.timezone) return;
    setBusy(true);
    setMessage(null);
    const result = await changeTimezone(candidate);
    setBusy(false);
    if (result.ok) {
      const timezoneChangedAt = new Date().toISOString();
      void wrote(queryClient, {
        change: 'timezone-changed',
        profile: { userId, update: (current) => ({ ...current, timezone: candidate, timezoneChangedAt }) },
      });
      setMessage({ kind: 'status', text: `Time zone changed to ${candidate}.` });
    } else if (result.reason === 'too_soon') {
      replaceProfile((current) => ({ ...current, timezoneChangedAt: cooldownStartFor(result.nextAllowedAt) }));
      setMessage({ kind: 'problem', text: `You can change it again on ${formatDay(new Date(result.nextAllowedAt))}.` });
    } else {
      setMessage({ kind: 'problem', text: result.message });
    }
  };

  return { candidate, setCandidate, message, busy, change };
}
