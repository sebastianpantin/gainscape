import { useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { announceDataChange } from '../../../lib/data-changes.ts';
import { changeTimezone, cooldownStartFor, formatDay, type Profile } from '../../../lib/profile.ts';
import { type SectionProps } from './section-props.ts';

export function useTimezoneChange(profile: Profile, onSaved: SectionProps['onSaved']) {
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
      onSaved((current) => ({ ...current, timezone: candidate, timezoneChangedAt: new Date().toISOString() }));
      void announceDataChange(queryClient, 'timezone-changed');
      setMessage({ kind: 'status', text: `Time zone changed to ${candidate}.` });
    } else if (result.reason === 'too_soon') {
      onSaved((current) => ({ ...current, timezoneChangedAt: cooldownStartFor(result.nextAllowedAt) }));
      setMessage({ kind: 'problem', text: `You can change it again on ${formatDay(new Date(result.nextAllowedAt))}.` });
    } else {
      setMessage({ kind: 'problem', text: result.message });
    }
  };

  return { candidate, setCandidate, message, busy, change };
}
