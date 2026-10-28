import { formatDay, nextTimezoneChangeAt, TIMEZONE_CHANGE_COOLDOWN_DAYS } from '../../../lib/profile/profile.ts';
import { type SectionProps } from './section-props.ts';
import { useTimezoneChange } from './use-timezone-change.ts';

function deviceTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function allTimezones(): string[] {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return [deviceTimezone()];
  }
}

export function TimezoneSection({ profile, replaceProfile }: Omit<SectionProps, 'userId'>) {
  const { candidate, setCandidate, message, busy, change } = useTimezoneChange(profile, replaceProfile);
  const nextAllowed = nextTimezoneChangeAt(profile);
  const zones = allTimezones();
  const device = deviceTimezone();

  return (
    <section className="panel stack" aria-labelledby="time-heading">
      <h2 id="time-heading">Time zone</h2>
      <dl className="stack" style={{ gap: 'var(--space-0-5)' }}>
        <dt className="muted tiny">Current</dt>
        <dd>{profile.timezone}</dd>
      </dl>
      <form className="timezone-row" onSubmit={change}>
        <label className="field">
          Change to
          <select
            value={candidate}
            disabled={nextAllowed !== null}
            onChange={(event) => setCandidate(event.target.value)}
          >
            {!zones.includes(profile.timezone) && <option value={profile.timezone}>{profile.timezone}</option>}
            {zones.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
        </label>
        <button
          className="button outline"
          type="submit"
          disabled={busy || nextAllowed !== null || candidate === profile.timezone}
        >
          Change
        </button>
      </form>
      {device !== profile.timezone && nextAllowed === null && (
        <button className="button link" type="button" onClick={() => setCandidate(device)}>
          Use this device's time zone ({device})
        </button>
      )}
      {message && (
        <p
          className={message.kind === 'problem' ? 'problem' : 'muted'}
          role={message.kind === 'problem' ? 'alert' : 'status'}
        >
          {message.text}
        </p>
      )}
      <span className="hint">
        {nextAllowed
          ? `Decides which day a workout counts for. Your next change is possible on ${formatDay(nextAllowed)}.`
          : `Decides which day a workout counts for. You can change it once every ${TIMEZONE_CHANGE_COOLDOWN_DAYS} days.`}
      </span>
    </section>
  );
}
